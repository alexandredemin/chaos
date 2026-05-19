//---------------------------- Debug classes ----------------------------
class DebugOverlay {
    constructor(scene, x = 10, y = 10) {
        this.scene = scene;
        this.lines = [];
        this.textObject = scene.add.text(x, y, "", {
            fontSize: "14px",
            fontFamily: "monospace",
            fill: "#00ff00",
            align: "left"
        });
        this.textObject.setDepth(9999); // Make sure it's on top
    }

    log(message) {
        this.lines.push(message);
        if (this.lines.length > 20) { // max 20 lines
            this.lines.shift();
        }
        this.refresh();
    }

    clear() {
        this.lines = [];
        this.refresh();
    }

    refresh() {
        this.textObject.setText(this.lines.join("\n"));
    }
}


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

//---------------------------- PickUpPanel class ----------------------------
class PickUpPanel
{
    constructor(scene)
    {
        this.scene = scene;
        this.visible = false;
        this.callbackObject = null;
        this.itemEntity = null;
        this.unit = null;
        this.scrollOffset = 0;
        this.maxVisibleItems = 5;
        this.itemButtons = [];
        this.itemRowBgs = [];
        this.itemLabels = [];
        this.itemIcons = [];

        this.overlay = scene.add.rectangle(0, 0, scene.scale.width, scene.scale.height, 0x000000, 0.45)
        .setOrigin(0, 0)
        .setDepth(20000)
        .setInteractive();
        this.overlay.on('pointerdown', () => {});
        this.overlay.setVisible(false);

        this.bg = scene.add.rectangle(0, 0, 340, 280, 0x111111, 0.96)
        .setOrigin(0, 0)
        .setStrokeStyle(2, 0x666666, 1)
        .setDepth(20001);
        this.bg.setVisible(false);

        this.title = scene.add.text(0, 0, 'Pick up item', {
            fontSize: '20px',
            color: '#ffffff'
        }).setDepth(20002);
        this.title.setVisible(false);

        this.capacityText = scene.add.text(0, 0, '', {
            fontSize: '14px',
            color: '#cccccc'
        }).setDepth(20002);
        this.capacityText.setVisible(false);

        this.btnUp = new TextButton(0, 0, '▲', scene, () => this.scroll(-1));
        this.btnUp.setDepth(20002);
        this.btnUp.setVisible(false);

        this.btnDown = new TextButton(0, 0, '▼', scene, () => this.scroll(1));
        this.btnDown.setDepth(20002);
        this.btnDown.setVisible(false);

        this.btnCancel = new TextButton(0, 0, 'Cancel', scene, () => this.hide(null));
        this.btnCancel.setDepth(20002);
        this.btnCancel.setVisible(false);

        this.layout();
    }

    clearItemRows()
    {
        for(let i = 0; i < this.itemButtons.length; i++) this.itemButtons[i].destroy();
        this.itemButtons = [];
        for(let i = 0; i < this.itemRowBgs.length; i++) this.itemRowBgs[i].destroy();
        this.itemRowBgs = [];
        for(let i = 0; i < this.itemLabels.length; i++) this.itemLabels[i].destroy();
        this.itemLabels = [];
        for(let i = 0; i < this.itemIcons.length; i++) this.itemIcons[i].destroy();
        this.itemIcons = [];
    }

    layout()
    {
        const w = this.scene.scale.width;
        const h = this.scene.scale.height;

        this.overlay.setSize(w, h);

        const panelW = 340;
        const panelH = 280;
        const x = Math.round((w - panelW) / 2);
        const y = Math.round((h - panelH) / 2);

        this.bg.setPosition(x, y);
        this.bg.setSize(panelW, panelH);

        this.title.setPosition(x + 16, y + 12);
        this.capacityText.setPosition(x + 16, y + 40);

        this.btnUp.setPosition(x + panelW - 30, y + 55);
        this.btnDown.setPosition(x + panelW - 30, y + panelH - 55);
        this.btnCancel.setPosition(x + panelW / 2, y + panelH - 24);

        this.renderItems();
    }

    show(itemEntity, unit, callbackObject)
    {
        this.itemEntity = itemEntity;
        this.unit = unit;
        this.callbackObject = callbackObject;
        this.scrollOffset = 0;
        this.visible = true;
        pointerBlocked = true;

        this.overlay.setVisible(true);
        this.bg.setVisible(true);
        this.title.setVisible(true);
        this.capacityText.setVisible(true);
        this.btnCancel.setVisible(true);

        this.layout();
        this.renderItems();
    }

    hide(result)
    {
        this.visible = false;
        pointerBlocked = false;

        this.overlay.setVisible(false);
        this.bg.setVisible(false);
        this.title.setVisible(false);
        this.capacityText.setVisible(false);
        this.btnUp.setVisible(false);
        this.btnDown.setVisible(false);
        this.btnCancel.setVisible(false);

        this.clearItemRows();

        const cb = this.callbackObject;
        this.callbackObject = null;
        this.itemEntity = null;
        this.unit = null;

        if(cb != null && typeof cb.onCallback === 'function')
        {
            cb.onCallback(result);
        }
    }

