//---------------------------- Deterministic short-turn tactical planner ----------------------------

const AI_TACTICAL_PROFILES = {
	cautious:   {goal:.5, offense:1, danger:2},
	balanced:   {goal:1, offense:2, danger:1},
	aggressive: {goal:.75, offense:3, danger:.5},
	critical:   {goal:1.5, offense:5, danger:.1}
};

const AI_MATRIX_EPS = 1e-9;

class AIPlannerMatrixAdapter
{
	constructor(planner)
	{
		this.planner = planner;
		this.ai = planner.ai;
		this.unit = planner.unit;
	}

	withState(state,fn)
	{
		const u=this.unit,old={x:u.mapX,y:u.mapY,move:u.features.move,ap:u.features.abilityPoints,atk:u.features.attackPoints};
		u.mapX=state.x;u.mapY=state.y;u.features.move=state.move;u.features.abilityPoints=state.ap;u.features.attackPoints=state.attackPoints;
		try{return fn(u);}
		finally{u.mapX=old.x;u.mapY=old.y;u.features.move=old.move;u.features.abilityPoints=old.ap;u.features.attackPoints=old.atk;}
	}

	build(state)
	{
		return this.withState(state,unit => {
			const dmap=this.ai.getDistanceMap(unit,state.x,state.y,null,null,cell=>this.ai.canMacroMoveThroughCell(unit,cell[0],cell[1]));
			let places=this.ai.getAvailableCells(dmap,unit,null,true).filter(p=>p.dist>=0&&p.dist<=state.move);
			places.push(...this.frontierEntries(state,unit,dmap,places));
			if(!places.some(p=>p.cell[0]===state.x&&p.cell[1]===state.y)) places.unshift({cell:[state.x,state.y],dist:0});
			const gDMap=this.planner.goalMap;
			this.ai.computeDistMatrix(unit,places,this.planner.goal,gDMap);
			if(this.hasAbility('web')&&state.ap>0)this.ai.computeWebMatrix(unit,places);

			for(const p of places)
			{
				if(p.webWeight==null)p.webWeight=0;
				const remainingMove=Math.max(0,state.move-p.dist);
				p.attackScore=this.attackSetupWeight(p.cell,{...state,move:remainingMove});
				p.fireWeight=state.ap>0?this.fireSetupWeight(p.cell):0;
				p.gasWeight=state.ap>0?this.gasSetupWeight(p.cell):0;
				p.dangerPenalty=this.ai.threatSystem.getDangerAt(unit,p.cell[0],p.cell[1]);
				p.offense=Math.max(0,p.attackScore)+Math.max(0,p.fireWeight)+Math.max(0,p.gasWeight)+Math.max(0,p.webWeight);
				p.goalScore=p.distWeight||0;
				p.defenseScore=-p.dangerPenalty;
				for(const [name,profile] of Object.entries(AI_TACTICAL_PROFILES))
					p[name+'Score']=profile.goal*p.goalScore+profile.offense*p.offense-profile.danger*p.dangerPenalty;
			}
			return{dmap,gDMap,places};
		});
	}

	// Add only the one-step weighted-cost frontier around cells reachable with one move left.
	frontierEntries(state,unit,dmap,reachablePlaces)
	{
		if(state.move<=0)return[];
		const startCost=dmap[state.y][state.x],maxInnerCost=state.move-1,frontier=new Map();
		for(const p of reachablePlaces)
		{
			if(p.dist<0||p.dist>maxInnerCost)continue;
			for(let y=p.cell[1]-1;y<=p.cell[1]+1;y++)for(let x=p.cell[0]-1;x<=p.cell[0]+1;x++)
			{
				if((x===p.cell[0]&&y===p.cell[1])||x<0||x>=map.width||y<0||y>=map.height)continue;
				const weightedDist=dmap[y][x]>=0?dmap[y][x]-startCost:-1,k=x+':'+y;
				if(weightedDist<0||weightedDist<=state.move||frontier.has(k))continue;
				const wall=wallsLayer.getTileAt(x,y);
				if(wall!=null&&wall.properties['collides']===true)continue;
				const occupant=getUnitAtMap(x,y);
				if(occupant!=null&&occupant!==unit&&!occupant.died)continue;
				const entity=Entity.getEntityAtMap(x,y);
				if(entity!=null&&entity.evaluateStep(unit)===false)continue;

				// Weighted path cost is heuristic. Physically this cell is one legal step from p.
				// Consume all simulated movement conservatively; the macro executor walks to the frontier
				// cell physically and replans only after the MOVE action ends.
				frontier.set(k,{cell:[x,y],dist:state.move,weightedDist,frontierEntry:true,frontierFrom:[p.cell[0],p.cell[1]]});
			}
		}
		return[...frontier.values()];
	}

