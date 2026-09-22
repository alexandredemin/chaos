// Applies runtime tile patches to the active Phaser map without knowing why geometry changes.
// A patch is a list of cells; each cell may independently replace ground and/or wall tiles.
class MapVisualSystem
{
	static applyPatch(patch)
	{
		const cells = Array.isArray(patch) ? patch : patch && Array.isArray(patch.cells) ? patch.cells : [];
		if(!cells.length || typeof map === 'undefined' || map == null) return 0;

		const overlayRefresh = new Set();
		let changed = 0;

		for(const cell of cells)
		{
			if(cell == null || !this._inBounds(cell.x,cell.y)) continue;
			let cellChanged = false;

			if(Object.prototype.hasOwnProperty.call(cell,'ground') && typeof groundLayer !== 'undefined' && groundLayer != null)
			{
				if(cell.ground == null) groundLayer.removeTileAt(cell.x,cell.y);
				else groundLayer.putTileAt(cell.ground,cell.x,cell.y);
				cellChanged = true;
			}

			if(Object.prototype.hasOwnProperty.call(cell,'wall') && typeof wallsLayer !== 'undefined' && wallsLayer != null)
			{
				this._setWallTile(cell.x,cell.y,cell.wall);
				this._refreshWallTop(cell.x,cell.y);
				cellChanged = true;

				for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++)
				{
					const x=cell.x+dx,y=cell.y+dy;
					if(this._inBounds(x,y)) overlayRefresh.add(x+':'+y);
				}
			}

			if(cellChanged) changed++;
		}

		for(const key of overlayRefresh)
		{
			const parts=key.split(':');
			this._refreshWallOverlay(Number(parts[0]),Number(parts[1]));
		}

		return changed;
	}

	static _inBounds(x,y)
	{
		return Number.isInteger(x) && Number.isInteger(y) && x>=0 && y>=0 && x<map.width && y<map.height;
	}

	static _setWallTile(x,y,tileIndex)
	{
		if(tileIndex == null)
		{
			wallsLayer.removeTileAt(x,y);
			return;
		}

		const tile=wallsLayer.putTileAt(tileIndex,x,y);
		tile.properties=tile.properties||{};
		tile.properties.collides=true;
		if(typeof WALL_NO_COLLISION_TILES !== 'undefined' && WALL_NO_COLLISION_TILES.has(tileIndex)) tile.properties.collides=false;
	}

	static _refreshWallTop(x,y)
	{
		if(typeof wallsTopLayer === 'undefined' || wallsTopLayer == null) return;
		wallsTopLayer.removeTileAt(x,y);
		const tile=wallsLayer.getTileAt(x,y);
		if(tile == null || typeof WALL_TOP_AUTOTILE_RULES === 'undefined') return;
		if(Object.prototype.hasOwnProperty.call(WALL_TOP_AUTOTILE_RULES.mapping,tile.index))
			wallsTopLayer.putTileAt(WALL_TOP_AUTOTILE_RULES.mapping[tile.index],x,y);
	}

	static _isCollidingWall(x,y)
	{
		if(!this._inBounds(x,y)) return false;
		const tile=wallsLayer.getTileAt(x,y);
		return tile != null && tile.properties != null && tile.properties.collides === true;
	}

	static _needsDiagonalOverlay(x,y)
	{
		return (!this._isCollidingWall(x,y+1) && !this._isCollidingWall(x+1,y)) ||
			(!this._isCollidingWall(x,y+1) && !this._isCollidingWall(x-1,y)) ||
			(!this._isCollidingWall(x,y-1) && !this._isCollidingWall(x+1,y)) ||
			(!this._isCollidingWall(x,y-1) && !this._isCollidingWall(x-1,y));
	}

	static _removeWallOverlay(x,y)
	{
		if(typeof wallOverlays === 'undefined' || !Array.isArray(wallOverlays)) return;
		for(let i=wallOverlays.length-1;i>=0;i--)
		{
			const sprite=wallOverlays[i];
			if(sprite == null) continue;
			const sx=sprite._mapX != null ? sprite._mapX : Math.round((sprite.x-(wallsLayer?.x||0))/16);
			const sy=sprite._mapY != null ? sprite._mapY : Math.round((sprite.y-(wallsLayer?.y||0))/16);
			if(sx!==x || sy!==y) continue;
			if(sprite.active !== false) sprite.destroy();
			wallOverlays.splice(i,1);
		}
	}

	static _refreshWallOverlay(x,y)
	{
		this._removeWallOverlay(x,y);
		const tile=wallsLayer.getTileAt(x,y);
		if(tile == null) return;

		const direct=typeof WALL_OVERLAY_TILES !== 'undefined' && WALL_OVERLAY_TILES.has(tile.index);
		if(!direct && !this._needsDiagonalOverlay(x,y)) return;

		const scene=wallsLayer.scene;
		if(scene == null) return;
		const sprite=scene.add.sprite((wallsLayer.x||0)+x*16,(wallsLayer.y||0)+y*16,'tiles',tile.index).setOrigin(0,0).setDepth((y+1)*16);
		sprite._mapX=x;
		sprite._mapY=y;
		wallOverlays.push(sprite);
	}
}

globalThis.MapVisualSystem=MapVisualSystem;
