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
/*
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
*/
class TextButton extends Phaser.GameObjects.Container
{
	constructor(x, y, label, scene, callback)
	{
		super(scene, x, y);

		this.scene = scene;
		this.label = label;
		this.callback = callback;

		this.uiScale = 1.0;
		this.baseFontSize = 18;
		this.basePaddingX = 14;
		this.basePaddingY = 8;

		this.bgNormalFill = 0x111111;
		this.bgHoverFill = 0x2a2a2a;
		this.bgNormalAlpha = 0.96;
		this.bgHoverAlpha = 0.98;
		this.bgNormalStroke = 0x666666;
		this.bgHoverStroke = 0xaaaaaa;

		this.bg = scene.add.rectangle(0, 0, 10, 10, this.bgNormalFill, this.bgNormalAlpha);
		this.bg.setOrigin(0, 0);
		this.bg.setStrokeStyle(1, this.bgNormalStroke, 1);

		this.textObject = scene.add.text(0, 0, label, {
			fontSize: this.baseFontSize + 'px',
			color: '#ffffff',
			align: 'center'
		});
		this.textObject.setOrigin(0, 0);

		this.add(this.bg);
		this.add(this.textObject);

		scene.add.existing(this);

		this.buttonWidth = 10;
		this.buttonHeight = 10;

		this.applyMetrics();
		this.enableInput();
	}

	enableInput()
	{
		this.bg.setInteractive({ useHandCursor: true });

		this.bg.on('pointerdown', () =>
		{
			if(this.callback != null) this.callback();
		});

		this.bg.on('pointerover', () =>
		{
			this.bg.setFillStyle(this.bgHoverFill, this.bgHoverAlpha);
			this.bg.setStrokeStyle(1, this.bgHoverStroke, 1);
		});

		this.bg.on('pointerout', () =>
		{
			this.bg.setFillStyle(this.bgNormalFill, this.bgNormalAlpha);
			this.bg.setStrokeStyle(1, this.bgNormalStroke, 1);
		});
	}

	applyMetrics()
	{
		const fontSize = Math.round(this.baseFontSize * this.uiScale);
		const paddingX = Math.round(this.basePaddingX * this.uiScale);
		const paddingY = Math.round(this.basePaddingY * this.uiScale);

		this.textObject.setFontSize(fontSize);
		this.textObject.setText(this.label);

		const width = Math.ceil(this.textObject.width + paddingX * 2);
		const height = Math.ceil(this.textObject.height + paddingY * 2);

		this.buttonWidth = width;
		this.buttonHeight = height;

		// Фон рисуем от левого верхнего угла, но сам контейнер остаётся центрированным
		this.bg.setPosition(-width / 2, -height / 2);
		this.bg.setSize(width, height);
		this.bg.setDisplaySize(width, height);

		// Текст центрируем вручную
		this.textObject.setPosition(-this.textObject.width / 2, -this.textObject.height / 2);

		// Обновляем hit area фона
		if(this.bg.input && this.bg.input.hitArea)
		{
			this.bg.input.hitArea.setTo(0, 0, width, height);
		}

		this.setSize(width, height);
	}

	setText(label)
	{
		this.label = label;
		this.applyMetrics();
		return this;
	}

	setScale(x, y = x)
	{
		// Для UI используем scale как коэффициент перерасчёта размеров
		this.uiScale = x;
		this.applyMetrics();
		return this;
	}

	setDepth(depth)
	{
		super.setDepth(depth);
		this.bg.setDepth(depth);
		this.textObject.setDepth(depth + 0.01);
		return this;
	}

	setVisible(visible)
	{
		super.setVisible(visible);
		this.bg.setVisible(visible);
		this.textObject.setVisible(visible);
		return this;
	}

	setPosition(x, y)
	{
		super.setPosition(x, y);
		return this;
	}

