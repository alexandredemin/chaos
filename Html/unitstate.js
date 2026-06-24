//---------------------------- helper functions ----------------------------
const exclusiveBuffStateNames = ['gigantic', 'strength', 'defense', 'speed'];

function clearExclusiveBuffStates(unit, exceptName = null)
{
	const statesCopy = unit.states.slice();

	for(let i = 0; i < statesCopy.length; i++)
	{
		const st = statesCopy[i];
		if(exclusiveBuffStateNames.indexOf(st.name) >= 0 && st.name !== exceptName)
		{
			st.stop();
		}
	}
}

function createStateAura(state, color)
{
	const unit = state.unit;
	const frameName = unit.frame ? unit.frame.name : 0;

	state.aura = unit.scene.add.image(unit.x, unit.y, unit.texture.key, frameName);
	state.aura.setOrigin(unit.originX, unit.originY);
	state.aura.setScale(unit.scaleX * 1.28, unit.scaleY * 1.28);
	state.aura.setRotation(unit.rotation);
	state.aura.setFlip(unit.flipX, unit.flipY);
	state.aura.setDepth(unit.depth - 0.05);
	state.aura.setAlpha(0.42);
	state.aura.setTintFill(color);
	state.aura.setBlendMode(Phaser.BlendModes.ADD);
	state.aura.visible = unit.visible;

	state.auraTween = unit.scene.tweens.add({
		targets: state.aura,
		alpha: { from: 0.34, to: 0.62 },
		scaleX: unit.scaleX * 1.34,
		scaleY: unit.scaleY * 1.34,
		duration: 520,
		yoyo: true,
		repeat: -1,
		ease: 'Sine.InOut'
	});
}

function updateStateAura(state)
{
	if(state.aura == null) return;

	const unit = state.unit;
	const frameName = unit.frame ? unit.frame.name : 0;

	state.aura.setTexture(unit.texture.key, frameName);
	state.aura.setOrigin(unit.originX, unit.originY);
	state.aura.setPosition(unit.x, unit.y);
	state.aura.setRotation(unit.rotation);
	state.aura.setFlip(unit.flipX, unit.flipY);
	state.aura.setDepth(unit.depth - 0.05);
	state.aura.visible = unit.visible;
}

function destroyStateAura(state)
{
	if(state.auraTween != null)
	{
		state.auraTween.stop();
		state.auraTween = null;
	}

	if(state.aura != null)
	{
		state.aura.destroy();
		state.aura = null;
	}
}

//---------------------------- temporalStates classes ----------------------------
class UnitState
{
    name = '';
    unit = null;
    processed = false;

    constructor(unit)
    {
        this.unit = unit;
    }
  
    serialize() {
        return {
            name: this.name,
            data: clone(this.data)
        };
    }
  
    static deserialize(storedData, unit) {
        unitStates[storedData.name].applyFunction(unit, storedData.data);
    }
  
    start()
    {
    }

    onRecover()
    {
    }

    onStep()
    {
    }

    updateVisual()
	{
	}
}

class InfectedState extends UnitState
{
    data = {
        time: 0,
    }

    constructor(unit)
    {
        super(unit);
        this.name = 'infected';
    }
  
    static apply(unit, stateData=null)
    {
        if(unit.hasState('infected') === false){
            let state = new InfectedState(unit);
            if(stateData != null)state.data = clone(stateData);
            unit.addState(state);
            state.start(); 
        }
    }

    static canInfect(unit)
    {
        if(unit.features.infectionImmunity === true) return false;
        if((unit.hasState('infected') === false) && (unit.features.immunized == null || unit.features.immunized === false)) return true;
        return false;
    }

    onCallback()
    {
        cam.stopFollow();
        if(this.unit.features.health <= 0)this.stop();
        this.unit.processStates();
    }

    infect()
    {
        let targets = selectUnits(this.unit.mapX, this.unit.mapY, null, [this.unit], 0);
        targets.forEach( unit => {if(InfectedState.canInfect(unit)) InfectedState.apply(unit)});
    }