	hasAbility(type)
	{
		return this.getAbility(type)!=null;
	}

	getAbility(type)
	{
		if(this.unit.config.abilities==null)return null;
		return Object.values(this.unit.config.abilities).find(a=>a&&a.type===type)||null;
	}

	knownEnemies()
	{
		return units.filter(u=>u.player!==this.unit.player&&!u.died&&this.ai.isUnitKnown(u));
	}

	attackSetupWeight(cell,state)
	{
		if(state.attackPoints<=0||state.move<=0)return 0;
		let best=0;
		for(const e of this.knownEnemies())
			if(Math.abs(e.mapX-cell[0])<=1&&Math.abs(e.mapY-cell[1])<=1)
				best=Math.max(best,AICombatValue.expectedDamageValue(e,this.unit.features.strength||1));
		return best;
	}

	fireSetupWeight(cell)
	{
		const a=this.getAbility('fire');if(a==null)return 0;
		let best=0;
		for(const e of this.knownEnemies())
		{
			const dx=e.mapX-cell[0],dy=e.mapY-cell[1];
			if(dx*dx+dy*dy>a.config.range*a.config.range)continue;
			if(!checkLineOfSight(cell[0],cell[1],e.mapX,e.mapY,null,null,u=>u===this.unit?true:false))continue;
			best=Math.max(best,AICombatValue.expectedDamageValue(e,a.config.damage));
		}
		return best;
	}

	gasSetupWeight(cell)
	{
		const a=this.getAbility('gas');if(a==null)return 0;
		let score=0;
		for(const t of units)
		{
			if(t===this.unit||t.died||t.features.gasImmunity)continue;
			if(t.player!==this.unit.player&&!this.ai.isUnitKnown(t))continue;
			const dx=t.mapX-cell[0],dy=t.mapY-cell[1];
			if(dx*dx+dy*dy>a.config.range*a.config.range)continue;
			const v=AICombatValue.expectedDamageValue(t,a.config.damage);
			score+=t.player===this.unit.player?-v:v;
		}
		return score;
	}

	placeAt(matrices,x,y)
	{
		return matrices.places.find(p=>p.cell[0]===x&&p.cell[1]===y)||null;
	}
}

class AITurnActionProvider
{
	constructor(planner){this.planner=planner;}
	getActions(){return[];}
	getMoveCandidates(){return[];}
}

class AIMoveActionProvider extends AITurnActionProvider
{
	getActions(state,ctx)
	{
		if(state.lastAction==='move'||state.move<=0)return[];
		return ctx.moveCandidates
			.map(c=>({type:'move',to:[c.x,c.y],cost:c.dist,sources:c.sources,label:'MOVE('+c.x+','+c.y+')'}))
			.filter(a=>a.cost>0&&a.cost<=state.move);
	}
}

class AIAttackActionProvider extends AITurnActionProvider
{
	getActions(state,ctx)
	{
		if(state.attackPoints<=0||state.move<=0)return[];
		const out=[],u=this.planner.unit;
		for(const e of ctx.knownEnemies)
		{
			if(Math.abs(e.mapX-state.x)>1||Math.abs(e.mapY-state.y)>1)continue;
			out.push({type:'attack',target:e,score:AICombatValue.expectedDamageValue(e,u.features.strength||1),costMove:u.features.attackCost??u.config.features.attackCost??u.features.move,costAttack:1,label:'ATTACK('+e.config.name+')'});
		}
		return out.sort((a,b)=>b.score-a.score);
	}
}

