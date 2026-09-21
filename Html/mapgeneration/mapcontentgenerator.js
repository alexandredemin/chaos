// Game-specific population policy for a GeneratedDungeon.
// Geometry stays in DungeonGenerator; this layer creates Tiled-like objects consumed by GameScene.
const MAP_CONTENT_RNG_SALT = 0xB5297A4D;
const MAP_CONTENT_CONFIG = MAP_GENERATION_CONFIG.content;

// Populates a GeneratedDungeon with game objects: doors, starts, loot, containers, keys, guards and monsters.
class MapContentGenerator {

	constructor(cfg, dungeon, tiledMap, seed) {
		this.cfg = cfg || {};
		this.settings = MAP_CONTENT_CONFIG; // Central content/balance policy.
		this.tileSize = MAP_GENERATION_CONFIG.map.tileSize;
		this.dungeon = dungeon;
		this.map = tiledMap;
		this.width = dungeon.layout?.width || tiledMap.walls[0].length;
		this.height = dungeon.layout?.height || tiledMap.walls.length;
		this.rooms = dungeon.rooms || [];
		this.alcoves = dungeon.alcoves || []; // Semantic side areas used for guaranteed loot and preferred key placement.
		this.zones = dungeon.zones || [];
		this.portals = dungeon.portals || [];
		this.zoneById = new Map(this.zones.map(z => [z.id, z]));
		this.roomById = new Map(this.rooms.map(r => [r.id, r]));
		this.roomAt = this._buildRoomAt(); // O(1) room lookup by map cell.
		this.rng = new RNG(((seed || 1) ^ MAP_CONTENT_RNG_SALT) >>> 0); // Independent RNG so content changes do not affect geometry.
	}

	// ----- Main content pipeline -----

	// Runs the complete content pipeline and returns GameScene-compatible objects plus content statistics.
	generate() {
		const doors = this._createDoors();
		const specialRooms = this._getSpecialRoomDescriptors(doors);
		const startPositions = this._generateStartPositions(this.cfg.startCount || this.settings.startCount, doors);
		const items = this._placeItems(startPositions.concat(doors));
		const chests = this._placeChests(startPositions.concat(doors, items));
		const wardrobes = this._placeWardrobes(startPositions.concat(doors, items, chests));
		const commonLockCount = this._lockRandomContainers(chests, wardrobes);

		const specialContent = this._populateSpecialRooms(specialRooms, startPositions.concat(doors, items, chests, wardrobes));
		chests.push(...specialContent.chests);
		wardrobes.push(...specialContent.wardrobes);

		const alcoveContent = this._populateAlcoves(startPositions.concat(doors, items, chests, wardrobes));
		items.push(...alcoveContent.items);
		chests.push(...alcoveContent.chests);

		const keyPlacement = this._placeLockKeys(
			specialRooms,
			commonLockCount,
			chests,
			wardrobes,
			alcoveContent.areas,
			startPositions.concat(doors, items, chests, wardrobes)
		);
		items.push(...keyPlacement.extraItems);
		chests.push(...keyPlacement.extraChests);

		const hiddenContent = this._placeHiddenContainers(startPositions.concat(doors, items, chests, wardrobes));
		const hiddenObjects = hiddenContent.floor.concat(hiddenContent.wall);

		const treasureGuards = this._placeTreasureGuards(
			chests,
			wardrobes,
			startPositions,
			startPositions.concat(doors, items, chests, wardrobes, hiddenObjects)
		);
		const monsterGenerators = this._placeMonsterGenerators(
			startPositions,
			treasureGuards,
			startPositions.concat(doors, items, chests, wardrobes, hiddenObjects, treasureGuards)
		);
		const roamingCreatures = this._placeRoamingCreatures(
			startPositions,
			startPositions.concat(doors, items, chests, wardrobes, hiddenObjects, treasureGuards, monsterGenerators)
		);

		const objects = startPositions.concat(doors, items, chests, wardrobes, hiddenObjects, treasureGuards, monsterGenerators, roamingCreatures);
		this._validate(objects, doors, specialRooms, startPositions);

		return {
			objects,
			stats: {
				doors: doors.length,
				lockedSpecialDoors: doors.filter(d => this._isObjectLocked(d)).length,
				starts: startPositions.length,
				items: items.length,
				alcovesWithLoot: alcoveContent.stats.alcovesWithLoot,
				nichesWithLoot: alcoveContent.stats.nichesWithLoot,
				alcoveChests: alcoveContent.stats.alcoveChests,
				keysInContainers: keyPlacement.stats.container,
				keysInAlcoves: keyPlacement.stats.alcove,
				keysInNiches: keyPlacement.stats.niche,
				chests: chests.length,
				wardrobes: wardrobes.length,
				hiddenFloorContainers: hiddenContent.floor.length,
				hiddenWallContainers: hiddenContent.wall.length,
				guards: treasureGuards.length,
				monsterGenerators: monsterGenerators.length,
				roamingCreatures: roamingCreatures.length
			}
		};
	}

	// ----- Shared lookup and placement helpers -----

	_random() { return this.rng.next(); }

	_rand(a, b) { return this.rng.int(a, b); }

	_shuffle(array) { return this.rng.shuffle(array); }

	_clone(value) {
		if (typeof clone === 'function') return clone(value);
		return value == null ? value : JSON.parse(JSON.stringify(value));
	}

	// Builds an O(1) cell-to-room lookup grid used by content placement policies.
	_buildRoomAt() {
		const grid = Array.from({length: this.height}, () => Array(this.width).fill(null));
		for (const room of this.rooms) for (let y = room.y; y < room.y + room.h; y++) for (let x = room.x; x < room.x + room.w; x++)
			if (x >= 0 && y >= 0 && x < this.width && y < this.height) grid[y][x] = room;
		return grid;
	}

	_roomCenter(room) { return {x: room.x + Math.floor(room.w / 2), y: room.y + Math.floor(room.h / 2)}; }

	_dist2(a, b) {
		const dx = a.x - b.x, dy = a.y - b.y;
		return dx * dx + dy * dy;
	}

	_zoneForRoom(room) { return room ? this.zoneById.get(room.zoneId) || null : null; }

	_getRoomAtMap(x, y) { return this.roomAt[y]?.[x] || null; }

	_getObjectRoom(obj) {
		if (!obj || obj.x == null || obj.y == null) return null;
		return this._getRoomAtMap(Math.floor(obj.x / this.tileSize), Math.floor(obj.y / this.tileSize));
	}

