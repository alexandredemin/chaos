//---------------------------- Entities configs ----------------------------
const entityConfigs = {
    'fire': {
        name: 'fire',
        sprite: 'fire',
        scale: 0.32,
        features: {
            health: 2,
            strength: 2,
            survival: 0.25,
            propagation: 0.5,
            slowdown: 0.5,
            tfStrength: 0.75,
            tfDefense: 0.75
        },
        createFunction: (scene,x,y) => FireEntity.create(scene,x,y)
    },

    'web': {
        name: 'web',
        sprite: 'web',
        scale: 0.15,
        features: {
            health: 1,
            strength: 3,
            tfStrength: 0.5,
            tfDefense: 0.5
        },
        createFunction: (scene,x,y) => WebEntity.create(scene,x,y)
    },

    'glue_blob1': {
        name: 'glue blob',
        sprite: 'glue_blob1',
        scale: 0.15,
        features: {
            health: 2,
            strength: 3,
            survival: 1.0,
            propagation: 0.125,
            slowdown: 0.25,
            tfStrength: 0.25,
            tfDefense: 0.25
        },
        createFunction: (scene,x,y) => GlueBlobEntity.create(scene,x,y)
    },

    'glue_blob2': {
        name: 'glue blob',
        sprite: 'glue_blob2',
        scale: 0.15,
        features: {
            health: 2,
            strength: 3,
            survival: 1.0,
            propagation: 0.125,
            slowdown: 0.25,
            tfStrength: 0.25,
            tfDefense: 0.25
        },
        createFunction: (scene,x,y) => GlueBlobEntity.create(scene,x,y)
    },

    'pentagram': {
        name: 'pentagram',
        sprite: 'pentagram',
        scale: 0.15,
        features: {
            health: 1,
            rewardFrequency: 2,
            mana: 1,
        },
        createFunction: (scene,x,y) => PentagramEntity.create(scene,x,y)
    },
};

//---------------------------- Unit configs ----------------------------
const unitConfigs = {
    'wizard': {
        name: 'wizard',
        sprite: 'wizard',
        scale: 0.9,
        features: {
            move: 2,
            health: 2,
            strength: 2,
            defense: 2,
            abilityPoints: 1,
            mana: 4,
        },
        abilities: {
            conjure: {
                type: 'conjure',
                config: {
                }
            }
        }
    },

    'goblin': {
        name: 'goblin',
        sprite: 'goblin',
        scale: 0.9,
        features: {
            move: 2,
            health: 1,
            strength: 1,
            defense: 1,
            abilityPoints: 1,
        }
    },

    'troll': {
        name: 'troll',
        sprite: 'troll',
        scale: 0.75,
        features: {
            move: 2,
            health: 3,
            strength: 5,
            defense: 5,
            abilityPoints: 1,
        }
    },

    'imp': {
        name: 'imp',
        sprite: 'imp',
        scale: 0.9,
        features: {
            move: 3,
            health: 1,
            strength: 1,
            defense: 1,
            abilityPoints: 1,
        }
    },

    'chort': {
        name: 'chort',
        sprite: 'chort',
        scale: 0.9,
        features: {
            move: 3,
            health: 2,
            strength: 3,
            defense: 3,
            abilityPoints: 1,
        }
    },

    'demon': {
        name: 'demon',
        sprite: 'demon',
        scale: 0.75,
        features: {
            move: 2,
            health: 3,
            strength: 5,
            defense: 4,
            abilityPoints: 1,
        },
        abilities: {
            fire: {
                type: 'fire',
                config: {
                    range: 10,
                    damage: 3
                }
            }
        }
    },

    'muddy': {
        name: 'muddy',
        sprite: 'muddy',
        scale: 0.9,
        features: {
            move: 2,
            health: 2,
            strength: 3,
            defense: 5,
            abilityPoints: 1,
        },
        abilities: {
            gas: {
                type: 'gas',
                config: {
                    range: 2,
                    damage: 3
                }
            }
        }
    },

    'rat': {
        name: 'rat',
        sprite: 'rat',
        scale: 0.9,
        features: {
            move: 3,
            health: 1,
            strength: 1,
            defense: 1,
            abilityPoints: 1,
        },
        atack_features: {
            infectious: {
                type: 'infectious'
            }
        }
    },

    'spider': {
        name: 'spider',
        sprite: 'spider',
        scale: 0.55,
        features: {
            move: 3,
            health: 2,
            strength: 2,
            defense: 2,
            abilityPoints: 1,
        },
        abilities: {
            web: {
                type: 'web',
                config: {
                    strength: 2
                }
            }
        }
    },
};

