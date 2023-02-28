//---------------------------- Animation classes ----------------------------

class LossesAnimationManager
{
    animationQueue = [];
    hitAnimation = null;
    damageAnimation = null;
    disappearanceAnimation = null;
    callbackObject = null;
    unit = null;

    constructor(scene, x, y)
    {
        this.hitAnimation = new HitAnimation(scene, x, y);
        this.damageAnimation = new DamageAnimation(scene, x, y);
        this.disappearanceAnimation = new DisappearanceAnimation(scene, x, y);
    }

    onCallback()
    {
        this.animateLosses();
    }

    animateLosses()
    {
        if(this.animationQueue.length > 0)
        {
            let anim = this.animationQueue.pop();
            anim.playAt(this.unit.x,this.unit.y,this.unit,this);
        }
        else
        {
            if(this.callbackObject != null)
            {
                this.callbackObject.onCallback();
            }
        }
    }

    playAt(x,y,unit,callbackObject,config)
    {
        this.callbackObject = callbackObject;
        this.unit = unit;
        if(config.killed) this.animationQueue.push(this.disappearanceAnimation);
        if(config.damaged) this.animationQueue.push(this.damageAnimation);
        if(config.hit) this.animationQueue.push(this.hitAnimation);
        this.animateLosses();
    }


}

class HitAnimation extends Phaser.GameObjects.RenderTexture
{
    tween = null;
    static Object;

    callbackObject = null;
    unit = null;

    constructor(scene, x, y)
    {
        super(scene, x, y, 128, 128);
        this.setDepth(10000);
        let circle = scene.add.circle(x, y, 64, 0xFFFFFF);
        let circle2 = scene.add.circle(x, y, 48, 0x000000);
        circle.setVisible(false);
        circle2.setVisible(false);
        this.setOrigin(0.5, 0.5);
        this.clear();
        this.draw(circle,0.5*circle.width,0.5*circle.height);
        this.erase(circle2,0.5*circle.width,0.5*circle.height);
        this.setScale(0);
        circle.destroy();
        circle2.destroy();
        this.setActive(false).setVisible(false);
        scene.add.existing(this);
        this.tween = scene.tweens.add({
            targets: this,
            alpha: { start: 0, to: 1 },
            scale: {start: 0, to: 0.125},
            ease: 'Linear',
            duration: 250,
            yoyo: false,
            repeat: 1,
            paused: true,
            onComplete: this.onComplete,
        });
        HitAnimation.Object = this;
    }

    onComplete()
    {
        HitAnimation.Object.setActive(false).setVisible(false);
        if(HitAnimation.Object.callbackObject != null)
        {
            HitAnimation.Object.callbackObject.onCallback();
        }
    }

    playAt(x,y,unit,callbackObject)
    {
        this.callbackObject = callbackObject;
        this.unit = unit;
        this.setActive(true).setVisible(true);
        this.setPosition(x, y);
        this.tween.play();
    }

}

class DamageAnimation extends Phaser.GameObjects.Image
{
    tween = null;
    static Object;

    callbackObject = null;
    unit = null;

    constructor(scene, x, y)
    {
        super(scene, x, y, 'flash');
        this.setDepth(10000);
        this.scale = 0.125;
        this.setActive(false).setVisible(false);
        scene.add.existing(this);
        this.tween = scene.tweens.add({
            targets: this,
            alpha: { start: 0, to: 1 },
            scale: {start: 0.075, to: 0.150},
            ease: 'Linear',
            duration: 250,
            yoyo: false,
            repeat: 1,
            paused: true,
            onComplete: this.onComplete,
        });
        DamageAnimation.Object = this;
    }

    onComplete()
    {
        DamageAnimation.Object.setActive(false).setVisible(false);
        if(DamageAnimation.Object.callbackObject != null)
        {
            DamageAnimation.Object.callbackObject.onCallback();
        }
    }

    playAt(x,y,unit,callbackObject)
    {
        this.callbackObject = callbackObject;
        this.unit = unit;
        this.setActive(true).setVisible(true);
        this.setPosition(x, y);
        this.tween.play();
    }

}

class DisappearanceAnimation extends Phaser.GameObjects.Sprite
{
    static Object;

    callbackObject = null;
    unit = null;

