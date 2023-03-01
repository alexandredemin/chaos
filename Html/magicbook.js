//---------------------------- Magic book class ------------------------
class spellDescription extends Phaser.GameObjects.Image
{
    spell = null;
    textObj = null;
    indent = 45;
    baseScale = 1.0;
    textWidth = 0;

    constructor(scene, x, y, spell, scale, textWidth)
    {
        super(scene, x, y, spell.icon);
        this.baseScale = scale;
        this.textWidth = textWidth;
        this.spell = spell;
        this.displayOriginX = 0;
        this.displayOriginY = 0;
        this.scale = spell.scale * scale;
        this.textObj = this.scene.add.bitmapText(x + this.indent * scale, y, 'atari', spell.description).setFontSize(16);
        this.textObj.scale = scale;
        this.textObj.maxWidth = textWidth * scale;
        this.textObj.setTint(0x333333);
        this.textObj.setTint(0x333366);
        scene.add.existing(this);
        scene.add.existing(this.textObj);
        this.hide();
    }

    show()
    {
        this.setActive(true).setVisible(true);
        this.textObj.setActive(true).setVisible(true);
    }

    hide()
    {
        this.setActive(false).setVisible(false);
        this.textObj.setActive(false).setVisible(false);
    }

    setScale(x)
    {
        this.baseScale = x;
        this.scale = this.spell.scale * x;
        this.textObj.scale = x;
        this.textObj.x = this.x + this.indent * x;
        this.textObj.maxWidth = this.textWidth * x;
    }

    setPosition(x,y)
    {
        super.setPosition(x,y);
        if(this.textObj != null)this.textObj.setPosition(x + this.indent * this.baseScale, y);
    }
}

class MagicBook extends Phaser.GameObjects.Image
{
    ball = null;
    mana = 0;
    manaLabel = null;
    cancelB = null;
    leftB = null;
    rightB = null;
    callbackObject = null;
    page = 0;
    spellDescriptions = [];

    constructor(scene)
    {
        let x = window.innerWidth / 2;
        let y = window.innerHeight / 2;
        super(scene, x, y, 'book');
        scene.add.existing(this);
        this.cancelB = new Phaser.GameObjects.Image(scene, this.x + (this.width-100)/2, this.y - (this.height-70)/2, 'x');
        this.cancelB.scale = 0.35;
        scene.add.existing(this.cancelB);
        this.rightB = new Phaser.GameObjects.Image(scene, this.x + (this.width-100)/2, this.y + (this.height-70)/2, 'arrow');
        this.rightB.scale = 0.35;
        scene.add.existing(this.rightB);
        this.leftB = new Phaser.GameObjects.Image(scene, this.x - (this.width-100)/2, this.y + (this.height-70)/2, 'arrow');
        this.leftB.scale = 0.35;
        this.leftB.rotation = -Math.PI;
        scene.add.existing(this.leftB);
        this.ball = new Phaser.GameObjects.Image(scene, this.x, this.y + (this.height-0.07*this.height)/2, 'magic_ball');
        this.ball.scale = 0.4;
        this.ball.setDepth(1);
        scene.add.existing(this.ball);
        this.manaLabel = this.scene.add.bitmapText(this.x, this.y + (this.height-0.07*this.height)/2, 'atari', '200',26).setOrigin(0.5,0.5).setDropShadow(2, 2, 0X000000, 0.5);
        this.manaLabel.setTint(0xFFFFFF);
        scene.add.existing(this.manaLabel);
        this.manaLabel.setDepth(2);
        this.hide();
        this.cancelB.setInteractive({ useHandCursor: true });
        this.cancelB.on('pointerdown', () => this.hide(null) );
        this.rightB.setInteractive({ useHandCursor: true });
        this.rightB.on('pointerdown', () => this.showPage(this.page+1) );
        this.leftB.setInteractive({ useHandCursor: true });
        this.leftB.on('pointerdown', () => this.showPage(this.page-1) );
        this.cancelB.setDepth(100);
        this.leftB.setDepth(100);
        this.rightB.setDepth(100);
    }

    resize()
    {
        this.setPosition(window.innerWidth / 2,window.innerHeight / 2);
        let win = Math.min(window.innerWidth,window.innerHeight);

        let winRation = window.innerHeight/window.innerWidth;
        let bookRatio = this.height/this.width;
        if(winRation < bookRatio)
        {
            this.scale = window.innerHeight*0.99/this.height;
        }
        else
        {
            this.scale = window.innerWidth*0.99/this.width;
        }
        this.ball.setPosition(this.x, this.y + (this.height-0.07*this.height)*this.scale/2);
        this.ball.scale = 0.4 * this.scale;
        this.manaLabel.setPosition(this.x, this.y + (this.height-0.07*this.height)*this.scale/2);
        this.manaLabel.scale = this.scale;
        this.cancelB.setPosition(this.x + (this.width - 0.12*this.width)*this.scale/2, this.y - (this.height  - 0.2*this.height)*this.scale/2);
        this.cancelB.scale = 0.35 * this.scale;
        this.leftB.setPosition(this.x - (this.width - 0.12*this.width)*this.scale/2, this.y + (this.height  - 0.2*this.height)*this.scale/2);
        this.leftB.scale = 0.35 * this.scale;
        this.rightB.setPosition(this.x + (this.width - 0.12*this.width)*this.scale/2, this.y + (this.height  - 0.2*this.height)*this.scale/2);
        this.rightB.scale = 0.35 * this.scale;

        this.spellDescriptions.forEach( x => x.setScale(this.scale) );
        this.adjastSpellPositions();
    }

