//---------------------------- Game flow watchdog / async safety ----------------------------

class GameFlowWatchdog
{
	static enabled = true;
	static stallTimeoutMs = 8000;
	static ringSize = 120;
	static storageKey = 'chaos_game_flow_last_stall';

	static events = [];
	static waits = new Map();
	static activePhase = null;
	static lastProgressAt = 0;
	static stallReported = false;
	static nextId = 1;
	static timer = null;

	static setEnabled(enabled)
	{
		this.enabled = enabled === true;
		if(this.enabled) this.startTimer();
		else
		{
			this.activePhase = null;
			this.waits.clear();
			if(this.timer != null) clearInterval(this.timer);
			this.timer = null;
		}
	}

	static startTimer()
	{
		if(!this.enabled || this.timer != null) return;
		this.lastProgressAt = Date.now();
		this.timer = setInterval(() => this.check(),1000);
	}

	static push(type, data=null)
	{
		if(!this.enabled) return;
		this.events.push({time:Date.now(),type:type,data:this.safeData(data)});
		if(this.events.length > this.ringSize) this.events.splice(0,this.events.length-this.ringSize);
	}

	static touch(type, data=null)
	{
		if(!this.enabled) return;
		this.startTimer();
		this.lastProgressAt = Date.now();
		this.stallReported = false;
		this.push(type,data);
	}

	static beginPhase(name, data=null)
	{
		if(!this.enabled) return;
		this.activePhase = {name:name,data:this.safeData(data),startedAt:Date.now()};
		this.touch('phase_begin',{name:name,data:data});
	}

	static endPhase(name=null, data=null)
	{
		if(!this.enabled) return;
		if(this.activePhase != null && (name == null || this.activePhase.name === name))
		{
			this.touch('phase_end',{name:this.activePhase.name,data:data});
			this.activePhase = null;
		}
	}

	static wait(label, data=null, timeoutMs=null)
	{
		if(!this.enabled) return null;
		this.startTimer();
		const id = 'wait_' + this.nextId++;
		this.waits.set(id,{
			id:id,
			label:label,
			data:this.safeData(data),
			startedAt:Date.now(),
			timeoutMs:timeoutMs != null ? timeoutMs : this.stallTimeoutMs
		});
		this.touch('wait_begin',{id:id,label:label,data:data});
		return id;
	}

	static done(id, data=null)
	{
		if(!this.enabled || id == null) return;
		const wait = this.waits.get(id);
		if(wait == null) return;
		this.waits.delete(id);
		this.touch('wait_end',{id:id,label:wait.label,data:data});
	}

	static check()
	{
		if(!this.enabled || this.stallReported || document.hidden) return;
		const now = Date.now();
		let stalledWait = null;
		for(const wait of this.waits.values())
		{
			if(now-wait.startedAt >= wait.timeoutMs)
			{
				stalledWait = wait;
				break;
			}
		}
		const phaseStalled = this.activePhase != null && now-this.lastProgressAt >= this.stallTimeoutMs;
		if(stalledWait == null && !phaseStalled) return;
		this.stallReported = true;
		const snapshot = this.buildSnapshot(stalledWait != null ? 'async_wait_timeout' : 'phase_no_progress',stalledWait);
		try
		{
			localStorage.setItem(this.storageKey,JSON.stringify(snapshot));
		}
		catch(error)
		{
			console.warn('GameFlowWatchdog: unable to save stall snapshot.',error);
		}
		console.error('GAME FLOW STALL',snapshot);
	}

	static resetAfterBackground()
	{
		if(!this.enabled) return;
		const now = Date.now();
		this.lastProgressAt = now;
		this.stallReported = false;
		if(this.activePhase != null) this.activePhase.startedAt = now;
		for(const wait of this.waits.values())
			wait.startedAt = now;
		this.push('page_visible',{
			waits:this.waits.size,
			phase:this.activePhase ? this.activePhase.name : null
		});
	}

	static buildSnapshot(reason, stalledWait=null)
	{
		const currentPlayer = typeof players !== 'undefined' && typeof playerInd !== 'undefined' && players && players[playerInd] ? players[playerInd] : null;
		const ai = currentPlayer && currentPlayer.aiControl ? currentPlayer.aiControl : null;

		return {
			time:Date.now(),
			reason:reason,
			phase:this.safeData(this.activePhase),
			stalledWait:this.safeData(stalledWait),
			waits:Array.from(this.waits.values()).map(wait => this.safeData(wait)),
			events:this.events.slice(),
			playerInd:typeof playerInd !== 'undefined' ? playerInd : null,
			currentPlayer:currentPlayer ? {name:currentPlayer.name,control:currentPlayer.control,isIndependent:currentPlayer.isIndependent === true} : null,
			ai:ai ? {
				passStage:ai.passStage,
				currentUnit:this.unitData(ai.currentUnit),
				availableUnits:Array.isArray(ai.availableUnits) ? ai.availableUnits.map(unit => this.unitData(unit)) : []
			} : null,
			selectedUnit:typeof selectedUnit !== 'undefined' ? this.unitData(selectedUnit) : null,
			units:typeof units !== 'undefined' && Array.isArray(units) ? units.map(unit => this.unitData(unit)) : [],
			entities:typeof entities !== 'undefined' && Array.isArray(entities) ? entities.map(entity => this.entityData(entity)) : []
		};
	}

