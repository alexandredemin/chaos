// Game-specific population policy for a GeneratedDungeon.
// Geometry stays in DungeonGenerator; this layer creates Tiled-like objects consumed by GameScene.
const MAP_CONTENT_RNG_SALT = 0xB5297A4D;

class MapContentGenerator {
	constructor(cfg, dungeon, tiledMap, seed) {
		this.cfg = cfg || {};
		this.dungeon = dungeon;
		this.map = tiledMap;
		this.width = dungeon.layout?.width || tiledMap.walls[0].length;
		this.height = dungeon.layout?.height || tiledMap.walls.length;
		this.rooms = dungeon.rooms || [];
		this.zones = dungeon.zones || [];
		this.portals = dungeon.portals || [];
		this.zoneById = new Map(this.zones.map(z => [z.id, z]));
		this.roomById = new Map(this.rooms.map(r => [r.id, r]));
		this.roomAt = this._buildRoomAt();
		this.rng = new RNG(((seed || 1) ^ MAP_CONTENT_RNG_SALT) >>> 0);
	}

	generate() {
		const doors = this._createDoors();
		const specialRooms = this._getSpecialRoomDescriptors(doors);
		const startPositions = this._generateStartPositions(this.cfg.startCount || 4);
		const items = this._placeItems(startPositions.concat(doors));
		const chests = this._placeChests(startPositions.concat(doors, items));
		const wardrobes = this._placeWardrobes(startPositions.concat(doors, items, chests));
		const commonLockCount = this._lockRandomContainers(chests, wardrobes);
		const specialContent = this._populateSpecialRooms(specialRooms, startPositions.concat(doors, items, chests, wardrobes));
		chests.push(...specialContent.chests);
		wardrobes.push(...specialContent.wardrobes);
		const keyChests = this._placeLockKeys(
			specialRooms,
			commonLockCount,
			chests,
			wardrobes,
			startPositions.concat(doors, items, chests, wardrobes)
		);
		chests.push(...keyChests);
		const treasureGuards = this._placeTreasureGuards(
			chests,
			wardrobes,
			startPositions,
			startPositions.concat(doors, items, chests, wardrobes)
		);
		const monsterGenerators = this._placeMonsterGenerators(
			startPositions,
			treasureGuards,
			startPositions.concat(doors, items, chests, wardrobes, treasureGuards)
		);
		const roamingCreatures = this._placeRoamingCreatures(
			startPositions,
			startPositions.concat(doors, items, chests, wardrobes, treasureGuards, monsterGenerators)
		);
		const objects = startPositions.concat(doors, items, chests, wardrobes, treasureGuards, monsterGenerators, roamingCreatures);
		this._validate(objects, doors, specialRooms, startPositions);
		return {
			objects,
			stats: {
				doors: doors.length,
				lockedSpecialDoors: doors.filter(d => this._isObjectLocked(d)).length,
				starts: startPositions.length,
				items: items.length,
				chests: chests.length,
				wardrobes: wardrobes.length,
				guards: treasureGuards.length,
				monsterGenerators: monsterGenerators.length,
				roamingCreatures: roamingCreatures.length
			}
		};
	}