    adjastSpellPositions()
    {
        let colX = [this.x-this.displayWidth/2 + 0.095 * this.displayWidth, this.x + 0.03* this.displayWidth];
        let topRowY = (this.y - this.displayHeight/2) + this.displayHeight * 0.1;
        for(let i=0;i<this.spellDescriptions.length;i++)
        {
            let row = i%3;
            let col = Math.floor((i%6)/3);
            this.spellDescriptions[i].setPosition(colX[col], topRowY + row * this.displayHeight*0.9/3);
        }
    }

    showLeft()
    {
        this.leftB.setActive(true).setVisible(true);
    }

    hideLeft()
    {
        this.leftB.setActive(false).setVisible(false);
    }

    showRight()
    {
        this.rightB.setActive(true).setVisible(true);
    }

    hideRight()
    {
        this.rightB.setActive(false).setVisible(false);
    }

    showPage(ind)
    {
        pointerPressed = true;
        if(ind > Math.floor(this.spellDescriptions.length/6)) return;
        this.page = ind;
        this.spellDescriptions.forEach( x => {x.hide(); x.disableInteractive();} );
        this.spellDescriptions.forEach( x => {x.hide();} );
        for(let i=ind*6; i<Math.min((ind+1)*6,this.spellDescriptions.length); i++)
        {
            this.spellDescriptions[i].show();
            this.spellDescriptions[i].setInteractive();
        }
        if(ind > 0)
        {
            this.showLeft();
        }
        else
        {
            this.hideLeft();
        }
        if(ind < Math.ceil(this.spellDescriptions.length/6)-1)
        {
            this.showRight();
        }
        else
        {
            this.hideRight();
        }
    }

    showSpells()
    {
        for(let i=0;i<this.spells.length;i++)
        {
            let page = Math.floor(i/6);
            let spellD = new spellDescription(this.scene, this.x, this.y , spellConfigs[this.spells[i]], this.scale, this.width/2 - 0.15 * this.width);
            this.spellDescriptions.push( spellD );
            this.scene.add.existing(spellD);
            if(spellD.spell.cost <= this.mana)
            {
                let shape = new Phaser.Geom.Rectangle(0, 0, (spellD.textObj.width+spellD.indent*this.scale)*spellD.width/spellD.displayWidth , Math.max(spellD.height,spellD.textObj.height*spellD.height/spellD.displayHeight) );
                spellD.setInteractive({hitArea: shape, hitAreaCallback: Phaser.Geom.Rectangle.Contains, useHandCursor: true});
                spellD.on('pointerdown', this.onSpellDown.bind(this,spellD) );
            }
            else
            {
                spellD.setPipeline('Gray');
                spellD.textObj.setTint(0x555555);
            }
        }
        this.adjastSpellPositions();
        this.showPage(0);
    }

    onSpellDown(spellDesc)
    {
        pointerPressed = true;
        if(spellDesc.spell != null)
        {
            this.hide(spellDesc.spell);
            //console.log(spellDesc.spell.name);
            //this.scene.input.enableDebug(spellDesc, 0xff0000);
        }
        else
        {
            this.hide();
        }
    }

    show(callbackObject, mana)
    {
        this.callbackObject = callbackObject;
        this.mana = mana;
        this.resize();
        this.setActive(true).setVisible(true);
        this.ball.setActive(true).setVisible(true);
        this.manaLabel.setActive(true).setVisible(true);
        this.cancelB.setActive(true).setVisible(true);
        this.manaLabel.setText(this.mana);

        this.spells = ['goblin', 'troll', 'imp', 'chort', 'demon', 'muddy', 'rat', 'spider','fire','glue_blob','fireball','lightning','pentagram'];
        this.showSpells();
    }

    hide(res)
    {
        pointerPressed = true;
        this.setActive(false).setVisible(false);
        this.ball.setActive(false).setVisible(false);
        this.manaLabel.setActive(false).setVisible(false);
        this.cancelB.setActive(false).setVisible(false);
        this.leftB.setActive(false).setVisible(false);
        this.rightB.setActive(false).setVisible(false);
        this.spellDescriptions.forEach( x => {x.hide(); x.removeInteractive();} );
        this.spellDescriptions.forEach( x => {x.hide();} );
        this.spellDescriptions = [];
        if(this.callbackObject != null)this.callbackObject.onCallback(res);
        this.callbackObject = null;
    }
}