	// Returns true for non-special rooms belonging to normal zones.
	_isOrdinaryRoom(room) {
		const zone = this._zoneForRoom(room);
		return !!room && !room.special && !!zone && zone.type === 'normal';
	}

	// Returns true for chambers reachable without entering a locked special room.
	_isKeySafeRoom(room) {
		// Any non-special chamber is reachable without opening a special-room door.
		// This includes the arena and auxiliary rooms inside special zones.
		return !!room && room.special !== true && this._zoneForRoom(room) != null;
	}

	_ordinaryRooms() { return this.rooms.filter(r => this._isOrdinaryRoom(r)); }

	_specialRooms() { return this.rooms.filter(r => r.special === true); }

	_isFloor(x, y) { return y >= 0 && y < this.map.walls.length && x >= 0 && x < this.map.walls[y].length && this.map.walls[y][x] === null; }

	// Returns true for a generated rock/wall cell. Candidates are further restricted to cells beside reachable room floor.
	_isBlockingWall(x, y) {
		if (x < 0 || y < 0 || x >= this.width || y >= this.height) return false;
		return this.dungeon.map?.kind?.[y]?.[x] === '#' && !this._isFloor(x, y);
	}

	// Returns a set of map cells already occupied by supplied game objects.
	_collectOccupied(objects = []) {
		const result = new Set();
		for (const obj of objects) if (obj && obj.x != null && obj.y != null) result.add(Math.floor(obj.x / this.tileSize) + ':' + Math.floor(obj.y / this.tileSize));
		return result;
	}

	_objectCell(obj) {
		if (!obj || obj.x == null || obj.y == null) return null;
		return {x: Math.floor(obj.x / this.tileSize), y: Math.floor(obj.y / this.tileSize)};
	}

	// Finds a free floor cell inside an alcove/niche rectangle.
	_findFreeAlcoveCell(alcove, occupied) {
		const cells = [];
		for (let y = alcove.rect.y; y < alcove.rect.y + alcove.rect.h; y++)
			for (let x = alcove.rect.x; x < alcove.rect.x + alcove.rect.w; x++)
				if (this._isFloor(x, y) && !occupied.has(x + ':' + y)) cells.push({x, y});
		if (!cells.length) return null;
		this._shuffle(cells);
		return cells[0];
	}

	// Reads one Tiled-style property value from a generated object.
	_getObjectProperty(obj, name) {
		if (!obj || !Array.isArray(obj.properties)) return null;
		const prop = obj.properties.find(p => p && p.name === name);
		return prop != null ? prop.value : null;
	}

	// Creates or updates one Tiled-style object property in place.
	_setObjectProperty(obj, name, value, type = null) {
		if (!Array.isArray(obj.properties)) obj.properties = [];
		let prop = obj.properties.find(p => p && p.name === name);
		if (!prop) {
			prop = {name, value};
			if (type != null) prop.type = type;
			obj.properties.push(prop);
			return;
		}
		prop.value = value;
		if (type != null) prop.type = type;
	}

	// Returns true when an entity contains an enabled lock property.
	_isObjectLocked(obj) {
		const lock = this._getObjectProperty(obj, 'lock');
		return lock != null && lock.locked === true;
	}

	// Door policy lives here on purpose. ScenarioBinder can replace this later without touching geometry.

	// ----- Doors and special-room metadata -----

	// Defines the current generic door-lock policy. Only special-room entrances are locked by default.
	_doorLockForPortal(portal) {
		if (portal.type !== 'special_entrance') return null;
		return { ...this.settings.doors.specialEntranceLock, keyId: portal.keyId };
	}

	// Converts door-suitable semantic portals into door entity objects and applies the current lock policy.
	_createDoors() {
		const doors = [];
		for (const portal of this.portals) {
			if (!portal.doorSuitable || !portal.direction) continue;
			const properties = [
				{name: 'direction', type: 'string', value: portal.direction},
				{name: 'open', type: 'bool', value: false},
				{name: 'portalId', type: 'string', value: portal.id},
				{name: 'portalType', type: 'string', value: portal.type}
			];
			const lock = this._doorLockForPortal(portal);
			if (lock) properties.push({name: 'lock', value: lock});
			doors.push({type: 'entity', name: 'door', x: portal.x * this.tileSize, y: portal.y * this.tileSize, properties, _portal: portal});
		}
		return doors;
	}

	// Joins generated special rooms with their entrance doors and key metadata. Returns content descriptors.
	_getSpecialRoomDescriptors(doors) {
		const doorByPortalId = new Map();
		for (const d of doors) doorByPortalId.set(this._getObjectProperty(d, 'portalId'), d);
		return this._specialRooms().map(room => {
			const zone = this._zoneForRoom(room);
			const portal = this.portals.find(p => p.type === 'special_entrance' && p.roomId === room.id);
			const type = room.roomType || zone?.specialType || 'special';
			return {
				room, zone, type,
				portal,
				doors: portal ? [doorByPortalId.get(portal.id)].filter(Boolean) : [],
				keyId: portal?.keyId || ('special:' + room.zoneId),
				keyName: portal?.keyName || this.settings.doors.keyNames[type] || this.settings.doors.keyNames.default
			};
		});
	}

	// ----- Player start placement -----

	// Returns true for a room that may be used as a secondary player-start location.
	// Arena and locked special chambers are deliberately excluded; auxiliary rooms inside special zones are allowed.
	_isStartFallbackRoom(room) {
		const zone = this._zoneForRoom(room);
		return !!room && !room.special && !!zone && zone.type !== 'arena';
	}

	// Adds rooms from one priority group using farthest-point selection. Existing selections remain fixed.
	_selectFarthestStartRooms(pool, count, selected) {
		const candidates = pool.filter(room => !selected.some(s => s.room === room)).map(room => ({room, center: this._roomCenter(room)}));
		const mapCenter = {x: Math.floor(this.width / 2), y: Math.floor(this.height / 2)};

		while (selected.length < count && candidates.length) {
			let best = null, bestScore = -Infinity;
			for (const candidate of candidates) {
				const score = selected.length
					? Math.min(...selected.map(s => this._dist2(candidate.center, s.center)))
					: this._dist2(candidate.center, mapCenter);
				if (score > bestScore) { bestScore = score; best = candidate; }
			}
			if (!best) break;
			selected.push(best);
			candidates.splice(candidates.indexOf(best), 1);
		}
	}

