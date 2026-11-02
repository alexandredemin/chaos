// Converts semantic dungeon floor/rock geometry into Chaos ground/wall tile arrays and applies wall/door autotiling rules.
const MAP_AUTOTILE_CONFIG = MAP_GENERATION_CONFIG.autotile;
class MapAutotiler {

	constructor(cfg = {}) {
		this.TILE = { FLOOR: 0, WALL: 1, ROCK: 2 };
		this.groundTile = cfg.groundTileIndex || MAP_AUTOTILE_CONFIG.groundTileIndex;
		this.wallTile = cfg.wallTileIndex || MAP_AUTOTILE_CONFIG.wallTileIndex;
		this.wallAutotileRules = WALL_AUTOTILE_RULES.slice();
		this.doorAutotileRules = DOOR_AUTOTILE_RULES.slice();
	}

	// ----- Main tiling pipeline -----

	// Builds the initial tiled map. Hidden secret portals are rendered as solid wall and receive reversible runtime tile patches.
	build(dungeon, portals = []) {
		const width = dungeon.layout?.width || dungeon.map.kind[0].length;
		const height = dungeon.layout?.height || dungeon.map.kind.length;
		this.width = width;
		this.height = height;

		const hiddenPortals = portals.filter(p => p.hiddenByDefault === true && p.doorSuitable && p.direction);
		const hiddenIds = new Set(hiddenPortals.map(p => p.id));
		const initial = this._buildState(dungeon, portals, hiddenIds);

		// Each portal stores a generic absolute tile patch. Runtime does not need to know anything about doors/autotiling.
		for (const portal of hiddenPortals) {
			const revealedIds = new Set(hiddenIds);
			revealedIds.delete(portal.id);
			const revealedState = this._buildState(dungeon, portals, revealedIds);
			portal.tilePatch = {
				hidden: this._diffStates(revealedState, initial),
				revealed: this._diffStates(initial, revealedState)
			};
		}

		return { ground: initial.ground, walls: initial.walls, tileTypeMap: initial.tileTypeMap };
	}

	// Builds one complete visual state, optionally replacing selected portal floor cells with rock/wall.
	_buildState(dungeon, portals, hiddenPortalIds = new Set()) {
		const map = this._createEmptyMap();
		const tileTypeMap = [];
		const hiddenCells = new Set();
		for (const portal of portals) if (hiddenPortalIds.has(portal.id)) hiddenCells.add(portal.x + ':' + portal.y);

		for (let y = 0; y < this.height; y++) {
			tileTypeMap[y] = [];
			for (let x = 0; x < this.width; x++) {
				const hidden = hiddenCells.has(x + ':' + y);
				const floor = !hidden && dungeon.map.kind[y][x] !== '#';
				tileTypeMap[y][x] = floor ? this.TILE.FLOOR : this.TILE.ROCK;
				map.walls[y][x] = floor ? null : this.wallTile;
			}
		}

		this._markWallsFromRock(tileTypeMap);
		this._autoTileWalls(tileTypeMap, map);
		this._autoTileAroundDoors(tileTypeMap, map, portals, hiddenPortalIds);
		return { ground: map.ground, walls: map.walls, tileTypeMap };
	}

	// Produces a runtime MapVisualSystem patch containing only cells whose rendered tile changes.
	_diffStates(fromState, toState) {
		const cells = [];
		for (let y = 0; y < this.height; y++) for (let x = 0; x < this.width; x++) {
			const groundChanged = fromState.ground[y][x] !== toState.ground[y][x];
			const wallChanged = fromState.walls[y][x] !== toState.walls[y][x];
			if (!groundChanged && !wallChanged) continue;
			const cell = {x, y};
			if (groundChanged) cell.ground = toState.ground[y][x];
			if (wallChanged) cell.wall = toState.walls[y][x];
			cells.push(cell);
		}
		return {cells};
	}

