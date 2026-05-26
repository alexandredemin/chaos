function createItemData(configName, params = {})
{
    return {
        uid: 'item_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8),
        configName: configName,
        params: clone(params),
    };
}

//---------------------------- Item class ----------------------------

class Item
{
    constructor(dataOrConfigName, params = {})
    {
        if(typeof dataOrConfigName === 'string')
        {
            this.data = createItemData(dataOrConfigName, params);
        }
        else
        {
            this.data = clone(dataOrConfigName);
            if(this.data.uid == null)
            {
                this.data.uid = 'item_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
            }
            if(this.data.params == null) this.data.params = {};
        }
        this.uid = this.data.uid;
        this.configName = this.data.configName;
        this.params = this.data.params || {};
        this.config = itemConfigs[this.configName];
    }

    serialize()
    {
        return clone(this.data);
    }

    static deserialize(data)
    {
        return new Item(data);
    }

    getDisplayName()
    {
        if(this.configName === 'spell_scroll' && this.params?.spell)
        {
            return this.config.name + ' (' + this.params.spell + ')';
        }
        return this.config.name;
    }

	getActionTitle(actionId)
	{
		if(this.config == null || this.config.actions == null) return actionId;
		return this.config.actions[actionId]?.title || actionId;
	}

	canDoAction(actionId, unit)
	{
		if(unit == null) return false;
		if(this.config == null || this.config.actions == null) return false;
		if(this.config.actions[actionId] == null) return false;

		const actionCfg = this.config.actions[actionId];
		if(actionCfg.spendAP === true && unit.features.abilityPoints <= 0) return false;

		switch(actionId)
		{
			case 'drop':
				return true;

			case 'use':
				switch(this.configName)
				{
					case 'healing_potion':
						return true; //unit.features.health < unit.config.features.health;

					case 'mana_potion':
						return unit.features.mana != null;

					case 'spell_scroll':
						return unit.config.name === 'wizard' && this.params != null && this.params.spell != null;

					default:
						return false;
				}
		}

		return false;
	}

	getAvailableActions(unit)
	{
		let result = [];
		if(this.config == null || this.config.actions == null) return result;
		for(const actionId in this.config.actions)
		{
			if(this.canDoAction(actionId, unit))
			{
				result.push({
					id: actionId,
					title: this.getActionTitle(actionId),
					config: this.config.actions[actionId]
				});
			}
		}
		return result;
	}

	doAction(actionId, unit, context = {}, callbackObject = null)
	{
		if(!this.canDoAction(actionId, unit))
		{
			const result = {
				success: false,
				spendAP: false,
				consumeItem: false
			};

			finishItemAction(callbackObject, result);
			return false;
		}

		const actionCfg = this.config.actions[actionId] || {};

		switch(actionId)
		{
			case 'drop':
			{
				playDropItemEffect(unit.scene, unit, this, () =>
				{
					let itemEntity = getGroundItemEntityAtMap(unit.mapX, unit.mapY);
					if(itemEntity == null)
					{
						itemEntity = ItemEntity.create(unit.scene, 0, 0, true, []);
						itemEntity.setPositionFromMap(unit.mapX, unit.mapY);
						itemEntity.start(false);
						entities.push(itemEntity);
					}
					itemEntity.addItem(this);
					finishItemAction(callbackObject, {
						success: true,
						spendAP: actionCfg.spendAP === true,
						consumeItem: actionCfg.consumeItem === true
					});
				});
				return false;
			}

			case 'use':
			{
				switch(this.configName)
				{
					case 'healing_potion':
					{
						playDrinkItemEffect(unit.scene, unit, this, 0x59c01a, () =>
						{
							const maxHealth = unit.config.features.health;
							const value = this.config.effectValue || 1;
							unit.features.health = Math.min(maxHealth, unit.features.health + value);
							finishItemAction(callbackObject, {
								success: true,
								spendAP: actionCfg.spendAP === true,
								consumeItem: actionCfg.consumeItem === true
							});
						});
						return false;
					}

					case 'mana_potion':
					{
						playDrinkItemEffect(unit.scene, unit, this, 0x66aaff, () =>
						{
							const value = this.config.effectValue || 1;
							if(unit.features.mana == null)
							{
								finishItemAction(callbackObject, {
									success: false,
									spendAP: false,
									consumeItem: false
								});
								return;
							}
							unit.features.mana += value;
							finishItemAction(callbackObject, {
								success: true,
								spendAP: actionCfg.spendAP === true,
								consumeItem: actionCfg.consumeItem === true
							});
						});
						return false;
					}

					case 'spell_scroll':
					{
						unit.scene.time.delayedCall(10, () =>
						{
							console.log('Read scroll with spell: ' + this.params.spell);
							finishItemAction(callbackObject, {
								success: true,
								spendAP: actionCfg.spendAP === true,
								consumeItem: actionCfg.consumeItem === true
							});
						});
						return false;
					}
				}
			}
		}

		finishItemAction(callbackObject, {
			success: false,
			spendAP: false,
			consumeItem: false
		});

		return false;
	}
}