class AIFireActionProvider extends AITurnActionProvider
{
	getActions(state,ctx)
	{
		const a=ctx.adapter.getAbility('fire');if(a==null||state.ap<=0)return[];
		const out=[];
		for(const e of ctx.knownEnemies)
		{
			const dx=e.mapX-state.x,dy=e.mapY-state.y;
			if(dx*dx+dy*dy>a.config.range*a.config.range)continue;
			if(!checkLineOfSight(state.x,state.y,e.mapX,e.mapY,null,null,u=>u===this.planner.unit?true:false))continue;
			out.push({type:'fire',target:e,score:AICombatValue.expectedDamageValue(e,a.config.damage),costAP:1,label:'FIRE('+e.config.name+')'});
		}
		return out.sort((a,b)=>b.score-a.score).slice(0,4);
	}

	getMoveCandidates(state,ctx)
	{
		if(state.ap<=0||state.move<=0||ctx.adapter.getAbility('fire')==null)return[];
		const firing=ctx.matrices.places.filter(p=>p.dist>0&&p.dist<=state.move&&p.fireWeight>AI_MATRIX_EPS);
		if(!firing.length)return[];
		const picks=[],add=p=>{if(p&&!picks.includes(p))picks.push(p);};
		add(firing.slice().sort((a,b)=>b.fireWeight-a.fireWeight||b.balancedScore-a.balancedScore||a.dist-b.dist)[0]);
		add(firing.slice().sort((a,b)=>a.dist-b.dist||b.goalScore-a.goalScore||b.fireWeight-a.fireWeight||a.dangerPenalty-b.dangerPenalty)[0]);
		add(firing.slice().sort((a,b)=>a.dangerPenalty-b.dangerPenalty||b.fireWeight-a.fireWeight||a.dist-b.dist)[0]);
		return picks.map(p=>({x:p.cell[0],y:p.cell[1],score:p.fireWeight,source:'FIRE'}));
	}
}

class AIGasActionProvider extends AITurnActionProvider
{
	getActions(state,ctx)
	{
		if(ctx.adapter.getAbility('gas')==null||state.ap<=0)return[];
		const score=ctx.adapter.gasSetupWeight([state.x,state.y]);
		return Math.abs(score)>AI_MATRIX_EPS?[{type:'gas',score,costAP:1,label:'GAS'}]:[];
	}

	getMoveCandidates(state,ctx)
	{
		if(ctx.adapter.getAbility('gas')==null||state.ap<=0||state.move<=0)return[];
		const scored=[];
		for(const p of ctx.matrices.places)if(p.dist>0&&p.dist<=state.move&&p.gasWeight>AI_MATRIX_EPS)scored.push({x:p.cell[0],y:p.cell[1],score:p.gasWeight,source:'GAS'});
		return scored.sort((a,b)=>b.score-a.score).slice(0,2);
	}
}

class AIWebActionProvider extends AITurnActionProvider
{
	getActions(state,ctx)
	{
		if(ctx.adapter.getAbility('web')==null||state.ap<=0||state.used.has('web@'+state.x+':'+state.y))return[];
		const p=ctx.adapter.placeAt(ctx.matrices,state.x,state.y),score=p?p.webWeight||0:0;
		return score>0?[{type:'web',score,costAP:1,mark:'web@'+state.x+':'+state.y,label:'WEB'}]:[];
	}

	getMoveCandidates(state,ctx)
	{
		if(ctx.adapter.getAbility('web')==null||state.ap<=0)return[];
		const best=ctx.matrices.places.filter(p=>p.webWeight>0).sort((a,b)=>b.webWeight-a.webWeight)[0];
		return best?[{x:best.cell[0],y:best.cell[1],score:best.webWeight,source:'WEB'}]:[];
	}
}

