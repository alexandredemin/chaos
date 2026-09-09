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

    generate()
    {
        const map = this._createEmptyMap();

        this.rooms = [];
        this.bspNodes = [];

        const rootRect = {
            x:1,
            y:1,
            w:this.width-2,
            h:this.height-2
        };

        const {zones,connections} = this._buildInitialLayout(rootRect);

        for(let node of zones) this._bspSplit(node);

        this._generateRooms(zones,map);
        this._connectRooms(zones,map);
        this._connectZones(connections,map);

        //this._generateBranchingCorridors(map);

        const tileTypeMap = this._buildTileTypeMap(map);
        this._autoTile(map,tileTypeMap);

        const doors = this._placeDoors(map,tileTypeMap);

        // Special dead-end rooms are selected before start positions and ordinary content.
        const specialRooms = this._selectSpecialRooms(doors,4);

        const startPositions = this._generateStartPositions();

        const items = this._placeItems(startPositions.concat(doors));
        const chests = this._placeChests(startPositions.concat(doors,items));
        const wardrobes = this._placeWardrobes(map,startPositions.concat(doors,items,chests));

        // Ordinary locked containers use consumable common keys.
        const commonLockCount = this._lockRandomContainers(chests,wardrobes);

        // Reserved special rooms receive explicit premium content.
        const specialContent = this._populateSpecialRooms(
            map,
            specialRooms,
            startPositions.concat(doors,items,chests,wardrobes)
        );

        chests.push(...specialContent.chests);
        wardrobes.push(...specialContent.wardrobes);

        // Keys are placed only after every lock already exists.
        const keyChests = this._placeLockKeys(
            map,
            specialRooms,
            commonLockCount,
            chests,
            wardrobes,
            startPositions.concat(doors,items,chests,wardrobes)
        );

        chests.push(...keyChests);

        // independent guards for rooms with many containers
        const treasureGuards = this._placeTreasureGuards(
            map,
            chests,
            wardrobes,
            startPositions,
            startPositions.concat(doors,items,chests,wardrobes)
        );

        // monster generators
        const monsterGenerators = this._placeMonsterGenerators(
            map,
            startPositions,
            treasureGuards,
            startPositions.concat(doors,items,chests,wardrobes,treasureGuards)
        );

        // independent creatures freely roaming through the dungeon
        const roamingCreatures = this._placeRoamingCreatures(
            map,
            startPositions,
            startPositions.concat(doors,items,chests,wardrobes,treasureGuards,monsterGenerators)
        );

        const objects = startPositions.concat(doors,items,chests,wardrobes,treasureGuards,monsterGenerators,roamingCreatures);

        return {
            width:this.width,
            height:this.height,
            ground:map.ground,
            walls:map.walls,
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
                id: regions[i].id,
                rect: regions[i].rect,
                depth: 0,
                left: null,
                right: null,
                room: null,
                reserved: false,
                allowSplit: true
            });
        }

        // auto-generate connections to arena
        for (const zone of zones) {
            if (zone === arenaNode) continue;

            if (this._rectsTouch(arenaNode.rect, zone.rect)) {
                connections.push([arenaNode, zone]);
            }
        }
        // generate connections between neighboring zones
        const zoneTop = zones.find(z => z.id === "top");
        const zoneBottom = zones.find(z => z.id === "bottom");
        const zoneLeft = zones.find(z => z.id === "left");
        const zoneRight = zones.find(z => z.id === "right");
        connections.push([zoneTop, zoneLeft]);
        connections.push([zoneTop, zoneRight]);
        connections.push([zoneBottom, zoneLeft]);
        connections.push([zoneBottom, zoneRight]);

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
                id: "top",
                rect: {
                    x: ox,
                    y: oy,
                    w: ow,
                    h: topH
                }
            });
        }

        // --- BOTTOM ---
        const bottomY = iy + ih;
        const bottomH = (oy + oh) - bottomY;
        if (bottomH > 0) {
            result.push({
                id: "bottom",
                rect: {
                    x: ox,
                    y: bottomY,
                    w: ow,
                    h: bottomH
                }
            });
        }

        // --- LEFT ---
        const leftW = ix - ox;
        if (leftW > 0) {
            result.push({
                id: "left",
                rect: {
                    x: ox,
                    y: iy,
                    w: leftW,
                    h: ih
                }
            });
        }

        // --- RIGHT ---
        const rightX = ix + iw;
        const rightW = (ox + ow) - rightX;
        if (rightW > 0) {
            result.push({
                id: "right",
                rect: {
                    x: rightX,
                    y: iy,
                    w: rightW,
                    h: ih
                }
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

    //--- tile-type map ---
    _buildTileTypeMap(map) {
        const tileTypeMap = [];

        for (let y = 0; y < this.height; y++) {
            tileTypeMap[y] = [];
            for (let x = 0; x < this.width; x++) {
                if (map.walls[y][x] === null) {
                    tileTypeMap[y][x] = this.TILE.FLOOR;
                } else {
                    tileTypeMap[y][x] = this.TILE.ROCK;
                }
            }
        }
        this._markWallsFromRock(tileTypeMap);

        return tileTypeMap;
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

    //--- auto-tiling ---
    _autoTile(map, tileTypeMap) {
        this._autoTileWalls(tileTypeMap,map);
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

    //--- place doors ---
    _placeDoors(map, tileTypeMap) {
        const doors = [];
        for (let y = 1; y < this.height - 1; y++) {
            for (let x = 1; x < this.width - 1; x++) {
                if (tileTypeMap[y][x] !== this.TILE.FLOOR) continue;
                const door = this._checkDoorCandidate(x, y, tileTypeMap);
                if (!door) continue;
                doors.push({
                    type: "entity",
                    name: "door",
                    x: x * 16,
                    y: y * 16,
                    properties: [
                        { name: "direction", type: "string", value: door.dir },
                        { name: "open", type: "bool", value: false }
                    ]
                });
                // apply autotiling rules for door
                this._applyDoorAutotileRules(x, y, door.dir, map);
            }
        }
        return doors;
    }

    _checkDoorCandidate(x, y, tileTypeMap) {
        const isFloor = (x, y) => tileTypeMap[y][x] === this.TILE.FLOOR;
        const isWall  = (x, y) => tileTypeMap[y][x] === this.TILE.WALL;

        // WEST door
        if (
            isWall(x, y - 1) &&
            isWall(x, y + 1) &&
            isFloor(x - 1, y) &&
            isFloor(x + 1, y) &&
            this._isRoom(x + 1, y) &&
            !this._isRoom(x - 1, y)
        ) {
            return { dir: "W" };
        }

        // EAST door
        if (
            isWall(x, y - 1) &&
            isWall(x, y + 1) &&
            isFloor(x - 1, y) &&
            isFloor(x + 1, y) &&
            this._isRoom(x - 1, y) &&
            !this._isRoom(x + 1, y)
        ) {
            return { dir: "E" };
        }

        // NORTH door
        if (
            isWall(x - 1, y) &&
            isWall(x + 1, y) &&
            isFloor(x, y - 1) &&
            isFloor(x, y + 1) &&
            this._isRoom(x, y + 1) &&
            !this._isRoom(x, y - 1)
        ) {
            return { dir: "N" };
        }

        // SOUTH door
        if (
            isWall(x - 1, y) &&
            isWall(x + 1, y) &&
            isFloor(x, y - 1) &&
            isFloor(x, y + 1) &&
            this._isRoom(x, y - 1) &&
            !this._isRoom(x, y + 1)
        ) {
            return { dir: "S" };
        }

        return null;
    }

    _applyDoorAutotileRules(x, y, dir, map){
        for (const rule of DOOR_AUTOTILE_RULES)
        {
            if (!rule.directions.includes(dir)) continue;
            for (const offset of rule.offsets)
            {
                const tx = x + offset.dx;
                const ty = y + offset.dy;
                if (tx < 0 || tx >= this.width || ty < 0 || ty >= this.height) continue;
                let currentTile = map.walls[ty][tx];
                if(currentTile === null) currentTile = 0;
                if (offset.replacements.hasOwnProperty(currentTile))
                {
                    map.walls[ty][tx] = offset.replacements[currentTile];
                }
            }
        }
    }

	//--- special rooms / locked content ---
	_getObjectProperty(obj,name)
	{
		if(obj == null || !Array.isArray(obj.properties)) return null;
		const prop = obj.properties.find(p => p && p.name === name);
		return prop != null ? prop.value : null;
	}

	_setObjectProperty(obj,name,value,type=null)
	{
		if(!Array.isArray(obj.properties)) obj.properties = [];

		let prop = obj.properties.find(p => p && p.name === name);
		if(prop == null)
		{
			prop = {name:name,value:value};
			if(type != null) prop.type = type;
			obj.properties.push(prop);
			return;
		}

		prop.value = value;
		if(type != null) prop.type = type;
	}

	_getRoomNode(room)
	{
		return this.bspNodes.find(n => n.room === room) || null;
	}

	_isSpecialRoom(room)
	{
		const node = this._getRoomNode(room);
		return node != null && (node.roomType === 'treasury' || node.roomType === 'library');
	}

	_getRoomAtMap(x,y)
	{
		for(const room of this.rooms)
			if(x >= room.x && x < room.x+room.w && y >= room.y && y < room.y+room.h) return room;
		return null;
	}

	_getObjectRoom(obj)
	{
		if(obj == null || obj.x == null || obj.y == null) return null;
		return this._getRoomAtMap(Math.floor(obj.x/16),Math.floor(obj.y/16));
	}

	_getDoorRoom(door)
	{
		const x = Math.floor(door.x/16);
		const y = Math.floor(door.y/16);
		const dir = this._getObjectProperty(door,'direction');

		if(dir === 'W') return this._getRoomAtMap(x+1,y);
		if(dir === 'E') return this._getRoomAtMap(x-1,y);
		if(dir === 'N') return this._getRoomAtMap(x,y+1);
		if(dir === 'S') return this._getRoomAtMap(x,y-1);

		return null;
	}

	_getRoomDoors(room,doors)
	{
		return doors.filter(door => this._getDoorRoom(door) === room);
	}

	_selectSpecialRooms(doors,startCount=4)
	{
		const result = [];
		const normalNodes = this.bspNodes.filter(n => n.room && !n.reserved);
		const maxSpecial = Math.max(0,normalNodes.length-startCount);
		if(maxSpecial <= 0) return result;

		let candidates = normalNodes.map(node =>
		{
			const roomDoors = this._getRoomDoors(node.room,doors);
			return {node:node,room:node.room,doors:roomDoors};
		}).filter(c => c.doors.length === 1 && c.room.w*c.room.h >= 16);

		if(candidates.length <= 0) return result;

		for(let i=candidates.length-1;i>0;i--)
		{
			const j = randomInt(0,i);
			const tmp = candidates[i]; candidates[i] = candidates[j]; candidates[j] = tmp;
		}

		const desired = Math.max(1,Math.floor(normalNodes.length/10));
		const count = Math.min(3,maxSpecial,candidates.length,desired);

		let types = [];
		if(count === 1) types.push(Math.random() < 0.65 ? 'treasury' : 'library');
		else
		{
			types.push('treasury','library');
			while(types.length < count) types.push(Math.random() < 0.65 ? 'treasury' : 'library');
		}

		for(let i=0;i<count;i++)
		{
			const candidate = candidates[i];
			const type = types[i];
			const keyId = 'special_room_'+(i+1)+'_'+candidate.room.x+'_'+candidate.room.y;

			candidate.node.reserved = true;
			candidate.node.roomType = type;

			for(const door of candidate.doors)
			{
				this._setObjectProperty(door,'lock',{
					locked:true,
					type:'key',
					keyId:keyId,
					consumeKey:false
				});
			}

			result.push({
				node:candidate.node,
				room:candidate.room,
				doors:candidate.doors,
				type:type,
				keyId:keyId,
				keyName:type === 'library' ? 'Library key' : 'Treasury key'
			});
		}

		return result;
	}

	_getNormalLootItemNames()
	{
		return Object.keys(itemConfigs).filter(name => name !== 'key');
	}

	_getPremiumPotionNames()
	{
		const preferred = ['strength_potion','defense_potion','speed_potion','invisible_potion','mana_potion'];
		const result = preferred.filter(name => itemConfigs[name] != null);
		return result.length > 0 ? result : this._getNormalLootItemNames().filter(name => name !== 'spell_scroll');
	}

	_chooseSpellForLootTier(tier)
	{
		let spells = Object.keys(spellConfigs).filter(id =>
		{
			const cost = spellConfigs[id]?.cost || 0;
			if(tier === 'normal') return cost <= 4;
			if(tier === 'rare') return cost >= 5 && cost <= 7;
			if(tier === 'legendary') return cost >= 8;
			return true;
		});

		if(spells.length <= 0)
		{
			spells = Object.keys(spellConfigs);
			if(tier === 'normal') spells = spells.filter(id => id !== 'demon');
		}

		return spells.length > 0 ? spells[randomInt(0,spells.length-1)] : null;
	}

	_createSpellScroll(source='normal')
	{
		let tier = 'normal';

		if(source === 'locked')
			tier = Math.random() < 0.25 ? 'legendary' : 'rare';
		else if(source === 'special')
			tier = Math.random() < 0.45 ? 'legendary' : 'rare';

		const spell = this._chooseSpellForLootTier(tier);
		if(spell == null) return createItemData('spell_scroll',{});

		const cost = Math.max(1,spellConfigs[spell]?.cost || 1);
		let points = source === 'normal' ? randomInt(8,14) : source === 'locked' ? randomInt(10,18) : randomInt(12,20);
		let amount = Math.max(1,Math.round(points/cost));

		if(cost >= 8) amount = 1;
		if(amount > 12) amount = 12;

		return createItemData('spell_scroll',{spell:spell,amount:amount});
	}

	_createLootItem(tier='normal')
	{
		if(tier === 'library')
		{
			if(Math.random() < 0.75) return this._createSpellScroll('special');

			const pool = ['mana_potion','invisible_potion'].filter(name => itemConfigs[name] != null);
			if(pool.length > 0) return createItemData(pool[randomInt(0,pool.length-1)],{});
			return this._createSpellScroll('special');
		}

		if(tier === 'treasury')
		{
			if(Math.random() < 0.35) return this._createSpellScroll('special');

			const pool = this._getPremiumPotionNames();
			return createItemData(pool[randomInt(0,pool.length-1)],{});
		}

		if(tier === 'locked')
		{
			if(Math.random() < 0.45) return this._createSpellScroll('locked');

			const pool = this._getPremiumPotionNames();
			return createItemData(pool[randomInt(0,pool.length-1)],{});
		}

		const pool = this._getNormalLootItemNames();
		if(pool.length <= 0) return null;

		const itemName = pool[randomInt(0,pool.length-1)];
		if(itemName === 'spell_scroll') return this._createSpellScroll('normal');

		return createItemData(itemName,{});
	}

	_createLoot(count,tier='normal')
	{
		const result = [];
		for(let i=0;i<count;i++)
		{
			const item = this._createLootItem(tier);
			if(item != null) result.push(item);
		}
		return result;
	}

	_getContainerSpawnConfig(name)
	{
		if(name === 'wardrobe')
		{
			return {
				probability:0.30,
				minCount:1,
				maxCount:2,
				monsterTypes:['rat','bat'],
				sameTypePerBatch:true,
				factionId:'dungeon_creatures',
				minSpawnRadius:1,
				spawnRadius:2,
				allowPassableEntityCells:true,
				behavior:{
					type:'roam',
					minGoalDistance:8,
					maxGoalDistance:24,
					goalTolerance:1,
					stuckTurnLimit:3,
					aggroRadius:6,
					pursuitRadius:12,
					pursuitCooldownTurns:1,
					targetAggression:1,
					travelAggression:3,
					combatAggression:6
				},
				spawnEffect:{
					type:'emerge',
					initialScale:0.18,
					intermediateScale:0.45,
					initialAlpha:0.35,
					sourceOffsetX:0,
					sourceOffsetY:4,
					emergeLift:2,
					emergeDuration:150,
					moveDuration:320,
					staggerDelay:100,
					maxStaggerDelay:400,
					playMoveAnimation:true
				}
			};
		}

		return {
			probability:0.30,
			minCount:1,
			maxCount:2,
			monsterTypes:['rat'],
			sameTypePerBatch:true,
			factionId:'dungeon_creatures',
			minSpawnRadius:1,
			spawnRadius:2,
			allowPassableEntityCells:true,
			behavior:{
				type:'roam',
				minGoalDistance:8,
				maxGoalDistance:24,
				goalTolerance:1,
				stuckTurnLimit:3,
				aggroRadius:6,
				pursuitRadius:12,
				pursuitCooldownTurns:1,
				targetAggression:1,
				travelAggression:3,
				combatAggression:6
			},
			spawnEffect:{
				type:'burst',
				initialScale:0.25,
				launchScale:0.72,
				overshootScale:1.10,
				sourceOffsetX:0,
				sourceOffsetY:-2,
				jumpHeight:7,
				launchDuration:110,
				moveDuration:240,
				settleDuration:90,
				staggerDelay:90,
				maxStaggerDelay:360,
				playMoveAnimation:true
			}
		};
	}

	_createContainerObject(name,x,y,items=[],lock=null)
	{
		const properties = [
			{name:'monsterSpawnResolved',value:false},
			{name:'monsterSpawn',value:this._getContainerSpawnConfig(name)}
		];

		if(lock != null) properties.push({name:'lock',value:clone(lock)});

		return {
			type:'entity',
			name:name,
			x:x*16,
			y:y*16,
			properties:properties,
			items:items
		};
	}

	_collectOccupied(objects=[])
	{
		const result = new Set();

		for(const obj of objects)
		{
			if(obj == null || obj.x == null || obj.y == null) continue;
			result.add(Math.floor(obj.x/16)+':'+Math.floor(obj.y/16));
		}

		return result;
	}

	_findFreeRoomCell(map,room,occupied)
	{
		for(let attempt=0;attempt<60;attempt++)
		{
			const x = randomInt(room.x,room.x+room.w-1);
			const y = randomInt(room.y,room.y+room.h-1);
			const key = x+':'+y;

			if(occupied.has(key)) continue;
			if(map.walls[y][x] !== null) continue;

			return {x:x,y:y};
		}

		for(let y=room.y;y<room.y+room.h;y++)
			for(let x=room.x;x<room.x+room.w;x++)
			{
				const key = x+':'+y;
				if(!occupied.has(key) && map.walls[y][x] === null) return {x:x,y:y};
			}

		return null;
	}

	_findWardrobeCell(map,room,occupied)
	{
		const y = room.y;
		const minX = room.x+1;
		const maxX = room.x+room.w-2;
		if(maxX < minX) return null;

		for(let attempt=0;attempt<40;attempt++)
		{
			const x = randomInt(minX,maxX);
			if(occupied.has(x+':'+y)) continue;
			if(occupied.has(x+':'+(y-1))) continue;
			if(map.walls[y][x] !== null) continue;

			return {x:x,y:y};
		}

		return null;
	}

	_populateSpecialRooms(map,specialRooms,occupiedObjects=[])
	{
		const result = {chests:[],wardrobes:[]};
		const occupied = this._collectOccupied(occupiedObjects);

		for(const special of specialRooms)
		{
			if(special.type === 'treasury')
			{
				const count = randomInt(3,5);

				for(let i=0;i<count;i++)
				{
					const cell = this._findFreeRoomCell(map,special.room,occupied);
					if(cell == null) break;

					const chest = this._createContainerObject(
						'chest',
						cell.x,
						cell.y,
						this._createLoot(randomInt(3,5),'treasury')
					);

					result.chests.push(chest);
					occupied.add(cell.x+':'+cell.y);
				}
			}
			else
			{
				const maxWardrobes = Math.max(1,special.room.w-2);
				const count = Math.min(randomInt(3,5),maxWardrobes);

				for(let i=0;i<count;i++)
				{
					const cell = this._findWardrobeCell(map,special.room,occupied);
					if(cell == null) break;

					const wardrobe = this._createContainerObject(
						'wardrobe',
						cell.x,
						cell.y,
						this._createLoot(randomInt(2,4),'library')
					);

					result.wardrobes.push(wardrobe);
					occupied.add(cell.x+':'+cell.y);
				}
			}
		}

		return result;
	}

	_lockRandomContainers(chests=[],wardrobes=[])
	{
		const containers = chests.concat(wardrobes);
		if(containers.length < 4) return 0;

		for(let i=containers.length-1;i>0;i--)
		{
			const j = randomInt(0,i);
			const tmp = containers[i]; containers[i] = containers[j]; containers[j] = tmp;
		}

		const count = Math.min(containers.length,Math.max(1,Math.round(containers.length*0.12)));

		for(let i=0;i<count;i++)
		{
			const container = containers[i];

			this._setObjectProperty(container,'lock',{
				locked:true,
				type:'key',
				keyId:'common',
				consumeKey:true
			});

			if(!Array.isArray(container.items)) container.items = [];

			const premiumItem = this._createLootItem('locked');
			if(premiumItem != null) container.items.push(premiumItem);
		}

		return count;
	}

	_isObjectLocked(obj)
	{
		const lock = this._getObjectProperty(obj,'lock');
		return lock != null && lock.locked === true;
	}

	_getKeyContainerCandidates(chests=[],wardrobes=[])
	{
		return chests.concat(wardrobes).filter(container =>
		{
			if(this._isObjectLocked(container)) return false;

			const room = this._getObjectRoom(container);
			if(room == null) return false;

			const node = this._getRoomNode(room);
			return node != null && !node.reserved;
		});
	}

	_createFallbackKeyChest(map,targetRoom,occupied)
	{
		let rooms = this.bspNodes.filter(n => n.room && !n.reserved).map(n => n.room);
		if(rooms.length <= 0) return null;

		if(targetRoom != null)
		{
			const target = this._roomCenter(targetRoom);

			rooms.sort((a,b) =>
			{
				const ca = this._roomCenter(a);
				const cb = this._roomCenter(b);
				const da = Math.abs(ca.x-target.x)+Math.abs(ca.y-target.y);
				const db = Math.abs(cb.x-target.x)+Math.abs(cb.y-target.y);
				return db-da;
			});
		}

		for(const room of rooms)
		{
			const cell = this._findFreeRoomCell(map,room,occupied);
			if(cell == null) continue;

			occupied.add(cell.x+':'+cell.y);

			return this._createContainerObject(
				'chest',
				cell.x,
				cell.y,
				this._createLoot(randomInt(1,2),'normal')
			);
		}

		return null;
	}

	_placeLockKeys(map,specialRooms,commonLockCount,chests=[],wardrobes=[],occupiedObjects=[])
	{
		const extraChests = [];
		const occupied = this._collectOccupied(occupiedObjects);
		const usedUniqueContainers = new Set();

		const getCandidates = () => this._getKeyContainerCandidates(chests.concat(extraChests),wardrobes);

		for(const special of specialRooms)
		{
			let candidates = getCandidates();

			if(candidates.length <= 0)
			{
				const chest = this._createFallbackKeyChest(map,special.room,occupied);
				if(chest != null)
				{
					extraChests.push(chest);
					candidates = [chest];
				}
			}

			if(candidates.length <= 0) continue;

			let unused = candidates.filter(container => !usedUniqueContainers.has(container));
			if(unused.length <= 0) unused = candidates;

			const targetCenter = this._roomCenter(special.room);

			unused.sort((a,b) =>
			{
				const ra = this._getObjectRoom(a);
				const rb = this._getObjectRoom(b);
				const ca = ra != null ? this._roomCenter(ra) : targetCenter;
				const cb = rb != null ? this._roomCenter(rb) : targetCenter;

				const da = Math.abs(ca.x-targetCenter.x)+Math.abs(ca.y-targetCenter.y);
				const db = Math.abs(cb.x-targetCenter.x)+Math.abs(cb.y-targetCenter.y);

				return db-da;
			});

			const topCount = Math.max(1,Math.ceil(unused.length*0.30));
			const container = unused[randomInt(0,topCount-1)];

			if(!Array.isArray(container.items)) container.items = [];
			container.items.push(createItemData('key',{
				keyId:special.keyId,
				name:special.keyName
			}));

			usedUniqueContainers.add(container);
		}

		for(let i=0;i<commonLockCount;i++)
		{
			let candidates = getCandidates();

			if(candidates.length <= 0)
			{
				const chest = this._createFallbackKeyChest(map,null,occupied);
				if(chest != null)
				{
					extraChests.push(chest);
					candidates = [chest];
				}
			}

			if(candidates.length <= 0) break;

			const container = candidates[randomInt(0,candidates.length-1)];
			if(!Array.isArray(container.items)) container.items = [];

			container.items.push(createItemData('key',{
				keyId:'common',
				name:'Common key'
			}));
		}

		return extraChests;
	}

    //--- place items ---
    _placeItems(occupiedObjects=[])
    {
        const objects = [];
        const candidateRooms = this.bspNodes.filter(n => n.room && !n.reserved).map(n => n.room);
        if(candidateRooms.length <= 0) return objects;

        const occupied = this._collectOccupied(occupiedObjects);

        for(const room of candidateRooms)
        {
            if(randomInt(1,100) > 70) continue;

            const itemCount = randomInt(1,2);
            let placed = 0;
            let attempts = 0;

            while(placed < itemCount && attempts < 20)
            {
                attempts++;

                const x = randomInt(room.x,room.x+room.w-1);
                const y = randomInt(room.y,room.y+room.h-1);
                const key = x+':'+y;

                if(occupied.has(key)) continue;

                const item = this._createLootItem('normal');
                if(item == null) continue;

                objects.push({
                    type:'entity',
                    name:'item',
                    x:x*16,
                    y:y*16,
                    properties:[],
                    items:[item]
                });

                occupied.add(key);
                placed++;
            }
        }

        return objects;
    }

    //--- place chests---
    _placeChests(occupiedObjects=[])
    {
        const objects = [];
        const candidateRooms = this.bspNodes.filter(n => n.room && !n.reserved).map(n => n.room);
        if(candidateRooms.length <= 0) return objects;

        const occupied = this._collectOccupied(occupiedObjects);

        for(const room of candidateRooms)
        {
            if(randomInt(1,100) > 30) continue;

            let attempts = 0;

            while(attempts < 20)
            {
                attempts++;

                const x = randomInt(room.x,room.x+room.w-1);
                const y = randomInt(room.y,room.y+room.h-1);
                const key = x+':'+y;

                if(occupied.has(key)) continue;

                objects.push(
                    this._createContainerObject(
                        'chest',
                        x,
                        y,
                        this._createLoot(randomInt(1,5),'normal')
                    )
                );

                occupied.add(key);
                break;
            }
        }

        return objects;
    }

    _placeWardrobes(map,occupiedObjects=[])
    {
        const objects = [];
        const candidateRooms = this.bspNodes.filter(n => n.room && !n.reserved).map(n => n.room);
        if(candidateRooms.length <= 0) return objects;

        const occupied = this._collectOccupied(occupiedObjects);

        for(const room of candidateRooms)
        {
            if(randomInt(1,100) > 20) continue;

            const y = room.y;
            const minX = room.x+1;
            const maxX = room.x+room.w-2;

            if(maxX < minX) continue;

            const maxWardrobes = Math.min(3,maxX-minX+1);
            const wardrobeCount = randomInt(1,maxWardrobes);

            let placed = 0;
            let attempts = 0;

            while(placed < wardrobeCount && attempts < 40)
            {
                attempts++;

                const x = randomInt(minX,maxX);
                const key = x+':'+y;

                if(occupied.has(key)) continue;
                if(occupied.has(x+':'+(y-1))) continue;

                if(map != null && map.walls != null)
                {
                    if(y < 0 || y >= map.walls.length) continue;
                    if(x < 0 || x >= map.walls[y].length) continue;
                    if(map.walls[y][x] !== null) continue;
                }

                objects.push(
                    this._createContainerObject(
                        'wardrobe',
                        x,
                        y,
                        this._createLoot(randomInt(1,4),'normal')
                    )
                );

                occupied.add(key);
                placed++;
            }
        }

        return objects;
    }

    _placeTreasureGuards(map, chests=[], wardrobes=[], startPositions=[], occupiedObjects=[])
	{
		const result = [];
		const startCells = [];
		for(let i = 0; i < startPositions.length; i++)
		{
			const start = startPositions[i];
			if(start == null) continue;
			let mapX = null;
			let mapY = null;
			if(start.mapX != null && start.mapY != null)
			{
				mapX = start.mapX;
				mapY = start.mapY;
			}
			else if(start.x != null && start.y != null)
			{
				mapX = Math.floor(start.x / 16);
				mapY = Math.floor(start.y / 16);
			}
			if(mapX == null || mapY == null) continue;
			startCells.push({x: mapX, y: mapY});
		}

		// A room is guarded when it contains at least this many chests and wardrobes in total.
		const minContainerCount = 2;

		// All guards currently belong to one independent faction, therefore guards from different rooms do not attack each other.
		// To make every room a separate hostile faction later, replace this value inside the room loop with:
		// const factionId = 'treasure_guards_' + room.x + '_' + room.y;
		const commonFactionId = 'dungeon_creatures';

		const excludedUnitTypes = ['wizard', 'rat', 'bat'];

		const guardUnitTypes = Object.keys(unitConfigs).filter(configName =>
		{
			return excludedUnitTypes.indexOf(configName) < 0;
		});
		if(guardUnitTypes.length <= 0) return result;

		const containers = chests.concat(wardrobes);
		const occupied = new Set();
		const doorCells = [];
		for(let i = 0; i < occupiedObjects.length; i++)
		{
			const obj = occupiedObjects[i];
			if(obj == null || obj.x == null || obj.y == null) continue;
			const mapX = Math.floor(obj.x / 16);
			const mapY = Math.floor(obj.y / 16);
			const key = mapX + ':' + mapY;
			occupied.add(key);
			if(obj.type === 'entity' && obj.name === 'door')
			{
				doorCells.push({x: mapX, y: mapY});
			}
		}

		const isInsideRoom = (mapX, mapY, room) =>
		{
			return mapX >= room.x && mapX < room.x + room.w && mapY >= room.y && mapY < room.y + room.h;
		};

		const isNearDoor = (mapX, mapY) =>
		{
			for(let i = 0; i < doorCells.length; i++)
			{
				if(Math.abs(mapX - doorCells[i].x) <= 1 && Math.abs(mapY - doorCells[i].y) <= 1)
				{
					return true;
				}
			}
			return false;
		};

		for(let roomIndex = 0; roomIndex < this.rooms.length; roomIndex++)
		{
			const room = this.rooms[roomIndex];
            let roomHasStartPosition = false;
			for(let i = 0; i < startCells.length; i++)
			{
				if(isInsideRoom(startCells[i].x, startCells[i].y, room))
				{
					roomHasStartPosition = true;
					break;
				}
			}
			// A wizard may start at any generated start position, so rooms containing start positions must never have guards.
			if(roomHasStartPosition) continue;
            
			let roomContainerCount = 0;
			for(let i = 0; i < containers.length; i++)
			{
				const container = containers[i];
				const mapX = Math.floor(container.x / 16);
				const mapY = Math.floor(container.y / 16);
				if(isInsideRoom(mapX, mapY, room))
				{
					roomContainerCount++;
				}
			}
			if(roomContainerCount < minContainerCount) continue;
			let availableCells = [];
			for(let y = room.y; y < room.y + room.h; y++)
			{
				for(let x = room.x; x < room.x + room.w; x++)
				{
					if(y < 0 || y >= map.walls.length) continue;
					if(x < 0 || x >= map.walls[y].length) continue;
					// Only floor cells.
					if(map.walls[y][x] !== null) continue;
					const key = x + ':' + y;
					if(occupied.has(key)) continue;
                    // Do not spawn a guard in a doorway or immediately next to it, so the room cannot be blocked at start.
					if(isNearDoor(x, y)) continue;
					availableCells.push({x: x, y: y});
				}
			}
			if(availableCells.length <= 0) continue;
			// Shuffle available cells.
			for(let i = availableCells.length - 1; i > 0; i--)
			{
				const j = randomInt(0, i);
				const tmp = availableCells[i];
				availableCells[i] = availableCells[j];
				availableCells[j] = tmp;
			}

			// One guard normally, two guards with a 40% probability.
			let guardCount = Math.random() < 0.40 ? 2 : 1;
			guardCount = Math.min(guardCount, availableCells.length);
			// All guards in the same room have the same creature type.
			const guardConfigName = guardUnitTypes[randomInt(0, guardUnitTypes.length - 1)];

			const aggroRadius = Math.max(4, Math.ceil(Math.max(room.w, room.h) / 2) + 1);
			const leashRadius = aggroRadius + 3;

			for(let guardIndex = 0; guardIndex < guardCount; guardIndex++)
			{
				const cell = availableCells[guardIndex];
				result.push({
					type: 'independent_unit',
					name: guardConfigName,
					x: cell.x * 16,
					y: cell.y * 16,
					factionId: commonFactionId,
					independentAI: {
						type: 'guard',
						// Each guard returns to its own initial cell. This prevents two guards from trying to occupy the same room-center cell.
						homeX: cell.x,
						homeY: cell.y,
						aggroRadius: aggroRadius,
						leashRadius: leashRadius,
                        patrolRadius: 3,
						aggression: 4,
                        patrolAggression: 2,
						returnAggression: 1
					}
				});
				occupied.add(cell.x + ':' + cell.y);
			}
		}
		return result;
	}

    _placeRoamingCreatures(map, startPositions=[], occupiedObjects=[])
	{
		const result = [];

		//Guards and roaming creatures use the same independent player, so they do not consider each other enemies.
		const factionId = 'dungeon_creatures';

		// Creature density is based on a 20x20 reference map:
		// cautious creatures:   5-7
		// aggressive creatures: 1-2
		// The amount is proportional to the map area.
		const referenceArea = 20 * 20;
		const mapArea = this.width * this.height;
		const areaScale = mapArea / referenceArea;

		const cautiousMinCount = Math.max(1, Math.round(5 * areaScale));
		const cautiousMaxCount = Math.max(cautiousMinCount, Math.round(7 * areaScale));
		const aggressiveMinCount = Math.max(1, Math.round(1 * areaScale));
		const aggressiveMaxCount = Math.max(aggressiveMinCount,Math.round(2 * areaScale));
		const cautiousCount = this._rand(cautiousMinCount, cautiousMaxCount);
		const aggressiveCount = this._rand(aggressiveMinCount, aggressiveMaxCount);

		// Aggressive creatures are placed first, so they have a better chance of receiving positions separated from other creatures.
		const profiles = [
			{
				count: aggressiveCount,
				unitTypes: ['chort','muddy','demon','troll'],
				minSpawnDistance: 3,
				behavior: {
					type: 'roam',
					minGoalDistance: 16,
					maxGoalDistance: 40,
					goalTolerance: 1,
					stuckTurnLimit: 3,
					aggroRadius: 7,
					pursuitRadius: 14,
					pursuitCooldownTurns: 1,
					targetAggression: 1,
					travelAggression: 3,
					combatAggression: 6
				}
			},
			{
				count: cautiousCount,
				unitTypes: ['rat','bat'],
				minSpawnDistance: 2,
				behavior: {
					type: 'roam',
					minGoalDistance: 8,
					maxGoalDistance: 24,
					goalTolerance: 1,
					stuckTurnLimit: 3,
					aggroRadius: 4,
					pursuitRadius: 7,
					pursuitCooldownTurns: 2,
					targetAggression: 0.1,
					travelAggression: 0.5,
					combatAggression: 2
				}
			}
		];

		const occupied = new Set();
		const doorCells = [];
		const startCells = [];
		const placedCells = [];
		// Collect occupied cells and doors.
		for(let i = 0; i < occupiedObjects.length; i++)
		{
			const obj = occupiedObjects[i];
			if(obj == null || obj.x == null || obj.y == null) continue;
			const mapX = Math.floor(obj.x / 16);
			const mapY = Math.floor(obj.y / 16);
			occupied.add(mapX + ':' + mapY);
			if(obj.type === 'entity' && obj.name === 'door') doorCells.push({x: mapX, y: mapY});
		}
		// Collect wizard start cells.
		for(let i = 0; i < startPositions.length; i++)
		{
			const start = startPositions[i];
			if(start == null) continue;
			let mapX = null;
			let mapY = null;
			if(start.mapX != null && start.mapY != null)
			{
				mapX = start.mapX;
				mapY = start.mapY;
			}
			else if(start.x != null && start.y != null)
			{
				mapX = Math.floor(start.x / 16);
				mapY = Math.floor(start.y / 16);
			}
			if(mapX == null || mapY == null) continue;
			startCells.push({x: mapX,y: mapY});
		}

		const isInsideRoom = (mapX, mapY, room) =>
		{
			return mapX >= room.x && mapX < room.x + room.w && mapY >= room.y && mapY < room.y + room.h;
		};

		const roomHasStartPosition = room =>
		{
			for(let i = 0; i < startCells.length; i++)
			{
				if(isInsideRoom(startCells[i].x,startCells[i].y,room)) return true;
			}
			return false;
		};

		const isNearDoor = (mapX, mapY) =>
		{
			for(let i = 0; i < doorCells.length; i++)
			{
				if(Math.abs(mapX - doorCells[i].x) <= 1 && Math.abs(mapY - doorCells[i].y) <= 1) return true;
			}
			return false;
		};

		const getCellDistance = (cell1, cell2) =>
		{
			return Math.max(Math.abs(cell1.x - cell2.x), Math.abs(cell1.y - cell2.y));
		};

		const shuffle = array =>
		{
			for(let i = array.length - 1; i > 0; i--)
			{
				const j = this._rand(0, i);
				const tmp = array[i];
				array[i] = array[j];
				array[j] = tmp;
			}
			return array;
		};

		const getAvailableCells = (room, minSpawnDistance) =>
		{
			const cells = [];
			for(let y = room.y; y < room.y + room.h; y++)
			{
				for(let x = room.x; x < room.x + room.w; x++)
				{
					if(y < 0 ||	y >= map.walls.length) continue;
					if(x < 0 || x >= map.walls[y].length) continue;
                    // Only floor cells.
					if(map.walls[y][x] !== null) continue;
					if(occupied.has(x + ':' + y)) continue;
                    //Do not initially block a doorway.
					if(isNearDoor(x, y)) continue;
					const cell = {x: x, y: y};
					let tooClose = false;
					for(let i = 0; i < placedCells.length; i++)
					{
						if(getCellDistance(cell, placedCells[i]) < minSpawnDistance)
						{
							tooClose = true;
							break;
						}
					}
					if(tooClose)continue;
					cells.push(cell);
				}
			}
			return cells;
		};

		// Find the special central arena.
		const arenaNode = this.bspNodes.find(node =>
		{
			return node != null && node.room != null && node.roomType === 'arena';
		});
		let arenaRoom = null;
		if(arenaNode != null && !roomHasStartPosition(arenaNode.room)) arenaRoom = arenaNode.room;

		// Rooms used as fallback positions:
		// - wizard start rooms are excluded;
		// - rooms closer to the map center are preferred;
		// - only the central half of suitable rooms is used.
		const mapCenter = {x: Math.floor(this.width / 2), y: Math.floor(this.height / 2)};
		let centralRooms = this.rooms.filter(room =>
		{
			if(roomHasStartPosition(room)) return false;
			if(arenaRoom != null && room === arenaRoom) return false;
			return true;
		});
		centralRooms.sort((room1, room2) =>
		{
			const center1 = this._roomCenter(room1);
			const center2 = this._roomCenter(room2);
			const dx1 = center1.x - mapCenter.x;
			const dy1 = center1.y - mapCenter.y;
			const dx2 = center2.x - mapCenter.x;
			const dy2 = center2.y - mapCenter.y;
			return dx1 * dx1 + dy1 * dy1 - (dx2 * dx2 + dy2 * dy2);
		});
		const centralRoomCount = Math.min(centralRooms.length,Math.max(4,Math.ceil(centralRooms.length / 2)));
		centralRooms = centralRooms.slice(0, centralRoomCount);

		// Tries to find a position for one creature. When the arena exists, it is always tried first. If it becomes crowded, remaining creatures spill into the central non-start rooms.
		const findSpawnCell = profile =>
		{
			let roomOrder = centralRooms.slice();
			shuffle(roomOrder);
			if(arenaRoom != null) roomOrder.unshift(arenaRoom);
			//First attempt: respect the profile's preferred separation from other roaming creatures.
			for(let roomIndex = 0; roomIndex < roomOrder.length; roomIndex++)
			{
				const cells = getAvailableCells(roomOrder[roomIndex], profile.minSpawnDistance);
				if(cells.length <= 0) continue;
				return cells[this._rand(0, cells.length - 1)];
			}
			// Second attempt: relax separation, but still avoid occupied cells, doors and wizard start rooms.
			for(let roomIndex = 0; roomIndex < roomOrder.length; roomIndex++)
			{
				const cells = getAvailableCells(roomOrder[roomIndex], 1);
				if(cells.length <= 0) continue;
				return cells[this._rand(0, cells.length - 1)];
			}
			return null;
		};

		for(let profileIndex = 0; profileIndex < profiles.length; profileIndex++)
		{
			const profile = profiles[profileIndex];
			const availableUnitTypes = profile.unitTypes.filter(configName => {return unitConfigs[configName] != null;});
			if(availableUnitTypes.length <= 0) continue;
			for(let creatureIndex = 0; creatureIndex < profile.count; creatureIndex++)
			{
				const selectedCell = findSpawnCell(profile);
				// The generator may place fewer creatures when there are not enough suitable free cells.
				if(selectedCell == null) break;
				const configName = availableUnitTypes[this._rand(0, availableUnitTypes.length - 1)];
				const independentAI = Object.assign({}, profile.behavior, {homeX: selectedCell.x, homeY: selectedCell.y});
				result.push({
					type: 'independent_unit',
					name: configName,
					x: selectedCell.x * 16,
					y: selectedCell.y * 16,
					factionId: factionId,
					independentAI: independentAI
				});
				occupied.add(selectedCell.x + ':' + selectedCell.y);
				placedCells.push({x: selectedCell.x, y: selectedCell.y});
			}
		}
		return result;
	}

    // --- place monster generators ---
    _createMonsterGeneratorObject(mapX, mapY, options={})
	{
		const generator = clone(options.generator || {});
		return {
			type: 'entity',
			name: 'monster_generator',
			x: mapX * 16,
			y: mapY * 16,
			properties: [
				{name: 'visualSprite', value: options.visualSprite || 'hole'},
				{name: 'visualScale', value: options.visualScale != null ? options.visualScale : 0.15},
				{name: 'visualFrame', value: options.visualFrame != null ? options.visualFrame : 0},
				{name: 'visualOriginMode', value: options.visualOriginMode || 'center'},
				{name: 'depthOffset', value: options.depthOffset != null ? options.depthOffset : -40},
				{name: 'blocksLOS', value: options.blocksLOS === true},
				{name: 'passable', value: options.passable !== false},
				{name: 'stepCost', value: options.stepCost != null ? options.stepCost : 1},
				{name: 'destructible', value: options.destructible === true},
				{name: 'generatorId', value: options.generatorId || null},
				{name: 'generator', value: generator}
			]
		};
	}

    _placeMonsterGenerators(map, startPositions=[], guards=[], occupiedObjects=[])
	{
		const result = [];
		const occupied = new Set();
		const doorCells = [];
		for(let i = 0; i < occupiedObjects.length; i++)
		{
			const obj = occupiedObjects[i];
			if(obj == null || obj.x == null || obj.y == null) continue;
			const x = Math.floor(obj.x / 16);
			const y = Math.floor(obj.y / 16);
			occupied.add(x + ':' + y);
			if(obj.type === 'entity' && obj.name === 'door') doorCells.push({x: x, y: y});
		}

		const isInsideRoom = (x, y, room) =>
		{
			return x >= room.x && x < room.x + room.w && y >= room.y && y < room.y + room.h;
		};

		const roomHasObject = (room, objects) =>
		{
			for(let i = 0; i < objects.length; i++)
			{
				const obj = objects[i];
				if(obj == null || obj.x == null || obj.y == null) continue;
				const x = Math.floor(obj.x / 16);
				const y = Math.floor(obj.y / 16);
				if(isInsideRoom(x, y, room)) return true;
			}
			return false;
		};

		const isNearDoor = (x, y) =>
		{
			for(let i = 0; i < doorCells.length; i++)
				if(Math.abs(x - doorCells[i].x) <= 1 && Math.abs(y - doorCells[i].y) <= 1) return true;
			return false;
		};

		// Start rooms and rooms containing guards are completely excluded.
		let candidateRooms = this.rooms.filter(room =>
		{
			if(roomHasObject(room, startPositions)) return false;
			if(roomHasObject(room, guards)) return false;
			return true;
		});
		if(candidateRooms.length <= 0) return result;

		// Generators are persistent sources, therefore their count grows slower than map area.
		// 20x20: 1-2, 30x30: 2-3, 40x40: 3-4, absolute maximum: 5.
		const areaScale = Math.sqrt((this.width * this.height) / (20 * 20));
		const roomLimit = Math.max(1, Math.ceil(candidateRooms.length / 3));
		const hardLimit = Math.min(5, candidateRooms.length, roomLimit);
		const minCount = Math.min(hardLimit, Math.max(1, Math.floor(1.5 * areaScale)));
		const maxCount = Math.min(hardLimit, Math.max(minCount, Math.ceil(2.0 * areaScale)));
		const generatorCount = this._rand(minCount, maxCount);
		// Shuffle rooms. Taking them one by one guarantees at most one generator per room.
		for(let i = candidateRooms.length - 1; i > 0; i--)
		{
			const j = this._rand(0, i);
			const tmp = candidateRooms[i];
			candidateRooms[i] = candidateRooms[j];
			candidateRooms[j] = tmp;
		}

		const roamBase = {
			type: 'roam',
			minGoalDistance: 8,
			maxGoalDistance: 24,
			goalTolerance: 1,
			stuckTurnLimit: 3,
			aggroRadius: 5,
			pursuitRadius: 10,
			pursuitCooldownTurns: 1
		};

		const profiles = [
			{
				type: 'rat',
				weight: 42,
				spawnChance: 0.18,
				minCount: 1,
				maxCount: 2,
				cooldownRounds: 1,
				maxAlive: 4,
				maxTotal: 10,
				behavior: Object.assign({}, roamBase, {
					targetAggression: 0.35,
					travelAggression: 1,
					combatAggression: 3
				})
			},
			{
				type: 'bat',
				weight: 35,
				spawnChance: 0.18,
				minCount: 1,
				maxCount: 2,
				cooldownRounds: 1,
				maxAlive: 4,
				maxTotal: 10,
				behavior: Object.assign({}, roamBase, {
					aggroRadius: 6,
					pursuitRadius: 12,
					targetAggression: 0.45,
					travelAggression: 1,
					combatAggression: 3
				})
			},
			{
				type: 'spider',
				weight: 16,
				spawnChance: 0.12,
				minCount: 1,
				maxCount: 1,
				cooldownRounds: 2,
				maxAlive: 3,
				maxTotal: 6,
				behavior: Object.assign({}, roamBase, {
					targetAggression: 0.7,
					travelAggression: 2,
					combatAggression: 4
				})
			},
			{
				type: 'muddy',
				weight: 4,
				strong: true,
				spawnChance: 0.08,
				minCount: 1,
				maxCount: 1,
				cooldownRounds: 3,
				maxAlive: 1,
				maxTotal: 3,
				behavior: Object.assign({}, roamBase, {
					minGoalDistance: 14,
					maxGoalDistance: 36,
					aggroRadius: 7,
					pursuitRadius: 14,
					targetAggression: 1,
					travelAggression: 3,
					combatAggression: 6
				})
			},
			{
				type: 'chort',
				weight: 3,
				strong: true,
				spawnChance: 0.10,
				minCount: 1,
				maxCount: 1,
				cooldownRounds: 3,
				maxAlive: 2,
				maxTotal: 4,
				behavior: Object.assign({}, roamBase, {
					minGoalDistance: 14,
					maxGoalDistance: 36,
					aggroRadius: 7,
					pursuitRadius: 14,
					targetAggression: 1,
					travelAggression: 3,
					combatAggression: 6
				})
			}
		];

		let strongGeneratorPlaced = false;

		const chooseProfile = () =>
		{
			const available = profiles.filter(profile => !profile.strong || !strongGeneratorPlaced);
			let totalWeight = 0;
			for(let i = 0; i < available.length; i++) totalWeight += available[i].weight;
			let roll = Math.random() * totalWeight;
			for(let i = 0; i < available.length; i++)
			{
				roll -= available[i].weight;
				if(roll <= 0) return available[i];
			}
			return available[available.length - 1];
		};

		const getAvailableCells = room =>
		{
			const cells = [];
			for(let y = room.y; y < room.y + room.h; y++)
			{
				for(let x = room.x; x < room.x + room.w; x++)
				{
					if(y < 0 || y >= map.walls.length) continue;
					if(x < 0 || x >= map.walls[y].length) continue;
					if(map.walls[y][x] !== null) continue;
					if(occupied.has(x + ':' + y)) continue;
					if(isNearDoor(x, y)) continue;
					cells.push({x: x, y: y});
				}
			}
			return cells;
		};

		for(let roomIndex = 0; roomIndex < candidateRooms.length && result.length < generatorCount; roomIndex++)
		{
			const room = candidateRooms[roomIndex];
			const cells = getAvailableCells(room);
			if(cells.length <= 0) continue;

			const cell = cells[this._rand(0, cells.length - 1)];
			const profile = chooseProfile();
			if(profile == null || unitConfigs[profile.type] == null) continue;
			if(profile.strong) strongGeneratorPlaced = true;
			const strong = profile.strong === true;
			const generator = this._createMonsterGeneratorObject(cell.x, cell.y, {
				visualSprite: 'hole',
				visualScale: strong ? 1.0 : 1.0,
				visualOriginMode: 'center',
				depthOffset: -40,
				blocksLOS: false,
				passable: true,
				stepCost: 1,
				destructible: false,
				generator: {
					enabled: true,
					spawnChance: profile.spawnChance,
					minCount: profile.minCount,
					maxCount: profile.maxCount,
					cooldownRounds: profile.cooldownRounds,
					maxAlive: profile.maxAlive,
					maxTotal: profile.maxTotal,
					spawnedTotal: 0,
					factionId: 'dungeon_creatures',
					minSpawnRadius: 1,
					spawnRadius: 2,
					allowPassableEntityCells: false,
					units: [
						{
							configName: profile.type,
							weight: 1,
							behavior: clone(profile.behavior)
						}
					],
					spawnEffect: strong ? {
						type: 'burst',
						initialScale: 0.2,
						launchScale: 0.7,
						overshootScale: 1.1,
						jumpHeight: 6,
						launchDuration: 120,
						moveDuration: 250,
						settleDuration: 90,
						staggerDelay: 100,
						playMoveAnimation: true
					} : {
						type: 'emerge',
						initialScale: 0.15,
						intermediateScale: 0.4,
						initialAlpha: 0.35,
						sourceOffsetY: 3,
						emergeLift: 2,
						emergeDuration: 150,
						moveDuration: 300,
						staggerDelay: 100,
						playMoveAnimation: true
					}
				}
			});
			result.push(generator);
			occupied.add(cell.x + ':' + cell.y);
		}
		return result;
	}

    //--- start positions ---
    _generateStartPositions(count = 4) {
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
                type: "start",
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