//---------------------------- Help functions ----------------------------
function getGroundItemEntityAtMap(mapX, mapY)
{
	const ents = Entity.getEntitiesAtMap(mapX, mapY);
	if(ents == null || ents.length <= 0) return null;
	for(let i = 0; i < ents.length; i++)
	{
		const ent = ents[i];
		if(ent instanceof ItemEntity) return ent;
	}
	return null;
}

function finishItemAction(callbackObject, result)
{
	if(callbackObject != null && typeof callbackObject.onItemActionComplete === 'function')
	{
		callbackObject.onItemActionComplete(result);
	}
}

function fitEffectSpriteSize(sprite, pixelSize)
{
	const frame = sprite.texture ? sprite.texture.get() : null;
	if(frame == null || frame.width <= 0 || frame.height <= 0) return;

	const scale = pixelSize / Math.max(frame.width, frame.height);
	sprite.setScale(scale);
}

function flashUnitTint(unit, color, flashCount = 3, onComplete = null)
{
	if(!shouldShowActionAnimation(unit))
	{
		if(onComplete != null) onComplete();
		return;
	}
	
	const scene = unit.scene;
	const frameName = unit.frame ? unit.frame.name : undefined;

	const flash = scene.add.image(unit.x, unit.y, unit.texture.key, frameName);
	flash.setOrigin(unit.originX, unit.originY);
	flash.setScale(unit.scaleX, unit.scaleY);
	flash.setRotation(unit.rotation);
	flash.setFlip(unit.flipX, unit.flipY);
	flash.setDepth(unit.depth + 0.1);
	flash.setAlpha(0);
	flash.setTintFill(color);

	const baseScaleX = unit.scaleX;
	const baseScaleY = unit.scaleY;

	let tweens = [];

	for(let i = 0; i < flashCount; i++)
	{
		tweens.push({
			targets: flash,
			alpha: 0.95,
			scaleX: baseScaleX * 1.12,
			scaleY: baseScaleY * 1.12,
			duration: 80,
			ease: 'Quad.Out'
		});

		tweens.push({
			targets: flash,
			alpha: 0.0,
			scaleX: baseScaleX * 0.98,
			scaleY: baseScaleY * 0.98,
			duration: 95,
			ease: 'Quad.In'
		});
	}

	scene.tweens.timeline({
		tweens: tweens,
		onComplete: () =>
		{
			flash.destroy();
			if(onComplete != null) onComplete();
		}
	});
}

