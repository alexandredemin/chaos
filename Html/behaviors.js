//---------------------------- Independent behaviors ----------------------------
class IndependentBehavior
{
	constructor(controller)
	{
		this.controller = controller;
	}

	ensureConfig(unit)
	{
		if(unit.independentAI == null)
		{
			unit.independentAI = {
				type: 'idle',
				homeX: unit.mapX,
				homeY: unit.mapY
			};
		}

		const config = unit.independentAI;

		if(config.type == null) config.type = 'idle';
		if(config.homeX == null) config.homeX = unit.mapX;
		if(config.homeY == null) config.homeY = unit.mapY;

		return config;
	}

	onTurnStart(unit)
	{
		this.ensureConfig(unit);
	}

	getUnitAI(unit)
	{
		return this.controller.ensureUnitAIControl(unit);
	}

	getGridDistance(x1, y1, x2, y2)
	{
		// Юниты могут ходить по диагонали.
		return Math.max(
			Math.abs(x1 - x2),
			Math.abs(y1 - y2)
		);
	}

	getDistanceFromHome(unit, mapX=null, mapY=null)
	{
		const config = this.ensureConfig(unit);

		if(mapX == null) mapX = unit.mapX;
		if(mapY == null) mapY = unit.mapY;

		return this.getGridDistance(
			config.homeX,
			config.homeY,
			mapX,
			mapY
		);
	}

	clearGoal(unit)
	{
		this.controller.setMainTarget(
			unit,
			null,
			null,
			null,
			null
		);
	}

	setUnitTarget(unit, target, order, aggression)
	{
		this.controller.setMainTarget(
			unit,
			target,
			[target.mapX, target.mapY],
			order,
			aggression
		);

		return [target.mapX, target.mapY];
	}

	setPositionTarget(unit, mapX, mapY, order, aggression)
	{
		this.controller.setMainTarget(
			unit,
			null,
			[mapX, mapY],
			order,
			aggression
		);

		return [mapX, mapY];
	}

	isPositionReached(unit, position, tolerance=0)
	{
		if(position == null) return true;

		return this.getGridDistance(
			unit.mapX,
			unit.mapY,
			position[0],
			position[1]
		) <= tolerance;
	}

	isCellSuitableForPatrol(unit, mapX, mapY, distanceMap)
	{
		if(mapX < 0 || mapX >= map.width) return false;
		if(mapY < 0 || mapY >= map.height) return false;

		if(distanceMap == null ||
			distanceMap[mapY] == null ||
			distanceMap[mapY][mapX] < 0)
		{
			return false;
		}

		const otherUnit = getUnitAtMap(mapX, mapY);

		if(otherUnit != null && otherUnit !== unit)
		{
			return false;
		}

		const cellEntities = Entity.getEntitiesAtMap(mapX, mapY);

		if(cellEntities != null)
		{
			for(let i = 0; i < cellEntities.length; i++)
			{
				const entity = cellEntities[i];

				if(typeof entity.canStepOn === 'function' &&
					entity.canStepOn(unit) !== true)
				{
					return false;
				}
			}
		}

		return true;
	}

	getPatrolCells(unit, centerX, centerY, radius)
	{
		const distanceMap = this.controller.getDistanceMap(
			unit,
			unit.mapX,
			unit.mapY
		);

		let cells = [];

		const minX = Math.max(0, centerX - radius);
		const maxX = Math.min(map.width - 1, centerX + radius);
		const minY = Math.max(0, centerY - radius);
		const maxY = Math.min(map.height - 1, centerY + radius);

		for(let y = minY; y <= maxY; y++)
		{
			for(let x = minX; x <= maxX; x++)
			{
				if(this.getGridDistance(centerX, centerY, x, y) > radius)
				{
					continue;
				}

				if(!this.isCellSuitableForPatrol(unit, x, y, distanceMap))
				{
					continue;
				}

				cells.push([x, y]);
			}
		}

		// По возможности не выбираем текущую клетку.
		if(cells.length > 1)
		{
			cells = cells.filter(cell =>
			{
				return cell[0] !== unit.mapX || cell[1] !== unit.mapY;
			});
		}

		return cells;
	}

	chooseRandomPatrolPoint(unit, centerX, centerY, radius)
	{
		const cells = this.getPatrolCells(
			unit,
			centerX,
			centerY,
			radius
		);

		if(cells.length <= 0)
		{
			return [centerX, centerY];
		}

		return cells[randomInt(0, cells.length - 1)];
	}

