//---------------------------- spell classes ----------------------------
class Spell
{
    wizard = null;
    spellConfig = null;
    callbackObject = null;

    constructor()
    {

    }

    start(wizard, spellConfig, callbackObject)
    {
        this.wizard = wizard;
        this.spellConfig = spellConfig;
        this.callbackObject = callbackObject;
    }

    stop(res)
    {
      this.wizard = null;
      this.spellConfig = null;
      let cb = this.callbackObject;
      this.callbackObject = null;  
      if(cb != null) cb.onSpellCallback(res);
    }

    next()
    {
        this.stop();
        return true;
    }

}

class SummonSpell extends Spell
{
    step = 0;
    placeX = -1;
    placeY = -1;

    constructor()
    {
        super();
    }

    start(wizard, spellConfig, callbackObject)
    {
        super.start(wizard, spellConfig, callbackObject);
        this.step = 0;
    }

    stop(res)
    {
        placeSelector.hide();
        super.stop(res);
    }

    onCallback()
    {
        this.next();
    }

    setPlace(mapX,mapY)
    {
        this.placeX = mapX;
        this.placeY = mapY;
        this.next();
    }

    animateAppearance(unit)
    {
        /**/
        let tween = this.wizard.scene.tweens.add({
            callbackScope: this,
            targets: unit,
            scale: {start: 0, to: unit.config.scale},
            ease: 'Linear',
            duration: 200,
            yoyo: false,
            repeat: 0,
            paused: true,
            onComplete: function(){ this.onCallback(); },
        });
        tween.play();
        /**/
        
        /*
        const g = this.wizard.scene.make.graphics({ x: 0, y: 0, add: false });
        g.fillStyle(0x8B5A2B, 1);
        for (let i = 4; i > 0; i--) {
            g.fillCircle(8, 8, i * 2, 1 - i * 0.15);
        }
        g.generateTexture('dust', 16, 16);
        g.destroy();
        
        const tex = this.wizard.scene.textures.get(unit.config.sprite).getSourceImage();
        const fullW = tex.width;
        const fullH = tex.height;
        const groundX = unit.x;
        const groundY = unit.y;
      
        const particles = this.wizard.scene.add.particles('dust');
        const emitter = particles.createEmitter({
            frame: null,
            x: groundX,
            y: groundY + fullH / 2,
            lifespan: { min: 400, max: 800 },
            speed: { min: 10, max: 50 },
            angle: { min: -130, max: -50 },
            scale: { start: 0.1, end: 0 },
            alpha: { start: 1, end: 0 },
            blendMode: 'NORMAL',
            quantity: 4,
            frequency: 10,
            on: true
        });
      
        unit.setCrop(0, fullH, fullW, 0);
        const depth = 16; 
        unit.y = unit.y + depth;
        const props = { y: groundY + depth, h: 0 };
        this.wizard.scene.tweens.add({
            callbackScope: this,
            targets: props,
            y: groundY,
            h: fullH,
            ease: 'Sine.easeOut',
            duration: 5000,
            onUpdate: () => {
                unit.y = props.y;
                unit.setCrop(0, 0, fullW, props.h);
            },
            onComplete: () => {
                unit.setCrop();
                emitter.stop();
                this.onCallback();
            }
        });
        */
    }