	// Developer helper: re-run both tiling stages on the currently loaded random map.
	// Saved games store final sprites, not the original F/W/R geometry. Reconstruct
	// that geometry from collision/passability and the current DoorEntity positions.
	// This does not regenerate the dungeon or change units, objects or doors.
	static retileCurrentMap(dryRun = false) {
		if (typeof map === 'undefined' || map == null ||
			typeof wallsLayer === 'undefined' || wallsLayer == null ||
			typeof entities === 'undefined' || !Array.isArray(entities)) {
			console.warn('[Autotile] Load a game first.');
			return null;
		}
		if (typeof gameSettings !== 'undefined' && gameSettings.selectedMap !== 'random') {
			console.warn('[Autotile] retileCurrentMap is intended for generated random maps only.');
			return null;
		}

		const width = map.width, height = map.height;
		const kind = [];
		for (let y = 0; y < height; y++) {
			kind[y] = [];
			for (let x = 0; x < width; x++) {
				const tile = wallsLayer.getTileAt(x,y);
				const index = tile == null ? null : tile.index;
				kind[y][x] = index == null || WALL_NO_COLLISION_TILES.has(index) ? '.' : '#';
			}
		}

		const portals = [], secretDoors = [];
		for (const entity of entities) {
			if (entity == null || entity.config?.name !== 'door' || !entity.features?.direction) continue;
			const {mapX:x,mapY:y} = entity;
			if (!Number.isInteger(x) || !Number.isInteger(y) || x<0 || y<0 || x>=width || y>=height) continue;
			kind[y][x] = '.'; // A hidden door is geometrically a floor cell, temporarily covered by rock.
			const hidden = entity.features.hidden?.hidden === true;
			const id = 'runtime-door-' + portals.length;
			portals.push({id,x,y,direction:entity.features.direction,doorSuitable:true,hiddenByDefault:hidden});
			if (entity.features.tilePatch != null) secretDoors.push({entity,id,hidden});
		}

		const tiler = new MapAutotiler();
		tiler.width = width;
		tiler.height = height;
		const dungeon = {layout:{width,height},map:{kind}};
		const hiddenIds = new Set(portals.filter(p => p.hiddenByDefault).map(p => p.id));
		const result = tiler._buildState(dungeon,portals,hiddenIds);
		const patch = {cells:[]};
		for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
			const current = wallsLayer.getTileAt(x,y);
			const oldTile = current == null ? null : current.index;
			const nextTile = result.walls[y][x];
			if (oldTile !== nextTile) patch.cells.push({x,y,wall:nextTile});
		}