	getMainGoal(unit)
	{
		return [unit.mapX, unit.mapY];
	}
}


//---------------------------- Idle behavior ----------------------------
class IdleIndependentBehavior extends IndependentBehavior
{
	ensureConfig(unit)
	{
		const config = super.ensureConfig(unit);

		if(config.patrolRadius == null) config.patrolRadius = 4;
		if(config.aggression == null) config.aggression = 2;
		if(config.returnAggression == null) config.returnAggression = 1;

		return config;
	}

	getMainGoal(unit)
	{
		const config = this.ensureConfig(unit);
		const unitAI = this.getUnitAI(unit);

		unitAI.mainTarget = null;

		const distanceFromHome = this.getDistanceFromHome(unit);

		/*
		 * Это только цель возвращения, а не жёсткое ограничение.
		 * Боевые матрицы всё ещё могут временно увести юнита в сторону.
		 */
		if(distanceFromHome > config.patrolRadius)
		{
			return this.setPositionTarget(
				unit,
				config.homeX,
				config.homeY,
				'idle_return',
				config.returnAggression
			);
		}

		if(unitAI.order === 'idle_return')
		{
			if(distanceFromHome > 1)
			{
				return this.setPositionTarget(
					unit,
					config.homeX,
					config.homeY,
					'idle_return',
					config.returnAggression
				);
			}

			this.clearGoal(unit);
		}

		if(unitAI.order === 'idle_patrol' &&
			unitAI.mainTargetPos != null &&
			!this.isPositionReached(unit, unitAI.mainTargetPos))
		{
			return [
				unitAI.mainTargetPos[0],
				unitAI.mainTargetPos[1]
			];
		}

		const patrolPoint = this.chooseRandomPatrolPoint(
			unit,
			config.homeX,
			config.homeY,
			config.patrolRadius
		);

		return this.setPositionTarget(
			unit,
			patrolPoint[0],
			patrolPoint[1],
			'idle_patrol',
			config.aggression
		);
	}
}


//---------------------------- Guard behavior ----------------------------
class GuardIndependentBehavior extends IndependentBehavior
{
	ensureConfig(unit)
	{
		const config = super.ensureConfig(unit);

		if(config.aggroRadius == null) config.aggroRadius = 5;
		if(config.leashRadius == null) config.leashRadius = config.aggroRadius + 3;
		if(config.patrolRadius == null) config.patrolRadius = 3;

		if(config.aggression == null) config.aggression = 4;
		if(config.patrolAggression == null) config.patrolAggression = 2;
		if(config.returnAggression == null) config.returnAggression = 1;

		return config;
	}

	isEnemy(unit, target)
	{
		if(target == null) return false;
		if(target.died) return false;
		if(target.player == null) return false;

		return target.player !== unit.player;
	}

	isCurrentTargetValid(unit, target, config)
	{
		if(!this.isEnemy(unit, target)) return false;

		/*
		 * Уже замеченного врага преследуем, пока он остаётся
		 * во внешнем leash-радиусе относительно охраняемой точки.
		 */
		return this.getGridDistance(
			config.homeX,
			config.homeY,
			target.mapX,
			target.mapY
		) <= config.leashRadius;
	}

	findTarget(unit, config)
	{
		let bestTarget = null;
		let bestDistance = Infinity;
		let bestHealth = Infinity;

		for(let i = 0; i < units.length; i++)
		{
			const target = units[i];

			if(!this.isEnemy(unit, target)) continue;

			const distanceFromHome = this.getGridDistance(
				config.homeX,
				config.homeY,
				target.mapX,
				target.mapY
			);

			/*
			 * Новый враг замечается только внутри внутреннего
			 * aggro-радиуса.
			 */
			if(distanceFromHome > config.aggroRadius) continue;

			const distanceFromGuard = this.getGridDistance(
				unit.mapX,
				unit.mapY,
				target.mapX,
				target.mapY
			);

			const targetHealth = target.features != null
				? target.features.health
				: Infinity;

			if(distanceFromGuard < bestDistance ||
				(distanceFromGuard === bestDistance &&
					targetHealth < bestHealth))
			{
				bestTarget = target;
				bestDistance = distanceFromGuard;
				bestHealth = targetHealth;
			}
		}

		return bestTarget;
	}

	setAttackGoal(unit, target, config)
	{
		return this.setUnitTarget(
			unit,
			target,
			'guard_attack',
			config.aggression
		);
	}

