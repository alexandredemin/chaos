class MapGenerator {
    constructor(cfg) {
        this.TILE = {
            FLOOR: 0,
            WALL: 1,
            ROCK: 2
        };

        this.width = cfg.width;
        this.height = cfg.height;

        this.groundTile = cfg.groundTileIndex || 2;
        this.wallTile = cfg.wallTileIndex || 1;

        this.minRoomSize = cfg.minRoomSize || 4;
        this.maxRoomSize = cfg.maxRoomSize || 14;

        this.minRooms = cfg.minRooms || 8;
        this.maxRooms = cfg.maxRooms || 32;

        this.bspMaxDepth = cfg.bspMaxDepth || 8;
        this.bspSplitChance = cfg.bspSplitChance || 0.85;     // probability to continue splitting
        this.bspBalancedSplit = cfg.bspBalancedSplit || [0.4, 0.6]; // preferred split ratio

        this.branchChance = cfg.branchChance || 0.1; // basic probability for creating a branch    
        this.alcoveChance = cfg.alcoveChance || 1.0; // probability to create small alcove at the end of branch
        this.maxBranchLen = cfg.maxBranchLength || 12; // max length of branch

        this.rooms = [];
        this.bspNodes = [];

        this.wallAutotileRules = WALL_AUTOTILE_RULES.slice();
    }

    generate() {
        const map = this._createEmptyMap();

        this.bspNodes = [];

        // 1) BSP split
        const rootRect = {
            x: 1,
            y: 1,
            w: this.width - 2,
            h: this.height - 2
        }

        const { zones, connections }  = this._buildInitialLayout(rootRect);

        for (let node of zones) {
            this._bspSplit(node);
        }

        // 2) generate rooms
        this._generateRooms(zones, map)

        // 3) generate corridors
        this._connectRooms(zones, map);

        // 4) connect zones
        this._connectZones(connections, map);

        // 5) generate branching corridors
        //this._generateBranchingCorridors(map);

        // 6) auto-tile walls
        this._autoTile(map);

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

    _inMapRect(x, y) {
        return x >= 0 && y >= 0 && x < this.width && y < this.height;
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

    _countWildcards(pattern) {
        return (pattern.match(/\*/g) || []).length;
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

    //--- build initial layout ---
    _buildInitialLayout(rootRect) {
        const zones = [];
        const connections = [];

        /*
        const rootNode = {
            rect: rootRect,
            depth: 0,
            left: null,
            right: null,
            room: null,
            reserved: false,
            allowSplit: true
        };
        zones.push(rootNode);

        return { zones, connections };
        */

        // --- central arena ---
        const arenaW = Math.floor(rootRect.w * 0.5);
        const arenaH = Math.floor(rootRect.h * 0.5);

        const arenaRect = {
            x: rootRect.x + Math.floor((rootRect.w - arenaW) / 2),
            y: rootRect.y + Math.floor((rootRect.h - arenaH) / 2),
            w: arenaW,
            h: arenaH
        };

        const arenaRoom = {
            x: arenaRect.x + 1,
            y: arenaRect.y + 1,
            w: arenaRect.w - 2,
            h: arenaRect.h - 2
        };

        const arenaNode = {
            id: "arena",
            rect: arenaRect,
            depth: 0,
            left: null,
            right: null,
            room: arenaRoom,
            reserved: true,
            roomType: "arena",
            allowSplit: false
        };

        zones.push(arenaNode);

        // surrounding regions
        const regions = this._subtractRect(rootRect, arenaRect);

        for (let i = 0; i < regions.length; i++) {
            zones.push({
                id: `zone_${i}`,
                rect: regions[i],
                depth: 0,
                left: null,
                right: null,
                room: null,
                reserved: false,
                allowSplit: true
            });
        }

        // auto-generate connections
        for (const zone of zones) {
            if (zone === arenaNode) continue;

            if (this._rectsTouch(arenaNode.rect, zone.rect)) {
                connections.push([arenaNode, zone]);
            }
        }

        return { zones, connections };
    }

    _subtractRect(outer, inner) {
        const result = [];

        const ox = outer.x;
        const oy = outer.y;
        const ow = outer.w;
        const oh = outer.h;

        const ix = inner.x;
        const iy = inner.y;
        const iw = inner.w;
        const ih = inner.h;

        // --- TOP ---
        const topH = iy - oy;
        if (topH > 0) {
            result.push({
                x: ox,
                y: oy,
                w: ow,
                h: topH
            });
        }

        // --- BOTTOM ---
        const bottomY = iy + ih;
        const bottomH = (oy + oh) - bottomY;
        if (bottomH > 0) {
            result.push({
                x: ox,
                y: bottomY,
                w: ow,
                h: bottomH
            });
        }

        // --- LEFT ---
        const leftW = ix - ox;
        if (leftW > 0) {
            result.push({
                x: ox,
                y: iy,
                w: leftW,
                h: ih
            });
        }

        // --- RIGHT ---
        const rightX = ix + iw;
        const rightW = (ox + ow) - rightX;
        if (rightW > 0) {
            result.push({
                x: rightX,
                y: iy,
                w: rightW,
                h: ih
            });
        }

        return result;
    }

    _rectsTouch(a, b) {
        const ax2 = a.x + a.w;
        const ay2 = a.y + a.h;
        const bx2 = b.x + b.w;
        const by2 = b.y + b.h;

        const overlapX = a.x < bx2 && ax2 > b.x;
        const overlapY = a.y < by2 && ay2 > b.y;

        const touchVert = (ax2 === b.x || bx2 === a.x) && overlapY;

        const touchHorz = (ay2 === b.y || by2 === a.y) && overlapX;

        return touchVert || touchHorz;
    }

    //--- BSP split ---
    _bspSplit(rootNode) {
        const {
            minRoomSize,
            bspSplitChance,
            bspMaxDepth,
            bspBalancedSplit,
            minRooms,
            maxRooms
        } = this;

        const queue = [];
        queue.push(rootNode);

        while (queue.length > 0) {
            const node = queue.shift();
            const { rect, depth, reserved, allowSplit } = node;

            // --- hard stop conditions ---
            if (reserved === true || allowSplit === false) {
                this.bspNodes.push(node);
                continue;
            }

            if (depth >= bspMaxDepth) {
                this.bspNodes.push(node);
                continue;
            }

            const canSplitVert = rect.w >= minRoomSize * 2 + 2;
            const canSplitHorz = rect.h >= minRoomSize * 2 + 2;
            const canSplit = canSplitVert || canSplitHorz;

            if (!canSplit) {
                this.bspNodes.push(node);
                continue;
            }

            // --- room count control ---
            const currentRooms = this.bspNodes.length + queue.length;
            const needMoreRooms = currentRooms < minRooms;
            const reachedMaxRooms = currentRooms >= maxRooms;

            if (reachedMaxRooms) {
                this.bspNodes.push(node);
                continue;
            }

            if (!needMoreRooms && Math.random() > bspSplitChance) {
                this.bspNodes.push(node);
                continue;
            }

            // --- choose split direction ---
            let splitVertically;
            if (canSplitVert && canSplitHorz) {
                splitVertically = Math.random() < 0.5;
            } else {
                splitVertically = canSplitVert;
            }

            const [minR, maxR] = bspBalancedSplit;
            const ratio = minR + Math.random() * (maxR - minR);

            // --- perform split ---
            if (splitVertically) {
                const splitX = Math.floor(rect.x + rect.w * ratio);

                const leftRect = {
                    x: rect.x,
                    y: rect.y,
                    w: splitX - rect.x,
                    h: rect.h
                };

                const rightRect = {
                    x: splitX,
                    y: rect.y,
                    w: rect.x + rect.w - splitX,
                    h: rect.h
                };

                node.left = {
                    rect: leftRect,
                    depth: depth + 1,
                    left: null,
                    right: null,
                    room: null,
                    reserved: false,
                    allowSplit: true
                };

                node.right = {
                    rect: rightRect,
                    depth: depth + 1,
                    left: null,
                    right: null,
                    room: null,
                    reserved: false,
                    allowSplit: true
                };

            } else {
                const splitY = Math.floor(rect.y + rect.h * ratio);

                const leftRect = {
                    x: rect.x,
                    y: rect.y,
                    w: rect.w,
                    h: splitY - rect.y
                };

                const rightRect = {
                    x: rect.x,
                    y: splitY,
                    w: rect.w,
                    h: rect.y + rect.h - splitY
                };

                node.left = {
                    rect: leftRect,
                    depth: depth + 1,
                    left: null,
                    right: null,
                    room: null,
                    reserved: false,
                    allowSplit: true
                };

                node.right = {
                    rect: rightRect,
                    depth: depth + 1,
                    left: null,
                    right: null,
                    room: null,
                    reserved: false,
                    allowSplit: true
                };
            }

            queue.push(node.left);
            queue.push(node.right);
        }
    }

    //--- generate rooms ---
    _generateRooms(nodes, map) {
        for (const node of nodes) {
            this._generateRoomsFromNode(node, map);
        }
    }

    _generateRoomsFromNode(node, map) {
        if (!node.left && !node.right) {

            if (node.reserved && node.room) {
                this.rooms.push(node.room);

                for (let y = node.room.y; y < node.room.y + node.room.h; y++) {
                    for (let x = node.room.x; x < node.room.x + node.room.w; x++) {
                        map.walls[y][x] = null;
                        map.ground[y][x] = this.groundTile;
                    }
                }
                return;
            }

            const margin = 1; //to avoid rooms touching walls

            const maxW = Math.min(node.rect.w - margin * 2, this.maxRoomSize);
            const maxH = Math.min(node.rect.h - margin * 2, this.maxRoomSize);

            const roomW = this._rand(this.minRoomSize, maxW);
            const roomH = this._rand(this.minRoomSize, maxH);

            const roomX = this._rand(
                node.rect.x + margin,
                node.rect.x + node.rect.w - roomW - margin
            );

            const roomY = this._rand(
                node.rect.y + margin,
                node.rect.y + node.rect.h - roomH - margin
            );

            node.room = { x: roomX, y: roomY, w: roomW, h: roomH };
            this.rooms.push(node.room);

            for (let y = roomY; y < roomY + roomH; y++) {
                for (let x = roomX; x < roomX + roomW; x++) {
                    map.walls[y][x] = null;
                }
            }

            return;
        }

        if (node.left) this._generateRoomsFromNode(node.left, map);
        if (node.right) this._generateRoomsFromNode(node.right, map);
    }


    //--- connect rooms ---
    _connectRooms(nodes, map) {
        for (const node of nodes) {
            this._connectRoomsFromNode(node, map);
        }
    }

    _connectRoomsFromNode(node, map) {
        if (!node.left || !node.right) return;

        const roomA = this._getRoom(node.left);
        const roomB = this._getRoom(node.right);

        if (roomA && roomB) {
            // main corridor
            this._connectTwoRooms(roomA, roomB, map);

            // additional corridors with some probability
            if (Math.random() < 0.3) {
                this._connectTwoRooms(roomA, roomB, map);
            }
        }

        this._connectRoomsFromNode(node.left, map);
        this._connectRoomsFromNode(node.right, map);
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

    //--- connect zones ---
    _connectZones(connections, map) {
        for (const [zoneA, zoneB] of connections) {

            const roomsA = this._getRoomsFromNode(zoneA);
            const roomsB = this._getRoomsFromNode(zoneB);

            if (roomsA.length === 0 || roomsB.length === 0) continue; // nothing to connect

            let bestPair = null;
            let bestDist = Infinity;

            for (const roomA of roomsA) {
                const ca = this._roomCenter(roomA);

                for (const roomB of roomsB) {
                    const cb = this._roomCenter(roomB);

                    const dx = ca.x - cb.x;
                    const dy = ca.y - cb.y;
                    const dist = dx * dx + dy * dy; // squared distance

                    if (dist < bestDist) {
                        bestDist = dist;
                        bestPair = { roomA, roomB };
                    }
                }
            }

            if (!bestPair) continue;

            // carve corridor between chosen rooms
            this._connectTwoRooms(bestPair.roomA, bestPair.roomB, map);
        }
    }

    _getRoomsFromNode(node, result = []) {
        if (!node) return result;
        if (node.room) result.push(node.room);
        if (node.left) this._getRoomsFromNode(node.left, result);
        if (node.right) this._getRoomsFromNode(node.right, result);
        return result;
    }

    _roomCenter(room) {
        return {
            x: room.x + Math.floor(room.w / 2),
            y: room.y + Math.floor(room.h / 2)
        };
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
            let achivedGround = false;
            let i;
            for (i = 0; i < depth; i++) {
                cx += dir.x;
                cy += dir.y;

                if (!this._inBounds(cx, cy)) break;
                if (this._isRoom(cx, cy)) break;
                if (map.walls[cy][cx] === null) break;

                map.walls[cy][cx] = null;
                map.ground[cy][cx] = this.groundTile + 1;
                if(achivedGround) map.ground[cy][cx] = this.groundTile + 3;

                // check for not right angle connections
                let notRightAngle = false;
                if(dir.x === 0 && map.walls[cy+dir.y][cx+dir.x] !== null && (
                    (map.walls[cy+dir.y][cx-1] !== this.wallTile && map.walls[cy][cx-1] !== null) || 
                    (map.walls[cy+dir.y][cx+1] !== this.wallTile && map.walls[cy][cx+1] !== null)
                    )) notRightAngle = true;
                if(dir.y === 0 && map.walls[cy+dir.y][cx+dir.x] !== null && (
                    (map.walls[cy-1][cx+dir.x] !== this.wallTile && map.walls[cy-1][cx] !== null) ||
                    (map.walls[cy+1][cx+dir.x] !== this.wallTile && map.walls[cy+1][cx] !== null)
                    )) notRightAngle = true;

                if(notRightAngle){
                    achivedGround = true;
                    depth++; // extend corridor to fix angle
                    continue;
                }
                if(achivedGround) break;
            }
            // create alcove room at the end of branch
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
    _autoTile(map) {
        const tileTypeMap = this._buildTileTypeMap(map);
        this._markWallsFromRock(tileTypeMap);
        this._autoTileWalls(tileTypeMap,map);
    }

    _buildTileTypeMap(map) {
        const types = [];

        for (let y = 0; y < this.height; y++) {
            types[y] = [];
            for (let x = 0; x < this.width; x++) {
                if (map.walls[y][x] === null) {
                    types[y][x] = this.TILE.FLOOR;
                } else {
                    types[y][x] = this.TILE.ROCK;
                }
            }
        }

        return types;
    }

    _markWallsFromRock(tileTypeMap) {
        const w = this.width;
        const h = this.height;

        const dirs = [
            { x: 1,  y: 0 },
            { x: -1, y: 0 },
            { x: 0,  y: 1 },
            { x: 0,  y: -1 },
            { x: 1,  y: 1 },
            { x: -1,  y: -1 },
            { x: 1,  y: -1 },
            { x: -1,  y: 1 }
        ];

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                if (tileTypeMap[y][x] !== this.TILE.ROCK) continue;
                for (const d of dirs) {
                    const nx = x + d.x;
                    const ny = y + d.y;
                    if (!this._inMapRect(nx, ny)) continue;
                    if (tileTypeMap[ny][nx] === this.TILE.FLOOR) {
                        tileTypeMap[y][x] = this.TILE.WALL;
                        break;
                    }
                }
            }
        }
    }

    _autoTileWalls(tileTypeMap,map) {
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                if (tileTypeMap[y][x] !== this.TILE.WALL) continue;
                const pattern = this._buildPattern(x, y, tileTypeMap);
                const rule = this._findMatchingRule(pattern);
                if (rule) {
                    map.walls[y][x] = rule.tile;
                }
            }
        }
    }

    _buildPattern(cx, cy, tileTypeMap) {
        let result = "";
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const x = cx + dx;
                const y = cy + dy;
                result += this._tileToSymbol(tileTypeMap, x, y);
            }
        }
        return result;
    }

    _tileToSymbol(tileTypeMap, x, y) {
        if (!this._inMapRect(x, y)) return "R";
        if (tileTypeMap[y][x] === this.TILE.FLOOR) return "F";
        if (tileTypeMap[y][x] === this.TILE.WALL) return "W";
        if (tileTypeMap[y][x] === this.TILE.ROCK) return "R";
        return "R";
    }

    _findMatchingRule(pattern) {
        let bestRule = null;
        let bestScore = -Infinity;

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

    _matchPattern(actual, rule) {
        for (let i = 0; i < 9; i++) {
            if (rule[i] === "*") continue;
            if (actual[i] !== rule[i]) return false;
        }
        return true;
    }

    //--- start positions ---
    _generateStartPositions(count = 8) {
        const objects = [];

        // 1) collect candidate rooms (only normal rooms)
        const candidateRooms = this.bspNodes.filter(n => n.room && !n.reserved).map(n => n.room);
        if (candidateRooms.length === 0) return objects;

        const maxCount = Math.min(count, candidateRooms.length);
        const candidates = candidateRooms.map(r => ({
            room: r,
            center: this._roomCenter(r)
        }));
        const selected = [];

        // 2) choose first point — farthest from map center (more stable than random)
        const mapCenter = {
            x: Math.floor(this.width / 2),
            y: Math.floor(this.height / 2)
        };

        let first = candidates[0];
        let bestD = -Infinity;
        for (const c of candidates) {
            const d = this._dist2(c.center, mapCenter);
            if (d > bestD) {
                bestD = d;
                first = c;
            }
        }
        selected.push(first);
        candidates.splice(candidates.indexOf(first), 1);

        // 3) farthest point sampling
        while (selected.length < maxCount) {
            let bestCandidate = null;
            let bestMinDist = -Infinity;
            for (const c of candidates) {
                let minDist = Infinity;
                for (const s of selected) {
                    const d = this._dist2(c.center, s.center);
                    if (d < minDist) minDist = d;
                }
                if (minDist > bestMinDist) {
                    bestMinDist = minDist;
                    bestCandidate = c;
                }
            }
            if (!bestCandidate) break;
            selected.push(bestCandidate);
            candidates.splice(candidates.indexOf(bestCandidate), 1);
        }

        // 4) convert to objects
        for (const s of selected) {
            objects.push({
                name: "start",
                x: s.center.x * 16,
                y: s.center.y * 16
            });
        }
        return objects;
    }

    _roomCenter(room) {
        return {
            x: room.x + Math.floor(room.w / 2),
            y: room.y + Math.floor(room.h / 2)
        };
    }

    _dist2(a, b) {
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        return dx * dx + dy * dy;
    }

}