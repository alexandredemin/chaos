//---------------------------- Global GUARD evaluation and coordination ----------------------------

const AI_GUARD_CONFIG = Object.freeze({
	minRadius: 1,
	maxRadius: 5,
	idealRadius: 3.5,
	proximityBase: 2,
	proximityFalloff: .4,
	interceptHalfWidth: 1.5,
	interceptMaxDistance: 16,
	shieldBonus: 2,
	jumpShieldBonus: 2,
	congestionPenalty: .35,
	anchorTolerance: 0,
	slotPoolMultiplier: 2,
	slotMinDistance: 2,
	slotNearBestRatio: .9,
	slotNearBestTolerance: .25,
	travelWeight: .15
});

// Computes one shared GuardScore field around a guarded unit.
// It is intentionally frozen for the AI turn; mid-turn it is rebuilt only when the guarded unit moves.
class AIGuardEvaluator
{
	constructor(ai,target,config=AI_GUARD_CONFIG)
	{
		this.ai=ai;
		this.target=target;
		this.config=config;
		this.active=target!=null&&!target.died;
		this.scoreCache=new Map();
		this.ringCells=[];
		this.interceptLines=[];
		this.shieldCells=new Set();
		this.jumpShieldMap=new Map();
		this.breakdownCache=new Map();
		this.congestionMap=new Map();
		if(!this.active)return;

		this.buildRingCells();
		this.buildEnemyGeometry();
		this.buildCongestionMap();
	}

	key(x,y){return x+':'+y;}

