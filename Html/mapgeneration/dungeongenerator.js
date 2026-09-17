// Chaos universal dungeon geometry engine (v5.7)
// Pure geometry: no Phaser entities, loot, monsters, or autotiling.

// Pure dungeon geometry engine. Generates rooms, corridors, gates, loops, special rooms and alcoves from a resolved ZoneLayout.
class DungeonGenerator {

	constructor(cfg = {}) {
		this.width = cfg.width || 40;
		this.height = cfg.height || 32;
		this.seed = cfg.seed || 1;
		this.specialCount = Math.max(0, Math.min(8, cfg.specialCount ?? 2));
		this.allowUnzonedAlcoves = !!cfg.allowUnzonedAlcoves;
		this.loopRatio = cfg.loopRatio ?? .15; // Probability of selecting each eligible optional loop candidate.
		this.zoneAttempts = Math.max(1, cfg.zoneAttempts || 40); // Stochastic retries per zone before deterministic fallback.
		this.minRoomSize = cfg.minRoomSize || 4;
		this.maxRoomSize = cfg.maxRoomSize || 14;
		this.roomAreaTarget = cfg.roomAreaTarget || 68; // Approximate zone area allocated per desired room.
		this.maxRoomsPerZone = cfg.maxRoomsPerZone || 12;
		this.specialMinRoomSize = cfg.specialMinRoomSize || 4;
		this.specialMaxRoomSize = cfg.specialMaxRoomSize || 7;
		this.alcoveRoomCount = Math.max(0, cfg.alcoveRoomCount ?? 2);
		this.alcoveRoomMin = Math.max(1, cfg.alcoveRoomMin ?? 2);
		this.alcoveRoomMax = Math.max(this.alcoveRoomMin, cfg.alcoveRoomMax ?? 3);
		this.alcoveRoomTunnel = Math.max(0, cfg.alcoveRoomTunnel ?? 4);
		this.alcoveNicheCount = Math.max(0, cfg.alcoveNicheCount ?? 3);
		this.alcoveNicheMin = Math.max(1, cfg.alcoveNicheMin ?? 1);
		this.alcoveNicheMax = Math.max(this.alcoveNicheMin, cfg.alcoveNicheMax ?? 2);
		this.alcoveNicheTunnel = Math.max(0, cfg.alcoveNicheTunnel ?? 1);
		this._resetRandomStreams(this.seed);
		this._resetGenerationState();
	}

	// ----- Generation state and deterministic RNG -----

	_createStats() {
		return {
			zoneRetries: 0,
			l: 0,
			astar: 0,
			routeFailed: 0,
			loopsAdded: 0,
			loopsRequested: 0,
			loopCandidates: 0,
			extraGates: 0,
			extraGateCandidates: 0,
			alcoveRoomCandidates: 0,
			alcoveRoomsAdded: 0,
			alcoveNicheCandidates: 0,
			alcoveNichesAdded: 0,
			alcoveCrossZone: 0,
			alcoveSpecialArea: 0,
			fallbacks: 0,
			fallbackDetails: [],
			layoutRetries: 0,
			mapFallback: null
		};
	}

	// Resets deterministic RNG streams for base geometry, loops and alcove post-processing.
	_resetRandomStreams(seed) {
		this.rng = new RNG(seed);
		this.loopRng = new RNG((seed ^ LOOP_RNG_SALT) >>> 0);
		this.alcoveRng = new RNG((seed ^ ALCOVE_RNG_SALT) >>> 0);
		this._useLoopRng = false;
	}

	// Clears all mutable generation state before a new map attempt.
	_resetGenerationState() {
		this.rooms = [];
		this.alcoves = [];
		this._alcoveCarved = new Set(); // Cells added by alcove/niche post-processing.
		this.zones = [];
		this.edges = [];
		this.gates = [];
		this._zoneById = new Map();
		this._zoneAtGrid = null; // Cached cell-to-zone lookup; rebuilt lazily when needed.
		this._globalRoomAt = null; // Cached cell-to-room lookup used by global alcove search.
		this._alcoveFloor = null;
		this.stats = this._createStats();
		this._roomSeq = 0;
	}

	random() { return (this._useLoopRng ? this.loopRng : this.rng).next(); }

	_rand(a, b) { return (this._useLoopRng ? this.loopRng : this.rng).int(a, b); }

	_shuffle(a) { return (this._useLoopRng ? this.loopRng : this.rng).shuffle(a); }

	_key(x, y) { return y * this.width + x; }

	_xy(k) { return [k % this.width, Math.floor(k / this.width)]; }

	_insideRect(r, x, y) { return x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h; }

	_isBoundary(r, x, y) { return x === r.x || y === r.y || x === r.x + r.w - 1 || y === r.y + r.h - 1; }

	_isOuterBoundary(x, y) { return x === 1 || y === 1 || x === this.width - 2 || y === this.height - 2; }

	_center(r) { return { x: r.x + Math.floor(r.w / 2), y: r.y + Math.floor(r.h / 2) }; }

	// Creates the initial all-rock semantic map and companion wall mask.
	_createEmptyMap() {
		const kind = [], walls = [];
		for (let y = 0; y < this.height; y++) {
			kind[y] = [];
			walls[y] = [];
			for (let x = 0; x < this.width; x++) {
				kind[y][x] = '#';
				walls[y][x] = 1;
			}
		}
		return { kind, walls };
	}

	// ----- Resolved layout and mandatory gates -----

	// Copies a resolved ZoneLayout into this generation attempt and assigns mandatory gates. Returns the mutable layout copy.
	_applyLayout(layout) {
		if (!(layout instanceof ZoneLayout)) layout = new ZoneLayout(layout);
		if (layout.width !== this.width || layout.height !== this.height) throw new Error('ZoneLayout size does not match DungeonGenerator size');
		const resolved = layout.cloneForGeneration();
		this.zones = resolved.zones;
		this.edges = resolved.edges;
		this._zoneById = new Map(this.zones.map(z => [z.id, z]));
		this._zoneAtGrid = null; // Cached cell-to-zone lookup; rebuilt lazily when needed.
		this._assignGates();
		return resolved;
	}

	_zone(id) { return this._zoneById.get(id) || this.zones.find(z => z.id === id); }

	_sharedBoundary(a, b) { return RectGeometry.sharedBoundary(a, b); }

	_safeGateRange(a, b, s) { return RectGeometry.safeGateRange(a, b, s); }

	// Creates one physical gate record on a shared boundary and attaches it to both zones and the graph edge.
	_addGateRecord(edge, a, b, s, p, optional = false) {
		let ac, bc;
		if (s.orientation === 'vertical') {
			if (s.aSide === 'E') {
				ac = { x: a.rect.x + a.rect.w - 1, y: p };
				bc = { x: b.rect.x, y: p };
			}
			else {
				ac = { x: a.rect.x, y: p };
				bc = { x: b.rect.x + b.rect.w - 1, y: p };
			}
		}
		else {
			if (s.aSide === 'S') {
				ac = { x: p, y: a.rect.y + a.rect.h - 1 };
				bc = { x: p, y: b.rect.y };
			}
			else {
				ac = { x: p, y: a.rect.y };
				bc = { x: p, y: b.rect.y + b.rect.h - 1 };
			}
		}
		const g = { id: 'g' + this.gates.length, edgeId: edge.id, a: a.id, b: b.id, aCell: ac, bCell: bc, aSide: s.aSide, bSide: s.bSide, optional };
		this.gates.push(g);
		edge.gates.push(g);
		if (!edge.gate) edge.gate = g;
		a.gates.push({ gate: g, cell: ac, side: s.aSide, other: b.id, optional });
		b.gates.push({ gate: g, cell: bc, side: s.bSide, other: a.id, optional });
		return g;
	}

	// Places one mandatory safe gate for every required ZoneGraph edge.
	_assignGates() {
		this.gates = [];
		for (const z of this.zones) z.gates = [];
		for (const edge of this.edges) {
			edge.gates = [];
			edge.gate = null;
			const a = this._zone(edge.a), b = this._zone(edge.b), s = this._sharedBoundary(a, b), range = s && this._safeGateRange(a, b, s);
			if (!s || !range) throw new Error('ZoneGraph edge has no safe gate: ' + edge.a + ' <-> ' + edge.b);
			const first = this._rand(range.lo, range.hi);
			this._addGateRecord(edge, a, b, s, first, false);
		}
	}

	_inset(r, n) { return { x: r.x + n, y: r.y + n, w: r.w - 2 * n, h: r.h - 2 * n }; }

	// ----- BSP room generation -----

	// Recursively BSP-splits a rectangle until the requested number of leaves is reached or no valid split remains.
	_splitLeaves(work, target, minSize = this.minRoomSize) {
		const leaves = [{ ...work }];
		while (leaves.length < target) {
			const candidates = [];
			for (let i = 0; i < leaves.length; i++) {
				const r = leaves[i], canV = r.w >= minSize * 2 + 1, canH = r.h >= minSize * 2 + 1;
				if (canV || canH)
					candidates.push({ i, r, canV, canH, score: r.w * r.h });
			}
			if (!candidates.length) break;
			candidates.sort((a, b) => b.score - a.score);
			const c = candidates[this._rand(0, Math.min(candidates.length - 1, 2))], r = c.r;
			let vertical;
			if (c.canV && c.canH) {
				if (r.w / r.h > 1.35) vertical = true;
				else if (r.h / r.w > 1.35)
				vertical = false;
				else
					vertical = this.random() < .5;
			}
			else
				vertical = c.canV;
			const ratio = .4 + this.random() * .2;
			let one, two;
			if (vertical) {
				const minCut = r.x + minSize, maxCut = r.x + r.w - minSize - 1, ideal = Math.floor(r.x + r.w * ratio), cut = Math.max(minCut, Math.min(maxCut, ideal));
				one = { x: r.x, y: r.y, w: cut - r.x, h: r.h };
				two = { x: cut + 1, y: r.y, w: r.x + r.w - cut - 1, h: r.h };
			}
			else {
				const minCut = r.y + minSize, maxCut = r.y + r.h - minSize - 1, ideal = Math.floor(r.y + r.h * ratio), cut = Math.max(minCut, Math.min(maxCut, ideal));
				one = { x: r.x, y: r.y, w: r.w, h: cut - r.y };
				two = { x: r.x, y: cut + 1, w: r.w, h: r.y + r.h - cut - 1 };
			}
			leaves.splice(c.i, 1, one, two);
		}
		return leaves;
	}

	// Computes the desired room count for a zone from area, shape and roomAreaTarget.
	_roomTarget(zone) {
		let target = Math.min(this.maxRoomsPerZone, Math.max(1, Math.round(zone.rect.w * zone.rect.h / this.roomAreaTarget)));
		if (zone.type === 'normal') {
			const work = this._inset(zone.rect, 1);
			if (work.w >= 3 && work.h >= 3) {
				const long = Math.max(work.w, work.h), short = Math.min(work.w, work.h), canSplit = work.w >= this.minRoomSize * 2 + 1 || work.h >= this.minRoomSize * 2 + 1;
				if (canSplit && long / Math.max(1, short) >= 1.65) target = Math.max(target, 2);
			}
		}
		return target;
	}

	_rectNear(a, b, pad = 0) { return a.x - pad < b.x + b.w && a.x + a.w + pad > b.x && a.y - pad < b.y + b.h && a.y + a.h + pad > b.y; }

	// Generates BSP rooms inside a zone while respecting reserved rectangles. Returns room descriptors.
	_generateBspRooms(zone, targetOverride = null, reserved = []) {
		const singleWork = this._inset(zone.rect, 1);
		if (singleWork.w < 3 || singleWork.h < 3) return [];
		const target = targetOverride ?? this._roomTarget(zone);
		if (target === 1)
			return [{ id: 'r' + (this._roomSeq++), zoneId: zone.id, roomType: 'normal', x: singleWork.x, y: singleWork.y, w: singleWork.w, h: singleWork.h, doorOutside: new Set() }];
		const work = { ...zone.rect }, minSize = Math.max(3, Math.min(this.minRoomSize, work.w, work.h)), leaves = this._splitLeaves(work, target, minSize), rooms = [];
		for (const leaf of leaves) {
			const ml = leaf.x === zone.rect.x ? 1 : 0, mr = leaf.x + leaf.w === zone.rect.x + zone.rect.w ? 1 : 0,
				mt = leaf.y === zone.rect.y ? 1 : 0, mb = leaf.y + leaf.h === zone.rect.y + zone.rect.h ? 1 : 0,
				usable = { x: leaf.x + ml, y: leaf.y + mt, w: leaf.w - ml - mr, h: leaf.h - mt - mb };
			if (usable.w < 3 || usable.h < 3) continue;
			const maxW = Math.min(this.maxRoomSize, usable.w), maxH = Math.min(this.maxRoomSize, usable.h), leafMin = Math.max(3, Math.min(this.minRoomSize, maxW, maxH));
			let placed = null;
			for (let attempt = 0; attempt < 12 && !placed; attempt++) {
				const w = this._rand(leafMin, maxW), h = this._rand(leafMin, maxH), x = this._rand(usable.x, usable.x + usable.w - w),
					y = this._rand(usable.y, usable.y + usable.h - h), candidate = { x, y, w, h };
				if (reserved.some(rr => this._rectNear(candidate, rr, 1))) continue;
				placed = { id: 'r' + (this._roomSeq++), zoneId: zone.id, roomType: 'normal', x, y, w, h, doorOutside: new Set() };
			}
			if (placed) rooms.push(placed);
		}
		return rooms;
	}

	// Builds an O(1) cell-to-room lookup grid for the supplied room set.
	_buildRoomAt(rooms) {
		const roomAt = Array.from({ length: this.height }, () => Array(this.width).fill(null));
		for (const r of rooms) for (let y = r.y; y < r.y + r.h; y++)
				for (let x = r.x; x < r.x + r.w; x++) roomAt[y][x] = r;
		return roomAt;
	}

	_gateKeys(zone) { return new Set((zone.gates || []).map(g => this._key(g.cell.x, g.cell.y))); }

	// ----- Corridor routing -----

