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
        this.load.tilemapTiledJSON(gameSettings.selectedMap, 'maps/'+gameSettings.selectedMap+'.json');
    },
  
    create: function (data)
    {
        const savedGame = data?.savedState;

        if (savedGame && savedGame.savedMap) {
            this.loadMapFromSave(savedGame.savedMap);
        }
        else if (gameSettings.selectedMap === "random") {
            const cfg = gameSettings.randomMapConfig || { width: 20, height: 20 };
            this.generateMap(cfg);
        }
        else{
            map = this.make.tilemap({ key: gameSettings.selectedMap, tileWidth: 16, tileHeight: 16 });
            this.tileset = map.addTilesetImage('dungeon-tiles','tiles2');
            groundLayer = map.createLayer('Ground', this.tileset, 0, 0);
            wallsLayer = map.createLayer('Walls', this.tileset, 0, 0);          
            objectLayer = map.getObjectLayer('Objects');
            wallsLayer.setCollisionByProperty({ collides: true });
            this.physics.world.setBounds(0, 0, wallsLayer.width, wallsLayer.height);
        }

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

        initActionRegistry();

        grayScalePipeline = this.renderer.pipelines.get('Gray');
        customPipeline = this.renderer.pipelines.get('Custom');
        customPipeline.set1f('alpha', 1.0);
        customPipeline.set1f('time', 0.3);

        rangeRenderer = new RangeRenderer(this);
        placeSelector = new PlaceSelector(this);

        this.initFog();

        window.addEventListener('resize', resize);
      
        cam = this.cameras.main;
        resize();

        //this.debug = new DebugOverlay(this);
          
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

    generateMap: function(cfg) {
        const generator = new MapGenerator(cfg);
        const data = generator.generate();

        // Phaser tilemap
        map = this.make.tilemap({
            width: data.width,
            height: data.height,
            tileWidth: 16,
            tileHeight: 16
        });

        this.tileset = map.addTilesetImage('dungeon-tiles', 'tiles');

        groundLayer = map.createBlankLayer('Ground', this.tileset, 0, 0);
        wallsLayer = map.createBlankLayer('Walls', this.tileset, 0, 0);

        // fill ground
        for (let y = 0; y < data.height; y++) {
            for (let x = 0; x < data.width; x++) {
                groundLayer.putTileAt(data.ground[y][x], x, y);
            }
        }

        // apply walls with collides property
        for (let y = 0; y < data.height; y++) {
            for (let x = 0; x < data.width; x++) {
                const tileIndex = data.walls[y][x];
                if (tileIndex !== null) {
                    const tile = wallsLayer.putTileAt(tileIndex, x, y);
                    tile.properties = tile.properties || {};
                    tile.properties.collides = true;
                }
            }
        }

        wallsLayer.setCollisionByProperty({ collides: true });
        this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);

        // Save objects layer
        objectLayer = {
            objects: data.objects,
        };
    },
  
    loadFromSave: function(savedGame) {    
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

    loadMapFromSave: function(savedMap) {
        map = this.make.tilemap({
            width: savedMap.width,
            height: savedMap.height,
            tileWidth: 16,
            tileHeight: 16
        });

        this.tileset = map.addTilesetImage('dungeon-tiles', 'tiles');

        groundLayer = map.createBlankLayer('Ground', this.tileset, 0, 0);
        wallsLayer = map.createBlankLayer('Walls', this.tileset, 0, 0);

        // ground
        for (let y = 0; y < savedMap.height; y++) {
            for (let x = 0; x < savedMap.width; x++) {
                groundLayer.putTileAt(savedMap.ground[y][x], x, y);
            }
        }

        // walls
        for (let y = 0; y < savedMap.height; y++) {
            for (let x = 0; x < savedMap.width; x++) {
                const tileIndex = savedMap.walls[y][x];
                if (tileIndex !== null) {
                    const tile = wallsLayer.putTileAt(tileIndex, x, y);
                    tile.properties = tile.properties || {};
                    tile.properties.collides = true;
                }
            }
        }

        wallsLayer.setCollisionByProperty({ collides: true });
        this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);

        objectLayer = {
            objects: savedMap.objects
        };
    },
  
    initNewGame: function(){
        playerInd = 0;
        // select all start positions
        let startPos = [];
        for (let i = 0; i < objectLayer.objects.length; i++) {
            const obj = objectLayer.objects[i];
            const objPos = map.worldToTileXY(obj.x, obj.y);
            startPos.push({ x: objPos.x, y: objPos.y });
        }
        let playerCount = 0;
        for (let i = 0; i < playersSettings.length; i++) {
            if (playersSettings[i].control == null) continue;
            playerCount++;
        }
        if (playerCount > startPos.length) {
            playerCount = startPos.length;
        }
        // choose spread positions
        const chosenPositions = this._pickSpreadPositions(startPos, playerCount, map.width, map.height);
        // shuffle chosen positions
        for (let i = chosenPositions.length - 1; i > 0; i--) {
            const j = randomInt(0, i);
            const tmp = chosenPositions[i];
            chosenPositions[i] = chosenPositions[j];
            chosenPositions[j] = tmp;
        }
        for (let i = 0; i < playerCount; i++) {
            if (playersSettings[i].control == null) continue;
            const player = new Player(playersSettings[i].name);
            players.push(player);
            const wiz = new Unit(unitConfigs['wizard'], this, 0, 0);
            wiz.setPositionFromMap(chosenPositions[i].x, chosenPositions[i].y);
            player.addWizard(wiz);
            units.push(wiz);
            player.control = playersSettings[i].control;
            //if(playersSettings[i].control == PlayerControl.computer) player.aiControl = new AIControl(player);
            //+debug
            player.aiControl = new AIControl(player);
            //-
            this.initSpells(wiz);
            //+ init fogs
            player.fogExplored = Array.from({ length: map.height }, () => Array(map.width).fill(false));
            player.fogVisible  = Array.from({ length: map.height }, () => Array(map.width).fill(false))
            //-
        }
    },

    _pickSpreadPositions: function(allPositions, count, mapWidth, mapHeight) {
        if (count <= 0) return [];
        if (count >= allPositions.length) return allPositions.slice();
        const selected = [];
        // 1) first point: farthest from center ---
        const cx = mapWidth / 2;
        const cy = mapHeight / 2;
        let maxDist = -1;
        let candidates = [];
        for (const p of allPositions) {
            const dx = p.x - cx;
            const dy = p.y - cy;
            const dist = dx * dx + dy * dy;
            if (dist > maxDist) {
                maxDist = dist;
                candidates = [p];
            } else if (dist === maxDist) {
                candidates.push(p);
            }
        }
        const first = candidates[randomInt(0, candidates.length - 1)];
        selected.push(first);
        // --- 2) farthest-point sampling ---
        while (selected.length < count) {
            let bestPos = null;
            let bestDist = -1;
            for (const p of allPositions) {
                if (selected.includes(p)) continue;
                let minDist = Infinity;
                for (const s of selected) {
                    const dx = p.x - s.x;
                    const dy = p.y - s.y;
                    const dist = dx * dx + dy * dy;
                    if (dist < minDist) minDist = dist;
                }
                if (minDist > bestDist) {
                    bestDist = minDist;
                    bestPos = p;
                }
            }
            if (!bestPos) break;
            selected.push(bestPos);
        }
        return selected;
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
    
    initFog: function () {
        this.fogRT = new Phaser.GameObjects.RenderTexture(
            this,
            groundLayer.x,
            groundLayer.y,
            groundLayer.width,
            groundLayer.height
        );
        this.add.existing(this.fogRT);
        this.fogRT.setDepth(1000);

        this._createFogGradient();
    },

    _createFogGradient: function () {
        const radius = 32;           // радиус обзора в пикселях
        const steps = 16;

        const g = this.make.graphics({ x: 0, y: 0, add: false });

        for (let i = steps; i > 0; i--) {
            const t = i / steps;

            // центр — полностью прозрачный
            // край — почти непрозрачный
            const alpha = Phaser.Math.Linear(1.0, 0.0, t);

            g.fillStyle(0x000000, alpha);
            g.fillCircle(radius, radius, radius * t);
        }

        g.generateTexture('fogGradient', radius * 2, radius * 2);
        g.destroy();

        this.fogRadius = radius;
    },

    renderFog: function (player) {
        return;
        const rt = this.fogRT;
        const tile = 16;
        const r = this.fogRadius;

        rt.clear();

        // 1) Полный fog of war
        rt.fill(0x000000, 1);

        // 2) Вырезаем текущую видимость (градиент!)
        for (let y = 0; y < map.height; y++) {
            for (let x = 0; x < map.width; x++) {
                if (!player.fogExplored[y][x]) continue;

                const px = x * tile + tile / 2 - r;
                const py = y * tile + tile / 2 - r;

                rt.erase('fogGradient', px, py);
            }
        }
    },


});