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

        this._createFogGradient();

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
        grayScalePipeline.set1f('gamma', 1.7);
        grayScalePipeline.set1f('darkness', 1.2);
        customPipeline = this.renderer.pipelines.get('Custom');
        customPipeline.set1f('alpha', 1.0);
        customPipeline.set1f('time', 0.3);

        rangeRenderer = new RangeRenderer(this);
        placeSelector = new PlaceSelector(this);

        //+ init fogs
        if(gameSettings.fogOfWar){
            for(let unit of units) computeFOV(unit.player, unit.mapX, unit.mapY, 20);
            for(let player of players){
                player.initializeFog(this, map);
            }
        }
        //-

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
            if (p.fogExplored) {
                player.fogExplored = p.fogExplored.map(row => row.map(v => !!v));
            }
            if (p.fogVisible) {
                player.fogVisible = p.fogVisible.map(row => row.map(v => !!v));
            }
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

    initNewGame: function()
    {
        playerInd = 0;
        let startPos = [];
        let entityObjects = [];
        // split objects into start positions and entities
        for (let i = 0; i < objectLayer.objects.length; i++)
        {
            const obj = objectLayer.objects[i];
            const objPos = map.worldToTileXY(obj.x, obj.y);
            if (obj.type === "start" || obj.type === "")
            {
                startPos.push({ x: objPos.x, y: objPos.y });
            }
            else if (obj.type === "entity")
            {
                entityObjects.push({
                    configName: obj.name,   // name in Tiled = key in entityConfigs
                    x: objPos.x,
                    y: objPos.y,
                    properties: obj.properties || []
                });
            }
        }
        // create entities
        for (let i = 0; i < entityObjects.length; i++)
        {
            const e = entityObjects[i];
            const cfg = entityConfigs[e.configName];
            if (!cfg) continue;
            let entity = cfg.createFunction(this, 0, 0, false);
            entity.setPositionFromMap(e.x, e.y);
            // properties → features
            for (let p = 0; p < e.properties.length; p++)
            {
                const prop = e.properties[p];
                if (entity.features.hasOwnProperty(prop.name))
                {
                    entity.features[prop.name] = prop.value;
                }
            }
            entity.start(false);
            entities.push(entity);
        }
        // count players
        let playerCount = 0;
        for (let i = 0; i < playersSettings.length; i++)
        {
            if (playersSettings[i].control == null) continue;
            playerCount++;
        }
        if (playerCount > startPos.length) playerCount = startPos.length;
        // choose spread positions
        const chosenPositions = this._pickSpreadPositions(startPos, playerCount, map.width, map.height);
        // shuffle chosen positions
        for (let i = chosenPositions.length - 1; i > 0; i--)
        {
            const j = randomInt(0, i);
            const tmp = chosenPositions[i];
            chosenPositions[i] = chosenPositions[j];
            chosenPositions[j] = tmp;
        }
        // create players and wizards
        let posIndex = 0;
        for (let i = 0; i < playersSettings.length; i++)
        {
            if (playersSettings[i].control == null) continue;
            if (posIndex >= chosenPositions.length) break;
            const player = new Player(playersSettings[i].name);
            players.push(player);
            const wiz = new Unit(unitConfigs['wizard'], this, 0, 0);
            wiz.setPositionFromMap(chosenPositions[posIndex].x, chosenPositions[posIndex].y);
            player.addWizard(wiz);
            units.push(wiz);
            player.control = playersSettings[i].control;
            //if(playersSettings[i].control == PlayerControl.computer) player.aiControl = new AIControl(player);
            //+debug
            player.aiControl = new AIControl(player);
            //-
            player.fogExplored = Array.from({ length: map.height }, () => Array(map.width).fill(false));
            player.fogVisible = Array.from({ length: map.height }, () => Array(map.width).fill(false));
            this.initSpells(wiz);
            posIndex++;
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

    _createFogGradient: function () {
        const radius = 32;      // radius of vision in pixels
        const steps = 16;       // number of steps in gradient

        if (this.textures.exists('fogGradient')) return;
        const g = this.make.graphics({ x: 0, y: 0, add: false });
        for (let i = steps; i > 0; i--) {
            const t = i / steps;
            const alpha = Phaser.Math.Linear(1.0, 0.0, t);
            g.fillStyle(0x000000, alpha);
            g.fillCircle(radius, radius, radius * t);
        }
        g.generateTexture('fogGradient', radius * 2, radius * 2);
        g.destroy();
        this.fogRadius = radius;
    }

});