	setReturnGoal(unit, config)
	{
		return this.setPositionTarget(
			unit,
			config.homeX,
			config.homeY,
			'guard_return',
			config.returnAggression
		);
	}

	setPatrolGoal(unit, config)
	{
		const patrolPoint = this.chooseRandomPatrolPoint(
			unit,
			config.homeX,
			config.homeY,
			config.patrolRadius
		);

		return this.setPositionTarget(
			unit,
			patrolPoint[0],
			patrolPoint[1],
			'guard_patrol',
			config.patrolAggression
		);
	}

	getMainGoal(unit)
	{
		const config = this.ensureConfig(unit);
		const unitAI = this.getUnitAI(unit);

		const previousTarget = unitAI.mainTarget;
		const wasAttacking =
			unitAI.order === 'guard_attack' ||
			previousTarget != null;

		if(this.isCurrentTargetValid(unit, previousTarget, config))
		{
			return this.setAttackGoal(
				unit,
				previousTarget,
				config
			);
		}

		/*
		 * Текущая цель погибла или вышла за leashRadius.
		 */
		if(previousTarget != null)
		{
			this.clearGoal(unit);
		}

		/*
		 * Прежде чем возвращаться, проверяем, нет ли другого
		 * противника внутри aggroRadius.
		 */
		const newTarget = this.findTarget(unit, config);

		if(newTarget != null)
		{
			return this.setAttackGoal(
				unit,
				newTarget,
				config
			);
		}

		const distanceFromHome = this.getDistanceFromHome(unit);

		/*
		 * После прекращения преследования сначала возвращаемся
		 * к охраняемой точке.
		 */
		if(wasAttacking)
		{
			return this.setReturnGoal(unit, config);
		}

		/*
		 * Если локальные боевые оценки увели охранника за пределы
		 * patrolRadius, задаём целью возвращение. Это не запрещает
		 * ему атаковать врага по дороге.
		 */
		if(distanceFromHome > config.patrolRadius)
		{
			return this.setReturnGoal(unit, config);
		}

		if(unitAI.order === 'guard_return')
		{
			if(distanceFromHome > 1)
			{
				return this.setReturnGoal(unit, config);
			}

			this.clearGoal(unit);
		}

		/*
		 * Продолжаем идти к уже выбранной случайной patrol-точке.
		 */
		if(unitAI.order === 'guard_patrol' &&
			unitAI.mainTargetPos != null &&
			!this.isPositionReached(unit, unitAI.mainTargetPos))
		{
			return [
				unitAI.mainTargetPos[0],
				unitAI.mainTargetPos[1]
			];
		}

		/*
		 * Точка достигнута или ещё не была выбрана:
		 * выбираем новую случайную цель рядом с home.
		 */
		return this.setPatrolGoal(unit, config);
	}
}


//---------------------------- Roam behavior ----------------------------
class RoamIndependentBehavior extends IndependentBehavior
{
	ensureConfig(unit)
	{
		const config = super.ensureConfig(unit);

		if(config.minGoalDistance == null) config.minGoalDistance = 12;
		if(config.maxGoalDistance == null) config.maxGoalDistance = 36;
		if(config.goalTolerance == null) config.goalTolerance = 1;
		if(config.stuckTurnLimit == null) config.stuckTurnLimit = 3;

		if(config.aggroRadius == null) config.aggroRadius = 5;
		if(config.pursuitRadius == null) config.pursuitRadius = 10;
		if(config.pursuitCooldownTurns == null)
		{
			config.pursuitCooldownTurns = 2;
		}

		/*
		 * targetAggression определяет, кого существо считает
		 * достаточно слабым для намеренного преследования:
		 *
		 * 0 — только значительно более слабые;
		 * 1 — любые противники.
		 */
		if(config.targetAggression == null)
		{
			config.targetAggression = 0.5;
		}

		/*
		 * Тактические множители существующих матриц AIControl.
		 *
		 * Они должны оставаться положительными, чтобы даже осторожный
		 * юнит мог выбрать сопротивление, когда безопасного пути нет.
		 */
		if(config.travelAggression == null)
		{
			config.travelAggression = 0.5;
		}

		if(config.combatAggression == null)
		{
			config.combatAggression = 4;
		}

		config.minGoalDistance = Math.max(
			1,
			config.minGoalDistance
		);

		config.maxGoalDistance = Math.max(
			config.minGoalDistance,
			config.maxGoalDistance
		);

		config.goalTolerance = Math.max(
			0,
			config.goalTolerance
		);

		config.stuckTurnLimit = Math.max(
			1,
			config.stuckTurnLimit
		);

		config.aggroRadius = Math.max(
			1,
			config.aggroRadius
		);

		config.pursuitRadius = Math.max(
			config.aggroRadius,
			config.pursuitRadius
		);

		config.pursuitCooldownTurns = Math.max(
			0,
			config.pursuitCooldownTurns
		);

		config.targetAggression = Math.max(
			0,
			Math.min(1, config.targetAggression)
		);

		/*
		 * Не позволяем тактической агрессии стать равной нулю.
		 * Ноль полностью убрал бы выгоду атаки на опасных клетках.
		 */
		config.travelAggression = Math.max(
			0.25,
			config.travelAggression
		);

		config.combatAggression = Math.max(
			0.25,
			config.combatAggression
		);

		return config;
	}

