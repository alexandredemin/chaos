// Production façade for the universal v5.7 dungeon generator.
// Keeps the historical GameScene contract: {width,height,ground,walls,objects}.
const MAP_GENERATOR_CONFIG = MAP_GENERATION_CONFIG;
const SECRET_PORTAL_RNG_SALT = 0x5E4C3A21;

class MapGenerator {
	constructor(cfg = {}) {
		this.cfg = { ...cfg };
		this.width = Math.max(MAP_GENERATOR_CONFIG.map.minWidth, Number.isInteger(cfg.width) ? cfg.width : MAP_GENERATOR_CONFIG.map.defaultWidth);
		this.height = Math.max(MAP_GENERATOR_CONFIG.map.minHeight, Number.isInteger(cfg.height) ? cfg.height : MAP_GENERATOR_CONFIG.map.defaultHeight);
		this.seed = Number.isInteger(cfg.seed)
			? (cfg.seed >>> 0)
			: ((Math.random() * 0x100000000) >>> 0);
	}

	generate() {
		const geometryConfig = this._buildGeometryConfig();
		const geometryGenerator = new ZoneGraphMapGenerator(geometryConfig);
		const dungeon = geometryGenerator.generate();

		DungeonPortalBuilder.build(dungeon);
		this._assignSkirmishHiddenPortals(dungeon);

		const autotiler = new MapAutotiler(this.cfg);
		const tiledMap = autotiler.build(dungeon, dungeon.portals);

		const contentGenerator = new MapContentGenerator(this.cfg, dungeon, tiledMap, this.seed);
		const content = contentGenerator.generate();

		const width = dungeon.layout?.width || this.width;
		const height = dungeon.layout?.height || this.height;
		return {
			width,
			height,
			ground: tiledMap.ground,
			walls: tiledMap.walls,
			objects: content.objects,

			// Extra metadata is ignored by current GameScene, but is intentionally
			// retained for debugging and the future ScenarioBinder.
			metadata: {
				seed: this.seed,
				zoneGraphSpec: dungeon.zoneGraphSpec,
				zoneLayout: dungeon.zoneLayout || dungeon.layout,
				zones: dungeon.zones,
				edges: dungeon.edges,
				rooms: dungeon.rooms,
				gates: dungeon.gates,
				portals: dungeon.portals,
				alcoves: dungeon.alcoves,
				generationStats: dungeon.stats,
				generationTests: dungeon.tests,
				contentStats: content.stats
			}
		};
	}


	// Marks a deterministic target fraction of alcove/niche access portals as secret.
	// Long tunnels hide the outer tunnel entrance so the whole side branch stays inaccessible until Search reveals it.
	_assignSkirmishHiddenPortals(dungeon) {
		const cfg = MAP_GENERATOR_CONFIG.skirmish.secretPassages || {};
		const rng = new RNG((this.seed ^ SECRET_PORTAL_RNG_SALT) >>> 0);
		const byAlcove = new Map();

		for (const portal of dungeon.portals || []) {
			if (!portal.doorSuitable || !portal.hiddenSuitable || !portal.alcoveId) continue;
			if (!byAlcove.has(portal.alcoveId)) byAlcove.set(portal.alcoveId, []);
			byAlcove.get(portal.alcoveId).push(portal);
		}

		const candidates = [];
		for (const portals of byAlcove.values()) {
			const outer = portals.find(p => p.type === 'alcove_tunnel_entrance');
			const near = portals.find(p => p.type === 'alcove_entrance');
			const portal = outer || near;
			if (portal) candidates.push(portal);
		}

		const markType = (alcoveType, percent, difficulty) => {
			const list = candidates.filter(p => p.alcoveType === alcoveType);
			rng.shuffle(list);
			const target = Math.max(0, Math.min(list.length, Math.round(list.length * Math.max(0, Math.min(100, percent || 0)) / 100)));
			const min = Array.isArray(difficulty) ? Math.max(0, Math.floor(difficulty[0] ?? 0)) : 0;
			const max = Array.isArray(difficulty) ? Math.max(min, Math.floor(difficulty[1] ?? min)) : min;
			for (let i = 0; i < target; i++) {
				list[i].hiddenByDefault = true;
				list[i].hiddenDifficulty = rng.int(min, max);
			}
			return target;
		};

		const hiddenAlcoves = markType('room', this.cfg.hiddenAlcovePercent ?? cfg.alcovePercent ?? 0, cfg.alcoveDifficulty);
		const hiddenNiches = markType('niche', this.cfg.hiddenNichePercent ?? cfg.nichePercent ?? 0, cfg.nicheDifficulty);
		dungeon.stats.hiddenAlcoves = hiddenAlcoves;
		dungeon.stats.hiddenNiches = hiddenNiches;
	}