	// Finds an additional start cell after every eligible room already contains a player.
	// The selected cell maximizes distance from existing starts; door clearance is preferred but may be relaxed as a last resort.
	_findExtraStartCell(rooms, objects, doorCells, requireDoorClearance = true) {
		const occupied = new Set(objects.map(o => Math.floor(o.x / this.tileSize) + ':' + Math.floor(o.y / this.tileSize)));
		const starts = objects.map(o => ({x: Math.floor(o.x / this.tileSize), y: Math.floor(o.y / this.tileSize)}));
		let best = null, bestScore = -Infinity;

		for (const room of rooms) for (let y = room.y; y < room.y + room.h; y++) for (let x = room.x; x < room.x + room.w; x++) {
			if (!this._isFloor(x, y) || occupied.has(x + ':' + y)) continue;
			if (requireDoorClearance && this._isNearAny({x, y}, doorCells, this.settings.placement.doorClearance)) continue;
			const score = starts.length ? Math.min(...starts.map(s => this._dist2({x, y}, s))) : 0;
			if (score > bestScore) { bestScore = score; best = {x, y}; }
		}
		return best;
	}

	// Chooses player starts in strict priority order: normal-zone rooms, then accessible auxiliary rooms.
	// Arena is never used. If there are fewer eligible rooms than players, extra players share those rooms on maximally separated cells.
	_generateStartPositions(count = 4, doors = []) {
		const objects = [], selected = [];
		const ordinary = this._ordinaryRooms();
		const auxiliary = this.rooms.filter(r => this._isStartFallbackRoom(r) && !ordinary.includes(r));
		const eligible = ordinary.concat(auxiliary);
		if (!eligible.length) return objects;

		this._selectFarthestStartRooms(ordinary, count, selected);
		if (selected.length < count) this._selectFarthestStartRooms(auxiliary, count, selected);
		for (const s of selected) objects.push({type: 'start', name: 'start', x: s.center.x * this.tileSize, y: s.center.y * this.tileSize});

		const doorCells = this._doorCells(doors);
		while (objects.length < count) {
			let cell = this._findExtraStartCell(eligible, objects, doorCells, true);
			if (!cell) cell = this._findExtraStartCell(eligible, objects, doorCells, false);
			if (!cell) break;
			objects.push({type: 'start', name: 'start', x: cell.x * this.tileSize, y: cell.y * this.tileSize});
		}
		return objects;
	}

	// ----- Loot creation -----

	_getNormalLootItemNames() { return Object.keys(itemConfigs).filter(name => name !== 'key'); }

	_getPremiumPotionNames() {
		const preferred = this.settings.loot.premiumPotions;
		const result = preferred.filter(name => itemConfigs[name] != null);
		return result.length ? result : this._getNormalLootItemNames().filter(name => name !== 'spell_scroll');
	}

	// Selects a spell compatible with the requested loot tier. Returns a spell ID or null.
	_chooseSpellForLootTier(tier) {
		const tierConfig = this.settings.loot.spellCostTiers[tier];
		let spells = Object.keys(spellConfigs).filter(id => {
			const cost = spellConfigs[id]?.cost || 0;
			return !tierConfig || (cost >= tierConfig.min && cost <= tierConfig.max);
		});
		if (!spells.length) {
			spells = Object.keys(spellConfigs);
			if (tier === 'normal') spells = spells.filter(id => id !== 'demon');
		}
		return spells.length ? spells[this._rand(0, spells.length - 1)] : null;
	}

	// Creates a spell-scroll item whose spell and charge count depend on loot source quality.
	_createSpellScroll(source = 'normal') {
		const scrollConfig = this.settings.loot.scrolls[source] || this.settings.loot.scrolls.normal;
		let tier = 'normal';
		if (source !== 'normal') tier = this._random() < scrollConfig.legendaryChance ? 'legendary' : 'rare';
		const spell = this._chooseSpellForLootTier(tier);
		if (spell == null) return createItemData('spell_scroll', {});
		const cost = Math.max(1, spellConfigs[spell]?.cost || 1);
		let points = this._rand(scrollConfig.points[0], scrollConfig.points[1]);
		let amount = Math.max(1, Math.round(points / cost));
		if (cost >= this.settings.loot.scrolls.expensiveSpellCost) amount = this.settings.loot.scrolls.expensiveSpellAmount;
		amount = Math.min(amount, this.settings.loot.scrolls.maxAmount);
		return createItemData('spell_scroll', {spell, amount});
	}

	// Creates one loot item for normal, locked, library or treasury content tiers.
	_createLootItem(tier = 'normal') {
		if (tier === 'library') {
			if (this._random() < this.settings.loot.tiers.library.scrollChance) return this._createSpellScroll('special');
			const pool = this.settings.loot.tiers.library.fallbackItems.filter(name => itemConfigs[name] != null);
			return pool.length ? createItemData(pool[this._rand(0, pool.length-1)], {}) : this._createSpellScroll('special');
		}
		if (tier === 'treasury') {
			if (this._random() < this.settings.loot.tiers.treasury.scrollChance) return this._createSpellScroll('special');
			const pool = this._getPremiumPotionNames();
			return pool.length ? createItemData(pool[this._rand(0, pool.length-1)], {}) : null;
		}
		if (tier === 'premium') {
			if (this._random() < this.settings.loot.tiers.premium.scrollChance) return this._createSpellScroll('premium');
			const pool = this._getPremiumPotionNames();
			return pool.length ? createItemData(pool[this._rand(0, pool.length-1)], {}) : null;
		}
		if (tier === 'locked') {
			if (this._random() < this.settings.loot.tiers.locked.scrollChance) return this._createSpellScroll('locked');
			const pool = this._getPremiumPotionNames();
			return pool.length ? createItemData(pool[this._rand(0, pool.length-1)], {}) : null;
		}
		const pool = this._getNormalLootItemNames();
		if (!pool.length) return null;
		const itemName = pool[this._rand(0, pool.length-1)];
		return itemName === 'spell_scroll' ? this._createSpellScroll('normal') : createItemData(itemName, {});
	}

	// Creates up to count loot items for the requested tier and returns the resulting item array.
	_createLoot(count, tier = 'normal') {
		const result = [];
		for (let i = 0; i < count; i++) {
			const item = this._createLootItem(tier);
			if (item) result.push(item);
		}
		return result;
	}