    next()
    {
        switch (this.step) {
            case 0:
                let places = selectFreeAdjacentPlaces(this.wizard.mapX, this.wizard.mapY);
                if(this.wizard.player.control === PlayerControl.human)
                {
                    setInteractionScenario(userInteractionScenario.placeSelection);
                    placeSelector.show(places, this);
                    this.step++;
                }
                else
                {
                    if(places.length === 0)
                    {
                        this.stop(false);
                        return true;
                    }
                    let pos = this.wizard.player.aiControl.selectSummonPlace(this.wizard, places);
                    this.placeX = pos.x;
                    this.placeY = pos.y;
                    this.step++;
                    this.next();
                }
                break;
            case 1:
                this.step++;
                if(gameSettings.showEnemyMoves == true || this.wizard.player.control === PlayerControl.human)
                {
                    pointerBlocked = true;
                    placeSelector.hide();
                    let pos = map.tileToWorldXY(this.placeX, this.placeY);
                    let animation = new PortalAnimation(this.wizard.scene, pos.x+8, pos.y+8);
                    animation.playAt(pos.x+8, pos.y+8,this);
                }
                else
                {
                    this.next();
                }
                break;
            case 2:
                let unit = new Unit(unitConfigs[this.spellConfig.name], this.wizard.scene, 0, 0, false);
                //unit.scale = 0;
                unit.setPositionFromMap(this.placeX, this.placeY);
                this.wizard.player.addUnit(unit);
                units.push(unit);
                unit.updateVisability();
                unit.entityStepIn();
                this.step++;
                if(gameSettings.showEnemyMoves == true || this.wizard.player.control === PlayerControl.human)
                {
                    unit.visible = true;
                    this.animateAppearance(unit);
                    unit.scale=unit.config.scale;
                }
                else
                {
                    unit.scale=unit.config.scale;
                    this.next();
                }
                break;
            case 3:
                this.stop(true);
                return true;
                break;
        }
        return false;
    }

}

class SelfSpell extends Spell
{
    step = 0;

    constructor()
    {
        super();
    }

    start(wizard, spellConfig, callbackObject)
    {
        super.start(wizard, spellConfig, callbackObject);
        this.step = 0;
    }

    onCallback()
    {
        this.next();
    }

    next()
    {
        switch (this.step) {
            case 0:
                this.step++;
                if(gameSettings.showEnemyMoves == true || this.wizard.player.control === PlayerControl.human)
                {
                    pointerBlocked = true;
                    hideArrows();
                    let animation = new PortalAnimation(this.wizard.scene, this.wizard.x, this.wizard.y);
                    animation.playAt(this.wizard.x, this.wizard.y, this);
                }
                else
                {
                    this.next();
                }
                break;
            case 1:
                if(this.spellConfig.entity != null)
                {
                    let entity = entityConfigs[this.spellConfig.entity].createFunction(this.wizard.scene, 0, 0, (gameSettings.showEnemyMoves == true || this.wizard.player.control === PlayerControl.human));
                    entity.setPositionFromMap(this.wizard.mapX, this.wizard.mapY);
                    entity.start();
                    entities.push(entity);
                }
                this.stop(true);
                return true;
                break;
        }
        return false;
    }

}

class UnitSpell extends Spell
{
    step = 0;
    target = null;

    constructor()
    {
        super();
    }

    start(wizard, spellConfig, callbackObject)
    {
        super.start(wizard, spellConfig, callbackObject);
        this.step = 0;
    }

    stop(res)
    {
        if(rangeRenderer.visible === true)rangeRenderer.hide();
        deselectUnits();
        super.stop(res);
    }

    onCallback()
    {
        cam.stopFollow();
        this.next();
    }

    setTarget(target)
    {
        this.target = target;
    }

    cast()
    {
        if(this.target != null)
        {
            GiganticState.apply(this.target);
        }
    }

