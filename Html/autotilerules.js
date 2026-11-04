/*
 * WALL SPRITE TOPOLOGY REFERENCE
 *
 * Connection directions:
 *   N = North (up)
 *   S = South (down)
 *   W = West  (left)
 *   E = East  (right)
 *   - = No wall connections
 *
 * A connection direction indicates where a sprite can connect
 * to another wall sprite or a compatible doorway.
 *
 * STRAIGHT WALLS, ENDS AND ISOLATED WALLS
 *
 * Tile  Connections  Description
 * ----  -----------  ----------------------------------------------
 * 10    E            Horizontal wall, left end
 * 11    W E          Horizontal wall, straight segment
 * 12    W            Horizontal wall, right end
 * 13    N S          Thin vertical wall
 * 14    N S          Vertical wall, floor to the east, rock to the west
 * 15    N S          Vertical wall, floor to the west, rock to the east
 * 16    S            Vertical wall, top end
 * 17    N            Vertical wall, bottom end
 * 18    -            Isolated wide pillar, no wall connections
 * 19    -            Isolated pillar, no wall connections
 * 28    E            Short horizontal wall, left end
 * 29    W            Short horizontal wall, right end
 *
 * CORNERS
 *
 * Tile  Connections  Description
 * ----  -----------  ----------------------------------------------
 * 20    E S          Outer corner, east and south
 * 21    W S          Outer corner, west and south
 * 22    N E          Outer corner, north and east
 * 23    N W          Outer corner, north and west
 * 24    N E          Inner corner, rock to the west
 * 25    N W          Inner corner, rock to the east
 * 26    W S          Inner corner, rock to the east
 * 27    E S          Inner corner, rock to the west
 *
 * T-JUNCTIONS AND CROSSROADS
 *
 * Tile  Connections  Description
 * ----  -----------  ----------------------------------------------
 * 30    N W E        T-junction, branch to the north
 * 31    S W E        T-junction, branch to the south
 * 32    N S E        T-junction, branch to the east
 * 33    N S W        T-junction, branch to the west
 * 34    N S E        T-junction to the east, rock to the west
 * 35    N S W        T-junction to the west, rock to the east
 * 36    N S W E      Four-way intersection
 *
 * Notes:
 * - Tiles 14/15 and 24-27 have rock-sensitive variants.
 * - Tiles 18/19 represent isolated pillars of different widths.
 * - Tiles 28/29 are shorter variants of horizontal wall ends.
 * - This table describes the intended visual topology, not
 *   every pattern accepted by WALL_AUTOTILE_RULES.
 */

/*
F - floor
W - wall
R - rock
* - any
*/

