class MapGenerator {
    constructor(cfg) {
        this.width = cfg.width;
        this.height = cfg.height;

        this.groundTileIndex = cfg.groundTileIndex || 129;
        this.wallTileIndex = cfg.wallTileIndex || 34;
    }

    generate() {
        const mapData = {
            width: this.width,
            height: this.height,
            ground: [],
            walls: [],
            objects: []
        };

        // --- create 2D arrays ---
        for (let y = 0; y < this.height; y++) {
            mapData.ground[y] = [];
            mapData.walls[y] = [];
            for (let x = 0; x < this.width; x++) {
                mapData.ground[y][x] = this.groundTileIndex;
                mapData.walls[y][x] = null;
            }
        }

        // --- walls border ---
        for (let x = 0; x < this.width; x++) {
            mapData.walls[0][x] = this.wallTileIndex;
            mapData.walls[this.height - 1][x] = this.wallTileIndex;
        }
        for (let y = 0; y < this.height; y++) {
            mapData.walls[y][0] = this.wallTileIndex;
            mapData.walls[y][this.width - 1] = this.wallTileIndex;
        }

        // --- start positions ---
        mapData.objects.push(
            { name: "start", x: 16 * 1, y: 16 * 1 },
            { name: "start", x: 16 * (this.width - 2), y: 16 * 1 },
            { name: "start", x: 16 * 1, y: 16 * (this.height - 2) },
            { name: "start", x: 16 * (this.width - 2), y: 16 * (this.height - 2) }
        );

        return mapData;
    }
}