	// Enumerates legal room boundary exits and their outside corridor cells for routing.
	_roomPorts(room, zone, roomAt, gateKeys) {
		const p = [], add = (ix, iy, ox, oy, side) => {
			if (!this._insideRect(zone.rect, ox, oy) || roomAt[oy][ox]) return;
			if (this._isBoundary(zone.rect, ox, oy) && !gateKeys.has(this._key(ox, oy)) && !zone.allowBoundaryRouting) return;
			p.push({ ix, iy, ox, oy, side });
		};
		for (let x = room.x; x < room.x + room.w; x++) {
			add(x, room.y, x, room.y - 1, 'N');
			add(x, room.y + room.h - 1, x, room.y + room.h, 'S');
		}
		for (let y = room.y; y < room.y + room.h; y++) {
			add(room.x, y, room.x - 1, y, 'W');
			add(room.x + room.w - 1, y, room.x + room.w, y, 'E');
		}
		return p;
	}

	// Checks whether a corridor cell can be used without crossing rooms or illegal zone boundaries.
	_cellAllowed(zone, x, y, roomAt, roomA, roomB, portA, portB, gateKeys) {
		if (!this._insideRect(zone.rect, x, y) || roomAt[y][x]) return false;
		const k = this._key(x, y);
		if (this._isBoundary(zone.rect, x, y) && !gateKeys.has(k) && !(zone.allowBoundaryRouting && this._isOuterBoundary(x, y))) return false;
		for (let dy = -1; dy <= 1; dy++)
			for (let dx = -1; dx <= 1; dx++) {
			if (!dx && !dy) continue;
			const nx = x + dx, ny = y + dy;
			if (nx < 0 || ny < 0 || nx >= this.width || ny >= this.height) continue;
			const r = roomAt[ny][nx];
			if (!r) continue;
			const isPA = portA && x === portA.ox && y === portA.oy && r === roomA;
			const isPB = portB && x === portB.ox && y === portB.oy && r === roomB;
			if (isPA || isPB) continue;
			return false;
		}
		return true;
	}

	// Builds a simple orthogonal L-shaped route between two cells. Returns the ordered path cells.
	_buildLPath(x1, y1, x2, y2, hFirst) {
		const p = [];
		if (hFirst) {
			const sx = x1 <= x2 ? 1 : -1;
			for (let x = x1;; x += sx) {
				p.push([x, y1]);
				if (x === x2) break;
			}
			if (y1 !== y2) {
				const sy = y1 < y2 ? 1 : -1;
				for (let y = y1 + sy;; y += sy) {
					p.push([x2, y]);
					if (y === y2) break;
				}
			}
		}
		else {
			const sy = y1 <= y2 ? 1 : -1;
			for (let y = y1;; y += sy) {
				p.push([x1, y]);
				if (y === y2) break;
			}
			if (x1 !== x2) {
				const sx = x1 < x2 ? 1 : -1;
				for (let x = x1 + sx;; x += sx) {
					p.push([x, y2]);
					if (x === x2) break;
				}
			}
		}
		return p;
	}

	// Checks that every cell of a candidate corridor path satisfies routing and room-clearance constraints.
	_validatePath(path, zone, roomAt, roomA, roomB, portA, portB, gateKeys) {
		for (const [x, y] of path) if (!this._cellAllowed(zone, x, y, roomAt, roomA, roomB, portA, portB, gateKeys))
				return false;
		return true;
	}

