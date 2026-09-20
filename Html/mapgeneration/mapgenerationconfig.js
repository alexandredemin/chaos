// Central tuning for procedural map generation and map content.
// Scenario/ZoneGraph specs may override geometry values, but generic defaults and balance policies live here.
const MAP_GENERATION_CONFIG = {
	// Base map dimensions and tile scale used by the random-map façade.
	map: {
		defaultWidth: 20, // Default map width when runtime config does not provide one.
		defaultHeight: 20, // Default map height when runtime config does not provide one.
		minWidth: 20, // Smallest width accepted by MapGenerator.
		minHeight: 20, // Smallest height accepted by MapGenerator.
		tileSize: 16 // Size of one map cell in world pixels.
	},

	// Generic ZoneGraph layout defaults used by manual/automatic planners.
	layout: {
		defaultWidth: 40, // Standalone/default layout width outside the production façade.
		defaultHeight: 40, // Standalone/default layout height outside the production façade.
		margin: 1, // Rock border reserved around the resolved zone layout.
		autoMaxBacktracks: 50000, // Search limit for AutomaticZoneLayoutPlanner.
		defaultZone: { weight: 1, minWidth: 5, minHeight: 5 }, // Default relative size and minimum dimensions of an ordinary zone.
		arenaZone: { weight: 4, minWidth: 8, minHeight: 8 } // Relative size and minimum dimensions of an arena zone.
	},

	// Dungeon geometry defaults consumed by DungeonGenerator and ZoneGraph specs.
	geometry: {
		seed: 1, // Deterministic fallback seed when none is supplied.
		specialCount: 2, // Generic geometry fallback; skirmish uses skirmish.defaultSpecialCount.
		allowUnzonedAlcoves: false, // Allow alcoves to use rock not assigned to a zone before layout resolution.
		loopRatio: .15, // Probability of selecting each eligible optional loop candidate.
		zoneAttempts: 40, // Stochastic retries for generating one zone before deterministic fallback.
		minRoomSize: 4, // Preferred minimum BSP room side length.
		maxRoomSize: 14, // Maximum generated ordinary-room side length.
		roomAreaTarget: 68, // Approximate zone area allocated per desired room; lower values create more rooms.
		maxRoomsPerZone: 12, // Hard upper bound on ordinary rooms generated inside one zone.
		specialMinRoomSize: 4, // Minimum side length of the locked special chamber.
		specialMaxRoomSize: 7, // Maximum side length of the locked special chamber.
		alcoveRoomCount: 2, // Desired number of full alcove rooms; fewer may be created if geometry is tight.
		alcoveRoomMin: 2, // Minimum alcove-room side length.
		alcoveRoomMax: 3, // Maximum alcove-room side length.
		alcoveRoomTunnel: 4, // Maximum tunnel length used to connect a full alcove.
		alcoveNicheCount: 3, // Desired number of small niches.
		alcoveNicheMin: 1, // Minimum niche side length.
		alcoveNicheMax: 2, // Maximum niche side length.
		alcoveNicheTunnel: 1, // Maximum tunnel length used to connect a niche.
		resolvedLayoutAllowsUnzonedAlcoves: true, // After layout resolution, alcoves may use spare rock between zones.

		// Retry/fallback policy for whole-map generation.
		retries: {
			scenarioPasses: 8, // Attempts for scenario-defined layouts.
			skirmishPrimaryPasses: 8, // Attempts using the requested skirmish settings.
			skirmishDegradedPasses: 4, // Attempts after reducing hard-to-fit skirmish settings.
			fullLoopPasses: 4, // Attempts that keep the requested loop ratio unchanged.
			degradedLoopFactor: .35 // Multiplier applied to loopRatio in degraded retries.
		}
	},

	// Generic skirmish recipe built on top of the reusable 3x3 arena topology.
	skirmish: {
		defaultSpecialCount: 2, // Default random battle: exactly two special zones.
		maxSpecialCount: 8, // Maximum number of perimeter slots that may become special.
		factoryFallbackSpecialCount: 2, // Fallback requested by the factory when a larger request cannot fit.
		cornerSpecialMinSpan: 5, // Minimum resolved corner-slot width/height required for a special zone.
		middleSpecialMinSpan: 7, // Minimum resolved edge-middle slot width/height required for a special zone.
		specialTypes: ['treasury', 'library'] // Assigned cyclically; with count=2 this gives one Treasury and one Library.
	},

	// Semantic portal and physical-door materialization rules.
	portals: {
		// Higher values win when several semantic portals resolve to the same cell.
		priority: {
			special_entrance: 50, // Locked entrance of a special chamber.
			alcove_entrance: 40, // Door at the alcove/niche chamber side.
			alcove_tunnel_entrance: 35, // Optional second door at the far end of a long alcove tunnel.
			room_entrance: 30, // Ordinary room entrance.
			zone_gate: 20 // Macro zone boundary; suppressed when a more specific nearby portal exists.
		},
		requireSideWalls: true, // Ordinary physical doors require rock/wall on both lateral sides; wide passages stay open.
		alcoveSecondDoorMinTunnelLength: 3 // Two alcove doors are used only when at least one floor cell remains between them.
	},

	// Tile indices used when converting semantic floor/rock geometry to the current tileset.
	autotile: {
		groundTileIndex: 2, // Default ground-layer tile.
		wallTileIndex: 1 // Default wall tile before autotile rules replace it.
	},

	// Game-content generation: starts, loot, locks, monsters and other gameplay objects.
	content: {
		startCount: 4, // Number of player start positions requested by default.
		factionId: 'dungeon_creatures', // Shared faction for neutral dungeon monsters.

		// Generic placement limits used by several content generators.
		placement: {
			freeRoomCellAttempts: 60, // Random attempts before falling back to a full room scan.
			wardrobeCellAttempts: 40, // Attempts to find a valid wall-aligned wardrobe position.
			doorClearance: 1 // Cells around doors avoided by monsters/guards and some objects.
		},

		// Door locks and display names for keys to special rooms.
		doors: {
			specialEntranceLock: { locked: true, type: 'key', consumeKey: false }, // Generic lock attached only to special-room entrance doors.
			keyNames: {
				library: 'Library key', // Display name for library keys.
				treasury: 'Treasury key', // Display name for treasury keys.
				default: 'Special room key' // Fallback name for future special-room types.
			}
		},

		// Loot quality tables shared by loose items, containers, alcoves and special rooms.
		loot: {
			premiumPotions: ['strength_potion', 'defense_potion', 'speed_potion', 'invisible_potion', 'mana_potion'], // Potion pool used by premium loot tiers.

			// Spell mana-cost bands used when choosing scroll contents.
			spellCostTiers: {
				normal: { min: 0, max: 4 }, // Cheap/common spells.
				rare: { min: 5, max: 7 }, // Mid/high-cost spells.
				legendary: { min: 8, max: Infinity } // Highest-cost spells.
			},

			// Scroll charge budget and legendary-spell chances by loot source.
			scrolls: {
				normal: { points: [8, 14], legendaryChance: 0 }, // Ordinary room/container scrolls.
				premium: { points: [10, 18], legendaryChance: .30 }, // Generic premium side-area loot.
				locked: { points: [10, 18], legendaryChance: .25 }, // Bonus loot added to common locked containers.
				special: { points: [12, 20], legendaryChance: .45 }, // Library/Treasury scrolls.
				expensiveSpellCost: 8, // Spells at or above this cost always use the fixed amount below.
				expensiveSpellAmount: 1, // Charge count for very expensive spells.
				maxAmount: 12 // Global maximum number of charges on a generated scroll.
			},

			// Probability that a generated item in each quality tier becomes a spell scroll.
			tiers: {
				premium: { scrollChance: .45 }, // Generic premium loot.
				library: { scrollChance: .75, fallbackItems: ['mana_potion', 'invisible_potion'] }, // Library heavily favors scrolls.
				treasury: { scrollChance: .35 }, // Treasury favors premium potions more than scrolls.
				locked: { scrollChance: .45 } // Extra reward inserted into common locked containers.
			}
		},

		// Guaranteed content placed in procedurally generated alcoves and niches.
		alcoves: {
			room: { lootCount: [1, 3], premiumChance: 1, chestMinLootCount: 3 }, // Full alcove: 1-3 premium items; 3+ items are packed into a chest.
			niche: { lootCount: [1, 2], premiumChance: .35 } // Niche: 1-2 loose items, each with a 35% premium chance.
		},

		// Ordinary and special-room containers plus their optional creature spawns.
		containers: {
			looseItems: { chancePercent: 70, count: [1, 2], attempts: 20 }, // Chance per ordinary room to place 1-2 loose items.
			chests: { chancePercent: 30, lootCount: [1, 5], attempts: 20 }, // Chance per ordinary room to place one chest and its loot range.
			wardrobes: { chancePercent: 20, maxPerRoom: 3, lootCount: [1, 4] }, // Chance/limit for wardrobes along valid room walls.

			// Dense content guaranteed inside locked special chambers.
			specialRooms: {
				treasury: { containerCount: [3, 5], lootCount: [3, 5] }, // Treasury chest count and loot per chest.
				library: { containerCount: [3, 5], lootCount: [2, 4] } // Library wardrobe count and loot per wardrobe.
			},

			// Creatures that may emerge when a chest/wardrobe is opened.
			monsterSpawn: {
				common: {
					probability: .30, // Chance that an eligible container contains a hidden monster batch.
					minCount: 1, // Minimum creatures spawned in one batch.
					maxCount: 2, // Maximum creatures spawned in one batch.
					sameTypePerBatch: true, // Keep every creature in one batch the same type.
					minSpawnRadius: 1, // Closest allowed spawn radius from the container.
					spawnRadius: 2, // Farthest preferred spawn radius from the container.
					allowPassableEntityCells: true, // Allow spawn cells containing passable entities.
					behavior: { type: 'roam', minGoalDistance: 8, maxGoalDistance: 24, goalTolerance: 1, stuckTurnLimit: 3, aggroRadius: 6, pursuitRadius: 12,
						pursuitCooldownTurns: 1, targetAggression: 1, travelAggression: 3, combatAggression: 6 } // AI behavior assigned to container-spawned monsters.
				},
				chest: {
					monsterTypes: ['rat'], // Creature types that may emerge from a chest.
					spawnEffect: { type: 'burst', initialScale: .25, launchScale: .72, overshootScale: 1.10, sourceOffsetX: 0, sourceOffsetY: -2,
						jumpHeight: 7, launchDuration: 110, moveDuration: 240, settleDuration: 90, staggerDelay: 90, maxStaggerDelay: 360, playMoveAnimation: true } // Chest monster visual effect.
				},
				wardrobe: {
					monsterTypes: ['rat', 'bat'], // Creature types that may emerge from a wardrobe.
					spawnEffect: { type: 'emerge', initialScale: .18, intermediateScale: .45, initialAlpha: .35, sourceOffsetX: 0, sourceOffsetY: 4,
						emergeLift: 2, emergeDuration: 150, moveDuration: 320, staggerDelay: 100, maxStaggerDelay: 400, playMoveAnimation: true } // Wardrobe monster visual effect.
				}
			}
		},

		// Locks on ordinary containers and weighted placement of their/special-room keys.
		locks: {
			common: {
				minContainers: 4, // Do not create common container locks when fewer containers exist.
				fraction: .12, // Target FRACTION of containers to lock, not an independent 12% chance per container.
				keyId: 'common', // Shared ID accepted by all common container locks.
				keyName: 'Common key', // Display name of common consumable keys.
				consumeKey: true, // Consume a common key when a container is unlocked.
				fallbackChestLootCount: [1, 2] // Loot inserted into a fallback key chest when no normal key location exists.
			},

			// Relative key-placement weights; side areas are intentionally preferred.
			keyPlacement: {
				weights: { container: 1, alcove: 5, niche: 3 }, // Relative probabilities before distance bias is applied.
				specialDistanceBias: 2 // Strength of preference for candidates farther from the corresponding locked special room.
			}
		},

		// Guards placed in rooms containing several valuable containers.
		guards: {
			excludedUnitTypes: ['wizard', 'rat', 'bat'], // Units that must never be selected as treasure guards.
			minContainersInRoom: 2, // Minimum container count before a room becomes guard-eligible.
			extraGuardChance: .40, // Chance to use maxGuardsPerRoom instead of a single guard.
			maxGuardsPerRoom: 2, // Maximum guards placed in one eligible room.
			minAggroRadius: 4, // Minimum aggro radius regardless of room size.
			leashExtra: 3, // Additional cells beyond aggro radius before a guard gives up pursuit.
			patrolRadius: 3, // Patrol radius around the guard's home cell.
			aggression: 4, // Aggression used while engaging enemies.
			patrolAggression: 2, // Aggression used while patrolling.
			returnAggression: 1 // Aggression used while returning home.
		},

		// Neutral creatures placed at map creation time, with arena preferred when available.
		roamingCreatures: {
			baseArea: 20 * 20, // Profile counts scale linearly relative to this map area.
			centralRoomMinCount: 4, // Minimum number of non-arena central rooms retained as fallback spawn regions.
			centralRoomFraction: .5, // Fraction of nearest-to-center rooms retained as fallback spawn regions.
			profiles: [
				{
					count: [1, 2], // Count on a 20x20 map before area scaling.
					types: ['chort', 'muddy', 'demon', 'troll'], // Strong roaming creature pool.
					minDistance: 3, // Minimum Chebyshev spacing between creatures from this profile.
					behavior: { type: 'roam', minGoalDistance: 16, maxGoalDistance: 40, goalTolerance: 1, stuckTurnLimit: 3, aggroRadius: 7,
						pursuitRadius: 14, pursuitCooldownTurns: 1, targetAggression: 1, travelAggression: 3, combatAggression: 6 } // Strong-creature roam behavior.
				},
				{
					count: [5, 7], // Count on a 20x20 map before area scaling.
					types: ['rat', 'bat'], // Weak roaming creature pool.
					minDistance: 2, // Minimum Chebyshev spacing between creatures from this profile.
					behavior: { type: 'roam', minGoalDistance: 8, maxGoalDistance: 24, goalTolerance: 1, stuckTurnLimit: 3, aggroRadius: 4,
						pursuitRadius: 7, pursuitCooldownTurns: 2, targetAggression: .1, travelAggression: .5, combatAggression: 2 } // Weak-creature roam behavior.
				}
			]
		},

		// Persistent monster-generator entities distributed through eligible rooms.
		monsterGenerators: {
			baseArea: 20 * 20, // Map area used as the scaling baseline for generator count.
			maxPerMap: 5, // Absolute maximum number of monster-generator entities.
			roomsPerGeneratorCap: 3, // At most roughly one generator per this many eligible rooms.
			minScaleFactor: 1.5, // Lower area-based multiplier used to choose generator count.
			maxScaleFactor: 2, // Upper area-based multiplier used to choose generator count.
			baseBehavior: { type: 'roam', minGoalDistance: 8, maxGoalDistance: 24, goalTolerance: 1, stuckTurnLimit: 3, aggroRadius: 5, pursuitRadius: 10, pursuitCooldownTurns: 1 }, // Shared AI defaults for generated monsters.

			// Weighted generator archetypes. strong=true limits powerful archetypes to one selected strong profile per map generation pass.
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

			visual: { visualSprite: 'hole', visualScale: 1, visualFrame: 0, visualOriginMode: 'center', depthOffset: -40, blocksLOS: false, passable: true, stepCost: 1, destructible: false }, // Visual/physical properties of the generator entity itself.
			spawn: { enabled: true, minSpawnRadius: 1, spawnRadius: 2, allowPassableEntityCells: false }, // Spawn search radius and cell-occupancy policy.
			strongSpawnEffect: { type: 'burst', initialScale: .2, launchScale: .7, overshootScale: 1.1, jumpHeight: 6, launchDuration: 120,
				moveDuration: 250, settleDuration: 90, staggerDelay: 100, playMoveAnimation: true }, // Visual effect for strong generated monsters.
			normalSpawnEffect: { type: 'emerge', initialScale: .15, intermediateScale: .4, initialAlpha: .35, sourceOffsetY: 3, emergeLift: 2,
				emergeDuration: 150, moveDuration: 300, staggerDelay: 100, playMoveAnimation: true } // Visual effect for ordinary generated monsters.
		}
	}
};

globalThis.MAP_GENERATION_CONFIG = MAP_GENERATION_CONFIG;
