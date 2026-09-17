// Production façade for the universal v5.7 dungeon generator.
// Keeps the historical GameScene contract: {width,height,ground,walls,objects}.
const MAP_GENERATOR_CONFIG = MAP_GENERATION_CONFIG;

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
