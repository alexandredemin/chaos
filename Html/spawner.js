//---------------------------- Monster spawner ----------------------------

class MonsterSpawner
{
	/*
	 * Creates a group of independent creatures around a source.
	 *
	 * Expected options:
	 *
	 * {
	 * 	source: entity,
	 * 	scene: scene,                  // optional when source.scene exists
	 * 	mapX: 10,                     // optional when source.mapX exists
	 * 	mapY: 12,                     // optional when source.mapY exists
	 *
	 * 	config: {
	 * 		minCount: 1,
	 * 		maxCount: 3,
	 * 		monsterTypes: ['rat', 'bat'],
	 * 		sameTypePerBatch: true,
	 * 		factionId: 'dungeon_creatures',
	 * 		minSpawnRadius: 1,
	 * 		spawnRadius: 2,
	 * 		allowPassableEntityCells: false,
	 * 		visible: true,
	 * 		behavior: {
	 * 			type: 'roam'
	 * 		}
	 * 	}
	 * }
	 */
	static spawn(options={}, onComplete=null)
	{
		const config = options.config || {};
		const effectConfig = config.spawnEffect || null;
		const finalVisible = config.visible !== false;
		const useAnimatedEffect = finalVisible === true && typeof MonsterSpawnAnimator !== 'undefined' && MonsterSpawnAnimator.isAnimatedEffect(effectConfig);

		// With an animated effect, real units are created hidden on their final reserved cells.
		// Without an effect, they are created normally visible.
		const result = this.createSpawnBatch(options, finalVisible === true && useAnimatedEffect !== true);
		
		const finish = () => {if(onComplete != null) onComplete(result);};

		if(result.success !== true || result.spawnedUnits.length <= 0)
		{
			finish();
			return result;
		}
		if(useAnimatedEffect !== true)
		{
			finish();
			return result;
		}
		MonsterSpawnAnimator.playBatch(
			{
				source: options.source || null,
				scene: options.scene || (options.source != null ? options.source.scene : null),
				units: result.spawnedUnits,
				effect: effectConfig,
				triggerUnit: options.triggerUnit || null,
				finalVisible: finalVisible
			},
			finish
		);
		//The result is returned immediately for inspection, while onComplete is called after all animations end.
		return result;
	}

