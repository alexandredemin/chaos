class MapGenerator {
    constructor(cfg) {
        this.width = cfg.width;
        this.height = cfg.height;

        this.groundTile = cfg.groundTileIndex || 129;
        this.wallTile = cfg.wallTileIndex || 34;

        this.minRoomSize = cfg.minRoomSize || 4;
        this.maxRoomSize = cfg.maxRoomSize || 14;

        this.bspMaxDepth = cfg.bspMaxDepth || 8;
        this.bspSplitChance = cfg.bspSplitChance || 0.85;     // probability to continue splitting
        this.bspBalancedSplit = cfg.bspBalancedSplit || [0.4, 0.6]; // preferred split ratio

        this.branchChance = cfg.branchChance || 0.1; // basic probability for creating a branch    
        this.alcoveChance = cfg.alcoveChance || 1.0; // probability to create small alcove at the end of branch
        this.maxBranchLen = cfg.maxBranchLength || 12; // max length of branch

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

        // 4) generate branching corridors
        this._generateBranchingCorridors(map);

        // 5) auto-tile walls
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

    _inBounds(x, y) {
        return x > 0 && y > 0 && x < this.width - 1 && y < this.height - 1;
    }

    _isRoom(x, y) {
        if (!this.rooms || this.rooms.length === 0) return false;
        for (let i = 0; i < this.rooms.length; i++) {
            const r = this.rooms[i];
            if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) {
                return true;
            }
        }
        return false;
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

        const { minRoomSize, bspSplitChance, bspMaxDepth, bspBalancedSplit } = this;

        if (depth >= bspMaxDepth) {
            this.bspNodes.push(node);
            return node;
        }

        /*
        const stopChance = Math.min(1.0 - bspSplitChance + depth * 0.1, 0.6);
        if (Math.random() < stopChance) {
            this.bspNodes.push(node);
            return node;
        }
        */
        if (Math.random() > bspSplitChance) {
            this.bspNodes.push(node);
            return node;
        }

        const canSplitVert = rect.w >= minRoomSize * 2 + 2;
        const canSplitHorz = rect.h >= minRoomSize * 2 + 2;

        if (!canSplitVert && !canSplitHorz) {
            this.bspNodes.push(node);
            return node;
        }

        let splitVertically;

        if (canSplitVert && canSplitHorz) {
            splitVertically = Math.random() < 0.5;
        } else {
            splitVertically = canSplitVert;
        }

        const [minR, maxR] = bspBalancedSplit;
        const ratio = minR + Math.random() * (maxR - minR);

        if (splitVertically) {
            const splitX = Math.floor(rect.x + rect.w * ratio);

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
            const splitY = Math.floor(rect.y + rect.h * ratio);

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

    //--- branching corridors ---
    _generateBranchingCorridors(map) {
        const width  = this.width;
        const height = this.height;

        // collect corridor cells
        const corridorCells = [];
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                if (map.walls[y][x] === null && this._isCorridor(x, y, map)) {
                    corridorCells.push({x, y});
                }
            }
        }

        for (let cell of corridorCells) {
            if (Math.random() > this.branchChance) continue;

            const dir = this._chooseDirection(cell.x, cell.y, map);
            if (!dir) continue;

            let isAlcove = Math.random() < this.alcoveChance;

            // determine branch depth
            let depth;
            if (isAlcove) {
                depth = 2 + Math.floor(Math.random() * (this.maxBranchLen - 2));
                const depthToAlcove = this._depthToAlcove(cell.x, cell.y, map, dir, depth);
                if(depthToAlcove >= 3) depth = depthToAlcove;
                else isAlcove = false; // cannot make alcove here
            } else {
                depth = 1 + Math.floor(Math.random() * this.maxBranchLen);
            }

            let cx = cell.x;
            let cy = cell.y;

            let i;
            for (i = 0; i < depth; i++) {
                cx += dir.x;
                cy += dir.y;

                if (!this._inBounds(cx, cy)) break;
                if (this._isRoom(cx, cy)) break;
                if (map.walls[cy][cx] === null) break;

                map.walls[cy][cx] = null;
                map.ground[cy][cx] = this.groundTile + 1;
            }

            if (isAlcove && depth >= 3) {
                this._digMiniRoom(cx, cy, map);
            }
        }
    }

    _isCorridor(x, y, map) {
        // a floor tile with 2 or fewer neighboring floor tiles
        let n = 0;
        const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
        for (let d of dirs) {
            if (map.walls[y + d[1]][x + d[0]] === null) n++;
        }
        return n <= 2;
    }

    _chooseDirection(x, y, map) {
        const dirs = [
            {x: 1,  y: 0},
            {x: -1, y: 0},
            {x: 0,  y: 1},
            {x: 0,  y: -1}
        ];
        let possibleDirs = [];
        for (let d of dirs) {
            const nx = x + d.x;
            const ny = y + d.y;
            if (!this._inBounds(nx, ny)) continue;
            if(d.x === 0 && (map.walls[ny][nx-1] !== this.wallTile || map.walls[ny][nx] !== this.wallTile || map.walls[ny][nx+1] !== this.wallTile)) continue;
            if(d.y === 0 && (map.walls[ny-1][nx] !== this.wallTile || map.walls[ny][nx] !== this.wallTile || map.walls[ny+1][nx] !== this.wallTile)) continue;
            possibleDirs.push(d);
        }
        if (possibleDirs.length > 0) return possibleDirs[Math.floor(Math.random() * possibleDirs.length)];
        return null;
    }

    _depthToAlcove(cx, cy, map, dir, maxDepth) {
        let depth = 0;
        let i;
        for (i = 0; i < maxDepth; i++) {
            cx += dir.x;
            cy += dir.y;
            depth++;
            if (!this._inBounds(cx, cy)) break;
            if (this._isRoom(cx, cy)) break;
            if (map.walls[cy][cx] === null) break;
        }
        for (i = depth; i > 2; i--) {
            if (this._isSuitableForAlcove(cx, cy, map)) return depth;
            cx -= dir.x;
            cy -= dir.y;
            depth--;
        }
        return depth;
    }

    _isSuitableForAlcove(cx, cy, map) {
        const r = 2;
        for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
                const nx = cx + dx;
                const ny = cy + dy;
                if (!this._inBounds(nx, ny)) return false;
                if (map.walls[ny][nx] === null) return false;
            }
        }
        return true;
    }

    _digMiniRoom(cx, cy, map) {
        const r = 1; // radius 1 => room size 3x3

        for (let y = -r; y <= r; y++) {
            for (let x = -r; x <= r; x++) {
                let nx = cx + x;
                let ny = cy + y;
                if (!this._inBounds(nx, ny)) continue;
                map.walls[ny][nx] = null;
                map.ground[ny][nx] = this.groundTile + 2;
            }
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