//---------------------------- Bottom bar UI ----------------------------

class UIButton extends Phaser.GameObjects.Container
{
    constructor(scene, x, y, config = {})
    {
        super(scene, x, y);
        scene.add.existing(this);

        this.scene = scene;
        this.width = config.width || 64;
        this.height = config.height || 48;
        this.mode = config.mode || 'text'; // text | icon | icon_text | auto
        this.text = config.text || '';
        this.icon = config.icon || null;
        this.iconFrame = config.iconFrame;
        this.tooltip = config.tooltip || '';
        this.enabled = config.enabled !== false;
        this.selected = config.selected === true;
        this.callback = typeof config.onClick === 'function' ? config.onClick : null;

        this.background = scene.add.rectangle(0, 0, this.width, this.height, 0x11161e, 0.92);
        this.background.setOrigin(0, 0);
        this.background.setStrokeStyle(2, 0x3c4758, 1);
        this.add(this.background);

        this.contentContainer = scene.add.container(0, 0);
        this.add(this.contentContainer);

        this.hitArea = scene.add.rectangle(0, 0, this.width, this.height, 0xffffff, 0.0001);
        this.hitArea.setOrigin(0, 0);
        this.hitArea.setInteractive({ useHandCursor: true });
        this.hitArea.on('pointerdown', (pointer, localX, localY, event) => {
            if (event && event.stopPropagation) event.stopPropagation();
            pointerPressed = true;
            if (!this.enabled || this.callback == null) return;
            this.callback();
        });
        this.hitArea.on('pointerover', () => {
            if (!this.enabled) return;
            this._applyVisualState(true, false);
        });
        this.hitArea.on('pointerout', () => {
            this._applyVisualState(false, false);
        });
        this.hitArea.on('pointerdown', () => {
            if (!this.enabled) return;
            this._applyVisualState(true, true);
        });
        this.hitArea.on('pointerup', () => {
            this._applyVisualState(true, false);
        });
        this.add(this.hitArea);

        this._iconObject = null;
        this._textObject = null;
        this._rebuildContent();
        this._applyVisualState(false, false);
    }

    _hasValidIcon()
    {
        return this.icon != null && this.scene.textures.exists(this.icon);
    }

    _resolveMode()
    {
        if (this.mode === 'auto')
        {
            return this._hasValidIcon() ? 'icon' : 'text';
        }
        return this.mode;
    }

    _destroyContent()
    {
        if (this._iconObject != null)
        {
            this._iconObject.destroy();
            this._iconObject = null;
        }
        if (this._textObject != null)
        {
            this._textObject.destroy();
            this._textObject = null;
        }
    }

    _rebuildContent()
    {
        this._destroyContent();

        const mode = this._resolveMode();
        const padding = 8;
        const centerY = this.height / 2;

        if ((mode === 'icon' || mode === 'icon_text') && this._hasValidIcon())
        {
            this._iconObject = this.scene.add.image(0, 0, this.icon, this.iconFrame);
            this._iconObject.setOrigin(0.5, 0.5);

            const maxIconSize = Math.min(this.width, this.height) - 18;
            const baseSize = Math.max(this._iconObject.width, this._iconObject.height, 1);
            const scale = maxIconSize / baseSize;
            this._iconObject.setScale(scale);
            this.contentContainer.add(this._iconObject);
        }

        if (mode === 'text' || mode === 'icon_text' || !this._hasValidIcon())
        {
            this._textObject = this.scene.add.text(0, 0, this.text, {
                fontSize: '16px',
                fontFamily: 'Arial',
                color: '#f1f5f9',
                align: 'center',
                wordWrap: { width: Math.max(1, this.width - 12) }
            });
            this._textObject.setOrigin(0.5, 0.5);
            this.contentContainer.add(this._textObject);
        }

        if (mode === 'icon_text' && this._iconObject != null && this._textObject != null)
        {
            const iconSize = this._iconObject.displayWidth;
            const totalWidth = iconSize + padding + this._textObject.width;
            const startX = (this.width - totalWidth) / 2;
            this._iconObject.setPosition(startX + iconSize / 2, centerY);
            this._textObject.setPosition(startX + iconSize + padding + this._textObject.width / 2, centerY);
        }
        else if (mode === 'icon' && this._iconObject != null)
        {
            this._iconObject.setPosition(this.width / 2, centerY);
        }
        else if (this._textObject != null)
        {
            this._textObject.setPosition(this.width / 2, centerY);
        }
    }