    constructor(scene, x, y)
    {
        super(scene, x, y, 'explosion');
        this.setDepth(10000);
        this.scale = 0.150;
        this.setActive(false).setVisible(false);
        scene.add.existing(this);
        this.scene.anims.create({
            key: 'explosion',
            frames: this.scene.anims.generateFrameNumbers('explosion', { start: 0, end: 5 }),
            frameRate: 14,
            repeat: 0
        });
        this.on('animationcomplete', this.onComplete);
        DisappearanceAnimation.Object = this;
    }

    onComplete()
    {
        DisappearanceAnimation.Object.setActive(false).setVisible(false);
        if(DisappearanceAnimation.Object.unit!=null)
        {
            DisappearanceAnimation.Object.unit.die();
            DisappearanceAnimation.Object.unit=null;
        }
        if(DisappearanceAnimation.Object.callbackObject != null)
        {
            DisappearanceAnimation.Object.callbackObject.onCallback();
        }
    }

    playAt(x,y,unit,callbackObject)
    {
        this.callbackObject = callbackObject;
        this.unit = unit;
        if(this.unit!=null)this.unit.visible = false;
        this.setActive(true).setVisible(true);
        this.setPosition(x, y);
        this.anims.hideOnComplete=true;
        this.anims.play('explosion', true);
    }

}

class PortalAnimation extends Phaser.GameObjects.Sprite
{
    callbackObject = null;

    constructor(scene, x, y)
    {
        super(scene, x, y, 'portal');
        this.setDepth(10000);
        this.scale = 0.150;
        this.setActive(false).setVisible(false);
        scene.add.existing(this);
        this.scene.anims.create({
            key: 'portal',
            frames: this.scene.anims.generateFrameNumbers('portal'), //, { start: 0, end: 5 }),
            frameRate: 14,
            repeat: 0
        });
        this.on('animationcomplete', this.onComplete.bind(this,this) );
    }

    onComplete(obj)
    {
        obj.setActive(false).setVisible(false);
        if(obj.callbackObject != null)
        {
            obj.callbackObject.onCallback();
        }

    }

    playAt(x,y,callbackObject)
    {
        this.callbackObject = callbackObject;
        this.setActive(true).setVisible(true);
        this.setPosition(x, y);
        this.anims.hideOnComplete=true;
        this.anims.play('portal', true);
    }

}

class ThrowSpellAnimation extends Phaser.GameObjects.Image
{
    tween = null;
    particles = null;
    emitter = null;
    callbackObject = null;

    constructor(scene, x, y)
    {
        super(scene, x, y, 'portal');
        this.setDepth(10000);
        this.scale = 0.15;
        this.setActive(false).setVisible(false);
        scene.add.existing(this);
    }

    onComplete(obj)
    {
        cam.stopFollow();
        obj.setActive(false).setVisible(false);
        if(obj.callbackObject != null)
        {
            obj.callbackObject.onCallback();
        }
        obj.emitter.stop();
        obj.particles.destroy();
        obj.emitter.remove();
    }

    playAt(x, y, targetX, targetY, callbackObject)
    {
        this.callbackObject = callbackObject;
        this.setPosition(x, y);
        let dur = 4.0*Phaser.Math.Distance.Between(x, y, targetX, targetY);
        if(dur<250)dur=250;
        this.tween = this.scene.tweens.add({
            targets: this,
            x: targetX,
            y: targetY,
            ease: 'Linear',
            duration: dur,
            yoyo: false,
            paused: true,
            onComplete: this.onComplete.bind(this,this),
        });
        this.setActive(true).setVisible(true);
        this.tween.play();
        if(this.particles == null)
        {
            this.particles = this.scene.add.particles('portal');
            this.particles.setDepth(10000);
        }
        if(this.emitter == null)
        {
            this.emitter = this.particles.createEmitter({
                scale: { start: 0.1, end: 0 },
                lifespan: 200, // 500,
                speedX: { min: -20, max: 20 },
                speedY: { min: -20, max: 20 },
                blendMode: 'ADD',
                quantity: 10, //5,
                trackVisible: true,
                //emitZone: { type: 'edge', source: path, quantity: 50, yoyo: false }
            });
        }
        this.emitter.start();
        this.emitter.startFollow(this);
        cam.startFollow(this);
    }

}

class FireballAnimation extends Phaser.GameObjects.Image
{
    tween = null;
    particles = null;
    emitter = null;
    callbackObject = null;

    constructor(scene, x, y)
    {
        super(scene, x, y, 'fireball');
        this.setDepth(10000);
        this.scale = 0.1;
        this.rotation = 0;
        this.setActive(false).setVisible(false);
        scene.add.existing(this);
    }

