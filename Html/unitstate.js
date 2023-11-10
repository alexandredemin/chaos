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

    onRecover()
    {
    }

    onStep()
    {
    }
}

class InfectedState extends UnitState
{
    time = 0;

    constructor(unit)
    {
        super(unit);
        this.name = 'infected';
        unit.setTint(0x00ff00);
    }

    static canInfect(unit)
    {
        let type=unit.config.name;
        if(type==='rat' || type==='muddy') return false;
        if((unit.hasState('infected') === false) && (unit.immunized == null || unit.immunized === false)) return true;
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
        targets.forEach( unit => {if(InfectedState.canInfect(unit))unit.addState(new InfectedState(unit))});
    }

    onRecover()
    {
        this.processed = true;
        if(this.time>0)
        {
            this.time++;
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
                if(this.time>4)
                {
                    this.stop();
                }
                this.unit.processStates();
            }
        }
        else
        {
            this.time++;
            this.unit.processStates();
        }
    }

    onStep()
    {
        this.infect();
    }

    stop()
    {
        this.unit.clearTint();
        this.unit.removeState(this);
        this.unit.immunized = true;
    }

}