		const report = {dryRun:dryRun===true,doors:portals.length,secretDoors:secretDoors.length,
			changedCells:patch.cells.length,changes:patch.cells.slice(0,40)};
		if (dryRun !== true) {
			if (typeof MapVisualSystem === 'undefined') {
				console.warn('[Autotile] MapVisualSystem is unavailable.');
				return null;
			}
			// Keep serialized secret-door patches consistent with the freshly computed sprites.
			for (const {entity,id,hidden} of secretDoors) {
				const alternative = new Set(hiddenIds);
				if (hidden) alternative.delete(id);
				else alternative.add(id);
				const otherState = tiler._buildState(dungeon,portals,alternative);
				const hiddenState = hidden ? result : otherState;
				const revealedState = hidden ? otherState : result;
				entity.features.tilePatch = {
					hidden:tiler._diffStates(revealedState,hiddenState),
					revealed:tiler._diffStates(hiddenState,revealedState)
				};
			}
			MapVisualSystem.applyPatch(patch);
		}
		console.log('[Autotile] Current map retiling:', report);
		return report;
	}

	// ----- Wall autotiling helpers -----

	// Creates ground/wall arrays initialized to the configured base tile indices.
	_createEmptyMap() {
		const ground = [], walls = [];
		for (let y = 0; y < this.height; y++) {
			ground[y] = [];
			walls[y] = [];
			for (let x = 0; x < this.width; x++) {
				ground[y][x] = this.groundTile;
				walls[y][x] = this.wallTile;
			}
		}
		return { ground, walls };
	}

	_inMapRect(x, y) { return x >= 0 && y >= 0 && x < this.width && y < this.height; }

	// Promotes rock cells touching floor into visible wall cells before autotile rule matching.
	_markWallsFromRock(tileTypeMap) {
		const dirs = [
			{x: 1, y: 0}, {x: -1, y: 0}, {x: 0, y: 1}, {x: 0, y: -1},
			{x: 1, y: 1}, {x: -1, y: -1}, {x: 1, y: -1}, {x: -1, y: 1}
		];
		for (let y = 0; y < this.height; y++) for (let x = 0; x < this.width; x++) {
			if (tileTypeMap[y][x] !== this.TILE.ROCK) continue;
			for (const d of dirs) {
				const nx = x + d.x, ny = y + d.y;
				if (!this._inMapRect(nx, ny)) continue;
				if (tileTypeMap[ny][nx] === this.TILE.FLOOR) {
					tileTypeMap[y][x] = this.TILE.WALL;
					break;
				}
			}
		}
	}

	// Matches every wall cell against WALL_AUTOTILE_RULES and writes the best tile index.
	_autoTileWalls(tileTypeMap, map) {
		for (let y = 0; y < this.height; y++) for (let x = 0; x < this.width; x++) {
			if (tileTypeMap[y][x] !== this.TILE.WALL) continue;
			const rule = this._findMatchingRule(this._buildPattern(x, y, tileTypeMap));
			if (rule) map.walls[y][x] = rule.tile;
		}
	}

	// Builds the 3x3 F/W/R neighborhood signature used by wall autotile rules.
	_buildPattern(cx, cy, tileTypeMap) {
		let result = '';
		for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) result += this._tileToSymbol(tileTypeMap, cx + dx, cy + dy);
		return result;
	}

	// Converts a tile type into the F/W/R symbol consumed by autotile pattern matching.
	_tileToSymbol(tileTypeMap, x, y) {
		if (!this._inMapRect(x, y)) return 'R';
		if (tileTypeMap[y][x] === this.TILE.FLOOR) return 'F';
		if (tileTypeMap[y][x] === this.TILE.WALL) return 'W';
		return 'R';
	}

	// Returns the highest-scoring wall rule matching a 3x3 neighborhood pattern.
	_findMatchingRule(pattern) {
		let bestRule = null, bestScore = -Infinity;
		for (const rule of this.wallAutotileRules) {
			if (!this._matchPattern(pattern, rule.pattern)) continue;
			const score = rule.score ?? 0;
			if (score > bestScore) {
				bestScore = score;
				bestRule = rule;
			}
		}
		return bestRule;
	}

	// Tests a neighborhood signature against one wildcard-capable autotile rule.
	_matchPattern(actual, rule) {
		for (let i = 0; i < 9; i++) {
			if (rule[i] === '*') continue;
			if (actual[i] !== rule[i]) return false;
		}
		return true;
	}

	// ----- Door-aware cell-based post-autotiling -----

	// Reads the completed wall result, but never reads tiles changed by this pass.
	// Thus the order of the semantic portals cannot affect the final sprites.
	_autoTileAroundDoors(tileTypeMap, map, portals, hiddenPortalIds = new Set()) {
		const doors = new Map();
		const candidates = new Set();
		for (const portal of portals) {
			if (!portal.doorSuitable || !portal.direction || hiddenPortalIds.has(portal.id)) continue;
			if (!this._inMapRect(portal.x, portal.y)) continue;
			const key = portal.y * this.width + portal.x;
			doors.set(key, portal.direction);
			for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
				const x = portal.x + dx, y = portal.y + dy;
				if (this._inMapRect(x,y)) candidates.add(y * this.width + x);
			}
		}

		if (doors.size === 0) return;
		const baseWalls = map.walls.map(row => row.slice());
		for (const index of candidates) {
			const x = index % this.width, y = Math.floor(index / this.width);
			const pattern = this._buildDoorPattern(x, y, tileTypeMap, doors);
			const originalTile = baseWalls[y][x] ?? 0;
			let bestRule = null, bestScore = -Infinity;
			for (const rule of this.doorAutotileRules) {
				if (rule.fromTile != null && rule.fromTile !== originalTile) continue;
				if (!this._matchDoorPattern(pattern, rule.pattern)) continue;
				const score = rule.score ?? 0;
				if (score > bestScore) {bestScore = score; bestRule = rule;}
			}
			if (bestRule != null) map.walls[y][x] = bestRule.tile;
		}
	}

	_buildDoorPattern(cx,cy,tileTypeMap,doors) {
		let result = '';
		for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
			const x=cx+dx,y=cy+dy;
			const direction = this._inMapRect(x,y) ? doors.get(y*this.width+x) : null;
			result += direction ? direction.toLowerCase() : this._tileToSymbol(tileTypeMap,x,y);
		}
		return result;
	}

	// H/V group door orientations, while n/s/e/w can match an exact direction.
	_matchDoorPattern(actual,rule) {
		for (let i=0;i<9;i++) {
			const expected=rule[i],symbol=actual[i];
			if (expected === '*') continue;
			if (expected === 'V' && (symbol === 'n' || symbol === 's')) continue;
			if (expected === 'H' && (symbol === 'e' || symbol === 'w')) continue;
			if (expected === 'D' && 'nsew'.includes(symbol)) continue;
			if (expected !== symbol) return false;
		}
		return true;
	}

}

globalThis.MapAutotiler = MapAutotiler;
// DevTools: retileCurrentMap(true) previews; retileCurrentMap() applies without regenerating the map.
globalThis.retileCurrentMap = (dryRun=false) => MapAutotiler.retileCurrentMap(dryRun);