//---------------------------- Spell configs ----------------------------
const spellConfigs = {
    'goblin': {
        name: 'goblin',
        type: 'summon',
        icon: 'goblin',
        scale: 2.0,
        description: 'Summon goblin.\nCost 1',
        cost: 1,
    },
    'troll': {
        name: 'troll',
        type: 'summon',
        icon: 'troll',
        scale: 1.5,
        description: 'Summon troll.\nCost 6',
        cost: 6,
    },
    'imp': {
        name: 'imp',
        type: 'summon',
        icon: 'imp',
        scale: 2.0,
        description: 'Summon imp.\nCost 2',
        cost: 2,
    },
    'chort': {
        name: 'chort',
        type: 'summon',
        icon: 'chort',
        scale: 2.0,
        description: 'Summon chort.\nCost 3',
        cost: 3,
    },
    'demon': {
        name: 'demon',
        type: 'summon',
        icon: 'demon',
        scale: 1.5,
        description: 'Summon demon.\nCost 7',
        cost: 7,
    },
    'muddy': {
        name: 'muddy',
        type: 'summon',
        icon: 'muddy',
        scale: 2.0,
        description: 'Summon muddy.\nCost 4',
        cost: 4,
    },
    'rat': {
        name: 'rat',
        type: 'summon',
        icon: 'rat',
        scale: 2.0,
        description: 'Summon rat.\nCost 2',
        cost: 2,
    },
    'spider': {
        name: 'spider',
        type: 'summon',
        icon: 'spider',
        scale: 1.1,
        description: 'Summon spider.\nCost 5',
        cost: 5,
    },
    'fire': {
        name: 'fire',
        type: 'entity',
        entity: 'fire',
        icon: 'fire',
        scale: 0.64,
        description: 'Magic fire.\nCost 6',
        cost: 6,
        range: 10,
    },
    'glue_blob': {
        name: 'glue blob',
        type: 'entity',
        entity: 'glue_blob1',
        icon: 'glue_blob1',
        scale: 0.3,
        description: 'Glue blob.\nCost 6',
        cost: 6,
        range: 10,
    },
    'fireball': {
        name: 'fire ball',
        type: 'atack',
        icon: 'fireball',
        scale: 0.3,
        description: 'Fireball.\nCost 5',
        cost: 5,
        range: 10,
        damage: 5,
    },
    'lightning': {
        name: 'lightning',
        type: 'atack_place',
        icon: 'lightning',
        scale: 0.45,
        description: 'Lightning.\nCost 8',
        cost: 8,
        range: 10,
        damage: 10,
        damageRange: 2,
    },
    'pentagram': {
        name: 'pentagram',
        type: 'self',
        entity: 'pentagram',
        icon: 'pentagram',
        scale: 0.3,
        description: 'Magic pentagram increases mana.\nCost 7',
        cost: 7,
        range: 0,
    },
};

//---------------------------- Spell types ----------------------------
const spellTypes = {
    'summon': null,
    'self': null,
    'entity': null,
    'atack': null,
    'atack_place': null,
};


//---------------------------- Attack features ----------------------------
const atackFeatures = {
    'infectious': null
}

//---------------------------- Unit abilities ----------------------------

const abilities = {
    'conjure': null,
    'fire': null,
    'gas': null,
    'web': null
};