	// Computes the routing penalty for carving next to existing corridor floor.
	_corridorAdjPenalty(x, y, floor) {
		let side = 0, diag = 0;
		for (const [dx, dy] of DIR4) if (floor.has(this._key(x + dx, y + dy)))
				side++;
		for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) if (floor.has(this._key(x + dx, y + dy)))
				diag++;
		return side * 4 + diag * .5;
	}

	// Rejects candidate loop paths that would create excessive parallel corridors or large 2x2 floor blocks.
	_loopCrowdingOK(path, floor) {
		const add = new Set(path.map(([x, y]) => this._key(x, y)).filter(k => !floor.has(k)));
		if (!add.size) return false;
		let run = 0, maxRun = 0;
		const blockOrigins = new Set();
		for (let i = 0; i < path.length; i++) {
			const [x, y] = path[i], k = this._key(x, y);
			if (!add.has(k)) {
				run = 0;
				continue;
			}
			let touches = 0;
			for (const [dx, dy] of DIR4) if (floor.has(this._key(x + dx, y + dy)))
					touches++;
			if (touches) {
				run++;
				maxRun = Math.max(maxRun, run);
			}
			else
				run = 0;
			for (const ox of [-1, 0])
				for (const oy of [-1, 0]) {
				let full = true, newCount = 0;
				for (let dy = 0; dy < 2; dy++)
					for (let dx = 0; dx < 2; dx++) {
					const kk = this._key(x + ox + dx, y + oy + dy);
					if (!(floor.has(kk) || add.has(kk))) full = false;
					if (add.has(kk)) newCount++;
				}
				if (full && newCount) blockOrigins.add((x + ox) + ',' + (y + oy));
			}
		}
		return maxRun <= 2 && blockOrigins.size <= 2;
	}

	// Runs constrained A* inside one zone. Returns a cell path from source to target, or null.
	_astar(zone, sx, sy, tx, ty, roomAt, roomA, roomB, portA, portB, gateKeys, floor, reuseCost = .55, preferNew = false) {
		const key = (x, y) => this._key(x, y), total = this.width * this.height, g = new Float64Array(total), prev = new Int32Array(total),
			closed = new Uint8Array(total), heap = new MinHeap();
		g.fill(Infinity);
		prev.fill(-1);
		const start = key(sx, sy), target = key(tx, ty);
		if (start !== target && !this._cellAllowed(zone, sx, sy, roomAt, roomA, roomB, portA, portB, gateKeys)) return null;
		g[start] = 0;
		heap.push({ x: sx, y: sy, f: Math.abs(sx - tx) + Math.abs(sy - ty) });
		while (heap.length) {
			const cur = heap.pop(), ci = key(cur.x, cur.y);
			if (closed[ci]) continue;
			closed[ci] = 1;
			if (ci === target) {
				const path = [];
				for (let k = ci; k !== -1; k = prev[k]) {
					path.push(this._xy(k));
					if (k === start) break;
				}
				path.reverse();
				return path;
			}
			for (const [dx, dy] of DIR4) {
				const nx = cur.x + dx, ny = cur.y + dy, ni = key(nx, ny);
				if (closed[ni] || !this._cellAllowed(zone, nx, ny, roomAt, roomA, roomB, portA, portB, gateKeys)) continue;
				let step = floor.has(ni) ? reuseCost : 1;
				if (preferNew && !floor.has(ni)) step += this._corridorAdjPenalty(nx, ny, floor);
				const ng = g[ci] + step;
				if (ng >= g[ni]) continue;
				g[ni] = ng;
				prev[ni] = ci;
				heap.push({ x: nx, y: ny, f: ng + Math.abs(nx - tx) + Math.abs(ny - ty) });
			}
		}
		return null;
	}

	// Tries simple L-shaped routes first and falls back to A*. Returns an acceptable route or null.
	_tryPath(zone, sx, sy, tx, ty, roomAt, roomA, roomB, portA, portB, gateKeys, floor, opts = {}) {
		const minNew = opts.minNewCells || 0, reuseCost = opts.preferNew ? 3 : .55, acceptable = p => {
			if (!p) return false;
			let n = 0;
			for (const [x, y] of p) if (!floor.has(this._key(x, y)))
					n++;
			if (n < minNew) return false;
			if (opts.preferNew && !this._loopCrowdingOK(p, floor)) return false;
			return true;
		};
		for (const hFirst of [this.random() < .5, true, false]) {
			const p = this._buildLPath(sx, sy, tx, ty, hFirst);
			if (this._validatePath(p, zone, roomAt, roomA, roomB, portA, portB, gateKeys) && acceptable(p)) {
				this.stats.l++;
				return p;
			}
		}
		const p = this._astar(zone, sx, sy, tx, ty, roomAt, roomA, roomB, portA, portB, gateKeys, floor, reuseCost, !!opts.preferNew);
		if (acceptable(p)) {
			this.stats.astar++;
			return p;
		}
		this.stats.routeFailed++;
		return null;
	}

	// Carves a validated corridor path into the zone floor set and records the route cells.
	_carveRoute(path, floor) {
		for (const [x, y] of path) floor.add(this._key(x, y));
	}

	// Connects two rooms through legal doorway cells. Returns true when a corridor was carved.
	_routeRooms(zone, a, b, roomAt, gateKeys, floor, opts = {}) {
		const pa = this._roomPorts(a, zone, roomAt, gateKeys), pb = this._roomPorts(b, zone, roomAt, gateKeys), pairs = [];
		for (const x of pa) for (const y of pb)
				pairs.push({ x, y, d: Math.abs(x.ox - y.ox) + Math.abs(x.oy - y.oy) });
		pairs.sort((u, v) => u.d - v.d);
		if (opts.preferNew) {
			const head = pairs.slice(0, Math.min(48, pairs.length));
			this._shuffle(head);
			pairs.splice(0, head.length, ...head);
		}
		for (const q of pairs.slice(0, opts.preferNew ? 160 : 96)) {
			const path = this._tryPath(zone, q.x.ox, q.x.oy, q.y.ox, q.y.oy, roomAt, a, b, q.x, q.y, gateKeys, floor, opts);
			if (!path) continue;
			this._carveRoute(path, floor);
			a.doorOutside.add(this._key(q.x.ox, q.x.oy));
			b.doorOutside.add(this._key(q.y.ox, q.y.oy));
			return true;
		}
		return false;
	}

	// Connects a zone gate to a room using the closest viable room ports. Returns true on success.
	_routeGateToRoom(zone, gateCell, room, roomAt, gateKeys, floor) {
		const ports = this._roomPorts(room, zone, roomAt,
			gateKeys).sort((a, b) => (Math.abs(a.ox - gateCell.x) + Math.abs(a.oy - gateCell.y)) - (Math.abs(b.ox - gateCell.x) + Math.abs(b.oy - gateCell.y)));
		for (const p of ports) {
			const path = this._tryPath(zone, gateCell.x, gateCell.y, p.ox, p.oy, roomAt, null, room, null, p, gateKeys, floor);
			if (!path) continue;
			this._carveRoute(path, floor);
			room.doorOutside.add(this._key(p.ox, p.oy));
			return true;
		}
		return false;
	}

	_edgeKey(a, b) { return a.id < b.id ? a.id + '|' + b.id : b.id + '|' + a.id; }

	// Builds the mandatory local room connectivity graph for a zone. Returns the set of connected room edges.
	_connectRoomTree(zone, rooms, roomAt, gateKeys, floor, edgeSet = new Set()) {
		if (!rooms.length) return false;
		const comp = new Map(rooms.map((r, i) => [r, i])), find = r => {
			let x = comp.get(r);
			while (comp.get(rooms[x]) !== x) x = comp.get(rooms[x]);
			return x;
		}, merge = (a, b) => {
			const ra = find(a), rb = find(b);
			if (ra === rb) return;
			for (const r of rooms) if (find(r) === rb)
					comp.set(r, ra);
		};
		while (true) {
			const roots = new Set(rooms.map(find));
			if (roots.size <= 1) break;
			const pairs = [];
			for (let i = 0; i < rooms.length; i++) for (let j = i + 1; j < rooms.length; j++)
					if (find(rooms[i]) !== find(rooms[j])) {
				const ca = this._center(rooms[i]), cb = this._center(rooms[j]);
				pairs.push({ a: rooms[i], b: rooms[j], d: (ca.x - cb.x) ** 2 + (ca.y - cb.y) ** 2 });
			}
			pairs.sort((a, b) => a.d - b.d);
			let ok = false;
			for (const p of pairs) {
				if (this._routeRooms(zone, p.a, p.b, roomAt, gateKeys, floor)) {
					merge(p.a, p.b);
					edgeSet.add(this._edgeKey(p.a, p.b));
					ok = true;
					break;
				}
			}
			if (!ok) return false;
		}
		return true;
	}

	// ----- Optional loops and extra gates -----

	// Collects corridor cells that are suitable endpoints for optional shortcut loops.
	_corridorLoopAnchors(zone, roomAt, gateKeys, floor) {
		const a = [];
		for (const k of floor) {
			const [x, y] = this._xy(k);
			if (roomAt[y][x]) continue;
			if (this._isBoundary(zone.rect, x, y) && !gateKeys.has(k) && !zone.allowBoundaryRouting) continue;
			let near = false;
			for (let dy = -1; dy <= 1 && !near; dy++)
				for (let dx = -1; dx <= 1; dx++) {
				if (!dx && !dy) continue;
				const nx = x + dx, ny = y + dy;
				if (nx >= 0 && ny >= 0 && nx < this.width && ny < this.height && roomAt[ny][nx]) {
					near = true;
					break;
				}
			}
			if (!near)
				a.push({ x, y });
		}
		return a;
	}

	// Attempts to add a safe loop directly between existing corridor segments. Returns whether one was added.
	_addCorridorShortcut(zone, roomAt, gateKeys, floor) {
		const anchors = this._corridorLoopAnchors(zone, roomAt, gateKeys, floor);
		if (anchors.length < 2) return false;
		const pairs = [];
		for (let i = 0; i < anchors.length; i++)
			for (let j = i + 1; j < anchors.length; j++) {
			const a = anchors[i], b = anchors[j], d = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
			if (d >= 5)
				pairs.push({ a, b, d });
		}
		if (!pairs.length) return false;
		this._shuffle(pairs);
		pairs.sort((a, b) => b.d - a.d);
		for (const q of pairs.slice(0, 96)) {
			const path = this._tryPath(zone, q.a.x, q.a.y, q.b.x, q.b.y, roomAt, null, null, null, null, gateKeys, floor, { preferNew: true, minNewCells: 1 });
			if (!path) continue;
			this._carveRoute(path, floor);
			return true;
		}
		return false;
	}

	// Returns shortest existing-floor distance between two points inside a zone, or Infinity when disconnected.
	_floorDistance(zone, floor, a, b) {
		const sk = this._key(a.x, a.y), tk = this._key(b.x, b.y);
		if (sk === tk) return 0;
		if (!floor.has(sk) || !floor.has(tk)) return Infinity;
		const seen = new Map([[sk, 0]]), q = [sk];
		let qi = 0;
		while (qi < q.length) {
			const k = q[qi++], d = seen.get(k), [x, y] = this._xy(k);
			for (const [dx, dy] of DIR4) {
				const nx = x + dx, ny = y + dy;
				if (!this._insideRect(zone.rect, nx, ny)) continue;
				const nk = this._key(nx, ny);
				if (seen.has(nk) || !floor.has(nk)) continue;
				if (nk === tk) return d + 1;
				seen.set(nk, d + 1);
				q.push(nk);
			}
		}
		return Infinity;
	}

	// Builds and ranks room-pair loop candidates by the shortcut value they can provide.
	_localLoopCandidates(zone, rooms, floor) {
		const c = [];
		for (let i = 0; i < rooms.length; i++)
			for (let j = i + 1; j < rooms.length; j++) {
			const a = rooms[i], b = rooms[j], ca = this._center(a), cb = this._center(b), network = this._floorDistance(zone, floor, ca, cb),
				direct = Math.abs(ca.x - cb.x) + Math.abs(ca.y - cb.y), benefit = isFinite(network) ? Math.max(0, network - direct) : direct,
				jitter = this.random();
			c.push({ a, b, benefit, direct, jitter });
		}
		c.sort((x, y) => (y.benefit - x.benefit) || (y.direct - x.direct) || (x.jitter - y.jitter));
		return c;
	}

	// Selects room-loop candidates using loopRatio and safely carves the realizable subset.
	_addLocalLoops(zone, rooms, roomAt, gateKeys, floor) {
		if (this.loopRatio <= 0 || rooms.length < 2) return 0;
		const candidates = this._localLoopCandidates(zone, rooms, floor);
		this.stats.loopCandidates += candidates.length;
		const selected = candidates.filter(() => this.random() < this.loopRatio), target = selected.length;
		this.stats.loopsRequested += target;
		if (!target) return 0;
		let added = 0;
		for (const p of selected) {
			if (this._routeRooms(zone, p.a, p.b, roomAt, gateKeys, floor, { preferNew: true, minNewCells: 1 })) {
				added++;
				this.stats.loopsAdded++;
			}
		}
		let shortcutTries = 0;
		while (added < target && shortcutTries < Math.max(8, target * 8)) {
			shortcutTries++;
			if (!this._addCorridorShortcut(zone, roomAt, gateKeys, floor)) continue;
			added++;
			this.stats.loopsAdded++;
		}
		return added;
	}

	// Enumerates additional safe boundary gate positions for a normal-normal ZoneGraph edge.
	_optionalGateCandidates(edge) {
		const a = this._zone(edge.a), b = this._zone(edge.b);
		if (!a || !b || a.type === 'special' || b.type === 'special') return [];
		const s = this._sharedBoundary(a, b), range = s && this._safeGateRange(a, b, s);
		if (!s || !range) return [];
		const used = (edge.gates || []).map(g => s.orientation === 'vertical' ? g.aCell.y : g.aCell.x), span = range.hi - range.lo + 1,
			maxExtra = Math.min(3, Math.floor((span - 1) / 5));
		if (maxExtra <= 0) return [];
		const out = [], taken = used.slice();
		for (let n = 0; n < maxExtra; n++) {
			let best = null;
			for (let p = range.lo; p <= range.hi; p++) {
				const md = taken.length ? Math.min(...taken.map(u => Math.abs(u - p))) : span;
				if (md < 5) continue;
				const score = md + this.random() * .01;
				if (!best || score > best.score)
					best = { p, score };
			}
			if (!best) break;
			out.push(best);
			taken.push(best.p);
		}
		return out;
	}

	// Captures per-zone doorway metadata so an optional routing attempt can be rolled back safely.
	_snapshotDoors(zones) {
		const m = new Map();
		for (const z of zones) for (const r of z.rooms || [])
				m.set(r, new Set(r.doorOutside || []));
		return m;
	}

	_restoreDoors(snapshot) {
		for (const [r, s] of snapshot) r.doorOutside = new Set(s);
	}

	// Connects one newly carved optional gate cell to the existing local floor network.
	_connectNewGateSide(zone, cell, floor) {
		const rooms = zone.rooms || [], roomAt = this._buildRoomAt(rooms), gateKeys = this._gateKeys(zone);
		gateKeys.add(this._key(cell.x, cell.y));
		const anchors = this._corridorLoopAnchors(zone, roomAt, gateKeys,
			floor).filter(a => a.x !== cell.x || a.y !== cell.y).sort((a, b) => (Math.abs(a.x - cell.x) + Math.abs(a.y - cell.y)) - (Math.abs(b.x - cell.x) + Math.abs(b.y - cell.y)));
		for (const t of anchors.slice(0, 96)) {
			const path = this._tryPath(zone, cell.x, cell.y, t.x, t.y, roomAt, null, null, null, null, gateKeys, floor);
			if (!path) continue;
			this._carveRoute(path, floor);
			return true;
		}
		const sorted = rooms.slice().sort((a, b) => {
			const ca = this._center(a), cb = this._center(b); return (Math.abs(ca.x - cell.x) + Math.abs(ca.y - cell.y)) - (Math.abs(cb.x - cell.x) + Math.abs(cb.y - cell.y));
		});
		for (const r of sorted) if (this._routeGateToRoom(zone, cell, r, roomAt, gateKeys, floor))
				return true;
		return false;
	}

	// Attempts to add and internally connect an extra normal-normal zone gate. Rolls back on failure.
	_tryAddOptionalGate(edge, candidate) {
		const a = this._zone(edge.a), b = this._zone(edge.b), s = this._sharedBoundary(a, b);
		if (!a || !b || !s || a.type === 'special' || b.type === 'special') return false;
		let ac, bc, p = candidate.p;
		if (s.orientation === 'vertical') {
			if (s.aSide === 'E') {
				ac = { x: a.rect.x + a.rect.w - 1, y: p };
				bc = { x: b.rect.x, y: p };
			}
			else {
				ac = { x: a.rect.x, y: p };
				bc = { x: b.rect.x + b.rect.w - 1, y: p };
			}
		}
		else {
			if (s.aSide === 'S') {
				ac = { x: p, y: a.rect.y + a.rect.h - 1 };
				bc = { x: p, y: b.rect.y };
			}
			else {
				ac = { x: p, y: a.rect.y };
				bc = { x: p, y: b.rect.y + b.rect.h - 1 };
			}
		}
		const fa = new Set(a.floor || []), fb = new Set(b.floor || []), snapshot = this._snapshotDoors([a, b]);
		fa.add(this._key(ac.x, ac.y));
		fb.add(this._key(bc.x, bc.y));
		if (!this._connectNewGateSide(a, ac, fa) || !this._connectNewGateSide(b, bc, fb)) {
			this._restoreDoors(snapshot);
			return false;
		}
		a.floor = fa;
		b.floor = fb;
		this._addGateRecord(edge, a, b, s, p, true);
		this.stats.extraGates++;
		return true;
	}

	// Adds optional inter-zone gates after base geometry, according to loopRatio.
	_addOptionalGateLoops() {
		if (this.loopRatio <= 0) return 0;
		let added = 0;
		for (const edge of this.edges) {
			const candidates = this._optionalGateCandidates(edge);
			this.stats.extraGateCandidates += candidates.length;
			if (!candidates.length) continue;
			const selected = candidates.filter(() => this.random() < this.loopRatio);
			for (const c of selected) if (this._tryAddOptionalGate(edge, c))
					added++;
		}
		return added;
	}

	// Runs the complete post-generation loop phase: local shortcuts first, then optional zone gates.
	_applyPostGenerationLoops() {
		if (this.loopRatio <= 0) return;
		this._useLoopRng = true;
		try {
			for (const zone of this.zones) {
				const rooms = (zone.rooms || []).filter(r => !r.special);
				if (rooms.length < 2) continue;
				const roomAt = this._buildRoomAt(zone.rooms || []), gateKeys = this._gateKeys(zone);
				this._addLocalLoops(zone, rooms, roomAt, gateKeys, zone.floor);
			}
			this._addOptionalGateLoops();
		}
		finally {
			this._useLoopRng = false;
		}
	}

	// ----- Global rock-first alcove and niche generation -----

	_alcoveRand(a, b) { return this.alcoveRng.int(a, b); }

	_alcoveShuffle(a) { return this.alcoveRng.shuffle(a); }

	// Enumerates every cell inside an alcove candidate rectangle.
	_alcoveRectCells(rect) {
		const out = [];
		for (let y = rect.y; y < rect.y + rect.h; y++) for (let x = rect.x; x < rect.x + rect.w; x++)
				out.push(this._key(x, y));
		return out;
	}

	// Enumerates possible doorway cells around an alcove rectangle and their outward directions.
	_alcoveDoorways(rect) {
		const p = [];
		for (let x = rect.x; x < rect.x + rect.w; x++) {
			p.push({ ix: x, iy: rect.y, ox: x, oy: rect.y - 1, side: 'N' });
			p.push({ ix: x, iy: rect.y + rect.h - 1, ox: x, oy: rect.y + rect.h, side: 'S' });
		}
		for (let y = rect.y; y < rect.y + rect.h; y++) {
			p.push({ ix: rect.x, iy: y, ox: rect.x - 1, oy: y, side: 'W' });
			p.push({ ix: rect.x + rect.w - 1, iy: y, ox: rect.x + rect.w, oy: y, side: 'E' });
		}
		return p;
	}

	// Builds the global floor set used by the rock-first alcove search.
	_alcoveGlobalFloor() {
		const floor = new Set();
		for (const z of this.zones) for (const k of z.floor || [])
				floor.add(k);
		return floor;
	}

	// Builds/caches a cell-to-zone grid used to record which zones an alcove crosses.
	_alcoveZoneAt() {
		if (this._zoneAtGrid) return this._zoneAtGrid;
		const zoneAt = Array.from({ length: this.height }, () => Array(this.width).fill(null));
		for (const z of this.zones) for (let y = z.rect.y; y < z.rect.y + z.rect.h; y++)
				for (let x = z.rect.x; x < z.rect.x + z.rect.w; x++) zoneAt[y][x] = z;
		this._zoneAtGrid = zoneAt;
		return zoneAt;
	}

	_alcoveRectInsideMap(rect) { return rect.x > 0 && rect.y > 0 && rect.x + rect.w < this.width - 1 && rect.y + rect.h < this.height - 1; }

	// Returns true when the entire candidate chamber rectangle is still uncarved rock.
	_alcoveRectRock(rect, floor) {
		if (!this._alcoveRectInsideMap(rect)) return false;
		for (let y = rect.y; y < rect.y + rect.h; y++) for (let x = rect.x; x < rect.x + rect.w; x++)
				if (floor.has(this._key(x, y))) return false;
		return true;
	}

	_alcoveNearRect(rect, x, y) { return x >= rect.x - 1 && x <= rect.x + rect.w && y >= rect.y - 1 && y <= rect.y + rect.h; }

	// Verifies that a candidate alcove rectangle has a clean one-cell rock halo around it.
	_alcoveRectHaloClear(rect, floor) {
		for (let y = rect.y - 1; y <= rect.y + rect.h; y++)
			for (let x = rect.x - 1; x <= rect.x + rect.w; x++) {
			if (x <= 0 || y <= 0 || x >= this.width - 1 || y >= this.height - 1) return false;
			if (x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h) continue;
			if (floor.has(this._key(x, y))) return false;
		}
		return true;
	}

	_alcoveFloorNeighbors(x, y, floor) {
		const orth = [], all = [];
		for (let dy = -1; dy <= 1; dy++)
			for (let dx = -1; dx <= 1; dx++) {
			if (!dx && !dy) continue;
			const nx = x + dx, ny = y + dy;
			if (nx < 0 || ny < 0 || nx >= this.width || ny >= this.height) continue;
			const k = this._key(nx, ny);
			if (!floor.has(k)) continue;
			all.push({ x: nx, y: ny, k, orth: Math.abs(dx) + Math.abs(dy) === 1 });
			if (Math.abs(dx) + Math.abs(dy) === 1)
				orth.push({ x: nx, y: ny, k });
		}
		return { orth, all };
	}

	// Tests a zero-length/direct alcove attachment and returns a valid candidate or null.
	_alcoveDirectCandidate(rect, door, floor, roomAt) {
		const ax = door.ox, ay = door.oy;
		if (ax <= 0 || ay <= 0 || ax >= this.width - 1 || ay >= this.height - 1 || !floor.has(this._key(ax, ay))) return null;
		let contacts = [];
		for (let y = rect.y; y < rect.y + rect.h; y++) for (let x = rect.x; x < rect.x + rect.w; x++)
				for (const [dx, dy] of DIR4) {
			const nx = x + dx, ny = y + dy, k = this._key(nx, ny);
			if (floor.has(k))
				contacts.push({ x, y, nx, ny, k });
		}
		const uniq = new Map(contacts.map(c => [c.x + ',' + c.y + '>' + c.k, c]));
		contacts = [...uniq.values()];
		if (contacts.length !== 1) return null;
		const c = contacts[0];
		if (c.x !== door.ix || c.y !== door.iy || c.nx !== ax || c.ny !== ay) return null;
		const anchorRoom = roomAt[ay]?.[ax] || null;
		if (anchorRoom?.special) return null;
		for (let y = rect.y - 1; y <= rect.y + rect.h; y++)
			for (let x = rect.x - 1; x <= rect.x + rect.w; x++) {
			if (x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h) continue;
			const k = this._key(x, y);
			if (!floor.has(k) || k === c.k) continue;
			return null;
		}
		return { door, path: [], attachment: { x: ax, y: ay, k: c.k }, anchorRoom, tunnelLength: 0 };
	}

	// Searches through rock from an alcove doorway back to dungeon floor within maxTunnel. Returns a tunnel candidate or null.
	_alcoveRockRoute(rect, door, floor, roomAt, maxTunnel) {
		if (maxTunnel < 1) return null;
		const sx = door.ox, sy = door.oy;
		if (sx <= 0 || sy <= 0 || sx >= this.width - 1 || sy >= this.height - 1 || floor.has(this._key(sx, sy))) return null;
		const start = this._key(sx, sy), q = [start], depth = new Map([[start, 1]]), prev = new Map(), seen = new Set([start]);
		let qi = 0;
		while (qi < q.length) {
			const k = q[qi++], d = depth.get(k), [x, y] = this._xy(k), n = this._alcoveFloorNeighbors(x, y, floor);
			if (n.orth.length === 1) {
				const anchor = n.orth[0], anchorRoom = roomAt[anchor.y]?.[anchor.x] || null;
				if (!anchorRoom?.special) {
					let badRoom = false;
					if (anchorRoom) {
						for (const f of n.all) {
							const r = roomAt[f.y]?.[f.x];
							if (r && r !== anchorRoom) {
								badRoom = true;
								break;
							}
						}
					}
					else {
						for (const f of n.all)
							if (roomAt[f.y]?.[f.x]) {
							badRoom = true;
							break;
						}
					}
					if (!badRoom) {
						const path = [];
						let cur = k;
						while (cur !== undefined) {
							path.push(this._xy(cur));
							cur = prev.get(cur);
						}
						path.reverse();
						return { door, path, attachment: anchor, anchorRoom, tunnelLength: path.length };
					}
				}
			}
			if (d >= maxTunnel || n.all.length) continue;
			for (const [dx, dy] of DIR4) {
				const nx = x + dx, ny = y + dy, nk = this._key(nx, ny);
				if (seen.has(nk) || nx <= 0 || ny <= 0 || nx >= this.width - 1 || ny >= this.height - 1 || floor.has(nk)) continue;
				if (this._alcoveNearRect(rect, nx, ny) && nk !== start) continue;
				seen.add(nk);
				depth.set(nk, d + 1);
				prev.set(nk, k);
				q.push(nk);
			}
		}
		return null;
	}

	// Finds the best direct/tunneled connection for one candidate alcove rectangle.
	_findAlcoveConnection(rect, floor, maxTunnel, roomAt) {
		const doors = this._alcoveDoorways(rect), found = [];
		this._alcoveShuffle(doors);
		for (const d of doors) {
			const direct = this._alcoveDirectCandidate(rect, d, floor, roomAt);
			if (direct) found.push(direct);
			if (this._alcoveRectHaloClear(rect, floor)) {
				const routed = this._alcoveRockRoute(rect, d, floor, roomAt, maxTunnel);
				if (routed) found.push(routed);
			}
		}
		if (!found.length) return null;
		found.sort((a, b) => a.tunnelLength - b.tunnelLength);
		const top = found.slice(0, Math.min(found.length, 8));
		return top[this._alcoveRand(0, top.length - 1)];
	}

	// Returns the set of zone IDs touched by an alcove rectangle and its tunnel path.
	_alcoveTouchedZones(rect, path, zoneAt) {
		const ids = new Set();
		for (const k of this._alcoveRectCells(rect)) {
			const [x, y] = this._xy(k), z = zoneAt[y]?.[x];
			if (z) ids.add(z.id);
		}
		for (const [x, y] of path) {
			const z = zoneAt[y]?.[x];
			if (z) ids.add(z.id);
		}
		return [...ids];
	}

	// Enumerates and scores rock-first alcove/niche candidates over the whole map.
	_findAlcoveCandidates(kind, minSize, maxSize, maxTunnel) {
		const out = [], floor = this._alcoveFloor || this._alcoveGlobalFloor(), roomAt = this._globalRoomAt || this._buildRoomAt(this.rooms), zoneAt = this._alcoveZoneAt();
		for (let h = minSize; h <= maxSize; h++)
			for (let w = minSize; w <= maxSize; w++) {
			if (w >= this.width - 2 || h >= this.height - 2) continue;
			for (let y = 1; y + h < this.height - 1; y++)
				for (let x = 1; x + w < this.width - 1; x++) {
				const rect = { x, y, w, h };
				if (!this._alcoveRectRock(rect, floor)) continue;
				const conn = this._findAlcoveConnection(rect, floor, maxTunnel, roomAt);
				if (!conn || this._alcoveCarved.has(conn.attachment.k)) continue;
				const zonesTouched = this._alcoveTouchedZones(rect, conn.path, zoneAt);
				const attachmentZone = zoneAt[conn.attachment.y]?.[conn.attachment.x]?.id || null;
				if (!zonesTouched.length && (!this.allowUnzonedAlcoves || !attachmentZone)) continue;
				let gateDist = 99;
				for (const g of this.gates)
					gateDist = Math.min(gateDist, Math.abs(g.aCell.x - x) + Math.abs(g.aCell.y - y), Math.abs(g.bCell.x - x) + Math.abs(g.bCell.y - y));
				const crossZone = zonesTouched.length > 1;
				const touchesSpecial = zonesTouched.some(id => this._zone(id)?.type === 'special') || (this.allowUnzonedAlcoves && attachmentZone && this._zone(attachmentZone)?.type === 'special');
				const score = conn.tunnelLength * 10 + (gateDist < 3 ? 5 : 0) + (crossZone ? -2 : 0) + (touchesSpecial ? -1 : 0) + this.alcoveRng.next() * 5;
				out.push({ kind, rect, ...conn, zonesTouched, crossZone, touchesSpecial, score });
			}
		}
		out.sort((a, b) => a.score - b.score);
		return out;
	}

	// Carves one selected alcove/niche and tunnel into zone/global floor sets and records its metadata.
	_carveAlcove(c) {
		const zoneAt = this._alcoveZoneAt(), carved = new Set(), touched = new Set();
		const addCell = (x, y) => {
			const k = this._key(x, y), z = zoneAt[y]?.[x];
			if (!z && !this.allowUnzonedAlcoves) throw new Error('Alcove carve outside zone coverage at ' + x + ',' + y);
			if (z) {
				z.floor.add(k);
				touched.add(z.id);
			}
			carved.add(k);
			this._alcoveCarved.add(k);
			if (this._alcoveFloor) this._alcoveFloor.add(k);
		};
		for (let y = c.rect.y; y < c.rect.y + c.rect.h; y++) for (let x = c.rect.x; x < c.rect.x + c.rect.w; x++)
				addCell(x, y);
		for (const [x, y] of c.path) addCell(x, y);
		const doorOutsideKey = c.path.length ? this._key(c.path[c.path.length - 1][0], c.path[c.path.length - 1][1]) : this._key(c.door.ix, c.door.iy);
		if (c.anchorRoom) c.anchorRoom.doorOutside.add(doorOutsideKey);
		const attachmentZone = zoneAt[c.attachment.y]?.[c.attachment.x]?.id || null,
			a = { id: 'alc' + this.alcoves.length, type: c.kind, zoneIds: [...touched], anchorZoneId: attachmentZone, rect: { ...c.rect },
				door: { x: c.door.ix, y: c.door.iy }, doorOutside: { x: c.door.ox, y: c.door.oy }, tunnel: c.path.map(([x, y]) => ({ x, y })),
				attachment: { x: c.attachment.x, y: c.attachment.y }, tunnelLength: c.tunnelLength,
				crossZone: touched.size > 1 || (attachmentZone && !touched.has(attachmentZone)),
				touchesSpecial: [...touched].some(id => this._zone(id)?.type === 'special'), carvedKeys: carved };
		this.alcoves.push(a);
		return a;
	}

	// Iteratively places up to the requested number of one alcove kind, recomputing candidates after each carve.
	_generateAlcoveKind(kind, count, minSize, maxSize, maxTunnel) {
		let added = 0;
		for (let i = 0; i < count; i++) {
			const candidates = this._findAlcoveCandidates(kind, minSize, maxSize, maxTunnel);
			if (kind === 'room') this.stats.alcoveRoomCandidates += candidates.length;
			else
				this.stats.alcoveNicheCandidates += candidates.length;
			if (!candidates.length) break;
			const take = Math.min(candidates.length, Math.max(1, Math.ceil(candidates.length * .2))), c = candidates[this._alcoveRand(0, take - 1)];
			this._carveAlcove(c);
			added++;
		}
		return added;
	}

	// Runs post-processing in priority order: full alcove rooms first, then smaller niches.
	_generateAlcoves() {
		this.alcoves = [];
		this._alcoveCarved = new Set(); // Cells added by alcove/niche post-processing.
		this._globalRoomAt = this._buildRoomAt(this.rooms);
		this._alcoveFloor = this._alcoveGlobalFloor();
		if (this.alcoveRoomCount > 0)
			this.stats.alcoveRoomsAdded = this._generateAlcoveKind('room', this.alcoveRoomCount, this.alcoveRoomMin, this.alcoveRoomMax, this.alcoveRoomTunnel);
		if (this.alcoveNicheCount > 0)
			this.stats.alcoveNichesAdded = this._generateAlcoveKind('niche', this.alcoveNicheCount, this.alcoveNicheMin, this.alcoveNicheMax, this.alcoveNicheTunnel);
		this.stats.alcoveCrossZone = this.alcoves.filter(a => a.crossZone).length;
		this.stats.alcoveSpecialArea = this.alcoves.filter(a => a.touchesSpecial).length;
	}

	// Checks that every alcove/niche is room-safe and forms exactly one attachment to pre-existing dungeon floor.
	_validateAlcoves() {
		const allFloor = this._alcoveFloor || this._alcoveGlobalFloor(), roomAt = this._globalRoomAt || this._buildRoomAt(this.rooms);
		for (const a of this.alcoves) {
			const carved = a.carvedKeys, outside = new Set();
			for (const k of carved) {
				const [x, y] = this._xy(k);
				if (x <= 0 || y <= 0 || x >= this.width - 1 || y >= this.height - 1 || !allFloor.has(k) || roomAt[y]?.[x]) return false;
				for (const [dx, dy] of DIR4) {
					const nk = this._key(x + dx, y + dy);
					if (allFloor.has(nk) && !carved.has(nk)) outside.add(nk);
				}
			}
			if (outside.size !== 1) return false;
			const ak = this._key(a.attachment.x, a.attachment.y);
			if (!outside.has(ak)) return false;
			const anchorRoom = roomAt[a.attachment.y]?.[a.attachment.x] || null;
			if (anchorRoom?.special) return false;
		}
		return true;
	}

	// Copies carved alcove/niche cells into the semantic map after zone generation is complete.
	_paintAlcoves(map) {
		for (const a of this.alcoves) {
			for (let y = a.rect.y; y < a.rect.y + a.rect.h; y++) for (let x = a.rect.x; x < a.rect.x + a.rect.w; x++)
					map.kind[y][x] = ' ';
			const c = this._center(a.rect);
			map.kind[c.y][c.x] = a.type === 'room' ? 'a' : 'n';
		}
	}

	_paintFloors(map) {
		for (const z of this.zones)
			for (const k of z.floor || []) {
			const [x, y] = this._xy(k);
			map.walls[y][x] = null;
			if (map.kind[y][x] === '#') map.kind[y][x] = '.';
		}
	}

	// ----- Normal and special zone generation -----

	_recordFallback(zone, level) {
		this.stats.fallbacks++;
		this.stats.fallbackDetails.push(zone.id + ':' + level);
		zone.fallback = level;
	}

	// Builds progressively simpler guaranteed geometry when stochastic normal-zone generation cannot succeed.
	_generateNormalFallback(zone) {
		const gateKeys = this._gateKeys(zone);
		for (let level = 1; level <= 3; level++) {
			if (level <= 2) {
				const target = level === 1 ? 1 : Math.min(2, this._roomTarget(zone)), rooms = this._generateBspRooms(zone, target);
				if (rooms.length) {
					const roomAt = this._buildRoomAt(rooms), floor = new Set(), edgeSet = new Set();
					for (const r of rooms) for (let y = r.y; y < r.y + r.h; y++)
							for (let x = r.x; x < r.x + r.w; x++) floor.add(this._key(x, y));
					for (const g of zone.gates || []) floor.add(this._key(g.cell.x, g.cell.y));
					let ok = this._connectRoomTree(zone, rooms, roomAt, gateKeys, floor, edgeSet);
					if (ok)
						for (const g of zone.gates || []) {
						let linked = false;
						for (const r of rooms.slice().sort((a, b) => {
							const ca = this._center(a), cb = this._center(b); return Math.abs(ca.x - g.cell.x) + Math.abs(ca.y - g.cell.y) - Math.abs(cb.x - g.cell.x) - Math.abs(cb.y - g.cell.y);
						})) {
							if (this._routeGateToRoom(zone, g.cell, r, roomAt, gateKeys, floor)) {
								linked = true;
								break;
							}
						}
						if (!linked) {
							ok = false;
							break;
						}
					}
					if (ok && this._validateLocalZoneGeometry(zone, rooms, floor)) {
						this._recordFallback(zone, 'rooms-' + target);
						return { rooms, floor };
					}
				}
			}
			else {
				const rooms = [], roomAt = this._buildRoomAt(rooms), floor = new Set();
				for (const g of zone.gates || []) floor.add(this._key(g.cell.x, g.cell.y));
				if (this._routeGateBackbone(zone, roomAt, gateKeys, floor) && this._validateLocalZoneGeometry(zone, rooms, floor)) {
					this._recordFallback(zone, 'backbone');
					return { rooms, floor };
				}
			}
		}
		return null;
	}

	// Generates rooms and mandatory connectivity for a normal/arena zone, retrying before deterministic fallback.
	_generateNormalZone(zone) {
		const baseTarget = zone.type === 'arena' ? 1 : this._roomTarget(zone), work = this._inset(zone.rect, 1);
		if (zone.type !== 'arena' && (work.w < 3 || work.h < 3)) {
			const rooms = [], roomAt = this._buildRoomAt(rooms), gateKeys = this._gateKeys(zone), floor = new Set();
			for (const g of zone.gates || []) floor.add(this._key(g.cell.x, g.cell.y));
			if (this._routeGateBackbone(zone, roomAt, gateKeys, floor) && this._validateLocalZoneGeometry(zone, rooms, floor)) {
				this._recordFallback(zone, 'thin-backbone');
				return { rooms, floor };
			}
			throw new Error('Failed to generate connector zone ' + zone.id);
		}
		for (let attempt = 0; attempt < this.zoneAttempts; attempt++) {
			if (attempt) this.stats.zoneRetries++;
			let target = baseTarget;
			if (zone.type !== 'arena') {
				const q = (attempt + 1) / this.zoneAttempts;
				if (q > .9) target = Math.max(1, baseTarget - 2);
				else if (q > .75)
				target = Math.max(1, baseTarget - 1);
			}
			const rooms = zone.type === 'arena' ? [this._makeArenaRoom(zone)] : this._generateBspRooms(zone, target);
			if (!rooms.length) continue;
			const roomAt = this._buildRoomAt(rooms), gateKeys = this._gateKeys(zone), floor = new Set(), edgeSet = new Set();
			for (const r of rooms) for (let y = r.y; y < r.y + r.h; y++)
					for (let x = r.x; x < r.x + r.w; x++) floor.add(this._key(x, y));
			for (const g of zone.gates || []) floor.add(this._key(g.cell.x, g.cell.y));
			if (!this._connectRoomTree(zone, rooms, roomAt, gateKeys, floor, edgeSet)) continue;
			let gatesOK = true;
			for (const g of zone.gates || []) {
				const sorted = rooms.slice().sort((a, b) => {
					const ca = this._center(a), cb = this._center(b); return (Math.abs(ca.x - g.cell.x) + Math.abs(ca.y - g.cell.y)) - (Math.abs(cb.x - g.cell.x) + Math.abs(cb.y - g.cell.y));
				});
				let ok = false;
				for (const r of sorted)
					if (this._routeGateToRoom(zone, g.cell, r, roomAt, gateKeys, floor)) {
					ok = true;
					break;
				}
				if (!ok) {
					gatesOK = false;
					break;
				}
			}
			if (!gatesOK) continue;
			if (!this._validateLocalZoneGeometry(zone, rooms, floor)) continue;
			return { rooms, floor };
		}
		if (zone.type !== 'arena') {
			const fb = this._generateNormalFallback(zone);
			if (fb) return fb;
		}
		throw new Error('Failed to generate zone ' + zone.id + ' after ' + this.zoneAttempts + ' attempts and fallbacks');
	}

	// Creates the single inset room representing an arena zone.
	_makeArenaRoom(zone) {
		const r = this._inset(zone.rect, 1);
		if (r.w < 3 || r.h < 3) throw new Error('Arena too small');
		return { id: 'r' + (this._roomSeq++), zoneId: zone.id, roomType: 'arena', x: r.x, y: r.y, w: r.w, h: r.h, doorOutside: new Set() };
	}

	// Connects all zone gates into one transit backbone without requiring normal rooms.
	_routeGateBackbone(zone, roomAt, gateKeys, floor) {
		const gs = zone.gates || [];
		if (gs.length < 2) return true;
		for (let i = 1; i < gs.length; i++) {
			const a = gs[0].cell, b = gs[i].cell, path = this._tryPath(zone, a.x, a.y, b.x, b.y, roomAt, null, null, null, null, gateKeys, floor);
			if (!path) return false;
			this._carveRoute(path, floor);
		}
		return true;
	}

	// Connects a room to the nearest viable existing floor component.
	_routeRoomToFloor(zone, room, roomAt, gateKeys, floor) {
		const ports = this._roomPorts(room, zone, roomAt, gateKeys), targets = [];
		for (const k of floor) {
			const [x, y] = this._xy(k);
			if (roomAt[y][x]) continue;
			let near = false;
			for (let dy = -1; dy <= 1 && !near; dy++)
				for (let dx = -1; dx <= 1; dx++) {
				if (!dx && !dy) continue;
				const nx = x + dx, ny = y + dy;
				if (nx >= 0 && ny >= 0 && nx < this.width && ny < this.height && roomAt[ny][nx] && roomAt[ny][nx] !== room) {
					near = true;
					break;
				}
			}
			if (!near)
				targets.push({ x, y });
		}
		const pairs = [];
		for (const p of ports) for (const t of targets)
				pairs.push({ p, t, d: Math.abs(p.ox - t.x) + Math.abs(p.oy - t.y) });
		pairs.sort((a, b) => a.d - b.d);
		for (const q of pairs.slice(0, 160)) {
			const path = this._tryPath(zone, q.p.ox, q.p.oy, q.t.x, q.t.y, roomAt, room, null, q.p, null, gateKeys, floor);
			if (!path) continue;
			this._carveRoute(path, floor);
			room.doorOutside.add(this._key(q.p.ox, q.p.oy));
			room.specialDoor = { x: q.p.ix, y: q.p.iy };
			return true;
		}
		return false;
	}

	// Builds the compact deterministic fallback used by very small corner special zones.
	_generateCompactSpecialZone(zone) {
		const r = zone.rect, corner = zone.corner, floor = new Set(), east = corner === 'nw' || corner === 'sw',
			south = corner === 'nw' || corner === 'ne', backX = east ? r.x + r.w - 1 : r.x, backY = south ? r.y + r.h - 1 : r.y;
		for (let y = r.y; y < r.y + r.h; y++) floor.add(this._key(backX, y));
		for (let x = r.x; x < r.x + r.w; x++) floor.add(this._key(x, backY));
		for (const g of zone.gates || []) floor.add(this._key(g.cell.x, g.cell.y));
		const maxW = Math.min(this.specialMaxRoomSize, r.w - 2), maxH = Math.min(this.specialMaxRoomSize, r.h - 2),
			minW = Math.min(this.specialMinRoomSize, maxW), minH = Math.min(this.specialMinRoomSize, maxH);
		if (maxW < 3 || maxH < 3) throw new Error('Special zone ' + zone.id + ' too small');
		const w = this._rand(Math.max(3, minW), Math.max(3, maxW)), h = this._rand(Math.max(3, minH), Math.max(3, maxH)),
			x = east ? r.x : r.x + r.w - w, y = south ? r.y : r.y + r.h - h,
			room = { id: 'r' + (this._roomSeq++), zoneId: zone.id, roomType: zone.roomType, special: true, x, y, w, h, doorOutside: new Set() };
		for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++)
				floor.add(this._key(xx, yy));
		let door, branch = [];
		if (r.w - w >= 2) {
			const dy = y + Math.floor(h / 2), dx = east ? x + w - 1 : x, step = east ? 1 : -1;
			door = { x: dx, y: dy };
			for (let xx = dx + step;; xx += step) {
				branch.push([xx, dy]);
				if (xx === backX) break;
			}
		}
		else {
			const dx = x + Math.floor(w / 2), dy = south ? y + h - 1 : y, step = south ? 1 : -1;
			door = { x: dx, y: dy };
			for (let yy = dy + step;; yy += step) {
				branch.push([dx, yy]);
				if (yy === backY) break;
			}
		}
		for (const [xx, yy] of branch) floor.add(this._key(xx, yy));
		if (branch.length) room.doorOutside.add(this._key(branch[0][0], branch[0][1]));
		room.specialDoor = door;
		return { rooms: [room], floor };
	}

	// Builds a deterministic transit-safe fallback for narrow N/S/E/W special zones.
	_generateStructuredMiddleSpecialFallback(zone) {
		const r = zone.rect, gateKeys = this._gateKeys(zone), floor = new Set(), rooms = [], isW = zone.slot === 'w', isE = zone.slot === 'e',
			isN = zone.slot === 'n', isS = zone.slot === 's';
		if (!(isW || isE || isN || isS)) return null;
		for (const g of zone.gates || []) floor.add(this._key(g.cell.x, g.cell.y));
		let room, lane, door, doorOut;
		if (isW || isE) {
			if (r.w < 7 || r.h < 7) return null;
			const rw = 3, rh = Math.min(4, r.h - 4), ry = r.y + Math.floor((r.h - rh) / 2), rx = isW ? r.x + 1 : r.x + r.w - rw - 1;
			room = { id: 'r' + (this._roomSeq++), zoneId: zone.id, roomType: zone.roomType, special: true, x: rx, y: ry, w: rw, h: rh, doorOutside: new Set() };
			lane = isW ? r.x + r.w - 2 : r.x + 1;
			for (let y = r.y + 1; y < r.y + r.h - 1; y++) floor.add(this._key(lane, y));
			for (const g of zone.gates || []) {
				const c = g.cell;
				if (g.side === 'N' || g.side === 'S') {
					const iy = g.side === 'N' ? r.y + 1 : r.y + r.h - 2;
					floor.add(this._key(c.x, iy));
					const step = c.x <= lane ? 1 : -1;
					for (let x = c.x; x !== lane; x += step) floor.add(this._key(x, iy));
					floor.add(this._key(lane, iy));
				}
				else {
					const step = c.x <= lane ? 1 : -1;
					for (let x = c.x; x !== lane; x += step) floor.add(this._key(x, c.y));
					floor.add(this._key(lane, c.y));
				}
			}
			const dy = ry + Math.floor(rh / 2), ix = isW ? rx + rw - 1 : rx, ox = isW ? ix + 1 : ix - 1;
			door = { x: ix, y: dy };
			doorOut = { x: ox, y: dy };
			const step = ox <= lane ? 1 : -1;
			for (let x = ox;; x += step) {
				floor.add(this._key(x, dy));
				if (x === lane) break;
			}
		}
		else {
			if (r.h < 7 || r.w < 7) return null;
			const rh = 3, rw = Math.min(4, r.w - 4), rx = r.x + Math.floor((r.w - rw) / 2), ry = isN ? r.y + 1 : r.y + r.h - rh - 1;
			room = { id: 'r' + (this._roomSeq++), zoneId: zone.id, roomType: zone.roomType, special: true, x: rx, y: ry, w: rw, h: rh, doorOutside: new Set() };
			lane = isN ? r.y + r.h - 2 : r.y + 1;
			for (let x = r.x + 1; x < r.x + r.w - 1; x++) floor.add(this._key(x, lane));
			for (const g of zone.gates || []) {
				const c = g.cell;
				if (g.side === 'W' || g.side === 'E') {
					const ix = g.side === 'W' ? r.x + 1 : r.x + r.w - 2;
					floor.add(this._key(ix, c.y));
					const step = c.y <= lane ? 1 : -1;
					for (let y = c.y; y !== lane; y += step) floor.add(this._key(ix, y));
					floor.add(this._key(ix, lane));
				}
				else {
					const step = c.y <= lane ? 1 : -1;
					for (let y = c.y; y !== lane; y += step) floor.add(this._key(c.x, y));
					floor.add(this._key(c.x, lane));
				}
			}
			const dx = rx + Math.floor(rw / 2), iy = isN ? ry + rh - 1 : ry, oy = isN ? iy + 1 : iy - 1;
			door = { x: dx, y: iy };
			doorOut = { x: dx, y: oy };
			const step = oy <= lane ? 1 : -1;
			for (let y = oy;; y += step) {
				floor.add(this._key(dx, y));
				if (y === lane) break;
			}
		}
		for (let y = room.y; y < room.y + room.h; y++) for (let x = room.x; x < room.x + room.w; x++)
				floor.add(this._key(x, y));
		room.doorOutside.add(this._key(doorOut.x, doorOut.y));
		room.specialDoor = door;
		rooms.push(room);
		if (!this._validateLocalZoneGeometry(zone, rooms, floor) || !this._zoneTerminalsConnected(zone, rooms, floor, true)) return null;
		this._recordFallback(zone, 'structured-' + zone.slot);
		return { rooms, floor };
	}

	// Selects the appropriate deterministic fallback strategy for a special zone.
	_generateSpecialFallback(zone) {
		if (zone.slotClass === 'corner') {
			zone.allowBoundaryRouting = true;
			try {
				const compact = this._generateCompactSpecialZone(zone);
				this._recordFallback(zone, 'compact-corner');
				return compact;
			}
			catch (e) { return null; }
		}
		zone.allowBoundaryRouting = false;
		return this._generateStructuredMiddleSpecialFallback(zone);
	}

	// Places a bounded leaf special chamber inside one BSP leaf. Returns the room or null.
	_placeSpecialRoomInLeaf(zone, leaf, small = false) {
		const narrowW = zone.slotClass === 'middle' && leaf.w <= 5, narrowH = zone.slotClass === 'middle' && leaf.h <= 5,
			minW = Math.max(3, Math.min(small ? 3 : (narrowW ? 3 : this.specialMinRoomSize), leaf.w)),
			minH = Math.max(3, Math.min(small ? 3 : (narrowH ? 3 : this.specialMinRoomSize), leaf.h)),
			maxW = Math.max(minW, Math.min(this.specialMaxRoomSize, leaf.w)), maxH = Math.max(minH, Math.min(this.specialMaxRoomSize, leaf.h));
		for (let attempt = 0; attempt < 36; attempt++) {
			const w = this._rand(minW, maxW), h = this._rand(minH, maxH);
			let x, y;
			if (zone.slot === 'e') x = leaf.x + leaf.w - w;
			else if (zone.slot === 'w')
			x = leaf.x;
			else if (zone.slot === 'ne' || zone.slot === 'se')
			x = leaf.x + leaf.w - w;
			else if (zone.slot === 'nw' || zone.slot === 'sw')
			x = leaf.x;
			else
				x = this._rand(leaf.x, leaf.x + leaf.w - w);
			if (zone.slot === 's') y = leaf.y + leaf.h - h;
			else if (zone.slot === 'n')
			y = leaf.y;
			else if (zone.slot === 'sw' || zone.slot === 'se')
			y = leaf.y + leaf.h - h;
			else if (zone.slot === 'nw' || zone.slot === 'ne')
			y = leaf.y;
			else
				y = this._rand(leaf.y, leaf.y + leaf.h - h);
			if (zone.slot === 'e' || zone.slot === 'w') y = this._rand(leaf.y, leaf.y + leaf.h - h);
			if (zone.slot === 'n' || zone.slot === 's') x = this._rand(leaf.x, leaf.x + leaf.w - w);
			const r = { id: 'r' + (this._roomSeq++), zoneId: zone.id, roomType: zone.roomType, special: true, x, y, w, h, doorOutside: new Set() };
			let bad = false;
			for (const g of zone.gates || [])
				if (this._rectNear(r, { x: g.cell.x, y: g.cell.y, w: 1, h: 1 }, 1)) {
				bad = true;
				break;
			}
			if (!bad) return r;
		}
		return null;
	}

	// Places one normal room inside a special-zone BSP leaf, preserving boundary clearance.
	_generateNormalRoomInLeaf(zone, leaf) {
		const maxW = Math.min(this.maxRoomSize, leaf.w), maxH = Math.min(this.maxRoomSize, leaf.h), minSize = Math.max(3, Math.min(this.minRoomSize, maxW, maxH));
		if (maxW < 3 || maxH < 3) return null;
		const w = this._rand(minSize, maxW), h = this._rand(minSize, maxH), x = this._rand(leaf.x, leaf.x + leaf.w - w), y = this._rand(leaf.y, leaf.y + leaf.h - h);
		return { id: 'r' + (this._roomSeq++), zoneId: zone.id, roomType: 'normal', x, y, w, h, doorOutside: new Set() };
	}

	// BSP-splits the whole special zone, chooses one leaf chamber as special and uses remaining leaves for auxiliary rooms.
	_generateSpecialRoomsFromWholeBsp(zone, target, small = false) {
		const work = this._inset(zone.rect, 1);
		if (work.w < 3 || work.h < 3) return null;
		const minSize = Math.max(3, Math.min(this.minRoomSize, work.w, work.h)), leaves = target <= 1 ? [{ ...work }] : this._splitLeaves(work, target, minSize);
		if (!leaves.length) return null;
		const choices = leaves.map((leaf, i) => ({ leaf, i, area: leaf.w * leaf.h }));
		this._shuffle(choices);
		for (const pick of choices) {
			const rooms = [];
			let special = null, ok = true;
			for (let i = 0; i < leaves.length; i++) {
				const room = i === pick.i ? this._placeSpecialRoomInLeaf(zone, leaves[i], small) : this._generateNormalRoomInLeaf(zone, leaves[i]);
				if (!room) {
					ok = false;
					break;
				}
				rooms.push(room);
				if (room.special) special = room;
			}
			if (ok && special)
				return { rooms, special, normals: rooms.filter(r => !r.special), leaves };
		}
		return null;
	}

	// Generates a transit-safe special zone whose locked chamber is a leaf outside the required gate backbone.
	_generateSpecialZone(zone) {
		if (zone.slotClass === 'corner' && Math.min(zone.rect.w, zone.rect.h) <= 6) {
			zone.allowBoundaryRouting = true;
			return this._generateCompactSpecialZone(zone);
		}
		zone.allowBoundaryRouting = false;
		const baseTarget = this._roomTarget(zone);
		for (let attempt = 0; attempt < this.zoneAttempts; attempt++) {
			if (attempt) this.stats.zoneRetries++;
			const q = (attempt + 1) / this.zoneAttempts, target = baseTarget, layout = this._generateSpecialRoomsFromWholeBsp(zone, target, q > .8);
			if (!layout) continue;
			const { rooms, special, normals } = layout, roomAt = this._buildRoomAt(rooms), gateKeys = this._gateKeys(zone), floor = new Set(), edgeSet = new Set();
			for (const r of rooms) for (let y = r.y; y < r.y + r.h; y++)
					for (let x = r.x; x < r.x + r.w; x++) floor.add(this._key(x, y));
			for (const g of zone.gates || []) floor.add(this._key(g.cell.x, g.cell.y));
			let networkOK = true;
			if (normals.length) {
				if (!this._connectRoomTree(zone, normals, roomAt, gateKeys, floor, edgeSet)) networkOK = false;
				if (networkOK)
					for (const g of zone.gates || []) {
					const sorted = normals.slice().sort((a, b) => {
						const ca = this._center(a), cb = this._center(b); return (Math.abs(ca.x - g.cell.x) + Math.abs(ca.y - g.cell.y)) - (Math.abs(cb.x - g.cell.x) + Math.abs(cb.y - g.cell.y));
					});
					let ok = false;
					for (const r of sorted)
						if (this._routeGateToRoom(zone, g.cell, r, roomAt, gateKeys, floor)) {
						ok = true;
						break;
					}
					if (!ok) {
						networkOK = false;
						break;
					}
				}
			}
			else
				networkOK = this._routeGateBackbone(zone, roomAt, gateKeys, floor);
			if (!networkOK) continue;
			if (!this._routeRoomToFloor(zone, special, roomAt, gateKeys, floor)) continue;
			if (!this._validateLocalZoneGeometry(zone, rooms, floor)) continue;
			if (!this._zoneTerminalsConnected(zone, rooms, floor, true)) continue;
			return { rooms, floor };
		}
		const fb = this._generateSpecialFallback(zone);
		if (fb) return fb;
		throw new Error('Failed to generate special zone ' + zone.id + ' after ' + this.zoneAttempts + ' attempts and fallback');
	}

	// ----- Geometry validation -----

	// Validates room/corridor contacts and boundary rules inside one generated zone.
	_validateLocalZoneGeometry(zone, rooms, floor) {
		const roomAt = this._buildRoomAt(rooms), gateKeys = this._gateKeys(zone);
		for (const k of floor) {
			const [x, y] = this._xy(k);
			if (!this._insideRect(zone.rect, x, y)) return false;
			if (roomAt[y][x]) continue;
			if (this._isBoundary(zone.rect, x, y) && !gateKeys.has(k) && !(zone.allowBoundaryRouting && this._isOuterBoundary(x, y))) return false;
			const touched = new Map();
			for (let dy = -1; dy <= 1; dy++)
				for (let dx = -1; dx <= 1; dx++) {
				if (!dx && !dy) continue;
				const nx = x + dx, ny = y + dy;
				if (nx < 0 || ny < 0 || nx >= this.width || ny >= this.height) continue;
				const room = roomAt[ny][nx];
				if (!room) continue;
				let t = touched.get(room);
				if (!t) {
					t = { orth: false };
					touched.set(room, t);
				}
				if (Math.abs(dx) + Math.abs(dy) === 1) t.orth = true;
			}
			for (const [room, t] of touched) {
				if (!room.doorOutside.has(k)) return false;
				if (!t.orth) return false;
			}
		}
		return this._zoneTerminalsConnected(zone, rooms, floor, false);
	}

	// Checks connectivity between all required room/gate terminals, optionally treating the special chamber as blocked.
	_zoneTerminalsConnected(zone, rooms, floor, excludeSpecial) {
		const blocked = new Set();
		if (excludeSpecial) for (const r of rooms.filter(x => x.special))
				for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++)
						blocked.add(this._key(x, y));
		const terms = [];
		for (const g of zone.gates || []) terms.push(this._key(g.cell.x, g.cell.y));
		for (const r of rooms)
			if (!excludeSpecial || !r.special) {
			const c = this._center(r);
			terms.push(this._key(c.x, c.y));
		}
		if (terms.length <= 1) return true;
		const start = terms[0];
		if (!floor.has(start) || blocked.has(start)) return false;
		const seen = new Set([start]), q = [start];
		let qi = 0;
		while (qi < q.length) {
			const k = q[qi++], [x, y] = this._xy(k);
			for (const [dx, dy] of DIR4) {
				const nx = x + dx, ny = y + dy, nk = this._key(nx, ny);
				if (!this._insideRect(zone.rect, nx, ny) || seen.has(nk) || blocked.has(nk) || !floor.has(nk)) continue;
				seen.add(nk);
				q.push(nk);
			}
		}
		return terms.every(k => seen.has(k));
	}

	// Commits one generated zone result into global room lists and semantic map cells.
	_mergeZoneResult(zone, res, map) {
		zone.rooms = res.rooms;
		zone.floor = res.floor;
		for (const k of res.floor) {
			const [x, y] = this._xy(k);
			map.walls[y][x] = null;
			if (map.kind[y][x] === '#') map.kind[y][x] = '.';
		}
		for (const r of res.rooms) {
			this.rooms.push(r);
			for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++)
					map.kind[y][x] = ' ';
		}
	}

	// Marks gate and doorway metadata on the semantic debug map after all zone floors are merged.
	_markGatesAndDoors(map) {
		for (const g of this.gates) {
			map.kind[g.aCell.y][g.aCell.x] = ',';
			map.kind[g.bCell.y][g.bCell.x] = ',';
		}
		for (const r of this.rooms.filter(x => x.special && x.specialDoor)) map.kind[r.specialDoor.y][r.specialDoor.x] = 'D';
		for (const r of this.rooms) {
			let ch = null;
			if (r.roomType === 'arena') ch = 'A';
			else if (r.roomType === 'treasury')
			ch = 'T';
			else if (r.roomType === 'library')
			ch = 'L';
			if (!ch) continue;
			const c = this._center(r);
			map.kind[c.y][c.x] = ch;
		}
	}

	// Checks connectivity of the resolved ZoneGraph using its zone edges.
	_zoneGraphConnected() {
		if (!this.zones.length) return true;
		const adj = new Map(this.zones.map(z => [z.id, []]));
		for (const e of this.edges) {
			adj.get(e.a).push(e.b);
			adj.get(e.b).push(e.a);
		}
		const seen = new Set([this.zones[0].id]), q = [this.zones[0].id];
		let qi = 0;
		while (qi < q.length) {
			const z = q[qi++];
			for (const n of adj.get(z))
				if (!seen.has(n)) {
				seen.add(n);
				q.push(n);
			}
		}
		return seen.size === this.zones.length;
	}

	// Checks that all non-special rooms remain globally reachable while special chambers are blocked.
	_globalReachableWithoutSpecial() {
		const floor = new Set();
		for (const z of this.zones) for (const k of z.floor || [])
				floor.add(k);
		const blocked = new Set();
		for (const r of this.rooms.filter(x => x.special)) for (let y = r.y; y < r.y + r.h; y++)
				for (let x = r.x; x < r.x + r.w; x++) blocked.add(this._key(x, y));
		const normals = this.rooms.filter(x => !x.special);
		if (!normals.length) return true;
		const c = this._center(normals[0]), start = this._key(c.x, c.y), seen = new Set([start]), q = [start];
		let qi = 0;
		while (qi < q.length) {
			const k = q[qi++], [x, y] = this._xy(k);
			for (const [dx, dy] of DIR4) {
				const nx = x + dx, ny = y + dy;
				if (nx < 0 || ny < 0 || nx >= this.width || ny >= this.height) continue;
				const nk = this._key(nx, ny);
				if (seen.has(nk) || blocked.has(nk) || !floor.has(nk)) continue;
				seen.add(nk);
				q.push(nk);
			}
		}
		return normals.every(r => {
			const c = this._center(r); return seen.has(this._key(c.x, c.y));
		});
	}

	// Counts physical floor connections from a special chamber to the rest of the dungeon.
	_specialEntranceCount(room) {
		let n = 0;
		const floor = new Set();
		for (const z of this.zones) for (const k of z.floor || [])
				floor.add(k);
		for (let y = room.y; y < room.y + room.h; y++) for (let x = room.x; x < room.x + room.w; x++)
				for (const [dx, dy] of DIR4) {
			const nx = x + dx, ny = y + dy;
			if (nx >= room.x && ny >= room.y && nx < room.x + room.w && ny < room.y + room.h) continue;
			if (floor.has(this._key(nx, ny))) n++;
		}
		return n;
	}

	// Checks that cross-zone floor adjacency exists only at declared gates or alcove-owned crossings.
	_noUnintendedZoneConnections() {
		const zoneAt = Array.from({ length: this.height }, () => Array(this.width).fill(null));
		for (const z of this.zones) for (let y = z.rect.y; y < z.rect.y + z.rect.h; y++)
				for (let x = z.rect.x; x < z.rect.x + z.rect.w; x++) zoneAt[y][x] = z.id;
		const allowed = new Set();
		for (const g of this.gates) {
			const a = this._key(g.aCell.x, g.aCell.y), b = this._key(g.bCell.x, g.bCell.y);
			allowed.add(a + '>' + b);
			allowed.add(b + '>' + a);
		}
		for (const a of this.alcoves || []) {
			const ak = this._key(a.attachment.x, a.attachment.y);
			for (const k of a.carvedKeys) {
				const [x, y] = this._xy(k);
				for (const [dx, dy] of DIR4) {
					const nk = this._key(x + dx, y + dy);
					if (a.carvedKeys.has(nk) || nk === ak) {
						allowed.add(k + '>' + nk);
						allowed.add(nk + '>' + k);
					}
				}
			}
		}
		const floor = new Set();
		for (const z of this.zones) for (const k of z.floor || [])
				floor.add(k);
		for (const k of floor) {
			const [x, y] = this._xy(k), z = zoneAt[y][x];
			for (const [dx, dy] of [[1, 0], [0, 1]]) {
				const nx = x + dx, ny = y + dy;
				if (nx >= this.width || ny >= this.height) continue;
				const nk = this._key(nx, ny), z2 = zoneAt[ny][nx];
				if (z && z2 && z !== z2 && floor.has(nk) && !allowed.has(k + '>' + nk)) return false;
			}
		}
		return true;
	}

	// Checks room/corridor contact rules, allowing explicit side doorways while rejecting accidental diagonal-only touches.
	_noBadRoomTouches() {
		const roomAt = this._buildRoomAt(this.rooms), floor = new Set();
		for (const z of this.zones) for (const k of z.floor || [])
				floor.add(k);
		for (const k of floor) {
			const [x, y] = this._xy(k);
			if (roomAt[y][x]) continue;
			const touched = new Map();
			for (let dy = -1; dy <= 1; dy++)
				for (let dx = -1; dx <= 1; dx++) {
				if (!dx && !dy) continue;
				const nx = x + dx, ny = y + dy;
				if (nx < 0 || ny < 0 || nx >= this.width || ny >= this.height) continue;
				const r = roomAt[ny][nx];
				if (!r) continue;
				let t = touched.get(r);
				if (!t) {
					t = { orth: false };
					touched.set(r, t);
				}
				if (Math.abs(dx) + Math.abs(dy) === 1) t.orth = true;
			}
			for (const [r, t] of touched) {
				if (!r.doorOutside.has(k)) return false;
				if (!t.orth) return false;
			}
		}
		return true;
	}

	// Runs generator invariants and returns an array of named test results for the produced map.
	runTests() {
		const tests = [], add = (name, ok, details = '') => tests.push({ name, ok, details });
		add('ZoneGraph is connected', this._zoneGraphConnected());
		add('Requested special zones were created', this.zones.filter(z => z.type === 'special').length === this.specialCount,
			'requested=' + this.specialCount + ', created=' + this.zones.filter(z => z.type === 'special').length);
		add('Every ZoneGraph edge has at least one gate', this.edges.every(e => (e.gates || []).length >= 1));
		add('Special edges have exactly one gate', this.edges.filter(e => this._zone(e.a).type === 'special' || this._zone(e.b).type === 'special').every(e => (e.gates || []).length === 1));
		add('Special zones have valid required-neighbor counts',
			this.zones.filter(z => z.type === 'special').every(z => z.slotClass ? (z.slotClass === 'corner' ? (z.gates || []).length === 2 : (z.gates || []).length === 3) : (z.gates || []).length >= 1),
			this.zones.filter(z => z.type === 'special').map(z => (z.slot || z.id) + '=' + ((z.gates || []).length)).join(', '));
		add('Every zone is internally connected', this.zones.every(z => this._zoneTerminalsConnected(z, z.rooms || [], z.floor || new Set(), false)));
		add('Every special-zone backbone connects its gates without entering the special room', this.zones.filter(z => z.type === 'special').every(z => this._zoneTerminalsConnected(z, z.rooms || [], z.floor || new Set(), true)));
		const entrances = this.rooms.filter(r => r.special).map(r => ({ r, n: this._specialEntranceCount(r) }));
		add('Every special room has exactly one physical entrance', entrances.every(x => x.n === 1), entrances.map(x => x.r.roomType + '@' + x.r.zoneId + '=' + x.n).join(', '));
		add('All normal rooms remain globally reachable with special rooms blocked', this._globalReachableWithoutSpecial());
		add('No unintended physical connection exists between zones', this._noUnintendedZoneConnections());
		add('Room/corridor contacts are valid (corner-side doorways allowed, diagonal-only touch forbidden)', this._noBadRoomTouches());
		add('Every alcove/niche is a global single-attachment leaf and does not intersect rooms', this._validateAlcoves(),
			'created=' + this.alcoves.length + ', cross-zone=' + (this.stats.alcoveCrossZone || 0) + ', special-area=' + (this.stats.alcoveSpecialArea || 0));
		return tests;
	}

	// ----- Main generation API and diagnostics -----

	// Executes one complete generation attempt for an already resolved ZoneLayout and returns the GeneratedDungeon.
	_generateOnce(layout) {
		this._resetGenerationState();
		const map = this._createEmptyMap();
		const resolvedLayout = this._applyLayout(layout);
		for (const z of this.zones) {
			const result = z.type === 'special' ? this._generateSpecialZone(z) : this._generateNormalZone(z);
			this._mergeZoneResult(z, result, map);
		}
		this._applyPostGenerationLoops();
		this._generateAlcoves();
		this._paintFloors(map);
		this._paintAlcoves(map);
		this._markGatesAndDoors(map);
		return {
			map,
			zones: this.zones,
			edges: this.edges,
			gates: this.gates,
			rooms: this.rooms,
			alcoves: this.alcoves,
			layout: resolvedLayout,
			tests: this.runTests(),
			stats: { ...this.stats }
		};
	}

	// Generates one dungeon from a ZoneLayout, resetting deterministic state before the attempt. Returns GeneratedDungeon.
	generate(layout) {
		if (!layout) throw new Error('DungeonGenerator.generate(layout) requires a resolved ZoneLayout');
		const result = this._generateOnce(layout);
		const failedTests = result.tests.filter(t => !t.ok);
		if (failedTests.length) throw new Error('Validation failed: ' + failedTests.map(t => t.name).join(', '));
		return result;
	}

	// Computes compact floor/room/loop/fallback statistics for a generation result.
	metrics(result) {
		let floor = 0, roomCells = 0;
		const roomSet = new Set();
		for (const r of result.rooms) for (let y = r.y; y < r.y + r.h; y++)
				for (let x = r.x; x < r.x + r.w; x++) roomSet.add(this._key(x, y));
		for (const a of result.alcoves || []) for (let y = a.rect.y; y < a.rect.y + a.rect.h; y++)
				for (let x = a.rect.x; x < a.rect.x + a.rect.w; x++) roomSet.add(this._key(x, y));
		for (let y = 0; y < this.height; y++) for (let x = 0; x < this.width; x++)
				if (result.map.kind[y][x] !== '#') floor++;
		roomCells = roomSet.size;
		return { floor, roomCells, corridorCells: Math.max(0, floor - roomCells), fillPct: 100 * floor / (this.width * this.height) };
	}

	toASCII(result) { return result.map.kind.map(r => r.join('')).join('\n'); }

	// Stress-runs many generated maps and aggregates validation/statistics by map size.
	static runBatch(iterations, sizes, options = {}) {
		const s = { maps: 0, passed: 0, failed: 0, exceptions: 0, rooms: 0, special: 0, retries: 0, layoutRetries: 0, loops: 0, extraGates: 0,
			fallbacks: 0, fallbackMaps: 0, l: 0, astar: 0, routeFailed: 0, loopCandidates: 0, loopsRequested: 0, extraGateCandidates: 0,
			alcoveRooms: 0, alcoveNiches: 0, alcoveRoomCandidates: 0, alcoveNicheCandidates: 0, failTests: {}, bySize: {},
			specialSlots: { nw: 0, n: 0, ne: 0, w: 0, e: 0, sw: 0, s: 0, se: 0 }, firstFailure: null };
		for (let i = 0; i < iterations; i++) {
			const size = sizes[i % sizes.length], seed = (options.seedBase || 1) + i, key = size[0] + 'x' + size[1],
				bs = s.bySize[key] || (s.bySize[key] = { maps: 0, failed: 0, rooms: 0, special: 0, retries: 0, fallbackMaps: 0, minRooms: Infinity, maxRooms: 0 });
			try {
				const g = new ZoneGraphMapGenerator({ ...options, width: size[0], height: size[1], seed }), r = g.generate(), failed = r.tests.filter(t => !t.ok);
				s.maps++;
				s.rooms += r.rooms.length;
				s.special += r.zones.filter(z => z.type === 'special').length;
				s.retries += r.stats.zoneRetries;
				s.layoutRetries += r.stats.layoutRetries || 0;
				s.loops += r.stats.loopsAdded;
				s.extraGates += r.stats.extraGates || 0;
				s.fallbacks += r.stats.fallbacks || 0;
				if (r.stats.mapFallback || r.stats.fallbacks) {
					s.fallbackMaps++;
					bs.fallbackMaps++;
				}
				s.l += r.stats.l;
				s.astar += r.stats.astar;
				s.routeFailed += r.stats.routeFailed;
				s.loopCandidates += r.stats.loopCandidates || 0;
				s.loopsRequested += r.stats.loopsRequested || 0;
				s.extraGateCandidates += r.stats.extraGateCandidates || 0;
				s.alcoveRooms += r.stats.alcoveRoomsAdded || 0;
				s.alcoveNiches += r.stats.alcoveNichesAdded || 0;
				s.alcoveRoomCandidates += r.stats.alcoveRoomCandidates || 0;
				s.alcoveNicheCandidates += r.stats.alcoveNicheCandidates || 0;
				bs.maps++;
				bs.rooms += r.rooms.length;
				bs.special += r.zones.filter(z => z.type === 'special').length;
				bs.retries += r.stats.zoneRetries;
				bs.minRooms = Math.min(bs.minRooms, r.rooms.length);
				bs.maxRooms = Math.max(bs.maxRooms, r.rooms.length);
				for (const z of r.zones.filter(z => z.type === 'special')) s.specialSlots[z.slot || z.corner]++;
				if (!failed.length) s.passed++;
				else {
					s.failed++;
					bs.failed++;
					for (const t of failed) s.failTests[t.name] = (s.failTests[t.name] || 0) + 1;
					if (!s.firstFailure)
						s.firstFailure = { seed, size, failed, result: r };
				}
			}
			catch (error) {
				s.maps++;
				s.failed++;
				s.exceptions++;
				bs.maps++;
				bs.failed++;
				s.failTests.Exception = (s.failTests.Exception || 0) + 1;
				if (!s.firstFailure)
					s.firstFailure = { seed, size, error };
			}
		}
		return s;
	}
};

