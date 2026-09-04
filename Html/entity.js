//---------------------------- Entity class ----------------------------
class Entity extends BaseUnit
{
    moved = false;
    tween = null;

    constructor(config, scene, x, y, visible=true)
    {
        super(config, scene, x, y, visible);
        this.zOffset = 0;
        this.scale = 0;
    }
  
    serialize() {
        return {
            configName: this.config.name,
            mapX: this.mapX,
            mapY: this.mapY,
            features: clone(this.features),
        };
    }
  
    static deserialize(storedData, scene) {
        const cfg = entityConfigs[storedData.configName];
        let entity = entityConfigs[storedData.configName].createFunction(scene, 0, 0, false);
        entity.setPositionFromMap(storedData.mapX, storedData.mapY);
        for (let key in storedData.features) {entity.features[key] = storedData.features[key];}
        if(typeof entity.onDeserialize === 'function') entity.onDeserialize(storedData);
        entity.start(false);
        entities.push(entity);
        return entity;
    }

    static getEntityAtMap(mapX, mapY)
    {
        for(let i=0; i<entities.length; i++)
        {
            if((entities[i].mapX === mapX) && (entities[i].mapY === mapY)){return entities[i];}
        }
        return null;
    }

    static getEntitiesAtMap(x, y) {
        return entities.filter(e => e.mapX === x && e.mapY === y);
    }

    setDepthFromBottom(offset=null)
    {
        if(offset != null)
        {
            super.setDepthFromBottom(offset);
            return;
        }
        if(this.features != null && this.features.depthOffset != null)
        {
            super.setDepthFromBottom(this.features.depthOffset);
        }
        else if(this.config != null && this.config.depthOffset != null)
        {
            super.setDepthFromBottom(this.config.depthOffset);
        }
        else
        {
            super.setDepthFromBottom(-16);
        }
    }

    start(showStart=true)
    {
        if(showStart){
            this.tween = this.scene.tweens.add({
                targets: this,
                scale: {start: 0, to: this.config.scale},
                ease: 'Linear',
                duration: 400,
                yoyo: false,
                repeat: 0,
                paused: true,
                onComplete: function(){ this.targets[0].onStartComplete(this.targets[0]); },
            });
            this.tween.play();
        }
        else{
            this.scale = this.config.scale;
            this.onStartComplete(this);
        }
    }

    onStartComplete(obj)
    {
    }

    stop()
    {
        this.anims.stop();
    }

    die()
    {
        this.stop();
        entities.splice(entities.indexOf(this),1);
        this.destroy();
    }

    setVisability(visible)
    {
        this.visible = visible;
    }

    getVisability()
    {
        return this.visible;
    }

    transformFeatures(unit, features)
    {
        if(this.features.hasOwnProperty('tfStrength'))
        {
            features.strength = Math.round(this.features.tfStrength * features.strength);
            if(features.strength < 1.0) features.strength = 1.0;
        }
        if(this.features.hasOwnProperty('tfDefense'))
        {
            features.defense = Math.round(this.features.tfDefense * features.defense);
            if(features.defense < 1.0) features.defense = 1.0;
        }
        return features;
    }

    evaluateStep(unit)
    {
        return 1;
    }

    onBeforeStepIn(unit, callback=null)
    {
        return true;
    }

    onStepIn(unit)
    {
        return null;
    }

    onStepOut(unit, callback=null)
    {
        return true;
    }

    makeMove()
    {
        this.moved = true;
        GameFlowWatchdog.touch('entity_move',{
            name:this.config ? this.config.name : null,
            x:this.mapX,
            y:this.mapY
        });
    }

    endMove()
    {
        GameFlowWatchdog.touch('entity_end',{
            name:this.config ? this.config.name : null,
            x:this.mapX,
            y:this.mapY
        });
        moveEntites();
    }

    canUse(unit)
    {
        return false;
    }

    use(unit)
    {
        return false;
    }

}

class WebEntity extends Entity
{
    constructor(scene, x, y, visible=true)
    {
        super(entityConfigs['web'], scene, x, y, visible);
    }

    static create(scene, x, y, visible=true)
    {
        return new WebEntity(scene, x, y, visible);
    }
  
    start(showStart=true)
    {
        super.start(showStart);
        this.setDepthFromBottom();
    }

