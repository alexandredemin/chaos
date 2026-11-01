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

// Door-aware post-autotiling rules. Each rule describes the 3x3 neighborhood of
// the TARGET cell, not an offset from a door. D is a visible door (hidden doors
// remain ordinary rock). The center is W for an affected wall or D for the door.
// fromTile is the tile from the completed WALL_AUTOTILE_RULES pass (0 means no wall).
// directions constrains the door at the D position in the pattern.
// Rules read a frozen base-wall snapshot; higher score wins, then earlier rule.
const DOOR_AUTOTILE_RULES = [
    // North/South door tile.
    { pattern: "****D****", directions: ['N', 'S'], fromTile: 0, tile: 41, score: 10 },

    // Left wall of a North/South door.
    { pattern: "****WD***", directions: ['N', 'S'], fromTile: 12, tile: 11, score: 10 },
    { pattern: "****WD***", directions: ['N', 'S'], fromTile: 19, tile: 11, score: 10 },
    { pattern: "****WD***", directions: ['N', 'S'], fromTile: 13, tile: 32, score: 10 },
    { pattern: "****WD***", directions: ['N', 'S'], fromTile: 14, tile: 34, score: 10 },
    { pattern: "****WD***", directions: ['N', 'S'], fromTile: 16, tile: 20, score: 10 },
    { pattern: "****WD***", directions: ['N', 'S'], fromTile: 17, tile: 22, score: 10 },
    { pattern: "****WD***", directions: ['N', 'S'], fromTile: 21, tile: 31, score: 10 },
    { pattern: "****WD***", directions: ['N', 'S'], fromTile: 23, tile: 30, score: 10 },
    { pattern: "****WD***", directions: ['N', 'S'], fromTile: 33, tile: 36, score: 10 },

    // Right wall of a North/South door.
    { pattern: "***DW****", directions: ['N', 'S'], fromTile: 10, tile: 11, score: 10 },
    { pattern: "***DW****", directions: ['N', 'S'], fromTile: 19, tile: 11, score: 10 },
    { pattern: "***DW****", directions: ['N', 'S'], fromTile: 13, tile: 33, score: 10 },
    { pattern: "***DW****", directions: ['N', 'S'], fromTile: 15, tile: 35, score: 10 },
    { pattern: "***DW****", directions: ['N', 'S'], fromTile: 16, tile: 21, score: 10 },
    { pattern: "***DW****", directions: ['N', 'S'], fromTile: 17, tile: 23, score: 10 },
    { pattern: "***DW****", directions: ['N', 'S'], fromTile: 20, tile: 31, score: 10 },
    { pattern: "***DW****", directions: ['N', 'S'], fromTile: 22, tile: 30, score: 10 },
    { pattern: "***DW****", directions: ['N', 'S'], fromTile: 32, tile: 36, score: 10 },

    // West/East door tile.
    { pattern: "****D****", directions: ['W', 'E'], fromTile: 0, tile: 40, score: 10 },

    // Wall above a West/East door.
    { pattern: "****W**D*", directions: ['W', 'E'], fromTile: 10, tile: 20, score: 10 },
    { pattern: "****W**D*", directions: ['W', 'E'], fromTile: 11, tile: 31, score: 10 },
    { pattern: "****W**D*", directions: ['W', 'E'], fromTile: 12, tile: 21, score: 10 },
    { pattern: "****W**D*", directions: ['W', 'E'], fromTile: 17, tile: 13, score: 10 },
    { pattern: "****W**D*", directions: ['W', 'E'], fromTile: 18, tile: 16, score: 10 },
    { pattern: "****W**D*", directions: ['W', 'E'], fromTile: 19, tile: 16, score: 10 },
    { pattern: "****W**D*", directions: ['W', 'E'], fromTile: 22, tile: 32, score: 10 },
    { pattern: "****W**D*", directions: ['W', 'E'], fromTile: 23, tile: 33, score: 10 },
    { pattern: "****W**D*", directions: ['W', 'E'], fromTile: 28, tile: 20, score: 10 },
    { pattern: "****W**D*", directions: ['W', 'E'], fromTile: 29, tile: 21, score: 10 },
    { pattern: "****W**D*", directions: ['W', 'E'], fromTile: 30, tile: 36, score: 10 },

    // Wall below a West/East door.
    { pattern: "*D**W****", directions: ['W', 'E'], fromTile: 10, tile: 28, score: 10 },
    { pattern: "*D**W****", directions: ['W', 'E'], fromTile: 12, tile: 29, score: 10 },

];

const WALL_OVERLAY_TILES = new Set([41]);

const WALL_NO_COLLISION_TILES = new Set([40, 41]);