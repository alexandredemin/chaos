//---------------------------- GameScene ----------------------------

var GameScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize:

        function GameScene()
        {
            Phaser.Scene.call(this, { key: 'GameScene' });
        },

    preload: function()
    {
        //this.load.image('tiles', 'img/dungeon-16-16.png');
        this.load.tilemapTiledJSON(gameSettings.selectedMap, 'maps/'+gameSettings.selectedMap+'.json');
    },
  
    create: function (data)
    {
        const savedGame = data?.savedState;
        
        map = this.make.tilemap({ key: gameSettings.selectedMap, tileWidth: 16, tileHeight: 16 });
        this.tileset = map.addTilesetImage('dungeon-tiles','tiles');
        groundLayer = map.createLayer('Ground', this.tileset, 0, 0);
        wallsLayer = map.createLayer('Walls', this.tileset, 0, 0);          
        objectLayer = map.getObjectLayer('Objects');
        wallsLayer.setCollisionByProperty({ collides: true });
        this.physics.world.setBounds(0, 0, wallsLayer.width, wallsLayer.height);

        if (savedGame) {
            this.loadFromSave(savedGame);
        } else {
            this.initNewGame();
        }

        fireballAnimation = new FireballAnimation(this,200,200);
        gasAnimation = new GasAnimation(this,200,200);

        spellTypes['summon'] = new SummonSpell();
        spellTypes['self'] = new SelfSpell();
        spellTypes['unit'] = new UnitSpell();
        spellTypes['entity'] = new EntitySpell();
        spellTypes['atack'] = new AtackSpell();
        spellTypes['atack_place'] = new AtackPlaceSpell();

        atackFeatures['infectious'] = new InfectiousAtack();

        abilities['conjure'] = new ConjureAbility();
        abilities['fire'] = new FireAbility();
        abilities['gas'] = new GasAbility();
        abilities['web'] = new WebAbility();
        abilities['jump'] = new JumpAbility();

        grayScalePipeline = this.renderer.pipelines.get('Gray');
        customPipeline = this.renderer.pipelines.get('Custom');
        customPipeline.set1f('alpha', 1.0);
        customPipeline.set1f('time', 0.3);

        rangeRenderer = new RangeRenderer(this);
        placeSelector = new PlaceSelector(this);

        window.addEventListener('resize', resize);
      
        cam = this.cameras.main;
        resize();
          
        startScene.scene.launch('UIScene');
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

    },
  
    loadFromSave(savedGame) {    
        playerInd = savedGame.playerInd;
        players = [];
        entities = [];
        units = [];
        
        const playersMap = {};
        for (let p of savedGame.players) {
            let player = new Player(p.name);
            player.control = p.control;
            //if (player.control === PlayerControl.computer) {
                player.aiControl = new AIControl(player);
            //}
            players.push(player);
            playersMap[player.name] = player;
        }
        for (let ud of savedGame.units) Unit.deserialize(ud, this, playersMap);
        for (let ed of savedGame.entities) Entity.deserialize(ed, this);
        if(gameSettings.showEnemyMoves) for(let ent of entities) if(ent.active)ent.visible = true;
    },

  
    initNewGame: function(){
        playerInd = 0;
        let startPos = [];
        for(let i=0; i < objectLayer.objects.length; i++){
            let obj = objectLayer.objects[i];
            let objPos = map.worldToTileXY(obj.x,obj.y);
            startPos.push({x:objPos.x,y:objPos.y});
        }
        let playerCount = playersSettings.length;
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
            if(playersSettings[i].control == null)continue;
            let player = new Player(playersSettings[i].name);
            players.push(player);
            let wiz = new Unit(unitConfigs['wizard'], this, 0, 0);
            wiz.setPositionFromMap(startPos[i].x, startPos[i].y);
            player.addWizard(wiz);
            units.push(wiz);
            player.control = playersSettings[i].control;
            //if(playersSettings[i].control == PlayerControl.computer) player.aiControl = new AIControl(player);
            //+debug
            player.aiControl = new AIControl(player);
            //-
            this.initSpells(wiz);
        }      
    },
  
    initSpells: function(unit){
        if(gameSettings.spellDistrib == SpellDistribution.random)
        {
            let limit = gameSettings.magicPoints;
            while(limit>0)
            {
                let availableSpells = [];
                let spellNames = Object.keys(unit.abilities.conjure.config.spells);
                for(let i=0;i<spellNames.length;i++) if(spellConfigs[spellNames[i]].cost <= limit) availableSpells.push(spellNames[i]);
                if(availableSpells.length > 0)
                {
                    let selSpl = availableSpells[randomInt(0, availableSpells.length - 1)];
                    unit.abilities.conjure.config.spells[selSpl]++;
                    limit = limit - spellConfigs[selSpl].cost;
                }
                else break;
            }
        }
        else
        {
            for(let spl of Object.keys(unit.abilities.conjure.config.spells)) unit.abilities.conjure.config.spells[spl] = -1;
        }
    },  

});