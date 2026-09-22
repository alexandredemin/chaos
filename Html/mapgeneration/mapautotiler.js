// Converts semantic dungeon floor/rock geometry into Chaos ground/wall tile arrays and applies wall/door autotiling rules.
const MAP_AUTOTILE_CONFIG = MAP_GENERATION_CONFIG.autotile;
class MapAutotiler {

	constructor(cfg = {}) {
		this.TILE = { FLOOR: 0, WALL: 1, ROCK: 2 };
		this.groundTile = cfg.groundTileIndex || MAP_AUTOTILE_CONFIG.groundTileIndex;
		this.wallTile = cfg.wallTileIndex || MAP_AUTOTILE_CONFIG.wallTileIndex;
		this.wallAutotileRules = WALL_AUTOTILE_RULES.slice();
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
		for (const portal of portals) {
			if (!portal.doorSuitable || !portal.direction || hiddenPortalIds.has(portal.id)) continue;
			this._applyDoorAutotileRules(portal.x, portal.y, portal.direction, map);
		}
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

	// ----- Door-specific tile corrections -----

	// Applies local wall-tile replacements around one semantic door portal.
	_applyDoorAutotileRules(x, y, dir, map) {
		for (const rule of DOOR_AUTOTILE_RULES) {
			if (!rule.directions.includes(dir)) continue;
			for (const offset of rule.offsets) {
				const tx = x + offset.dx, ty = y + offset.dy;
				if (!this._inMapRect(tx, ty)) continue;
				let currentTile = map.walls[ty][tx];
				if (currentTile === null) currentTile = 0;
				if (Object.prototype.hasOwnProperty.call(offset.replacements, currentTile)) map.walls[ty][tx] = offset.replacements[currentTile];
			}
		}
	}
}

globalThis.MapAutotiler = MapAutotiler;