	buildRingCells()
	{
		const cfg=this.config,target=this.target,minR2=cfg.minRadius*cfg.minRadius,maxR2=cfg.maxRadius*cfg.maxRadius;
		const minX=Math.max(0,target.mapX-cfg.maxRadius),maxX=Math.min(map.width-1,target.mapX+cfg.maxRadius);
		const minY=Math.max(0,target.mapY-cfg.maxRadius),maxY=Math.min(map.height-1,target.mapY+cfg.maxRadius);
		for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++)
		{
			if(x===target.mapX&&y===target.mapY)continue;
			const dx=x-target.mapX,dy=y-target.mapY,d2=dx*dx+dy*dy;
			if(d2>maxR2||d2<minR2)continue;
			const wall=wallsLayer.getTileAt(x,y);
			if(wall!=null&&wall.properties['collides']===true)continue;
			if(Entity.getEntityAtMap(x,y)!=null)continue;
			if(checkLineOfSight(target.mapX,target.mapY,x,y,null,null,function(){return true;})!==true)continue;
			this.ringCells.push({x,y});
		}
	}

	// Enemy geometry is global for all guards protecting the same target.
	buildEnemyGeometry()
	{
		const cfg=this.config,target=this.target,maxDist2=cfg.interceptMaxDistance*cfg.interceptMaxDistance;
		for(const enemy of units)
		{
			if(enemy.player===target.player||enemy.died||!this.ai.isUnitKnown(enemy))continue;
			const ex=enemy.mapX,ey=enemy.mapY,vx=target.mapX-ex,vy=target.mapY-ey,len2=vx*vx+vy*vy;
			if(len2<=1e-9)continue;

			if(len2<maxDist2)
			{
				const urgency=Math.max(0,1-Math.sqrt(len2)/cfg.interceptMaxDistance);
				if(urgency>0)this.interceptLines.push({ex,ey,vx,vy,len2,urgency});
			}

			const threatCache=this.ai.threatSystem.getEnemyCache(enemy);
			const fire=this.ai.threatSystem.getAbility(enemy,'fire');
			if(fire!=null)
			{
				const range=fire.config?fire.config.range||0:0,r2=range*range;
				const origins=threatCache&&threatCache.fireOrigins&&threatCache.fireOrigins.length?threatCache.fireOrigins:[{x:ex,y:ey}];
				for(const origin of origins)
				{
					const fx=target.mapX-origin.x,fy=target.mapY-origin.y;
					if(fx*fx+fy*fy>r2)continue;
					if(!checkLineOfSight(origin.x,origin.y,target.mapX,target.mapY,null,null,function(){return true;}))continue;
					this.addLineCells(origin.x,origin.y,target.mapX,target.mapY,this.shieldCells);
				}
			}

			// Jump is a ranged LOS threat too: a guard on the line can prevent a suicide jump
			// onto the guarded unit. Project every legal MOVE -> JUMP origin with AP remaining.
			const jump=this.ai.threatSystem.getAbility(enemy,'jump');
			if(jump!=null)
			{
				const range=jump.config?jump.config.range||0:0,r2=range*range;
				const origins=threatCache&&threatCache.jumpOrigins&&threatCache.jumpOrigins.length?threatCache.jumpOrigins:[{x:ex,y:ey}];
				const counts=new Map();let threatOrigins=0;
				for(const origin of origins)
				{
					const jx=target.mapX-origin.x,jy=target.mapY-origin.y;
					if((jx===0&&jy===0)||jx*jx+jy*jy>r2)continue;
					if(!checkLineOfSight(origin.x,origin.y,target.mapX,target.mapY,null,null,function(){return true;}))continue;
					threatOrigins++;
					this.addWeightedLineCells(origin.x,origin.y,target.mapX,target.mapY,counts);
				}
				if(threatOrigins>0)
				{
					for(const [key,count] of counts)
					{
						const factor=threatOrigins<=1?1:.5+.5*(count-1)/(threatOrigins-1);
						this.jumpShieldMap.set(key,(this.jumpShieldMap.get(key)||0)+cfg.jumpShieldBonus*factor);
					}
				}
			}
		}
	}

	addLineCells(x1,y1,x2,y2,out)
	{
		let xx1=x1,xx2=x2,yy1=y1,yy2=y2,inv=false;
		if(Math.abs(y2-y1)>Math.abs(x2-x1)){inv=true;xx1=y1;xx2=y2;yy1=x1;yy2=x2;}
		const k=(yy2-yy1)/(xx2-xx1),b=yy1-k*xx1,dx=xx2<xx1?-1:1;
		for(let x=xx1+dx;x!==xx2;x+=dx)
		{
			const y=Math.round(k*x+b),px=inv?y:x,py=inv?x:y;
			if((px===x1&&py===y1)||(px===x2&&py===y2))continue;
			out.add(this.key(px,py));
		}
	}

	addWeightedLineCells(x1,y1,x2,y2,out)
	{
		const cells=new Set();
		this.addLineCells(x1,y1,x2,y2,cells);
		for(const key of cells)out.set(key,(out.get(key)||0)+1);
	}

	getJumpShieldScore(x,y)
	{
		return this.jumpShieldMap.get(this.key(x,y))||0;
	}

	// One frozen friendly-density field for the whole formation.
	buildCongestionMap()
	{
		const penalty=this.config.congestionPenalty;
		for(const other of this.target.player.units)
		{
			if(other==null||other.died)continue;
			for(let y=other.mapY-1;y<=other.mapY+1;y++)for(let x=other.mapX-1;x<=other.mapX+1;x++)
			{
				if(x<0||y<0||x>=map.width||y>=map.height||(x===other.mapX&&y===other.mapY))continue;
				const key=this.key(x,y);
				this.congestionMap.set(key,(this.congestionMap.get(key)||0)+penalty);
			}
		}
	}

	getInterceptionScore(x,y)
	{
		let best=0;
		for(const line of this.interceptLines)
		{
			const wx=x-line.ex,wy=y-line.ey,t=(wx*line.vx+wy*line.vy)/line.len2;
			if(t<=0||t>=1)continue;
			const px=line.ex+t*line.vx,py=line.ey+t*line.vy,lineDist=Math.hypot(x-px,y-py);
			best=Math.max(best,Math.max(0,this.config.interceptHalfWidth-lineDist)*line.urgency);
		}
		return best;
	}

	getScoreBreakdown(x,y)
	{
		if(!this.active)return{score:-Infinity,proximity:0,intercept:0,fireShield:0,jumpShield:0,congestion:0};
		const key=this.key(x,y);
		if(this.breakdownCache.has(key))return this.breakdownCache.get(key);
		const dx=x-this.target.mapX,dy=y-this.target.mapY,r=Math.sqrt(dx*dx+dy*dy);
		const proximity=this.config.proximityBase-Math.abs(r-this.config.idealRadius)*this.config.proximityFalloff;
		const intercept=this.getInterceptionScore(x,y);
		const fireShield=this.shieldCells.has(key)?this.config.shieldBonus:0;
		const jumpShield=this.getJumpShieldScore(x,y);
		const congestion=this.congestionMap.get(key)||0;
		const score=proximity+intercept+fireShield+jumpShield-congestion;
		const result={score,proximity,intercept,fireShield,jumpShield,congestion};
		this.breakdownCache.set(key,result);
		this.scoreCache.set(key,score);
		return result;
	}

	scoreAt(x,y)
	{
		return this.getScoreBreakdown(x,y).score;
	}

	getCandidates(guards=[])
	{
		if(!this.active)return[];
		const guardSet=new Set(guards),result=[];
		for(const cell of this.ringCells)
		{
			const occupant=getUnitAtMap(cell.x,cell.y);
			if(occupant!=null&&!occupant.died&&!guardSet.has(occupant))continue;
			result.push({x:cell.x,y:cell.y,score:this.scoreAt(cell.x,cell.y)});
		}
		result.sort((a,b)=>b.score-a.score||a.y-b.y||a.x-b.x);
		return result;
	}
}

