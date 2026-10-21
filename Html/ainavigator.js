//---------------------------- Global MOVE_TO navigation ----------------------------

const AI_NAVIGATION_CONFIG = Object.freeze({
	waypointTurns:3,
	detourTolerance:.25,
	riskScale:.5
});

class AINavHeap
{
	items=[];
	push(item)
	{
		const a=this.items;let i=a.length;a.push(item);
		while(i>0)
		{
			const j=(i-1)>>1;if(a[j].f<=item.f)break;
			a[i]=a[j];i=j;
		}
		a[i]=item;
	}
	pop()
	{
		const a=this.items,result=a[0],last=a.pop();
		if(a.length)
		{
			let i=0;
			while(i*2+1<a.length)
			{
				let j=i*2+1;if(j+1<a.length&&a[j+1].f<a[j].f)j++;
				if(last.f<=a[j].f)break;
				a[i]=a[j];i=j;
			}
			a[i]=last;
		}
		return result;
	}
	get length(){return this.items.length;}
}

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

	// Only this global A* considers risk. It does not affect physical distance maps or macro-MOVE.
	findPath(unit,from,to,riskWeight=0)
	{
		const [sx,sy]=from,[tx,ty]=to;
		if(sx<0||sy<0||tx<0||ty<0||sx>=map.width||sy>=map.height||tx>=map.width||ty>=map.height)return null;
		if(sx===tx&&sy===ty)return{cells:[],cost:0};
		const width=map.width,size=width*map.height,start=this.key(sx,sy),goal=this.key(tx,ty);
		const g=new Float64Array(size),parents=new Int32Array(size),closed=new Uint8Array(size);
		g.fill(Infinity);parents.fill(-1);g[start]=0;
		const h=(x,y)=>Math.max(Math.abs(x-tx),Math.abs(y-ty)),queue=new AINavHeap();
		queue.push({x:sx,y:sy,id:start,g:0,f:h(sx,sy)});
		const dangerCache=new Map();
		if(riskWeight>0)this.ai.threatSystem.syncDynamicBlockers();

		while(queue.length)
		{
			const cur=queue.pop();
			if(closed[cur.id]||cur.g>g[cur.id]+1e-9)continue;
			if(cur.id===goal)
			{
				const cells=[];let at=goal;
				while(at!==start)
				{
					cells.push([at%width,Math.floor(at/width)]);at=parents[at];
					if(at<0)return null;
				}
				cells.reverse();return{cells,cost:g[goal]};
			}
			closed[cur.id]=1;
			for(let y=cur.y-1;y<=cur.y+1;y++)for(let x=cur.x-1;x<=cur.x+1;x++)
			{
				if((x===cur.x&&y===cur.y)||x<0||y<0||x>=width||y>=map.height)continue;
				const id=this.key(x,y);if(closed[id])continue;
				// A waypoint is a navigation landmark, not a cell that must be occupied.
				const moveCost=this.cellCost(unit,x,y,id===goal);
				if(moveCost==null)continue;
				let cost=moveCost;
				if(riskWeight>0)
				{
					let danger=dangerCache.get(id);
					if(danger==null){danger=this.ai.threatSystem.getDangerAt(unit,x,y);dangerCache.set(id,danger);}
					cost+=riskWeight*Math.max(0,danger);
				}
				const next=cur.g+cost;
				if(next>=g[id]-1e-9)continue;
				g[id]=next;parents[id]=cur.id;
				queue.push({x,y,id,g:next,f:next+h(x,y)});
			}
		}
		return null;
	}

	cellCost(unit,x,y,isGoal)
	{
		const policy=AICellPolicy.assess(unit,x,y);
		if(policy.blocked)return null;
		const occupant=getUnitAtMap(x,y);
		if(!isGoal&&occupant!=null&&occupant!==unit&&!occupant.died&&
			!this.ai.canMacroMoveThroughCell(unit,x,y))return null;
		let cost=1+Math.floor(policy.movePenalty+.5)*this.fullMove(unit);
		if(occupant!=null&&occupant!==unit&&!isGoal)cost+=this.fullMove(unit);
		return cost;
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
