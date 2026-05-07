//---------------------------- Item class ----------------------------

class Item
{
    constructor(configName)
    {
        this.configName = configName;
        this.config = itemConfigs[configName];
    }

    serialize()
    {
        return {
            configName: this.configName,
        };
    }

    static deserialize(data)
    {
        return new Item(data.configName);
    }
}

//---------------------------- ItemEntity class ----------------------------

class ItemEntity extends Entity
{
    constructor(scene, x, y, visible=true, items=[])
    {
        super(entityConfigs['item'], scene, x, y, visible);
        this.items = [];
        this.stackSprites = [];
        this.setOrigin(0.5, 0.5);
        for(let i = 0; i < items.length; i++)
        {
            this.addItem(items[i]);
        }
    }

    static create(scene, x, y, visible=true, items=[])
    {
        return new ItemEntity(scene, x, y, visible, items);
    }

    serialize()
    {
        return {
            configName: this.config.name,
            mapX: this.mapX,
            mapY: this.mapY,
            features: clone(this.features),
            items: this.items.map(item => item.serialize()),
        };
    }

    loadStoredData(storedData)
    {
        this.items = [];
        if(storedData.items && storedData.items.length > 0)
        {
            for(let i = 0; i < storedData.items.length; i++)
            {
                this.items.push(Item.deserialize(storedData.items[i]));
            }
        }
        else
        {
            const itemConfigName = storedData.features?.itemConfigName || this.features.itemConfigName;
            const itemCount = storedData.features?.itemCount || this.features.itemCount || 1;
            for(let i = 0; i < itemCount; i++)
            {
                this.items.push(new Item(itemConfigName));
            }
        }
    }

    loadObjectProperties(properties)
    {
        let itemConfigName = this.features.itemConfigName;
        let itemCount = this.features.itemCount || 1;
        for(let i = 0; i < properties.length; i++)
        {
            const prop = properties[i];
            if(prop.name === 'itemConfigName') itemConfigName = prop.value;
            if(prop.name === 'itemCount') itemCount = prop.value;
        }
        this.features.itemConfigName = itemConfigName;
        this.features.itemCount = itemCount;
        this.items = [];
        for(let i = 0; i < itemCount; i++)
        {
            this.items.push(new Item(itemConfigName));
        }
    }

    start(showStart=true)
    {
        if(this.items.length <= 0 && this.features.itemConfigName != null)
        {
            const itemCount = this.features.itemCount || 1;
            for(let i = 0; i < itemCount; i++)
            {
                this.items.push(new Item(this.features.itemConfigName));
            }
        }
        super.start(showStart);
    }

    onStartComplete(obj)
    {
        this.syncVisuals();
    }

    addItem(item)
    {
        if(!(item instanceof Item))
        {
            item = new Item(item);
        }
        this.items.push(item);
        this.features.itemCount = this.items.length;
        this.features.itemConfigName = this.items[0]?.configName || null;
        this.syncVisuals();
    }

    removeItem(index=0)
    {
        if(index < 0 || index >= this.items.length) return null;
        const item = this.items.splice(index, 1)[0];
        this.features.itemCount = this.items.length;
        this.features.itemConfigName = this.items[0]?.configName || null;
        if(this.items.length <= 0)
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
        if(this.items.length <= 0) return null;
        return this.items[0];
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

        for(let i = 1; i < this.items.length && i <= offsets.length; i++)
        {
            const item = this.items[i];
            if(item == null || item.config == null) continue;
            const spr = this.scene.add.image(
                this.x + offsets[i - 1].x,
                this.y + offsets[i - 1].y,
                item.config.sprite
            );
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
}