const WALL_AUTOTILE_RULES = [

    // --- default ---
    {
        pattern: "****W****",
        tile: 11,
        score: 1
    },

    // --- straight walls ---
    {
        pattern: "***WWW*F*",
        tile: 11,
        score: 2
    },
    {
        pattern: "*F*WWW***",
        tile: 11,
        score: 2
    },
    {
        pattern: "*W**WF*W*",
        tile: 14,
        score: 2
    },
    {
        pattern: "*W*FW**W*",
        tile: 15,
        score: 2
    },

    // --- thin straight walls ---
    {
        pattern: "*W*FWF*W*",
        tile: 13,
        score: 3
    },

    // --- isolated wall ---
    {
        pattern: "*F*FWF*F*",
        tile: 19,
        score: 3
    },

    // --- ends ---
    {
        pattern: "*F*WWF*F*",
        tile: 12,
        score: 3
    },
    {
        pattern: "*F*FWW*F*",
        tile: 10,
        score: 3
    },
    {
        pattern: "*F*FWF*W*",
        tile: 16,
        score: 3
    },
    {
        pattern: "*W*FWF*F*",
        tile: 17,
        score: 3
    },
    
    // --- outer corners ---
    {
        pattern: "*F*FWW*W*",
        tile: 20,
        score: 3
    },
    {
        pattern: "*F*WWF*W*",
        tile: 21,
        score: 3
    },
    {
        pattern: "*W*FWW*F*",
        tile: 22,
        score: 3
    },
    {
        pattern: "*W*WWF*F*",
        tile: 23,
        score: 3
    },

    // --- inner corners ---
    {
        pattern: "FW*WWR***",
        tile: 25,
        score: 5
    },
    {
        pattern: "*WFRWW***",
        tile: 24,
        score: 5
    },
    {
        pattern: "***WWRFW*",
        tile: 26,
        score: 5
    },
    {
        pattern: "***RWW*WF",
        tile: 27,
        score: 5
    },
    // ---
    {
        pattern: "FWWWWW***",
        tile: 25,
        score: 5
    },
    {
        pattern: "WWFWWW***",
        tile: 24,
        score: 5
    },
    {
        pattern: "***WWWFWW",
        tile: 26,
        score: 5
    },
    {
        pattern: "***WWWWWF",
        tile: 27,
        score: 5
    },

    // --- T-junctions ---
    /*
    {
        pattern: "FWFWWW***",
        tile: 30,
        score: 4
    },
    {
        pattern: "***WWWFWF",
        tile: 31,
        score: 4
    },
    {
        pattern: "*WF*WW*WF",
        tile: 32,
        score: 4
    },
    {
        pattern: "FW*WW*FW*",
        tile: 33,
        score: 4
    },
    */
    // ---
    {
        pattern: "*WFWWW***",
        tile: 30,
        score: 4
    },
    {
        pattern: "***WWW*WF",
        tile: 31,
        score: 4
    },
    {
        pattern: "*W**WW*WF",
        tile: 32,
        score: 4
    },
    {
        pattern: "*W*WW*FW*",
        tile: 33,
        score: 4
    },

    {
        pattern: "FW*WWW***",
        tile: 30,
        score: 4
    },
    {
        pattern: "***WWWFW*",
        tile: 31,
        score: 4
    },
    {
        pattern: "*WF*WW*W*",
        tile: 32,
        score: 4
    },
    {
        pattern: "FW*WW**W*",
        tile: 33,
        score: 4
    },
    // ---
    {
        pattern: "*WFWWW*F*",
        tile: 30,
        score: 6
    },
    {
        pattern: "*F*WWW*WF",
        tile: 31,
        score: 6
    },
    {
        pattern: "*W*FWW*WF",
        tile: 32,
        score: 6
    },
    {
        pattern: "*W*WWFFW*",
        tile: 33,
        score: 6
    },

    {
        pattern: "FW*WWW*F*",
        tile: 30,
        score: 6
    },
    {
        pattern: "*F*WWWFW*",
        tile: 31,
        score: 6
    },
    {
        pattern: "*WFFWW*W*",
        tile: 32,
        score: 6
    },
    {
        pattern: "FW*WWF*W*",
        tile: 33,
        score: 6
    },
    // ---
    {
        pattern: "FWFWWW*R*",
        tile: 30,
        score: 6
    },
    {
        pattern: "*WFRWW*WF",
        tile: 34,
        score: 6
    },
    {
        pattern: "*R*WWWFWF",
        tile: 31,
        score: 6
    },
    {
        pattern: "FW*WWRFW*",
        tile: 35,
        score: 6
    },

    // --- cross ---
    {
        pattern: "FWFWWWFWF",
        tile: 36,
        score: 7
    },

    {
        pattern: "FW*WWW*WF",
        tile: 36,
        score: 7
    },

    {
        pattern: "*WFWWWFW*",
        tile: 36,
        score: 7
    }

];

const WALL_TOP_AUTOTILE_RULES = {
    mapping: {
        40: 50,
    }
};

const WALL_OVERLAY_TILES = new Set([41]);

const WALL_NO_COLLISION_TILES = new Set([40, 41]);

