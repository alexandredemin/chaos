//---------------------------- Global MOVE_TO navigation ----------------------------



class AIMoveToNavigator
{
	constructor(ai,config=AI_NAVIGATION_CONFIG)
	{
		this.ai=ai;
		this.config=config;
		this.turnNumber=0;
	}

	startTurn(){this.turnNumber++;}

	key(x,y){return y*map.width+x;}
	fullMove(unit){return Math.max(1,unit.config.features.move||1);}
	turnStamp()
	{
		return this.turnNumber+':'+(this.ai.guardCoordinator?.getGameTurnStamp?.()??'unknown');
	}

	// Shared A*: only this global MOVE_TO navigation supplies a risk penalty.
	// Physical waypoint distances and same-turn macro-MOVE remain risk-free.
	findPath(unit,from,to,riskWeight=0)
	{
		if(riskWeight>0)this.ai.threatSystem.syncDynamicBlockers();
		const danger=new Map(),width=map.width;
		return AIPathfinder.findPath(unit,from,to,{
			canEnter:(x,y)=>
				(x===to[0]&&y===to[1])||this.ai.canMacroMoveThroughCell(unit,x,y),
			occupantAt:(x,y)=>getUnitAtMap(x,y),
			occupantCost:(occupant,x,y)=>
				(x===to[0]&&y===to[1])?0:this.fullMove(unit),
			riskPenalty:riskWeight>0?(x,y)=>
			{
				const k=y*width+x;
				if(!danger.has(k))danger.set(k,Math.max(0,this.ai.threatSystem.getDangerAt(unit,x,y)));
				return riskWeight*danger.get(k);
			}:null
		});
	}

	physicalDistance(unit,from,to)
	{
		const route=this.findPath(unit,from,to,0);
		return route?route.cells.length:Infinity;
	}

	riskWeight(profile)
	{
		const p=AI_TACTICAL_PROFILES[profile]||AI_TACTICAL_PROFILES.balanced;
		return this.config.riskScale*p.danger/Math.max(.01,p.goal);
	}

	build(unit,order,profile)
	{
		const goal=AIOrder.targetPos(order),start=[unit.mapX,unit.mapY];
		if(!goal)return null;
		const route=this.findPath(unit,start,goal,this.riskWeight(profile));
		if(!route)return null;
		const stride=Math.max(1,Math.round(this.fullMove(unit)*this.config.waypointTurns));
		const waypoints=[];
		for(let i=stride-1;i<route.cells.length-1;i+=stride)
		{
			const [x,y]=route.cells[i];
			// Do not create an intermediate waypoint already within one ordinary turn.
			if(!waypoints.length&&this.physicalDistance(unit,start,[x,y])<this.fullMove(unit))continue;
			waypoints.push({x,y});
		}
		waypoints.push({x:goal[0],y:goal[1]});
		let from=start;
		for(const wp of waypoints)
		{
			wp.baseDistance=this.physicalDistance(unit,from,[wp.x,wp.y]);
			from=[wp.x,wp.y];
		}
		return{
			goal:[...goal],profile,waypoints,index:0,turnStamp:this.turnStamp(),
			version:1,origin:start
		};
	}

	validSegments(unit,nav)
	{
		const points=nav.waypoints,begin=nav.index;
		for(let i=begin;i<points.length;i++)
		{
			const a=i===begin?[unit.mapX,unit.mapY]:[points[i-1].x,points[i-1].y];
			const b=[points[i].x,points[i].y],distance=this.physicalDistance(unit,a,b);
			if(!Number.isFinite(distance))return false;
			const baseline=points[i].baseDistance;
			// The unit can already be closer than the original segment start.
			if(!Number.isFinite(baseline)||distance>baseline*(1+this.config.detourTolerance)+1e-9)return false;
		}
		return true;
	}

	// Advance without standing on a waypoint. Rebuild the global route at intermediate waypoint changes.
	ensure(unit,order,profile)
	{
		if(!AIOrder.is(order,'move_to'))return null;
		const state=AIOrder.state(order),goal=AIOrder.targetPos(order);
		if(!goal||!Number.isInteger(goal[0])||!Number.isInteger(goal[1]))return null;
		let nav=state.navigation;
		const changed=!nav||!Array.isArray(nav.waypoints)||!nav.waypoints.length||
			nav.goal?.[0]!==goal[0]||nav.goal?.[1]!==goal[1]||nav.profile!==profile;
		if(changed)
		{
			nav=this.build(unit,order,profile);state.navigation=nav;
		}
		if(!nav)return null;

		const last=nav.waypoints.length-1,stamp=this.turnStamp();
		if(nav.index<last)
		{
			const wp=nav.waypoints[nav.index],near=Math.max(Math.abs(unit.mapX-wp.x),Math.abs(unit.mapY-wp.y))<this.fullMove(unit);
			if(near&&this.physicalDistance(unit,[unit.mapX,unit.mapY],[wp.x,wp.y])<this.fullMove(unit))
			{
				// Rebuild from the actual position, retaining only the fixed strategic goal.
				const updated=this.build(unit,order,profile);
				if(!updated){state.navigation=null;return null;}
				state.navigation=updated;nav=updated;
			}
		}
		if(nav.turnStamp!==stamp)
		{
			if(!this.validSegments(unit,nav))
			{
				const updated=this.build(unit,order,profile);
				if(!updated){state.navigation=null;return null;}
				state.navigation=updated;nav=updated;
			}
			nav.turnStamp=stamp;
		}
		return nav;
	}

	goalFor(unit,order,profile)
	{
		const nav=this.ensure(unit,order,profile),wp=nav?.waypoints?.[nav.index];
		return wp?[wp.x,wp.y]:AIOrder.targetPos(order);
	}
}