	// ----- Containers and room content -----

	// Returns monster-spawn behavior embedded in chest/wardrobe entities.
	_getContainerSpawnConfig(name) {
		const common = this.settings.containers.monsterSpawn.common;
		const specific = this.settings.containers.monsterSpawn[name] || this.settings.containers.monsterSpawn.chest;
		return this._clone({ ...common, ...specific, factionId: this.settings.factionId, behavior: common.behavior, spawnEffect: specific.spawnEffect });
	}

	// Builds a Tiled-like chest/wardrobe entity with loot, optional lock and spawn metadata.
	_createContainerObject(name, x, y, items = [], lock = null) {
		const properties = [
			{name: 'monsterSpawnResolved', value: false},
			{name: 'monsterSpawn', value: this._getContainerSpawnConfig(name)}
		];
		if (lock) properties.push({name: 'lock', value: this._clone(lock)});
		return {type: 'entity', name, x: x*this.tileSize, y: y*this.tileSize, properties, items};
	}

	// Creates loot for one hidden cache using the configured normal/premium mixture.
	_createHiddenContainerLoot(cfg) {
		const result = [];
		for (let i = 0, count = this._rand(...cfg.lootCount); i < count; i++) {
			const tier = this._random() < cfg.premiumChance ? 'premium' : 'normal';
			const item = this._createLootItem(tier) || this._createLootItem('normal');
			if (item) result.push(item);
		}
		return result;
	}

	// Builds a hidden cache. Monster spawning is disabled so the first hidden-content version stays deterministic/simple.
	_createHiddenContainerObject(cfg, x, y) {
		const object = this._createContainerObject(cfg.entityName, x, y, this._createHiddenContainerLoot(cfg));
		const difficulty = this._rand(...cfg.difficulty);
		const spawnResolved = object.properties.find(p => p.name === 'monsterSpawnResolved');
		const monsterSpawn = object.properties.find(p => p.name === 'monsterSpawn');
		if (spawnResolved) spawnResolved.value = true;
		if (monsterSpawn) monsterSpawn.value = null;
		object.properties.push({name: 'hidden', value: {hidden: true, difficulty}});
		return object;
	}

	// Returns the number of caches for the current map size while preserving configured 20x20 density.
	_getHiddenContainerCount(cfg) {
		const baseArea = Math.max(1, this.settings.hiddenContainers.baseArea);
		const scale = Math.sqrt((this.width*this.height)/baseArea);
		const min = Math.max(0, Math.round(cfg.count[0]*scale));
		const max = Math.max(min, Math.round(cfg.count[1]*scale));
		return this._rand(min, max);
	}

	// Places passable hidden chests on ordinary floor cells, spread across ordinary rooms when possible.
	_placeHiddenFloorContainers(occupiedObjects = []) {
		const cfg = this.settings.hiddenContainers.floor;
		const result = [], occupied = this._collectOccupied(occupiedObjects), rooms = this._ordinaryRooms().slice();
		if (!rooms.length) return result;
		this._shuffle(rooms);
		const count = this._getHiddenContainerCount(cfg);
		for (let i = 0, attempts = 0; result.length < count && attempts < Math.max(count*4, rooms.length*2); attempts++, i++) {
			const room = rooms[i % rooms.length];
			const cell = this._findFreeRoomCell(room, occupied);
			if (!cell) continue;
			result.push(this._createHiddenContainerObject(cfg, cell.x, cell.y));
			occupied.add(cell.x+':'+cell.y);
		}
		return result;
	}