// ----- High-level map-generation façade -----

// High-level compatibility façade that prepares manual/automatic layouts, handles retries/fallbacks and invokes DungeonGenerator.
class ZoneGraphMapGenerator {

	constructor(cfg = {}) {
		this.plannerMode = cfg.plannerMode || 'skirmish';
		this.zoneGraphSpecInput = cfg.zoneGraphSpec || null;
		this._manualSpec = this.plannerMode === 'manual'
			? (this.zoneGraphSpecInput instanceof ZoneGraphSpec ? this.zoneGraphSpecInput : new ZoneGraphSpec(this.zoneGraphSpecInput || {}))
			: null;
		this._autoSpec = this.plannerMode === 'auto'
			? (this.zoneGraphSpecInput instanceof ZoneGraphSpec ? this.zoneGraphSpecInput : new ZoneGraphSpec(this.zoneGraphSpecInput || {}))
			: null;
		this._scenarioSpec = this._manualSpec || this._autoSpec;
		const specGeneration = this._scenarioSpec ? this._scenarioSpec.generation : {};
		this.cfg = this._scenarioSpec ? { ...cfg, ...specGeneration, seed: cfg.seed ?? specGeneration.seed ?? 1, plannerMode: this.plannerMode,
			zoneGraphSpec: this._scenarioSpec } : { ...cfg };
		const specMap = this._scenarioSpec ? this._scenarioSpec.map : {};
		this.width = specMap.width ?? this.cfg.width ?? 40;
		this.height = specMap.height ?? this.cfg.height ?? 32;
		this.seed = this.cfg.seed || 1;
		this.specialCount = this._scenarioSpec ? this._scenarioSpec.zones.filter(z => z.generator === 'special' || z.role === 'special' || z.specialType).length : Math.max(0, Math.min(8, this.cfg.specialCount ?? 2));
		this.arenaWeight = this.cfg.arenaWeight ?? 4;
		this.loopRatio = this.cfg.loopRatio ?? .15;
		this.zoneAttempts = Math.max(1, this.cfg.zoneAttempts || 40);
		this._lastEngine = null;
		this._lastSpec = null;
		this._lastLayout = null;
		this._manualPlanned = null;
		this._autoPlanned = null;
	}

