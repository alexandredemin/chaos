/*
F - floor
W - wall
R - rock
* - any
*/

const WALL_AUTOTILE_RULES = [

    // --- isolated wall ---
    {
        pattern: "*********",
        tile: 0
    },

    // --- straight walls ---
    {
        pattern: "***WWW***",
        tile: 67
    },
    {
        pattern: "*W**W**W*",
        tile: 256
    },

    // --- corners ---
    {
        pattern: "****WW*W*",
        tile: 258
    },
    {
        pattern: "***WW**W*",
        tile: 259
    },
    {
        pattern: "****W**WW",
        tile: 322
    },
    {
        pattern: "****W*WW*",
        tile: 323
    },

    // --- T-junctions ---
    {
        pattern: "*W*WWW***",
        tile: 260
    },
    {
        pattern: "***WWW*W*",
        tile: 292
    },
    {
        pattern: "*W**WW*W*",
        tile: 261
    },
    {
        pattern: "*W*WW**W*",
        tile: 292
    },

    // --- cross ---
    {
        pattern: "*W*WWW*W*",
        tile: 293
    }

];