// Door-aware post-autotiling rules for the TARGET cell (3x3 pattern).
// F/W/R = floor/wall/rock; n/s/e/w = door direction N/S/E/W;
// V = N or S door, H = E or W door, D = any door, * = any tile.
// fromTile is the base sprite from WALL_AUTOTILE_RULES (0 = no wall).
// Read only the frozen base walls; higher score wins, then earlier rule.
const DOOR_AUTOTILE_RULES = [
    // North/South door tile.
    { pattern: "****V****", fromTile: 0, tile: 41, score: 10 },

    // Left wall of a North/South door.
    { pattern: "****WV***", fromTile: 12, tile: 11, score: 10 },
    { pattern: "****WV***", fromTile: 19, tile: 10, score: 10 },
    { pattern: "****WV***", fromTile: 13, tile: 32, score: 10 },
    { pattern: "****WV***", fromTile: 14, tile: 34, score: 10 },
    { pattern: "****WV***", fromTile: 16, tile: 20, score: 10 },
    { pattern: "****WV***", fromTile: 17, tile: 22, score: 10 },
    { pattern: "****WV***", fromTile: 21, tile: 31, score: 10 },
    { pattern: "****WV***", fromTile: 23, tile: 30, score: 10 },
    { pattern: "****WV***", fromTile: 33, tile: 36, score: 10 },

    // Right wall of a North/South door.
    { pattern: "***VW****", fromTile: 10, tile: 11, score: 10 },
    { pattern: "***VW****", fromTile: 19, tile: 12, score: 10 },
    { pattern: "***VW****", fromTile: 13, tile: 33, score: 10 },
    { pattern: "***VW****", fromTile: 15, tile: 35, score: 10 },
    { pattern: "***VW****", fromTile: 16, tile: 21, score: 10 },
    { pattern: "***VW****", fromTile: 17, tile: 23, score: 10 },
    { pattern: "***VW****", fromTile: 20, tile: 31, score: 10 },
    { pattern: "***VW****", fromTile: 22, tile: 30, score: 10 },
    { pattern: "***VW****", fromTile: 32, tile: 36, score: 10 },

    // West/East door tile.
    { pattern: "****H****", fromTile: 0, tile: 40, score: 10 },

    // Wall above a West/East door.
    { pattern: "****W**H*", fromTile: 10, tile: 20, score: 10 },
    { pattern: "****W**H*", fromTile: 11, tile: 31, score: 10 },
    { pattern: "****W**H*", fromTile: 12, tile: 21, score: 10 },
    { pattern: "****W**H*", fromTile: 17, tile: 13, score: 10 },
    { pattern: "****W**H*", fromTile: 18, tile: 16, score: 10 },
    { pattern: "****W**H*", fromTile: 19, tile: 16, score: 10 },
    { pattern: "****W**H*", fromTile: 22, tile: 32, score: 10 },
    { pattern: "****W**H*", fromTile: 23, tile: 33, score: 10 },
    { pattern: "****W**H*", fromTile: 28, tile: 20, score: 10 },
    { pattern: "****W**H*", fromTile: 29, tile: 21, score: 10 },
    { pattern: "****W**H*", fromTile: 30, tile: 36, score: 10 },

    // Wall below a West/East door: add a north connection.
    { pattern: "*H**W****", fromTile: 10, tile: 22, score: 10 },
    { pattern: "*H**W****", fromTile: 11, tile: 30, score: 10 },
    { pattern: "*H**W****", fromTile: 12, tile: 23, score: 10 },
    { pattern: "*H**W****", fromTile: 16, tile: 13, score: 10 },
    { pattern: "*H**W****", fromTile: 18, tile: 17, score: 10 },
    { pattern: "*H**W****", fromTile: 19, tile: 17, score: 10 },
    { pattern: "*H**W****", fromTile: 20, tile: 32, score: 10 },
    { pattern: "*H**W****", fromTile: 21, tile: 33, score: 10 },
    { pattern: "*H**W****", fromTile: 26, tile: 35, score: 10 },
    { pattern: "*H**W****", fromTile: 27, tile: 34, score: 10 },
    { pattern: "*H**W****", fromTile: 28, tile: 22, score: 10 },
    { pattern: "*H**W****", fromTile: 29, tile: 23, score: 10 },
    { pattern: "*H**W****", fromTile: 31, tile: 36, score: 10 },

    // Diagonal door pairs.
    // West + North
    // *H*
    // VW*
    // ***
    { pattern: "*H*VW****", fromTile: 10, tile: 30, score: 20 },
    { pattern: "*H*VW****", fromTile: 12, tile: 23, score: 20 },
    { pattern: "*H*VW****", fromTile: 13, tile: 33, score: 20 },
    { pattern: "*H*VW****", fromTile: 16, tile: 33, score: 20 },
    { pattern: "*H*VW****", fromTile: 17, tile: 23, score: 20 },
    { pattern: "*H*VW****", fromTile: 19, tile: 23, score: 20 },
    { pattern: "*H*VW****", fromTile: 20, tile: 36, score: 20 },
    { pattern: "*H*VW****", fromTile: 22, tile: 30, score: 20 },
    { pattern: "*H*VW****", fromTile: 32, tile: 36, score: 20 },

    // East + North
    // *H*
    // *WV
    // ***
    { pattern: "*H**WV***", fromTile: 10, tile: 22, score: 20 },
    { pattern: "*H**WV***", fromTile: 12, tile: 30, score: 20 },
    { pattern: "*H**WV***", fromTile: 13, tile: 32, score: 20 },
    { pattern: "*H**WV***", fromTile: 16, tile: 32, score: 20 },
    { pattern: "*H**WV***", fromTile: 17, tile: 22, score: 20 },
    { pattern: "*H**WV***", fromTile: 19, tile: 22, score: 20 },
    { pattern: "*H**WV***", fromTile: 21, tile: 36, score: 20 },
    { pattern: "*H**WV***", fromTile: 23, tile: 30, score: 20 },
    { pattern: "*H**WV***", fromTile: 33, tile: 36, score: 20 },

    // West + South
    // ***
    // VW*
    // *H*
    { pattern: "***VW**H*", fromTile: 10, tile: 31, score: 20 },
    { pattern: "***VW**H*", fromTile: 11, tile: 31, score: 20 },
    { pattern: "***VW**H*", fromTile: 12, tile: 21, score: 20 },
    { pattern: "***VW**H*", fromTile: 13, tile: 33, score: 20 },
    { pattern: "***VW**H*", fromTile: 16, tile: 21, score: 20 },
    { pattern: "***VW**H*", fromTile: 17, tile: 33, score: 20 },
    { pattern: "***VW**H*", fromTile: 18, tile: 21, score: 20 },
    { pattern: "***VW**H*", fromTile: 19, tile: 21, score: 20 },
    { pattern: "***VW**H*", fromTile: 20, tile: 31, score: 20 },
    { pattern: "***VW**H*", fromTile: 22, tile: 36, score: 20 },
    { pattern: "***VW**H*", fromTile: 23, tile: 33, score: 20 },
    { pattern: "***VW**H*", fromTile: 28, tile: 31, score: 20 },
    { pattern: "***VW**H*", fromTile: 29, tile: 21, score: 20 },
    { pattern: "***VW**H*", fromTile: 30, tile: 36, score: 20 },
    { pattern: "***VW**H*", fromTile: 32, tile: 36, score: 20 },

    // East + South
    // ***
    // *WV
    // *H*
    { pattern: "****WV*H*", fromTile: 10, tile: 20, score: 20 },
    { pattern: "****WV*H*", fromTile: 11, tile: 31, score: 20 },
    { pattern: "****WV*H*", fromTile: 12, tile: 31, score: 20 },
    { pattern: "****WV*H*", fromTile: 13, tile: 32, score: 20 },
    { pattern: "****WV*H*", fromTile: 16, tile: 20, score: 20 },
    { pattern: "****WV*H*", fromTile: 17, tile: 32, score: 20 },
    { pattern: "****WV*H*", fromTile: 18, tile: 20, score: 20 },
    { pattern: "****WV*H*", fromTile: 19, tile: 20, score: 20 },
    { pattern: "****WV*H*", fromTile: 21, tile: 31, score: 20 },
    { pattern: "****WV*H*", fromTile: 22, tile: 32, score: 20 },
    { pattern: "****WV*H*", fromTile: 23, tile: 36, score: 20 },
    { pattern: "****WV*H*", fromTile: 28, tile: 20, score: 20 },
    { pattern: "****WV*H*", fromTile: 29, tile: 31, score: 20 },
    { pattern: "****WV*H*", fromTile: 30, tile: 36, score: 20 },
    { pattern: "****WV*H*", fromTile: 33, tile: 36, score: 20 },

];