	// Builds the DungeonGenerator configuration for one retry/fallback attempt.
	_attemptConfig(effectiveSpecial, effectiveLoop, attemptSeed) {
		return {
			...this.cfg,
			width: this.width,
			height: this.height,
			seed: attemptSeed,
			specialCount: effectiveSpecial,
			arenaWeight: this.arenaWeight,
			loopRatio: effectiveLoop,
			zoneAttempts: this.zoneAttempts
		};
	}

	// Validates/resolves a manual/grid ZoneGraphSpec once and returns its stable ZoneLayout.
	_prepareManualPlan() {
		if (this._manualPlanned) return this._manualPlanned;
		if (!this._manualSpec) throw new Error('Manual planner requires ZoneGraphSpec');
		const planner = new ManualZoneLayoutPlanner(this._manualSpec, { width: this.width, height: this.height });
		this._manualPlanned = planner.plan();
		return this._manualPlanned;
	}

	// Validates/embeds an automatic ZoneGraphSpec and returns its resolved ZoneLayout.
	_prepareAutoPlan() {
		if (this._autoPlanned) return this._autoPlanned;
		if (!this._autoSpec) throw new Error('Automatic planner requires ZoneGraphSpec');
		const planner = new AutomaticZoneLayoutPlanner(this._autoSpec, { width: this.width, height: this.height, seed: this.seed });
		this._autoPlanned = planner.plan();
		return this._autoPlanned;
	}