	onTurnStart(unit)
	{
		const config = this.ensureConfig(unit);
		const unitAI = this.getUnitAI(unit);

		if(unitAI.roamPursuitCooldown > 0)
		{
			unitAI.roamPursuitCooldown--;
		}

		/*
		 * Проверка застревания выполняется один раз в начале хода,
		 * а не при каждом вызове getMainGoal().
		 */
		if(unitAI.order !== 'roam_travel' ||
			unitAI.roamGoal == null)
		{
			unitAI.roamLastGoalKey = null;
			unitAI.roamLastDistance = null;
			unitAI.roamStuckTurns = 0;
			return;
		}

		const distanceMap = this.getTravelDistanceMap(unit);

		const distance = this.getMapDistance(
			distanceMap,
			unitAI.roamGoal
		);

		const goalKey =
			unitAI.roamGoal[0] + ':' +
			unitAI.roamGoal[1];

		if(distance < 0)
		{
			this.clearRoamGoal(unit);
			return;
		}

		if(unitAI.roamLastGoalKey === goalKey &&
			unitAI.roamLastDistance != null &&
			distance >= unitAI.roamLastDistance)
		{
			unitAI.roamStuckTurns =
				(unitAI.roamStuckTurns || 0) + 1;
		}
		else
		{
			unitAI.roamStuckTurns = 0;
		}

		unitAI.roamLastGoalKey = goalKey;
		unitAI.roamLastDistance = distance;

		if(unitAI.roamStuckTurns >= config.stuckTurnLimit)
		{
			this.clearRoamGoal(unit);
		}
	}

	isEnemy(unit, target)
	{
		if(target == null) return false;
		if(target.died) return false;
		if(target.player == null) return false;

		return target.player !== unit.player;
	}

	getTravelDistanceMap(unit)
	{
		/*
		 * Обычная карта пути используется для выбора дальней
		 * достижимой точки. Она учитывает существующие стоимости
		 * прохождения через units и entities.
		 */
		return this.controller.getDistanceMap(
			unit,
			unit.mapX,
			unit.mapY
		);
	}

	getAwarenessDistanceMap(
		unit,
		startX=unit.mapX,
		startY=unit.mapY
	)
	{
		/*
		 * При оценке расстояния до врага юниты не увеличивают
		 * стоимость пути. Нас интересует расстояние по лабиринту,
		 * а не стоимость прорыва сквозь находящегося там юнита.
		 */
		return this.controller.getDistanceMap(
			unit,
			startX,
			startY,
			null,
			function()
			{
				return true;
			}
		);
	}

	getMapDistance(distanceMap, position)
	{
		if(distanceMap == null || position == null)
		{
			return -1;
		}

		const x = position[0];
		const y = position[1];

		if(x < 0 || x >= map.width) return -1;
		if(y < 0 || y >= map.height) return -1;
		if(distanceMap[y] == null) return -1;

		return distanceMap[y][x];
	}

	evaluatePower(unit)
	{
		if(unit == null || unit.features == null)
		{
			return 0;
		}

		const health = Math.max(
			1,
			unit.features.health || 1
		);

		const strength = Math.max(
			0,
			unit.features.strength || 0
		);

		const defense = Math.max(
			0,
			unit.features.defense || 0
		);

		/*
		 * Пока это намеренно простая эвристика.
		 *
		 * Текущее здоровье учитывается, поэтому раненое существо
		 * естественным образом становится осторожнее.
		 */
		return health * (
			1 +
			strength +
			0.75 * defense
		);
	}