    onRecover()
    {
        this.processed = true;
        if(this.data.time>0)
        {
            this.data.time++;
            this.infect();
            if(Math.random() > 0.5)
            {
                let killed = false;
                this.unit.features.health--;
                if(this.unit.features.health <= 0) killed = true;
                if(gameSettings.showEnemyMoves == true || this.unit.player.control === PlayerControl.human)
                {
                    let config = {hit: false, damaged: true, killed: false};
                    if(killed) config.killed = true;
                    cam.startFollow(this.unit);
                    let lm = new LossesAnimationManager(this.unit.scene, 200, 200);
                    lm.playAt(this.unit.x,this.unit.y,this.unit,this,null,config);
                }
                else
                {
                    if(killed) this.unit.die();
                    this.onCallback();
                }
            }
            else
            {
                if(this.data.time>4)
                {
                    this.stop();
                }
                this.unit.processStates();
            }
        }
        else
        {
            this.data.time++;
            this.unit.processStates();
        }
    }

    onStep()
    {
        this.infect();
    }
  
    start()
    {
        this.unit.setTint(0x00ff00);
    }

    stop()
    {
        this.unit.clearTint();
        this.unit.removeState(this);
        this.unit.features.immunized = true;
    }

}

class GiganticState extends UnitState
{
    tween = null;
    
    data = {
        init_originY: 0,
        init_scale: 0,
        factor: 1.0,
        timeleft: 0
    }
    
    static duration = 4;

    constructor(unit)
    {
        super(unit);
        this.name = 'gigantic';
    }
  
    static apply(unit, stateData=null)
    {
        if(unit.hasState('gigantic') === false){
            clearExclusiveBuffStates(unit, 'gigantic');
            let state = new GiganticState(unit);
            if(stateData == null){
                state.data.init_originY = unit.originY;
                state.data.init_scale = unit.scale;
                let str = (unit.config.features.strength + unit.config.features.defense) * unit.config.features.health * 0.5;
                let max_factor = 3;
                let min_factor = 1;
                let max_str = 20;
                state.data.factor = max_factor - (str - min_factor) * (max_factor - min_factor)/(max_str - 1);
                if(state.data.factor < min_factor) state.data.factor = min_factor;
                unit.features.strength = Math.floor(unit.features.strength * state.data.factor + 0.5);
                unit.features.defense = Math.floor(unit.features.defense * state.data.factor + 0.5);
                unit.features.health = Math.floor(unit.features.health * state.data.factor + 0.5);
                state.data.timeleft = GiganticState.duration;
            }
            else{
                state.data = clone(stateData);          
            }
            unit.addState(state);
            state.start();
        }
        else{
            for(let i=0; i<unit.states.length; i++){
                if(unit.states[i].name === 'gigantic'){
                    unit.states[i].data.timeleft += GiganticState.duration;
                    break;
                }
            }
        }
    }
  
    start()
    {
        let init_y = this.unit.y;
        const bounds = this.unit.getBounds();
        const bottomCenterY = bounds.bottom;
        this.unit.setOrigin(this.unit.originX, 1);
        this.unit.y = bottomCenterY - 1;
        this.tween = this.unit.scene.tweens.add({
            targets: this.unit,
            scale: {start: this.unit.scale, to: this.unit.config.scale * 1.5},
            ease: 'Linear',
            duration: 400,
            yoyo: false,
            repeat: 0,
            paused: true,
            onComplete: function(){ this.targets[0].setOrigin(0.5, 1 - (0.5 * 16 / (this.targets[0].height*this.targets[0].scale))); this.targets[0].setPosition(this.targets[0].x, init_y);},
        });
        this.tween.play();
    }

    onCallback()
    {
        cam.stopFollow();
        this.unit.processStates();
    }

    onRecover()
    {
        this.processed = true;
        this.data.timeleft--;
        if(this.data.timeleft<=0) this.stop();
        this.unit.processStates();
    }

    onStep()
    {
    }