	static createSpawnBatch(options={}, initialVisible=true)
	{
		const result = {
			success: false,
			reason: null,
			requestedCount: 0,
			plannedMonsterTypes: [],
			spawnedUnits: [],
			spawnCells: [],
			factionId: null
		};

		const source = options.source || null;
		const config = options.config || {};
		const scene = options.scene || (source != null ? source.scene : null);
		const origin = this.resolveOrigin(options, source);

		if(scene == null)
		{
			result.reason = 'scene_not_found';
			console.warn('MonsterSpawner: scene was not provided.');
			return result;
		}
		if(origin == null)
		{
			result.reason = 'origin_not_found';
			console.warn('MonsterSpawner: source position was not provided.');
			return result;
		}

		const monsterTypes = this.getValidMonsterTypes(config.monsterTypes);
		if(monsterTypes.length <= 0)
		{
			result.reason = 'no_valid_monster_types';
			console.warn('MonsterSpawner: no valid monster types were provided.', config.monsterTypes);
			return result;
		}

		const minCount = Math.max(0, Math.floor(config.minCount != null ? config.minCount: 1) );
		const maxCount = Math.max(minCount, Math.floor(config.maxCount != null? config.maxCount: minCount));
		const requestedCount = randomInt(minCount, maxCount);
		result.requestedCount = requestedCount;
		if(requestedCount <= 0)
		{
			result.reason = 'zero_count';
			return result;
		}
		const factionId = config.factionId || 'dungeon_creatures';
		result.factionId = factionId;
		const plannedMonsterTypes = this.chooseMonsterTypes(monsterTypes, requestedCount, config.sameTypePerBatch !== false);
		result.plannedMonsterTypes = plannedMonsterTypes.slice();
		const minSpawnRadius = Math.max(0, Math.floor(config.minSpawnRadius != null ? config.minSpawnRadius: 1));
		const spawnRadius = Math.max(minSpawnRadius, Math.floor(config.spawnRadius != null ? config.spawnRadius: 2));

		/*
		 * Cells reserved during this spawn call.
		 * createIndependentUnit() also adds every created unit to the global units array, but this set additionally
		 * protects the batch while cells are being selected.
		 */
		const reservedCells = new Set();

		for(let i = 0; i < plannedMonsterTypes.length; i++)
		{
			const configName = plannedMonsterTypes[i];
			const unitProbe = this.createUnitProbe(configName);
			const availableCells = this.getAvailableSpawnCells({
					source: source,
					originX: origin.x,
					originY: origin.y,
					minSpawnRadius: minSpawnRadius,
					spawnRadius: spawnRadius,
					unitProbe: unitProbe,
					reservedCells: reservedCells,
					allowPassableEntityCells: config.allowPassableEntityCells === true});
			if(availableCells.length <= 0)
			{
				//There is no suitable cell for this creature. Other creatures may still be created.
				continue;
			}
			// getAvailableSpawnCells() orders cells by distance from the source, but randomizes cells inside each ring.
			const cell = availableCells[0];
			const cellKey = this.getCellKey(cell.x, cell.y);
			reservedCells.add(cellKey);
			const behavior = this.createBehaviorConfig(config.behavior, cell);
			const unitVisible = initialVisible === true && config.visible !== false;
			const unit = createIndependentUnit(
				scene,
				configName,
				cell.x,
				cell.y,
				behavior,
				factionId,
				unitVisible
			);
			if(unit == null)
			{
				reservedCells.delete(cellKey);
				continue;
			}
			result.spawnedUnits.push(unit);
			result.spawnCells.push({x: cell.x, y: cell.y});
		}
		result.success = result.spawnedUnits.length > 0;
		if(result.success) result.reason = 'spawned';
		else result.reason = 'no_available_cells';
		return result;
	}


//---------------------------- Configuration ----------------------------

	static resolveOrigin(options, source)
	{
		if(options.mapX != null && options.mapY != null) return {x: Math.floor(options.mapX), y: Math.floor(options.mapY)};
		if(source != null && source.mapX != null && source.mapY != null) return {x: Math.floor(source.mapX),y: Math.floor(source.mapY)};
		return null;
	}

	static getValidMonsterTypes(monsterTypes)
	{
		if(!Array.isArray(monsterTypes)) return [];
		const result = [];
		for(let i = 0; i < monsterTypes.length; i++)
		{
			const configName = monsterTypes[i];
			if(typeof configName !== 'string')continue;
			if(unitConfigs[configName] == null)
			{
				console.warn('MonsterSpawner: unknown unit config "' + configName + '".');
				continue;
			}
			if(result.indexOf(configName) < 0) result.push(configName);
		}
		return result;
	}

	static chooseMonsterTypes(monsterTypes, count, sameTypePerBatch=true)
	{ 
		const result = [];
		if(monsterTypes.length <= 0 ||count <= 0) return result;
		if(sameTypePerBatch)
		{
			const configName = monsterTypes[randomInt(0, monsterTypes.length - 1)];
			for(let i = 0; i < count; i++)
			{
				result.push(configName);
			}
			return result;
		}
		for(let i = 0; i < count; i++)
		{
			result.push(monsterTypes[randomInt(0, monsterTypes.length - 1)]);
		}
		return result;
	}

	static createBehaviorConfig(behaviorConfig, spawnCell)
	{
		const behavior = clone(behaviorConfig || {type: 'idle'});
		if(behavior.type == null) behavior.type = 'idle';

		// Explicit home coordinates are preserved.
		// Otherwise every creature uses its actual spawn cell as its home position.
		if(behavior.homeX == null) behavior.homeX = spawnCell.x;
		if(behavior.homeY == null) behavior.homeY = spawnCell.y;
		return behavior;
	}

