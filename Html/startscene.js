//---------------------------- StartScene ----------------------------
const StartScene = new Phaser.Class({
    Extends: Phaser.Scene,
  
    startMenu: null,
    playersMenu: null,
    mapMenu: null,
  
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
            menuItems.push({label: "scenario: dungeon",action: null,options:[{text:"scenario: dungeon",value:0},{text:"scenario: dungeon2",value:1}]});
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
        this.deleteAllMenu();
        startScene.scene.start('GameScene');
        startScene.scene.launch('UIScene');
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
    },
  
    resize: function()
    {
        game.scale.resize(window.innerWidth, window.innerHeight);
        if(this.startMenu!=null)this.startMenu.resize();
        if(this.playersMenu!=null)this.playersMenu.resize();
        if(this.mapMenu!=null)this.mapMenu.resize();
    },

});