    setDepthFromBottom(offset=null)
    {
        if(offset != null)
        {
            super.setDepthFromBottom(offset);
            return;
        }
        let unitAtPos = getUnitAtMap(this.mapX, this.mapY);
        if(unitAtPos && unitAtPos.features.webImmunity !== true)
        {
            super.setDepthFromBottom(2);
        }
        else
        {
            super.setDepthFromBottom(-16);
        }
    }

    onCallback()
    {
        cam.stopFollow();
    }

    transformFeatures(unit, features)
    {
        if(unit.features.webImmunity === true)
        {
            return features;
        }
        else
        {
            return super.transformFeatures(unit, features);
        }
    }

    evaluateStep(unit)
    {
        if(unit.features.webImmunity === true)
        {
            return 1;
        }
        else
        {
            return (unit.features.strength + this.features.strength)/unit.features.strength;
        }
    }

    onStepIn(unit)
    {
        if(unit.features.webImmunity !== true)
        {
            unit.features.move = 0;
        }
        this.setDepthFromBottom();
        return null;
    }

    onStepOut(unit, callback=null)
    {
        if(unit.features.webImmunity === true)
        {
            this.setDepthFromBottom();
            return true;
        }
        
        unit.features.move = 0;
        let config = null;
        if(Math.random() <= unit.features.strength/(unit.features.strength + this.features.strength))
        {
            config = {hit: true, damaged: false, killed: true};
        }
        else
        {
            config = {hit: true, damaged: false, killed: false};
        }
        if(shouldShowActionAnimation(unit))
        {
            hideArrows();
            cam.startFollow(this);
            var lm = new LossesAnimationManager(this.scene, 200, 200);
            lm.playAt(this.x,this.y,this,() => { cam.stopFollow(); callback(false); },null,config);
            return null;
        }
        else
        {  
            if(config.killed) this.die();
            return false;
        }
    }

    makeMove()
    {
        super.makeMove();
        super.endMove();
    }

}

class FireEntity extends Entity
{
    atackQueue = [];

    constructor(scene, x, y, visible=true)
    {
        super(entityConfigs['fire'], scene, x, y, visible);
        this.initAnimations();
    }

    static create(scene, x, y, visible=true)
    {
        return new FireEntity(scene, x, y, visible);
    }
  
    initAnimations()
    {
        this.scene.anims.create({
            key: this.config.sprite+'idle',
            frames: this.scene.anims.generateFrameNumbers(this.config.sprite),
            frameRate: 14,
            repeat: -1
        });
    }
  
    start(showStart=true)
    {
        this.anims.play(this.config.sprite+'idle', true);
        super.start(showStart);
    }

    onCallback()
    {
        cam.stopFollow();
        this.atack();
    }

    evaluateStep(unit)
    {
        return 100;
    }

    onStepIn(unit)
    {
        unit.features.health--;
        let killed = false;
        if(unit.features.health <= 0) killed = true;
        let resultState = {hit: false, damaged: true, killed: false};
        if(killed) resultState.killed = true;
        return resultState;
    }

    atack()
    {
        if(this.atackQueue.length > 0)
        {
            let unit = this.atackQueue.pop();
            unit.features.health--;
            let killed = false;
            if(unit.features.health <= 0) killed = true;
            if(gameSettings.showEnemyMoves == true)
            {
                let config = {hit: false, damaged: true, killed: false};
                if(killed) config.killed = true;
                cam.startFollow(unit);
                let lm = new LossesAnimationManager(this.scene, 200, 200);
                lm.playAt(unit.x,unit.y,unit,this,null,config);
            }
            else
            {
                if(killed)unit.die(); 
                this.atack();  
            }
        }
        else
        {
            super.endMove();
        }
    }

    burnEntities(ents = null)
    {
        if(!ents) ents = Entity.getEntitiesAtMap(this.mapX, this.mapY);
        if (ents && ents.length > 0) {
            for (let ent of ents) {
                if(ent.config.name !== 'fire' && ent.config.name !== 'glue_blob' && ent.config.name !== 'pentagram' && ent.config.name !== 'frog')
                {
                    ent.die();
                    break;
                }
            }
        }
    }