function playDrinkItemEffect(scene, unit, item, color, onComplete)
{
	if(!shouldShowActionAnimation(unit))
	{
		if(onComplete != null) onComplete();
		return;
	}
	
	let sprite = scene.add.image(unit.x, unit.y - 8, item.config.sprite);
	sprite.setOrigin(0.5, 0.5);
	sprite.setDepth(unit.depth + 5);
	sprite.setAlpha(1);

	fitEffectSpriteSize(sprite, 16);

	const startScaleX = sprite.scaleX;
	const startScaleY = sprite.scaleY;

	scene.tweens.add({
		targets: sprite,
		y: unit.y - 18,
		scaleX: startScaleX * 2.6,
		scaleY: startScaleY * 2.6,
		alpha: 1,
		duration: 540, //180,
		ease: 'Back.Out',
		onComplete: () =>
		{
			scene.tweens.add({
				targets: sprite,
				scaleX: startScaleX * 3.4,
				scaleY: startScaleY * 3.4,
				alpha: 0,
				angle: 18,
				duration: 330, //110,
				ease: 'Cubic.Out',
				onComplete: () =>
				{
					sprite.destroy();
					flashUnitTint(unit, color, 3, onComplete);
				}
			});
		}
	});
}

function playDropItemEffect(scene, unit, item, onComplete)
{
	if(!shouldShowActionAnimation(unit))
	{
		if(onComplete != null) onComplete();
		return;
	}
	
	let sprite = scene.add.image(unit.x, unit.y - 6, item.config.sprite);
	sprite.setOrigin(0.5, 0.5);
	sprite.setDepth(unit.depth + 5);
	sprite.setAlpha(0);

	fitEffectSpriteSize(sprite, 18);

	const startScaleX = sprite.scaleX;
	const startScaleY = sprite.scaleY;

	scene.tweens.add({
		targets: sprite,
		x: unit.x,
		y: unit.y - 10,
		scaleX: startScaleX * 1.45,
		scaleY: startScaleY * 1.45,
		alpha: 1,
		angle: 8,
		duration: 180,
		ease: 'Cubic.Out',
		onComplete: () =>
		{
			scene.tweens.add({
				targets: sprite,
				x: unit.x,
				y: unit.y + 16,
				scaleX: startScaleX * 0.35,
				scaleY: startScaleY * 0.35,
				alpha: 0,
				angle: -10,
				duration: 280,
				ease: 'Quad.In',
				onComplete: () =>
				{
					sprite.destroy();
					if(onComplete != null) onComplete();
				}
			});
		}
	});
}

function playPickupItemEffect(scene, unit, item, onComplete)
{
	if(!shouldShowActionAnimation(unit))
	{
		if(onComplete != null) onComplete();
		return;
	}
	
	let sprite = scene.add.image(unit.x, unit.y + 10, item.config.sprite);
	sprite.setOrigin(0.5, 0.5);
	sprite.setDepth(unit.depth + 5);
	sprite.setAlpha(1);

	fitEffectSpriteSize(sprite, 18);

	const startScaleX = sprite.scaleX;
	const startScaleY = sprite.scaleY;

	scene.tweens.add({
		targets: sprite,
		x: unit.x,
		y: unit.y - 6,
		scaleX: startScaleX * 1.55,
		scaleY: startScaleY * 1.55,
		alpha: 1,
		angle: -8,
		duration: 180,
		ease: 'Cubic.Out',
		onComplete: () =>
		{
			scene.tweens.add({
				targets: sprite,
				x: unit.x,
				y: unit.y - 2,
				scaleX: startScaleX * 0.35,
				scaleY: startScaleY * 0.35,
				alpha: 0,
				angle: 10,
				duration: 280,
				ease: 'Quad.In',
				onComplete: () =>
				{
					sprite.destroy();
					if(onComplete != null) onComplete();
					/*
					const flash = scene.add.circle(unit.x, unit.y - 4, 6, 0xffffff, 0.95);
					flash.setDepth(unit.depth + 5);

					scene.tweens.add({
						targets: flash,
						radius: 26,
						alpha: 0,
						duration: 240,
						ease: 'Cubic.Out',
						onComplete: () =>
						{
							flash.destroy();
							if(onComplete != null) onComplete();
						}
					});
					*/
				}
			});
		}
	});
}

