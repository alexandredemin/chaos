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
        this._initTurnTransition();
        resize();
        book = new MagicBook(this);
        startTurn();
    },

    _initTurnTransition: function () {
        const w = this.scale.width;
        const h = this.scale.height;

        this.smokeContainer = this.add.container(0, 0);
        this.smokeContainer.setVisible(false);

        this.smokeTweens = [];
        this.smokeMeta = [];

        const cols = 8;
        const rows = 6;

        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {

                const px = (x + 0.5) * (w / cols);
                const py = (y + 0.5) * (h / rows);

                const smoke = this.add.image(px, py, 'gas');

                smoke.setAlpha(0.5 + Math.random() * 0.25);
                smoke.setRotation(Math.random() * Math.PI * 2);
                smoke.setPipeline('Gray');

                const scale = 5 + Math.random() * 2;
                smoke.setScale(scale);

                const relativeScale = (smoke.displayWidth) / Math.max(w, h);
                this.smokeMeta.push({
                    relativeScale,
                });

                this.smokeContainer.add(smoke);

                const tween = this.tweens.add({
                    targets: smoke,
                    rotation: smoke.rotation + Phaser.Math.PI2,
                    duration: 20000 + Math.random() * 10000,
                    repeat: -1,
                    ease: 'Linear'
                });

                tween.pause();
                this.smokeTweens.push(tween);
            }
        }
    },

    showTurnTransition: function () {
        this.smokeContainer.setVisible(true);

        for (let t of this.smokeTweens) {
            t.resume();
        }

        this.smokeContainer.alpha = 0;
        this.tweens.add({
            targets: this.smokeContainer,
            alpha: 1,
            duration: 300,
            ease: 'Sine.easeOut'
        });
    },

    hideTurnTransition: function () {
        this.tweens.add({
            targets: this.smokeContainer,
            alpha: 0,
            duration: 300,
            ease: 'Sine.easeIn',
            onComplete: () => {
                this.smokeContainer.setVisible(false);

                for (let t of this.smokeTweens) {
                    t.pause();
                }
            }
        });
    },

    resizeSmokeContainer: function () {
        if (!this.smokeContainer) return;
        const w = this.scale.width;
        const h = this.scale.height;

        const cols = 8;
        const rows = 6;

        let i = 0;
        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                const smoke = this.smokeContainer.list[i];
                const meta = this.smokeMeta[i];
                i++;
                if (!smoke || !meta) continue;
                smoke.x = (x + 0.5) * (w / cols);
                smoke.y = (y + 0.5) * (h / rows);
                const targetSize = meta.relativeScale * Math.max(w, h);
                const scale = targetSize / smoke.width;
                smoke.setScale(scale);
            }
        }
    },

});