    stop()
    {
        let init_y = this.unit.y;
        const bounds = this.unit.getBounds();
        const bottomCenterY = bounds.bottom;
        this.unit.setOrigin(this.unit.originX, 1);
        this.unit.y = bottomCenterY - 1;
        const init_originY = this.data.init_originY;
        this.tween = this.unit.scene.tweens.add({
            targets: this.unit,
            scale: {start: this.unit.scale, to: this.data.init_scale},
            ease: 'Linear',
            duration: 400,
            yoyo: false,
            repeat: 0,
            paused: true,
            onComplete: function(){ this.targets[0].setOrigin(this.targets[0].originX, init_originY); this.targets[0].setPosition(this.targets[0].x, init_y); },
        });
        this.tween.play();
        this.unit.features.strength = this.unit.config.features.strength;
        this.unit.features.defense = this.unit.config.features.defense;
        this.unit.features.health = Math.floor(this.unit.features.health / this.data.factor + 0.5);
        if(this.unit.features.health <= 0) this.unit.features.health = 1;
        this.unit.removeState(this);
    }

}

class StrengthState extends UnitState
{
	aura = null;
	auraTween = null;

	data = {
		init_strength: 0,
		bonus: 0,
		timeleft: 0
	}

	static duration = 4;

	constructor(unit)
	{
		super(unit);
		this.name = 'strength';
	}

	static apply(unit, stateData=null)
	{
		if(unit.hasState('strength'))
		{
			for(let i = 0; i < unit.states.length; i++)
			{
				if(unit.states[i].name === 'strength')
				{
					if(stateData != null) unit.states[i].data = clone(stateData);
					else unit.states[i].data.timeleft = StrengthState.duration;
					return;
				}
			}
		}
		clearExclusiveBuffStates(unit, 'strength');
		let state = new StrengthState(unit);
		if(stateData == null)
		{
			state.data.init_strength = unit.features.strength;
			const baseStrength = unit.config.features.strength || 1;
			state.data.bonus = Math.max(1, Math.round(4 / Math.max(1, baseStrength)));
			state.data.timeleft = StrengthState.duration;
			unit.features.strength += state.data.bonus;
		}
		else
		{
			state.data = clone(stateData);
		}
		unit.addState(state);
		state.start();
	}

	start()
	{
		createStateAura(this, 0xc84b3a);
	}

	updateVisual()
	{
		updateStateAura(this);
	}

	onRecover()
	{
		this.processed = true;
		this.data.timeleft--;
		if(this.data.timeleft <= 0) this.stop();
		this.unit.processStates();
	}

	stop()
	{
		destroyStateAura(this);
		this.unit.features.strength = this.data.init_strength;
		this.unit.removeState(this);
	}
}

class DefenseState extends UnitState
{
	aura = null;
	auraTween = null;

	data = {
		init_defense: 0,
		bonus: 0,
		timeleft: 0
	}

	static duration = 4;

	constructor(unit)
	{
		super(unit);
		this.name = 'defense';
	}

	static apply(unit, stateData=null)
	{
		if(unit.hasState('defense'))
		{
			for(let i = 0; i < unit.states.length; i++)
			{
				if(unit.states[i].name === 'defense')
				{
					if(stateData != null) unit.states[i].data = clone(stateData);
					else unit.states[i].data.timeleft = DefenseState.duration;
					return;
				}
			}
		}
		clearExclusiveBuffStates(unit, 'defense');
		let state = new DefenseState(unit);
		if(stateData == null)
		{
			state.data.init_defense = unit.features.defense;
			const baseDefense = unit.config.features.defense || 1;
			state.data.bonus = Math.max(1, Math.round(4 / Math.max(1, baseDefense)));
			state.data.timeleft = DefenseState.duration;
			unit.features.defense += state.data.bonus;
		}
		else
		{
			state.data = clone(stateData);
		}
		unit.addState(state);
		state.start();
	}

	start()
	{
		createStateAura(this, 0x274c9b);
	}

	updateVisual()
	{
		updateStateAura(this);
	}

	onRecover()
	{
		this.processed = true;
		this.data.timeleft--;
		if(this.data.timeleft <= 0) this.stop();
		this.unit.processStates();
	}

	stop()
	{
		destroyStateAura(this);
		this.unit.features.defense = this.data.init_defense;
		this.unit.removeState(this);
	}
}

class SpeedState extends UnitState
{
	aura = null;
	auraTween = null;

	data = {
		init_attackCost: 0,
		multiplier: 2,
		timeleft: 0
	}

