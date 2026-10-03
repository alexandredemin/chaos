//---------------------------- GUARD tactical position evaluator ----------------------------

const AI_GUARD_CONFIG = Object.freeze({
	minRadius: 2,
	maxRadius: 5,
	idealRadius: 3.5,
	proximityBase: 2,
	proximityFalloff: .4,
	interceptHalfWidth: 1.5,
	interceptMaxDistance: 16,
	shieldBonus: 2,
	congestionPenalty: .35,
	topK: 3,
	topRelativeTolerance: .10,
	topAbsoluteTolerance: .10
});

// Precomputes dynamic GUARD geometry once per tactical planner run.
class AIGuardEvaluator
{
	constructor(ai,unit,target,config=AI_GUARD_CONFIG)
	{
		this.ai=ai;
		this.unit=unit;
		this.target=target;
		this.config=config;
		this.scoreCache=new Map();
		this.candidateCache=new Map();
		this.active=target!=null&&!target.died;
		if(!this.active)return;

		this.ringSet=this.buildRingSet();
		this.targetDMap=this.ai.getDistanceMap(unit,target.mapX,target.mapY,null,function(){return true;},null);
		this.interceptLines=[];
		this.shieldCells=new Set();
		this.congestionMap=new Map();
		this.buildEnemyGeometry();
		this.buildCongestionMap();
	}

	key(x,y){return x+':'+y;}

	buildRingSet()
	{
		const res=new Set(),cfg=this.config,target=this.target,minR2=cfg.minRadius*cfg.minRadius,maxR2=cfg.maxRadius*cfg.maxRadius;
		const minX=Math.max(0,target.mapX-cfg.maxRadius),maxX=Math.min(map.width-1,target.mapX+cfg.maxRadius);
		const minY=Math.max(0,target.mapY-cfg.maxRadius),maxY=Math.min(map.height-1,target.mapY+cfg.maxRadius);
		for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++)
		{
			if(x===target.mapX&&y===target.mapY)continue;
			const dx=x-target.mapX,dy=y-target.mapY,d2=dx*dx+dy*dy;
			if(d2>maxR2||d2<=minR2)continue;
			if(Entity.getEntityAtMap(x,y)!=null)continue;
			const wall=wallsLayer.getTileAt(x,y);
			if(wall!=null&&wall.properties['collides']===true)continue;
			if(checkLineOfSight(target.mapX,target.mapY,x,y,null,null,function(){return true;})===true)
				res.add(this.key(x,y));
		}
		return res;
	}

	// Enemy line geometry and shielding LOS are target-dependent but candidate-independent.
	buildEnemyGeometry()
	{
		const cfg=this.config,target=this.target,maxDist2=cfg.interceptMaxDistance*cfg.interceptMaxDistance;
		for(const enemy of units)
		{
			if(enemy.player===this.unit.player||enemy.died||!this.ai.isUnitKnown(enemy))continue;
			const ex=enemy.mapX,ey=enemy.mapY,vx=target.mapX-ex,vy=target.mapY-ey,len2=vx*vx+vy*vy;
			if(len2<=1e-9)continue;

			if(len2<maxDist2)
			{
				const urgency=Math.max(0,1-Math.sqrt(len2)/cfg.interceptMaxDistance);
				if(urgency>0)this.interceptLines.push({ex,ey,vx,vy,len2,urgency});
			}

			const fire=this.ai.threatSystem.getAbility(enemy,'fire');
			const range=fire&&fire.config?fire.config.range||0:0;
			if(fire==null||len2>range*range)continue;
			if(!checkLineOfSight(ex,ey,target.mapX,target.mapY,null,null,function(){return true;}))continue;
			this.addLineCells(ex,ey,target.mapX,target.mapY,this.shieldCells);
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

	// Convert nearby friendly density into O(1) candidate lookups.
	buildCongestionMap()
	{
		const penalty=this.config.congestionPenalty;
		for(const other of this.unit.player.units)
		{
			if(other===this.unit||other.died)continue;
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

	scoreAt(x,y)
	{
		if(!this.active)return 0;
		const key=this.key(x,y);
		if(this.scoreCache.has(key))return this.scoreCache.get(key);
		const pathDist=this.targetDMap[y]?this.targetDMap[y][x]:-1;
		if(pathDist<0){this.scoreCache.set(key,-1000);return -1000;}

		let score;
		if(!this.ringSet.has(key))score=-Math.max(1,pathDist-this.config.maxRadius+1);
		else
		{
			const dx=x-this.target.mapX,dy=y-this.target.mapY,r=Math.sqrt(dx*dx+dy*dy);
			const proximity=this.config.proximityBase-Math.abs(r-this.config.idealRadius)*this.config.proximityFalloff;
			const intercept=this.getInterceptionScore(x,y);
			const shield=this.shieldCells.has(key)?this.config.shieldBonus:0;
			const congestion=this.congestionMap.get(key)||0;
			score=proximity+intercept+shield-congestion;
		}
		this.scoreCache.set(key,score);
		return score;
	}

	candidateTolerance(bestScore)
	{
		return Math.max(this.config.topAbsoluteTolerance,Math.abs(bestScore)*this.config.topRelativeTolerance);
	}

	// Randomize only among cells close to the best GuardScore, then cache the choice per state.
	pickMoveCandidate(state,places)
	{
		if(!this.active)return null;
		const stateKey=state.x+':'+state.y+':'+state.move;
		if(this.candidateCache.has(stateKey))return this.candidateCache.get(stateKey);

		const eligible=[];
		for(const p of places)
		{
			if(p.dist<=0||p.dist>state.move||!Number.isFinite(p.guardScore))continue;
			eligible.push(p);
		}
		if(!eligible.length){this.candidateCache.set(stateKey,null);return null;}

		eligible.sort((a,b)=>b.guardScore-a.guardScore||a.dist-b.dist);
		const best=eligible[0].guardScore,cutoff=best-this.candidateTolerance(best);
		const nearBest=[];
		for(const p of eligible)
		{
			if(p.guardScore<cutoff||nearBest.length>=this.config.topK)break;
			nearBest.push(p);
		}
		const p=nearBest.length===1?nearBest[0]:nearBest[randomInt(0,nearBest.length-1)];
		const result={x:p.cell[0],y:p.cell[1],dist:p.dist,score:p.guardScore,source:'GUARD'};
		this.candidateCache.set(stateKey,result);
		return result;
	}
}