	_buildGeometryConfig() {
		return {
			plannerMode: 'skirmish',
			width: this.width,
			height: this.height,
			seed: this.seed,

			// Runtime overrides stay supported; generic defaults live in mapgenerationconfig.js.
			specialCount: this.cfg.specialCount ?? MAP_GENERATOR_CONFIG.skirmish.defaultSpecialCount,
			arenaWeight: this.cfg.arenaWeight ?? MAP_GENERATOR_CONFIG.layout.arenaZone.weight,
			loopRatio: this.cfg.loopRatio ?? MAP_GENERATOR_CONFIG.geometry.loopRatio,
			zoneAttempts: this.cfg.zoneAttempts ?? MAP_GENERATOR_CONFIG.geometry.zoneAttempts,
			roomAreaTarget: this.cfg.roomAreaTarget ?? MAP_GENERATOR_CONFIG.geometry.roomAreaTarget,
			minRoomSize: this.cfg.minRoomSize ?? MAP_GENERATOR_CONFIG.geometry.minRoomSize,
			maxRoomSize: this.cfg.maxRoomSize ?? MAP_GENERATOR_CONFIG.geometry.maxRoomSize,
			maxRoomsPerZone: this.cfg.maxRoomsPerZone ?? MAP_GENERATOR_CONFIG.geometry.maxRoomsPerZone,
			specialMinRoomSize: this.cfg.specialMinRoomSize ?? MAP_GENERATOR_CONFIG.geometry.specialMinRoomSize,
			specialMaxRoomSize: this.cfg.specialMaxRoomSize ?? MAP_GENERATOR_CONFIG.geometry.specialMaxRoomSize,

			alcoveRoomCount: this.cfg.alcoveRoomCount ?? MAP_GENERATOR_CONFIG.geometry.alcoveRoomCount,
			alcoveRoomMin: this.cfg.alcoveRoomMin ?? MAP_GENERATOR_CONFIG.geometry.alcoveRoomMin,
			alcoveRoomMax: this.cfg.alcoveRoomMax ?? MAP_GENERATOR_CONFIG.geometry.alcoveRoomMax,
			alcoveRoomTunnel: this.cfg.alcoveRoomTunnel ?? MAP_GENERATOR_CONFIG.geometry.alcoveRoomTunnel,
			alcoveNicheCount: this.cfg.alcoveNicheCount ?? MAP_GENERATOR_CONFIG.geometry.alcoveNicheCount,
			alcoveNicheMin: this.cfg.alcoveNicheMin ?? MAP_GENERATOR_CONFIG.geometry.alcoveNicheMin,
			alcoveNicheMax: this.cfg.alcoveNicheMax ?? MAP_GENERATOR_CONFIG.geometry.alcoveNicheMax,
			alcoveNicheTunnel: this.cfg.alcoveNicheTunnel ?? MAP_GENERATOR_CONFIG.geometry.alcoveNicheTunnel
		};
	}
}

globalThis.MapGenerator = MapGenerator;
