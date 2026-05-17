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