	// Builds one DungeonGenerator attempt with the effective fallback parameters and current plan.
	_generateAttempt(effectiveSpecial, effectiveLoop, attemptSeed) {
		const cfg = this._attemptConfig(effectiveSpecial, effectiveLoop, attemptSeed);
		const sharedRng = new RNG(attemptSeed);
		let planned;
		if (this.plannerMode === 'manual' || this.plannerMode === 'auto') {
			planned = this.plannerMode === 'manual' ? this._prepareManualPlan() : this._prepareAutoPlan();
			cfg.width = planned.layout.width;
			cfg.height = planned.layout.height;
			cfg.specialCount = planned.layout.zones.filter(z => z.type === 'special').length;
			cfg.allowUnzonedAlcoves = true;
		} else if (this.plannerMode === 'skirmish') {
			const spec = SkirmishZoneGraphFactory.create(SKIRMISH_ARENA_TEMPLATE, cfg, effectiveSpecial, attemptSeed);
			const planner = new AutomaticZoneLayoutPlanner(spec, { width: cfg.width, height: cfg.height, seed: attemptSeed });
			planned = planner.plan();
			planned.layout.meta.sourceFactory = 'SkirmishZoneGraphFactory';
			cfg.width = planned.layout.width;
			cfg.height = planned.layout.height;
			cfg.specialCount = planned.layout.zones.filter(z => z.type === 'special').length;
			cfg.allowUnzonedAlcoves = true;
		} else {
			throw new Error('Unknown plannerMode: ' + this.plannerMode);
		}
		const engine = new DungeonGenerator(cfg);
		// Continue the exact same primary RNG stream after layout planning.
		engine.rng = sharedRng;
		engine.loopRng = new RNG((attemptSeed ^ LOOP_RNG_SALT) >>> 0);
		engine.alcoveRng = new RNG((attemptSeed ^ ALCOVE_RNG_SALT) >>> 0);
		engine._useLoopRng = false;
		const result = engine.generate(planned.layout);
		result.zoneGraphSpec = planned.spec;
		result.zoneLayout = planned.layout;
		this._lastEngine = engine;
		this._lastSpec = planned.spec;
		this._lastLayout = planned.layout;
		return result;
	}