// Multi-door combinations. These expand into ordinary pattern/fromTile/tile rules,
// so MapAutotiler needs no changes. Directions refer to positions AROUND a wall;
// H is an E/W door (above/below), V is an N/S door (left/right).
const DOOR_WALL_CONNECTIONS = {
    10:'E', 11:'WE', 12:'W', 13:'NS', 14:'NS', 15:'NS',
    16:'S', 17:'N', 18:'', 19:'', 20:'ES', 21:'WS',
    22:'NE', 23:'NW', 24:'NE', 25:'NW', 26:'WS', 27:'ES',
    28:'E', 29:'W', 30:'NWE', 31:'SWE', 32:'NSE',
    33:'NSW', 34:'NSE', 35:'NSW', 36:'NSEW'
};

// A rock-facing side cannot also contain a door.
const DOOR_WALL_ROCK_SIDE = {
    14:'W', 15:'E', 24:'W', 25:'E', 26:'E', 27:'W', 34:'W', 35:'E'
};

const DOOR_LINK_BITS = {N:1, E:2, S:4, W:8};
const DOOR_TILE_BY_LINKS = {
    0:19, 1:17, 2:10, 3:22, 4:16, 5:13, 6:20, 7:32,
    8:12, 9:23, 10:11, 11:30, 12:21, 13:33, 14:31, 15:36
};