	_random() { return this.rng.next(); }
	_rand(a, b) { return this.rng.int(a, b); }
	_shuffle(array) { return this.rng.shuffle(array); }
	_clone(value) {
		if (typeof clone === 'function') return clone(value);
		return value == null ? value : JSON.parse(JSON.stringify(value));
	}
	_buildRoomAt() {
		const grid = Array.from({length:this.height}, () => Array(this.width).fill(null));
		for (const room of this.rooms) for (let y = room.y; y < room.y + room.h; y++) for (let x = room.x; x < room.x + room.w; x++)
			if (x >= 0 && y >= 0 && x < this.width && y < this.height) grid[y][x] = room;
		return grid;
	}
	_roomCenter(room) { return {x:room.x + Math.floor(room.w / 2), y:room.y + Math.floor(room.h / 2)}; }
	_dist2(a, b) { const dx = a.x - b.x, dy = a.y - b.y; return dx * dx + dy * dy; }
	_zoneForRoom(room) { return room ? this.zoneById.get(room.zoneId) || null : null; }
	_getRoomAtMap(x, y) { return this.roomAt[y]?.[x] || null; }
	_getObjectRoom(obj) {
		if (!obj || obj.x == null || obj.y == null) return null;
		return this._getRoomAtMap(Math.floor(obj.x / 16), Math.floor(obj.y / 16));
	}
	_isOrdinaryRoom(room) {
		const zone = this._zoneForRoom(room);
		return !!room && !room.special && !!zone && zone.type === 'normal';
	}
	_isKeySafeRoom(room) {
		// Any non-special chamber is reachable without opening a special-room door.
		// This includes the arena and auxiliary rooms inside special zones.
		return !!room && room.special !== true && this._zoneForRoom(room) != null;
	}
	_ordinaryRooms() { return this.rooms.filter(r => this._isOrdinaryRoom(r)); }
	_specialRooms() { return this.rooms.filter(r => r.special === true); }
	_isFloor(x, y) { return y >= 0 && y < this.map.walls.length && x >= 0 && x < this.map.walls[y].length && this.map.walls[y][x] === null; }
	_collectOccupied(objects = []) {
		const result = new Set();
		for (const obj of objects) if (obj && obj.x != null && obj.y != null)
			result.add(Math.floor(obj.x / 16) + ':' + Math.floor(obj.y / 16));
		return result;
	}
	_getObjectProperty(obj, name) {
		if (!obj || !Array.isArray(obj.properties)) return null;
		const prop = obj.properties.find(p => p && p.name === name);
		return prop != null ? prop.value : null;
	}
	_setObjectProperty(obj, name, value, type = null) {
		if (!Array.isArray(obj.properties)) obj.properties = [];
		let prop = obj.properties.find(p => p && p.name === name);
		if (!prop) { prop = {name, value}; if (type != null) prop.type = type; obj.properties.push(prop); return; }
		prop.value = value;
		if (type != null) prop.type = type;
	}
	_isObjectLocked(obj) {
		const lock = this._getObjectProperty(obj, 'lock');
		return lock != null && lock.locked === true;
	}