	shouldChaseTarget(unit, target, config)
	{
		if(!this.isEnemy(unit, target))
		{
			return false;
		}

		/*
		 * Максимально агрессивное существо нападает на всех,
		 * независимо от оценки силы.
		 */
		if(config.targetAggression >= 1)
		{
			return true;
		}

		const ownPower = this.evaluatePower(unit);
		const targetPower = this.evaluatePower(target);

		/*
		 * targetAggression = 0:
		 * цель должна быть не сильнее 50% силы существа.
		 *
		 * targetAggression = 0.5:
		 * цель может быть примерно на 25% сильнее.
		 *
		 * targetAggression = 1 обрабатывается выше:
		 * разрешены любые цели.
		 */
		const maxTargetPowerRatio =
			0.5 +
			1.5 * config.targetAggression;

		return targetPower <=
			ownPower * maxTargetPowerRatio;
	}

	findTarget(unit, config)
	{
		const unitAI = this.getUnitAI(unit);

		/*
		 * После отказа от долгой погони несколько ходов
		 * не начинаем её заново за тем же существом.
		 */
		if(unitAI.roamPursuitCooldown > 0)
		{
			return null;
		}

		const distanceMap =
			this.getAwarenessDistanceMap(unit);

		let bestTarget = null;
		let bestDistance = Infinity;
		let bestPower = Infinity;

		for(let i = 0; i < units.length; i++)
		{
			const target = units[i];

			if(!this.shouldChaseTarget(
				unit,
				target,
				config
			))
			{
				continue;
			}

			const distance = this.getMapDistance(
				distanceMap,
				[target.mapX, target.mapY]
			);

			if(distance <= 0 ||
				distance > config.aggroRadius)
			{
				continue;
			}

			const targetPower =
				this.evaluatePower(target);

			/*
			 * Сначала выбираем ближайшую подходящую цель.
			 * При одинаковом расстоянии — более слабую.
			 */
			if(distance < bestDistance ||
				(distance === bestDistance &&
					targetPower < bestPower))
			{
				bestTarget = target;
				bestDistance = distance;
				bestPower = targetPower;
			}
		}

		return bestTarget;
	}

	isCurrentTargetValid(unit, target, config)
	{
		/*
		 * Оценка силы производится заново каждый ход.
		 * Раненое существо может отказаться от дальнейшей погони.
		 */
		if(!this.shouldChaseTarget(
			unit,
			target,
			config
		))
		{
			return false;
		}

		const unitAI = this.getUnitAI(unit);

		if(unitAI.roamPursuitOrigin == null)
		{
			unitAI.roamPursuitOrigin = [
				unit.mapX,
				unit.mapY
			];
		}

		/*
		 * pursuitRadius отсчитывается от точки, где началась погоня,
		 * а не от постоянно перемещающегося преследователя.
		 *
		 * Иначе существо могло бы преследовать врага через всё
		 * подземелье, постоянно оставаясь рядом с ним.
		 */
		const distanceMap =
			this.getAwarenessDistanceMap(
				unit,
				unitAI.roamPursuitOrigin[0],
				unitAI.roamPursuitOrigin[1]
			);

		const distance = this.getMapDistance(
			distanceMap,
			[target.mapX, target.mapY]
		);

		return distance >= 0 &&
			distance <= config.pursuitRadius;
	}

	isRoamGoalValid(unit, goal, distanceMap=null)
	{
		if(goal == null) return false;

		if(distanceMap == null)
		{
			distanceMap =
				this.getTravelDistanceMap(unit);
		}

		return this.getMapDistance(
			distanceMap,
			goal
		) >= 0;
	}

	getReachableGoalCells(unit, distanceMap)
	{
		const cells = [];

		for(let y = 0; y < map.height; y++)
		{
			for(let x = 0; x < map.width; x++)
			{
				const distance =
					distanceMap[y][x];

				if(distance <= 0) continue;

				if(!this.isCellSuitableForPatrol(
					unit,
					x,
					y,
					distanceMap
				))
				{
					continue;
				}

				cells.push({
					cell: [x, y],
					distance: distance
				});
			}
		}

		return cells;
	}

