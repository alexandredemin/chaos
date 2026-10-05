//---------------------------- AI combat value and threat cache ----------------------------

class AICombatValue
{
	static unitValue(unit)
	{
		if(unit == null) return 0;
		if(unit.player != null && unit === unit.player.wizard) return 100;
		const id = unit.config ? unit.config.name : null;
		const summon = typeof spellConfigs !== 'undefined' && id != null ? spellConfigs[id] : null;
		if(summon && summon.type === 'summon' && Number.isFinite(summon.cost) && summon.cost > 0) return summon.cost;
		const f = unit.features || (unit.config ? unit.config.features : null) || {};
		return .5 * ((f.strength || 1) + (f.defense || 1)) * Math.max(1,f.health || 1);
	}

	static hitChance(power,target)
	{
		if(power <= 0 || target == null) return 0;
		const current = typeof target.getCurrentFeatures === 'function' ? target.getCurrentFeatures() : target.features;
		const defense = Math.max(0,current && current.defense != null ? current.defense : 1);
		return power / (power + defense);
	}

	static expectedDamageValue(target,power)
	{
		if(target == null || target.died) return 0;
		const hp = Math.max(1,target.features && target.features.health != null ? target.features.health : 1);
		return this.hitChance(power,target) * this.unitValue(target) / hp;
	}
}

class AIThreatSystem
{
	ai = null;
	cache = null;
	revision = 1;
	dynamicRevision = 1;
	dynamicSignature = null;

	constructor(ai)
	{
		this.ai = ai;
		this.cache = new Map();
	}

	startTurn()
	{
		this.dynamicSignature = null;
		this.invalidateAll();
	}

	syncDynamicBlockers()
	{
		const unitSig = units.filter(u => u != null && !u.died).map(u => (u.id??u.config?.name)+':' + u.mapX + ':' + u.mapY).join('|');
		const entSig = entities.filter(e => e != null && e.features && e.features.blocksLOS !== false).map(e => (e.id??e.config?.name)+':' + e.mapX + ':' + e.mapY + ':' + (e.features.blocksLOS===false?0:1)).join('|');
		const sig = unitSig + '#' + entSig;
		if(this.dynamicSignature === sig) return;
		this.dynamicSignature = sig;
		this.invalidateDynamic();
	}

	invalidateAll()
	{
		this.revision++;
		this.dynamicRevision++;
		this.cache.clear();
	}

	// Keep expensive mobility envelopes, but discard LOS-dependent projections.
	invalidateDynamic()
	{
		this.dynamicRevision++;
		for(const c of this.cache.values())
		{
			c.fireMasks = new Map();
			c.jumpMasks = new Map();
			c.dangerMaps = new Map();
		}
	}

	getAbility(unit,type)
	{
		if(unit == null || unit.config == null || unit.config.abilities == null) return null;
		return Object.values(unit.config.abilities).find(a => a && a.type === type) || null;
	}

	isKnownEnemy(enemy)
	{
		return enemy != null && !enemy.died && enemy.player !== this.ai.player && this.ai.isUnitKnown(enemy);
	}

	getBroadRadius(enemy)
	{
		const base = enemy.config && enemy.config.features ? enemy.config.features : enemy.features || {};
		const move = Math.max(0,base.move || 0);
		const ap = Math.max(0,base.abilityPoints || 0);
		const jump = ap > 0 ? this.getAbility(enemy,'jump') : null;
		const fire = ap > 0 ? this.getAbility(enemy,'fire') : null;
		const gas = ap > 0 ? this.getAbility(enemy,'gas') : null;
		const jumpRange = jump ? jump.config.range || 0 : 0;
		const actionRange = Math.max(1,fire ? fire.config.range || 0 : 0,gas ? gas.config.range || 0 : 0,jumpRange);
		return move + jumpRange * ap + actionRange + 1;
	}

	canBroadReach(enemy,x,y)
	{
		const r = this.getBroadRadius(enemy);
		return Math.abs(enemy.mapX-x) <= r && Math.abs(enemy.mapY-y) <= r;
	}

	getDangerAt(target,x,y)
	{
		return this.getDangerBreakdown(target,x,y).total;
	}

	getDangerBreakdown(target,x,y)
	{
		const result={melee:0,fire:0,gas:0,jump:0,total:0};
		if(target==null||x<0||y<0||x>=map.width||y>=map.height)return result;
		for(const enemy of units)
		{
			if(!this.isKnownEnemy(enemy)||!this.canBroadReach(enemy,x,y))continue;
			const c=this.getEnemyCache(enemy);if(c==null)continue;
			const d=this.getEnemyDangerAt(c,enemy,target,x,y);
			result.melee+=d.melee;result.fire+=d.fire;result.gas+=d.gas;result.jump+=d.jump;result.total+=d.total;
		}
		return result;
	}

