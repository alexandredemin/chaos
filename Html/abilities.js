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
function getAdjacentUsableEntities(unit)
{
    let result = [];
    if(unit == null) return result;
    for(let i = 0; i < entities.length; i++)
    {
        const ent = entities[i];
        if(ent == null) continue;
        if(typeof ent.canUse !== 'function') continue;
        if(ent.canUse(unit))
        {
            result.push(ent);
        }
    }
    return result;
}

function getUseActionCost(target, unit)
{
	if(target != null && typeof target.getUseCost === 'function')
	{
		return target.getUseCost(unit);
	}
	return {
		abilityPointCost: 0,
		movePointCost: 0
	};
}

function canUnitPayActionCost(unit, cost)
{
	if(unit == null) return false;
	if(cost == null) return true;
	const abilityPointCost = cost.abilityPointCost || 0;
	const movePointCost = cost.movePointCost || 0;
	if(unit.features.abilityPoints < abilityPointCost) return false;
	if(unit.features.move < movePointCost) return false;
	return true;
}

function canUnitSpendAbilityPoint(unit)
{
	if(unit == null) return false;
	return unit.features.abilityPoints > 0;
}

function getItemEntityAtUnit(unit)
{
	if(unit == null) return null;

	const ents = Entity.getEntitiesAtMap(unit.mapX, unit.mapY);
	if(ents == null || ents.length <= 0) return null;

	let pickupSources = [];
	let looseSources = [];
	let containerSources = [];

	for(let i = 0; i < ents.length; i++)
	{
		const ent = ents[i];
		if(!(ent instanceof ItemEntity)) continue;
		if(ent.getItemCount() <= 0) continue;

		if(typeof ent.canAccessItems === 'function' && ent.canAccessItems(unit))
		{
			if(ent instanceof ContainerEntity) containerSources.push(ent);
			else looseSources.push(ent);
		}
	}

	pickupSources = looseSources.concat(containerSources);

	if(pickupSources.length <= 0) return null;
	if(pickupSources.length === 1) return pickupSources[0];

	return {
		sources: pickupSources,

		getItems()
		{
			let result = [];
			for(let i = 0; i < this.sources.length; i++)
			{
				const items = this.sources[i].getItems();
				for(let j = 0; j < items.length; j++)
				{
					result.push(items[j]);
				}
			}
			return result;
		},

		getItemCount()
		{
			let count = 0;
			for(let i = 0; i < this.sources.length; i++)
			{
				count += this.sources[i].getItemCount();
			}
			return count;
		},

		removeItem(index=0)
		{
			let localIndex = index;

			for(let i = 0; i < this.sources.length; i++)
			{
				const source = this.sources[i];
				const count = source.getItemCount();

				if(localIndex < count)
				{
					return source.removeItem(localIndex);
				}

				localIndex -= count;
			}

			return null;
		}
	};
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

    canActivate(unit)
    {
        return canUnitSpendAbilityPoint(unit);
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

    canActivate(unit)
    {
        return canUnitSpendAbilityPoint(unit);
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

    canActivate(unit)
    {
        return canUnitSpendAbilityPoint(unit);
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

    canActivate(unit)
    {
        return canUnitSpendAbilityPoint(unit);
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

    canActivate(unit)
    {
        return canUnitSpendAbilityPoint(unit);
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

class UseAbility extends UnitAbility
{
	step = 0;
	unit = null;
	targets = null;
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
		this.targets = null;
		this.placeX = -1;
		this.placeY = -1;
	}

	stop(unit)
	{
		placeSelector.hide();
		setInteractionScenario(userInteractionScenario.movement);

		this.step = 0;
		this.unit = null;
		this.targets = null;
		this.placeX = -1;
		this.placeY = -1;

		super.stop(unit);
	}

	beginAsyncActionLock()
	{
		if(!shouldShowActionAnimation(this.unit)) return;
        pointerBlocked = true;
		hideArrows();
	}

	endAsyncActionLock()
	{
		if(!shouldShowActionAnimation(this.unit)) return;
        pointerBlocked = false;
		if(this.unit != null && this.unit.player != null && this.unit.player.control === PlayerControl.human && selectedUnit === this.unit)
		{
			showArrows(selectedUnit);
		}
	}

	onUseComplete(result)
	{
		if(result != null && result.success === true && this.unit != null)
		{
			const abilityPointCost = result.abilityPointCost != null ? result.abilityPointCost : 0;
			const movePointCost = result.movePointCost != null ? result.movePointCost : 0;
			if(abilityPointCost > 0)
			{
				this.unit.features.abilityPoints -= abilityPointCost;
				if(this.unit.features.abilityPoints < 0) this.unit.features.abilityPoints = 0;
			}
			if(movePointCost > 0)
			{
				this.unit.features.move -= movePointCost;
				if(this.unit.features.move < 0) this.unit.features.move = 0;
			}
			this.unit.updateVisability();
		}
		if(uiScene && uiScene.bottomBar != null)
		{
			uiScene.bottomBar.markDirty();
			uiScene.bottomBar.refresh(true);
		}
		this.endAsyncActionLock();
		this.stop(this.unit);
	}

    canActivate(unit)
    {
        if(unit == null) return false;
        const targets = getAdjacentUsableEntities(unit);
        for(let i = 0; i < targets.length; i++)
        {
            const cost = getUseActionCost(targets[i], unit);
            if(canUnitPayActionCost(unit, cost))
            {
                return true;
            }
        }
        return false;
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
				this.targets = getAdjacentUsableEntities(this.unit);
                for(let i = this.targets.length - 1; i >= 0; i--)
                {
                    const cost = getUseActionCost(this.targets[i], this.unit);

                    if(!canUnitPayActionCost(this.unit, cost))
                    {
                        this.targets.splice(i, 1);
                    }
                }
				if(this.targets.length <= 0)
				{
					this.stop(this.unit);
					return true;
				}
				if(this.targets.length > 1)
				{
					let places = [];

					for(let i = 0; i < this.targets.length; i++)
					{
						places.push([this.targets[i].mapX, this.targets[i].mapY]);
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
						const targetPlace = this.unit.player.aiControl.selectUseTarget(this.unit, this.targets);

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
					this.placeX = this.targets[0].mapX;
					this.placeY = this.targets[0].mapY;
					this.step++;
					this.next();
					return false;
				}
			}

			case 1:
			{
				if(this.targets !== null)
				{
					let target = null;

					for(let i = 0; i < this.targets.length; i++)
					{
						if(this.targets[i].mapX === this.placeX && this.targets[i].mapY === this.placeY)
						{
							target = this.targets[i];
							break;
						}
					}

					if(target != null)
					{
                        const cost = getUseActionCost(target, this.unit);
                        if(!canUnitPayActionCost(this.unit, cost))
                        {
                            this.stop(this.unit);
                            return true;
                        }
						this.beginAsyncActionLock();
						this.step = 2;
						target.use(this.unit, {}, this);
						return false;
					}
				}

				this.stop(this.unit);
				return true;
			}

			case 2:
				return false;
		}

		return false;
	}
}

class PickUpAbility extends UnitAbility
{
	step = 0;
	unit = null;
	itemEntity = null;
	selectedItemIndex = -1;

	constructor()
	{
		super();
	}

	start(unit)
	{
		this.step = 0;
		this.unit = unit;
		this.itemEntity = getItemEntityAtUnit(unit);
		this.selectedItemIndex = -1;
	}

	stop(unit)
	{
		this.step = 0;
		this.unit = null;
		this.itemEntity = null;
		this.selectedItemIndex = -1;

		if(uiScene && uiScene.pickupPanel != null && uiScene.pickupPanel.visible)
		{
			const cb = uiScene.pickupPanel.callbackObject;
			uiScene.pickupPanel.callbackObject = null;
			uiScene.pickupPanel.hide(null);
			uiScene.pickupPanel.callbackObject = cb;
		}

		super.stop(unit);
	}

	canActivate(unit)
	{
		if(unit == null) return false;
		//if(unit.features.abilityPoints <= 0) return false;
        if(unit.features.move <= 0) return false;
		if(typeof unit.hasFreeItemSlot === 'function' && !unit.hasFreeItemSlot()) return false;

		const itemEntity = getItemEntityAtUnit(unit);
		return itemEntity != null && itemEntity.getItemCount() > 0;
	}

	onCallback(result)
	{
		if(result == null)
		{
			this.stop(this.unit);
			return;
		}

		this.selectedItemIndex = result.itemIndex;
		this.next();
	}

	beginAsyncActionLock()
	{
		if(!shouldShowActionAnimation(this.unit)) return;
        pointerBlocked = true;
		hideArrows();
	}

	endAsyncActionLock()
	{
		if(!shouldShowActionAnimation(this.unit)) return;
        pointerBlocked = false;
		if(this.unit != null && this.unit.player != null && this.unit.player.control === PlayerControl.human && selectedUnit === this.unit)
		{
			showArrows(selectedUnit);
		}
	}

	onPickupEffectComplete()
	{
		if(this.unit == null || this.itemEntity == null)
		{
			this.endAsyncActionLock();
			this.stop(this.unit);
			return;
		}

		const item = this.itemEntity.removeItem(this.selectedItemIndex);

		if(item != null)
		{
			const added = this.unit.addItem(item);

			if(added)
			{
				//this.unit.features.abilityPoints--;
				//if(this.unit.features.abilityPoints < 0) this.unit.features.abilityPoints = 0;
                this.unit.features.move --;
                if(this.unit.features.move < 0) this.unit.features.move = 0;
			}
		}

		if(uiScene && uiScene.bottomBar != null)
		{
			uiScene.bottomBar.markDirty();
			uiScene.bottomBar.refresh(true);
		}

		this.endAsyncActionLock();
		this.stop(this.unit);
	}

	next()
	{
		switch(this.step)
		{
			case 0:
				if(this.itemEntity == null)
				{
					this.stop(this.unit);
					return true;
				}
				if(this.unit.player.control === PlayerControl.human)
				{
					uiScene.pickupPanel.show(this.itemEntity, this.unit, this);
					this.step = 1;
					return false;
				}
				else
				{
					const targetItem = this.unit.player.aiControl.selectPickupItem(this.unit, this.itemEntity);
					if(targetItem == null)
					{
						this.stop(this.unit);
						return true;
					}
					else
					{
						this.selectedItemIndex = targetItem.itemIndex;
						this.step = 1;
						this.next();
						return false;
					}
				}

			case 1:
				if(this.itemEntity == null || this.selectedItemIndex < 0)
				{
					this.stop(this.unit);
					return true;
				}

				if(typeof this.unit.hasFreeItemSlot === 'function' && !this.unit.hasFreeItemSlot())
				{
					this.stop(this.unit);
					return true;
				}

				const items = this.itemEntity.getItems();
				if(items == null || this.selectedItemIndex >= items.length)
				{
					this.stop(this.unit);
					return true;
				}

				const item = items[this.selectedItemIndex];
				if(item == null)
				{
					this.stop(this.unit);
					return true;
				}

				this.beginAsyncActionLock();

				this.step = 2;
				playPickupItemEffect(this.unit.scene, this.unit, item, () => this.onPickupEffectComplete());
				return false;

			case 2:
				return false;
		}

		return true;
	}
}

class InventoryAbility extends UnitAbility
{
	step = 0;
	unit = null;
	selectedItemIndex = -1;
	selectedActionId = null;

	constructor()
	{
		super();
	}

    beginAsyncActionLock()
	{
		if(!shouldShowActionAnimation(this.unit)) return;
        pointerBlocked = true;
		hideArrows();
	}

	endAsyncActionLock()
	{
		if(!shouldShowActionAnimation(this.unit)) return;
        pointerBlocked = false;
		if(this.unit != null && this.unit.player != null && this.unit.player.control === PlayerControl.human && selectedUnit === this.unit)
		{
			showArrows(selectedUnit);
		}
	}

	start(unit)
	{
		this.step = 0;
		this.unit = unit;
		this.selectedItemIndex = -1;
		this.selectedActionId = null;
	}

	stop(unit)
	{
		this.step = 0;
		this.unit = null;
		this.selectedItemIndex = -1;
		this.selectedActionId = null;

		if(uiScene && uiScene.inventoryPanel != null && uiScene.inventoryPanel.visible)
		{
			const cb = uiScene.inventoryPanel.callbackObject;
			uiScene.inventoryPanel.callbackObject = null;
			uiScene.inventoryPanel.hide(null);
			uiScene.inventoryPanel.callbackObject = cb;
		}

		super.stop(unit);
	}

	canActivate(unit)
	{
		if(unit == null) return false;
		return typeof unit.hasItems === 'function' && unit.hasItems();
	}

	onCallback(result)
	{
		if(result == null)
		{
			this.stop(this.unit);
			return;
		}

		this.selectedItemIndex = result.itemIndex;
		this.selectedActionId = result.actionId;
		this.next();
	}

	onItemActionComplete(result)
	{
		if(result != null && result.success === true && this.unit != null)
		{
			if(result.consumeItem === true)
			{
				this.unit.removeItem(this.selectedItemIndex);
			}
			if(result.abilityPointCost != null && result.abilityPointCost > 0)
            {
                this.unit.features.abilityPoints -= result.abilityPointCost;
                if(this.unit.features.abilityPoints < 0) this.unit.features.abilityPoints = 0;
            }
            if(result.movePointCost != null && result.movePointCost > 0)
            {
                this.unit.features.move -= result.movePointCost;
                if(this.unit.features.move < 0) this.unit.features.move = 0;
            }
			if(uiScene && uiScene.bottomBar != null)
			{
				uiScene.bottomBar.markDirty();
				uiScene.bottomBar.refresh(true);
			}
		}

		this.endAsyncActionLock();
		this.stop(this.unit);
	}

	next()
	{
		switch(this.step)
		{
			case 0:
				if(this.unit == null || !this.unit.hasItems())
				{
					this.stop(this.unit);
					return true;
				}
				if(this.unit.player.control === PlayerControl.human)
				{
					uiScene.inventoryPanel.show(this.unit, this);
					this.step = 1;
					return false;
				}
				else
				{
					const targetAction = this.unit.player.aiControl.selectInventoryAction(this.unit);
					if(targetAction == null)
					{
						this.stop(this.unit);
						return true;
					}
					else
					{
						this.selectedItemIndex = targetAction.itemIndex;
						this.selectedActionId = targetAction.actionId;
						this.step = 1;
						this.next();
						return false;
					}
				}

			case 1:
				if(this.unit == null || this.selectedItemIndex < 0 || this.selectedActionId == null)
				{
					this.stop(this.unit);
					return true;
				}
				const item = this.unit.getItem(this.selectedItemIndex);
				if(item == null)
				{
					this.stop(this.unit);
					return true;
				}
				this.beginAsyncActionLock();
				this.step = 2;
				item.doAction(this.selectedActionId, this.unit, {
					scene: this.unit.scene,
					mapX: this.unit.mapX,
					mapY: this.unit.mapY
				}, this);
				return false;

			case 2:
				return false;
		}

		return true;
	}
}