	// Door policy lives here on purpose. ScenarioBinder can replace this later without touching geometry.
	_doorLockForPortal(portal) {
		if (portal.type !== 'special_entrance') return null;
		return { locked:true, type:'key', keyId:portal.keyId, consumeKey:false };
	}
	_createDoors() {
		const doors = [];
		for (const portal of this.portals) {
			if (!portal.doorSuitable || !portal.direction) continue;
			const properties = [
				{name:'direction', type:'string', value:portal.direction},
				{name:'open', type:'bool', value:false},
				{name:'portalId', type:'string', value:portal.id},
				{name:'portalType', type:'string', value:portal.type}
			];
			const lock = this._doorLockForPortal(portal);
			if (lock) properties.push({name:'lock', value:lock});
			doors.push({type:'entity', name:'door', x:portal.x * 16, y:portal.y * 16, properties, _portal:portal});
		}
		return doors;
	}
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
				keyName: portal?.keyName || (type === 'library' ? 'Library key' : type === 'treasury' ? 'Treasury key' : 'Special room key')
			};
		});
	}

	_generateStartPositions(count = 4) {
		const objects = [];
		const ordinary = this._ordinaryRooms();
		const supplemental = this.rooms.filter(r => this._isKeySafeRoom(r) && !ordinary.includes(r));
		const candidateRooms = ordinary.concat(supplemental);
		if (!candidateRooms.length) return objects;
		const maxCount = Math.min(count, candidateRooms.length);
		const candidates = candidateRooms.map(room => ({room, center:this._roomCenter(room)}));
		const selected = [];
		const mapCenter = {x:Math.floor(this.width / 2), y:Math.floor(this.height / 2)};
		let first = candidates[0], bestD = -Infinity;
		for (const c of candidates) { const d = this._dist2(c.center, mapCenter); if (d > bestD) { bestD = d; first = c; } }
		selected.push(first); candidates.splice(candidates.indexOf(first), 1);
		while (selected.length < maxCount) {
			let bestCandidate = null, bestMinDist = -Infinity;
			for (const c of candidates) {
				let minDist = Infinity;
				for (const s of selected) minDist = Math.min(minDist, this._dist2(c.center, s.center));
				if (minDist > bestMinDist) { bestMinDist = minDist; bestCandidate = c; }
			}
			if (!bestCandidate) break;
			selected.push(bestCandidate); candidates.splice(candidates.indexOf(bestCandidate), 1);
		}
		for (const s of selected) objects.push({type:'start', name:'start', x:s.center.x * 16, y:s.center.y * 16});
		return objects;
	}

	_getNormalLootItemNames() { return Object.keys(itemConfigs).filter(name => name !== 'key'); }
	_getPremiumPotionNames() {
		const preferred = ['strength_potion','defense_potion','speed_potion','invisible_potion','mana_potion'];
		const result = preferred.filter(name => itemConfigs[name] != null);
		return result.length ? result : this._getNormalLootItemNames().filter(name => name !== 'spell_scroll');
	}
	_chooseSpellForLootTier(tier) {
		let spells = Object.keys(spellConfigs).filter(id => {
			const cost = spellConfigs[id]?.cost || 0;
			if (tier === 'normal') return cost <= 4;
			if (tier === 'rare') return cost >= 5 && cost <= 7;
			if (tier === 'legendary') return cost >= 8;
			return true;
		});
		if (!spells.length) { spells = Object.keys(spellConfigs); if (tier === 'normal') spells = spells.filter(id => id !== 'demon'); }
		return spells.length ? spells[this._rand(0, spells.length - 1)] : null;
	}
	_createSpellScroll(source = 'normal') {
		let tier = 'normal';
		if (source === 'locked') tier = this._random() < .25 ? 'legendary' : 'rare';
		else if (source === 'special') tier = this._random() < .45 ? 'legendary' : 'rare';
		const spell = this._chooseSpellForLootTier(tier);
		if (spell == null) return createItemData('spell_scroll', {});
		const cost = Math.max(1, spellConfigs[spell]?.cost || 1);
		let points = source === 'normal' ? this._rand(8,14) : source === 'locked' ? this._rand(10,18) : this._rand(12,20);
		let amount = Math.max(1, Math.round(points / cost));
		if (cost >= 8) amount = 1;
		amount = Math.min(amount, 12);
		return createItemData('spell_scroll', {spell, amount});
	}
	_createLootItem(tier = 'normal') {
		if (tier === 'library') {
			if (this._random() < .75) return this._createSpellScroll('special');
			const pool = ['mana_potion','invisible_potion'].filter(name => itemConfigs[name] != null);
			return pool.length ? createItemData(pool[this._rand(0,pool.length-1)], {}) : this._createSpellScroll('special');
		}
		if (tier === 'treasury') {
			if (this._random() < .35) return this._createSpellScroll('special');
			const pool = this._getPremiumPotionNames();
			return pool.length ? createItemData(pool[this._rand(0,pool.length-1)], {}) : null;
		}
		if (tier === 'locked') {
			if (this._random() < .45) return this._createSpellScroll('locked');
			const pool = this._getPremiumPotionNames();
			return pool.length ? createItemData(pool[this._rand(0,pool.length-1)], {}) : null;
		}
		const pool = this._getNormalLootItemNames();
		if (!pool.length) return null;
		const itemName = pool[this._rand(0,pool.length-1)];
		return itemName === 'spell_scroll' ? this._createSpellScroll('normal') : createItemData(itemName, {});
	}
	_createLoot(count, tier = 'normal') {
		const result = [];
		for (let i = 0; i < count; i++) { const item = this._createLootItem(tier); if (item) result.push(item); }
		return result;
	}
	_getContainerSpawnConfig(name) {
		const wardrobe = name === 'wardrobe';
		return {
			probability:.30, minCount:1, maxCount:2,
			monsterTypes:wardrobe ? ['rat','bat'] : ['rat'], sameTypePerBatch:true,
			factionId:'dungeon_creatures', minSpawnRadius:1, spawnRadius:2, allowPassableEntityCells:true,
			behavior:{type:'roam',minGoalDistance:8,maxGoalDistance:24,goalTolerance:1,stuckTurnLimit:3,aggroRadius:6,pursuitRadius:12,pursuitCooldownTurns:1,targetAggression:1,travelAggression:3,combatAggression:6},
			spawnEffect:wardrobe ? {type:'emerge',initialScale:.18,intermediateScale:.45,initialAlpha:.35,sourceOffsetX:0,sourceOffsetY:4,emergeLift:2,emergeDuration:150,moveDuration:320,staggerDelay:100,maxStaggerDelay:400,playMoveAnimation:true}
				: {type:'burst',initialScale:.25,launchScale:.72,overshootScale:1.10,sourceOffsetX:0,sourceOffsetY:-2,jumpHeight:7,launchDuration:110,moveDuration:240,settleDuration:90,staggerDelay:90,maxStaggerDelay:360,playMoveAnimation:true}
		};
	}
	_createContainerObject(name, x, y, items = [], lock = null) {
		const properties = [
			{name:'monsterSpawnResolved',value:false},
			{name:'monsterSpawn',value:this._getContainerSpawnConfig(name)}
		];
		if (lock) properties.push({name:'lock',value:this._clone(lock)});
		return {type:'entity',name,x:x*16,y:y*16,properties,items};
	}
	_findFreeRoomCell(room, occupied) {
		for (let attempt = 0; attempt < 60; attempt++) {
			const x = this._rand(room.x, room.x + room.w - 1), y = this._rand(room.y, room.y + room.h - 1), key = x + ':' + y;
			if (!occupied.has(key) && this._isFloor(x,y)) return {x,y};
		}
		for (let y = room.y; y < room.y + room.h; y++) for (let x = room.x; x < room.x + room.w; x++)
			if (!occupied.has(x+':'+y) && this._isFloor(x,y)) return {x,y};
		return null;
	}
	_findWardrobeCell(room, occupied) {
		const y = room.y, minX = room.x + 1, maxX = room.x + room.w - 2;
		if (maxX < minX) return null;
		for (let attempt = 0; attempt < 40; attempt++) {
			const x = this._rand(minX,maxX);
			if (occupied.has(x+':'+y) || occupied.has(x+':'+(y-1)) || !this._isFloor(x,y)) continue;
			return {x,y};
		}
		return null;
	}

	_placeItems(occupiedObjects = []) {
		const objects = [], occupied = this._collectOccupied(occupiedObjects);
		for (const room of this._ordinaryRooms()) {
			if (this._rand(1,100) > 70) continue;
			const itemCount = this._rand(1,2);
			let placed = 0, attempts = 0;
			while (placed < itemCount && attempts++ < 20) {
				const x = this._rand(room.x,room.x+room.w-1), y = this._rand(room.y,room.y+room.h-1), key=x+':'+y;
				if (occupied.has(key) || !this._isFloor(x,y)) continue;
				const item = this._createLootItem('normal'); if (!item) continue;
				objects.push({type:'entity',name:'item',x:x*16,y:y*16,properties:[],items:[item]}); occupied.add(key); placed++;
			}
		}
		return objects;
	}
	_placeChests(occupiedObjects = []) {
		const objects = [], occupied = this._collectOccupied(occupiedObjects);
		for (const room of this._ordinaryRooms()) {
			if (this._rand(1,100) > 30) continue;
			for (let attempt = 0; attempt < 20; attempt++) {
				const cell = this._findFreeRoomCell(room, occupied); if (!cell) break;
				objects.push(this._createContainerObject('chest',cell.x,cell.y,this._createLoot(this._rand(1,5),'normal'))); occupied.add(cell.x+':'+cell.y); break;
			}
		}
		return objects;
	}
	_placeWardrobes(occupiedObjects = []) {
		const objects = [], occupied = this._collectOccupied(occupiedObjects);
		for (const room of this._ordinaryRooms()) {
			if (this._rand(1,100) > 20) continue;
			const maxWardrobes = Math.min(3, Math.max(0, room.w - 2)); if (!maxWardrobes) continue;
			const count = this._rand(1,maxWardrobes);
			for (let i = 0; i < count; i++) {
				const cell = this._findWardrobeCell(room,occupied); if (!cell) break;
				objects.push(this._createContainerObject('wardrobe',cell.x,cell.y,this._createLoot(this._rand(1,4),'normal'))); occupied.add(cell.x+':'+cell.y);
			}
		}
		return objects;
	}
	_populateSpecialRooms(specialRooms, occupiedObjects = []) {
		const result = {chests:[],wardrobes:[]}, occupied = this._collectOccupied(occupiedObjects);
		for (const special of specialRooms) {
			if (special.type === 'treasury') {
				for (let i = 0, count = this._rand(3,5); i < count; i++) {
					const cell = this._findFreeRoomCell(special.room, occupied); if (!cell) break;
					result.chests.push(this._createContainerObject('chest',cell.x,cell.y,this._createLoot(this._rand(3,5),'treasury'))); occupied.add(cell.x+':'+cell.y);
				}
			} else {
				const count = Math.min(this._rand(3,5), Math.max(1,special.room.w-2));
				for (let i = 0; i < count; i++) {
					const cell = this._findWardrobeCell(special.room, occupied); if (!cell) break;
					result.wardrobes.push(this._createContainerObject('wardrobe',cell.x,cell.y,this._createLoot(this._rand(2,4),'library'))); occupied.add(cell.x+':'+cell.y);
				}
			}
		}
		return result;
	}
	_lockRandomContainers(chests = [], wardrobes = []) {
		const containers = chests.concat(wardrobes);
		if (containers.length < 4) return 0;
		this._shuffle(containers);
		const count = Math.min(containers.length, Math.max(1,Math.round(containers.length * .12)));
		for (let i = 0; i < count; i++) {
			const container = containers[i];
			this._setObjectProperty(container,'lock',{locked:true,type:'key',keyId:'common',consumeKey:true});
			if (!Array.isArray(container.items)) container.items=[];
			const premium = this._createLootItem('locked'); if (premium) container.items.push(premium);
		}
		return count;
	}
	_getKeyContainerCandidates(chests = [], wardrobes = []) {
		return chests.concat(wardrobes).filter(c => {
			if (this._isObjectLocked(c)) return false;
			const room = this._getObjectRoom(c);
			return this._isKeySafeRoom(room);
		});
	}
	_createFallbackKeyChest(targetRoom, occupied) {
		let rooms = this.rooms.filter(r => this._isKeySafeRoom(r)).slice();
		if (!rooms.length) return null;
		if (targetRoom) {
			const target = this._roomCenter(targetRoom);
			rooms.sort((a,b) => {
				const ca=this._roomCenter(a),cb=this._roomCenter(b);
				return (Math.abs(cb.x-target.x)+Math.abs(cb.y-target.y))-(Math.abs(ca.x-target.x)+Math.abs(ca.y-target.y));
			});
		}
		for (const room of rooms) {
			const cell=this._findFreeRoomCell(room,occupied); if(!cell) continue;
			occupied.add(cell.x+':'+cell.y);
			return this._createContainerObject('chest',cell.x,cell.y,this._createLoot(this._rand(1,2),'normal'));
		}
		return null;
	}
	_placeLockKeys(specialRooms, commonLockCount, chests = [], wardrobes = [], occupiedObjects = []) {
		const extraChests = [], occupied = this._collectOccupied(occupiedObjects), usedUniqueContainers = new Set();
		const candidates = () => this._getKeyContainerCandidates(chests.concat(extraChests),wardrobes);
		for (const special of specialRooms) {
			let list=candidates();
			if (!list.length) { const chest=this._createFallbackKeyChest(special.room,occupied); if(chest){extraChests.push(chest);list=[chest];} }
			if(!list.length) continue;
			let unused=list.filter(c=>!usedUniqueContainers.has(c)); if(!unused.length) unused=list;
			const target=this._roomCenter(special.room);
			unused.sort((a,b)=>{
				const ra=this._getObjectRoom(a),rb=this._getObjectRoom(b),ca=ra?this._roomCenter(ra):target,cb=rb?this._roomCenter(rb):target;
				return (Math.abs(cb.x-target.x)+Math.abs(cb.y-target.y))-(Math.abs(ca.x-target.x)+Math.abs(ca.y-target.y));
			});
			const container=unused[this._rand(0,Math.max(0,Math.ceil(unused.length*.30)-1))];
			if(!Array.isArray(container.items)) container.items=[];
			container.items.push(createItemData('key',{keyId:special.keyId,name:special.keyName})); usedUniqueContainers.add(container);
		}
		for(let i=0;i<commonLockCount;i++) {
			let list=candidates();
			if(!list.length){const chest=this._createFallbackKeyChest(null,occupied);if(chest){extraChests.push(chest);list=[chest];}}
			if(!list.length)break;
			const container=list[this._rand(0,list.length-1)]; if(!Array.isArray(container.items))container.items=[];
			container.items.push(createItemData('key',{keyId:'common',name:'Common key'}));
		}
		return extraChests;
	}

	_doorCells(objects) {
		return objects.filter(o => o?.type === 'entity' && o.name === 'door').map(o => ({x:Math.floor(o.x/16),y:Math.floor(o.y/16)}));
	}
	_isNearAny(cell, cells, radius = 1) { return cells.some(c => Math.abs(cell.x-c.x)<=radius && Math.abs(cell.y-c.y)<=radius); }
	_roomHasObject(room, objects) {
		return objects.some(obj => { if(!obj||obj.x==null||obj.y==null)return false; const x=Math.floor(obj.x/16),y=Math.floor(obj.y/16); return x>=room.x&&x<room.x+room.w&&y>=room.y&&y<room.y+room.h; });
	}
	_placeTreasureGuards(chests = [], wardrobes = [], startPositions = [], occupiedObjects = []) {
		const result=[], containers=chests.concat(wardrobes), occupied=this._collectOccupied(occupiedObjects), doorCells=this._doorCells(occupiedObjects);
		const guardTypes=Object.keys(unitConfigs).filter(n=>!['wizard','rat','bat'].includes(n)); if(!guardTypes.length)return result;
		for(const room of this.rooms) {
			if(this._roomHasObject(room,startPositions))continue;
			let n=0;for(const c of containers)if(this._getObjectRoom(c)===room)n++;
			if(n<2)continue;
			let cells=[];for(let y=room.y;y<room.y+room.h;y++)for(let x=room.x;x<room.x+room.w;x++){
				const cell={x,y};if(!this._isFloor(x,y)||occupied.has(x+':'+y)||this._isNearAny(cell,doorCells,1))continue;cells.push(cell);
			}
			if(!cells.length)continue;this._shuffle(cells);
			const count=Math.min(this._random()<.40?2:1,cells.length),type=guardTypes[this._rand(0,guardTypes.length-1)],aggro=Math.max(4,Math.ceil(Math.max(room.w,room.h)/2)+1);
			for(let i=0;i<count;i++){const c=cells[i];result.push({type:'independent_unit',name:type,x:c.x*16,y:c.y*16,factionId:'dungeon_creatures',independentAI:{type:'guard',homeX:c.x,homeY:c.y,aggroRadius:aggro,leashRadius:aggro+3,patrolRadius:3,aggression:4,patrolAggression:2,returnAggression:1}});occupied.add(c.x+':'+c.y);}
		}
		return result;
	}
	_placeRoamingCreatures(startPositions = [], occupiedObjects = []) {
		const result=[], factionId='dungeon_creatures', scale=(this.width*this.height)/(20*20);
		const profiles=[
			{count:this._rand(Math.max(1,Math.round(1*scale)),Math.max(1,Math.round(2*scale))),types:['chort','muddy','demon','troll'],dist:3,behavior:{type:'roam',minGoalDistance:16,maxGoalDistance:40,goalTolerance:1,stuckTurnLimit:3,aggroRadius:7,pursuitRadius:14,pursuitCooldownTurns:1,targetAggression:1,travelAggression:3,combatAggression:6}},
			{count:this._rand(Math.max(1,Math.round(5*scale)),Math.max(1,Math.round(7*scale))),types:['rat','bat'],dist:2,behavior:{type:'roam',minGoalDistance:8,maxGoalDistance:24,goalTolerance:1,stuckTurnLimit:3,aggroRadius:4,pursuitRadius:7,pursuitCooldownTurns:2,targetAggression:.1,travelAggression:.5,combatAggression:2}}
		];
		const occupied=this._collectOccupied(occupiedObjects),doors=this._doorCells(occupiedObjects),placed=[];
		const arena=this.rooms.find(r=>this._zoneForRoom(r)?.type==='arena'&&!this._roomHasObject(r,startPositions));
		let central=this.rooms.filter(r=>!r.special&&this._zoneForRoom(r)?.type!=='special'&&!this._roomHasObject(r,startPositions)&&r!==arena);
		const mc={x:Math.floor(this.width/2),y:Math.floor(this.height/2)};central.sort((a,b)=>this._dist2(this._roomCenter(a),mc)-this._dist2(this._roomCenter(b),mc));central=central.slice(0,Math.min(central.length,Math.max(4,Math.ceil(central.length/2))));
		const cellsFor=(room,dist)=>{const arr=[];for(let y=room.y;y<room.y+room.h;y++)for(let x=room.x;x<room.x+room.w;x++){const c={x,y};if(!this._isFloor(x,y)||occupied.has(x+':'+y)||this._isNearAny(c,doors,1))continue;if(placed.some(p=>Math.max(Math.abs(p.x-x),Math.abs(p.y-y))<dist))continue;arr.push(c);}return arr;};
		for(const p of profiles){const types=p.types.filter(t=>unitConfigs[t]!=null);if(!types.length)continue;for(let i=0;i<p.count;i++){let roomOrder=central.slice();this._shuffle(roomOrder);if(arena)roomOrder.unshift(arena);let cell=null;for(const r of roomOrder){let cs=cellsFor(r,p.dist);if(cs.length){cell=cs[this._rand(0,cs.length-1)];break;}}if(!cell)for(const r of roomOrder){let cs=cellsFor(r,1);if(cs.length){cell=cs[this._rand(0,cs.length-1)];break;}}if(!cell)break;const type=types[this._rand(0,types.length-1)];result.push({type:'independent_unit',name:type,x:cell.x*16,y:cell.y*16,factionId,independentAI:Object.assign({},p.behavior,{homeX:cell.x,homeY:cell.y})});occupied.add(cell.x+':'+cell.y);placed.push(cell);}}
		return result;
	}
	_createMonsterGeneratorObject(x,y,options={}) {
		return {type:'entity',name:'monster_generator',x:x*16,y:y*16,properties:[
			{name:'visualSprite',value:options.visualSprite||'hole'},{name:'visualScale',value:options.visualScale??.15},{name:'visualFrame',value:options.visualFrame??0},{name:'visualOriginMode',value:options.visualOriginMode||'center'},{name:'depthOffset',value:options.depthOffset??-40},{name:'blocksLOS',value:options.blocksLOS===true},{name:'passable',value:options.passable!==false},{name:'stepCost',value:options.stepCost??1},{name:'destructible',value:options.destructible===true},{name:'generatorId',value:options.generatorId||null},{name:'generator',value:this._clone(options.generator||{})}
		]};
	}
	_placeMonsterGenerators(startPositions = [], guards = [], occupiedObjects = []) {
		const result=[],occupied=this._collectOccupied(occupiedObjects),doors=this._doorCells(occupiedObjects);
		let rooms=this.rooms.filter(r=>!r.special&&this._zoneForRoom(r)?.type!=='special'&&!this._roomHasObject(r,startPositions)&&!this._roomHasObject(r,guards));if(!rooms.length)return result;
		const areaScale=Math.sqrt((this.width*this.height)/(20*20)),hard=Math.min(5,rooms.length,Math.max(1,Math.ceil(rooms.length/3))),min=Math.min(hard,Math.max(1,Math.floor(1.5*areaScale))),max=Math.min(hard,Math.max(min,Math.ceil(2*areaScale))),count=this._rand(min,max);this._shuffle(rooms);
		const roam={type:'roam',minGoalDistance:8,maxGoalDistance:24,goalTolerance:1,stuckTurnLimit:3,aggroRadius:5,pursuitRadius:10,pursuitCooldownTurns:1};
		const profiles=[
			{type:'rat',weight:42,spawnChance:.18,minCount:1,maxCount:2,cooldownRounds:1,maxAlive:4,maxTotal:10,behavior:Object.assign({},roam,{targetAggression:.35,travelAggression:1,combatAggression:3})},
			{type:'bat',weight:35,spawnChance:.18,minCount:1,maxCount:2,cooldownRounds:1,maxAlive:4,maxTotal:10,behavior:Object.assign({},roam,{aggroRadius:6,pursuitRadius:12,targetAggression:.45,travelAggression:1,combatAggression:3})},
			{type:'spider',weight:16,spawnChance:.12,minCount:1,maxCount:1,cooldownRounds:2,maxAlive:3,maxTotal:6,behavior:Object.assign({},roam,{targetAggression:.7,travelAggression:2,combatAggression:4})},
			{type:'muddy',weight:4,strong:true,spawnChance:.08,minCount:1,maxCount:1,cooldownRounds:3,maxAlive:1,maxTotal:3,behavior:Object.assign({},roam,{minGoalDistance:14,maxGoalDistance:36,aggroRadius:7,pursuitRadius:14,targetAggression:1,travelAggression:3,combatAggression:6})},
			{type:'chort',weight:3,strong:true,spawnChance:.10,minCount:1,maxCount:1,cooldownRounds:3,maxAlive:2,maxTotal:4,behavior:Object.assign({},roam,{minGoalDistance:14,maxGoalDistance:36,aggroRadius:7,pursuitRadius:14,targetAggression:1,travelAggression:3,combatAggression:6})}
		].filter(p=>unitConfigs[p.type]!=null);
		let strong=false;const pick=()=>{const a=profiles.filter(p=>!p.strong||!strong);if(!a.length)return null;let total=a.reduce((s,p)=>s+p.weight,0),roll=this._random()*total;for(const p of a){roll-=p.weight;if(roll<=0)return p;}return a[a.length-1];};
		for(const room of rooms){if(result.length>=count)break;const cells=[];for(let y=room.y;y<room.y+room.h;y++)for(let x=room.x;x<room.x+room.w;x++){const c={x,y};if(this._isFloor(x,y)&&!occupied.has(x+':'+y)&&!this._isNearAny(c,doors,1))cells.push(c);}if(!cells.length)continue;const c=cells[this._rand(0,cells.length-1)],p=pick();if(!p)continue;if(p.strong)strong=true;result.push(this._createMonsterGeneratorObject(c.x,c.y,{visualSprite:'hole',visualScale:1,visualOriginMode:'center',depthOffset:-40,blocksLOS:false,passable:true,stepCost:1,destructible:false,generator:{enabled:true,spawnChance:p.spawnChance,minCount:p.minCount,maxCount:p.maxCount,cooldownRounds:p.cooldownRounds,maxAlive:p.maxAlive,maxTotal:p.maxTotal,spawnedTotal:0,factionId:'dungeon_creatures',minSpawnRadius:1,spawnRadius:2,allowPassableEntityCells:false,units:[{configName:p.type,weight:1,behavior:this._clone(p.behavior)}],spawnEffect:p.strong?{type:'burst',initialScale:.2,launchScale:.7,overshootScale:1.1,jumpHeight:6,launchDuration:120,moveDuration:250,settleDuration:90,staggerDelay:100,playMoveAnimation:true}:{type:'emerge',initialScale:.15,intermediateScale:.4,initialAlpha:.35,sourceOffsetY:3,emergeLift:2,emergeDuration:150,moveDuration:300,staggerDelay:100,playMoveAnimation:true}}}));occupied.add(c.x+':'+c.y);}
		return result;
	}

	_validate(objects, doors, specialRooms, starts) {
		const errors=[];
		for(const special of specialRooms){const ds=doors.filter(d=>d._portal?.type==='special_entrance'&&d._portal?.roomId===special.room.id);if(ds.length!==1)errors.push('special room '+special.room.id+' has '+ds.length+' special doors');else if(!this._isObjectLocked(ds[0]))errors.push('special room '+special.room.id+' door is not locked');const hasKey=objects.some(o=>Array.isArray(o.items)&&o.items.some(i=>i?.keyId===special.keyId||i?.params?.keyId===special.keyId||i?.features?.keyId===special.keyId));if(!hasKey)errors.push('no key placed for '+special.keyId);}
		for(const door of doors)if(door._portal?.type!=='special_entrance'&&this._isObjectLocked(door))errors.push('non-special door locked at '+door.x/16+','+door.y/16);
		for(const s of starts)if(!this._isFloor(Math.floor(s.x/16),Math.floor(s.y/16)))errors.push('start not on floor');
		if(errors.length)throw new Error('Map content validation failed: '+errors.join('; '));
		for(const d of doors) delete d._portal;
	}
}
globalThis.MapContentGenerator = MapContentGenerator;