	static unitData(unit)
	{
		if(unit == null) return null;
		const traffic = unit.aiTraffic || null;
		return {
			id:unit.id,
			name:unit.config ? unit.config.name : null,
			player:unit.player ? unit.player.name : null,
			mapX:unit.mapX,
			mapY:unit.mapY,
			died:unit.died === true,
			active:unit.active !== false,
			isMoving:unit.isMoving === true,
			move:unit.features ? unit.features.move : null,
			abilityPoints:unit.features ? unit.features.abilityPoints : null,
			attackPoints:unit.features ? unit.features.attackPoints : null,
			traffic:traffic ? {
				incoming:traffic.incoming ? {id:traffic.incoming.id,senderId:traffic.incoming.sender ? traffic.incoming.sender.id : null,priority:traffic.incoming.priority} : null,
				outgoing:traffic.outgoing ? {id:traffic.outgoing.id,targetId:traffic.outgoing.target ? traffic.outgoing.target.id : null,x:traffic.outgoing.x,y:traffic.outgoing.y,reason:traffic.outgoing.reason} : null,
				deferred:traffic.deferred ? {targetId:traffic.deferred.target ? traffic.deferred.target.id : null,x:traffic.deferred.x,y:traffic.deferred.y,reason:traffic.deferred.reason} : null,
				yieldDir:this.safeData(traffic.yieldDir),
				pendingStep:this.safeData(traffic.pendingStep)
			} : null,
			messageCount:Array.isArray(unit.aiMessages) ? unit.aiMessages.length : 0
		};
	}

	static entityData(entity)
	{
		if(entity == null) return null;
		return {
			name:entity.config ? entity.config.name : null,
			mapX:entity.mapX,
			mapY:entity.mapY,
			moved:entity.moved === true,
			active:entity.active !== false
		};
	}

	static safeData(data)
	{
		if(data == null) return data;
		if(typeof data === 'string' || typeof data === 'number' || typeof data === 'boolean') return data;
		if(Array.isArray(data)) return data.slice(0,20).map(item => this.safeData(item));
		if(typeof data !== 'object') return String(data);

		const result = {};
		let count = 0;
		for(const key of Object.keys(data))
		{
			if(count++ >= 20) break;
			const value = data[key];
			if(value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') result[key] = value;
			else if(Array.isArray(value)) result[key] = value.slice(0,10).map(item => this.safeData(item));
			else if(value.id != null) result[key] = {id:value.id,name:value.config ? value.config.name : null};
			else if(value.mapX != null && value.mapY != null) result[key] = {mapX:value.mapX,mapY:value.mapY,name:value.config ? value.config.name : null};
		}
		return result;
	}

	static getLastStall()
	{
		try
		{
			const value = localStorage.getItem(this.storageKey);
			return value != null ? JSON.parse(value) : null;
		}
		catch(error)
		{
			return null;
		}
	}

	static clearLastStall()
	{
		try {localStorage.removeItem(this.storageKey);}
		catch(error) {}
	}
}

class AsyncGuard
{
	static enabled = true;
	static defaultTimeoutMs = 5000;
	static active = new Set();

	static wrap(label, callback, options={})
	{
		let finished = false;
		let timer = null;
		const timeoutMs = options.timeoutMs != null ? options.timeoutMs : this.defaultTimeoutMs;
		const waitId = GameFlowWatchdog.wait(label,options.data || null,timeoutMs);

		const finish = (source,args=[]) =>
		{
			if(finished) return false;
			finished = true;

			if(timer != null) clearTimeout(timer);
			this.active.delete(guard);

			if(source === 'timeout')
			{
				GameFlowWatchdog.push('async_timeout',{label:label,data:options.data || null});

				if(typeof options.onTimeout === 'function')
				{
					try {options.onTimeout();}
					catch(error) {console.error('AsyncGuard timeout handler failed:',label,error);}
				}
			}

			GameFlowWatchdog.done(waitId,{source:source});
			if(typeof callback === 'function') callback(...args);

			return true;
		};

		const arm = () =>
		{
			if(finished || !this.enabled || timeoutMs <= 0) return;

			if(timer != null) clearTimeout(timer);

			timer = setTimeout(() =>
			{
				timer = null;

				if(document.hidden) return;

				finish(
					'timeout',
					Array.isArray(options.timeoutArgs) ? options.timeoutArgs : []
				);
			},timeoutMs);
		};

		const guard = (...args) => finish('callback',args);

		guard.reset = () =>
		{
			if(finished) return;
			arm();
		};

		guard.cancel = () =>
		{
			if(finished) return;

			finished = true;
			if(timer != null) clearTimeout(timer);

			this.active.delete(guard);
			GameFlowWatchdog.done(waitId,{source:'cancel'});
		};

		this.active.add(guard);
		arm();

		return guard;
	}

	static resetAll()
	{
		if(!this.enabled) return;

		for(const guard of Array.from(this.active))
			guard.reset();
	}
}


document.addEventListener('visibilitychange',() =>
{
	if(document.hidden) return;
	AsyncGuard.resetAll();
	GameFlowWatchdog.resetAfterBackground();
});

GameFlowWatchdog.setEnabled(GameFlowWatchdog.enabled);
