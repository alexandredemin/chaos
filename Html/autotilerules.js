/*
F - floor
W - wall
R - rock
* - any
*/

const WALL_AUTOTILE_RULES = [

    // --- isolated wall ---
    {
        pattern: "****W****",
        tile: 99,
        score: 1
    },

    // --- straight walls ---
    {
        pattern: "***WWW*F*",
        tile: 34,
        score: 2
    },
    {
        pattern: "*F*WWW***",
        tile: 2,
        score: 2
    },
    {
        pattern: "*W**WF*W*",
        tile: 257,
        score: 2
    },
    {
        pattern: "*W*FW**W*",
        tile: 256,
        score: 2
    },
    /*
    {
        pattern: "*R*WWW***",
        tile: 34,
        score: 2
    },
    {
        pattern: "***WWW*R*",
        tile: 2,
        score: 2
    },
    {
        pattern: "*W*RW**W*",
        tile: 257,
        score: 2
    },
    {
        pattern: "*W**WR*W*",
        tile: 256,
        score: 2
    },
    
    {
        pattern: "*W*WWW***",
        tile: 34,
        score: 2
    },
    {
        pattern: "***WWW*W*",
        tile: 2,
        score: 2
    },
    {
        pattern: "*W*WW**W*",
        tile: 257,
        score: 2
    },
    {
        pattern: "*W**WW*W*",
        tile: 256,
        score: 2
    },
    */
    // --- thin straight walls ---
    {
        pattern: "*W*FWF*W*",
        tile: 256,
        score: 3
    },

    // --- ends ---
    {
        pattern: "*F*WWF*F*",
        tile: 323,
        score: 3
    },
    {
        pattern: "*F*FWW*F*",
        tile: 322,
        score: 3
    },
    {
        pattern: "*F*FWF*W*",
        tile: 224,
        score: 3
    },
    {
        pattern: "*W*FWF*F*",
        tile: 288,
        score: 3
    },
    
    
    // --- outer corners ---
    {
        pattern: "*F*FWW*W*",
        tile: 224,
        score: 3
    },
    {
        pattern: "*F*WWF*W*",
        tile: 225,
        score: 3
    },
    {
        pattern: "*W*FWW*F*",
        tile: 288,
        score: 3
    },
    {
        pattern: "*W*WWF*F*",
        tile: 289,
        score: 3
    },

    // --- inner corners ---
    {
        pattern: "FW*WW****",
        tile: 260,
        score: 3
    },
    {
        pattern: "*WF*WW***",
        tile: 261,
        score: 3
    },
    {
        pattern: "***WW*FW*",
        tile: 292,
        score: 3
    },
    {
        pattern: "****WW*WF",
        tile: 293,
        score: 3
    },


    /*
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
        */

];