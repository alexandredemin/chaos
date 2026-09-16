// Production façade for the universal v5.7 dungeon generator.
// Keeps the historical GameScene contract: {width,height,ground,walls,objects}.
class MapGenerator {
	constructor(cfg = {}) {
		this.cfg = { ...cfg };
		this.width = Math.max(20, Number.isInteger(cfg.width) ? cfg.width : 20);
		this.height = Math.max(20, Number.isInteger(cfg.height) ? cfg.height : 20);
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

			// v5.7 defaults. All may be overridden from randomMapConfig later.
			// Keep the current game's four-special-room skirmish density by default.
			specialCount: this.cfg.specialCount ?? 4,
			arenaWeight: this.cfg.arenaWeight ?? 4,
			loopRatio: this.cfg.loopRatio ?? .15,
			zoneAttempts: this.cfg.zoneAttempts ?? 40,
			roomAreaTarget: this.cfg.roomAreaTarget ?? 68,
			minRoomSize: this.cfg.minRoomSize ?? 4,
			maxRoomSize: this.cfg.maxRoomSize ?? 14,
			maxRoomsPerZone: this.cfg.maxRoomsPerZone ?? 12,
			specialMinRoomSize: this.cfg.specialMinRoomSize ?? 4,
			specialMaxRoomSize: this.cfg.specialMaxRoomSize ?? 7,

			alcoveRoomCount: this.cfg.alcoveRoomCount ?? 2,
			alcoveRoomMin: this.cfg.alcoveRoomMin ?? 2,
			alcoveRoomMax: this.cfg.alcoveRoomMax ?? 3,
			alcoveRoomTunnel: this.cfg.alcoveRoomTunnel ?? 4,
			alcoveNicheCount: this.cfg.alcoveNicheCount ?? 3,
			alcoveNicheMin: this.cfg.alcoveNicheMin ?? 1,
			alcoveNicheMax: this.cfg.alcoveNicheMax ?? 2,
			alcoveNicheTunnel: this.cfg.alcoveNicheTunnel ?? 1
		};
	}
}

globalThis.MapGenerator = MapGenerator;
