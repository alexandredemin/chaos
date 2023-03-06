//---------------------------- GameScene ----------------------------

var GameScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize:

        function GameScene()
        {
            Phaser.Scene.call(this, { key: 'GameScene' });
        },

    create: function ()
    {
        map = this.make.tilemap({ key: 'dungeon', tileWidth: 16, tileHeight: 16 });
        this.tileset = map.addTilesetImage('dungeon-tiles','tiles');
        groundLayer = map.createLayer('Ground', this.tileset, 0, 0);
        wallsLayer = map.createLayer('Walls', this.tileset, 0, 0);
        wallsLayer.setCollisionByProperty({ collides: true });
        this.physics.world.setBounds(0, 0, wallsLayer.width, wallsLayer.height);
        let startPos = this.cache.tilemap.get('dungeon').data.startpos;

        cam = this.cameras.main;
        resize();

        let playerCount = 4;
        if(playerCount > startPos.length)playerCount = startPos.length;
        for(let i=0;i<playerCount;i++)
        {
            if(i === startPos.length-1)break;
            let j = randomInt(i,startPos.length-1);
            let x = startPos[i];
            startPos[i] = startPos[j];
            startPos[j] = x;
        }
        for(let i=0;i<playerCount;i++)
        {
            let player = new Player('Player' + (i + 1));
            players.push(player);
            let wiz = new Unit(unitConfigs['wizard'], this, 0, 0);
            wiz.setPositionFromMap(startPos[i].x, startPos[i].y);
            player.addWizard(wiz);
            units.push(wiz);
            player.control = PlayerControl.computer;
            player.aiControl = new AIControl(player);
        }
        //players[0].control = PlayerControl.human;

        fireballAnimation = new FireballAnimation(this,200,200);
        gasAnimation = new GasAnimation(this,200,200);

        spellTypes['summon'] = new SummonSpell();
        spellTypes['self'] = new SelfSpell();
        spellTypes['entity'] = new EntitySpell();
        spellTypes['atack'] = new AtackSpell();
        spellTypes['atack_place'] = new AtackPlaceSpell();

        atackFeatures['infectious'] = new InfectiousAtack();

        abilities['conjure'] = new ConjureAbility();
        abilities['fire'] = new FireAbility();
        abilities['gas'] = new GasAbility();
        abilities['web'] = new WebAbility();

        grayScalePipeline = this.renderer.pipelines.get('Gray');
        customPipeline = this.renderer.pipelines.get('Custom');
        customPipeline.set1f('alpha', 1.0);
        customPipeline.set1f('time', 0.3);

        rangeRenderer = new RangeRenderer(this);
        placeSelector = new PlaceSelector(this);

        window.addEventListener('resize', resize);

        playerInd = 0;
    },

    update: function() {

        units.forEach(item => item.update());

        let pointer = this.input.activePointer;

        if(pointer.isDown && pointerBlocked===false)
        {
            pointer.updateWorldPoint(this.cameras.main);
            let touchX = pointer.worldX;
            let touchY = pointer.worldY;

            let touchUnit = null;
            /*
            if(pointerPressed==false)
            {
                pointerPressed=true;

                if(activeInteractionScenario == userInteractionScenario.movement)
                {
                    let touchMapX = map.worldToTileXY(touchX,touchY).x;
                    let touchMapY = map.worldToTileXY(touchX,touchY).y;
                    touchUnit = getUnitAtMap(touchMapX, touchMapY);
                    if(touchUnit != null && touchUnit != selectedUnit){
                        if(touchUnit.player == players[playerInd]) selectUnit(touchUnit);
                    }
                }
            }
            */
            if(touchUnit == null)
            {
                const cam = this.cameras.main;
                if (this.origDragPointX)
                {
                    cam.scrollX += this.origDragPointX - pointer.x;
                    cam.scrollY += this.origDragPointY - pointer.y;
                }
                this.origDragPointX = pointer.x;
                this.origDragPointY = pointer.y;
            }
        }
        else
        {
            pointerPressed=false;
            this.origDragPointX = null;
            this.origDragPointY = null;
        }

    }

});