//---------------------------- StartScene ----------------------------
const StartScene = new Phaser.Class({
    Extends: Phaser.Scene,
  
    startMenu: null,
    playersMenu: null,
    mapMenu: null,
    settingsMenu: null,
  
    initialize:

        function StartScene()
        {
            Phaser.Scene.call(this, { key: 'StartScene' });
        },

    create: function ()
    {
        startScene = this; 
        //this.startMenu = new Menu(this, [{label: "start game",action: ()=>startScene.selectMap()},{label: "settings",action: null}]);
        const hasSave = localStorage.getItem("savedGame") !== null;
        const menuItems = [
            { label: "new game", action: () => this.selectMap() },
            ...(hasSave ? [{ label: "continue", action: () => this.continueGame() }] : []),
            { label: "settings", action: null }
        ];
        this.startMenu = new Menu(this, menuItems);
        this.resize();
        window.addEventListener('resize', ()=>startScene.resize());
        this.startMenu.show();

    },
  
    showStartMenu: function()
    {
        this.deleteAllMenu();
        this.startMenu.show();
    },
  
    continueGame: function() {
        const saved = localStorage.getItem('savedGame');
        if (!saved) return;
        const gameState = JSON.parse(saved);
        gameSettings.selectedMap = gameState.selectedMap;
        gameSettings.spellDistrib = gameState.spellDistrib;
        gameSettings.magicPoints = gameState.magicPoints;
        gameSettings.showEnemyMoves = gameState.showEnemyMoves;
        gameSettings.fogOfWar = gameState.fogOfWar;
        gameSettings.rules = gameState.rules;
        //playersSettings = gameState.players;
        //currentTurn = gameState.turn;
        this.deleteAllMenu();
        this.scene.start('GameScene', { loadSavedGame: true, savedState: gameState });
    },
  
    selectMap: function()
    {
        this.startMenu.hide();
        this.hideAllMenu();

        if(this.mapMenu==null)
        {
            menuItems = [];
            mapOptions = [];
            for(let m of maps) mapOptions.push({text:"scenario: " + m,value:m});
            mapOptions.push({text:"scenario: random", value:"random"});

            menuItems.push({
                label: "scenario: dungeon",
                action: () => {
                    startScene.deletePlayersMenu();
                    //startScene.updateRandomMapOptionsVisibility();
                },
                options: mapOptions
            });
            menuItems.push({label: "settins",action:()=>startScene.showSettingsMenu()});
            menuItems.push({label: "",action:null});
            menuItems.push({label: "start game",action:()=>startScene.selectPlayers()});
            menuItems.push({label: "return",action:()=>startScene.showStartMenu()});

            this.mapMenu = new Menu(this, menuItems);  
            this.mapMenu.items[0].optionInd = 0;
            this.mapMenu.items[0].text = this.mapMenu.items[0].options[0].text;
        }

        this.resize();
        this.mapMenu.show();
    },
  
    updateRandomMapOptionsVisibility: function() {
        if (!this.settingsMenu) return;
        const selectedMap = this.mapMenu.items[0].options[this.mapMenu.items[0].optionInd].value;
        const isRandom = selectedMap === "random";
        // Indexes of random map settings are 5 and 6
        this.settingsMenu.items[5].visible = isRandom;
        this.settingsMenu.items[6].visible = isRandom;
    },
  
    showSettingsMenu: function()
    {
        //this.deleteAllMenu();
        this.hideAllMenu();
        if(this.settingsMenu==null)
        {
            menuItems = [];
            spellOptions = [{text:"spells: random",value:SpellDistribution.random},{text:"spells: unlimited",value:SpellDistribution.unlimited}];
            magicPoints = [{text:"magic points: 25",value: 25},{text:"magic points: 50",value: 50},{text:"magic points: 75",value: 75},{text:"magic points: 100",value: 100},{text:"magic points: 150",value: 150},{text:"magic points: 200",value: 200},{text:"magic points: 300",value: 300},{text:"magic points: 500",value: 500}];
            menuItems.push({label: "spells: unlimited",action: ()=>startScene.showMagicPoints(),options:spellOptions});
            menuItems.push({label: "magic points: 100",action: null,options:magicPoints});
            menuItems.push({label: "show enemy moves off",action: null,options:[{text:"show enemy moves on",value:true},{text:"show enemy moves off",value:false},]});
            menuItems.push({label: "fog of war off",action: null,options:[{text:"fog of war on",value:true},{text:"fog of war off",value:false},]});
            menuItems.push({
                label: "rules: standard",
                action: null,
                options: [
                    { text: "rules: standard", value: "standard" },
                    { text: "rules: advanced", value: "advanced" }
                ], 
                optionInd: 0,
                text: "rules: standard",
                visible: true
            });
            //menuItems.push({label: "",action:null});
            // add random map parameters
            menuItems.push({
                label: "map width: 40",
                action: null,
                options: [
                    { text: "map width: 20", value: 20 },
                    { text: "map width: 30", value: 30 },
                    { text: "map width: 40", value: 40 },
                    { text: "map width: 50", value: 50 },
                    { text: "map width: 60", value: 60 }
                ], 
                optionInd: 0,
                text: "map width: 20",
                visible: false
            });
            menuItems.push({
                label: "map height: 30",
                action: null,
                options: [
                    { text: "map height: 20", value: 20 },
                    { text: "map height: 30", value: 30 },
                    { text: "map height: 40", value: 40 },
                    { text: "map height: 50", value: 50 }
                ],
                optionInd: 0,
                text: "map height: 20",
                visible: false
            });
            menuItems.push({label: "",action:null});
            menuItems.push({label: "return",action:()=>startScene.selectMap()});
            this.settingsMenu = new Menu(this, menuItems); 
            this.settingsMenu.items[0].optionInd = 0;
            this.settingsMenu.items[0].text = this.settingsMenu.items[0].options[this.settingsMenu.items[0].optionInd].text;
            this.settingsMenu.items[1].optionInd = 0;
            this.settingsMenu.items[1].text = this.settingsMenu.items[1].options[this.settingsMenu.items[1].optionInd].text;
            this.settingsMenu.items[2].optionInd = 0;
            this.settingsMenu.items[2].text = this.settingsMenu.items[2].options[this.settingsMenu.items[2].optionInd].text;
            this.settingsMenu.items[3].optionInd = 1;
            this.settingsMenu.items[3].text = this.settingsMenu.items[3].options[this.settingsMenu.items[3].optionInd].text;
            this.showMagicPoints();
        }
        this.resize();
        this.settingsMenu.show();
        this.showMagicPoints();
        this.updateRandomMapOptionsVisibility();
    },
  
    createPlayersMenu: function(playersCount)
    {
        const menuItems = [];

        for (let i = 0; i < playersCount; i++) {
            menuItems.push({
                label: `player ${i + 1} computer`,
                action: null,
                options: [
                    { text: `player ${i + 1} computer`, value: PlayerControl.computer },
                    { text: `player ${i + 1} human`, value: PlayerControl.human },
                    { text: `player ${i + 1} off`, value: null }
                ]
            });
        }

        menuItems.push({ label: "", action: null });
        menuItems.push({ label: "start game", action: () => startScene.startGame() });
        menuItems.push({ label: "return", action: () => startScene.selectMap() });

        this.playersMenu = new Menu(this, menuItems);
        this.playersMenu.items[0].optionInd = 1;
        this.playersMenu.items[0].text = this.playersMenu.items[0].options[1].text;

        this.resize();
        this.playersMenu.show();
    },
  
    selectPlayers: function()
    {
        this.hideAllMenu();

        if (this.playersMenu != null) {
            this.resize();
            this.playersMenu.show();
            return;
        }

        const selectedMap = this.mapMenu.items[0].options[this.mapMenu.items[0].optionInd].value;

        if (selectedMap === "random") {
            this.createPlayersMenu(4);
            return;
        }

        fetch('maps/' + selectedMap + '.json')
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Error file load: ${response.statusText}`);
                }
                return response.json();
            })
            .then(jsonData => {
                const objectsLayer = jsonData.layers.find(layer => layer.name === "Objects");
                const playersCount = objectsLayer && Array.isArray(objectsLayer.objects) ? objectsLayer.objects.length : 0;

                if (playersCount === 0) {
                    console.log("Error map: no player found");
                    this.selectMap();
                    return;
                }

                this.createPlayersMenu(playersCount);
            })
            .catch(error => {
                console.error('Error:', error);
                this.selectMap();
            });
    },
      
    startGame: function()
    {
        this.setPalyersSetting();
        let playersCount = 0;
        for(let i=0;i<playersSettings.length;i++)
            if(playersSettings[i].control != null) playersCount++;
        if(playersCount < 2) return;

        const selectedMap = this.mapMenu.items[0].options[this.mapMenu.items[0].optionInd].value;
        gameSettings.selectedMap = selectedMap;

        if (selectedMap === "random") {
            const width = this.settingsMenu.items[5].options[this.settingsMenu.items[5].optionInd].value;
            const height = this.settingsMenu.items[6].options[this.settingsMenu.items[6].optionInd].value;
            gameSettings.randomMapConfig = { width, height };
        }

        if(this.settingsMenu != null)
        {
            gameSettings.spellDistrib = this.settingsMenu.items[0].options[this.settingsMenu.items[0].optionInd].value;
            gameSettings.magicPoints = this.settingsMenu.items[1].options[this.settingsMenu.items[1].optionInd].value;
            gameSettings.showEnemyMoves = this.settingsMenu.items[2].options[this.settingsMenu.items[2].optionInd].value;
            gameSettings.fogOfWar = this.settingsMenu.items[3].options[this.settingsMenu.items[3].optionInd].value;
            gameSettings.rules = this.settingsMenu.items[4].options[this.settingsMenu.items[4].optionInd].value;
        }

        this.deleteAllMenu();
        startScene.scene.start('GameScene');
    },
  
    setPalyersSetting: function()
    {
        playersSettings = [];
        for(let i=0;i<this.playersMenu.items.length;i++)
        {
            let MI = this.playersMenu.items[i];
            if(MI.options == null) continue;
            playersSettings.push({control:MI.options[MI.optionInd].value,name:"player "+(i+1)});     
        }
    },
  
    deletePlayersMenu: function()
    {
        if(this.playersMenu!=null)
        {
            this.playersMenu.delete();
            this.playersMenu = null;
        }
    },
  
    deleteAllMenu: function()
    {
        this.deletePlayersMenu();
        if(this.mapMenu!=null)
        {
            this.mapMenu.delete();
            this.mapMenu = null;
        }
        if(this.settingsMenu!=null)
        {
            this.settingsMenu.delete();
            this.settingsMenu = null;
        }
    },
  
    hideAllMenu: function()
    {
        if(this.playersMenu!=null)
        {
            this.playersMenu.hide();
        }
        if(this.mapMenu!=null)
        {
            this.mapMenu.hide();
        }
        if(this.settingsMenu!=null)
        {
            this.settingsMenu.hide();
        }
    },
  
    resize: function()
    {
        game.scale.resize(window.innerWidth, window.innerHeight);
        if(this.startMenu!=null)this.startMenu.resize();
        if(this.playersMenu!=null)this.playersMenu.resize();
        if(this.mapMenu!=null)this.mapMenu.resize();
        if(this.settingsMenu!=null)this.settingsMenu.resize();
    },
  
    showMagicPoints: function()
    {
        if(this.settingsMenu != null)
        {
            if(this.settingsMenu.items[0].options[this.settingsMenu.items[0].optionInd].value == SpellDistribution.random)
            {
                this.settingsMenu.items[1].visible = true;
            }
            else
            {
                this.settingsMenu.items[1].visible = false;
            }
        }
    }

});