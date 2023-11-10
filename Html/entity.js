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
        this.initAnimations();
    }

    static getEntityAtMap(mapX, mapY)
    {
        for(let i=0; i<entities.length; i++)
        {
            if((entities[i].mapX === mapX) && (entities[i].mapY === mapY)){return entities[i];}
        }
        return null;
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

    start()
    {
        if(gameSettings.showEnemyMoves == true)
        {
            this.anims.play(this.config.sprite+'idle', true);
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
        else
        {
            this.scale = this.config.scale
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

    onCallback()
    {
        cam.stopFollow();
    }

    transformFeatures(unit, features)
    {
        if(unit.config.name === 'spider')
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
        if(unit.config.name === 'spider')
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
        if(unit.config.name !== 'spider')
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
        if(unit.config.name !== 'spider')
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
                lm.playAt(this.x,this.y,this,null,config);
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
    }

    static create(scene, x, y, visible=true)
    {
        return new FireEntity(scene, x, y, visible);
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
                lm.playAt(unit.x,unit.y,unit,this,config);
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

    propagation()
    {
        this.atackQueue = [];
        let unitAtPos = getUnitAtMap(this.mapX,this.mapY);
        if(unitAtPos!=null) this.atackQueue.push(unitAtPos);
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
                    let entity = Entity.getEntityAtMap(x,y);
                    if(entity != null)
                    {
                        if(entity.config.name === 'fire')
                        {
                            continue;
                        }
                        else
                        {
                            entity.die();
                            console.log('die '+entity.config.name);
                        }
                    }
                    let fire = new FireEntity(this.scene,0,0,(gameSettings.showEnemyMoves == true));
                    fire.moved = true;
                    fire.setPositionFromMap(x, y);
                    fire.features.propagation=this.features.propagation*this.features.slowdown;
                    fire.start();
                    entities.push(fire);
                    unitAtPos = getUnitAtMap(x,y);
                    if(unitAtPos!=null) this.atackQueue.push(unitAtPos);
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
        let configs = [entityConfigs['glue_blob1'],entityConfigs['glue_blob2']];
        super(configs[randomInt(0,configs.length-1)], scene, x, y, visible);
        this.angle = randomInt(-180,180);
        this.id = randomInt(1,1000000);
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
            lm.playAt(this.x,this.y,this,null,config);
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
    time = 0;

    constructor(scene, x, y, visible=true)
    {
        super(entityConfigs['pentagram'], scene, x, y, visible);
        this.setOrigin(0.5,0.5);
    }

    static create(scene, x, y, visible=true)
    {
        return new PentagramEntity(scene, x, y, visible);
    }

    start()
    {
        this.scale = this.config.scale;
        let unitAtPos = getUnitAtMap(this.mapX,this.mapY);
        if(unitAtPos.config.name === 'wizard') this.wizard = unitAtPos;
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
        this.time = 0;
        return true;
    }

    makeMove()
    {
        if(this.wizard != null)
        {
            this.time++;
            if(this.time >= this.features.rewardFrequency)
            {
                this.time = 0;
                this.wizard.features.mana = this.wizard.features.mana + this.features.mana;
            }
        }
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
  
    start()
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