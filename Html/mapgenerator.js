class MapGenerator {
    constructor(cfg) {
        this.width = cfg.width;
        this.height = cfg.height;

        this.groundTile = cfg.groundTileIndex || 129;
        this.wallTile = cfg.wallTileIndex || 34;

        this.minRoomSize = cfg.minRoomSize || 6;
        this.maxRoomSize = cfg.maxRoomSize || 14;

        this.rooms = [];
        this.bspNodes = [];
    }

    generate() {
        const map = this._createEmptyMap();

        // 1) BSP split
        const root = this._bspSplit({
            x: 1,
            y: 1,
            w: this.width - 2,
            h: this.height - 2
        });

        // 2) generate rooms
        this._generateRooms(root, map);

        // 3) generate corridors
        this._connectRooms(root, map);

        // 4) auto-tile walls
        this._autoTileWalls(map);

        // start positions
        const objects = this._generateStartPositions();

        return {
            width: this.width,
            height: this.height,
            ground: map.ground,
            walls: map.walls,
            objects
        };
    }

    // --- auxiliary methods ---
    _rand(a, b) {
        return Math.floor(Math.random() * (b - a + 1)) + a;
    }

    //--- create empty map ---
    _createEmptyMap() {
        const ground = [];
        const walls = [];
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

    //--- BSP split ---
    _bspSplit(rect, depth = 0) {
        const node = {
            rect,
            left: null,
            right: null,
            room: null
        };

        const canSplitH = rect.h >= this.minRoomSize * 2 + 2;
        const canSplitV = rect.w >= this.minRoomSize * 2 + 2;

        if (!canSplitH && !canSplitV) {
            this.bspNodes.push(node);
            return node;
        }

        const splitVert = canSplitV && (!canSplitH || Math.random() < 0.5);

        if (splitVert) {
            const splitX = Math.floor(rect.x + rect.w / 2);
            node.left = this._bspSplit({
                x: rect.x,
                y: rect.y,
                w: splitX - rect.x,
                h: rect.h
            }, depth + 1);

            node.right = this._bspSplit({
                x: splitX,
                y: rect.y,
                w: rect.x + rect.w - splitX,
                h: rect.h
            }, depth + 1);
        } else {
            const splitY = Math.floor(rect.y + rect.h / 2);
            node.left = this._bspSplit({
                x: rect.x,
                y: rect.y,
                w: rect.w,
                h: splitY - rect.y
            }, depth + 1);

            node.right = this._bspSplit({
                x: rect.x,
                y: splitY,
                w: rect.w,
                h: rect.y + rect.h - splitY
            }, depth + 1);
        }

        return node;
    }

    //--- generate rooms ---
    _generateRooms(node, map) {
        if (!node.left && !node.right) {
            const margin = 1; // to avoid rooms touching walls

            const roomW = this._rand(this.minRoomSize, Math.min(node.rect.w - margin * 2, this.maxRoomSize));
            const roomH = this._rand(this.minRoomSize, Math.min(node.rect.h - margin * 2, this.maxRoomSize));

            const roomX = this._rand(node.rect.x + margin, node.rect.x + node.rect.w - roomW - margin);
            const roomY = this._rand(node.rect.y + margin, node.rect.y + node.rect.h - roomH - margin);

            node.room = { x: roomX, y: roomY, w: roomW, h: roomH };
            this.rooms.push(node.room);

            // carve ground
            for (let y = roomY; y < roomY + roomH; y++) {
                for (let x = roomX; x < roomX + roomW; x++) {
                    map.walls[y][x] = null;
                }
            }
        } else {
            if (node.left) this._generateRooms(node.left, map);
            if (node.right) this._generateRooms(node.right, map);
        }
    }

    //--- connect rooms ---
   _connectRooms(node, map) {
        if (!node.left || !node.right) return;

        const roomA = this._getRoom(node.left);
        const roomB = this._getRoom(node.right);

        // main corridor
        this._connectTwoRooms(roomA, roomB, map);

        // additional corridors with some probability
        if (Math.random() < 0.3) {
            this._connectTwoRooms(roomA, roomB, map);
        }

        this._connectRooms(node.left, map);
        this._connectRooms(node.right, map);
    }

    _connectTwoRooms(roomA, roomB, map) {
        const x1 = this._rand(roomA.x, roomA.x + roomA.w - 1);
        const y1 = this._rand(roomA.y, roomA.y + roomA.h - 1);

        const x2 = this._rand(roomB.x, roomB.x + roomB.w - 1);
        const y2 = this._rand(roomB.y, roomB.y + roomB.h - 1);

        this._carveCorridor(map, x1, y1, x2, y2);
    }

    _getRoom(node) {
        if (node.room) return node.room;
        if (node.left) return this._getRoom(node.left);
        if (node.right) return this._getRoom(node.right);
        return null;
    }

    _carveCorridor(map, x1, y1, x2, y2) {
        if (Math.random() < 0.5) {
            this._hLine(map, x1, x2, y1);
            this._vLine(map, y1, y2, x2);
        } else {
            this._vLine(map, y1, y2, x1);
            this._hLine(map, x1, x2, y2);
        }
    }

    _hLine(map, x1, x2, y) {
        for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
            map.walls[y][x] = null;
        }
    }

    _vLine(map, y1, y2, x) {
        for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
            map.walls[y][x] = null;
        }
    }

    //--- auto-tiling ---
    _autoTileWalls(map) {
        for (let y = 1; y < this.height - 1; y++) {
            for (let x = 1; x < this.width - 1; x++) {
                if (map.walls[y][x] !== null) {
                    // If below is floor but this tile is wall -> use wall-top tile
                    if (map.walls[y + 1][x] === null) {
                        map.walls[y][x] = this.wallTile + 1; // just example variant
                    }
                }
            }
        }
    }

    //--- start positions ---
    _generateStartPositions() {
        // just place in first 4 rooms
        const objects = [];

        for (let i = 0; i < Math.min(4, this.rooms.length); i++) {
            const r = this.rooms[i];
            objects.push({
                name: "start",
                x: (16 * (r.x + Math.floor(r.w / 2))),
                y: (16 * (r.y + Math.floor(r.h / 2)))
            });
        }
        return objects;
    }

}