    scroll(delta)
    {
        if(this.itemEntity == null) return;

        const items = this.itemEntity.getItems();
        const maxOffset = Math.max(0, items.length - this.maxVisibleItems);

        this.scrollOffset += delta;
        if(this.scrollOffset < 0) this.scrollOffset = 0;
        if(this.scrollOffset > maxOffset) this.scrollOffset = maxOffset;

        this.renderItems();
    }

    renderItems()
    {
        this.clearItemRows();
        if(!this.visible || this.itemEntity == null || this.unit == null) return;

        const items = this.itemEntity.getItems();
        const panelX = this.bg.x;
        const panelY = this.bg.y;

        const listStartY = panelY + 78;
        const rowHeight = 32;
        const rowX = panelX + 14;
        const rowWidth = 280;
        const iconX = rowX + 16;
        const textX = rowX + 34;
        const maxIconSize = 18;

        this.capacityText.setText('Capacity: ' + this.unit.getItemCount() + '/' + this.unit.getItemCapacity());

        const maxOffset = Math.max(0, items.length - this.maxVisibleItems);
        this.btnUp.setVisible(this.scrollOffset > 0);
        this.btnDown.setVisible(this.scrollOffset < maxOffset);

        for(let i = 0; i < this.maxVisibleItems; i++)
        {
            const itemIndex = this.scrollOffset + i;
            if(itemIndex >= items.length) break;

            const item = items[itemIndex];
            const rowY = listStartY + i * rowHeight;
            const label = item.getDisplayName();

            const rowBg = this.scene.add.rectangle(rowX + rowWidth / 2, rowY, rowWidth, 26, 0x1a1a1a, 0.95);
            rowBg.setStrokeStyle(1, 0x4b5563, 1);
            rowBg.setDepth(20002);
            rowBg.setInteractive({ useHandCursor: true });
            rowBg.on('pointerover', () => {rowBg.setFillStyle(0x2a2a2a, 0.98);});
            rowBg.on('pointerout', () => {rowBg.setFillStyle(0x1a1a1a, 0.95);});
            rowBg.on('pointerdown', () =>{this.hide({ itemIndex: itemIndex });});
            this.itemRowBgs.push(rowBg);

            if(item.config != null && item.config.sprite != null && item.config.sprite !== '')
            {
                const icon = this.scene.add.image(iconX, rowY, item.config.sprite);
                icon.setOrigin(0.5, 0.5);
                const frame = icon.texture ? icon.texture.get() : null;
                if(frame != null && frame.width > 0 && frame.height > 0)
                {
                    const scale = Math.min(maxIconSize / frame.width, maxIconSize / frame.height);
                    icon.setScale(scale);
                }
                icon.setDepth(20003);
                this.itemIcons.push(icon);
            }

            const text = this.scene.add.text(textX, rowY - 9, label, {fontSize: '14px', color: '#ffffff'});
            text.setOrigin(0, 0);
            text.setDepth(20003);
            this.itemLabels.push(text);

            this.itemButtons.push(rowBg);
        }
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
            if((PlaceSelector.places[i][0]==x)&&(PlaceSelector.places[i][1]==y)) return true;
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

//----------------------------- Fog of War class -----------------------------
class FogLayer {
    constructor(scene, width, height, tileSize, gradientKey, radius) {
        this.scene = scene;
        this.tileSize = tileSize;
        this.radius = radius;
        this.gradientKey = gradientKey;

        this.rt = new Phaser.GameObjects.RenderTexture(
            scene,
            groundLayer.x,
            groundLayer.y,
            width * tileSize,
            height * tileSize
        );
        scene.add.existing(this.rt);
        this.rt.setDepth(9999);
    }

    clearAll() {
        this.rt.clear();
        this.rt.fill(0x000000, 1);
    }

    redrawAll(fogExplored) {
        this.clearAll();

        const t = this.tileSize;
        const r = this.radius;

        for (let y = 0; y < fogExplored.length; y++) {
            for (let x = 0; x < fogExplored[y].length; x++) {
                if (!fogExplored[y][x]) continue;
                this.rt.erase(
                    this.gradientKey,
                    x * t + t / 2 - r,
                    y * t + t / 2 - r
                );
            }
        }
    }

    revealTiles(tiles) {
        const t = this.tileSize;
        const r = this.radius;

        for (const { x, y } of tiles) {
            this.rt.erase(
                this.gradientKey,
                x * t + t / 2 - r,
                y * t + t / 2 - r
            );
        }
    }

    setVisible(v) {
        this.rt.visible = v;
    }
}