	// Calculate one enemy's best compatible one-turn threat from a single resource state.
	// This avoids adding melee from one route to Jump/Fire/Gas from a different route.
	getEnemyDangerAt(c,enemy,target,x,y)
	{
		const cur=typeof target.getCurrentFeatures==='function'?target.getCurrentFeatures():target.features||{};
		const targetKey=(target.id!=null?target.id:target.config.name)+'|'+this.dynamicRevision+'|'+(target.features.health??0)+'|'+(cur.defense??0);
		let cache=c.dangerMaps.get(targetKey);
		if(cache==null)
		{
			const size=map.width*map.height;
			cache={done:new Uint8Array(size),melee:new Float32Array(size),fire:new Float32Array(size),gas:new Float32Array(size),jump:new Float32Array(size),total:new Float32Array(size)};
			c.dangerMaps.set(targetKey,cache);
		}
		const idx=y*map.width+x;
		if(cache.done[idx])return{melee:cache.melee[idx],fire:cache.fire[idx],gas:cache.gas[idx],jump:cache.jump[idx],total:cache.total[idx]};

		const base=enemy.config&&enemy.config.features?enemy.config.features:enemy.features||{};
		const meleeValue=(base.attackPoints||0)>0?AICombatValue.expectedDamageValue(target,enemy.features.strength||1):0;
		const fireValue=c.fireAbility?AICombatValue.expectedDamageValue(target,c.fireAbility.config.damage||1):0;
		const gasValue=c.gasAbility&&!target.features.gasImmunity?AICombatValue.expectedDamageValue(target,c.gasAbility.config.damage||1):0;
		const jumpValue=c.jumpAbility?AICombatValue.expectedDamageValue(target,c.jumpAbility.config.damage||1):0;
		const fireFactor=c.fireAbility?(this.getFireCoverage(c,enemy,target)[idx]||0):0;
		let bestMelee=0,bestFire=0,bestGas=0,bestJump=0,bestTotal=0;

		for(const state of c.states)
		{
			const dx=x-state.x,dy=y-state.y,adx=Math.abs(dx),ady=Math.abs(dy),d2=dx*dx+dy*dy;
			const melee=(meleeValue>0&&state.move>0&&(adx>0||ady>0)&&adx<=1&&ady<=1)?meleeValue:0;
			let fire=0,gas=0,jump=0;
			if(state.ap>0)
			{
				if(c.fireAbility&&d2<=(c.fireAbility.config.range||0)**2&&checkLineOfSight(state.x,state.y,x,y,null,null,u=>(u===target||u===enemy)?true:false))fire=fireValue*fireFactor;
				if(c.gasAbility&&d2<=(c.gasAbility.config.range||0)**2)gas=gasValue;
				if(c.jumpAbility&&(dx!==0||dy!==0)&&d2<=(c.jumpAbility.config.range||0)**2&&checkLineOfSight(state.x,state.y,x,y,null,null,u=>(u===target||u===enemy)?true:false))jump=jumpValue;
			}
			bestMelee=Math.max(bestMelee,melee);bestFire=Math.max(bestFire,fire);bestGas=Math.max(bestGas,gas);bestJump=Math.max(bestJump,jump);
			bestTotal=Math.max(bestTotal,melee+Math.max(fire,gas,jump));
		}

		cache.done[idx]=1;cache.melee[idx]=bestMelee;cache.fire[idx]=bestFire;cache.gas[idx]=bestGas;cache.jump[idx]=bestJump;cache.total[idx]=bestTotal;
		return{melee:bestMelee,fire:bestFire,gas:bestGas,jump:bestJump,total:bestTotal};
	}

	getEnemyCache(enemy)
	{
		if(!this.isKnownEnemy(enemy)) return null;
		const sig = this.getEnemySignature(enemy);
		let c = this.cache.get(enemy);
		if(c != null && c.signature === sig) return c;
		c = this.buildEnemyCache(enemy,sig);
		this.cache.set(enemy,c);
		return c;
	}

	getEnemySignature(enemy)
	{
		return [this.revision,enemy.mapX,enemy.mapY,enemy.died?1:0].join('|');
	}