    next()
    {
        switch (this.step) {
            case 0:
                setInteractionScenario(userInteractionScenario.targetSelection);
                rangeRenderer.showAtUnit(this.wizard, this.spellConfig.range*16+8);
                pointerBlocked = false;
                let targets = selectUnits(this.wizard.mapX, this.wizard.mapY, null, null, this.spellConfig.range);
                targets = selectOnLineOfSight(this.wizard.mapX, this.wizard.mapY,targets);
                targets.forEach(unit => {
                    unit.setPipeline('Custom');//,{ gray: 1 });
                    unit.filtered = true;
                });
                this.step++;
                break;
            case 1:
                deselectUnits();
                this.step++;
                if(gameSettings.showEnemyMoves == true || this.wizard.player.control === PlayerControl.human)
                {
                    pointerBlocked = true;
                    if(rangeRenderer.visible === true)rangeRenderer.hide();
                    let throwAnimation = new ThrowSpellAnimation(this.wizard.scene, this.wizard.x, this.wizard.y);
                    throwAnimation.playAt(this.wizard.x, this.wizard.y, this.target.x, this.target.y,this);
                }
                else
                {
                    this.next();
                }
                break;
            case 2:
                this.step++;
                if(gameSettings.showEnemyMoves == true || this.wizard.player.control === PlayerControl.human)
                {
                    let portalAnimation = new PortalAnimation(this.wizard.scene, this.target.x, this.target.y);
                    portalAnimation.playAt(this.target.x, this.target.y, this);
                }
                else
                {
                    this.next();
                }
                break;
            case 3:
                this.cast();
                this.step++;
                this.next();
            case 4:
                this.stop(true);
                return true;
                break;
        }
        return false;
    }

}

class EntitySpell extends Spell
{
    step = 0;
    placeX = -1;
    placeY = -1;

    constructor()
    {
        super();
    }

    start(wizard, spellConfig, callbackObject)
    {
        super.start(wizard, spellConfig, callbackObject);
        this.step = 0;
    }

    stop(res)
    {
        placeSelector.hide();
        super.stop(res);
    }

    onCallback()
    {
        this.next();
    }

    setPlace(mapX,mapY)
    {
        this.placeX = mapX;
        this.placeY = mapY;
        this.next();
    }

    next()
    {
        switch (this.step) {
            case 0:
                setInteractionScenario(userInteractionScenario.placeSelection);
                let places = selectPlacesOnLineOfSight(this.wizard.mapX, this.wizard.mapY, this.spellConfig.range, true, true);
                placeSelector.show(places,this);
                this.step++;
                break;
            case 1:
                this.step++;
                if(gameSettings.showEnemyMoves == true || this.wizard.player.control === PlayerControl.human)
                {
                    pointerBlocked = true;
                    placeSelector.hide();
                    let pos = map.tileToWorldXY(this.placeX, this.placeY);
                    let throwAnimation = new ThrowSpellAnimation(this.wizard.scene, this.wizard.x, this.wizard.y);
                    throwAnimation.playAt(this.wizard.x, this.wizard.y, pos.x+8, pos.y+8,this);
                }
                else
                {
                    this.next();
                }
                break;
            case 2:
                this.step++;
                if(gameSettings.showEnemyMoves == true || this.wizard.player.control === PlayerControl.human)
                {
                    let pos2 = map.tileToWorldXY(this.placeX, this.placeY);
                    let portalAnimation = new PortalAnimation(this.wizard.scene, pos2.x+8, pos2.y+8);
                    portalAnimation.playAt(pos2.x+8, pos2.y+8,this);
                }
                else
                {
                    this.next();
                }
                break;
            case 3:
                let entity = entityConfigs[this.spellConfig.entity].createFunction(this.wizard.scene, 0, 0, (gameSettings.showEnemyMoves == true || this.wizard.player.control === PlayerControl.human));
                entity.setPositionFromMap(this.placeX, this.placeY);
                entity.start();
                entities.push(entity);
                this.stop(true);
                return true;
                break;
        }
        return false;
    }

}

class AtackSpell extends Spell
{
    step = 0;
    target = null;

    constructor()
    {
        super();
    }

    start(wizard, spellConfig, callbackObject)
    {
        super.start(wizard, spellConfig, callbackObject);
        this.step = 0;
    }

    stop(res)
    {
        if(rangeRenderer.visible === true)rangeRenderer.hide();
        deselectUnits();
        super.stop(res);
    }

    onCallback()
    {
        cam.stopFollow();
        this.next();
    }

    setTarget(target)
    {
        this.target = target;
    }

