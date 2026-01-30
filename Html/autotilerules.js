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
        tile: 13,
        score: 3
    },

    // --- isolated wall ---
    {
        pattern: "*F*FWF*F*",
        tile: 11,
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
        pattern: "FW*WW****",
        tile: 25,
        score: 3
    },
    {
        pattern: "*WF*WW***",
        tile: 24,
        score: 3
    },
    {
        pattern: "***WW*FW*",
        tile: 26,
        score: 3
    },
    {
        pattern: "****WW*WF",
        tile: 27,
        score: 3
    },

    // --- T-junctions ---
    {
        pattern: "*W*WWW***",
        tile: 30,
        score: 4
    },
    {
        pattern: "***WWW*W*",
        tile: 31,
        score: 4
    },
    {
        pattern: "*W**WW*W*",
        tile: 32,
        score: 4
    },
    {
        pattern: "*W*WW**W*",
        tile: 33,
        score: 4
    }
    /*
    // --- cross ---
    {
        pattern: "*W*WWW*W*",
        tile: 293,
        score: 4
    }
        */

];