// Keep the rock-sensitive sprite when its topology permits the connection.
const DOOR_TILE_BY_LINKS_AND_ROCK = {
    '5W':14, '5E':15, '3W':24, '9E':25,
    '12E':26, '6W':27, '7W':34, '13E':35
};

const DOOR_MULTI_PATTERNS = [
    // Opposite door pairs.
    {pattern:'*H**W**H*', directions:'NS', score:20},
    {pattern:'***VWV***', directions:'WE', score:20},

    // Three doors, one side missing.
    {pattern:'*H*VW**H*', directions:'NSW', score:30},
    {pattern:'*H**WV*H*', directions:'NSE', score:30},
    {pattern:'*H*VWV***', directions:'NWE', score:30},
    {pattern:'***VWV*H*', directions:'SWE', score:30},

    // Four doors.
    {pattern:'*H*VWV*H*', directions:'NSEW', score:40}
];

function addDoorMultiRules(rules = DOOR_AUTOTILE_RULES) {
    const maskOf = directions => [...directions].reduce((mask, dir) => mask | DOOR_LINK_BITS[dir], 0);

    for(const group of DOOR_MULTI_PATTERNS) {
        const doorMask = maskOf(group.directions);
        for(const [fromTileText, connections] of Object.entries(DOOR_WALL_CONNECTIONS)) {
            const fromTile = Number(fromTileText);
            const rockSide = DOOR_WALL_ROCK_SIDE[fromTile];
            if(rockSide != null && (doorMask & DOOR_LINK_BITS[rockSide])) continue;

            const mask = maskOf(connections) | doorMask;
            const key = String(mask) + (rockSide || '');
            const tile = rockSide != null
                ? DOOR_TILE_BY_LINKS_AND_ROCK[key]
                : DOOR_TILE_BY_LINKS[mask];
            if(tile == null) throw new Error('No wall sprite for '+key);
            // Identity rules are intentional: they suppress lower-score rules.
            rules.push({pattern:group.pattern, fromTile, tile, score:group.score});
        }
    }
    return rules;
}

addDoorMultiRules();