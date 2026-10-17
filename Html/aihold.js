//---------------------------- HOLD: shared area geometry, unit scoring and assignments ----------------------------

const AI_HOLD_CONFIG=Object.freeze({defaultRadius:5,slotSpacing:1,travelPenalty:.05,congestionPenalty:.35});

class AIHoldArea
{
	constructor(ai,center,mode,radius,config=AI_HOLD_CONFIG)
	{
		this.ai=ai;this.center=center;this.mode=mode;this.radius=radius;this.config=config;
		this.cells=[];this.keys=new Set();this.entries=[];this.entryBand=[];
		this.fireMasks=new Map();this.meleeMasks=new Map();this.fireProtection=new Map();this.meleeProtection=new Map();
		this.unitScores=new WeakMap();
		this.buildGeometry();this.buildMatrices();
	}
	key(x,y){return y*map.width+x;}
	contains(x,y){return this.keys.has(this.key(x,y));}
	passable(x,y)
	{
		if(x<0||y<0||x>=map.width||y>=map.height)return false;
		const wall=wallsLayer.getTileAt(x,y);return wall==null||wall.properties.collides!==true;
	}
	buildGeometry()
	{
		const [cx,cy]=this.center;
		if(!this.passable(cx,cy))return;
		const room=this.mode==='room'&&typeof ScenarioEvents!=='undefined'?ScenarioEvents.getRoomAt(cx,cy):null;
		this.room=room||null;
		const queue=[[cx,cy,0]],seen=new Set([this.key(cx,cy)]);
		for(let i=0;i<queue.length;i++)
		{
			const [x,y,dist]=queue[i],k=this.key(x,y);
			this.keys.add(k);this.cells.push({x,y,k});
			for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)
			{
				if(!dx&&!dy)continue;
				const nx=x+dx,ny=y+dy,nk=this.key(nx,ny);
				if(seen.has(nk)||!this.passable(nx,ny))continue;
				if(room)
				{
					if(ScenarioEvents.getRoomAt(nx,ny)!==room)continue;
				}
				else if(dist>=this.radius)continue;
				seen.add(nk);queue.push([nx,ny,dist+1]);
			}
		}
		// Room boundaries: only actual passable approaches (including doors); radius: whole perimeter.
		const entries=[];
		for(const c of this.cells)
		{
			let edge=false;
			for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]])
			{
				const nx=c.x+dx,ny=c.y+dy;
				if(!this.contains(nx,ny)&&this.passable(nx,ny)){edge=true;break;}
			}
			if(edge)entries.push(c);
		}
		// A sealed room without usable portals can still protect its interior; its perimeter
		// is the conservative fallback for static cover assessment.
		this.entries=entries.length?entries:this.cells.filter(c=>[[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>!this.contains(c.x+dx,c.y+dy)));
		const band=new Set();
		for(const e of this.entries)for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)
		{
			if(Math.max(Math.abs(dx),Math.abs(dy))>2)continue;
			const x=e.x+dx,y=e.y+dy;if(this.contains(x,y))band.add(this.key(x,y));
		}
		this.entryBand=this.cells.filter(c=>band.has(c.k));
	}
	maskLength(n){return Math.ceil(n/32);}
	setBit(mask,index){mask[index>>>5]|=1<<(index&31);}
	bit(mask,index){return(mask[index>>>5]&(1<<(index&31)))!==0;}
	popcount(mask){let n=0;for(let v of mask){v>>>=0;while(v){v&=v-1;n++;}}return n;}
	los(x,y,tx,ty){return x===tx&&y===ty||checkLineOfSight(x,y,tx,ty,null,null,()=>true)===true;}
	buildMatrices()
	{
		const ne=this.entries.length,nb=this.entryBand.length;
		for(const c of this.cells)
		{
			const fire=new Uint32Array(this.maskLength(ne)),melee=new Uint32Array(this.maskLength(nb));
			for(let i=0;i<ne;i++)if(this.los(c.x,c.y,this.entries[i].x,this.entries[i].y))this.setBit(fire,i);
			for(let i=0;i<nb;i++)if(Math.max(Math.abs(c.x-this.entryBand[i].x),Math.abs(c.y-this.entryBand[i].y))===1)this.setBit(melee,i);
			this.fireMasks.set(c.k,fire);this.meleeMasks.set(c.k,melee);
			this.fireProtection.set(c.k,ne?1-this.popcount(fire)/ne:1);
			let exposed=0;
			for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(dx||dy)
				if(this.passable(c.x+dx,c.y+dy))exposed++;
			this.meleeProtection.set(c.k,1-exposed/8);
		}
	}
	positionsFrom(x,y,maxCost,unit)
	{
		// Weighted local Dijkstra: Web/Glue penalties affect a unit's usable firing/melee positions.
		const result=[],queue=[[x,y,0]],best=new Map([[this.key(x,y),0]]);
		while(queue.length)
		{
			queue.sort((a,b)=>a[2]-b[2]);
			const [px,py,d]=queue.shift();if(d>best.get(this.key(px,py)))continue;
			result.push([px,py]);if(d>=maxCost)continue;
			for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)
			{
				if(!dx&&!dy)continue;
				const nx=px+dx,ny=py+dy,k=this.key(nx,ny);
				if(!this.contains(nx,ny))continue;
				let cost=1;
				for(const entity of Entity.getEntitiesAtMap(nx,ny)||[])
				{
					if(typeof entity.evaluateStep!=='function')continue;
					const extra=entity.evaluateStep(unit);
					if(extra===false){cost=Infinity;break;}
					if(Number.isFinite(extra))cost+=Math.floor(extra+.5)*Math.max(1,unit.config?.features?.move||1);
				}
				const nd=d+cost;
				if(nd>maxCost||nd>=(best.get(k)??Infinity))continue;
				best.set(k,nd);queue.push([nx,ny,nd]);
			}
		}
		return result;
	}
	coverage(unit,c,kind,range=Infinity)
	{
		const fire=kind==='fire',points=fire?this.entries:this.entryBand;
		if(!points.length)return 0;
		const move=Math.max(0,unit.config?.features?.move||0);
		// For FIRE allow step-out / shoot / step-back; for melee allow movement + attack.
		const attackCost=unit.features?.attackCost??unit.config?.features?.attackCost??move;
		const steps=fire?Math.floor(move/2):Math.max(0,move-attackCost);
		const mask=new Uint32Array(this.maskLength(points.length));
		for(const [x,y] of this.positionsFrom(c.x,c.y,steps,unit))
		{
			const part=(fire?this.fireMasks:this.meleeMasks).get(this.key(x,y));if(!part)continue;
			for(let i=0;i<points.length;i++)
			{
				if(!this.bit(part,i))continue;
				if(fire)
				{
					const dx=x-points[i].x,dy=y-points[i].y;
					if(dx*dx+dy*dy>range*range)continue;
				}
				this.setBit(mask,i);
			}
		}
		return this.popcount(mask)/points.length;
	}
	breakdown(unit,x,y)
	{
		const k=this.key(x,y);
		if(!this.keys.has(k))return null;
		// Per-unit cache: movement penalties and immunities may differ even for the same summon type.
		if(!this.unitScores.has(unit))this.unitScores.set(unit,new Map());
		const cache=this.unitScores.get(unit);
		if(cache.has(k))return cache.get(k);
		const fireProtection=this.fireProtection.get(k),meleeProtection=this.meleeProtection.get(k);
		const fire=Object.values(unit.config?.abilities||{}).find(a=>a?.type==='fire');
		const fireControl=fire?this.coverage(unit,{x,y},'fire',fire.config.range||0):0;
		const meleeControl=this.coverage(unit,{x,y},'melee');
		const offense=fire?Math.max(fireControl,meleeControl):meleeControl;
		const defense=(fireProtection+meleeProtection)/2;
		const out={fireProtection,meleeProtection,fireControl,meleeControl,offense,defense,congestion:0,score:defense+offense};
		cache.set(k,out);return out;
	}
}

