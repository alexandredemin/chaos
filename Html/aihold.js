//---------------------------- HOLD: shared area geometry, unit scoring and assignments ----------------------------

const AI_HOLD_CONFIG=Object.freeze({defaultRadius:5,slotSpacing:1,travelPenalty:.05,congestionPenalty:.35,
	fireRayCount:16,fireRayRadius:20,fireExposureTau:16,approachMaxCost:20,approachTurns:4,directionWeight:.7,keepSlotBonus:.12});

class AIHoldArea
{
	constructor(ai,center,mode,radius,config=AI_HOLD_CONFIG)
	{
		this.ai=ai;this.center=center;this.mode=mode;this.radius=radius;this.config=config;
		this.cells=[];this.keys=new Set();this.entries=[];this.entryBand=[];
		this.fireMasks=new Map();this.meleeMasks=new Map();this.fireProtection=new Map();this.externalExposure=new Map();this.meleeProtection=new Map();
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
	// Fast, approximate structural exposure to outside firing origins. Ray traces use
	// adjacent grid cells (Bresenham) and never treat temporary units as cover.
	// A door is considered potentially open, even when it is currently closed.
	blocksFireRay(x,y)
	{
		const tile=wallsLayer.getTileAt(x,y);
		if(tile!=null&&tile.properties?.collides===true)return true;
		for(const entity of Entity.getEntitiesAtMap(x,y)||[])
		{
			// TODO: If another entity has a potentially transparent state, replace
			// this door-only exception with a declarative potential-LOS feature.
			if(entity.config?.name==='door')continue;
			if(entity.features?.blocksLOS!==false)return true;
		}
		return false;
	}
	buildExternalExposure()
	{
		const rays=Math.max(1,this.config.fireRayCount),radius=this.config.fireRayRadius;
		const visited=new Int32Array(map.width*map.height);let stamp=0;
		const vectors=[];
		for(let i=0;i<rays;i++)
		{
			const angle=2*Math.PI*i/rays;
			vectors.push([Math.round(radius*Math.cos(angle)),Math.round(radius*Math.sin(angle))]);
		}
		for(const origin of this.cells)
		{
			stamp++;let exposure=0;
			for(const [dx,dy] of vectors)
			{
				let x=origin.x,y=origin.y,ax=Math.abs(dx),ay=Math.abs(dy);
				const sx=dx>=0?1:-1,sy=dy>=0?1:-1;
				let error=ax-ay;
				for(let step=0;step<Math.max(ax,ay);step++)
				{
					const e2=2*error;
					if(e2>-ay){error-=ay;x+=sx;}
					if(e2<ax){error+=ax;y+=sy;}
					if(x<0||y<0||x>=map.width||y>=map.height)break;
					if((x-origin.x)**2+(y-origin.y)**2>radius*radius)break;
					if(this.blocksFireRay(x,y))break;
					if(this.contains(x,y))continue;
					const k=this.key(x,y);
					if(visited[k]===stamp)continue;
					visited[k]=stamp;exposure++;
				}
			}
			this.externalExposure.set(origin.k,exposure);
			this.fireProtection.set(origin.k,Math.exp(-exposure/this.config.fireExposureTau));
		}
	}
	buildMatrices()
	{
		const ne=this.entries.length,nb=this.entryBand.length;
		for(const c of this.cells)
		{
			const fire=new Uint32Array(this.maskLength(ne)),melee=new Uint32Array(this.maskLength(nb));
			for(let i=0;i<ne;i++)if(this.los(c.x,c.y,this.entries[i].x,this.entries[i].y))this.setBit(fire,i);
			for(let i=0;i<nb;i++)if(Math.max(Math.abs(c.x-this.entryBand[i].x),Math.abs(c.y-this.entryBand[i].y))===1)this.setBit(melee,i);
			this.fireMasks.set(c.k,fire);this.meleeMasks.set(c.k,melee);
			let exposed=0;
			for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(dx||dy)
				if(this.passable(c.x+dx,c.y+dy))exposed++;
			this.meleeProtection.set(c.k,1-exposed/8);
		}
		this.buildExternalExposure();
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
				const policy=AICellPolicy.assess(unit,nx,ny);
				if(policy.blocked)continue;
				// Web/Glue impose their movement penalty when LEAVING a cell, not on entry.
				const departure=AICellPolicy.assess(unit,px,py);
				const cost=1+Math.floor(departure.movePenalty+.5)*Math.max(1,unit.config?.features?.move||1);
				const nd=d+cost;
				if(nd>maxCost||nd>=(best.get(k)??Infinity))continue;
				best.set(k,nd);queue.push([nx,ny,nd]);
			}
		}
		return result;
	}
	coverageMask(unit,c,kind,range=Infinity)
	{
		const fire=kind==='fire',points=fire?this.entries:this.entryBand;
		if(!points.length)return new Uint32Array(0);
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
		return mask;
	}
	coverage(unit,c,kind,range=Infinity)
	{
		const points=kind==='fire'?this.entries:this.entryBand;
		return points.length?this.popcount(this.coverageMask(unit,c,kind,range))/points.length:0;
	}
	breakdown(unit,x,y)
	{
		const k=this.key(x,y);
		if(!this.keys.has(k))return null;
		// Per-unit cache: movement penalties and immunities may differ even for the same summon type.
		if(!this.unitScores.has(unit))this.unitScores.set(unit,new Map());
		const cache=this.unitScores.get(unit);
		if(cache.has(k))return cache.get(k);
		const fireProtection=this.fireProtection.get(k),externalExposure=this.externalExposure.get(k),meleeProtection=this.meleeProtection.get(k);
		const fire=Object.values(unit.config?.abilities||{}).find(a=>a?.type==='fire');
		const fireMask=fire?this.coverageMask(unit,{x,y},'fire',fire.config.range||0):new Uint32Array(this.maskLength(this.entries.length));
		const meleeMask=this.coverageMask(unit,{x,y},'melee');
		const fireControl=fire&&this.entries.length?this.popcount(fireMask)/this.entries.length:0;
		const meleeControl=this.entryBand.length?this.popcount(meleeMask)/this.entryBand.length:0;
		const offense=fire?Math.max(fireControl,meleeControl):meleeControl;
		const defense=(fireProtection+meleeProtection)/2;
		const out={fireProtection,externalExposure,meleeProtection,fireControl,meleeControl,offense,defense,congestion:0,score:defense+offense,
			fireMask,meleeMask};
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
	/**
	 * One reverse multi-source Dijkstra per HOLD area and AI turn, seeded from its
	 * entrance cells. Distances outside the area describe the cost of APPROACHING
	 * the nearest entry; Web/Glue charges are applied on EXIT from occupied cells.
	 * The representative holder approximates mobility for all incoming enemies.
	 * The base HOLD matrices remain independent of current enemy positions.
	 */
	prepareApproach(area,holders)
	{
		if(area.approach)return area.approach;
		const entries=area.entries,weights=new Float64Array(entries.length);
		if(!entries.length)return area.approach={distances:null,nearestSource:null,weights,bandWeights:new Float64Array(area.entryBand.length),total:0};
		const reference=holders.find(u=>!u.features?.webImmunity)||holders[0];
		if(!reference)return null;
		const entryKeys=new Set(entries.map(e=>e.k));
		const search=this.ai.getMultiSourceDistanceMap(reference,entries,{
			reverse:true,maxDist:this.config.approachMaxCost,onUnit:()=>true,
			canEnter:(x,y)=>!area.contains(x,y)||entryKeys.has(area.key(x,y))
		});
		let total=0;
		for(const enemy of units)
		{
			if(!enemy||enemy.died||enemy.player===this.ai.player||!this.ai.isUnitKnown(enemy))continue;
			if(area.contains(enemy.mapX,enemy.mapY))continue; // focusTarget handles intruders.
			const d=search.distances[enemy.mapY]?.[enemy.mapX];
			if(d==null||d<0||d>Math.min(this.config.approachMaxCost,this.config.approachTurns*Math.max(1,enemy.config?.features?.move||1)))continue;
			const entry=search.nearestSource[enemy.mapY]?.[enemy.mapX];
			if(entry==null||entry<0)continue;
			const weight=1/(1+d/4);
			weights[entry]+=weight;total+=weight;
		}
		const bandWeights=new Float64Array(area.entryBand.length);
		let bandTotal=0;
		if(total>0)for(let j=0;j<area.entryBand.length;j++)
		{
			const b=area.entryBand[j];let weight=0;
			for(let i=0;i<entries.length;i++)if(weights[i]>0&&Math.max(Math.abs(b.x-entries[i].x),Math.abs(b.y-entries[i].y))<=2)
				weight=Math.max(weight,weights[i]);
			bandWeights[j]=weight;bandTotal+=weight;
		}
		return area.approach={...search,weights,bandWeights,total,bandTotal};
	}

	/** Weighted control of likely enemy entrances using already cached coverage masks.
	 * Zero for no approaching known enemies. The bonus is relative to the
	 * unit's normal uniform control, so base HoldScore is never double-counted. */
	directionBonus(area,unit,c,approach,b=null)
	{
		if(!approach||approach.total<=0)return 0;
		b=b||area.breakdown(unit,c.x,c.y);
		if(!b)return 0;
		let fire=0,melee=0;
		for(let i=0;i<area.entries.length;i++)
			if(area.bit(b.fireMask,i))fire+=approach.weights[i];
		fire/=approach.total;
		if(approach.bandTotal>0)
		{
			for(let i=0;i<area.entryBand.length;i++)if(area.bit(b.meleeMask,i))melee+=approach.bandWeights[i];
			melee/=approach.bandTotal;
		}
		const hasFire=Object.values(unit.config?.abilities||{}).some(a=>a?.type==='fire');
		const directed=hasFire?Math.max(fire,melee):melee;
		return this.config.directionWeight*(directed-b.offense);
	}

	rebuild(key,area,holders)
	{
		const group={area,holders,assignments:new Map(),previousAssignments:new Map(),epoch:this.epoch,turnStamp:this.turnStamp};
		this.groups.set(key,group);
		group.approach=this.prepareApproach(area,holders);
		const options=new Map(),remaining=new Set(holders);
		for(const unit of holders)
		{
			const previous=AIOrder.state(this.effectiveOrder(unit))?.assignment||null;
			group.previousAssignments.set(unit,previous);
			const dmap=this.ai.getDistanceMap(unit,unit.mapX,unit.mapY,null,()=>true);
			const list=[];
			for(const c of area.cells)
			{
				const occupant=getUnitAtMap(c.x,c.y);
				if(occupant&&!holders.includes(occupant))continue;
				const policy=AICellPolicy.assess(unit,c.x,c.y);
				if(policy.blocked)continue;
				const b=area.breakdown(unit,c.x,c.y),d=dmap[c.y]?.[c.x];
				if(!b||d==null||d<0)continue;
				const directionBonus=this.directionBonus(area,unit,c,group.approach,b);
				const keepBonus=previous?.x===c.x&&previous?.y===c.y?this.config.keepSlotBonus:0;
				list.push({cell:c,b,directionBonus,keepBonus,base:b.score+directionBonus+keepBonus-
					this.config.travelPenalty*Math.max(0,d-dmap[unit.mapY][unit.mapX])-policy.slotPenalty});
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
			const {unit,p}=bestPick,assignment={x:p.cell.x,y:p.cell.y,score:p.utility,components:{...p.b,directionBonus:p.directionBonus,keepBonus:p.keepBonus,congestion:this.congestion(p.cell,used)},epoch:this.epoch};
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