    propagation()
    {
        this.atackQueue = [];
        let unitAtPos = getUnitAtMap(this.mapX,this.mapY);
        if(unitAtPos!=null) this.atackQueue.push(unitAtPos);
        this.burnEntities()
        for(let y=this.mapY-1;y<=this.mapY+1;y++)
            for(let x=this.mapX-1;x<=this.mapX+1;x++)
            {
                if((x<0)||(x>=map.width)||(y<0)||(y>=map.height)||( (x===this.mapX)&&(y===this.mapY) ))continue;
                if(Math.random() < this.features.propagation)
                {
                    let wallTile = wallsLayer.getTileAt(x,y);
                    if(wallTile != null)
                    {
                        if(wallTile.properties['collides'] === true) continue;
                    }
                    const ents = Entity.getEntitiesAtMap(x, y) || [];
                    if(ents.some(ent => ent.config.name === 'fire')) continue;
                    let fire = new FireEntity(this.scene,0,0,(gameSettings.showEnemyMoves == true));
                    fire.moved = true;
                    fire.setPositionFromMap(x, y);
                    fire.features.propagation=this.features.propagation*this.features.slowdown;
                    fire.start();
                    entities.push(fire);
                    unitAtPos = getUnitAtMap(x,y);
                    if(unitAtPos!=null) this.atackQueue.push(unitAtPos);
                    fire.burnEntities(ents);
                }
            }
    }

    makeMove()
    {
        super.makeMove();
        if(Math.random() > this.features.survival) this.features.health--;
        if(this.features.health <= 0)
        {
            this.die();
        }
        else
        {
            this.propagation();
        }
        if(this.atackQueue.length > 0)
        {
            this.atack();
        }
        else
        {
            super.endMove();
        }
    }

}

class GlueBlobEntity extends Entity
{
    constructor(scene, x, y, visible=true)
    {
        super(entityConfigs['glue_blob'], scene, x, y, visible);
        this.angle = randomInt(-180,180);
        this.setFrame(randomInt(1,2));
    }

    static create(scene, x, y, visible=true)
    {
        return new GlueBlobEntity(scene, x, y, visible);
    }

    onCallback()
    {
        cam.stopFollow();
        this.atack();
    }

    onStartComplete(obj)
    {
        obj.tween = obj.scene.tweens.add({
            targets: obj,
            scale: {start: obj.config.scale, to: obj.config.scale*0.9},
            ease: 'Linear',
            duration: 400,
            yoyo: true,
            repeat: -1,
            paused: true,
        });
        obj.tween.play();
    }

    stop()
    {
        if(this.tween!=null)this.tween.stop();
    }

    evaluateStep(unit)
    {
        return (unit.features.strength + this.features.strength)/unit.features.strength;
    }

    onStepIn(unit)
    {
        unit.features.move = 0;
        return null;
    }

    onStepOut(unit, callback=null)
    {
        unit.features.move = 0;
        let config = null;
        if(Math.random() <= unit.features.strength/(unit.features.strength + this.features.strength))
        {
            config = {hit: true, damaged: false, killed: true};
        }
        else
        {
            config = {hit: true, damaged: false, killed: false};
        }
        if(shouldShowActionAnimation(unit))
        {
            hideArrows();
            cam.startFollow(this);
            let lm = new LossesAnimationManager(this.scene, 200, 200);
            lm.playAt(this.x,this.y,this,null,null,config);
        }
        else
        {  
            if(config.killed) this.die();
        }
        return false;
    }

    propagation()
    {
        let unitAtPos = getUnitAtMap(this.mapX,this.mapY);
        for(let y=this.mapY-1;y<=this.mapY+1;y++)
            for(let x=this.mapX-1;x<=this.mapX+1;x++)
            {
                if((x<0)||(x>=map.width)||(y<0)||(y>=map.height)||( (x===this.mapX)&&(y===this.mapY) ))continue;
                if(Math.random() <= this.features.propagation)
                {
                    var wallTile = wallsLayer.getTileAt(x,y);
                    if(wallTile != null)
                    {
                        if(wallTile.properties['collides'] === true) continue;
                    }
                    var entity = Entity.getEntityAtMap(x,y);
                    if(entity != null) continue;
                    let blob = new GlueBlobEntity(this.scene,0,0,(gameSettings.showEnemyMoves == true));
                    blob.moved = true;
                    blob.setPositionFromMap(x, y);
                    blob.features.propagation=this.features.propagation*this.features.slowdown;
                    blob.start();
                    entities.push(blob);
                }
            }
    }