	buildEnemyCache(enemy,signature)
	{
		const states = this.buildMobilityEnvelope(enemy);
		const size = map.width * map.height;
		const c = {
			signature,
			states,
			meleeMask:new Uint8Array(size),
			gasMask:new Uint8Array(size),
			fireAbility:this.getAbility(enemy,'fire'),
			gasAbility:this.getAbility(enemy,'gas'),
			jumpAbility:this.getAbility(enemy,'jump'),
			fireOrigins:[],
			jumpOrigins:[],
			fireMasks:new Map(),
			jumpMasks:new Map(),
			dangerMaps:new Map()
		};

		const fireOrigins = new Map(), gasOrigins = new Map(), jumpOrigins = new Map();
		for(const s of states)
		{
			const base = enemy.config && enemy.config.features ? enemy.config.features : enemy.features || {};
			if((base.attackPoints || 0) > 0 && s.move > 0)
				this.markAdjacent(c.meleeMask,s.x,s.y);
			if(s.ap > 0 && c.fireAbility) fireOrigins.set(s.x+':'+s.y,{x:s.x,y:s.y});
			if(s.ap > 0 && c.gasAbility) gasOrigins.set(s.x+':'+s.y,{x:s.x,y:s.y});
			if(s.ap > 0 && c.jumpAbility) jumpOrigins.set(s.x+':'+s.y,{x:s.x,y:s.y});
		}
		c.fireOrigins = [...fireOrigins.values()];
		c.jumpOrigins = [...jumpOrigins.values()];
		if(c.gasAbility)
			for(const origin of gasOrigins.values()) this.markRadius(c.gasMask,origin.x,origin.y,c.gasAbility.config.range || 0);
		return c;
	}

	buildMobilityEnvelope(enemy)
	{
		const base = enemy.config && enemy.config.features ? enemy.config.features : enemy.features || {};
		const start = {x:enemy.mapX,y:enemy.mapY,move:Math.max(0,base.move||0),ap:Math.max(0,base.abilityPoints||0)};
		const jump = this.getAbility(enemy,'jump'), states = new Map(), queue = [start];
		this.acceptState(states,start);

		for(let qi=0;qi<queue.length;qi++)
		{
			const state = queue[qi];
			if(state.move > 0)
			{
				for(let y=state.y-1;y<=state.y+1;y++) for(let x=state.x-1;x<=state.x+1;x++)
				{
					if(x<0||y<0||x>=map.width||y>=map.height||(x===state.x&&y===state.y)) continue;
					const cost = this.getStepCost(enemy,x,y);
					if(cost == null || cost > state.move) continue;
					const next = {x,y,move:state.move-cost,ap:state.ap};
					if(this.acceptState(states,next)) queue.push(next);
				}
			}
			if(jump != null && state.ap > 0)
			{
				for(const cell of this.getJumpLandingCells(enemy,state,jump.config.range || 0,true))
				{
					const next = {x:cell[0],y:cell[1],move:state.move,ap:state.ap-1};
					if(this.acceptState(states,next)) queue.push(next);
				}
			}
		}

		const out=[];for(const arr of states.values())for(const s of arr)out.push(s);return out;
	}

	getStepCost(enemy,x,y)
	{
		const wall = wallsLayer.getTileAt(x,y);
		if(wall != null && wall.properties['collides'] === true) return null;
		let cost = 1;
		const entity = Entity.getEntityAtMap(x,y);
		if(entity != null)
		{
			const stepCost = entity.evaluateStep(enemy);
			if(stepCost === false) return null;
			cost += Math.floor(stepCost+.5) * Math.max(1,enemy.config.features.move||1);
		}
		return cost;
	}

	acceptState(mapByCell,state)
	{
		const key = state.x+':'+state.y;
		let arr = mapByCell.get(key);
		if(arr == null) arr = [];
		if(arr.some(s => s.move >= state.move && s.ap >= state.ap)) return false;
		arr = arr.filter(s => !(state.move >= s.move && state.ap >= s.ap));
		arr.push(state);
		mapByCell.set(key,arr);
		return true;
	}