    _applyVisualState(isHover, isPressed)
    {
        let fill = 0x11161e;
        let alpha = 0.92;
        let stroke = 0x3c4758;

        if (!this.enabled)
        {
            fill = 0x0b0f15;
            alpha = 0.65;
            stroke = 0x2a3340;
        }
        else if (this.selected)
        {
            fill = 0x1e293b;
            stroke = 0x38bdf8;
        }
        else if (isPressed)
        {
            fill = 0x18202b;
            stroke = 0x94a3b8;
        }
        else if (isHover)
        {
            fill = 0x16202a;
            stroke = 0x64748b;
        }

        this.background.setFillStyle(fill, alpha);
        this.background.setStrokeStyle(2, stroke, 1);

        if (this._iconObject != null) this._iconObject.setAlpha(this.enabled ? 1.0 : 0.45);
        if (this._textObject != null) this._textObject.setAlpha(this.enabled ? 1.0 : 0.55);
    }

    setEnabled(value)
    {
        this.enabled = value === true;
        this.hitArea.disableInteractive();
        this.hitArea.setInteractive({ useHandCursor: this.enabled });
        this._applyVisualState(false, false);
    }

    setSelected(value)
    {
        this.selected = value === true;
        this._applyVisualState(false, false);
    }

    setText(value)
    {
        this.text = value || '';
        this._rebuildContent();
        this._applyVisualState(false, false);
    }
}

class UIButtonRow extends Phaser.GameObjects.Container
{
    constructor(scene, x, y, config = {})
    {
        super(scene, x, y);
        scene.add.existing(this);

        this.scene = scene;
        this.gap = config.gap || 8;
        this.buttons = [];
    }

    clearButtons()
    {
        this.buttons.forEach(btn => btn.destroy());
        this.buttons = [];
    }

    setButtons(buttonConfigs)
    {
        this.clearButtons();

        let curX = 0;
        for (let i = 0; i < buttonConfigs.length; i++)
        {
            const btn = new UIButton(this.scene, curX, 0, buttonConfigs[i]);
            this.add(btn);
            this.buttons.push(btn);
            curX += btn.width + this.gap;
        }
    }

    getContentWidth()
    {
        if (this.buttons.length <= 0) return 0;
        let width = 0;
        this.buttons.forEach(btn => width += btn.width);
        width += (this.buttons.length - 1) * this.gap;
        return width;
    }
}

class SelectedUnitInfoPanel extends Phaser.GameObjects.Container
{
    constructor(scene, x, y, width, height)
    {
        super(scene, x, y);
        scene.add.existing(this);

        this.scene = scene;
        this.panelWidth = width;
        this.panelHeight = height;
        this.unit = null;
        this.lastStatsSignature = '';

        this.background = scene.add.rectangle(0, 0, width, height, 0x0f141b, 0.55);
        this.background.setOrigin(0, 0);
        this.background.setStrokeStyle(1, 0x2b3442, 1);
        this.add(this.background);

        this.portraitFrame = scene.add.rectangle(10, 10, 56, 56, 0x101826, 0.95);
        this.portraitFrame.setOrigin(0, 0);
        this.portraitFrame.setStrokeStyle(1, 0x415066, 1);
        this.add(this.portraitFrame);

        this.portrait = null;

        this.nameText = scene.add.text(78, 10, 'No unit selected', {
            fontSize: '18px',
            fontFamily: 'Arial',
            color: '#f8fafc'
        });
        this.add(this.nameText);

        this.statsText = scene.add.text(78, 34, '', {
            fontSize: '14px',
            fontFamily: 'Arial',
            color: '#cbd5e1'
        });
        this.add(this.statsText);

        this.hintText = scene.add.text(78, 54, 'Select one of your units', {
            fontSize: '12px',
            fontFamily: 'Arial',
            color: '#94a3b8'
        });
        this.add(this.hintText);

        this.setUnit(null, true);
    }

    _rebuildPortrait(unit)
    {
        if (this.portrait != null)
        {
            this.portrait.destroy();
            this.portrait = null;
        }

        if (unit == null || unit.config == null || unit.config.sprite == null) return;
        if (!this.scene.textures.exists(unit.config.sprite)) return;

        this.portrait = this.scene.add.image(38, 38, unit.config.sprite);
        this.portrait.setOrigin(0.5, 0.5);

        const maxPortraitSize = 44;
        const baseSize = Math.max(this.portrait.width, this.portrait.height, 1);
        let scale = maxPortraitSize / baseSize;
        if (unit.config.scale != null) scale *= unit.config.scale;
        this.portrait.setScale(scale);

        this.add(this.portrait);
        this.bringToTop(this.portrait);
        this.bringToTop(this.nameText);
        this.bringToTop(this.statsText);
        this.bringToTop(this.hintText);
    }