	destroy(fromScene)
	{
		if(this.bg) this.bg.destroy();
		if(this.textObject) this.textObject.destroy();
		super.destroy(fromScene);
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
		this.metrics = null;

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

		this.scrollInfoText = scene.add.text(0, 0, '', {
			fontSize: '14px',
			color: '#bbbbbb'
		}).setDepth(20002);
		this.scrollInfoText.setVisible(false);

		// Только стрелки, без подложек
		this.btnUpArrow = scene.add.triangle(
			0, 0,
			0, 50,
			100, 50,
			50, 0,
			0xd8d8d8, 0.92
		).setDepth(20003).setInteractive({ useHandCursor: true });
		this.btnUpArrow.on('pointerdown', () => this.scroll(-1));
		this.btnUpArrow.on('pointerover', () => this.setArrowHover(this.btnUpArrow, true));
		this.btnUpArrow.on('pointerout', () => this.setArrowHover(this.btnUpArrow, false));
		this.btnUpArrow.setVisible(false);

		this.btnDownArrow = scene.add.triangle(
			0, 0,
			0, 0,
			100, 0,
			50, 50,
			0xd8d8d8, 0.92
		).setDepth(20003).setInteractive({ useHandCursor: true });
		this.btnDownArrow.on('pointerdown', () => this.scroll(1));
		this.btnDownArrow.on('pointerover', () => this.setArrowHover(this.btnDownArrow, true));
		this.btnDownArrow.on('pointerout', () => this.setArrowHover(this.btnDownArrow, false));
		this.btnDownArrow.setVisible(false);

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

	getMetrics()
	{
		const w = this.scene.scale.width;
		const h = this.scene.scale.height;

		const shortSide = Math.min(w, h);

		// Чем меньше базовая короткая сторона, тем сильнее растёт интерфейс
		const baseShortSide = 560;
		const scale = Phaser.Math.Clamp(shortSide / baseShortSide, 1.05, 2.10);

		const panelW = Math.round(Phaser.Math.Clamp(w * 0.72, 380, 760));
		const panelH = Math.round(Phaser.Math.Clamp(h * 0.68, 320, 620));

		const padding = Math.round(16 * scale);

		const titleFont = Math.round(26 * scale);
		const infoFont = Math.round(18 * scale);
		const itemFont = Math.round(20 * scale);

		const rowHeight = Math.round(50 * scale);
		const rowBgHeight = Math.round(42 * scale);

		// Иконки в панели должны быть явно крупнее, чем на карте
		const iconSize = Math.round(40 * scale);

		const arrowWidth = Math.round(94 * scale);
		const arrowHeight = Math.round(34 * scale);
		const arrowGap = Math.round(10 * scale);

		const topInfoBlockHeight = Math.round(84 * scale);
		const bottomBlockHeight = Math.round(66 * scale);

		const cancelButtonScale = Phaser.Math.Clamp(scale * 1.12, 1.05, 2.20);

		let maxVisibleItems = Math.floor(
			(panelH - topInfoBlockHeight - bottomBlockHeight - arrowHeight * 2 - arrowGap * 2) / rowHeight
		);
		if(maxVisibleItems < 3) maxVisibleItems = 3;

		return {
			w,
			h,
			scale,
			panelW,
			panelH,
			padding,
			titleFont,
			infoFont,
			itemFont,
			rowHeight,
			rowBgHeight,
			iconSize,
			arrowWidth,
			arrowHeight,
			arrowGap,
			topInfoBlockHeight,
			bottomBlockHeight,
			cancelButtonScale,
			maxVisibleItems
		};
	}

	applyButtonScale(btn, scale)
	{
		if(btn == null) return;

		if(typeof btn.setScale === 'function')
		{
			btn.setScale(scale);
		}
		else if(btn.container && typeof btn.container.setScale === 'function')
		{
			btn.container.setScale(scale);
		}
	}

	setArrowHover(arrow, hovered)
	{
		if(arrow == null) return;

		if(hovered)
		{
			arrow.setFillStyle(0xffffff, 1.0);
			arrow.setAlpha(1.0);
		}
		else
		{
			arrow.setFillStyle(0xd8d8d8, 0.92);
			arrow.setAlpha(0.92);
		}
	}

	layout()
	{
		const m = this.getMetrics();
		this.metrics = m;
		this.maxVisibleItems = m.maxVisibleItems;

		this.overlay.setSize(m.w, m.h);

		const x = Math.round((m.w - m.panelW) / 2);
		const y = Math.round((m.h - m.panelH) / 2);

		this.bg.setPosition(x, y);
		this.bg.setSize(m.panelW, m.panelH);
		this.bg.setDisplaySize(m.panelW, m.panelH);

		this.title.setPosition(x + m.padding, y + Math.round(12 * m.scale));
		this.title.setFontSize(m.titleFont);

		this.capacityText.setPosition(x + m.padding, y + Math.round(50 * m.scale));
		this.capacityText.setFontSize(m.infoFont);

		this.scrollInfoText.setPosition(
			x + m.panelW - Math.round(130 * m.scale),
			y + Math.round(50 * m.scale)
		);
		this.scrollInfoText.setFontSize(m.infoFont);

		const listStartY = y + m.topInfoBlockHeight + m.arrowHeight + m.arrowGap + Math.round(m.rowBgHeight / 2);
		const lastVisibleRowY = listStartY + (m.maxVisibleItems - 1) * m.rowHeight;

		const arrowX = x + m.panelW / 2;
		const topArrowY = listStartY - Math.round(m.rowBgHeight / 2) - m.arrowGap - Math.round(m.arrowHeight / 2);
		const bottomArrowY = lastVisibleRowY + Math.round(m.rowBgHeight / 2) + m.arrowGap + Math.round(m.arrowHeight / 2);

		// Масштабируем треугольники по ширине и высоте отдельно
		this.btnUpArrow.setPosition(arrowX, topArrowY);
		this.btnUpArrow.setScale(m.arrowWidth / 100, m.arrowHeight / 50);

		this.btnDownArrow.setPosition(arrowX, bottomArrowY);
		this.btnDownArrow.setScale(m.arrowWidth / 100, m.arrowHeight / 50);

		this.btnCancel.setPosition(
			x + m.panelW / 2,
			y + m.panelH - Math.round(30 * m.scale)
		);
		this.applyButtonScale(this.btnCancel, m.cancelButtonScale);

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
		this.scrollInfoText.setVisible(true);
		this.btnUpArrow.setVisible(true);
		this.btnDownArrow.setVisible(true);
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
		this.scrollInfoText.setVisible(false);
		this.btnUpArrow.setVisible(false);
		this.btnDownArrow.setVisible(false);
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
		const m = this.metrics || this.getMetrics();

		const panelX = this.bg.x;
		const panelY = this.bg.y;

		const rowX = panelX + m.padding;
		const rowWidth = m.panelW - m.padding * 2;
		const listStartY = panelY + m.topInfoBlockHeight + m.arrowHeight + m.arrowGap + Math.round(m.rowBgHeight / 2);
		const iconX = rowX + Math.round(28 * m.scale);
		const textX = rowX + Math.round(58 * m.scale);

		this.capacityText.setText('Capacity: ' + this.unit.getItemCount() + '/' + this.unit.getItemCapacity());

		const maxOffset = Math.max(0, items.length - this.maxVisibleItems);
		const canScrollUp = this.scrollOffset > 0;
		const canScrollDown = this.scrollOffset < maxOffset;

		this.btnUpArrow.setVisible(canScrollUp);
		this.btnDownArrow.setVisible(canScrollDown);

		if(items.length > 0)
		{
			const from = this.scrollOffset + 1;
			const to = Math.min(this.scrollOffset + this.maxVisibleItems, items.length);
			this.scrollInfoText.setText(from + '-' + to + ' / ' + items.length);
		}
		else
		{
			this.scrollInfoText.setText('0 / 0');
		}

		for(let i = 0; i < this.maxVisibleItems; i++)
		{
			const itemIndex = this.scrollOffset + i;
			if(itemIndex >= items.length) break;

			const item = items[itemIndex];
			const rowY = listStartY + i * m.rowHeight;

			// Индекс помогает понять, что список реально скроллится
			const label = (itemIndex + 1).toString() + '. ' + item.getDisplayName();

			const rowBg = this.scene.add.rectangle(
				rowX + rowWidth / 2,
				rowY,
				rowWidth,
				m.rowBgHeight,
				0x1a1a1a,
				0.95
			);
			rowBg.setStrokeStyle(1, 0x4b5563, 1);
			rowBg.setDepth(20002);
			rowBg.setInteractive({ useHandCursor: true });

			rowBg.on('pointerover', () => { rowBg.setFillStyle(0x2a2a2a, 0.98); });
			rowBg.on('pointerout', () => { rowBg.setFillStyle(0x1a1a1a, 0.95); });
			rowBg.on('pointerdown', () => { this.hide({ itemIndex: itemIndex }); });

			this.itemRowBgs.push(rowBg);
			this.itemButtons.push(rowBg);

			if(item.config != null && item.config.sprite != null && item.config.sprite !== '' && this.scene.textures.exists(item.config.sprite))
			{
				const icon = this.scene.add.image(iconX, rowY, item.config.sprite);
				icon.setOrigin(0.5, 0.5);

				const frame = icon.texture ? icon.texture.get() : null;
				if(frame != null && frame.width > 0 && frame.height > 0)
				{
					const scale = Math.min(m.iconSize / frame.width, m.iconSize / frame.height);
					icon.setScale(scale);
				}

				icon.setDepth(20003);
				this.itemIcons.push(icon);
			}

			const text = this.scene.add.text(textX, rowY - Math.round(m.itemFont * 0.55), label, {
				fontSize: m.itemFont + 'px',
				color: '#ffffff',
				wordWrap: { width: rowWidth - Math.round(80 * m.scale) }
			});
			text.setOrigin(0, 0);
			text.setDepth(20003);
			this.itemLabels.push(text);
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