class AIJumpActionProvider extends AITurnActionProvider
{
	landingCells(state,ctx)
	{
		const a=ctx.adapter.getAbility('jump');if(a==null||state.ap<=0)return[];
		const r=a.config.range,r2=r*r,out=[];
		const minX=Math.max(0,state.x-r),maxX=Math.min(map.width-1,state.x+r),minY=Math.max(0,state.y-r),maxY=Math.min(map.height-1,state.y+r);
		for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++)
		{
			const dx=x-state.x,dy=y-state.y;if((dx===0&&dy===0)||dx*dx+dy*dy>r2)continue;
			const wall=wallsLayer.getTileAt(x,y);if(wall!=null&&wall.properties['collides']===true)continue;
			if(!checkLineOfSight(state.x,state.y,x,y,null,null,u=>u===this.planner.unit?true:false))continue;
			let occupant=getUnitAtMap(x,y);if(occupant===this.planner.unit)occupant=null;if(occupant&&occupant.player===this.planner.unit.player)continue;
			out.push({x,y,occupant});
		}
		return out;
	}

	metrics(state,ctx,cell)
	{
		const a=ctx.adapter.getAbility('jump');if(a==null)return null;
		const terminal=!!(cell.occupant&&cell.occupant.player!==this.planner.unit.player),post={...state,x:cell.x,y:cell.y,ap:Math.max(0,state.ap-1)};
		const actionUtility=terminal?AICombatValue.expectedDamageValue(cell.occupant,a.config.damage)-AICombatValue.unitValue(this.planner.unit):0;
		const attack=terminal?AICombatValue.expectedDamageValue(cell.occupant,a.config.damage):ctx.adapter.attackSetupWeight([cell.x,cell.y],post);
		const fire=!terminal&&post.ap>0?ctx.adapter.fireSetupWeight([cell.x,cell.y]):0;
		const gas=!terminal&&post.ap>0?ctx.adapter.gasSetupWeight([cell.x,cell.y]):0;
		const goal=this.planner.goalProgressAt(cell.x,cell.y),danger=this.planner.positionDangerAt(cell.x,cell.y),offense=Math.max(0,attack)+Math.max(0,fire)+Math.max(0,gas);
		const m={...cell,terminal,actionUtility,goal,attackScoreOnly:attack,fireWeight:fire,gasWeight:gas,offense,dangerPenalty:danger};
		m.goalScore=goal;m.defenseScore=-danger;
		for(const [name,p] of Object.entries(AI_TACTICAL_PROFILES))m[name+'Score']=p.goal*goal+p.offense*offense-p.danger*danger;
		m.endUtility=terminal?this.planner.terminalPositionScore():this.planner.positionScoreAt(cell.x,cell.y,ctx.profile);
		m.totalUtility=this.planner.actionAndPositionScore(actionUtility,m.endUtility,ctx.profile);
		return m;
	}

	informativeBest(metrics,key)
	{
		if(!metrics.length)return null;let min=Infinity,max=-Infinity;
		for(const m of metrics){const v=m[key];if(!Number.isFinite(v))continue;min=Math.min(min,v);max=Math.max(max,v);}
		if(!Number.isFinite(min)||max-min<=AI_MATRIX_EPS)return null;
		return metrics.slice().sort((a,b)=>(b[key]??-Infinity)-(a[key]??-Infinity)||b.totalUtility-a.totalUtility)[0]||null;
	}

	jumpCandidates(state,ctx)
	{
		const metrics=this.landingCells(state,ctx).map(c=>this.metrics(state,ctx,c)).filter(Boolean),raw=[];
		const add=(m,source)=>{if(m)raw.push({...m,source});};
		for(const [key,label] of [['goalScore','GOAL'],['attackScoreOnly','ATTACK'],['defenseScore','DEFENSE'],['balancedScore','BALANCED'],['aggressiveScore','AGGRESSIVE'],['cautiousScore','CAUTIOUS'],['criticalScore','CRITICAL'],['fireWeight','FIRE'],['gasWeight','GAS']])add(this.informativeBest(metrics,key),label);
		const by=new Map();
		for(const c of raw){const k=c.x+':'+c.y;if(!by.has(k))by.set(k,{...c,sources:[]});const v=by.get(k);if(!v.sources.includes(c.source))v.sources.push(c.source);}
		const arr=[...by.values()];arr.sort((a,b)=>(b[ctx.profile+'Score']??-Infinity)-(a[ctx.profile+'Score']??-Infinity)||b.totalUtility-a.totalUtility);
		return arr.slice(0,this.planner.maxJumpCandidates);
	}

	getActions(state,ctx)
	{
		return this.jumpCandidates(state,ctx).map(c=>({type:'jump',to:[c.x,c.y],target:c.occupant||null,score:c.actionUtility,costAP:1,terminal:c.terminal,sources:c.sources,label:'JUMP('+c.x+','+c.y+')'}));
	}

	getMoveCandidates(state,ctx)
	{
		if(ctx.adapter.getAbility('jump')==null||state.ap<=0||state.move<=0)return[];
		const result=[];
		for(const p of ctx.matrices.places)
		{
			if(p.dist<=0||p.dist>state.move)continue;
			const test={...state,x:p.cell[0],y:p.cell[1],move:state.move-p.dist};
			const candidates=this.jumpCandidates(test,{...ctx,profile:ctx.profile});
			const best=candidates.slice().sort((a,b)=>b.totalUtility-a.totalUtility)[0];
			if(best)result.push({x:p.cell[0],y:p.cell[1],score:best.totalUtility,source:'JUMP'});
		}
		if(!result.length)return[];
		const min=Math.min(...result.map(x=>x.score)),max=Math.max(...result.map(x=>x.score));if(max-min<=AI_MATRIX_EPS)return[];
		return result.sort((a,b)=>b.score-a.score).slice(0,2);
	}
}