    setUnit(unit, force = false)
    {
        const unitChanged = this.unit !== unit;
        this.unit = unit;

        if (unitChanged || force)
        {
            this._rebuildPortrait(unit);
        }

        const statsSignature = (unit == null)
            ? 'none'
            : [
                unit.config ? unit.config.name : 'unit',
                unit.features.health,
                unit.features.move,
                unit.features.abilityPoints
            ].join(';');

        if (!force && !unitChanged && statsSignature === this.lastStatsSignature) return;
        this.lastStatsSignature = statsSignature;

        if (unit == null)
        {
            this.nameText.setText('No unit selected');
            this.statsText.setText('');
            this.hintText.setText('Select one of your units');
            return;
        }

        this.nameText.setText(unit.config.name || 'Unit');

        const maxHealth = unit.config && unit.config.features ? unit.config.features.health : unit.features.health;
        const maxMove = unit.config && unit.config.features ? unit.config.features.move : unit.features.move;
        const hpText = 'HP: ' + unit.features.health + '/' + maxHealth;
        const moveText = 'Move: ' + unit.features.move + '/' + maxMove;
        const apText = 'AP: ' + unit.features.abilityPoints;

        this.statsText.setText(hpText + '   ' + moveText + '   ' + apText);
        this.hintText.setText(unit.player && unit.player.control === PlayerControl.human
            ? 'Ready for commands'
            : 'Observed unit');
    }
}

class BottomBar extends Phaser.GameObjects.Container
{
    constructor(scene)
    {
        super(scene, 0, 0);
        scene.add.existing(this);

        this.scene = scene;
        this.barWidth = 0;
        this.barHeight = 88;

        this.leftSectionX = 0;
        this.centerSectionX = 0;
        this.rightSectionX = 0;
        this.centerWidth = 280;
        this.rightWidth = 0;

        this.lastViewportSignature = '';
        this.lastInfoSignature = '';
        this.lastAbilityStateSignature = '';
        this.dirty = true;

        this.background = scene.add.rectangle(0, 0, 100, this.barHeight, 0x06080d, 0.82);
        this.background.setOrigin(0, 0);
        this.background.setStrokeStyle(1, 0x334155, 1);
        this.add(this.background);

        this.gameButtonsPanel = new UIButtonRow(scene, 0, 0, { gap: 8 });
        this.unitInfoPanel = new SelectedUnitInfoPanel(scene, 0, 0, this.centerWidth, 76);
        this.abilityButtonsPanel = new UIButtonRow(scene, 0, 0, { gap: 8 });

        this.add(this.gameButtonsPanel);
        this.add(this.unitInfoPanel);
        this.add(this.abilityButtonsPanel);

        this.gameButtonsPanel.setButtons([
            {
                width: 132,
                height: 52,
                text: 'End Turn',
                mode: 'text',
                onClick: () => {
                    if (!pointerBlocked) onEndTurn();
                }
            }
        ]);

        this.layout();
        this.refresh(true);
    }

    markDirty()
    {
        this.dirty = true;
    }

    _getUnitKey(unit)
    {
        if (unit == null) return 'none';
        if (unit.id != null) return String(unit.id);

        const name = unit.config && unit.config.name ? unit.config.name : 'unit';
        return name + '@' + unit.mapX + ',' + unit.mapY;
    }

    _getAbilityTypeForProcessed(unit)
    {
        if (unit == null || unit.processedAbility == null) return null;

        const abilityKeys = Object.keys(abilities);
        for (let i = 0; i < abilityKeys.length; i++)
        {
            const key = abilityKeys[i];
            if (abilities[key] != null && abilities[key].ability === unit.processedAbility) return key;
        }

        return null;
    }

    layout()
    {
        const w = this.scene.scale.width;
        const h = this.scene.scale.height;

        const margin = 12;
        const innerPadding = 16;

        this.barWidth = Math.max(720, Math.min(w - margin * 2, 1180));
        this.barHeight = 88;

        this.setPosition((w - this.barWidth) / 2, h - this.barHeight - margin);

        this.background.width = this.barWidth;
        this.background.height = this.barHeight;

        this.leftSectionX = innerPadding;

        this.centerWidth = 340;
        this.centerSectionX = Math.floor((this.barWidth - this.centerWidth) / 2);

        this.rightSectionX = this.centerSectionX + this.centerWidth + innerPadding;
        this.rightWidth = this.barWidth - this.rightSectionX - innerPadding;

        this.gameButtonsPanel.setPosition(this.leftSectionX, (this.barHeight - 52) / 2);
        this.unitInfoPanel.setPosition(this.centerSectionX, (this.barHeight - 76) / 2);
        this.unitInfoPanel.background.width = this.centerWidth;
        this.unitInfoPanel.panelWidth = this.centerWidth;

        this.abilityButtonsPanel.setPosition(this.rightSectionX, (this.barHeight - 52) / 2);

        this.lastViewportSignature = w + 'x' + h;
    }

