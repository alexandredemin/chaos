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
    { pattern: "****WV***", fromTile: 19, tile: 11, score: 10 },
    { pattern: "****WV***", fromTile: 13, tile: 32, score: 10 },
    { pattern: "****WV***", fromTile: 14, tile: 34, score: 10 },
    { pattern: "****WV***", fromTile: 16, tile: 20, score: 10 },
    { pattern: "****WV***", fromTile: 17, tile: 22, score: 10 },
    { pattern: "****WV***", fromTile: 21, tile: 31, score: 10 },
    { pattern: "****WV***", fromTile: 23, tile: 30, score: 10 },
    { pattern: "****WV***", fromTile: 33, tile: 36, score: 10 },

    // Right wall of a North/South door.
    { pattern: "***VW****", fromTile: 10, tile: 11, score: 10 },
    { pattern: "***VW****", fromTile: 19, tile: 11, score: 10 },
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

    // Wall below a West/East door.
    { pattern: "*H**W****", fromTile: 10, tile: 28, score: 10 },
    { pattern: "*H**W****", fromTile: 12, tile: 29, score: 10 },

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

const WALL_OVERLAY_TILES = new Set([41]);

const WALL_NO_COLLISION_TILES = new Set([40, 41]);