	chooseRoamGoal(unit, config)
	{
		const distanceMap =
			this.getTravelDistanceMap(unit);

		const reachableCells =
			this.getReachableGoalCells(
				unit,
				distanceMap
			);

		if(reachableCells.length <= 0)
		{
			return [unit.mapX, unit.mapY];
		}

		/*
		 * Основной вариант: случайная достижимая клетка,
		 * находящаяся в заданном диапазоне расстояний.
		 */
		let candidates = reachableCells.filter(item =>
		{
			return item.distance >=
					config.minGoalDistance &&
				item.distance <=
					config.maxGoalDistance;
		});

		/*
		 * Для небольшого изолированного участка ослабляем
		 * минимальное расстояние.
		 */
		if(candidates.length <= 0)
		{
			const relaxedMinDistance = Math.max(
				2,
				Math.floor(
					config.minGoalDistance / 2
				)
			);

			candidates = reachableCells.filter(item =>
			{
				return item.distance >=
						relaxedMinDistance &&
					item.distance <=
						config.maxGoalDistance;
			});
		}

		/*
		 * Если даже таких клеток нет, выбираем случайную
		 * клетку из наиболее удалённой четверти области.
		 */
		if(candidates.length <= 0)
		{
			let maxDistance = 0;

			for(let i = 0;
				i < reachableCells.length;
				i++)
			{
				maxDistance = Math.max(
					maxDistance,
					reachableCells[i].distance
				);
			}

			const farDistance = Math.max(
				1,
				Math.floor(maxDistance * 0.75)
			);

			candidates = reachableCells.filter(item =>
			{
				return item.distance >= farDistance;
			});
		}

		const selected = candidates[
			randomInt(0, candidates.length - 1)
		];

		return [
			selected.cell[0],
			selected.cell[1]
		];
	}

	clearRoamGoal(unit)
	{
		const unitAI = this.getUnitAI(unit);

		unitAI.roamGoal = null;
		unitAI.roamLastGoalKey = null;
		unitAI.roamLastDistance = null;
		unitAI.roamStuckTurns = 0;
		unitAI.roamPursuitOrigin = null;

		this.clearGoal(unit);
	}

	setRoamGoal(unit, goal, config)
	{
		const unitAI = this.getUnitAI(unit);

		unitAI.roamGoal = [
			goal[0],
			goal[1]
		];

		unitAI.roamPursuitOrigin = null;

		return this.setPositionTarget(
			unit,
			goal[0],
			goal[1],
			'roam_travel',
			config.travelAggression
		);
	}

	setAttackGoal(unit, target, config)
	{
		const unitAI = this.getUnitAI(unit);

		/*
		 * roamGoal не очищается: после боя юнит
		 * сможет продолжить первоначальный маршрут.
		 */
		if(unitAI.roamPursuitOrigin == null)
		{
			unitAI.roamPursuitOrigin = [
				unit.mapX,
				unit.mapY
			];
		}

		return this.setUnitTarget(
			unit,
			target,
			'roam_attack',
			config.combatAggression
		);
	}

	stopPursuit(unit, config)
	{
		const unitAI = this.getUnitAI(unit);

		unitAI.roamPursuitOrigin = null;

		unitAI.roamPursuitCooldown =
			config.pursuitCooldownTurns;

		this.clearGoal(unit);
	}

	continueRoaming(unit, config)
	{
		const unitAI = this.getUnitAI(unit);
		let goal = unitAI.roamGoal;

		const distanceMap =
			this.getTravelDistanceMap(unit);

		if(goal != null &&
			this.isPositionReached(
				unit,
				goal,
				config.goalTolerance
			))
		{
			goal = null;
		}

		if(goal != null &&
			!this.isRoamGoalValid(
				unit,
				goal,
				distanceMap
			))
		{
			goal = null;
		}

		if(goal == null)
		{
			goal = this.chooseRoamGoal(
				unit,
				config
			);
		}

		return this.setRoamGoal(
			unit,
			goal,
			config
		);
	}

	getMainGoal(unit)
	{
		const config = this.ensureConfig(unit);
		const unitAI = this.getUnitAI(unit);
		const previousTarget = unitAI.mainTarget;

		/*
		 * Продолжаем текущую погоню.
		 */
		if(this.isCurrentTargetValid(
			unit,
			previousTarget,
			config
		))
		{
			return this.setAttackGoal(
				unit,
				previousTarget,
				config
			);
		}

		/*
		 * Цель погибла, стала слишком сильной или вышла
		 * за pursuitRadius. Возвращаемся к старому маршруту.
		 *
		 * В этот же момент новую погоню не начинаем.
		 */
		if(previousTarget != null ||
			unitAI.order === 'roam_attack')
		{
			this.stopPursuit(unit, config);

			return this.continueRoaming(
				unit,
				config
			);
		}

		const newTarget = this.findTarget(
			unit,
			config
		);

		if(newTarget != null)
		{
			return this.setAttackGoal(
				unit,
				newTarget,
				config
			);
		}

		return this.continueRoaming(
			unit,
			config
		);
	}
}