    _getAbilityButtonConfig(unit, abilityEntry)
    {
        const isSelected = unit != null &&
            unit.processedAbility != null &&
            abilities[abilityEntry.type] != null &&
            abilities[abilityEntry.type].ability === unit.processedAbility;

        return {
            width: 72,
            height: 52,
            text: abilityEntry.title || abilityEntry.type,
            icon: abilityEntry.icon,
            mode: abilityEntry.icon ? 'auto' : 'text',
            selected: isSelected,
            onClick: () => {
                if (pointerBlocked) return;
                if (selectedUnit == null) return;
                if (selectedUnit !== unit) return;

                pointerPressed = true;

                const abilityDef = abilities[abilityEntry.type];
                if (abilityDef == null || abilityDef.ability == null) return;

                if (selectedUnit.processedAbility === abilityDef.ability)
                {
                    selectedUnit.stopAbility();
                }
                else
                {
                    if (selectedUnit.processedAbility != null) selectedUnit.stopAbility();
                    selectedUnit.startAbility(abilityEntry.type);
                }

                this.markDirty();
                this.refresh(false);
            }
        };
    }

    _refreshGameButtons(isHumanTurn)
    {
        if (this.gameButtonsPanel.buttons.length > 0)
        {
            this.gameButtonsPanel.buttons[0].setEnabled(isHumanTurn && !pointerBlocked);
        }
    }

    _refreshAbilityButtons(unit, canControlUnit)
    {
        if (!canControlUnit || unit == null)
        {
            this.abilityButtonsPanel.setButtons([]);
            return;
        }

        const availableAbilities = unit.getAvailableAbilities();
        const buttonConfigs = [];

        for (let i = 0; i < availableAbilities.length; i++)
        {
            buttonConfigs.push(this._getAbilityButtonConfig(unit, availableAbilities[i]));
        }

        this.abilityButtonsPanel.setButtons(buttonConfigs);

        const contentWidth = this.abilityButtonsPanel.getContentWidth();
        if (contentWidth > this.rightWidth && this.abilityButtonsPanel.buttons.length > 0)
        {
            const narrowWidth = 60;
            for (let i = 0; i < buttonConfigs.length; i++)
            {
                buttonConfigs[i].width = narrowWidth;
                buttonConfigs[i].mode = buttonConfigs[i].icon ? 'auto' : 'text';
            }
            this.abilityButtonsPanel.setButtons(buttonConfigs);
        }

        // после пересборки всегда прижимаем влево
        this.abilityButtonsPanel.setPosition(this.rightSectionX, (this.barHeight - 52) / 2);
    }

    refresh(force = false)
    {
        const viewportSignature = this.scene.scale.width + 'x' + this.scene.scale.height;
        if (force || viewportSignature !== this.lastViewportSignature)
        {
            console.log('Viewport changed, refreshing bottom bar layout');
            this.layout();
            force = true;
        }

        const currentPlayer = players != null ? players[playerInd] : null;
        const isHumanTurn = currentPlayer != null && currentPlayer.control === PlayerControl.human;
        const canControlUnit = isHumanTurn && selectedUnit != null && selectedUnit.player === currentPlayer;
        const activeAbilityType = this._getAbilityTypeForProcessed(selectedUnit);
        const unitKey = this._getUnitKey(selectedUnit);

        const infoSignature = [
            isHumanTurn ? 'human' : 'ai',
            pointerBlocked ? 'blocked' : 'free',
            unitKey,
            selectedUnit ? selectedUnit.features.health : '-',
            selectedUnit ? selectedUnit.features.move : '-',
            selectedUnit ? selectedUnit.features.abilityPoints : '-'
        ].join(';');

        if (force || infoSignature !== this.lastInfoSignature)
        {
            console.log('Selected unit or turn state changed, refreshing info panel and game buttons');
            this.lastInfoSignature = infoSignature;
            this._refreshGameButtons(isHumanTurn);
            this.unitInfoPanel.setUnit(selectedUnit, force);
        }

        const abilityStateSignature = [
            isHumanTurn ? 'human' : 'ai',
            pointerBlocked ? 'blocked' : 'free',
            unitKey,
            selectedUnit ? selectedUnit.mapX : '-',
            selectedUnit ? selectedUnit.mapY : '-',
            selectedUnit ? selectedUnit.features.move : '-',
            selectedUnit ? selectedUnit.features.abilityPoints : '-',
            activeAbilityType || '-'
        ].join(';');

        if (force || this.dirty || abilityStateSignature !== this.lastAbilityStateSignature)
        {       
            console.log('Ability state changed, refreshing ability buttons');
            this.lastAbilityStateSignature = abilityStateSignature;
            this._refreshAbilityButtons(selectedUnit, canControlUnit);
            this.dirty = false;
        }
    }

    tick()
    {
        this.refresh(false);
    }
}
