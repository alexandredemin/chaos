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

const DOOR_AUTOTILE_RULES = [
    {
        directions: ["N", "S"],
        offsets: [
            {
                dx: -1,
                dy: 0,
                replacements: {
                    12: 11,
                    19: 11,
                    13: 32,
                    14: 34,
                    16: 20,
                    17: 22,
                    21: 31,
                    23: 30,
                    33: 36,
                }
            },
            {
                dx: 1,
                dy: 0,
                replacements: {
                    10: 11,
                    19: 11,
                    13: 33,
                    15: 35,
                    16: 21,
                    17: 23,
                    20: 31,
                    22: 30,
                    32: 36,
                }
            }
        ]
    },
    {
        directions: ["W", "E"],
        offsets: [
            {
                dx: 0,
                dy: 0,
                replacements: {
                    0: 40
                }
            },
            {
                dx: 0,
                dy: -1,
                replacements: {
                    10: 20,
                    11: 31,
                    12: 21,
                    17: 13,
                    18: 16,
                    19: 16,
                    22: 32,
                    23: 33,
                    30: 36,
                }
            },
            {
                dx: 0,
                dy: 1,
                replacements: {
                    //10: 22,
                    //11: 30,
                    //12: 23,
                    //31: 36,
                }
            }
        ]
    }
];