	getJumpLandingCells(enemy,state,range,ignoreUnits=false)
	{
		const out = [], r2 = range * range;
		const minX = Math.max(0,state.x-range), maxX = Math.min(map.width-1,state.x+range);
		const minY = Math.max(0,state.y-range), maxY = Math.min(map.height-1,state.y+range);
		for(let y=minY;y<=maxY;y++) for(let x=minX;x<=maxX;x++)
		{
			const dx=x-state.x,dy=y-state.y;
			if((dx===0&&dy===0) || dx*dx+dy*dy>r2) continue;
			const wall = wallsLayer.getTileAt(x,y);
			if(wall != null && wall.properties['collides'] === true) continue;
			if(!ignoreUnits && getUnitAtMap(x,y) != null) continue;
			if(!checkLineOfSight(state.x,state.y,x,y,null,null,ignoreUnits?function(){return true;}:null)) continue;
			out.push([x,y]);
		}
		return out;
	}

	getFireCoverage(c,enemy,target)
	{
		const key = (target.id != null ? target.id : target.config.name) + '|' + this.dynamicRevision;
		if(c.fireMasks.has(key)) return c.fireMasks.get(key);
		const size = map.width * map.height, counts = new Uint16Array(size), result = new Float32Array(size);
		const range = c.fireAbility.config.range || 0, r2 = range*range, origins = c.fireOrigins;
		for(const origin of origins)
		{
			const minX=Math.max(0,origin.x-range),maxX=Math.min(map.width-1,origin.x+range);
			const minY=Math.max(0,origin.y-range),maxY=Math.min(map.height-1,origin.y+range);
			for(let y=minY;y<=maxY;y++) for(let x=minX;x<=maxX;x++)
			{
				const dx=x-origin.x,dy=y-origin.y;
				if(dx*dx+dy*dy>r2) continue;
				if(!checkLineOfSight(origin.x,origin.y,x,y,null,null,u => (u===target || u===enemy) ? true : false)) continue;
				counts[y*map.width+x]++;
			}
		}
		const n = origins.length;
		for(let i=0;i<size;i++)
		{
			const k = counts[i];
			if(k <= 0) continue;
			// One valid origin is the minimum practical threat (0.5); all origins able to fire gives 1.0.
			result[i] = n <= 1 ? 1 : .5 + .5 * (k-1) / (n-1);
		}
		c.fireMasks.set(key,result);
		return result;
	}

	getJumpMask(c,enemy,target)
	{
		const key = (target.id != null ? target.id : target.config.name) + '|' + this.dynamicRevision;
		if(c.jumpMasks.has(key)) return c.jumpMasks.get(key);
		const result = new Uint8Array(map.width * map.height), range = c.jumpAbility.config.range || 0, r2=range*range;
		for(const origin of c.jumpOrigins)
		{
			const minX=Math.max(0,origin.x-range),maxX=Math.min(map.width-1,origin.x+range);
			const minY=Math.max(0,origin.y-range),maxY=Math.min(map.height-1,origin.y+range);
			for(let y=minY;y<=maxY;y++) for(let x=minX;x<=maxX;x++)
			{
				const dx=x-origin.x,dy=y-origin.y;
				if((dx===0&&dy===0)||dx*dx+dy*dy>r2) continue;
				const wall=wallsLayer.getTileAt(x,y);if(wall!=null&&wall.properties['collides']===true)continue;
				if(checkLineOfSight(origin.x,origin.y,x,y,null,null,u => (u===target || u===enemy) ? true : false)) result[y*map.width+x]=1;
			}
		}
		c.jumpMasks.set(key,result);
		return result;
	}

	markAdjacent(mask,x,y)
	{
		for(let yy=y-1;yy<=y+1;yy++) for(let xx=x-1;xx<=x+1;xx++)
		{
			if(xx<0||yy<0||xx>=map.width||yy>=map.height||(xx===x&&yy===y)) continue;
			mask[yy*map.width+xx]=1;
		}
	}

	markRadius(mask,cx,cy,range)
	{
		const r2=range*range,minX=Math.max(0,cx-range),maxX=Math.min(map.width-1,cx+range),minY=Math.max(0,cy-range),maxY=Math.min(map.height-1,cy+range);
		for(let y=minY;y<=maxY;y++) for(let x=minX;x<=maxX;x++)
		{
			const dx=x-cx,dy=y-cy;if(dx*dx+dy*dy<=r2)mask[y*map.width+x]=1;
		}
	}

	withUnitState(unit,state,fn)
	{
		const old={x:unit.mapX,y:unit.mapY,move:unit.features.move,ap:unit.features.abilityPoints};
		unit.mapX=state.x;unit.mapY=state.y;unit.features.move=state.move;unit.features.abilityPoints=state.ap;
		try{return fn();}
		finally{unit.mapX=old.x;unit.mapY=old.y;unit.features.move=old.move;unit.features.abilityPoints=old.ap;}
	}
}