	static createUnitProbe(configName)
	{
		const config = unitConfigs[configName];
		if(config == null) return null;

		//A lightweight object used only for checking whether an entity permits this kind of unit on its cell.
		//It is not added to the scene or global unit arrays.
		return {
			config: config,
			features: clone(config.features || {}),
			abilities: clone(config.abilities || {}),
			player: null
		};
	}

//---------------------------- Cell selection ----------------------------

	static getAvailableSpawnCells(options)
	{
		const result = [];
		const source = options.source || null;
		const originX = options.originX;
		const originY = options.originY;
		const minSpawnRadius = options.minSpawnRadius;
		const spawnRadius = options.spawnRadius;
		const unitProbe = options.unitProbe || null;
		const reservedCells = options.reservedCells || new Set();
		const allowPassableEntityCells = options.allowPassableEntityCells === true;

		// Cells are collected ring by ring.
		// This keeps monsters close to the source while still randomizing their positions within the same radius.
		for(let radius = minSpawnRadius; radius <= spawnRadius; radius++)
		{
			const ring = [];
			for(let y = originY - radius; y <= originY + radius; y++)
			{
				for(let x = originX - radius; x <= originX + radius; x++)
				{
					const distance = Math.max(Math.abs(x - originX), Math.abs(y - originY));
					if(distance !== radius) continue;
					if(!this.isCellAvailable({
						source: source,
						mapX: x,
						mapY: y,
						unitProbe: unitProbe,
						reservedCells: reservedCells,
						allowPassableEntityCells: allowPassableEntityCells
					})) continue;
					ring.push({x: x, y: y});
				}
			}
			this.shuffle(ring);
			for(let i = 0; i < ring.length; i++) result.push(ring[i]);
		}
		return result;
	}

	static isCellAvailable(options)
	{
		const source = options.source || null;
		const mapX = options.mapX;
		const mapY = options.mapY;
		const unitProbe = options.unitProbe || null;
		const reservedCells = options.reservedCells || new Set();
		const allowPassableEntityCells = options.allowPassableEntityCells === true;
		if(mapX < 0 || mapX >= map.width || mapY < 0 || mapY >= map.height) return false;
		const cellKey = this.getCellKey(mapX, mapY);
		if(reservedCells.has(cellKey)) return false;
		if(source != null && source.mapX === mapX && source.mapY === mapY) return false;
		if(getUnitAtMap(mapX, mapY) != null) return false;
		const wallTile = wallsLayer.getTileAt(mapX, mapY);
		if(wallTile != null && wallTile.properties['collides'] === true) return false;
		const cellEntities = Entity.getEntitiesAtMap(mapX, mapY);
		if(cellEntities == null || cellEntities.length <= 0) return true;

		// By default monsters are spawned only on completely empty cells.
		// This avoids spawning directly onto doors, fire, webs, containers and other effects.
		if(!allowPassableEntityCells) return false;

		// When entity cells are explicitly allowed, every entity must explicitly permit the unit to stand there.
		// Entities without canStepOn() are rejected because spawning bypasses normal onBeforeStepIn()/onStepIn() processing.
		for(let i = 0; i < cellEntities.length; i++)
		{
			const entity = cellEntities[i];
			if(entity === source) return false;
			if(typeof entity.canStepOn !== 'function') return false;
			let canStepOn = false;
			try
			{
				canStepOn = entity.canStepOn(unitProbe) === true;
			}
			catch(error)
			{
				console.warn('MonsterSpawner: canStepOn() failed.', entity, error);
				return false;
			}
			if(!canStepOn) return false;
		}
		return true;
	}

	static getCellKey(mapX, mapY)
	{
		return mapX + ':' + mapY;
	}

	static shuffle(array)
	{
		for(let i = array.length - 1; i > 0; i--)
		{
			const j = randomInt(0, i);
			const temp = array[i];
			array[i] = array[j];
			array[j] = temp;
		}
		return array;
	}
}