    makeMove()
    {
        super.makeMove();
        if(Math.random() > this.features.survival) this.features.health--;
        if(this.features.health <= 0)
        {
            this.die();
        }
        else
        {
            this.propagation();
        }
        super.endMove();
    }

}


class PentagramEntity extends Entity
{
    wizard = null;

    constructor(scene, x, y, visible=true)
    {
        super(entityConfigs['pentagram'], scene, x, y, visible);
        this.setOrigin(0.5,0.5);
    }

    static create(scene, x, y, visible=true)
    {
        return new PentagramEntity(scene, x, y, visible);
    }

    start(showStart=true)
    {
        this.scale = this.config.scale;
	    this.setDepthFromBottom();
	    let unitAtPos = getUnitAtMap(this.mapX,this.mapY);
	    if(unitAtPos && unitAtPos.config.name === 'wizard') this.wizard = unitAtPos;
    }

    onCallback()
    {
        cam.stopFollow();
    }

    transformFeatures(unit, features)
    {
        return features;
    }

    onStepIn(unit)
    {
        if(unit.config.name === 'wizard') this.wizard = unit;
        return null;
    }

    onStepOut(unit, callback=null)
    {
        this.wizard = null;
        this.features.time = 0;
        return true;
    }

    makeMove()
    {
        if(this.wizard != null)
        {
            this.features.time++;
            if(this.features.time >= this.features.rewardFrequency)
            {
                this.features.time = 0;
                this.wizard.features.mana = this.wizard.features.mana + this.features.mana;
            }
        }
        super.makeMove();
        super.endMove();
    }

}


class FrogEntity extends Entity
{ 
    constructor(scene, x, y, visible=true, central=true, showtween=false)
    {
        super(entityConfigs['frog'], scene, x, y, visible);
        this.angle = randomInt(-180,180);
        this.alpha = this.features.alpha;
        this.setOrigin(0.5,0.5);
        if(!showtween){
            this.active = false;
            this.visible = false;
        }
        this.features.central = central;
        this.features.showtween = showtween;
    }

    static create(scene, x, y, visible=true, central=true, showtween=false)
    {
        return new FrogEntity(scene, x, y, visible, central, showtween);
    }
  
    start(showStart=true)
    {
        if(this.features.central) this.features.showtween = true;
        if(!this.features.showtween){
            this.active = false;
            this.visible = false;
            super.start(false);
        }
        else{
            this.active = true;
            this.visible = shouldShowActionAnimation();
            super.start(showStart);
        }
    }

    setDepthFromBottom(offset=0)
    {
        this.setDepth(10000);
    }

    onCallback()
    {
        cam.stopFollow();
    }
    
    onStartComplete(obj)
    {
        if(obj.features.central)
        {
            for(let y=obj.mapY-2;y<=obj.mapY+2;y++)
                for(let x=obj.mapX-2;x<=obj.mapX+2;x++)
                {
                    if((x<0)||(x>=map.width)||(y<0)||(y>=map.height)||( (x===this.mapX)&&(y===this.mapY) ))continue;
                    let dx = obj.mapX - x;
                    let dy = obj.mapY - y
                    if(dx*dx+dy*dy > 4)continue;
                    let frogtween = true;
                    if(Math.abs(dx) >=2 || Math.abs(dy) >= 2)frogtween = false;
                    let entity = Entity.getEntityAtMap(x,y);
                    if(entity != null)if(entity.config.name === 'frog')continue;
                    let frog = new FrogEntity(this.scene,0,0,shouldShowActionAnimation(),false,frogtween);
                    let d2 = dx*dx+dy*dy;
                    if(d2>2) frog.features.health = frog.features.health - 2;
                    else if(d2>0) frog.features.health = frog.features.health - 1;
                    frog.setPositionFromMap(x, y);
                    frog.start();
                    entities.push(frog);
            }
            obj.features.central = false;
        }
        if(obj.features.showtween)
        { 
            obj.tween = obj.scene.tweens.add({
                targets: obj,
                depth: 9000,
                angle: {start: obj.angle, to: obj.angle + 360},
                ease: 'Linear',
                duration: randomInt(20000,30000),
                yoyo: false,
                repeat: -1,
                paused: true,
            });
           obj.tween.play();
        }
    }