class AITurnPlanner
{
	constructor(ai,unit,goal,opts={})
	{
		this.ai=ai;this.unit=unit;this.goal=goal;
		this.ai.threatSystem.syncDynamicBlockers();
		this.maxDepth=opts.maxDepth??5;
		this.beamWidth=opts.beamWidth??16;
		this.maxMoveCandidates=opts.maxMoveCandidates??10;
		this.maxJumpCandidates=opts.maxJumpCandidates??10;
		this.profile=opts.profile||'balanced';
		this.order=opts.order??(unit.aiControl?unit.aiControl.order:null);
		this.orderType=AIOrder.type(this.order);
		this.adapter=new AIPlannerMatrixAdapter(this);
		this.providers=[new AIMoveActionProvider(this),new AIAttackActionProvider(this),new AIFireActionProvider(this),new AIGasActionProvider(this),new AIWebActionProvider(this),new AIJumpActionProvider(this)];
		this.matrixCache=new Map();this._terminalPositionScore=null;
		this.goalMap=this.ai.getDistanceMap(unit,goal[0],goal[1],null,null,cell=>this.ai.canMacroMoveThroughCell(unit,cell[0],cell[1]));
		this.rootGoalDistance=this.goalMap&&this.goalMap[unit.mapY]&&this.goalMap[unit.mapY][unit.mapX]!=null?this.goalMap[unit.mapY][unit.mapX]:-1;
	}

