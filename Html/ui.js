
//---------------------------- UI classes ----------------------------
class TextButton extends Phaser.GameObjects.Text
{
    constructor(x, y, label, scene, callback)
    {
        super(scene, x, y, label);
        this.setOrigin(0.5);
        this.setPadding(10);
        this.setStyle({ backgroundColor: '#111' });
        this.setInteractive({ useHandCursor: true });
        const button = scene.add.existing(this);
        if(callback!=null)button.on('pointerdown', () => callback());
        button.on('pointerover', () => {if(!pointerBlocked)button.setStyle({ fill: '#f39c12' })});
        button.on('pointerout', () => button.setStyle({ fill: '#FFF' }));
    }
}

//---------------------------- Menu class ------------------------------
class MenuItem extends Phaser.GameObjects.BitmapText
{
    label = "Item";
    action = null;
    optionInd = 0;  
    options = null;
  
    constructor(x, y, label, scene, action, options)
    {
        super(scene, x, y, 'atari', label);
        this.setTint(0xFF0000);
        this.setFontSize(30);
        this.scene.add.existing(this);
        this.setInteractive({useHandCursor: true});
        this.label = label;
        this.action = action;
        this.options = options;
        if(this.options!=null)
        {
            this.text = this.options[this.optionInd].text;
            this.on('pointerdown', () => this.onClick());
        }
        else if(this.action!=null) this.on('pointerdown', () => this.action());
    }
  
    onClick()
    {
        if(this.options!=null)
        {
            this.optionInd++;
            if(this.optionInd >= this.options.length) this.optionInd = 0;
            this.text = this.options[this.optionInd].text;
        }
        if(this.action!=null) this.action();
    }
}

class Menu
{
    items = [];
    space = 0.5;
    size = 0.75;
    maxWidth = 600;
  
    height = 0;
    width = 0;
    itemHeight = 0;
    scale = 1.0;
    visible = true;
    
  
    constructor(scene, items)
    {
        let x = window.innerWidth / 2;
        let y = window.innerHeight / 2;
        for(let i=0;i<items.length;i++)
        {
            let MI = new MenuItem(x,y,items[i].label,scene,items[i].action,items[i].options);
            MI.setActive(false).setVisible(false);
            this.items.push(MI);
            if(MI.width > this.width) this.width = MI.width;
        }
        this.itemHeight = this.items[0].height;
        this.height = this.items.length * this.itemHeight + (this.items.length - 1) * this.itemHeight * this.space;
        //uiElements.push(this);
        this.draw();
        this.hide();
    }
  
    delete(){
        //uiElements.splice(uiElements.indexOf(this),1);
        for(let i=0;i<this.items.length;i++)
        {
            let MI = this.items[i];
            MI.destroy();
        }
        //this.destroy();
    }
  
    resize()
    { 
        let winRation = window.innerHeight/window.innerWidth;
        let scrollRatio = this.height/this.width;
        if(winRation < scrollRatio)
        {
            this.scale = window.innerHeight*this.size/this.height;
        }
        else
        {
            this.scale = window.innerWidth*this.size/this.width;
        }
        if(this.width*this.scale > this.maxWidth) this.scale = this.maxWidth/this.width;
        this.draw();
    }
  
    draw()
    {
        let x = window.innerWidth / 2;
        let y = window.innerHeight / 2;
        let top = y - this.height*this.scale/2;  
        for(let i=0;i<this.items.length;i++)
        {
            let MI = this.items[i];
            let ySpace = this.itemHeight*this.space*this.scale;
            MI.setPosition(x - this.width*this.scale/2, top + i*this.itemHeight*this.scale + i*ySpace);
            MI.scale = this.scale;
        }
    }
  
    show()
    {
        for(let i=0;i<this.items.length;i++)
        {
            let MI = this.items[i];
            MI.setActive(true).setVisible(true);
        }
        this.visible = true;
    }

    hide()
    {
        pointerPressed = true;
        for(let i=0;i<this.items.length;i++)
        {
            let MI = this.items[i];
            MI.setActive(false).setVisible(false);
        }
        this.visible = false;
    }
  
}

//---------------------------- Scroll class ----------------------------
const ScrollType = { ok: 'ok', yesno: 'yesno'};

class ScrollMsg extends Phaser.GameObjects.Image
{
    msgLabel = null;
    type = ScrollType.ok;
    okButton = null;
    yesButton = null;
    noButton = null;
    callback = null;