    onComplete(obj)
    {
        cam.stopFollow();
        obj.setActive(false).setVisible(false);
        if(obj.emitter!=null)
        {
            obj.emitter.stop();
            obj.emitter.remove();
        }
        if(obj.particles!=null)obj.particles.destroy();
        obj.particles = null;
        obj.emitter = null;
        if(obj.callbackObject != null)
        {
            obj.callbackObject.onCallback();
        }
    }

    playAt(attackUnit, defendUnit, callbackObject)
    {
        this.callbackObject = callbackObject;
        this.setPosition(attackUnit.x, attackUnit.y);
        let dur = 4.0*Phaser.Math.Distance.Between(attackUnit.x, attackUnit.y, defendUnit.x, defendUnit.y);
        if(dur<250)dur=250;
        this.tween = this.scene.tweens.add({
            targets: this,
            scale: 0.2,
            x: defendUnit.x,
            y: defendUnit.y,
            rotation: 2*3.14,
            ease: 'Linear',
            duration: dur,
            yoyo: false,
            paused: true,
            onComplete: this.onComplete.bind(this,this),
        });
        this.setActive(true).setVisible(true);
        this.tween.play();

        //var line = new Phaser.Curves.Line([ attackUnit.x, attackUnit.y, defendUnit.x, defendUnit.y ]);
        //var path = this.scene.add.path();
        //path.add(line);

        if(this.particles == null)
        {
            this.particles = this.scene.add.particles('fireball');
            this.particles.setDepth(10000);
        }
        if(this.emitter == null)
        {
            this.emitter = this.particles.createEmitter({
                scale: { start: 0.15, end: 0, ease: 'Power3' },
                lifespan: { min: 500, max: 1000 },
                speedX: { min: -10, max: 10 },
                speedY: { min: -10, max: 10 },
                blendMode: 'ADD',
                quantity: 5,
                trackVisible: true,
                //emitZone: { type: 'edge', source: path, quantity: 50, yoyo: false }
            });
        }
        this.emitter.start();
        this.emitter.startFollow(this);
        cam.startFollow(this);
    }

}

class GasAnimation extends Phaser.GameObjects.Image
{
    particles = null;
    emitter = null;
    callbackObject = null;
    static Object;

    constructor(scene, x, y)
    {
        super(scene, x, y);
        this.setDepth(10000);
        this.setActive(false).setVisible(false);
        scene.add.existing(this);
        GasAnimation.Object = this;
    }

    onComplete()
    {
        GasAnimation.Object.setActive(false).setVisible(false);
        GasAnimation.Object.emitter.stop();
        GasAnimation.Object.particles.destroy();
        GasAnimation.Object.emitter.remove();
        GasAnimation.Object.particles = null;
        GasAnimation.Object.emitter = null;
        if(GasAnimation.Object.callbackObject != null)
        {
            GasAnimation.Object.callbackObject.onCallback();
        }
    }

    playAt(unit, callbackObject)
    {
        this.callbackObject = callbackObject;
        this.setPosition(unit.x, unit.y);
        this.setActive(true).setVisible(true);
        if(this.particles == null)
        {
            this.particles = this.scene.add.particles('gas');
            this.particles.setDepth(10000);
        }
        if(this.emitter == null)
        {
            this.emitter = this.particles.createEmitter({
                alpha: { start: 0.75, end: 0 },
                scale: { start: 0.125, end: 1.0 },
                rotate: { min: -180, max: 180 },
                speed: 20,
                lifespan: { min: 2500, max: 3500 },
                blendMode: 'ADD',
                frequency: 100,
                maxParticles: 10
            });
        }
        this.emitter.start();
        this.emitter.onParticleDeath((particle) => {
            if(GasAnimation.Object.particles.emitters.first.alive.length === 0)GasAnimation.Object.onComplete()
        }, this);
        this.emitter.startFollow(this);
    }

}

class LightningAnimation //extends Phaser.GameObjects.Image
{
    tween = null;
    callbackObject = null;
    scene = null;
    graphics = null;
    x1 = 0;
    y1 = 0;
    x2 = 0;
    y2 = 0;
    prev = 0;

    constructor(scene)
    {
        this.scene = scene;
    }

    onComplete(obj)
    {
        this.graphics.clear();
        if(this.graphics != null)this.graphics.destroy();
        if(obj.callbackObject != null)
        {
            obj.callbackObject.onCallback();
        }
    }

