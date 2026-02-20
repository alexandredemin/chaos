//---------------------------- BaseUnit class ----------------------------
class BaseUnit extends Phaser.GameObjects.Sprite //Phaser.Physics.Arcade.Sprite
{
    config = null;
    mapX = 0;
    mapY = 0;
    zOffset = 0;
    features = {};
    abilities = {};

    constructor(config, scene, x, y, visible=true)
    {
        super(scene, x, y, config.sprite);
        this.visible = visible;
        this.setScale(config.scale);
        if(config.displayOrigin)
        {
            this.setDisplayOrigin(config.displayOrigin.x, config.displayOrigin.y);
        }
        else
        {
            if(this.height*config.scale > 16)
            {
                this.setOrigin(0.5, 1 - (0.5 * 16 / (this.height*config.scale)));
            }
            else
            {
                this.setOrigin(0.5,0.5);
            }
        }
        this.setMapPosition(x, y);
        scene.add.existing(this);
        scene.physics.add.existing(this);
        //scene.physics.add.collider(this, wallsLayer,collideCallback);
        //this.body.setSize(16, 16);
        //this.body.setOffset(0, 12);
        this.config = config;
        for (let key in config.features) {this.features[key] = config.features[key];}
        this.abilities = clone(config.abilities);
    }

    setDepth(mapY)
    {
        super.setDepth(mapY*10+this.zOffset);
    }

    setMapPosition(x,y)
    {
        let mapPos = map.worldToTileXY(x,y);
        this.mapX = mapPos.x;
        this.mapY = mapPos.y;
        this.setDepth(mapPos.y);
    }

    setPosition(x, y)
    {
        super.setPosition(x, y);
        this.setMapPosition(x, y);
    }

    setPositionFromMap(mapX, mapY)
    {
        let pos = map.tileToWorldXY(mapX, mapY);
        super.setPosition(pos.x + 8, pos.y + 8);
        this.mapX = mapX;
        this.mapY = mapY;
        this.setDepth(mapY);
    }

    adjastPosition()
    {
        let worldXY = map.tileToWorldXY(this.mapX, this.mapY);
        super.setPosition(worldXY.x + 8, worldXY.y + 8);
    }

}