//---------------------------- ItemEntity class ----------------------------
class ItemEntity extends Entity
{
    constructor(scene, x, y, visible=true, items=[])
    {
        super(entityConfigs['item'], scene, x, y, visible);
        this.stackSprites = [];
        this.setOrigin(0.5, 0.5);
        if(!Array.isArray(this.features.items)) this.features.items = [];
        for(let i = 0; i < items.length; i++)
        {
            this.addItem(items[i]);
        }
    }

    static create(scene, x, y, visible=true, items=[])
    {
        return new ItemEntity(scene, x, y, visible, items);
    }

	transformFeatures(unit, features)
    {
        return features;
    }

    start(showStart=true)
    {
        if(!Array.isArray(this.features.items)) this.features.items = [];
        super.start(showStart);
    }

    onStartComplete(obj)
    {
        this.syncVisuals();
    }

    addItem(item)
    {
        if(!Array.isArray(this.features.items)) this.features.items = [];
        if(item instanceof Item)
        {
            this.features.items.push(item.serialize());
        }
        else if(typeof item === 'string')
        {
            this.features.items.push(createItemData(item));
        }
        else
        {
            this.features.items.push(clone(item));
        }
        this.syncVisuals();
    }

    removeItem(index=0)
    {
        if(!Array.isArray(this.features.items)) this.features.items = [];
        if(index < 0 || index >= this.features.items.length) return null;
        const itemData = this.features.items.splice(index, 1)[0];
        const item = Item.deserialize(itemData);
        if(this.features.items.length <= 0)
        {
            this.die();
        }
        else
        {
            this.syncVisuals();
        }
        return item;
    }

    getTopItem()
    {
        if(!Array.isArray(this.features.items) || this.features.items.length <= 0) return null;
        return Item.deserialize(this.features.items[0]);
    }

    getItems()
    {
        if(!Array.isArray(this.features.items)) this.features.items = [];
        return this.features.items.map(data => Item.deserialize(data));
    }

    getItemCount()
    {
        if(!Array.isArray(this.features.items)) this.features.items = [];
        return this.features.items.length;
    }

    syncVisuals()
    {
        const topItem = this.getTopItem();
        if(topItem == null || topItem.config == null) return;
        this.setTexture(topItem.config.sprite);
        this.setScale(topItem.config.scale || this.config.scale);
        this.setDepthFromBottom();
        this.syncStackSprites();
    }

    syncStackSprites()
    {
        for(let i = 0; i < this.stackSprites.length; i++)
        {
            this.stackSprites[i].destroy();
        }
        this.stackSprites = [];

        const offsets = [
        { x: -3, y: 1 },
        { x: 3, y: -2 },
        ];

        for(let i = 1; Array.isArray(this.features.items) && i < this.features.items.length && i <= offsets.length; i++)
        {
            const item = Item.deserialize(this.features.items[i]);
            if(item == null || item.config == null) continue;
            const spr = this.scene.add.image(this.x + offsets[i - 1].x, this.y + offsets[i - 1].y, item.config.sprite);
            spr.setOrigin(0.5, 0.5);
            spr.setScale(item.config.scale || this.config.scale);
            spr.setDepth(this.depth - i * 0.01);
            spr.visible = this.visible;
            this.stackSprites.push(spr);
            this.scene.children.bringToTop(this);
        }
    }

    setPositionFromMap(mapX, mapY)
    {
        super.setPositionFromMap(mapX, mapY);
        this.syncVisuals();
    }

    adjastPosition()
    {
        super.adjastPosition();
        this.syncVisuals();
    }

    setVisability(visible)
    {
        super.setVisability(visible);
        for(let i = 0; i < this.stackSprites.length; i++)
        {
            this.stackSprites[i].visible = visible;
        }
    }

    die()
    {
        for(let i = 0; i < this.stackSprites.length; i++)
        {
            this.stackSprites[i].destroy();
        }
        this.stackSprites = [];
        super.die();
    }

    makeMove()
    {
        super.makeMove();
        super.endMove();
    }
}