	// Orchestrates layout preparation, map retries and controlled fallback degradation. Returns the first valid dungeon.
	generate() {
		const requestedSpecial = this.specialCount;
		const requestedLoop = this.loopRatio;
		const requestedAttempts = this.zoneAttempts;
		const baseSeed = this.seed;
		let lastError = null;
		let layoutTry = 0;
		if (this.plannerMode === 'manual' || this.plannerMode === 'auto') {
			for (let pass = 0; pass < 8; pass++, layoutTry++) {
				const effectiveLoop = pass < 4 ? requestedLoop : requestedLoop * .35;
				const attemptSeed = (baseSeed + Math.imul(layoutTry + 1, LAYOUT_RETRY_STEP)) >>> 0;
				try {
					const result = this._generateAttempt(requestedSpecial, effectiveLoop, attemptSeed);
					result.stats.layoutRetries = layoutTry;
					result.stats.requestedSpecialCount = requestedSpecial;
					result.stats.effectiveSpecialCount = requestedSpecial;
					result.stats.requestedLoopRatio = requestedLoop;
					result.stats.effectiveLoopRatio = effectiveLoop;
					if (layoutTry || effectiveLoop !== requestedLoop) {
						const parts = [];
						if (layoutTry) parts.push('generation-retry=' + layoutTry);
						if (effectiveLoop !== requestedLoop) parts.push('loop ' + requestedLoop.toFixed(2) + '→' + effectiveLoop.toFixed(2));
						result.stats.mapFallback = parts.join(', ');
						result.stats.fallbacks++;
						result.stats.fallbackDetails.push('map:' + result.stats.mapFallback);
					}
					return result;
				} catch (e) {
					lastError = e;
				}
			}
			throw lastError || new Error('Scenario map generation failed after all retries');
		}
		for (let effectiveSpecial = requestedSpecial; effectiveSpecial >= 0; effectiveSpecial--) {
			const passes = effectiveSpecial === requestedSpecial ? 8 : 4;
			for (let pass = 0; pass < passes; pass++, layoutTry++) {
				const effectiveLoop = pass < 4 ? requestedLoop : requestedLoop * .35;
				const attemptSeed = (baseSeed + Math.imul(layoutTry + 1, LAYOUT_RETRY_STEP)) >>> 0;
				try {
					const result = this._generateAttempt(effectiveSpecial, effectiveLoop, attemptSeed);
					result.stats.layoutRetries = layoutTry;
					result.stats.requestedSpecialCount = requestedSpecial;
					result.stats.effectiveSpecialCount = effectiveSpecial;
					result.stats.requestedLoopRatio = requestedLoop;
					result.stats.effectiveLoopRatio = effectiveLoop;
					if (layoutTry || effectiveSpecial !== requestedSpecial || effectiveLoop !== requestedLoop) {
						const parts = [];
						if (layoutTry) parts.push('layout-replan=' + layoutTry);
						if (effectiveLoop !== requestedLoop) parts.push('loop ' + requestedLoop.toFixed(2) + '→' + effectiveLoop.toFixed(2));
						if (effectiveSpecial !== requestedSpecial) parts.push('special ' + requestedSpecial + '→' + effectiveSpecial);
						result.stats.mapFallback = parts.join(', ');
						result.stats.fallbacks++;
						result.stats.fallbackDetails.push('map:' + result.stats.mapFallback);
					}
					return result;
				} catch (e) {
					lastError = e;
				}
			}
		}
		throw lastError || new Error('Map generation failed after all fallbacks');
	}

