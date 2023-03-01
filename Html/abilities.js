//---------------------------- specialAbilities classes ----------------------------

class UnitAbility
{
    constructor()
    {

    }

    start(unit)
    {
    }

    stop(unit)
    {
      unit.endAbility();  
    }

    setTarget(target)
    {
    }

    next()
    {
        return true;
    }
}

class ConjureAbility extends UnitAbility
{
    step = 0;
    unit = null;
    spell = null;

    constructor()
    {
        super();
    }

    onCallback(param)
    {
        if(param != null)
        {
            this.spell = param;
        }
        this.next();
    }

    onSpellCallback(res)
    {
        if(res === true)
        {
            this.unit.features.abilityPoints--;
            this.unit.features.mana = this.unit.features.mana - this.spell.cost;
        }
        if(this.unit.player.control === PlayerControl.computer)
        {
            this.unit.player.aiControl.onCastSpell(this.unit,res);
        }
        this.next();
    }

    start(unit)
    {
        this.step = 0;
        this.unit = unit;
        this.spell = null;
    }
  
    stop(unit)
    {
        this.step = 0;
        this.unit = null;
        this.spell = null;
        super.stop(unit);
    }

    next()
    {
        switch (this.step) {
            case 0:
                pointerBlocked = true;
                if(this.unit.player.control === PlayerControl.human) {
                    if (book == null) {
                        book = new MagicBook(UIScene);
                    }
                    book.show(this, this.unit.features.mana);
                    this.step++;
                }
                else
                {
                    this.spell = this.unit.player.aiControl.selectSpell(this.unit);
                    this.step++;
                    this.next();
                }
                break;
            case 1:
                if(this.spell != null)
                {
                    this.step++;
                    spellTypes[this.spell.type].start(this.unit,this.spell,this);
                    spellTypes[this.spell.type].next();
                    break;
                }
                else
                {
                    this.stop(this.unit);
                    return true;
                }
                break;
            case 2:
                this.stop(this.unit);
                return true;
                break;
        }
        return false;
    }
}

class FireAbility extends UnitAbility
{
    step = 0;
    unit = null;
    target = null;

    constructor()
    {
        super();
    }

    onCallback()
    {
        cam.stopFollow();
        this.next();
    }

    start(unit)
    {
        this.step = 0;
        this.unit = unit;
    }

    stop(unit)
    {
        if(rangeRenderer.visible === true)rangeRenderer.hide();
        deselectUnits();
        setInteractionScenario(userInteractionScenario.movement);
        this.step = 0;
        this.unit = null;
        this.target = null;
        super.stop(unit);
    }

    setTarget(target)
    {
        this.target = target;
    }

    atack()
    {
        this.unit.features.abilityPoints--;
        if(this.target != null)
        {
            let damaged = false;
            let killed = false;
            if(Math.random() <= this.unit.config.abilities.fire.config.damage/(this.unit.config.abilities.fire.config.damage + this.target.getCurrentFeatures().defense))
            {
                damaged = true;
                this.target.features.health--;
                if(this.target.features.health <= 0) killed = true;
            }
            let config = {hit: true, damaged: false, killed: false};
            if(killed) config.killed = true;
            if(damaged) config.damaged = true;
            cam.startFollow(this.target);
            let lm = new LossesAnimationManager(this.unit.scene, 200, 200);
            lm.playAt(this.target.x,this.target.y,this.target,this,config);
        }
    }

    next()
    {
        switch (this.step) {
            case 0:
                setInteractionScenario(userInteractionScenario.targetSelection);
                rangeRenderer.showAtUnit(this.unit, this.unit.config.abilities.fire.config.range*16+8);
                let enemies = [];
                players.forEach(pl => {if(pl !== this.unit.player)enemies.push(pl);});
                let targets = selectUnits(this.unit.mapX, this.unit.mapY, enemies, null, this.unit.config.abilities.fire.config.range);
                targets = selectOnLineOfSight(this.unit.mapX, this.unit.mapY,targets);
                targets.forEach(unit => {
                    unit.setPipeline('Custom');//,{ gray: 1 });
                    unit.filtered = true;
                });
                this.step++;
                break;
            case 1:
                pointerBlocked = true;
                if(rangeRenderer.visible === true)rangeRenderer.hide();
                deselectUnits();
                let fireballAnimation = new FireballAnimation(this.unit.scene, this.unit.x, this.unit.y);
                fireballAnimation.playAt(this.unit,this.target,this);
                this.step++;
                break;
            case 2:
                this.atack();
                this.step++;
                break;
            case 3:
                this.stop(this.unit);
                return true;
                break;
        }
        return false;
    }
}

class GasAbility  extends UnitAbility
{
    step = 0;
    unit = null;
    targets = null;

    constructor()
    {
        super();
    }

    onCallback()
    {
        cam.stopFollow();
        this.next();
    }

    start(unit)
    {
        this.step = 0;
        this.unit = unit;
        this.targets = null;
    }

    stop(unit)
    {
        deselectUnits();
        setInteractionScenario(userInteractionScenario.movement);
        this.step = 0;
        this.unit = null;
        this.targets = null;
        super.stop(unit);
    }

    canAtack(unit)
    {
        var type=unit.config.name;
        if(type==='muddy')return false;
        return true;
    }

    atack(target)
    {
        if(target != null)
        {
            let damaged = false;
            let killed = false;
            if(Math.random() <= this.unit.config.abilities.gas.config.damage/(this.unit.config.abilities.gas.config.damage + target.getCurrentFeatures().defense))
            {
                damaged = true;
                target.features.health--;
                if(target.features.health <= 0) killed = true;
            }
            let config = {hit: true, damaged: false, killed: false};
            if(killed) config.killed = true;
            if(damaged) config.damaged = true;
            cam.startFollow(target);
            let lm = new LossesAnimationManager(target.scene, 200, 200);
            lm.playAt(target.x,target.y,target,this,config);
        }
    }

    next()
    {
        switch (this.step) {
            case 0:
                hideArrows();
                cam.startFollow(selectedUnit);
                cam.stopFollow(selectedUnit);
                pointerBlocked = true;
                gasAnimation.playAt(this.unit,this);
                this.unit.features.abilityPoints--;
                this.step++;
                break;
            case 1:
                if(this.targets == null)
                {
                    this.targets = selectUnits(this.unit.mapX, this.unit.mapY, null, [this.unit], this.unit.config.abilities.gas.config.range);
                    for(let i=this.targets.length-1;i>=0;i--)
                    {
                        if(this.canAtack(this.targets[i])===false)this.targets.splice(i,1);
                    }
                }
                if(this.targets.length > 0)
                {
                    this.atack(this.targets.pop());
                }
                else
                {
                    this.stop(this.unit);
                    return true;
                }
                break;
        }
        return false;
    }
}

class WebAbility extends UnitAbility
{
    unit = null;

    constructor()
    {
        super();
    }

    onCallback()
    {
        cam.stopFollow();
    }

    start(unit)
    {
        this.unit = unit;
    }

    next()
    {
        this.unit.features.abilityPoints--;
        let web = new WebEntity(this.unit.scene,0,0);
        web.setPositionFromMap(this.unit.mapX, this.unit.mapY);
        web.start();
        entities.push(web);
        this.stop(this.unit);
        return true;
    }
}