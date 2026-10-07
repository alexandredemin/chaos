//---------------------------- Global GUARD evaluation and coordination ----------------------------

const AI_GUARD_CONFIG = Object.freeze({
	minRadius: 1,
	maxRadius: 5,
	idealRadius: 3.5,
	minIdealRadius: 1,
	pressureStartDistance: 4.5,
	pressureFullDistance: 1.5,
	proximityBase: 2,
	proximityFalloff: .4,
	interceptHalfWidth: 1.5,
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
	constructor(ai,target,config=AI_GUARD_CONFIG,guards=[])
	{
		this.ai=ai;
		this.target=target;
		this.config=config;
		this.guards=new Set(guards||[]);
		this.active=target!=null&&!target.died;
		this.scoreCache=new Map();
		this.ringCells=[];
		this.interceptLines=[];
		this.fireShieldMap=new Map();
		this.jumpShieldMap=new Map();
		this.breakdownCache=new Map();
		this.congestionMap=new Map();
		this.nearestEnemyDistance=Infinity;
		this.pressure=0;
		this.idealRadius=config.idealRadius;
		if(!this.active)return;

		this.buildRingCells();
		this.buildEnemyGeometry();
		this.updateGuardPressure();
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

	updateGuardPressure()
	{
		const cfg=this.config,d=this.nearestEnemyDistance;
		if(!Number.isFinite(d))
		{
			this.pressure=0;
			this.idealRadius=cfg.idealRadius;
			return;
		}
		const span=Math.max(.001,cfg.pressureStartDistance-cfg.pressureFullDistance);
		this.pressure=Math.max(0,Math.min(1,(cfg.pressureStartDistance-d)/span));
		this.idealRadius=d>=cfg.pressureStartDistance?cfg.idealRadius:Math.max(cfg.minIdealRadius,Math.min(cfg.idealRadius,d-1));
	}

	// Enemy geometry is global for all guards protecting the same target. Interception
	// urgency comes from the shared cached one-turn mobility envelope rather than an
	// arbitrary distance cutoff. Ability shields reuse cached Fire/Jump origins and LOS coverage.
	buildEnemyGeometry()
	{
		const target=this.target;
		for(const enemy of units)
		{
			if(enemy.player===target.player||enemy.died||!this.ai.isUnitKnown(enemy))continue;
			const ex=enemy.mapX,ey=enemy.mapY,vx=target.mapX-ex,vy=target.mapY-ey,len2=vx*vx+vy*vy;
			if(len2<=1e-9)continue;
			const dist=Math.sqrt(len2),threatCache=this.ai.threatSystem.getEnemyCache(enemy);
			this.nearestEnemyDistance=Math.min(this.nearestEnemyDistance,dist);

			const base=enemy.config&&enemy.config.features?enemy.config.features:enemy.features||{};
			const approach=this.ai.threatSystem.getApproachMetrics(threatCache,enemy,target);
			const meleeThreat=(base.attackPoints||0)>0?AICombatValue.hitChance(enemy.features.strength||1,target):0;
			if(approach.urgency>0&&meleeThreat>0)
				this.interceptLines.push({ex,ey,vx,vy,len2,urgency:approach.urgency,meleeThreat,eta:approach.eta});

			const fire=this.ai.threatSystem.getAbility(enemy,'fire');
			if(fire!=null)
			{
				const shield=this.ai.threatSystem.getAbilityShieldCoverage(threatCache,enemy,target,'fire');
				const threat=AICombatValue.hitChance(fire.config.damage||1,target);
				this.addShieldCoverage(shield,threat,this.fireShieldMap);
			}

			const jump=this.ai.threatSystem.getAbility(enemy,'jump');
			if(jump!=null)
			{
				const shield=this.ai.threatSystem.getAbilityShieldCoverage(threatCache,enemy,target,'jump');
				const threat=AICombatValue.hitChance(jump.config.damage||1,target);
				this.addShieldCoverage(shield,threat,this.jumpShieldMap);
			}
		}
	}

	addShieldCoverage(shield,threat,out)
	{
		if(shield==null||shield.threatOrigins<=0||threat<=0)return;
		for(const cell of this.ringCells)
		{
			const coverage=shield.coverage[cell.y*map.width+cell.x]||0;
			if(coverage<=0)continue;
			const key=this.key(cell.x,cell.y);
			out.set(key,(out.get(key)||0)+coverage*threat);
		}
	}


	getFireShieldScore(x,y)
	{
		return this.fireShieldMap.get(this.key(x,y))||0;
	}

	getJumpShieldScore(x,y)
	{
		return this.jumpShieldMap.get(this.key(x,y))||0;
	}

	// One frozen density field for non-GUARD friendlies. The protected unit and members of
	// this GUARD formation are excluded: slot diversity already coordinates the guards themselves.
	buildCongestionMap()
	{
		const penalty=this.config.congestionPenalty*(1-this.pressure);
		if(penalty<=1e-9)return;
		for(const other of this.target.player.units)
		{
			if(other==null||other.died||other===this.target||this.guards.has(other))continue;
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
		let total=0;
		for(const line of this.interceptLines)
		{
			const wx=x-line.ex,wy=y-line.ey,t=(wx*line.vx+wy*line.vy)/line.len2;
			if(t<=0||t>=1)continue;
			const px=line.ex+t*line.vx,py=line.ey+t*line.vy,lineDist=Math.hypot(x-px,y-py);
			const lineFactor=Math.max(0,1-lineDist/this.config.interceptHalfWidth);
			total+=lineFactor*line.urgency*line.meleeThreat;
		}
		return total;
	}

	getScoreBreakdown(x,y)
	{
		if(!this.active)return{score:-Infinity,proximity:0,intercept:0,fireShield:0,jumpShield:0,congestion:0};
		const key=this.key(x,y);
		if(this.breakdownCache.has(key))return this.breakdownCache.get(key);
		const dx=x-this.target.mapX,dy=y-this.target.mapY,r=Math.sqrt(dx*dx+dy*dy);
		const proximity=this.config.proximityBase-Math.abs(r-this.idealRadius)*this.config.proximityFalloff;
		const intercept=this.getInterceptionScore(x,y);
		const fireShield=this.getFireShieldScore(x,y);
		const jumpShield=this.getJumpShieldScore(x,y);
		const congestion=this.congestionMap.get(key)||0;
		const score=proximity+intercept+fireShield+jumpShield-congestion;
		const result={score,proximity,intercept,fireShield,jumpShield,congestion,pressure:this.pressure,idealRadius:this.idealRadius,nearestEnemyDistance:this.nearestEnemyDistance};
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

	getGroupFor(unit,order)
	{
		const assignment=this.ensureAssignment(unit,order);
		const target=AIOrder.target(order);
		return{group:target?this.groups.get(target)||null:null,assignment};
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
		const guards=this.getGuardUnits(target),evaluator=new AIGuardEvaluator(this.ai,target,this.config,guards);
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