	static duration = 4;

	constructor(unit)
	{
		super(unit);
		this.name = 'speed';
	}

	static apply(unit, stateData=null)
	{
		if(unit.hasState('speed'))
		{
			for(let i = 0; i < unit.states.length; i++)
			{
				if(unit.states[i].name === 'speed')
				{
					if(stateData != null) unit.states[i].data = clone(stateData);
					else unit.states[i].data.timeleft = SpeedState.duration;
					return;
				}
			}
		}
		clearExclusiveBuffStates(unit, 'speed');
		let state = new SpeedState(unit);
		if(stateData == null)
		{
			state.data.init_attackCost = unit.features.attackCost;
			state.data.multiplier = 2;
			state.data.timeleft = SpeedState.duration;
			unit.features.move *= state.data.multiplier;
			unit.features.abilityPoints *= state.data.multiplier;
		}
		else
		{
			state.data = clone(stateData);
		}
		unit.addState(state);
		state.start();
	}

	start()
	{
		createStateAura(this, 0xb58a2a);
	}

	updateVisual()
	{
		updateStateAura(this);
	}

	onRecover()
	{
		this.processed = true;
		this.data.timeleft--;
		if(this.data.timeleft <= 0)
		{
			this.stop(false);
			this.unit.processStates();
			return;
		}
		this.unit.features.move = this.unit.config.features.move * this.data.multiplier;
		this.unit.features.abilityPoints = this.unit.config.features.abilityPoints * this.data.multiplier;
		this.unit.processStates();
	}

	stop(restoreCurrentPoints = true)
	{
		destroyStateAura(this);
		this.unit.features.attackCost = this.data.init_attackCost;
		if(restoreCurrentPoints)
		{
			const baseMove = this.unit.config.features.move;
			const baseAP = this.unit.config.features.abilityPoints;
			const mul = this.data.multiplier || 2;

			this.unit.features.move = Math.round(this.unit.features.move / mul);
			this.unit.features.abilityPoints = Math.round(this.unit.features.abilityPoints / mul);
			if(this.unit.features.move > baseMove) this.unit.features.move = baseMove;
			if(this.unit.features.abilityPoints > baseAP) this.unit.features.abilityPoints = baseAP;
			if(this.unit.features.move < 0) this.unit.features.move = 0;
			if(this.unit.features.abilityPoints < 0) this.unit.features.abilityPoints = 0;
		}

		this.unit.removeState(this);
	}
}

class InvisibleState extends UnitState
{
	data = {
		timeleft: 0
	}

	static duration = 4;

	constructor(unit)
	{
		super(unit);
		this.name = 'invisible';
	}

	static apply(unit, stateData=null)
	{
		if(unit.hasState('invisible'))
		{
			for(let i = 0; i < unit.states.length; i++)
			{
				if(unit.states[i].name === 'invisible')
				{
					if(stateData != null) unit.states[i].data = clone(stateData);
					else unit.states[i].data.timeleft = InvisibleState.duration;

					unit.features.invisible = true;
					unit.setAlpha(getUnitBaseAlpha(unit) * 0.45);
					if(typeof updateCurrentPlayerVisibility === 'function') updateCurrentPlayerVisibility();
					return;
				}
			}
		}

		let state = new InvisibleState(unit);

		if(stateData == null)
		{
			state.data.timeleft = InvisibleState.duration;
		}
		else
		{
			state.data = clone(stateData);
		}

		unit.features.invisible = true;
		unit.setAlpha(getUnitBaseAlpha(unit) * 0.45);

		unit.addState(state);

		if(typeof updateCurrentPlayerVisibility === 'function') updateCurrentPlayerVisibility();
	}

	onRecover()
	{
		this.processed = true;
		this.data.timeleft--;

		if(this.data.timeleft <= 0)
		{
			this.stop();
			this.unit.processStates();
			return;
		}

		this.unit.processStates();
	}

	stop()
	{
		this.unit.features.invisible = false;
		this.unit.setAlpha(getUnitBaseAlpha(this.unit));

		this.unit.removeState(this);

		if(typeof updateCurrentPlayerVisibility === 'function') updateCurrentPlayerVisibility();
	}
}