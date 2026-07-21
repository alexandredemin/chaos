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