    stop()
    {
        if(this.tween!=null)this.tween.stop();
    }

    transformFeatures(unit, features)
    {
        return features;
    }

    onStepIn(unit)
    {
        return null;
    }

    onStepOut(unit, callback=null)
    {
        return true;
    }

    makeMove()
    {
        super.makeMove();
        this.features.health--;
        if(this.features.health <= 0)
        {
            this.die();
        }
        else
        {
            if(this.features.health < 3 && this.features.showtween){
                this.features.alpha = 0.75 * this.features.alpha
                this.alpha = this.features.alpha;
            }
        }
        super.endMove();
    }

}


function finishUseAction(callbackObject, result)
{
	if(callbackObject != null && typeof callbackObject.onUseComplete === 'function')
	{
		callbackObject.onUseComplete(result);
	}
}

function playDoorToggleEffect(door, nextOpen, onComplete=null)
{
	if(!shouldShowActionAnimation())
	{
		door.features.open = nextOpen;
		door.updateSprite();
		if(onComplete != null) onComplete();
		return;
	}
	const scene = door.scene;
	const prevAlpha = door.alpha;
	const prevDepth = door.depth;
	const oldFrame = door.getFrameIndex();
	const oldOpen = door.features.open;
	door.features.open = nextOpen;
	const newFrame = door.getFrameIndex();
	door.features.open = oldOpen;
	const overlay = scene.add.sprite(door.x,door.y,door.texture.key,newFrame);
	overlay.setOrigin(door.originX,door.originY);
	overlay.setDisplayOrigin(door.displayOriginX,door.displayOriginY);
	overlay.setScale(door.scaleX,door.scaleY);
	overlay.setRotation(door.rotation);
	overlay.setFlip(door.flipX,door.flipY);
	overlay.setDepth(prevDepth+0.01);
	overlay.setAlpha(0);
	door.setFrame(oldFrame);
	door.setAlpha(prevAlpha);
	let doorTween = null;
	let overlayTween = null;
	const finishState = () =>
	{
		if(overlay.active !== false) overlay.destroy();
		door.features.open = nextOpen;
		door.updateSprite();
		door.setAlpha(prevAlpha);
	};

	const finish = AsyncGuard.wrap(
		'door_toggle',
		() =>
		{
			finishState();
			if(onComplete != null) onComplete();
		},
		{
			timeoutMs: 1500,
			data: {
				x: door.mapX,
				y: door.mapY,
				open: nextOpen
			},
			onTimeout: () =>
			{
				if(doorTween != null) doorTween.stop();
				if(overlayTween != null) overlayTween.stop();
			}
		}
	);

	doorTween = scene.tweens.add({
		targets: door,
		alpha: 0,
		duration: 340,
		ease: 'Linear'
	});
	overlayTween = scene.tweens.add({
		targets: overlay,
		alpha: prevAlpha,
		duration: 340,
		ease: 'Linear',
		onComplete: finish
	});
}

class DoorEntity extends Entity
{
    constructor(scene, x, y, visible=true)
    {
        super(entityConfigs['door'], scene, x, y, visible);
        //this.setOrigin(0.5, 0.5);
        //this.setDisplayOrigin(13, 18);
        this.updateSprite();
    }

    static create(scene, x, y, visible=true)
    {
        return new DoorEntity(scene, x, y, visible);
    }

    start(showStart=true)
    {
        this.scale = this.config.scale;
        this.setDepthFromBottom(-4.1);
        this.updateSprite();
    }

    setVisability(visible)
    {
        this.features.visible = visible;
        this.updateSprite();
        this.visible = true;
    }

    getVisability()
    {
        return this.features.visible;
    }

    setDepthFromBottom(offset=null)
    {
        if(offset != null || this.hasOwnProperty('features') == false || this.features.hasOwnProperty('direction') == false)
        {
            super.setDepthFromBottom(offset);
            return;
        }
        if(this.features.direction === 'W' || this.features.direction === 'E')
        {
            super.setDepthFromBottom(-16.0);
        }
        else
        {
            super.setDepthFromBottom(-4.1);
        }
    }