	rootState(){const u=this.unit;return{x:u.mapX,y:u.mapY,move:u.features.move,ap:u.features.abilityPoints,attackPoints:u.features.attackPoints,actionScore:0,actions:[],lastAction:null,used:new Set(),terminal:false};}
	cacheKey(s){return s.x+','+s.y+'|'+s.move+'|'+s.ap+'|'+s.attackPoints;}
	matricesFor(s){const k=this.cacheKey(s);if(!this.matrixCache.has(k))this.matrixCache.set(k,this.adapter.build(s));return this.matrixCache.get(k);}
	knownEnemies(){return this.adapter.knownEnemies();}
	positionDangerAt(x,y){return this.ai.threatSystem.getDangerAt(this.unit,x,y);}
	goalProgressAt(x,y){const gd=this.goalMap[y]?this.goalMap[y][x]:-1;return this.rootGoalDistance>=0&&gd>=0?this.rootGoalDistance-gd:-1000;}
	positionScoreAt(x,y,profile=this.profile){const p=AI_TACTICAL_PROFILES[profile]||AI_TACTICAL_PROFILES.balanced;return p.goal*this.goalProgressAt(x,y)-p.danger*this.positionDangerAt(x,y);}
	actionAndPositionScore(actionUtility,endUtility,profile=this.profile){const p=AI_TACTICAL_PROFILES[profile]||AI_TACTICAL_PROFILES.balanced;return p.offense*actionUtility+endUtility;}
	terminalPositionScore(){if(this._terminalPositionScore!=null)return this._terminalPositionScore;const root=this.rootState(),m=this.matricesFor(root);let worst=Infinity;for(const p of m.places)if(p.dist>=0&&p.dist<=root.move)worst=Math.min(worst,this.positionScoreAt(p.cell[0],p.cell[1]));this._terminalPositionScore=Number.isFinite(worst)?worst:0;return this._terminalPositionScore;}
	endPositionScore(s){return s.terminal?this.terminalPositionScore():this.positionScoreAt(s.x,s.y);}
	finalScore(s){return this.actionAndPositionScore(s.actionScore,this.endPositionScore(s));}

	buildContext(state)
	{
		const ctx={adapter:this.adapter,matrices:this.matricesFor(state),knownEnemies:this.knownEnemies(),profile:this.profile,moveCandidates:[]};
		ctx.moveCandidates=this.generateMoveCandidates(state,ctx);return ctx;
	}

	informativeBest(places,key,state)
	{
		const eligible=places.filter(p=>p.dist>0&&p.dist<=state.move);if(!eligible.length)return null;
		let min=Infinity,max=-Infinity;for(const p of eligible){const v=p[key];if(!Number.isFinite(v))continue;min=Math.min(min,v);max=Math.max(max,v);}
		if(!Number.isFinite(min)||max-min<=AI_MATRIX_EPS)return null;
		return eligible.slice().sort((a,b)=>(b[key]??-Infinity)-(a[key]??-Infinity)||a.dist-b.dist)[0]||null;
	}

	generateMoveCandidates(state,ctx)
	{
		if(state.move<=0)return[];
		const raw=[],add=(p,score,source)=>{if(p&&p.dist>0&&p.dist<=state.move)raw.push({x:p.cell[0],y:p.cell[1],dist:p.dist,score,source});};
		const best=this.informativeBest(ctx.matrices.places,'goalScore',state);if(best)add(best,best.goalScore,'GOAL');
		for(const [key,label] of [['attackScore','ATTACK'],['defenseScore','DEFENSE'],['balancedScore','BALANCED'],['aggressiveScore','AGGRESSIVE'],['cautiousScore','CAUTIOUS'],['criticalScore','CRITICAL']])
		{const bestProfile=this.informativeBest(ctx.matrices.places,key,state);if(bestProfile)add(bestProfile,bestProfile[key],label);}
		for(const provider of this.providers)for(const c of provider.getMoveCandidates(state,ctx)||[]){const p=this.adapter.placeAt(ctx.matrices,c.x,c.y);if(p)add(p,c.score,c.source);}
		const by=new Map();for(const c of raw){const k=c.x+':'+c.y;if(!by.has(k))by.set(k,{x:c.x,y:c.y,dist:c.dist,sources:[]});const v=by.get(k);if(!v.sources.includes(c.source))v.sources.push(c.source);}
		const arr=[...by.values()];arr.sort((a,b)=>{const pa=this.adapter.placeAt(ctx.matrices,a.x,a.y),pb=this.adapter.placeAt(ctx.matrices,b.x,b.y);return(pb?.[this.profile+'Score']??-Infinity)-(pa?.[this.profile+'Score']??-Infinity)||a.dist-b.dist;});
		return arr.slice(0,this.maxMoveCandidates);
	}

