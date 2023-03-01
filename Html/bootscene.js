//---------------------------- BootScene ----------------------------
var BootScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize:

        function BootScene ()
        {
            Phaser.Scene.call(this, { key: 'BootScene' });
        },

    preload: function ()
    {
        this.load.image('tiles', 'img/dungeon-16-16.png');
        this.load.tilemapTiledJSON('dungeon', 'img/dungeon.json');
        this.load.image('arrow','img/arrow4.png');
        this.load.image('flash','img/flash.png');
        this.load.spritesheet('explosion', 'img/explosion.png', { frameWidth: 128, frameHeight: 128 } );
        this.load.spritesheet('portal', 'img/portal.png', { frameWidth: 182, frameHeight: 206 } );
        this.load.image('fireball', 'img/fireball.png');
        this.load.image('gas','img/gas1.png');
        this.load.image('book','img/open_book.png');
        this.load.image('x','img/x-cross.png');
        this.load.image('magic_ball','img/magic_ball.png');
        this.load.image('scroll','img/scroll.png');
        this.load.image('lightning','img/lightning.png');

        this.load.bitmapFont('atari', 'img/atari-smooth.png', 'img/atari-smooth.xml');

        this.load.spritesheet('pentagram', 'img/pentagram.png', { frameWidth: 128, frameHeight: 128 } );
        this.load.spritesheet('fire', 'img/fire.png', { frameWidth: 64, frameHeight: 64 } );
        this.load.spritesheet('web', 'img/web.png', { frameWidth: 128, frameHeight: 128 } );
        this.load.spritesheet('glue_blob1', 'img/glue_blob2.png', { frameWidth: 128, frameHeight: 128 } );
        this.load.spritesheet('glue_blob2', 'img/glue_blob3.png', { frameWidth: 128, frameHeight: 128 } );

        this.load.spritesheet('wizard', 'img/wizard.png', { frameWidth: 16, frameHeight: 21 } );
        this.load.spritesheet('chort', 'img/chort.png', { frameWidth: 16, frameHeight: 23 } );
        this.load.spritesheet('demon', 'img/demon.png', { frameWidth: 32, frameHeight: 34 } );
        this.load.spritesheet('muddy', 'img/muddy.png', { frameWidth: 16, frameHeight: 16 } );
        this.load.spritesheet('rat', 'img/rat.png', { frameWidth: 21, frameHeight: 16 } );
        this.load.spritesheet('spider', 'img/spider.png', { frameWidth: 36, frameHeight: 16 } );
        this.load.spritesheet('goblin', 'img/goblin.png', { frameWidth: 16, frameHeight: 20 } );
        this.load.spritesheet('troll', 'img/troll.png', { frameWidth: 22, frameHeight: 28 } );
        this.load.spritesheet('imp', 'img/imp.png', { frameWidth: 16, frameHeight: 16 } );
    },

    create: function ()
    {
        this.scene.start('GameScene');
        this.scene.launch('UIScene');
    }
});