    constructor(scene, msg, callback, type)
    {
        let x = window.innerWidth / 2;
        let y = window.innerHeight / 2;
        super(scene, x, y, 'scroll');
        scene.add.existing(this);
		this.callback = callback;
        if(type) this.type=type;
        this.msgLabel = this.scene.add.bitmapText(this.x, this.y  - 0.1*this.height, 'atari', msg).setFontSize(26);
        this.msgLabel.setTint(0x333366);
        this.scene.add.existing(this.msgLabel);
        if(this.type === ScrollType.ok) {
            this.okButton = this.scene.add.bitmapText(this.x, this.y + (this.height - 0.5 * this.height) / 2, 'atari', 'OK').setFontSize(30);
            this.okButton.setTint(0xFF0000);
            this.scene.add.existing(this.okButton);
            this.okButton.setInteractive({useHandCursor: true});
            this.okButton.on('pointerdown', () => this.onClickOk());
        }
        else if(this.type === ScrollType.yesno) {
            this.yesButton = this.scene.add.bitmapText(this.x - 0.1 * this.width, this.y + (this.height - 0.5 * this.height) / 2, 'atari', 'YES').setFontSize(30);
            this.yesButton.setTint(0xFF0000);
            this.scene.add.existing(this.yesButton);
            this.yesButton.setInteractive({useHandCursor: true});
            this.yesButton.on('pointerdown', () => this.onClickYes());
            this.noButton = this.scene.add.bitmapText(this.x + 0.1 * this.width, this.y + (this.height - 0.5 * this.height) / 2, 'atari', 'NO').setFontSize(30);
            this.noButton.setTint(0xFF0000);
            this.scene.add.existing(this.noButton);
            this.noButton.setInteractive({useHandCursor: true});
            this.noButton.on('pointerdown', () => this.onClickNo());
        }
        uiElements.push(this);
        this.hide();
    }

    delete(){
        uiElements.splice(uiElements.indexOf(this),1);
        this.destroy();
    }

    resize()
    {
        this.setPosition(window.innerWidth / 2,window.innerHeight / 2);
        let win = Math.min(window.innerWidth,window.innerHeight);

        let winRation = window.innerHeight/window.innerWidth;
        let scrollRatio = this.height/this.width;
        if(winRation < scrollRatio)
        {
            this.scale = window.innerHeight*0.75/this.height;
        }
        else
        {
            this.scale = window.innerWidth*0.75/this.width;
        }
        this.msgLabel.scale = this.scale;
        this.msgLabel.setPosition(this.x - this.msgLabel.width/2, this.y - 0.1*this.height*this.scale);
        if(this.okButton){
            this.okButton.scale = this.scale;
            this.okButton.setPosition(this.x, this.y + (this.height-0.5*this.height)*this.scale/2);
        }
        if(this.yesButton){
            this.yesButton.scale = this.scale;
            this.yesButton.setPosition(this.x - this.yesButton.width/2 - 0.05*this.width*this.scale, this.y + (this.height-0.5*this.height)*this.scale/2);
        }
        if(this.noButton){
            this.noButton.scale = this.scale;
            this.noButton.setPosition(this.x + this.noButton.width/2 + 0.05*this.width*this.scale, this.y + (this.height-0.5*this.height)*this.scale/2);
        }
    }

    show()
    {
        this.resize();
        this.setActive(true).setVisible(true);
        this.msgLabel.setActive(true).setVisible(true);
        if(this.okButton)this.okButton.setActive(true).setVisible(true);
        if(this.yesButton)this.yesButton.setActive(true).setVisible(true);
        if(this.noButton)this.noButton.setActive(true).setVisible(true);
    }

    hide()
    {
        pointerPressed = true;
        this.setActive(false).setVisible(false);
        this.msgLabel.setActive(false).setVisible(false);
        if(this.okButton)this.okButton.setActive(false).setVisible(false);
        if(this.yesButton)this.yesButton.setActive(false).setVisible(false);
        if(this.noButton)this.noButton.setActive(false).setVisible(false);
    }

    onClickOk()
    {
        pointerPressed = true;
        this.hide();
		let cb = this.callback;
		this.delete();
		if(cb != null)cb(true);
    }

    onClickYes()
    {
        pointerPressed = true;
        this.hide();
        let cb = this.callback;
        this.delete();
        if(cb != null)cb(true);
    }

    onClickNo()
    {
        pointerPressed = true;
        this.hide();
        let cb = this.callback;
        this.delete();
        if(cb != null)cb(false);
    }
}

//---------------------------- RangeRenderer class ----------------------------
class RangeRenderer extends Phaser.GameObjects.RenderTexture
{
    circleX = 0;
    circleY = 0;
    radius = 0;

    constructor(scene, x, y)
    {
        super(scene, groundLayer.x, groundLayer.y, groundLayer.width, groundLayer.height);
        scene.add.existing(this);
        this.visible = false;
        this.active = false;
    }

    showAtUnit(unit,radius)
    {
        this.showAt(unit.x, unit.y, radius);
    }