    getFrameIndex()
    {
        const dir = this.features.direction;;
        let base = 0;
        switch(dir)
        {
            case 'W': base = 0; break;
            case 'N': base = 2; break;
            case 'E': base = 4; break;
            case 'S': base = 6; break;
        }
        return base + (this.features.open && this.features.visible ? 1 : 0);
    }

    updateSprite()
    {
        this.setFrame(this.getFrameIndex());
        this.setDepthFromBottom(); 
        this.setAlpha(this.features.visible ? 1 : 0.5);
        this.features.blocksLOS = !this.features.open;
    }

    open()
    {
        if(this.features.open) return;
        this.features.open = true;
        this.updateSprite();
    }

    close()
    {
        if(!this.features.open) return;
        this.features.open = false;
        this.updateSprite();
    }

    onBeforeStepIn(unit, callback=null)
    {
        if(this.features.open) return true;

        playDoorToggleEffect(this, true, () =>
        {
            if(callback != null) callback(true);
        });

        return null;
    }

    onStepIn(unit)
    {
        return null;
    }

    onStepOut(unit, callback=null)
    {
        return true;
    }

    transformFeatures(unit, features)
    {
        return features;
    }

    makeMove()
    {
        if (this.features.open && getUnitAtMap(this.mapX, this.mapY) == null) this.close();
        super.makeMove();
        super.endMove();
    }

    getUseCost(unit)
    {
        return {
            abilityPointCost: 0,
            movePointCost: 1
        };
    }

    canUse(unit)
    {
        if(unit == null) return false;
        const dx = Math.abs(this.mapX - unit.mapX);
        const dy = Math.abs(this.mapY - unit.mapY);
        if(dx > 1 || dy > 1) return false;
        if(dx === 0 && dy === 0) return false;
        if(this.features.open)
        {
            return getUnitAtMap(this.mapX, this.mapY) == null;
        }
        return true;
    }

	use(unit, context = {}, callbackObject = null)
	{
		if(!this.canUse(unit))
		{
			finishUseAction(callbackObject, {
				success: false,
                abilityPointCost: 0,
                movePointCost: 0
			});
			return false;
		}

		const nextOpen = !this.features.open;

		playDoorToggleEffect(this, nextOpen, () =>
		{
			finishUseAction(callbackObject, {
                success: true,
                abilityPointCost: 0,
                movePointCost: 1
			});
		});

		return false;
	}
}


//---------------------------- Monster generator entity ----------------------------
class MonsterGeneratorEntity extends Entity
{
	constructor(scene, x, y, visible=true)
	{
		super(entityConfigs['monster_generator'], scene, x, y, visible);
		this.normalizeGeneratorFeatures();
	}

	static create(scene, x, y, visible=true)
	{
		return new MonsterGeneratorEntity(scene, x, y, visible);
	}

	normalizeGeneratorFeatures()
	{
		if(this.features.generatorId === undefined) this.features.generatorId = null;
		if(this.features.generator === undefined) this.features.generator = null;
		if(this.features.passable == null) this.features.passable = true;
		if(this.features.stepCost == null) this.features.stepCost = 1;
		const generator = this.features.generator;
		if(generator == null) return;
		if(generator.spawnedTotal == null) generator.spawnedTotal = 0;
		if(generator.cooldownLeft == null) generator.cooldownLeft = 0;
	}

	ensureGeneratorId()
	{
		if(this.features.generatorId == null)
		{
			// Generator entities occupy unique map cells, therefore their coordinates provide a simple persistent identifier.
			this.features.generatorId = 'monster_generator:' + this.mapX + ':' + this.mapY;
        }
		return this.features.generatorId;
	}

	getVisualScale()
	{
		const scale = Number(this.features.visualScale);
		if(Number.isFinite(scale) && scale > 0) return scale;
		return this.config.scale;
	}

