//---------------------------- UIScene ----------------------------
const UIScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize:

        function UIScene()
        {
            Phaser.Scene.call(this, { key: 'UIScene' });
        },

    create: function ()
    {
        uiScene = this;
        buttonEndTurn = new TextButton(10,10,'End turn',this,function(){if(!pointerBlocked)onEndTurn();});
        //+debug
        buttonAIStep = new TextButton(120,10,'AI step',this,function(){if (selectedUnit != null){
                selectedUnit.player.aiControl.computeEnemyAttackMaps();
                selectedUnit.player.aiControl.stepUnit(selectedUnit);
            }
        });
        //-
        resize();
        book = new MagicBook(this);
        startTurn();
    },

});