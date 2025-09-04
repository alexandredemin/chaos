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
                    lm.playAt(this.unit.x,this.unit.y,this.unit,this,config);
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
            let state = new GiganticState(unit);
            if(stateData != null)state.data = clone(stateData);
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
        this.data.init_originY = this.unit.originY;
        this.data.init_scale = this.unit.scale;
        let init_y = this.unit.y;
        const bounds = this.unit.getBounds();
        const bottomCenterY = bounds.bottom;
        this.unit.setOrigin(this.unit.originX, 1);
        this.unit.y = bottomCenterY;
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
        let str = (this.unit.config.features.strength + this.unit.config.features.defense) * this.unit.config.features.health * 0.5;
        let max_factor = 3;
        let min_factor = 1;
        let max_str = 20;
        this.data.factor = max_factor - (str - min_factor) * (max_factor - min_factor)/(max_str - 1);
        if(this.data.factor < min_factor) this.data.factor = min_factor;
        this.unit.features.strength = Math.floor(this.unit.features.strength * this.data.factor + 0.5);
        this.unit.features.defense = Math.floor(this.unit.features.defense * this.data.factor + 0.5);
        this.unit.features.health = Math.floor(this.unit.features.health * this.data.factor + 0.5);
        this.data.timeleft = GiganticState.duration;
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
        this.unit.y = bottomCenterY;
        this.tween = this.unit.scene.tweens.add({
            targets: this.unit,
            scale: {start: this.unit.scale, to: this.data.init_scale},
            ease: 'Linear',
            duration: 400,
            yoyo: false,
            repeat: 0,
            paused: true,
            onComplete: function(){ this.targets[0].setOrigin(this.targets[0].originX, this.data.init_originY); this.targets[0].setPosition(this.targets[0].x, init_y); },
        });
        this.tween.play();
        this.unit.features.strength = this.unit.config.features.strength;
        this.unit.features.defense = this.unit.config.features.defense;
        this.unit.features.health = Math.floor(this.unit.features.health / this.data.factor + 0.5);
        if(this.unit.features.health <= 0) this.unit.features.health = 1;
        this.unit.removeState(this);
    }

}