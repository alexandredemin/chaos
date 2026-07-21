//---------------------------- Independent AI ----------------------------

class IndependentAIControl extends AIControl
{
	constructor(player)
	{
		super(player);

		this.behaviors = {
			idle: new IdleIndependentBehavior(this),
			guard: new GuardIndependentBehavior(this)
		};
	}

	ensureIndependentConfig(unit)
	{
		if(unit.independentAI == null)
		{
			unit.independentAI = {
				type: 'idle',
				homeX: unit.mapX,
				homeY: unit.mapY
			};
		}

		if(unit.independentAI.type == null)
		{
			unit.independentAI.type = 'idle';
		}

		return unit.independentAI;
	}

	getBehavior(unit)
	{
		const config = this.ensureIndependentConfig(unit);
		const unitAI = this.ensureUnitAIControl(unit);

		let behavior = this.behaviors[config.type];

		if(behavior == null)
		{
			console.warn(
				'Unknown independent behavior "' +
				config.type +
				'", using idle behavior.'
			);

			config.type = 'idle';
			behavior = this.behaviors.idle;
		}

		/*
		 * Если тип поведения изменился во время игры,
		 * очищаем стратегическую цель от предыдущего поведения.
		 */
		if(unitAI.independentBehaviorType !== config.type)
		{
			this.setMainTarget(
				unit,
				null,
				null,
				null,
				null
			);

			unitAI.independentBehaviorType = config.type;
		}

		return behavior;
	}

	planning()
	{
		/*
		 * AIControl.startTurn() уже:
		 * 1. собирает availableUnits;
		 * 2. строит enemy attack maps;
		 * 3. вызывает planning();
		 *
		 * Здесь заменяется только стратегическое планирование.
		 */
		for(let i = 0; i < this.player.units.length; i++)
		{
			const unit = this.player.units[i];

			if(unit == null || unit.died) continue;

			const unitAI = this.ensureUnitAIControl(unit);

			/*
			 * Состояние непосредственного выполнения хода
			 * не должно переноситься между ходами.
			 */
			unitAI.target = null;
			unitAI.plan = null;
			unitAI.action = null;

			const behavior = this.getBehavior(unit);
			behavior.onTurnStart(unit);
		}
	}

	getMainGoal(unit)
	{
		const behavior = this.getBehavior(unit);
		const goal = behavior.getMainGoal(unit);

		if(goal == null)
		{
			return [unit.mapX, unit.mapY];
		}

		return goal;
	}
}