class AIHoldCoordinator
{
	constructor(ai,config=AI_HOLD_CONFIG){this.ai=ai;this.config=config;this.areas=new Map();this.groups=new Map();this.turnStamp=null;this.epoch=0;}
	getTurnStamp(){return this.ai.guardCoordinator?.getGameTurnStamp?.()??null;}
	startTurn(stamp=this.getTurnStamp()){this.turnStamp=stamp;this.epoch++;this.areas.clear();this.groups.clear();}
	syncTurn(){const stamp=this.getTurnStamp();if(stamp!=null&&stamp!==this.turnStamp)this.startTurn(stamp);}
	effectiveOrder(unit){return this.ai.getAITestOverride(unit)?.order||this.ai.getOrder(unit);}
	areaKey(order)
	{
		const pos=AIOrder.targetPos(order),s=AIOrder.state(order);
		if(!pos)return null;
		if(s.areaMode==='room'&&typeof ScenarioEvents!=='undefined')
		{
			const room=ScenarioEvents.getRoomAt(pos[0],pos[1]);
			if(room)return'room:'+(room.id??[room.x,room.y,room.w,room.h].join(':'));
		}
		return(s.areaMode==='room'?'room-fallback':'radius')+':'+pos.join(':')+':'+(s.radius||this.config.defaultRadius);
	}
	getArea(order)
	{
		this.syncTurn();if(!AIOrder.is(order,'hold'))return null;
		const key=this.areaKey(order);if(!key)return null;
		if(!this.areas.has(key))
		{
			const s=AIOrder.state(order),pos=AIOrder.targetPos(order);
			this.areas.set(key,new AIHoldArea(this.ai,pos,s.areaMode==='room'?'room':'radius',s.radius||this.config.defaultRadius,this.config));
		}
		return this.areas.get(key);
	}
	getUnits(key){return this.ai.player.units.filter(u=>u&&!u.died&&AIOrder.is(this.effectiveOrder(u),'hold')&&this.areaKey(this.effectiveOrder(u))===key);}
	getGroup(unit,order)
	{
		const area=this.getArea(order),key=this.areaKey(order);if(!area)return null;
		const group=this.groups.get(key);
		const holders=this.getUnits(key);
		if(group&&holders.length===group.holders.length&&holders.every(h=>group.holders.includes(h)))return group;
		return this.rebuild(key,area,holders);
	}
	rebuild(key,area,holders)
	{
		const group={area,holders,assignments:new Map(),epoch:this.epoch,turnStamp:this.turnStamp};
		this.groups.set(key,group);
		const options=new Map(),remaining=new Set(holders);
		for(const unit of holders)
		{
			const dmap=this.ai.getDistanceMap(unit,unit.mapX,unit.mapY,null,()=>true);
			const list=[];
			for(const c of area.cells)
			{
				const occupant=getUnitAtMap(c.x,c.y);
				if(occupant&&!holders.includes(occupant))continue;
				const b=area.breakdown(unit,c.x,c.y),d=dmap[c.y]?.[c.x];
				if(!b||d==null||d<0)continue;
				list.push({cell:c,b,base:b.score-this.config.travelPenalty*Math.max(0,d-dmap[unit.mapY][unit.mapX])});
			}
			list.sort((a,b)=>b.base-a.base);options.set(unit,list);
		}
		const used=[];
		while(remaining.size)
		{
			let bestPick=null;
			for(const unit of remaining)
			{
				const candidates=(options.get(unit)||[]).filter(p=>!used.some(u=>u.k===p.cell.k));
				const scored=candidates.map(p=>({...p,utility:p.base-this.congestion(p.cell,used)})).sort((a,b)=>b.utility-a.utility);
				if(!scored.length)continue;
				const regret=scored.length>1?scored[0].utility-scored[1].utility:1e6;
				if(!bestPick||regret>bestPick.regret||(regret===bestPick.regret&&scored[0].utility>bestPick.p.utility))bestPick={unit,p:scored[0],regret};
			}
			if(!bestPick)break;
			const {unit,p}=bestPick,assignment={x:p.cell.x,y:p.cell.y,score:p.utility,components:{...p.b,congestion:this.congestion(p.cell,used)},epoch:this.epoch};
			group.assignments.set(unit,assignment);used.push(p.cell);remaining.delete(unit);
		}
		for(const unit of remaining)group.assignments.set(unit,{x:unit.mapX,y:unit.mapY,score:0,components:null,epoch:this.epoch});
		this.assignFocus(group);
		return group;
	}
	congestion(cell,used)
	{
		let penalty=0;
		for(const c of used)
		{
			const d=Math.max(Math.abs(c.x-cell.x),Math.abs(c.y-cell.y));
			if(d<=this.config.slotSpacing)penalty+=this.config.congestionPenalty;
		}
		return penalty;
	}
	assignFocus(group)
	{
		const {area,holders}=group,targets=units.filter(e=>e&&!e.died&&e.player!==this.ai.player&&this.ai.isUnitKnown(e)&&area.contains(e.mapX,e.mapY));
		const assigned=new Map();group.focus=new Map();
		for(const unit of holders)
		{
			let best=null,bestValue=-Infinity;
			for(const enemy of targets)
			{
				const count=assigned.get(enemy)||0;
				const distance=Math.max(Math.abs(unit.mapX-enemy.mapX),Math.abs(unit.mapY-enemy.mapY));
				const value=AICombatValue.unitValue(enemy)/(1+count)-distance*.1;
				if(value>bestValue){best=enemy;bestValue=value;}
			}
			group.focus.set(unit,best);if(best)assigned.set(best,(assigned.get(best)||0)+1);
		}
	}
	ensureAssignment(unit,order)
	{
		const group=this.getGroup(unit,order);if(!group)return null;
		const assignment=group.assignments.get(unit)||null;
		const state=AIOrder.state(order);state.assignment=assignment?{...assignment}:null;
		// Focus can change in the middle of a turn; geometry / slots remain frozen.
		this.assignFocus(group);state.focusTarget=group.focus.get(unit)||null;
		return assignment;
	}
	getContext(unit,order)
	{
		const assignment=this.ensureAssignment(unit,order),group=this.getGroup(unit,order);
		return group?{group,area:group.area,assignment,focusTarget:AIOrder.state(order).focusTarget}:null;
	}
}
