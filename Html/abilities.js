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

    canActivate(unit)
    {
        return true;
    }
}

//---------------------------help functions----------------------------
function getAdjacentDoors(unit, openState = null, requireEmpty = false)
{
    let result = [];
    if(unit == null) return result;

    for(let i = 0; i < entities.length; i++)
    {
        const ent = entities[i];
        if(ent == null || ent.config == null) continue;
        if(ent.config.name !== 'door') continue;

        const dx = Math.abs(ent.mapX - unit.mapX);
        const dy = Math.abs(ent.mapY - unit.mapY);

        if(dx > 1 || dy > 1) continue;
        if(dx === 0 && dy === 0) continue;

        if(openState != null && ent.features.open !== openState) continue;
        if(requireEmpty && getUnitAtMap(ent.mapX, ent.mapY) != null) continue;

        result.push(ent);
    }

    return result;
}

//----------------------------abilities----------------------------
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
            if(this.unit.abilities.conjure.config.spells[this.spell.id] > 0) this.unit.abilities.conjure.config.spells[this.spell.id]--;
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
                    book.show(this, this.unit);
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

    canAtack(unit,target)
    {
        return checkLineOfSight(unit.mapX,unit.mapY,target.mapX,target.mapY)
    }

    atack()
    {
        this.unit.features.abilityPoints--;
        if(this.target != null)
        {
            if(this.target.player.control === PlayerControl.computer && this.unit.player !== this.target.player && this.target.player.aiControl)
            {
                if(this.target.player.aiControl.distantThreats == null) this.target.player.aiControl.distantThreats = [];
                if(this.target.player.aiControl.distantThreats.includes(this.unit) == false)this.target.player.aiControl.distantThreats.push(this.unit);
            }
            let damaged = false;
            let killed = false;
            if(Math.random() <= this.unit.config.abilities.fire.config.damage/(this.unit.config.abilities.fire.config.damage + this.target.getCurrentFeatures().defense))
            {
                damaged = true;
                this.target.features.health--;
                if(this.target.features.health <= 0) killed = true;
            }
            if(gameSettings.showEnemyMoves == true || this.unit.player.control === PlayerControl.human)
            {
                let config = {hit: true, damaged: false, killed: false};
                if(killed) config.killed = true;
                if(damaged) config.damaged = true;
                cam.startFollow(this.target);
                let lm = new LossesAnimationManager(this.unit.scene, 200, 200);
                lm.playAt(this.target.x,this.target.y,this.target,this,null,config);
            }
            else
            {
                if(killed) this.target.die();
                this.next();
            }
        }
    }

    next()
    {
        switch (this.step) {
            case 0:
                let enemies = [];
                players.forEach(pl => {
                    if (pl !== this.unit.player) enemies.push(pl);
                });
                let targets = selectUnits(this.unit.mapX, this.unit.mapY, enemies, null, this.unit.config.abilities.fire.config.range);
                targets = selectOnLineOfSight(this.unit.mapX, this.unit.mapY, targets);
                if(this.unit.player.control === PlayerControl.human)
                {
                    setInteractionScenario(userInteractionScenario.targetSelection);
                    rangeRenderer.showAtUnit(this.unit, this.unit.config.abilities.fire.config.range * 16 + 8);
                    targets.forEach(unit => {
                        unit.setPipeline('Custom');//,{ gray: 1 });
                        unit.filtered = true;
                    });
                    this.step++;
                }
                else
                {
                    this.target = this.unit.player.aiControl.selectFireTarget(this.unit, targets);
                    if(this.target == null)
                    {
                        if(this.unit.player.control === PlayerControl.computer) this.unit.player.aiControl.onFire(this.unit,false);
                        this.stop(this.unit);
                    }
                    else
                    {
                        this.step++;
                        this.next();
                    }
                }
                break;
            case 1:
                deselectUnits();
                this.step++;
                if(gameSettings.showEnemyMoves == true || this.unit.player.control === PlayerControl.human)
                {
                    pointerBlocked = true;
                    if(rangeRenderer.visible === true)rangeRenderer.hide();
                    let fireballAnimation = new FireballAnimation(this.unit.scene, this.unit.x, this.unit.y);
                    fireballAnimation.playAt(this.unit,this.target,this);                                  
                }
                else
                {
                    this.next();
                }  
                break;
            case 2:
                this.step++;
                this.atack();              
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

    canAtack(unit,target)
    {
        if(target.features.gasImmunity === true) return false;
        return true;
    }

    atack(target)
    {
        if(target != null)
        {
            if(target.player.control === PlayerControl.computer && this.unit.player !== target.player && target.player.aiControl)
            {
                if(target.player.aiControl.distantThreats == null) target.player.aiControl.distantThreats = [];
                if(target.player.aiControl.distantThreats.includes(this.unit) == false)target.player.aiControl.distantThreats.push(this.unit);
            }
            let damaged = false;
            let killed = false;
            if(Math.random() <= this.unit.config.abilities.gas.config.damage/(this.unit.config.abilities.gas.config.damage + target.getCurrentFeatures().defense))
            {
                damaged = true;
                target.features.health--;
                if(target.features.health <= 0) killed = true;
            }
            if(gameSettings.showEnemyMoves == true || this.unit.player.control === PlayerControl.human)
            {
                let config = {hit: true, damaged: false, killed: false};
                if(killed) config.killed = true;
                if(damaged) config.damaged = true;
                cam.startFollow(target);
                let lm = new LossesAnimationManager(target.scene, 200, 200);
                lm.playAt(target.x,target.y,target,this,null,config);
            }
            else
            {
                if(killed) target.die();
                this.next();
            }
        }
    }

    next()
    {
        switch (this.step) {
            case 0:
                this.unit.features.abilityPoints--;
                this.step++;
                if(gameSettings.showEnemyMoves == true || this.unit.player.control === PlayerControl.human)
                {
                    hideArrows();
                    cam.startFollow(selectedUnit);
                    cam.stopFollow(selectedUnit);
                    pointerBlocked = true;
                    gasAnimation.playAt(this.unit,this);
                }
                else
                {
                    this.next();
                }
                break;
            case 1:
                if(this.targets == null)
                {
                    this.targets = selectUnits(this.unit.mapX, this.unit.mapY, null, [this.unit], this.unit.config.abilities.gas.config.range);
                    for(let i=this.targets.length-1;i>=0;i--)
                    {
                        if(this.canAtack(this.unit,this.targets[i])===false)this.targets.splice(i,1);
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
        let web = new WebEntity(this.unit.scene,0,0,(gameSettings.showEnemyMoves == true || this.unit.player.control === PlayerControl.human));
        web.setPositionFromMap(this.unit.mapX, this.unit.mapY);
        web.start();
        entities.push(web);
        this.stop(this.unit);
        return true;
    }
}

class JumpAbility extends UnitAbility
{
    step = 0;
    unit = null;
    placeX = -1;
    placeY = -1;
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
        placeSelector.hide();
        setInteractionScenario(userInteractionScenario.movement);
        this.step = 0;
        this.unit = null;
        this.placeX = -1;
        this.placeY = -1;
        this.target = null;
        super.stop(unit);
    }

    setPlace(mapX,mapY)
    {
        this.placeX = mapX;
        this.placeY = mapY;
        this.next();
    }

    canJump(targetPos, canStep)
    {
        if(canStep)
        {
            if(gameSettings.showEnemyMoves == true || this.unit.player.control === PlayerControl.human)
            {
                pointerBlocked = true;
                this.unit.visible = false;
                let jumpAnimation = new JumpAnimation(this.unit.scene, this.unit);
                jumpAnimation.playAt(this.unit, targetPos.x+8, targetPos.y+8,this);
            }
            else
            {
                this.next();
            }
        }
        else
        {
            this.unit.features.abilityPoints--;
            this.stop(this.unit);
        }
    }

    attack()
    {
        if(this.target != null)
        {
            let damaged = false;
            let killed = false;
            if(Math.random() <= this.unit.config.abilities.jump.config.damage/(this.unit.config.abilities.jump.config.damage + this.target.getCurrentFeatures().defense))
            {
                damaged = true;
                this.target.features.health--;
                if(this.target.features.health <= 0) killed = true;
            }
            if(gameSettings.showEnemyMoves == true || this.unit.player.control === PlayerControl.human)
            {
                let config = {hit: true, damaged: false, killed: false};
                if(killed) config.killed = true;
                if(damaged) config.damaged = true;
                cam.startFollow(this.target);
                let lm = new LossesAnimationManager(this.target.scene, 200, 200);
                lm.playAt(this.target.x,this.target.y,this.target,this,null,config);
            }
            else
            {
                if(killed) target.die();
                this.next();
            }
        }
        else
        {
            this.next();
        }
    }

    jump()
    {
        if(this.placeX < 0 || this.placeY < 0) return;
        this.unit.features.abilityPoints--;
        this.target = getUnitAtMap(this.placeX, this.placeY);
        this.unit.setPositionFromMap(this.placeX,this.placeY);
        this.unit.updateVisability();
        this.unit.beforeEntityStepIn(this.placeX, this.placeY);
        this.unit.entityStepIn(this.jumpFinal.bind(this)); // async call
    }

    jumpFinal()
    {
        if(this.unit.died == true)
        {
            if(gameSettings.showEnemyMoves == true || this.unit.player.control === PlayerControl.human)
            {
                cam.stopFollow();
                pointerBlocked = false;
            }
            this.next();
            return;
        } 
        if(this.target != null)
        {
            this.unit.visible = true;
            if(gameSettings.showEnemyMoves == true || this.unit.player.control === PlayerControl.human)
            {
                pointerBlocked = false;
                let config = {hit: false, damaged: false, killed: true};
                cam.startFollow(this.unit);
                let lm = new LossesAnimationManager(this.unit.scene, 200, 200);
                lm.playAt(this.unit.x,this.unit.y,this.unit,this,null,config);
            }
            else
            {
                this.unit.die();
                this.next();
            }
           
        }
        else
        {
            if(gameSettings.showEnemyMoves == true || this.unit.player.control === PlayerControl.human)
            {
                this.unit.visible = true;
                cam.startFollow(this.unit);
            }
            this.next();
        }
    }

    next()
    {
        switch (this.step) {
            case 0:
                let places = selectPlacesOnLineOfSight(this.unit.mapX, this.unit.mapY, this.unit.config.abilities.jump.config.range, true, true);
                if(this.unit.player.control === PlayerControl.human)
                {
                    setInteractionScenario(userInteractionScenario.placeSelection);
                    this.step++;
                    placeSelector.show(places,this);
                }
                else
                {
                    const targetPlace = this.unit.player.aiControl.selectRocketJumpTarget(this.unit);
                    if(targetPlace == null)
                    {
                        //this.unit.player.aiControl.onRocketJump(this.unit,false);
                        this.stop(this.unit);
                    }
                    else
                    {
                        this.placeX = targetPlace.x;
                        this.placeY = targetPlace.y;
                        this.step++;
                        this.next();
                    }
                }   
                break;
            case 1:
                this.step++;
                placeSelector.hide();
                let pos = map.tileToWorldXY(this.placeX, this.placeY);
                this.unit.turnTo(pos.x+8,pos.y+8);
                this.unit.checkEntityStepOut(this.canJump.bind(this, pos)); //async call
                break;
            case 2:
                this.step++;
                this.jump();                      
                break;
            case 3:
                this.step++;
                this.attack();                      
                break;
            case 4:
                this.stop(this.unit);
                return true;
                break;
        }
        return false;
    }
}

class DoorOpenAbility extends UnitAbility
{
    step = 0;
    unit = null;
    doors = null;
    placeX = -1;
    placeY = -1;

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
        this.doors = null;
        this.placeX = -1;
        this.placeY = -1;
    }

    stop(unit)
    {
        placeSelector.hide();
        setInteractionScenario(userInteractionScenario.movement);
        this.step = 0;
        this.unit = null;
        this.doors = null;
        this.placeX = -1;
        this.placeY = -1;
        super.stop(unit);
    }

    canActivate(unit)
    {
        if(unit == null) return false;
        //if(unit.features.abilityPoints <= 0) return false;
        return getAdjacentDoors(unit, false, false).length > 0;
    }

    setPlace(mapX, mapY)
    {
        this.placeX = mapX;
        this.placeY = mapY;
        this.next();
    }

    next()
    {
        switch(this.step)
        {
             case 0:
            {
                this.doors = getAdjacentDoors(this.unit, false, false);
                if(this.doors.length <= 0)
                {
                    this.stop(this.unit);
                    return true;
                }
                if(this.doors.length > 1)
                {
                    let places = [];
                    for(let i = 0; i < this.doors.length; i++)
                    {
                        places.push([this.doors[i].mapX, this.doors[i].mapY]);
                    }
                    if(this.unit.player.control === PlayerControl.human)
                    {
                        setInteractionScenario(userInteractionScenario.placeSelection);                
                        this.step++;
                        placeSelector.show(places, this);
                        return false;
                    }
                    else
                    {
                        const targetPlace = this.unit.player.aiControl.selectDoorOpenTarget(this.unit, doors);
                        if(targetPlace == null)
                        {
                            this.stop(this.unit);
                            return true;
                        }
                        else
                        {
                            this.placeX = targetPlace.x;
                            this.placeY = targetPlace.y;
                            this.step++;
                            this.next();
                            return false;
                        }
                    }
                }
                else
                {
                    this.placeX = this.doors[0].mapX;
                    this.placeY = this.doors[0].mapY;
                    this.step++;
                    this.next();
                }
                break;
            }
            case 1:
            {
                if(this.doors !== null)
                {
                    let door = null;
                    for(let i = 0; i < this.doors.length; i++)
                    {
                        if(this.doors[i].mapX === this.placeX && this.doors[i].mapY === this.placeY)
                        {
                            door = this.doors[i];
                            break;
                        }
                    }
                    if(door != null)
                    {
                        //this.unit.features.abilityPoints--;
                        door.open();
                    }
                }
                this.stop(this.unit);
                return true;
            }
        }
        return false;
    }
}

class DoorCloseAbility extends UnitAbility
{
    step = 0;
    unit = null;
    doors = null;
    placeX = -1;
    placeY = -1;

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
        this.doors = null;
        this.placeX = -1;
        this.placeY = -1;
    }

    stop(unit)
    {
        placeSelector.hide();
        setInteractionScenario(userInteractionScenario.movement);
        this.step = 0;
        this.unit = null;
        this.doors = null;
        this.placeX = -1;
        this.placeY = -1;
        super.stop(unit);
    }

    canActivate(unit)
    {
        if(unit == null) return false;
        //if(unit.features.abilityPoints <= 0) return false;
        return getAdjacentDoors(unit, true, true).length > 0;
    }

    setPlace(mapX, mapY)
    {
        this.placeX = mapX;
        this.placeY = mapY;
        this.next();
    }

    next()
    {
        switch(this.step)
        {
            case 0:
            {
                this.doors = getAdjacentDoors(this.unit, true, true);
                if(this.doors.length <= 0)
                {
                    this.stop(this.unit);
                    return true;
                }
                if(this.doors.length > 1)
                {
                    let places = [];
                    for(let i = 0; i < this.doors.length; i++)
                    {
                        places.push([this.doors[i].mapX, this.doors[i].mapY]);
                    }
                    if(this.unit.player.control === PlayerControl.human)
                    {
                        setInteractionScenario(userInteractionScenario.placeSelection);
                        this.step++;
                        placeSelector.show(places, this);
                        return false;
                    }
                    else
                    {
                        const targetPlace = this.unit.player.aiControl.selectDoorOpenTarget(this.unit, doors);
                        if(targetPlace == null)
                        {
                            this.stop(this.unit);
                            return true;
                        }
                        else
                        {
                            this.placeX = targetPlace.x;
                            this.placeY = targetPlace.y;
                            this.step++;
                            this.next();
                            return false;
                        }
                    }
                }
                else
                {
                    this.placeX = this.doors[0].mapX;
                    this.placeY = this.doors[0].mapY;
                    this.step++;
                    this.next();
                }
                break;
            }
            case 1:
            {
                if(this.doors !== null)
                {
                    let door = null;
                    for(let i = 0; i < this.doors.length; i++)
                    {
                        if(this.doors[i].mapX === this.placeX && this.doors[i].mapY === this.placeY)
                        {
                            door = this.doors[i];
                            break;
                        }
                    }
                    if(door != null)
                    {
                        //this.unit.features.abilityPoints--;
                        door.close();
                    }
                }
                this.stop(this.unit);
                return true;
            }
        }
        return false;
    }
}