class AIGuardCoordinator
{
	constructor(ai,config=AI_GUARD_CONFIG)
	{
		this.ai=ai;
		this.config=config;
		this.groups=new Map();
		this.epoch=0;
		this.turnStamp=null;
	}

	getGameTurnStamp()
	{
		if(typeof ScenarioEvents!=='undefined')
		{
			const round=ScenarioEvents.roundIndex??0,active=ScenarioEvents.activeTurnPlayerInd;
			return round+':'+(active==null?'none':active);
		}
		if(typeof playerInd!=='undefined')return 'p:'+playerInd;
		return null;
	}

	startTurn(stamp=this.getGameTurnStamp())
	{
		this.epoch++;
		this.groups.clear();
		this.turnStamp=stamp;
	}

	// AITest bypasses AIControl.startTurn(). Sync against the real game-turn token so
	// a new F6/F7 planning session in a later turn gets a fresh global GuardScore field.
	syncTurn()
	{
		const stamp=this.getGameTurnStamp();
		if(stamp==null||stamp===this.turnStamp)return false;
		this.startTurn(stamp);
		return true;
	}

	invalidate()
	{
		this.epoch++;
		this.groups.clear();
	}

	// AITest orders are real tactical orders for coordinator purposes.
	// Using only unit.aiControl.order made a manually assigned TEST GUARD invisible to the coordinator.
	getEffectiveOrder(unit)
	{
		if(unit==null||unit.aiControl==null)return null;
		const test=this.ai.getAITestOverride?this.ai.getAITestOverride(unit):null;
		return test&&test.order?test.order:unit.aiControl.order||null;
	}

	prepareTurnAssignments()
	{
		this.syncTurn();
		const targets=new Set();
		for(const unit of this.ai.player.units)
		{
			const order=this.getEffectiveOrder(unit);
			if(AIOrder.is(order,'guard')&&AIOrder.target(order)!=null)targets.add(AIOrder.target(order));
		}
		for(const target of targets)this.rebuildGroup(target);
	}

	getGuardUnits(target)
	{
		return this.ai.player.units.filter(unit=>{
			if(unit==null||unit.died||unit===target||unit.aiControl==null)return false;
			const order=this.getEffectiveOrder(unit);
			return AIOrder.is(order,'guard')&&AIOrder.target(order)===target;
		});
	}

	anchorMoved(group,target)
	{
		if(group==null||target==null)return true;
		const dx=Math.abs(target.mapX-group.anchorX),dy=Math.abs(target.mapY-group.anchorY);
		return Math.max(dx,dy)>this.config.anchorTolerance;
	}

	ensureAssignment(unit,order)
	{
		this.syncTurn();
		if(unit==null||order==null||!AIOrder.is(order,'guard'))return null;
		const target=AIOrder.target(order);
		if(target==null||target.died)return null;
		let group=this.groups.get(target);
		if(group==null||this.anchorMoved(group,target))group=this.rebuildGroup(target);
		this.pruneAssignments(group,target);
		let assignment=group.assignments.get(unit)||null;
		if(assignment==null)
		{
			// The effective guard set may change outside the normal turn lifecycle (notably AITest).
			// Rebuild once so slot selection/diversity includes the new guard instead of assigning
			// a fallback current-position goal from a stale group.
			group=this.rebuildGroup(target);
			assignment=group.assignments.get(unit)||this.assignMissingUnit(group,unit);
		}
		AIOrder.state(order).assignment=assignment?{...assignment}:null;
		return assignment;
	}

	pruneAssignments(group,target)
	{
		for(const unit of [...group.assignments.keys()])
		{
			const order=this.getEffectiveOrder(unit);
			if(unit==null||unit.died||!AIOrder.is(order,'guard')||AIOrder.target(order)!==target)group.assignments.delete(unit);
		}
	}

	rebuildGroup(target)
	{
		const guards=this.getGuardUnits(target),evaluator=new AIGuardEvaluator(this.ai,target,this.config);
		const candidates=evaluator.getCandidates(guards),slots=this.selectDiverseSlots(candidates,guards.length);
		const group={target,anchorX:target.mapX,anchorY:target.mapY,evaluator,slots,assignments:new Map(),epoch:this.epoch,turnStamp:this.turnStamp};
		this.assignGuards(group,guards);
		this.groups.set(target,group);
		return group;
	}