    showAt(x,y,radius)
    {
        this.circleX = x - groundLayer.x;
        this.circleY = y - groundLayer.y;
        this.radius = radius;
        this.visible = true;
        this.active = true;
        this.redraw();
    }

    redraw()
    {
        this.clear();
        this.fill(0x000000, 0.5);
        var circle = this.scene.add.circle(this.circleX, this.circleY, this.radius, 0x000000);
        circle.setVisible(false);
        this.erase(circle,this.circleX,this.circleY);
        circle.destroy();
    }

    hide()
    {
        this.visible = false;
        this.active = false;
    }
}

//---------------------------- PlaceSelector class ----------------------------
class PlaceSelector
{
    static scene = null;
    static places = [];
    static icons = [];

    callbackObject = null;

    constructor(scene)
    {
        PlaceSelector.scene = scene;
    }

    show(places, callbackObj)
    {
        this.callbackObject = callbackObj;
        PlaceSelector.places = [];
        PlaceSelector.places = places.slice();
        PlaceSelector.icons = [];
        places.forEach( x => {
            let pos = map.tileToWorldXY(x[0], x[1]);
            let circle = PlaceSelector.scene.add.circle(pos.x + 8, pos.y + 8, 2, 0x00FF00);
            PlaceSelector.icons.push(circle);
            circle.setDepth(10000);
        });
        pointerBlocked = false;
    }

    hide()
    {
        PlaceSelector.icons.forEach( icon => icon.destroy() );
        PlaceSelector.icons = [];
        PlaceSelector.places = [];
    }

    check(x,y)
    {
        for(let i=0;i<PlaceSelector.places.length;i++)
        {
            if((PlaceSelector.places[i][0]==x)&&(PlaceSelector.places[i][1]==y))return true;
        }
        return false;
    }

    select(x,y)
    {
        if(this.callbackObject != null)this.callbackObject.setPlace(x,y);
    }
}

//---------------------------- Arrow class ----------------------------

const ArrowType = { U: 'up', RU: 'right-up', R: 'right', RD: 'right-down', D: 'down', LD: 'left-down', L: 'left', LU: 'left-up' };
const ArrowState = { disable: 'disabel', green: 'green', red: 'red'};

class Arrow extends Phaser.GameObjects.Image
{
    state = ArrowState.disable;
    type = ArrowType.U;
    mapOffsetX = 0;
    mapOffsetY = 0;

    constructor(type, scene, x, y, texture, frame)
    {
        super(scene, x, y, texture, frame);
        //this.scale = 0.5;
        this.scale = 0.065;
        scene.add.existing(this);
        this.setDepth(10000);
        this.type = type;
        switch (type) {
            case ArrowType.U:
                this.rotation = -0.5*Math.PI;
                this.mapOffsetX = 0;
                this.mapOffsetY = -1;
                break;
            case ArrowType.RU:
                this.rotation = -0.25*Math.PI;;
                this.mapOffsetX = 1;
                this.mapOffsetY = -1;
                break;
            case ArrowType.R:
                this.rotation = 0;
                this.mapOffsetX = 1;
                this.mapOffsetY = 0;
                break;
            case ArrowType.RD:
                this.rotation = 0.25*Math.PI;;
                this.mapOffsetX = 1;
                this.mapOffsetY = 1;
                break;
            case ArrowType.D:
                this.rotation = 0.5*Math.PI;;
                this.mapOffsetX = 0;
                this.mapOffsetY = 1;
                break;
            case ArrowType.LD:
                this.rotation = 0.75*Math.PI;;
                this.mapOffsetX = -1;
                this.mapOffsetY = 1;
                break;
            case ArrowType.L:
                this.rotation = -Math.PI;;
                this.mapOffsetX = -1;
                this.mapOffsetY = 0;
                break;
            case ArrowType.LU:
                this.rotation = -0.75*Math.PI;;
                this.mapOffsetX = -1;
                this.mapOffsetY = -1;
                break;
        }
        this.setPosition(x + this.mapOffsetX*16, y + this.mapOffsetY*16);
        this.visible = false;
        this.active = false;
    }

    setPositionToUnit(unit)
    {
        this.setPosition(unit.x + this.mapOffsetX*16, unit.y + this.mapOffsetY*16);
    }

    setState(st)
    {
        this.state=st;
        if(st != ArrowState.disable)
        {
            this.visible = true;
            this.active = true;
            if(st == ArrowState.green)
            {
                //this.clearTint();
                this.setTint(0x00ff00);
                //this.setTintFill(0x00ff00);
            }
            else
            {
                this.setTint(0xff0000);
                //this.setTintFill(0xff0000);
            }
        }
        else
        {
            this.visible = false;
            this.active = false;
        }
    }
}

