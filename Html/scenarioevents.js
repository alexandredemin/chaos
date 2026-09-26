// Lightweight world-event bus used by ScenarioRuntime/Rules.
// S1 only publishes facts; it intentionally contains no scenario logic.
class ScenarioEventBus
{
	static listeners = new Map();
	static sequence = 0;
	static debug = false;
	static mapMetadata = null;
	static roomAt = new Map();
	static zoneAt = new Map();
	static roundIndex = 0;
	static activeTurnPlayerInd = null;

	static on(type,handler)
	{
		if(typeof type !== 'string' || typeof handler !== 'function') return () => {};
		if(!this.listeners.has(type)) this.listeners.set(type,new Set());
		this.listeners.get(type).add(handler);
		return () => this.off(type,handler);
	}

	static once(type,handler)
	{
		if(typeof handler !== 'function') return () => {};
		const wrapper = event => {this.off(type,wrapper); handler(event);};
		return this.on(type,wrapper);
	}

	static off(type,handler)
	{
		const set = this.listeners.get(type);
		if(set == null) return false;
		const removed = set.delete(handler);
		if(set.size === 0) this.listeners.delete(type);
		return removed;
	}

	static clear(type=null)
	{
		if(type == null) this.listeners.clear();
		else this.listeners.delete(type);
	}

	static setDebug(enabled)
	{
		this.debug = enabled === true;
		return this.debug;
	}

	static _entityKind(entity)
	{
		if(entity == null) return 'entity';
		if(entity.config && entity.config.name === 'door') return 'door';
		if(entity.features && entity.features.containerType != null) return 'container';
		return entity.config && entity.config.name ? entity.config.name : 'entity';
	}

	static _debugSummary(event)
	{
		const unit = event.unit;
		const entity = event.entity || event.door || event.container || event.sourceEntity;
		return {
			seq:event.sequence,
			type:event.type,
			unit:unit && unit.config ? unit.config.name+'#'+unit.id : null,
			player:event.playerName || (unit && unit.player ? unit.player.name : null),
			entity:entity && entity.config ? entity.config.name : null,
			from:event.from || null,
			to:event.to || null,
			room:event.room ? event.room.id : null,
			zone:event.zone ? event.zone.id : null,
			source:event.source || null
		};
	}

	static emit(type,payload={})
	{
		if(typeof type !== 'string' || type.length === 0) return null;
		const event = {type,sequence:++this.sequence,timestamp:Date.now(),...payload};
		if(this.debug) console.log('[ScenarioEvent]',this._debugSummary(event));

		const call = set => {
			if(set == null) return;
			for(const handler of Array.from(set))
			{
				try {handler(event);}
				catch(error) {console.error('[ScenarioEvent] listener failed for '+type,error);}
			}
		};
		call(this.listeners.get(type));
		call(this.listeners.get('*'));
		return event;
	}

	// Emits both a specific event (door_opened/container_opened) and generic entity_opened.
	static emitEntityAction(action,entity,payload={})
	{
		if(entity == null) return;
		const kind = this._entityKind(entity);
		const base = {
			entity,
			entityKind:kind,
			mapX:entity.mapX,
			mapY:entity.mapY,
			...payload
		};
		this.emit('entity_'+action,base);
		if(kind === 'door' || kind === 'container') this.emit(kind+'_'+action,{...base,[kind]:entity});
	}

	static _cellKey(x,y) {return x+':'+y;}

	// Installs semantic geometry emitted by MapGenerator. Static maps may have no metadata.
	static setMapMetadata(metadata)
	{
		this.mapMetadata = metadata || null;
		this.roomAt.clear();
		this.zoneAt.clear();
		if(metadata == null) return;

		for(const zone of metadata.zones || [])
		{
			const r = zone.rect;
			if(r == null) continue;
			for(let y=r.y;y<r.y+r.h;y++) for(let x=r.x;x<r.x+r.w;x++)
				this.zoneAt.set(this._cellKey(x,y),zone);
		}
		for(const room of metadata.rooms || [])
		{
			if(room == null) continue;
			for(let y=room.y;y<room.y+room.h;y++) for(let x=room.x;x<room.x+room.w;x++)
				this.roomAt.set(this._cellKey(x,y),room);
		}
	}

	static getRoomAt(x,y) {return this.roomAt.get(this._cellKey(x,y)) || null;}
	static getZoneAt(x,y) {return this.zoneAt.get(this._cellKey(x,y)) || null;}

	// Returns only semantic geometry needed by S1 after save/load.
	static getSerializableMapMetadata()
	{
		if(this.mapMetadata == null) return null;
		return {
			seed:this.mapMetadata.seed ?? null,
			zones:(this.mapMetadata.zones || []).map(zone => ({
				id:zone.id,type:zone.type,role:zone.role,generator:zone.generator,specialType:zone.specialType || null,
				rect:zone.rect ? {...zone.rect} : null,metadata:zone.metadata ? {...zone.metadata} : null
			})),
			rooms:(this.mapMetadata.rooms || []).map(room => ({
				id:room.id,zoneId:room.zoneId,roomType:room.roomType || null,special:room.special === true,
				x:room.x,y:room.y,w:room.w,h:room.h
			}))
		};
	}

	static emitUnitPositionChange(unit,fromX,fromY,toX,toY,source='move')
	{
		if(unit == null || (fromX === toX && fromY === toY)) return;
		const from = {x:fromX,y:fromY}, to = {x:toX,y:toY};
		const fromRoom = this.getRoomAt(fromX,fromY), toRoom = this.getRoomAt(toX,toY);
		const fromZone = this.getZoneAt(fromX,fromY), toZone = this.getZoneAt(toX,toY);
		const base = {unit,player:unit.player || null,playerName:unit.player ? unit.player.name : null,from,to,source};

		this.emit('unit_enter_cell',{...base,mapX:toX,mapY:toY,room:toRoom,zone:toZone});
		if((fromRoom ? fromRoom.id : null) !== (toRoom ? toRoom.id : null))
		{
			if(fromRoom) this.emit('unit_leave_room',{...base,room:fromRoom,nextRoom:toRoom});
			if(toRoom) this.emit('unit_enter_room',{...base,room:toRoom,previousRoom:fromRoom});
		}
		if((fromZone ? fromZone.id : null) !== (toZone ? toZone.id : null))
		{
			if(fromZone) this.emit('unit_leave_zone',{...base,zone:fromZone,nextZone:toZone});
			if(toZone) this.emit('unit_enter_zone',{...base,zone:toZone,previousZone:fromZone});
		}
	}

	static beginRound()
	{
		this.roundIndex++;
		this.emit('round_started',{round:this.roundIndex});
		return this.roundIndex;
	}

	static endRound()
	{
		this.emit('round_ended',{round:this.roundIndex});
	}

	static beginTurn(player,playerInd)
	{
		this.activeTurnPlayerInd = playerInd;
		this.emit('turn_started',{player,playerInd,playerName:player ? player.name : null,round:this.roundIndex});
	}

	static endTurn(player,playerInd)
	{
		if(this.activeTurnPlayerInd !== playerInd) return false;
		this.emit('turn_ended',{player,playerInd,playerName:player ? player.name : null,round:this.roundIndex});
		this.activeTurnPlayerInd = null;
		return true;
	}
}

globalThis.ScenarioEvents = ScenarioEventBus;
globalThis.setScenarioEventDebug = enabled => ScenarioEvents.setDebug(enabled);