	applyVisualConfig()
	{
		const spriteKey = this.features.visualSprite || this.config.sprite;
		const frame = this.features.visualFrame;
		if(spriteKey != null && this.scene != null && this.scene.textures != null && this.scene.textures.exists(spriteKey))
		{
			if(frame != null) this.setTexture(spriteKey,frame);
			else this.setTexture(spriteKey);
		}
		else if(spriteKey != null) console.warn('MonsterGeneratorEntity: texture "' + spriteKey + '" was not loaded.');
		const scale = this.getVisualScale();
		const originMode = this.features.visualOriginMode || 'center';
		if(originMode === 'center') this.setOrigin(0.5, 0.5);
		else if(originMode === 'base')
		{
			const scaledHeight = this.height * scale;
			if(scaledHeight > 16) this.setOrigin(0.5, 1 - (0.5 * 16 / scaledHeight));
			else this.setOrigin(0.5, 0.5);
		}
		this.setDepthFromBottom();
	}

	start(showStart=true)
	{
		this.normalizeGeneratorFeatures();
		this.ensureGeneratorId();
		this.applyVisualConfig();
		const targetScale = this.getVisualScale();
		if(showStart)
		{
			this.setScale(0);
			this.tween = this.scene.tweens.add({
					targets: this,
					scale: {start: 0, to: targetScale},
					ease: 'Linear',
					duration: 400,
					yoyo: false,
					repeat: 0,
					onComplete: () => {this.onStartComplete(this);}
                });
			return;
		}
		this.setScale(targetScale);
		this.setDepthFromBottom();
		this.onStartComplete(this);
	}

	onBeforeStepIn(unit, callback=null)
	{
		return this.features.passable === true;
	}

	evaluateStep(unit)
	{
		if(this.features.passable !== true) return 10000;
		const stepCost = Number(this.features.stepCost);
		if(!Number.isFinite(stepCost) || stepCost <= 0) return 1;
		return stepCost;
	}

	getGeneratorConfig()
	{
		this.normalizeGeneratorFeatures();
		const generator = this.features.generator;
		if(generator == null || typeof generator !== 'object') return null;
		return generator;
	}

	getAliveSpawnedCount()
	{
		const generatorId = this.ensureGeneratorId();
		let result = 0;
		for(let i = 0; i < units.length; i++)
		{
			const unit = units[i];
			if(unit == null || unit.features == null) continue;
			if(unit.features.spawnSourceId === generatorId) result++;
		}
		return result;
	}

	getNumericLimit(value)
	{
		if(value == null) return Infinity;
		const number = Number(value);
		if(!Number.isFinite(number)) return Infinity;
		return Math.max(0, Math.floor(number));
	}

	getSpawnCapacity(generator)
	{
		let capacity = Infinity;
		const maxAlive = this.getNumericLimit(generator.maxAlive);
		if(Number.isFinite(maxAlive)) capacity = Math.min(capacity, Math.max(0, maxAlive - this.getAliveSpawnedCount()));
		const maxTotal = this.getNumericLimit(generator.maxTotal);
		if(Number.isFinite(maxTotal)) capacity = Math.min(capacity, Math.max(0, maxTotal - (generator.spawnedTotal || 0)));
		return capacity;
	}

	getValidUnitProfiles(generator)
	{
		if(generator == null || !Array.isArray(generator.units))return [];
		const result = [];
		for(let i = 0; i < generator.units.length; i++)
		{
			const profile = generator.units[i];
			if(profile == null) continue;
			if(typeof profile.configName !== 'string') continue;
			if(unitConfigs[profile.configName] == null)
			{
				console.warn('MonsterGeneratorEntity: unknown unit "' + profile.configName + '".');
				continue;
			}
			let weight = Number(profile.weight);
			if(!Number.isFinite(weight)) weight = 1;
			if(weight <= 0) continue;
			result.push({profile: profile, weight: weight});
		}
		return result;
	}

	chooseUnitProfile(generator)
	{
		const profiles = this.getValidUnitProfiles(generator);
		if(profiles.length <= 0) return null;
		let totalWeight = 0;
		for(let i = 0; i < profiles.length; i++) totalWeight += profiles[i].weight;
		if(totalWeight <= 0) return null;
		let roll = Math.random() * totalWeight;
		for(let i = 0; i < profiles.length; i++)
		{
			roll -= profiles[i].weight;
			if(roll <= 0) return profiles[i].profile;
		}
		return profiles[profiles.length - 1].profile;
	}

	getSpawnChance(generator)
	{
		const chance = Number(generator.spawnChance);
		if(!Number.isFinite(chance)) return 0;
		return Math.max(0,Math.min(1,chance));
	}

