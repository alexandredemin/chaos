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
        resize();
        book = new MagicBook(this);
        startTurn();
    },

});