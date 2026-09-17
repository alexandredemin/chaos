// Central tuning for procedural map generation and map content.
// Scenario/ZoneGraph specs may override geometry values, but generic defaults and balance policies live here.
const MAP_GENERATION_CONFIG = {
	map: {
		defaultWidth: 20,
		defaultHeight: 20,
		minWidth: 20,
		minHeight: 20,
		tileSize: 16
	},

	layout: {
		defaultWidth: 40,
		defaultHeight: 40,
		margin: 1,
		autoMaxBacktracks: 50000,
		defaultZone: { weight: 1, minWidth: 5, minHeight: 5 },
		arenaZone: { weight: 4, minWidth: 8, minHeight: 8 }
	},

	// Defaults consumed by DungeonGenerator and ZoneGraph specs.
	geometry: {
		seed: 1,
		specialCount: 2,
		allowUnzonedAlcoves: false,
		loopRatio: .15,
		zoneAttempts: 40,
		minRoomSize: 4,
		maxRoomSize: 14,
		roomAreaTarget: 68,
		maxRoomsPerZone: 12,
		specialMinRoomSize: 4,
		specialMaxRoomSize: 7,
		alcoveRoomCount: 2,
		alcoveRoomMin: 2,
		alcoveRoomMax: 3,
		alcoveRoomTunnel: 4,
		alcoveNicheCount: 3,
		alcoveNicheMin: 1,
		alcoveNicheMax: 2,
		alcoveNicheTunnel: 1,
		resolvedLayoutAllowsUnzonedAlcoves: true,
		retries: {
			scenarioPasses: 8,
			skirmishPrimaryPasses: 8,
			skirmishDegradedPasses: 4,
			fullLoopPasses: 4,
			degradedLoopFactor: .35
		}
	},

	// Generic skirmish recipe built on top of the reusable 3x3 arena topology.
	skirmish: {
		defaultSpecialCount: 4,
		maxSpecialCount: 8,
		factoryFallbackSpecialCount: 2,
		cornerSpecialMinSpan: 5,
		middleSpecialMinSpan: 7,
		specialTypes: ['treasury', 'library']
	},

	portals: {
		priority: {
			special_entrance: 50,
			alcove_entrance: 40,
			alcove_tunnel_entrance: 35,
			room_entrance: 30,
			zone_gate: 20
		},
		alcoveSecondDoorMinTunnelLength: 3
	},

	autotile: {
		groundTileIndex: 2,
		wallTileIndex: 1
	},

	content: {
		startCount: 4,
		factionId: 'dungeon_creatures',
		placement: {
			freeRoomCellAttempts: 60,
			wardrobeCellAttempts: 40,
			doorClearance: 1
		},

		doors: {
			specialEntranceLock: { locked: true, type: 'key', consumeKey: false },
			keyNames: {
				library: 'Library key',
				treasury: 'Treasury key',
				default: 'Special room key'
			}
		},

		loot: {
			premiumPotions: ['strength_potion', 'defense_potion', 'speed_potion', 'invisible_potion', 'mana_potion'],
			spellCostTiers: {
				normal: { min: 0, max: 4 },
				rare: { min: 5, max: 7 },
				legendary: { min: 8, max: Infinity }
			},
			scrolls: {
				normal: { points: [8, 14], legendaryChance: 0 },
				locked: { points: [10, 18], legendaryChance: .25 },
				special: { points: [12, 20], legendaryChance: .45 },
				expensiveSpellCost: 8,
				expensiveSpellAmount: 1,
				maxAmount: 12
			},
			tiers: {
				library: { scrollChance: .75, fallbackItems: ['mana_potion', 'invisible_potion'] },
				treasury: { scrollChance: .35 },
				locked: { scrollChance: .45 }
			}
		},

		containers: {
			looseItems: { chancePercent: 70, count: [1, 2], attempts: 20 },
			chests: { chancePercent: 30, lootCount: [1, 5], attempts: 20 },
			wardrobes: { chancePercent: 20, maxPerRoom: 3, lootCount: [1, 4] },
			specialRooms: {
				treasury: { containerCount: [3, 5], lootCount: [3, 5] },
				library: { containerCount: [3, 5], lootCount: [2, 4] }
			},
			monsterSpawn: {
				common: {
					probability: .30,
					minCount: 1,
					maxCount: 2,
					sameTypePerBatch: true,
					minSpawnRadius: 1,
					spawnRadius: 2,
					allowPassableEntityCells: true,
					behavior: { type: 'roam', minGoalDistance: 8, maxGoalDistance: 24, goalTolerance: 1, stuckTurnLimit: 3, aggroRadius: 6, pursuitRadius: 12,
						pursuitCooldownTurns: 1, targetAggression: 1, travelAggression: 3, combatAggression: 6 }
				},
				chest: {
					monsterTypes: ['rat'],
					spawnEffect: { type: 'burst', initialScale: .25, launchScale: .72, overshootScale: 1.10, sourceOffsetX: 0, sourceOffsetY: -2,
						jumpHeight: 7, launchDuration: 110, moveDuration: 240, settleDuration: 90, staggerDelay: 90, maxStaggerDelay: 360, playMoveAnimation: true }
				},
				wardrobe: {
					monsterTypes: ['rat', 'bat'],
					spawnEffect: { type: 'emerge', initialScale: .18, intermediateScale: .45, initialAlpha: .35, sourceOffsetX: 0, sourceOffsetY: 4,
						emergeLift: 2, emergeDuration: 150, moveDuration: 320, staggerDelay: 100, maxStaggerDelay: 400, playMoveAnimation: true }
				}
			}
		},

		locks: {
			common: {
				minContainers: 4,
				fraction: .12,
				keyId: 'common',
				keyName: 'Common key',
				consumeKey: true,
				fallbackChestLootCount: [1, 2]
			},
			specialKeyCandidateTopFraction: .30
		},

		guards: {
			excludedUnitTypes: ['wizard', 'rat', 'bat'],
			minContainersInRoom: 2,
			extraGuardChance: .40,
			maxGuardsPerRoom: 2,
			minAggroRadius: 4,
			leashExtra: 3,
			patrolRadius: 3,
			aggression: 4,
			patrolAggression: 2,
			returnAggression: 1
		},

		roamingCreatures: {
			baseArea: 20 * 20,
			centralRoomMinCount: 4,
			centralRoomFraction: .5,
			profiles: [
				{
					count: [1, 2], types: ['chort', 'muddy', 'demon', 'troll'], minDistance: 3,
					behavior: { type: 'roam', minGoalDistance: 16, maxGoalDistance: 40, goalTolerance: 1, stuckTurnLimit: 3, aggroRadius: 7,
						pursuitRadius: 14, pursuitCooldownTurns: 1, targetAggression: 1, travelAggression: 3, combatAggression: 6 }
				},
				{
					count: [5, 7], types: ['rat', 'bat'], minDistance: 2,
					behavior: { type: 'roam', minGoalDistance: 8, maxGoalDistance: 24, goalTolerance: 1, stuckTurnLimit: 3, aggroRadius: 4,
						pursuitRadius: 7, pursuitCooldownTurns: 2, targetAggression: .1, travelAggression: .5, combatAggression: 2 }
				}
			]
		},

		monsterGenerators: {
			baseArea: 20 * 20,
			maxPerMap: 5,
			roomsPerGeneratorCap: 3,
			minScaleFactor: 1.5,
			maxScaleFactor: 2,
			baseBehavior: { type: 'roam', minGoalDistance: 8, maxGoalDistance: 24, goalTolerance: 1, stuckTurnLimit: 3, aggroRadius: 5, pursuitRadius: 10, pursuitCooldownTurns: 1 },
			profiles: [
				{ type: 'rat', weight: 42, spawnChance: .18, minCount: 1, maxCount: 2, cooldownRounds: 1, maxAlive: 4, maxTotal: 10,
					behavior: { targetAggression: .35, travelAggression: 1, combatAggression: 3 } },
				{ type: 'bat', weight: 35, spawnChance: .18, minCount: 1, maxCount: 2, cooldownRounds: 1, maxAlive: 4, maxTotal: 10,
					behavior: { aggroRadius: 6, pursuitRadius: 12, targetAggression: .45, travelAggression: 1, combatAggression: 3 } },
				{ type: 'spider', weight: 16, spawnChance: .12, minCount: 1, maxCount: 1, cooldownRounds: 2, maxAlive: 3, maxTotal: 6,
					behavior: { targetAggression: .7, travelAggression: 2, combatAggression: 4 } },
				{ type: 'muddy', weight: 4, strong: true, spawnChance: .08, minCount: 1, maxCount: 1, cooldownRounds: 3, maxAlive: 1, maxTotal: 3,
					behavior: { minGoalDistance: 14, maxGoalDistance: 36, aggroRadius: 7, pursuitRadius: 14, targetAggression: 1, travelAggression: 3, combatAggression: 6 } },
				{ type: 'chort', weight: 3, strong: true, spawnChance: .10, minCount: 1, maxCount: 1, cooldownRounds: 3, maxAlive: 2, maxTotal: 4,
					behavior: { minGoalDistance: 14, maxGoalDistance: 36, aggroRadius: 7, pursuitRadius: 14, targetAggression: 1, travelAggression: 3, combatAggression: 6 } }
			],
			visual: { visualSprite: 'hole', visualScale: 1, visualFrame: 0, visualOriginMode: 'center', depthOffset: -40, blocksLOS: false, passable: true, stepCost: 1, destructible: false },
			spawn: { enabled: true, minSpawnRadius: 1, spawnRadius: 2, allowPassableEntityCells: false },
			strongSpawnEffect: { type: 'burst', initialScale: .2, launchScale: .7, overshootScale: 1.1, jumpHeight: 6, launchDuration: 120,
				moveDuration: 250, settleDuration: 90, staggerDelay: 100, playMoveAnimation: true },
			normalSpawnEffect: { type: 'emerge', initialScale: .15, intermediateScale: .4, initialAlpha: .35, sourceOffsetY: 3, emergeLift: 2,
				emergeDuration: 150, moveDuration: 300, staggerDelay: 100, playMoveAnimation: true }
		}
	}
};

globalThis.MAP_GENERATION_CONFIG = MAP_GENERATION_CONFIG;
