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
        this.startMenu = new Menu(this, [{label: "start game",action: ()=>startScene.selectMap()},{label: "settings",action: null}]);
        this.resize();
        window.addEventListener('resize', ()=>startScene.resize());
        this.startMenu.show();

    },
  
    showStartMenu: function()
    {
        this.deleteAllMenu();
        this.startMenu.show();
    },
  
    selectMap: function()
    {
        this.startMenu.hide();
        //this.deleteAllMenu();
        this.hideAllMenu();
        if(this.mapMenu==null)
        {
            menuItems = [];
            mapOptions = [];
            for(let m of maps)mapOptions.push({text:"scenario: " + m,value:m});
            menuItems.push({label: "scenario: dungeon",action: null,options:mapOptions});
            menuItems.push({label: "settins",action:()=>startScene.showSettingsMenu()});
            menuItems.push({label: "",action:null});
            menuItems.push({label: "start game",action:()=>startScene.selectPlayers()});
            menuItems.push({label: "return",action:()=>startScene.showStartMenu()});
            this.mapMenu = new Menu(this, menuItems);  
            this.mapMenu.items[0].optionInd = 0;
            this.mapMenu.items[0].text = this.mapMenu.items[0].options[this.mapMenu.items[0].optionInd].text;
        }
        this.resize();
        this.mapMenu.show();
    },
  
    showSettingsMenu: function()
    {
        //this.deleteAllMenu();
        this.hideAllMenu();
        if(this.settingsMenu==null)
        {
            menuItems = [];
            spellOptions = [{text:"spells: random",value:SpellDistribution.random},{text:"spells: unlimited",value:SpellDistribution.unlimited}];
            magicPoints = [{text:"magic points: 25",value: 25},{text:"magic points: 50",value: 50},{text:"magic points: 75",value: 75},{text:"magic points: 100",value: 100}];
            menuItems.push({label: "spells: unlimited",action: ()=>startScene.showMagicPoints(),options:spellOptions});
            menuItems.push({label: "magic points: 100",action: null,options:magicPoints});
            menuItems.push({label: "show enemy moves off",action: null,options:[{text:"show enemy moves on",value:true},{text:"show enemy moves off",value:false},]});
            menuItems.push({label: "",action:null});
            menuItems.push({label: "return",action:()=>startScene.selectMap()});
            this.settingsMenu = new Menu(this, menuItems); 
            this.settingsMenu.items[0].optionInd = 0;
            this.settingsMenu.items[0].text = this.settingsMenu.items[0].options[this.settingsMenu.items[0].optionInd].text;
            this.settingsMenu.items[1].optionInd = 0;
            this.settingsMenu.items[1].text = this.settingsMenu.items[1].options[this.settingsMenu.items[1].optionInd].text;
            this.settingsMenu.items[2].optionInd = 0;
            this.settingsMenu.items[2].text = this.settingsMenu.items[2].options[this.settingsMenu.items[2].optionInd].text;
            this.showMagicPoints();
        }
        this.resize();
        this.settingsMenu.show();
        this.showMagicPoints();
    },
  
    selectPlayers: function()
    {
        //this.deleteAllMenu();
        this.hideAllMenu();
        if(this.playersMenu==null)
        {
            playersCount = 4;
            menuItems = [];
            for(let i=0;i<playersCount;i++)
            {
                menuItems.push({label: "player 1 computer",action: null,options:[{text:"player "+(i+1)+" computer",value:PlayerControl.computer},{text:"player "+(i+1)+" human",value:PlayerControl.human},{text:"player "+(i+1)+" off",value:null}]});
            }
            menuItems.push({label: "",action:null});
            menuItems.push({label: "start game",action:()=>startScene.startGame()});
            menuItems.push({label: "return",action:()=>startScene.selectMap()});
            this.playersMenu = new Menu(this, menuItems);  
            this.playersMenu.items[0].optionInd = 1;
            this.playersMenu.items[0].text = this.playersMenu.items[0].options[this.playersMenu.items[0].optionInd].text;
        }
        this.resize();
        this.playersMenu.show();
    },
  
    startGame: function()
    {
        this.setPalyersSetting();
        let playersCount = 0;
        for(let i=0;i<playersSettings.length;i++)
            if(playersSettings[i].control != null) playersCount++;
        if(playersCount < 2) return;
        gameSettings.selectedMap = this.mapMenu.items[0].options[this.mapMenu.items[0].optionInd].value;
        if(this.settingsMenu != null)
        {
            gameSettings.spellDistrib = this.settingsMenu.items[0].options[this.settingsMenu.items[0].optionInd].value;
            gameSettings.magicPoints = this.settingsMenu.items[1].options[this.settingsMenu.items[1].optionInd].value;
            gameSettings.showEnemyMoves = this.settingsMenu.items[2].options[this.settingsMenu.items[2].optionInd].value;
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
  
    deleteAllMenu: function()
    {
        if(this.playersMenu!=null)
        {
            this.playersMenu.delete();
            this.playersMenu = null;
        }
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