	// Computes the desired room count for a zone from area, shape and roomAreaTarget.
	_roomTarget(zone) {
		if (this._lastEngine) return this._lastEngine._roomTarget(zone);
		return new DungeonGenerator(this.cfg)._roomTarget(zone);
	}

	// Computes compact floor/room/loop/fallback statistics for a generation result.
	metrics(result) {
		if (!this._lastEngine) throw new Error('Generate a map before requesting metrics');
		return this._lastEngine.metrics(result);
	}

	// Serializes the semantic map to an ASCII grid for diagnostics and regression testing.
	toASCII(result) {
		if (!this._lastEngine) return result.map.kind.map(r => r.join('')).join('\n');
		return this._lastEngine.toASCII(result);
	}

	// Stress-runs many generated maps and aggregates validation/statistics by map size.
	static runBatch(iterations, sizes, options = {}) {
		return DungeonGenerator.runBatch(iterations, sizes, options);
	}
}
globalThis.ZoneGraphSpecValidator = ZoneGraphSpecValidator;
globalThis.RectGeometry = RectGeometry;
globalThis.GridAllocator = GridAllocator;
globalThis.ZoneGraphSpec = ZoneGraphSpec;
globalThis.ZoneLayout = ZoneLayout;
globalThis.SkirmishZoneGraphFactory = SkirmishZoneGraphFactory;
globalThis.ManualZoneLayoutPlanner = ManualZoneLayoutPlanner;
globalThis.AutomaticZoneLayoutPlanner = AutomaticZoneLayoutPlanner;
globalThis.DungeonGenerator = DungeonGenerator;
globalThis.ZoneGraphMapGenerator = ZoneGraphMapGenerator;

// Semantic portals derived from geometry. This is intentionally a separate post-pass:
// the validated v5.7 routing/BSP code above stays unchanged.

// ----- Semantic portal extraction -----

// Derives semantic door/portal candidates from generated geometry and normalizes redundant physical doors.
class DungeonPortalBuilder {

	// Builds semantic portals from room doorways, zone gates and alcoves, then suppresses redundant adjacent physical doors.
	static build(dungeon) {
		if (!dungeon || !Array.isArray(dungeon.rooms)) return [];

		const width = dungeon.map?.kind?.[0]?.length || dungeon.layout?.width || 0;
		const portals = [];
		const occupied = new Map();
		const zoneById = new Map((dungeon.zones || []).map(z => [z.id, z]));
		let seq = 0;

		const priority = {
			special_entrance: 50,
			alcove_entrance: 40,
			alcove_tunnel_entrance: 35,
			room_entrance: 30,
			zone_gate: 20
		};

		const add = portal => {
			if (portal == null || portal.x == null || portal.y == null) return null;
			if (portal.x < 0 || portal.y < 0) return null;

			const key = portal.x + ':' + portal.y;
			const prev = occupied.get(key);
			if (prev && (priority[prev.type] || 0) >= (priority[portal.type] || 0)) return prev;

			if (prev) {
				const index = portals.indexOf(prev);
				if (index >= 0) portals.splice(index, 1);
			}

			portal.id = portal.id || 'portal_' + (seq++);
			portal.doorSuitable = portal.doorSuitable !== false;
			portal.lockSuitable = portal.lockSuitable !== false;
			portal.hiddenSuitable = portal.hiddenSuitable === true;
			portals.push(portal);
			occupied.set(key, portal);
			return portal;
		};

		const xy = key => [key % width, Math.floor(key / width)];

		// Direction names are the same as in the old door system:
		// W means that the room/alcove lies east of the door, etc.
		const outsideDirection = (room, x, y) => {
			if (x === room.x - 1 && y >= room.y && y < room.y + room.h) return 'W';
			if (x === room.x + room.w && y >= room.y && y < room.y + room.h) return 'E';
			if (y === room.y - 1 && x >= room.x && x < room.x + room.w) return 'N';
			if (y === room.y + room.h && x >= room.x && x < room.x + room.w) return 'S';
			return null;
		};

		const directionToward = (door, target) => {
			if (!door || !target) return null;
			if (target.x === door.x - 1 && target.y === door.y) return 'E';
			if (target.x === door.x + 1 && target.y === door.y) return 'W';
			if (target.y === door.y - 1 && target.x === door.x) return 'S';
			if (target.y === door.y + 1 && target.x === door.x) return 'N';
			return null;
		};

		const adjacent = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
		const oppositeDirections = (a, b) => 
			(a === 'E' && b === 'W') ||
		(a === 'W' && b === 'E') ||
		(a === 'N' && b === 'S') ||
		(a === 'S' && b === 'N');

		// Alcove carving registers the tunnel attachment in anchorRoom.doorOutside.
		// Those cells belong to the alcove connection and must not later become an
		// additional generic room door.
		const alcoveOwnedRoomDoorCells = new Set();
		for (const alcove of dungeon.alcoves || []) {
			if (Array.isArray(alcove.tunnel) && alcove.tunnel.length > 0) {
				const last = alcove.tunnel[alcove.tunnel.length - 1];
				alcoveOwnedRoomDoorCells.add(last.x + ':' + last.y);
			}
			else if (alcove.door) {
				// For a direct attachment _carveAlcove() historically stores the
				// inner alcove cell in anchorRoom.doorOutside. Suppress that alias.
				alcoveOwnedRoomDoorCells.add(alcove.door.x + ':' + alcove.door.y);
			}
		}

		// SPECIAL ROOMS
		// room.specialDoor is the INNER room cell. The actual door entity belongs
		// on the unique outside doorway cell, otherwise it appears one tile deep
		// inside the room.
		for (const room of dungeon.rooms.filter(r => r.special && r.specialDoor)) {
			const zone = zoneById.get(room.zoneId);
			const type = room.roomType || zone?.specialType || zone?.role || 'special';
			let outside = null;

			if (room.doorOutside instanceof Set) {
				for (const key of room.doorOutside) {
					const [x, y] = xy(key);
					if (Math.abs(x - room.specialDoor.x) + Math.abs(y - room.specialDoor.y) === 1) {
						outside = { x, y };
						break;
					}
				}
			}

			// Defensive fallback for old/fallback-generated special rooms.
			if (!outside) {
				let side = null;
				if (room.specialDoor.y === room.y) side = 'N';
				else if (room.specialDoor.y === room.y + room.h - 1) side = 'S';
				else if (room.specialDoor.x === room.x) side = 'W';
				else if (room.specialDoor.x === room.x + room.w - 1) side = 'E';

				const delta = {
					N: [0, -1], S: [0, 1], W: [-1, 0], E: [1, 0]
				}[side];
				if (delta) {
					outside = {
						x: room.specialDoor.x + delta[0],
						y: room.specialDoor.y + delta[1]
					};
				}
			}

			if (!outside) continue;
			const direction = outsideDirection(room, outside.x, outside.y);
			if (!direction) continue;

			add({
				type: 'special_entrance',
				x: outside.x,
				y: outside.y,
				direction,
				roomId: room.id,
				zoneId: room.zoneId,
				specialType: type,
				lockedByDefault: true,
				keyId: 'special:' + room.zoneId,
				keyName: type === 'library'
					? 'Library key'
					: type === 'treasury'
					? 'Treasury key'
					: 'Special room key',
				hiddenSuitable: false
			});
		}

		// NORMAL ROOM ENTRANCES
		for (const room of dungeon.rooms.filter(r => !r.special)) {
			if (!(room.doorOutside instanceof Set)) continue;

			for (const key of room.doorOutside) {
				const [x, y] = xy(key);
				if (alcoveOwnedRoomDoorCells.has(x + ':' + y)) continue;

				const direction = outsideDirection(room, x, y);
				if (!direction) continue;

				add({
					type: 'room_entrance',
					x, y, direction,
					roomId: room.id,
					zoneId: room.zoneId,
					lockedByDefault: false,
					hiddenSuitable: false
				});
			}
		}

		// ZONE GATES
		// A gate is a macro connection between zones, not necessarily a unique
		// architectural doorway. We still create the semantic portal here, but a
		// later normalization pass suppresses its physical door if a more precise
		// room/special/alcove doorway is immediately adjacent.
		for (const gate of dungeon.gates || []) {
			const cell = gate.aCell;
			if (!cell) continue;

			add({
				type: 'zone_gate',
				x: cell.x,
				y: cell.y,
				direction: gate.aSide || null,
				gateId: gate.id,
				edgeId: gate.edgeId,
				zoneA: gate.a,
				zoneB: gate.b,
				lockedByDefault: false,
				hiddenSuitable: false
			});
		}

		// ALCOVES / NICHES
		// The room-side alcove.door is an INNER cell too. The near door therefore
		// belongs on doorOutside / tunnel[0]. A second door is useful only when a
		// real tunnel exists: length >= 3 leaves at least one floor cell between
		// the two doors. Length 0..2 gets exactly one door.
		for (const alcove of dungeon.alcoves || []) {
			const pseudoRoom = {
				x: alcove.rect.x,
				y: alcove.rect.y,
				w: alcove.rect.w,
				h: alcove.rect.h
			};
			const tunnel = Array.isArray(alcove.tunnel) ? alcove.tunnel : [];
			const near = tunnel.length > 0
				? tunnel[0]
				: (alcove.doorOutside || alcove.attachment);

			if (near) {
				add({
					type: 'alcove_entrance',
					x: near.x,
					y: near.y,
					direction: outsideDirection(pseudoRoom, near.x, near.y),
					alcoveId: alcove.id,
					alcoveType: alcove.type,
					lockedByDefault: false,
					hiddenSuitable: true
				});
			}

			if (tunnel.length >= 3 && alcove.attachment) {
				const far = tunnel[tunnel.length - 1];
				add({
					type: 'alcove_tunnel_entrance',
					x: far.x,
					y: far.y,
					direction: directionToward(far, alcove.attachment),
					alcoveId: alcove.id,
					alcoveType: alcove.type,
					lockedByDefault: false,
					hiddenSuitable: true
				});
			}
		}

		// --- Physical door normalization ---

		// 1) If a gate sits directly next to a real room/special/alcove doorway,
		// the gate door is redundant. Keep the gate metadata but do not materialize
		// a second/third door in the same one-cell connector.
		for (const gate of portals.filter(p => p.type === 'zone_gate' && p.doorSuitable)) {
			const hasAdjacentDoor = portals.some(p => 
				p !== gate &&
			p.doorSuitable &&
			p.type !== 'zone_gate' &&
			adjacent(p, gate)
			);
			if (hasAdjacentDoor) gate.doorSuitable = false;
		}

		// 2) Multiple routes may enter the same room through adjacent cells.
		// Likewise, a two-cell corridor between two rooms produces two facing
		// entrance candidates (DD). One physical door is enough in both cases.
		const roomPortals = portals.filter(p => p.type === 'room_entrance' && p.doorSuitable);
		for (let i = 0; i < roomPortals.length; i++) {
			for (let j = i + 1; j < roomPortals.length; j++) {
				const a = roomPortals[i];
				const b = roomPortals[j];
				if (!a.doorSuitable || !b.doorSuitable || !adjacent(a, b)) continue;

				if (a.roomId === b.roomId || oppositeDirections(a.direction, b.direction)) {
					b.doorSuitable = false;
				}
			}
		}

		dungeon.portals = portals;
		return portals;
	}
}
globalThis.DungeonPortalBuilder = DungeonPortalBuilder;