	createSpawnerConfig(generator, profile, capacity)
	{
		let minCount = Math.max(1, Math.floor(generator.minCount != null ? generator.minCount : 1));
		let maxCount = Math.max(minCount, Math.floor(generator.maxCount != null ? generator.maxCount : minCount));
		if(Number.isFinite(capacity))
		{
			maxCount = Math.min(maxCount, capacity);
			minCount = Math.min(minCount, maxCount);
		}
		return {
			minCount: minCount,
			maxCount: maxCount,
			//The generator has already selected one weighted unit profile. The whole batch therefore consists of this unit type.
			monsterTypes: [profile.configName],
			sameTypePerBatch: true,
			factionId: generator.factionId || 'dungeon_creatures',
			minSpawnRadius: generator.minSpawnRadius != null ? generator.minSpawnRadius : 1,
			spawnRadius: generator.spawnRadius != null ? generator.spawnRadius : 2,
            allowPassableEntityCells: generator.allowPassableEntityCells === true,
			behavior: clone(profile.behavior || {type: 'idle'}),
			spawnEffect: clone(profile.spawnEffect || generator.spawnEffect || null),
			spawnSourceId: this.ensureGeneratorId()
        };
	}

	makeMove()
	{
		super.makeMove();
		const generator = this.getGeneratorConfig();
		if(generator == null || generator.enabled === false)
		{
			super.endMove();
			return;
		}
		// Cooldown is measured in full entity phases, i.e. game rounds.
		if(generator.cooldownLeft > 0)
		{
			generator.cooldownLeft--;
			super.endMove();
			return;
		}
		const capacity = this.getSpawnCapacity(generator);
		if(capacity <= 0)
		{
			super.endMove();
			return;
		}
		const spawnChance = this.getSpawnChance(generator);
		if(spawnChance <= 0 || Math.random() >= spawnChance)
		{
			super.endMove();
			return;
		}
		const profile = this.chooseUnitProfile(generator);
		if(profile == null)
		{
			super.endMove();
			return;
		}
		const spawnConfig = this.createSpawnerConfig(generator, profile, capacity);
		if(spawnConfig.maxCount <= 0)
		{
			super.endMove();
			return;
		}
		// MonsterSpawner owns cell selection, independent-player creation and spawn animation.
        // The entity phase continues only after the complete animation batch has finished.
        const finishSpawn = AsyncGuard.wrap(
            'monster_generator_spawn',
            result =>
            {
                const spawnedCount = result != null && Array.isArray(result.spawnedUnits) ? result.spawnedUnits.length : 0;
                if(spawnedCount > 0)
                {
                    generator.spawnedTotal = (generator.spawnedTotal || 0)+spawnedCount;
                    generator.cooldownLeft = Math.max(0,Math.floor(generator.cooldownRounds != null ? generator.cooldownRounds : 0));
                }
                super.endMove();
            },
            {
                timeoutMs: 8000,
                data: {
                    x: this.mapX,
                    y: this.mapY,
                    generatorId: this.features.generatorId
                }
            }
        );

        MonsterSpawner.spawn({source:this,scene:this.scene,config:spawnConfig},finishSpawn);
	}
}


class MushroomEntity extends Entity
{

    constructor(scene, x, y, visible=true)
    {
        super(entityConfigs['mushroom'], scene, x, y, visible);
        this.setOrigin(0.5,0.5);
    }

    static create(scene, x, y, visible=true)
    {
        return new MushroomEntity(scene, x, y, visible);
    }
  
    start(showStart=true)
    {
        this.setFrame(3);  
        this.scale = this.config.scale / 4;
    }

    onCallback()
    {
        cam.stopFollow();
    }

    transformFeatures(unit, features)
    {
        return features;
    }

    onStepIn(unit)
    {
        if(unit.config.name === 'wizard')
        {
            //this.wizard = unit;
        }
        return null;
    }

    onStepOut(unit, callback=null)
    {
        return true;
    }

    makeMove()
    {
        //let frameInd = this.frame.name+1;
        //if(frameInd>this.texture.frameTotal)frameInd=0;
        //this.setFrame(frameInd); 
        if(this.scale < this.config.scale)
        {
            let scl = this.scale + this.config.scale / 4;
            this.scale = scl;
        }
        super.makeMove();
        super.endMove();
    }

}