	stateKey(s){return s.x+','+s.y+'|'+[...s.used].sort().join(';')+'|'+(s.terminal?1:0);}
	pruneDominated(states)
	{
		const groups=new Map(),kept=[];for(const s of states){const k=this.stateKey(s);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(s);}
		for(const arr of groups.values())for(let i=0;i<arr.length;i++)
		{
			let dominated=false;for(let j=0;j<arr.length&&!dominated;j++){if(i===j)continue;const a=arr[j],b=arr[i];if(a.move>=b.move&&a.ap>=b.ap&&a.attackPoints>=b.attackPoints&&a.actionScore>=b.actionScore&&(a.move>b.move||a.ap>b.ap||a.attackPoints>b.attackPoints||a.actionScore>b.actionScore))dominated=true;}
			if(!dominated)kept.push(arr[i]);
		}
		return kept;
	}

	expand(state)
	{
		if(state.terminal)return[];
		const ctx=this.buildContext(state),actions=[];for(const provider of this.providers)for(const a of provider.getActions(state,ctx)||[])actions.push(a);
		const out=[];
		for(const a of actions)
		{
			const n={...state,used:new Set(state.used),actions:state.actions.concat([a]),lastAction:a.type};
			if(a.type==='move'){n.x=a.to[0];n.y=a.to[1];n.move=Math.max(0,n.move-a.cost);}
			else if(a.type==='attack'){if(n.move<=0||n.attackPoints<=0)continue;n.move=Math.max(0,n.move-a.costMove);n.attackPoints=Math.max(0,n.attackPoints-a.costAttack);n.actionScore+=a.score||0;}
			else{if((a.costAP||0)>n.ap)continue;n.ap-=a.costAP||0;n.actionScore+=a.score||0;if(a.to){n.x=a.to[0];n.y=a.to[1];}if(a.mark)n.used.add(a.mark);if(a.terminal)n.terminal=true;}
			out.push(n);
		}
		return out;
	}

	isCommittedOrder()
	{
		return this.orderType==='attack'||this.orderType==='intercept'||this.orderType==='cleanup'||this.orderType==='guard';
	}

	isGuardAdmissibleState(state)
	{
		if(this.orderType!=='guard'||state==null||!state.actions||state.actions.length===0)return true;
		if(state.actionScore>AI_MATRIX_EPS)return true;
		// Pure GUARD movement must make real path progress toward the assigned slot.
		// Sideways/retreat moves are allowed only as part of a useful combat sequence.
		return this.goalProgressAt(state.x,state.y)>AI_MATRIX_EPS;
	}

	isProgressState(state)
	{
		if(state==null||!state.actions||state.actions.length===0)return false;
		if(state.actionScore>AI_MATRIX_EPS)return true;
		return this.goalProgressAt(state.x,state.y)>AI_MATRIX_EPS;
	}

	plan()
	{
		this.matrixCache.clear();this._terminalPositionScore=null;
		const root=this.rootState();let best=root,bestProgress=null,bestGuard=root,beam=[root];
		const consider=s=>
		{
			if(this.finalScore(s)>this.finalScore(best))best=s;
			if(this.isProgressState(s)&&(bestProgress==null||this.finalScore(s)>this.finalScore(bestProgress)))bestProgress=s;
			if(this.isGuardAdmissibleState(s)&&this.finalScore(s)>this.finalScore(bestGuard))bestGuard=s;
		};

		for(let depth=0;depth<this.maxDepth;depth++)
		{
			let children=[];
			for(const s of beam){consider(s);children=children.concat(this.expand(s));}
			if(!children.length)break;
			for(const s of children)consider(s);
			const unique=this.pruneDominated(children);unique.sort((a,b)=>this.finalScore(b)-this.finalScore(a)||b.actionScore-a.actionScore);
			beam=this.beamWidth>0?unique.slice(0,this.beamWidth):unique;
		}
		for(const s of beam)consider(s);

		if(this.orderType==='guard')best=bestGuard;

		// ROOT means "hold position". A committed order must not deadlock forever merely
		// because every advancing option is risky. GUARD is committed to its coordinator slot,
		// but negative goal-progress movement is filtered above unless it performs useful combat.
		if(best.actions.length===0&&this.isCommittedOrder()&&bestProgress!=null)best=bestProgress;
		return{best,score:this.finalScore(best),actions:best.actions};
	}
}