    atack()
    {
        if(this.target != null)
        {
            let damaged = false;
            let killed = false;
            if(Math.random() <= this.spellConfig.damage/(this.spellConfig.damage + this.target.getCurrentFeatures().defense))
            {
                damaged = true;
                this.target.features.health--;
                if(this.target.features.health <= 0) killed = true;
            }
            if(gameSettings.showEnemyMoves == true || this.wizard.player.control === PlayerControl.human)
            {
                let config = {hit: true, damaged: false, killed: false};
                if(killed) config.killed = true;
                if(damaged) config.damaged = true;
                cam.startFollow(this.target);
                let lm = new LossesAnimationManager(this.wizard.scene, 200, 200);
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
                setInteractionScenario(userInteractionScenario.targetSelection);
                rangeRenderer.showAtUnit(this.wizard, this.spellConfig.range*16+8);
                pointerBlocked = false;
                let enemies = [];
                players.forEach(pl => {if(pl !== this.wizard.player)enemies.push(pl);});
                let targets = selectUnits(this.wizard.mapX, this.wizard.mapY, enemies, null, this.spellConfig.range);
                targets = selectOnLineOfSight(this.wizard.mapX, this.wizard.mapY,targets);
                targets.forEach(unit => {
                    unit.setPipeline('Custom');//,{ gray: 1 });
                    unit.filtered = true;
                });
                this.step++;
                break;
            case 1:
                deselectUnits();
                this.step++;
                if(gameSettings.showEnemyMoves == true || this.wizard.player.control === PlayerControl.human)
                {
                    pointerBlocked = true;
                    if(rangeRenderer.visible === true)rangeRenderer.hide();
                    let fireballAnimation = new FireballAnimation(this.wizard.scene, this.wizard.x, this.wizard.y);
                     fireballAnimation.playAt(this.wizard,this.target,this);
                }
                else
                {
                    this.next();
                }
                break;
            case 2:
                this.atack();
                this.step++;
                break;
            case 3:
                this.stop(true);
                return true;
                break;
        }
        return false;
    }

}

class AtackPlaceSpell extends Spell
{
    step = 0;
    placeX = -1;
    placeY = -1;
    targets = null;

    constructor()
    {
        super();
    }

    start(wizard, spellConfig, callbackObject)
    {
        super.start(wizard, spellConfig, callbackObject);
        this.step = 0;
        this.targets = null;
    }

    stop(res)
    {
        placeSelector.hide();
        super.stop(res);
    }

    onCallback()
    {
        cam.stopFollow();
        this.next();
    }

    setPlace(mapX,mapY)
    {
        this.placeX = mapX;
        this.placeY = mapY;
        this.next();
    }

    atack(target)
    {
        if(target != null)
        {
            let damaged = false;
            let killed = false;
            if(Math.random() <= this.spellConfig.damage/(this.spellConfig.damage + target.getCurrentFeatures().defense))
            {
                damaged = true;
                target.features.health--;
                if(target.features.health <= 0) killed = true;
            }
            if(gameSettings.showEnemyMoves == true || this.wizard.player.control === PlayerControl.human)
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
                setInteractionScenario(userInteractionScenario.placeSelection);
                let places = selectPlacesOnLineOfSight(this.wizard.mapX, this.wizard.mapY, this.spellConfig.range, true, true);
                placeSelector.show(places,this);
                this.step++;
                break;
            case 1:
                this.step++;
                if(gameSettings.showEnemyMoves == true || this.wizard.player.control === PlayerControl.human)
                {
                    pointerBlocked = true;
                    placeSelector.hide();
                    let pos = map.tileToWorldXY(this.placeX, this.placeY);
                    let animation = new LightningAnimation(this.wizard.scene);
                    animation.playAt(this.wizard.x, this.wizard.y, pos.x+8, pos.y+8,this);
                }
                else
                {
                    this.next();
                }
                break;
            case 2:
                if(this.targets == null)
                {
                    this.targets = selectUnits(this.placeX, this.placeY, null, null, this.spellConfig.damageRange);
                }
                if(this.targets.length > 0)
                {
                    this.atack(this.targets.pop());
                }
                else
                {
                    this.stop(true);
                    return true;
                }
                break;
        }
        return false;
    }

}