    perpendicular(p1,p2)
    {
        let len=Math.sqrt((p2[0]-p1[0])*(p2[0]-p1[0])+(p2[1]-p1[1])*(p2[1]-p1[1]));
        let n = [(p2[0]-p1[0])/len,(p2[1]-p1[1])/len];
        let n2= [-n[1],n[0]];
        return n2;
    }

    createLightning(startX, startY, endX, endY)
    {
        let segmentList = [];
        segmentList.push([[startX,startY],[endX,endY],[0]]);
        let dist = Math.sqrt((endX-startX)*(endX-startX)+(endY-startY)*(endY-startY));
        let maximumOffset = dist/8;
        let maxIteration = 6;
        let offsetAmount = maximumOffset;
        for(let i=0; i<maxIteration; i++)
        {
            let segmentList2 = [];
            segmentList.forEach(segment => {
                let midPoint = [(segment[0][0]+segment[1][0])/2, (segment[0][1]+segment[1][1])/2];
                let shift = this.perpendicular(segment[0],segment[1]);
                let r = randomInt(-offsetAmount,offsetAmount);
                shift[0] = shift[0]*r;
                shift[1] = shift[1]*r;
                midPoint[0] = midPoint[0] + shift[0];
                midPoint[1] = midPoint[1] + shift[1];
                segmentList2.push([segment[0],midPoint,segment[2]]);
                segmentList2.push([midPoint,segment[1],segment[2]]);

                if(Math.random() > 0.75)
                {
                    let dirlen = randomFloat(0.5,0.7);
                    let direction = [(midPoint[0]-segment[0][0])*dirlen,(midPoint[1]-segment[0][1])*dirlen];
                    let angle = randomFloat(-0.5,0.5);
                    let newdir = [ (direction[0]*Math.cos(angle) - direction[1]*Math.sin(angle)), (direction[0]*Math.sin(angle) + direction[1]*Math.cos(angle)) ];
                    let segEnd = [(midPoint[0]+newdir[0]), (midPoint[1]+newdir[1])];
                    segmentList2.push([midPoint, segEnd, (segment[2]+1)]);
                }
            });
            segmentList = segmentList2;
            offsetAmount = offsetAmount/2;
        }
        return segmentList;
    }

    drawSegments(seg,thikness,color,alpha)
    {
        seg.forEach(segment => {
            let th = Math.max(1,(thikness - segment[2]));
            this.graphics.lineStyle(th, color, alpha);
            this.graphics.beginPath();
            this.graphics.moveTo(segment[0][0], segment[0][1]);
            this.graphics.lineTo(segment[1][0], segment[1][1]);
            this.graphics.closePath();
            this.graphics.strokePath();
        });
    }

    draw()
    {
        this.graphics.clear();
        let scl = 0.5;
        this.graphics.setScale(scl);
        let dx = randomInt(-1,1)/scl*16;
        let dy = randomInt(-1,1)/scl*16;
        let x1 = this.x1/scl;
        let y1 = this.y1/scl;
        let x2 = this.x2/scl;
        let y2 = this.y2/scl;
        if((Math.abs(x1 - (x2 + dx))<8) && (Math.abs(y1 - (y2 + dx))<8))
        {
            dx = 0;
            dy = 0;
        }
        let seg = this.createLightning(x1, y1, this.x2/scl + dx, this.y2/scl +dy);
        this.drawSegments(seg,5,0xffffff,0.1);
        this.drawSegments(seg,1,0xffffff,1);
    }

    onUpdate(obj)
    {
        let cur = Math.floor(obj.tween.getValue());
        if(cur!==obj.prev)
        {
            cam.flash();
            obj.draw();
            obj.prev = cur;
        }

    }

    playAt(x, y, targetX, targetY, callbackObject)
    {
        this.callbackObject = callbackObject;
        this.graphics = this.scene.add.graphics();
        this.graphics.setDepth(10000);
        this.prev = 0;
        this.x1 = x;
        this.y1 = y;
        this.x2 = targetX;
        this.y2 = targetY;
        this.tween = this.scene.tweens.addCounter({
            from: 0,
            to: 100,
            duration: 1000,
            paused: true,
            onUpdate: this.onUpdate.bind(this,this),
            onComplete: this.onComplete.bind(this,this),
        });
        this.tween.play();
        this.draw();
    }

}