	selectDiverseSlots(candidates,guardCount)
	{
		if(!candidates.length||guardCount<=0)return[];

		// Keep the assignment pool close to the globally best GuardScore.
		// Otherwise travel cost can make a nearby but strategically wrong-side slot beat
		// the interception/shielding sector we explicitly built GuardScore to identify.
		const best=candidates[0].score;
		const tolerance=Math.max(Math.abs(best)*(1-this.config.slotNearBestRatio),this.config.slotNearBestTolerance);
		const threshold=best-tolerance;
		const preferred=candidates.filter(c=>c.score>=threshold);
		const desired=Math.min(preferred.length,Math.max(guardCount,guardCount*this.config.slotPoolMultiplier));
		const selected=[],selectedKeys=new Set(),minD2=this.config.slotMinDistance*this.config.slotMinDistance;

		const addDiverse=list=>{
			for(const c of list)
			{
				if(selected.length>=desired)break;
				if(selected.some(s=>{const dx=s.x-c.x,dy=s.y-c.y;return dx*dx+dy*dy<minD2;}))continue;
				selected.push(c);selectedKeys.add(c.x+':'+c.y);
			}
		};

		addDiverse(preferred);
		for(const c of preferred)
		{
			if(selected.length>=desired)break;
			const key=c.x+':'+c.y;if(selectedKeys.has(key))continue;
			selected.push(c);selectedKeys.add(key);
		}

		// If the near-best sector physically contains fewer cells than guards, widen only
		// as much as necessary to give every guard a usable slot.
		if(selected.length<guardCount)
		{
			for(const c of candidates)
			{
				if(selected.length>=guardCount)break;
				const key=c.x+':'+c.y;if(selectedKeys.has(key))continue;
				selected.push(c);selectedKeys.add(key);
			}
		}
		return selected;
	}

	buildGuardOptions(guard,slots)
	{
		const dmap=this.ai.getDistanceMap(guard,guard.mapX,guard.mapY,null,function(){return true;});
		const options=[];
		for(const slot of slots)
		{
			const dist=dmap[slot.y]&&dmap[slot.y][slot.x]!=null?dmap[slot.y][slot.x]:-1;
			if(dist<0)continue;
			options.push({slot,distance:dist,utility:slot.score-this.config.travelWeight*dist});
		}
		options.sort((a,b)=>b.utility-a.utility||a.distance-b.distance||b.slot.score-a.slot.score);
		return options;
	}

	assignGuards(group,guards)
	{
		const remaining=new Map(),freeSlots=new Set(group.slots);
		for(const guard of guards)remaining.set(guard,this.buildGuardOptions(guard,group.slots));
		while(remaining.size>0&&freeSlots.size>0)
		{
			let chosenGuard=null,chosen=null,bestRegret=-Infinity,bestUtility=-Infinity;
			for(const [guard,allOptions] of remaining)
			{
				const options=allOptions.filter(o=>freeSlots.has(o.slot));
				if(!options.length)continue;
				const best=options[0],second=options[1]||null,regret=second?best.utility-second.utility:1000000;
				if(regret>bestRegret||(regret===bestRegret&&best.utility>bestUtility))
				{
					chosenGuard=guard;chosen=best;bestRegret=regret;bestUtility=best.utility;
				}
			}
			if(chosenGuard==null||chosen==null)break;
			this.storeAssignment(group,chosenGuard,chosen);
			freeSlots.delete(chosen.slot);
			remaining.delete(chosenGuard);
		}
		for(const guard of remaining.keys())this.storeFallbackAssignment(group,guard);
	}

	assignMissingUnit(group,unit)
	{
		const used=new Set([...group.assignments.values()].filter(Boolean).map(a=>a.x+':'+a.y));
		const slots=group.slots.filter(s=>!used.has(s.x+':'+s.y));
		const option=this.buildGuardOptions(unit,slots)[0]||null;
		if(option)this.storeAssignment(group,unit,option);
		else this.storeFallbackAssignment(group,unit);
		return group.assignments.get(unit)||null;
	}

	storeAssignment(group,unit,option)
	{
		const components=group.evaluator.getScoreBreakdown(option.slot.x,option.slot.y);
		const assignment={x:option.slot.x,y:option.slot.y,score:option.slot.score,travelCost:option.distance,utility:option.utility,epoch:group.epoch,turnStamp:group.turnStamp,anchorX:group.anchorX,anchorY:group.anchorY,components:{...components}};
		group.assignments.set(unit,assignment);
		const order=this.getEffectiveOrder(unit);
		if(AIOrder.is(order,'guard'))AIOrder.state(order).assignment={...assignment};
	}

	storeFallbackAssignment(group,unit)
	{
		const components=group.evaluator.getScoreBreakdown(unit.mapX,unit.mapY);
		const assignment={x:unit.mapX,y:unit.mapY,score:components.score,travelCost:0,utility:0,epoch:group.epoch,turnStamp:group.turnStamp,anchorX:group.anchorX,anchorY:group.anchorY,components:{...components},fallback:true};
		group.assignments.set(unit,assignment);
		const order=this.getEffectiveOrder(unit);
		if(AIOrder.is(order,'guard'))AIOrder.state(order).assignment={...assignment};
	}
}
