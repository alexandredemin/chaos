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

    transformFeatures(unit, features)
    {
        features.strength = Math.round(this.features.tfStrength * features.strength);
        if(features.strength < 1.0)features.strength=1.0;
        features.defense = Math.round(this.features.tfDefense * features.defense);
        if(features.defense < 1.0)features.defense=1.0;
        return features;
    }

    evaluateStep(unit)
    {
        return 1;
    }

    onStepIn(unit)
    {
        return null;
    }

    onStepOut(unit)
    {
        return true;
    }

    makeMove()
    {
        this.moved = true;
    }

    endMove()
    {
        moveEntites();
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
        let unitAtPos = getUnitAtMap(this.mapX,this.mapY);
        if(unitAtPos && unitAtPos.features.webImmunity !== true) this.zOffset = 2;
        else this.zOffset = 0;
        this.setDepth(this.mapY);
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
            this.zOffset = 2;
        }
        else
        {
            this.zOffset = 0;
        }
        this.setDepth(this.mapY);
        return null;
    }

    onStepOut(unit)
    {
        if(unit.features.webImmunity !== true)
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
            if(gameSettings.showEnemyMoves == true || players[playerInd].control === PlayerControl.human)
            {
                hideArrows();
                cam.startFollow(this);
                var lm = new LossesAnimationManager(this.scene, 200, 200);
                lm.playAt(this.x,this.y,this,null,null,config);
            }
            else
            {  
                if(config.killed) this.die();
            }
            return false;
        }
        else
        {
            this.zOffset = 0;
            this.setDepth(this.mapY);
        }
        return true;
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
                        //if(wallTile.properties['collides'] == true)
                        continue;
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

    onStepOut(unit)
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
        if(gameSettings.showEnemyMoves == true || players[playerInd].control === PlayerControl.human)
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
                        //if(wallTile.properties['collides'] == true)
                        continue;
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

    onStepOut(unit)
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
            this.visible = (gameSettings.showEnemyMoves == true || players[playerInd].control === PlayerControl.human);
            super.start(showStart);
        }
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
                    let frog = new FrogEntity(this.scene,0,0,(gameSettings.showEnemyMoves == true || players[playerInd].control === PlayerControl.human),false,frogtween);
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

    onStepOut(unit)
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
        this.scale = this.config.scale
        this.zOffset = 0;
        this.setDepth(this.mapY);
        this.updateSprite();
    }

    getFrameIndex()
    {
        const dir = this.features.direction;
        const open = this.features.open;
        let base = 0;
        switch(dir)
        {
            case 'W': base = 0; break;
            case 'N': base = 2; break;
            case 'E': base = 4; break;
            case 'S': base = 6; break;
        }
        return base + (open ? 1 : 0);
    }

    updateSprite()
    {
        this.setFrame(this.getFrameIndex());
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

    onStepIn(unit)
    {
        this.open();
        return null;
    }

    onStepOut(unit)
    {
        //this.close();
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

    onStepOut(unit)
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