	// Collects wall cells around ordinary rooms that remain usable from at least one adjacent floor cell.
	_collectHiddenWallCells(occupied, doorCells, clearance) {
		const result = [], used = new Set();
		const add = (x, y) => {
			const key = x+':'+y;
			if (used.has(key) || occupied.has(key) || !this._isBlockingWall(x, y)) return;
			if (this._isNearAny({x, y}, doorCells, clearance)) return;
			const adjacentFloor = [[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy]) => this._isFloor(x+dx, y+dy));
			if (!adjacentFloor) return;
			used.add(key);
			result.push({x, y});
		};
		for (const room of this._ordinaryRooms()) {
			for (let x = room.x; x < room.x+room.w; x++) { add(x, room.y-1); add(x, room.y+room.h); }
			for (let y = room.y; y < room.y+room.h; y++) { add(room.x-1, y); add(room.x+room.w, y); }
		}
		return result;
	}

	// Places tall hidden wardrobes on wall cells so an invisible cache never creates a phantom floor obstacle.
	_placeHiddenWallContainers(occupiedObjects = []) {
		const cfg = this.settings.hiddenContainers.wall;
		const occupied = this._collectOccupied(occupiedObjects), doors = this._doorCells(occupiedObjects);
		const candidates = this._collectHiddenWallCells(occupied, doors, cfg.doorClearance), result = [];
		this._shuffle(candidates);
		for (let i = 0, count = Math.min(this._getHiddenContainerCount(cfg), candidates.length); i < count; i++) {
			const cell = candidates[i];
			result.push(this._createHiddenContainerObject(cfg, cell.x, cell.y));
			occupied.add(cell.x+':'+cell.y);
		}
		return result;
	}

	// Generates both hidden-container families. They are intentionally added after key placement in this first version.
	_placeHiddenContainers(occupiedObjects = []) {
		const floor = this._placeHiddenFloorContainers(occupiedObjects);
		const wall = this._placeHiddenWallContainers(occupiedObjects.concat(floor));
		return {floor, wall};
	}

	// Finds an unoccupied floor cell in a room, using random attempts followed by deterministic scan fallback.
	_findFreeRoomCell(room, occupied) {
		for (let attempt = 0; attempt < this.settings.placement.freeRoomCellAttempts; attempt++) {
			const x = this._rand(room.x, room.x + room.w - 1), y = this._rand(room.y, room.y + room.h - 1), key = x + ':' + y;
			if (!occupied.has(key) && this._isFloor(x, y)) return {x, y};
		}
		for (let y = room.y; y < room.y + room.h; y++) for (let x = room.x; x < room.x + room.w; x++)
			if (!occupied.has(x+':'+y) && this._isFloor(x, y)) return {x, y};
		return null;
	}

	// Finds a valid free top-wall cell suitable for wardrobe placement.
	_findWardrobeCell(room, occupied) {
		const y = room.y, minX = room.x + 1, maxX = room.x + room.w - 2;
		if (maxX < minX) return null;
		for (let attempt = 0; attempt < this.settings.placement.wardrobeCellAttempts; attempt++) {
			const x = this._rand(minX, maxX);
			if (occupied.has(x+':'+y) || occupied.has(x+':'+(y-1)) || !this._isFloor(x, y)) continue;
			return {x, y};
		}
		return null;
	}

	// Places loose normal loot in ordinary rooms while avoiding already occupied cells.
	_placeItems(occupiedObjects = []) {
		const objects = [], occupied = this._collectOccupied(occupiedObjects);
		for (const room of this._ordinaryRooms()) {
			if (this._rand(1, 100) > this.settings.containers.looseItems.chancePercent) continue;
			const itemCount = this._rand(...this.settings.containers.looseItems.count);
			let placed = 0, attempts = 0;
			while (placed < itemCount && attempts++ < this.settings.containers.looseItems.attempts) {
				const x = this._rand(room.x, room.x+room.w-1), y = this._rand(room.y, room.y+room.h-1), key=x+':'+y;
				if (occupied.has(key) || !this._isFloor(x, y)) continue;
				const item = this._createLootItem('normal');
				if (!item) continue;
				objects.push({type: 'entity', name: 'item', x: x*this.tileSize, y: y*this.tileSize, properties: [], items: [item]});
				occupied.add(key);
				placed++;
			}
		}
		return objects;
	}

	// Places ordinary chests and their initial loot in eligible rooms.
	_placeChests(occupiedObjects = []) {
		const objects = [], occupied = this._collectOccupied(occupiedObjects);
		for (const room of this._ordinaryRooms()) {
			if (this._rand(1, 100) > this.settings.containers.chests.chancePercent) continue;
			for (let attempt = 0; attempt < this.settings.containers.chests.attempts; attempt++) {
				const cell = this._findFreeRoomCell(room, occupied);
				if (!cell) break;
				objects.push(this._createContainerObject('chest', cell.x, cell.y, this._createLoot(this._rand(...this.settings.containers.chests.lootCount), 'normal')));
				occupied.add(cell.x+':'+cell.y);
				break;
			}
		}
		return objects;
	}

	// Places ordinary wardrobes against valid room walls.
	_placeWardrobes(occupiedObjects = []) {
		const objects = [], occupied = this._collectOccupied(occupiedObjects);
		for (const room of this._ordinaryRooms()) {
			if (this._rand(1, 100) > this.settings.containers.wardrobes.chancePercent) continue;
			const maxWardrobes = Math.min(this.settings.containers.wardrobes.maxPerRoom, Math.max(0, room.w - 2));
			if (!maxWardrobes) continue;
			const count = this._rand(1, maxWardrobes);
			for (let i = 0; i < count; i++) {
				const cell = this._findWardrobeCell(room, occupied);
				if (!cell) break;
				objects.push(this._createContainerObject('wardrobe', cell.x, cell.y, this._createLoot(this._rand(...this.settings.containers.wardrobes.lootCount), 'normal')));
				occupied.add(cell.x+':'+cell.y);
			}
		}
		return objects;
	}

	// Fills library/treasury chambers with their premium room-specific containers.
	_populateSpecialRooms(specialRooms, occupiedObjects = []) {
		const result = {chests: [], wardrobes: []}, occupied = this._collectOccupied(occupiedObjects);
		for (const special of specialRooms) {
			if (special.type === 'treasury') {
				for (let i = 0, count = this._rand(...this.settings.containers.specialRooms.treasury.containerCount); i < count; i++) {
					const cell = this._findFreeRoomCell(special.room, occupied);
					if (!cell) break;
					result.chests.push(this._createContainerObject('chest', cell.x, cell.y, this._createLoot(this._rand(...this.settings.containers.specialRooms.treasury.lootCount), 'treasury')));
					occupied.add(cell.x+':'+cell.y);
				}
			} else {
				const count = Math.min(this._rand(...this.settings.containers.specialRooms.library.containerCount), Math.max(1, special.room.w-2));
				for (let i = 0; i < count; i++) {
					const cell = this._findWardrobeCell(special.room, occupied);
					if (!cell) break;
					result.wardrobes.push(this._createContainerObject('wardrobe', cell.x, cell.y, this._createLoot(this._rand(...this.settings.containers.specialRooms.library.lootCount), 'library')));
					occupied.add(cell.x+':'+cell.y);
				}
			}
		}
		return result;
	}

	// Populates every alcove/niche and keeps area descriptors for later key placement.
	// Loose loot is spread across free cells; large alcove loot rolls become a single chest.
	_populateAlcoves(occupiedObjects = []) {
		const items = [], chests = [], areas = [], occupied = this._collectOccupied(occupiedObjects);
		const stats = {alcovesWithLoot: 0, nichesWithLoot: 0, alcoveChests: 0};

		for (const alcove of this.alcoves) {
			const cfg = alcove.type === 'room' ? this.settings.alcoves.room : this.settings.alcoves.niche;
			const loot = [];
			for (let i = 0, count = this._rand(...cfg.lootCount); i < count; i++) {
				const tier = this._random() < cfg.premiumChance ? 'premium' : 'normal';
				const item = this._createLootItem(tier) || this._createLootItem('normal');
				if (item) loot.push(item);
			}
			if (!loot.length) continue;

			const area = {alcove, holders: []}; // Holders can accept a key when the area has no free cell left.
			const useChest = alcove.type === 'room' && cfg.chestMinLootCount != null && loot.length >= cfg.chestMinLootCount;

			if (useChest) {
				const cell = this._findFreeAlcoveCell(alcove, occupied);
				if (!cell) continue;
				const chest = this._createContainerObject('chest', cell.x, cell.y, loot);
				chest._alcove = alcove;
				chests.push(chest);
				area.holders.push(chest);
				occupied.add(cell.x + ':' + cell.y);
				stats.alcoveChests++;
			}
			else {
				for (const lootItem of loot) {
					let cell = this._findFreeAlcoveCell(alcove, occupied);
					if (!cell && area.holders.length) {
						area.holders[this._rand(0, area.holders.length - 1)].items.push(lootItem);
						continue;
					}
					if (!cell) break;
					const holder = {type: 'entity', name: 'item', x: cell.x*this.tileSize, y: cell.y*this.tileSize, properties: [], items: [lootItem], _alcove: alcove};
					items.push(holder);
					area.holders.push(holder);
					occupied.add(cell.x + ':' + cell.y);
				}
			}

			if (!area.holders.length) continue;
			areas.push(area);
			if (alcove.type === 'room') stats.alcovesWithLoot++;
			else stats.nichesWithLoot++;
		}

		return {items, chests, areas, stats};
	}

	// ----- Locks and key placement -----

	// Applies existing common consumable locks to a subset of ordinary containers. Returns the lock count.
	_lockRandomContainers(chests = [], wardrobes = []) {
		const containers = chests.concat(wardrobes);
		if (containers.length < this.settings.locks.common.minContainers) return 0;
		this._shuffle(containers);
		const count = Math.min(containers.length, Math.max(1, Math.round(containers.length * this.settings.locks.common.fraction)));
		for (let i = 0; i < count; i++) {
			const container = containers[i];
			this._setObjectProperty(container, 'lock', {locked: true, type: 'key', keyId: this.settings.locks.common.keyId, consumeKey: this.settings.locks.common.consumeKey});
			if (!Array.isArray(container.items)) container.items=[];
			const premium = this._createLootItem('locked');
			if (premium) container.items.push(premium);
		}
		return count;
	}

	// Returns unlocked containers located outside special chambers that are safe for key placement.
	_getKeyContainerCandidates(chests = [], wardrobes = []) {
		return chests.concat(wardrobes).filter(c => {
			if (this._isObjectLocked(c)) return false;
			const room = this._getObjectRoom(c);
			return this._isKeySafeRoom(room);
		});
	}

	// Builds weighted key-placement candidates from ordinary containers and semantic alcove/niche areas.
	_getKeyPlacementCandidates(chests = [], wardrobes = [], alcoveAreas = []) {
		const weights = this.settings.locks.keyPlacement.weights, result = [];
		for (const holder of this._getKeyContainerCandidates(chests, wardrobes)) {
			const point = this._objectCell(holder);
			if (point) result.push({holder, target: holder, kind: 'container', weight: weights.container, point});
		}
		for (const area of alcoveAreas) {
			if (!area?.alcove || !area.holders?.length) continue;
			const a = area.alcove, kind = a.type === 'room' ? 'alcove' : 'niche';
			const point = {x: a.rect.x + Math.floor(a.rect.w/2), y: a.rect.y + Math.floor(a.rect.h/2)};
			result.push({area, target: area, kind, weight: weights[kind], point});
		}
		return result;
	}

	// Returns one random candidate proportionally to its weight. Optional multipliers can add context-specific bias.
	_pickWeightedCandidate(candidates, multiplier = null) {
		if (!candidates.length) return null;
		const weighted = candidates.map(candidate => ({
			candidate,
			weight: Math.max(0, candidate.weight * (multiplier ? multiplier(candidate) : 1))
		}));
		let total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
		if (total <= 0) return candidates[this._rand(0, candidates.length - 1)];
		let roll = this._random() * total;
		for (const entry of weighted) {
			roll -= entry.weight;
			if (roll <= 0) return entry.candidate;
		}
		return weighted[weighted.length - 1].candidate;
	}

	// Creates an extra reachable chest when no existing safe place can hold a required key.
	_createFallbackKeyChest(targetRoom, occupied) {
		let rooms = this.rooms.filter(r => this._isKeySafeRoom(r)).slice();
		if (!rooms.length) return null;
		if (targetRoom) {
			const target = this._roomCenter(targetRoom);
			rooms.sort((a, b) => {
				const ca = this._roomCenter(a), cb = this._roomCenter(b);
				return (Math.abs(cb.x-target.x)+Math.abs(cb.y-target.y))-(Math.abs(ca.x-target.x)+Math.abs(ca.y-target.y));
			});
		}
		for (const room of rooms) {
			const cell = this._findFreeRoomCell(room, occupied);
			if (!cell) continue;
			occupied.add(cell.x + ':' + cell.y);
			return this._createContainerObject('chest', cell.x, cell.y, this._createLoot(this._rand(...this.settings.locks.common.fallbackChestLootCount), 'normal'));
		}
		return null;
	}

	// Places one key in the chosen candidate. Side areas prefer a new free cell and fall back to an existing holder only when full.
	_addKeyToCandidate(candidate, keyId, keyName, stats, occupied, extraItems) {
		if (!candidate) return false;
		const key = createItemData('key', {keyId, name: keyName});

		if (candidate.kind === 'container') {
			if (!candidate.holder) return false;
			if (!Array.isArray(candidate.holder.items)) candidate.holder.items = [];
			candidate.holder.items.push(key);
		}
		else {
			const area = candidate.area, cell = this._findFreeAlcoveCell(area.alcove, occupied);
			if (cell) {
				const holder = {type: 'entity', name: 'item', x: cell.x*this.tileSize, y: cell.y*this.tileSize, properties: [], items: [key], _alcove: area.alcove};
				extraItems.push(holder);
				area.holders.push(holder);
				occupied.add(cell.x + ':' + cell.y);
			}
			else {
				if (!area.holders.length) return false;
				const holder = area.holders[this._rand(0, area.holders.length - 1)];
				if (!Array.isArray(holder.items)) holder.items = [];
				holder.items.push(key);
			}
		}

		stats[candidate.kind]++;
		return true;
	}

	// Places special-room and common consumable keys using weighted containers/alcoves/niches. Returns fallback objects and placement stats.
	_placeLockKeys(specialRooms, commonLockCount, chests = [], wardrobes = [], alcoveAreas = [], occupiedObjects = []) {
		const extraChests = [], extraItems = [], occupied = this._collectOccupied(occupiedObjects), usedTargets = new Set();
		const stats = {container: 0, alcove: 0, niche: 0};
		const candidates = () => this._getKeyPlacementCandidates(chests.concat(extraChests), wardrobes, alcoveAreas);

		for (const special of specialRooms) {
			let list = candidates();
			if (!list.length) {
				const chest = this._createFallbackKeyChest(special.room, occupied);
				if (chest) {
					extraChests.push(chest);
					list = candidates();
				}
			}
			if (!list.length) continue;

			let pool = list.filter(c => !usedTargets.has(c.target));
			if (!pool.length) pool = list;

			const target = this._roomCenter(special.room);
			const distances = pool.map(c => Math.abs(c.point.x-target.x) + Math.abs(c.point.y-target.y));
			const maxDistance = Math.max(1, ...distances);
			const distanceBias = this.settings.locks.keyPlacement.specialDistanceBias;
			const candidate = this._pickWeightedCandidate(pool, c => {
				const distance = Math.abs(c.point.x-target.x) + Math.abs(c.point.y-target.y);
				return 1 + distanceBias * distance / maxDistance;
			});

			if (this._addKeyToCandidate(candidate, special.keyId, special.keyName, stats, occupied, extraItems)) usedTargets.add(candidate.target);
		}

		for (let i = 0; i < commonLockCount; i++) {
			let list = candidates();
			if (!list.length) {
				const chest = this._createFallbackKeyChest(null, occupied);
				if (chest) {
					extraChests.push(chest);
					list = candidates();
				}
			}
			if (!list.length) break;

			let pool = list.filter(c => !usedTargets.has(c.target));
			if (!pool.length) pool = list;
			const candidate = this._pickWeightedCandidate(pool);
			if (this._addKeyToCandidate(candidate, this.settings.locks.common.keyId, this.settings.locks.common.keyName, stats, occupied, extraItems))
				usedTargets.add(candidate.target);
		}

		return {extraChests, extraItems, stats};
	}

	// ----- Guards, roaming creatures and monster generators -----

	_doorCells(objects) {
		return objects.filter(o => o?.type === 'entity' && o.name === 'door').map(o => ({x: Math.floor(o.x/this.tileSize), y: Math.floor(o.y/this.tileSize)}));
	}

	_isNearAny(cell, cells, radius = 1) { return cells.some(c => Math.abs(cell.x-c.x)<=radius && Math.abs(cell.y-c.y)<=radius); }

	_roomHasObject(room, objects) {
		return objects.some(obj => {
			if (!obj||obj.x==null||obj.y==null)return false; const x=Math.floor(obj.x/this.tileSize), y=Math.floor(obj.y/this.tileSize); return x>=room.x&&x<room.x+room.w&&y>=room.y&&y<room.y+room.h;
		});
	}

	// Places guards near valuable containers while respecting starts, doors and occupied cells.
	_placeTreasureGuards(chests = [], wardrobes = [], startPositions = [], occupiedObjects = []) {
		const result=[], containers=chests.concat(wardrobes), occupied=this._collectOccupied(occupiedObjects), doorCells=this._doorCells(occupiedObjects);
		const guardTypes=Object.keys(unitConfigs).filter(n => !this.settings.guards.excludedUnitTypes.includes(n));
		if (!guardTypes.length)return result;
		for (const room of this.rooms) {
			if (this._roomHasObject(room, startPositions))continue;
			let n=0;
			for (const c of containers)if (this._getObjectRoom(c)===room)n++;
			if (n<this.settings.guards.minContainersInRoom)continue;
			let cells=[];
			for (let y=room.y;y<room.y+room.h;y++)for (let x=room.x;x<room.x+room.w;x++){
				const cell={x, y};
				if (!this._isFloor(x, y)||occupied.has(x+':'+y)||this._isNearAny(cell, doorCells, this.settings.placement.doorClearance))continue;
				cells.push(cell);
			}
			if (!cells.length)continue;
			this._shuffle(cells);
			const count=Math.min(this._random()<this.settings.guards.extraGuardChance?this.settings.guards.maxGuardsPerRoom: 1, cells.length), type=guardTypes[this._rand(0, guardTypes.length-1)], aggro=Math.max(this.settings.guards.minAggroRadius, Math.ceil(Math.max(room.w, room.h)/2)+1);
			for (let i=0;i<count;i++){
				const c=cells[i];
				result.push({type: 'independent_unit', name: type, x: c.x*this.tileSize, y: c.y*this.tileSize, factionId: this.settings.factionId,
					independentAI: {type: 'guard', homeX: c.x, homeY: c.y, aggroRadius: aggro, leashRadius: aggro+this.settings.guards.leashExtra, patrolRadius: this.settings.guards.patrolRadius, aggression: this.settings.guards.aggression, patrolAggression: this.settings.guards.patrolAggression, returnAggression: this.settings.guards.returnAggression}});
				occupied.add(c.x+':'+c.y);
			}
		}
		return result;
	}

	// Places free-roaming dungeon creatures in reachable non-special areas.
	_placeRoamingCreatures(startPositions = [], occupiedObjects = []) {
		const result=[], factionId=this.settings.factionId, scale=(this.width*this.height)/this.settings.roamingCreatures.baseArea;
		const profiles=this.settings.roamingCreatures.profiles.map(profile => ({
			...profile,
			count: this._rand(
				Math.max(1, Math.round(profile.count[0]*scale)),
				Math.max(1, Math.round(profile.count[1]*scale))
			),
			dist: profile.minDistance
		}));
		const occupied=this._collectOccupied(occupiedObjects), doors=this._doorCells(occupiedObjects), placed=[];
		const arena=this.rooms.find(r => this._zoneForRoom(r)?.type==='arena'&&!this._roomHasObject(r, startPositions));
		let central=this.rooms.filter(r => !r.special&&this._zoneForRoom(r)?.type!=='special'&&!this._roomHasObject(r, startPositions)&&r!==arena);
		const mc={x: Math.floor(this.width/2), y: Math.floor(this.height/2)};
		central.sort((a, b) => this._dist2(this._roomCenter(a), mc)-this._dist2(this._roomCenter(b), mc));
		central=central.slice(0, Math.min(central.length, Math.max(this.settings.roamingCreatures.centralRoomMinCount, Math.ceil(central.length*this.settings.roamingCreatures.centralRoomFraction))));
		const cellsFor=(room, dist) => {
			const arr=[];
			for (let y=room.y;y<room.y+room.h;y++)for (let x=room.x;x<room.x+room.w;x++){
				const c={x, y};
				if (!this._isFloor(x, y)||occupied.has(x+':'+y)||this._isNearAny(c, doors, this.settings.placement.doorClearance))continue;
				if (placed.some(p => Math.max(Math.abs(p.x-x), Math.abs(p.y-y))<dist))continue;
				arr.push(c);
			}
			return arr;
		};
		for (const p of profiles){
			const types=p.types.filter(t => unitConfigs[t]!=null);
			if (!types.length)continue;
			for (let i=0;i<p.count;i++){
				let roomOrder=central.slice();
				this._shuffle(roomOrder);
				if (arena)roomOrder.unshift(arena);
				let cell=null;
				for (const r of roomOrder){
					let cs=cellsFor(r, p.dist);
					if (cs.length){
						cell=cs[this._rand(0, cs.length-1)];
						break;
					}
				}
				if (!cell)for (const r of roomOrder){
					let cs=cellsFor(r, 1);
					if (cs.length){
						cell=cs[this._rand(0, cs.length-1)];
						break;
					}
				}
				if (!cell)break;
				const type=types[this._rand(0, types.length-1)];
				result.push({type: 'independent_unit', name: type, x: cell.x*this.tileSize, y: cell.y*this.tileSize, factionId, independentAI: Object.assign({}, p.behavior, {homeX: cell.x, homeY: cell.y})});
				occupied.add(cell.x+':'+cell.y);
				placed.push(cell);
			}
		}
		return result;
	}

	// Builds one monster-generator entity with its generation options serialized as object properties.
	_createMonsterGeneratorObject(x, y, options={}) {
		const visual = {...this.settings.monsterGenerators.visual, ...options};
		return {type: 'entity', name: 'monster_generator', x: x*this.tileSize, y: y*this.tileSize, properties: [
			{name: 'visualSprite', value: visual.visualSprite}, {name: 'visualScale', value: visual.visualScale},
			{name: 'visualFrame', value: visual.visualFrame}, {name: 'visualOriginMode', value: visual.visualOriginMode},
			{name: 'depthOffset', value: visual.depthOffset}, {name: 'blocksLOS', value: visual.blocksLOS===true},
			{name: 'passable', value: visual.passable!==false}, {name: 'stepCost', value: visual.stepCost},
			{name: 'destructible', value: visual.destructible===true}, {name: 'generatorId', value: options.generatorId||null},
			{name: 'generator', value: this._clone(options.generator||{})}
		]};
	}

	// Places room-based monster generators away from starts, guards, doors and special chambers.
	_placeMonsterGenerators(startPositions = [], guards = [], occupiedObjects = []) {
		const result=[], occupied=this._collectOccupied(occupiedObjects), doors=this._doorCells(occupiedObjects);
		let rooms=this.rooms.filter(r => !r.special&&this._zoneForRoom(r)?.type!=='special'&&!this._roomHasObject(r, startPositions)&&!this._roomHasObject(r, guards));
		if (!rooms.length)return result;
		const genCfg=this.settings.monsterGenerators, areaScale=Math.sqrt((this.width*this.height)/genCfg.baseArea),
			hard=Math.min(genCfg.maxPerMap, rooms.length, Math.max(1, Math.ceil(rooms.length/genCfg.roomsPerGeneratorCap))),
			min=Math.min(hard, Math.max(1, Math.floor(genCfg.minScaleFactor*areaScale))), max=Math.min(hard, Math.max(min, Math.ceil(genCfg.maxScaleFactor*areaScale))),
			count=this._rand(min, max);
		this._shuffle(rooms);
		const profiles=genCfg.profiles.map(p => ({...p, behavior: Object.assign({}, genCfg.baseBehavior, p.behavior)})).filter(p => unitConfigs[p.type]!=null);
		let strong=false;
		const pick=() => {
			const a=profiles.filter(p => !p.strong||!strong);
			if (!a.length)return null;
			let total=a.reduce((s, p) => s+p.weight, 0), roll=this._random()*total;
			for (const p of a){
				roll-=p.weight;
				if (roll<=0)return p;
			}
			return a[a.length-1];
		};
		for (const room of rooms){
			if (result.length>=count)break;
			const cells=[];
			for (let y=room.y;y<room.y+room.h;y++)for (let x=room.x;x<room.x+room.w;x++){
				const c={x, y};
				if (this._isFloor(x, y)&&!occupied.has(x+':'+y)&&!this._isNearAny(c, doors, this.settings.placement.doorClearance))cells.push(c);
			}
			if (!cells.length)continue;
			const c=cells[this._rand(0, cells.length-1)], p=pick();
			if (!p)continue;
			if (p.strong)strong=true;
			result.push(this._createMonsterGeneratorObject(c.x, c.y, {
				...genCfg.visual,
				generator: {
					...genCfg.spawn,
					spawnChance: p.spawnChance, minCount: p.minCount, maxCount: p.maxCount, cooldownRounds: p.cooldownRounds,
					maxAlive: p.maxAlive, maxTotal: p.maxTotal, spawnedTotal: 0, factionId: this.settings.factionId,
					units: [{configName: p.type, weight: 1, behavior: this._clone(p.behavior)}],
					spawnEffect: this._clone(p.strong ? genCfg.strongSpawnEffect : genCfg.normalSpawnEffect)
				}
			}));
			occupied.add(c.x+':'+c.y);
		}
		return result;
	}

	// ----- Gameplay validation -----

	// Runs gameplay-level assertions for generated objects, doors, locks, keys and start positions.
	_validate(objects, doors, specialRooms, starts) {
		const errors=[];
		for (const special of specialRooms){
			const ds=doors.filter(d => d._portal?.type==='special_entrance'&&d._portal?.roomId===special.room.id);
			if (ds.length!==1)errors.push('special room '+special.room.id+' has '+ds.length+' special doors');
			else if (!this._isObjectLocked(ds[0]))errors.push('special room '+special.room.id+' door is not locked');
			const hasKey=objects.some(o => Array.isArray(o.items)&&o.items.some(i => i?.keyId===special.keyId||i?.params?.keyId===special.keyId||i?.features?.keyId===special.keyId));
			if (!hasKey)errors.push('no key placed for '+special.keyId);
		}
		for (const door of doors)if (door._portal?.type!=='special_entrance'&&this._isObjectLocked(door))errors.push('non-special door locked at '+door.x/this.tileSize+','+door.y/this.tileSize);
		for (const s of starts)if (!this._isFloor(Math.floor(s.x/this.tileSize), Math.floor(s.y/this.tileSize)))errors.push('start not on floor');
		if (errors.length)throw new Error('Map content validation failed: '+errors.join('; '));
		for (const d of doors) delete d._portal;
		for (const obj of objects) if (obj?._alcove) delete obj._alcove;
	}
}
globalThis.MapContentGenerator = MapContentGenerator;
