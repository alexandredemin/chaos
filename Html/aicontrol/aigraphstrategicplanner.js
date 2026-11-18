// Graph S1: deterministic, present-state strategic goals and army allocation.
// This class ONLY assigns existing AIOrder objects; AIControl/AITurnPlanner still
// execute every action. No hidden-enemy knowledge, new combat model or summon AI.
class GraphStrategicPlanner
{
    constructor(ai,config=AI_GRAPH_S1_CONFIG)
    {
        this.ai=ai;this.config={...config};
        this.goals=new Map();this.assignments=new Map();this.activeKeys=[];
        this.turn=0;this.lastGraph=null;this.lastDecision=null;this.cooldowns=new Map();
        this.goalEvents=[];
        // Recover only the lightweight intent from persisted structured orders.
        // Map geometry and resource allocations are recalculated on the next turn.
        for(const u of ai.player?.units||[])
        {
            if(!u||u.died||u===ai.player.wizard)continue;
            const order=ai.getOrder(u),state=order&&AIOrder.state(order);
            const saved=u.aiControl?.graphAssignment,key=state?.graphGoalKey||saved?.key;
            if(!key)continue;
            this.assignments.set(u,key);
            if(!this.activeKeys.includes(key))this.activeKeys.push(key);
            if(!this.goals.has(key))this.goals.set(key,{key,type:state?.graphGoalType||saved?.type||'HOLD_ZONE',
                status:saved?.status||'EXECUTING',readiness:saved?.readiness??1,
                lastProgressTurn:0,lastStrength:0});
        }
    }

    strength(unit){return Math.max(0,AICombatValue.unitValue(unit));}
    keyOfZone(zone){return 'zone:'+zone.id;}
    keyOfWizard(enemy){return 'wizard:'+players.indexOf(enemy.player);}
    zoneAt(graph,x,y)
    {
        if(x<0||y<0||x>=graph.width||y>=graph.height)return 0;
        return graph.cellZone[y*graph.width+x]||0;
    }
    areaAt(graph,x,y)
    {
        if(x<0||y<0||x>=graph.width||y>=graph.height)return 0;
        return graph.areaZone[y*graph.width+x]||0;
    }
    zone(id,graph){return graph.zones.find(z=>z.id===id)||null;}
    visibleZones(graph)
    {
        // The current collision layer may contain sealed, unrevealed chambers.
        // Start at our ACTUAL visible positions; never make a strategic decision
        // in a component disconnected by unrevealed secret doors.
        const seen=new Set(),queue=[];
        for(const u of this.ai.player.units)
        {
            if(!u||u.died)continue;
            const id=this.zoneAt(graph,u.mapX,u.mapY);
            if(id&&!seen.has(id)){seen.add(id);queue.push(id);}
        }
        for(let i=0;i<queue.length;i++)
        {
            const id=queue[i];
            for(const edgeId of graph.adjacency[id]||[])
            {
                const edge=graph.connections[edgeId-1];if(!edge)continue;
                const next=edge.from===id?edge.to:edge.from;
                if(!seen.has(next)){seen.add(next);queue.push(next);}
            }
        }
        return seen;
    }

    // Independent wizard-defense pass. Reuse the existing interception matcher,
    // including its preference not to withdraw a better-placed attacker.
    defendWizard(midTurn=false)
    {
        const ai=this.ai,wizard=ai.player.wizard;
        ai.computeEnemiesInfo();
        if(!wizard||wizard.died){ai.threats=[];return new Set();}
        // The legacy planner prepares this web plan for the wizard each turn.
        // Keep its existing tactical support available when Graph is selected.
        if(typeof ai.getWebPlanMap==='function')wizard.webPlan=ai.getWebPlanMap(wizard);
        const threats=[],seen=new Set();
        for(const enemy of units)
        {
            if(!enemy||enemy.died||enemy.player===ai.player||!ai.isUnitKnown(enemy))continue;
            if(Math.max(Math.abs(enemy.mapX-wizard.mapX),Math.abs(enemy.mapY-wizard.mapY))>this.config.interceptCost)continue;
            const dmap=ai.getDistanceMap(enemy,enemy.mapX,enemy.mapY,null,()=>true),d=dmap[wizard.mapY]?.[wizard.mapX];
            if(d==null||d<0)continue;
            const turns=Math.max(1,Math.ceil(d/Math.max(1,enemy.config?.features?.move||1)));
            if(turns>this.config.reserveDefenseTurns)continue;
            threats.push({enemy,turns,threatLevel:this.strength(enemy)*(this.config.reserveDefenseTurns+1-turns)});
            seen.add(enemy);
        }
        ai.distantThreats=(ai.distantThreats||[]).filter(e=>e&&!e.died&&ai.isUnitKnown(e));
        for(const enemy of ai.distantThreats)if(enemy.player!==ai.player&&!seen.has(enemy))
            {threats.push({enemy,turns:2,threatLevel:this.strength(enemy)});seen.add(enemy);}
        threats.sort((a,b)=>b.threatLevel-a.threatLevel);
        ai.threats=threats;
        // An intercept from a previous turn must not permanently pin a soldier.
        for(const unit of ai.player.units)
        {
            if(!unit||unit.died||(midTurn&&!ai.canStillAct(unit)))continue;
            const order=ai.getOrder(unit);
            if(AIOrder.is(order,'intercept')&&!seen.has(AIOrder.target(order)))ai.setOrder(unit,null);
        }
        // Keep valid interceptors in place; avoid reissuing their identical
        // orders on every strategic turn. Re-run the legacy matcher if any
        // observed threat is insufficiently covered.
        const covered=threats.every(t=>ai.player.units.filter(u=>u&&!u.died&&
            AIOrder.is(ai.getOrder(u),'intercept')&&AIOrder.target(ai.getOrder(u))===t.enemy)
            .reduce((v,u)=>v+this.strength(u),0)>=this.strength(t.enemy));
        if(!covered)ai.assignTargets(threats,midTurn);
        const reserved=new Set();
        for(const unit of ai.player.units)
        {
            if(!unit||unit.died)continue;
            const order=ai.getOrder(unit);
            if(AIOrder.is(order,'intercept')&&seen.has(AIOrder.target(order)))reserved.add(unit);
        }
        return reserved;
    }

    // Observed defenders, not invisible enemies or information from map metadata.
    observed(graph,visible)
    {
        const own=new Map(),enemy=new Map();
        for(const u of units)
        {
            if(!u||u.died)continue;
            // Control and capture use ORIGINAL zone footprints, not corridor
            // catchments; merely walking past a room does not capture it.
            const id=this.areaAt(graph,u.mapX,u.mapY);
            if(!id||!visible.has(id))continue;
            if(u.player===this.ai.player){if(!own.has(id))own.set(id,[]);own.get(id).push(u);}
            else if(this.ai.isUnitKnown(u)){if(!enemy.has(id))enemy.set(id,[]);enemy.get(id).push(u);}
        }
        return {own,enemy};
    }

    generateCandidates(graph,visible,observed)
    {
        const cfg=this.config,candidates=[];
        const ourWizard=this.ai.player.wizard;
        const home=ourWizard&&!ourWizard.died?this.zoneAt(graph,ourWizard.mapX,ourWizard.mapY):0;
        for(const pl of players)
        {
            const wizard=pl.wizard;
            if(pl===this.ai.player||!wizard||wizard.died||!this.ai.isUnitKnown(wizard))continue;
            const id=this.zoneAt(graph,wizard.mapX,wizard.mapY);
            if(!visible.has(id))continue;
            const nearby=observed.enemy.get(id)||[];
            const defenders=nearby.filter(u=>u!==wizard).reduce((v,u)=>v+this.strength(u),0);
            candidates.push({key:this.keyOfWizard(wizard),type:'ATTACK_WIZARD',target:wizard,zoneId:id,
                x:wizard.mapX,y:wizard.mapY,value:14+Math.min(8,defenders*.20),
                required:Math.max(cfg.minAttackStrength,4+defenders*cfg.attackStrengthFactor)});
        }
        for(const z of graph.zones)
        {
            if(!visible.has(z.id)||z.area<=0)continue;
            const enemies=observed.enemy.get(z.id)||[],friends=observed.own.get(z.id)||[];
            const knownEnemies=enemies.filter(u=>u!==u.player?.wizard);
            const enemyStrength=knownEnemies.reduce((v,u)=>v+this.strength(u),0);
            const degree=(graph.adjacency[z.id]||[]).length;
            const isArena=z.area>cfg.maxHoldArea;
            const oldCapture=this.goals.get(this.keyOfZone(z))?.type==='CAPTURE_ZONE';
            if(knownEnemies.length||oldCapture&&!friends.length)
            {
                // Only one zone objective per zone (CAPTURE replaces HOLD).
                candidates.push({key:this.keyOfZone(z),type:'CAPTURE_ZONE',zoneId:z.id,x:z.x,y:z.y,
                    enemies:knownEnemies,value:7+Math.min(6,enemyStrength*.3)+Math.min(2,degree*.35),
                    required:Math.max(cfg.minCaptureStrength,enemyStrength*cfg.captureStrengthFactor)});
            }
            else if(!isArena&&!enemies.some(u=>u===u.player?.wizard))
            {
                // A HOLD on a room/region is an offensive staging position too;
                // the large arena is transit, never a gratuitous garrison.
                const nearby=[...(graph.adjacency[z.id]||[])].some(id=>{
                    const e=graph.connections[id-1],other=e.from===z.id?e.to:e.from;
                    return (observed.enemy.get(other)||[]).length>0;
                });
                candidates.push({key:this.keyOfZone(z),type:'HOLD_ZONE',zoneId:z.id,x:z.x,y:z.y,
                    value:3.2+Math.min(2,degree*.4)+(nearby?1.9:0)+(friends.length?.35:0)+(z.id===home?.25:0),
                    required:Math.max(cfg.minHoldStrength,Math.min(7,2+z.area/45)+(nearby?1:0))});
            }
        }
        candidates.sort((a,b)=>b.value-a.value||a.key.localeCompare(b.key));
        const chosen=candidates.slice(0,Math.max(1,cfg.maxCandidates));
        // Keep existing goals in the candidate set so persistence is a real choice.
        for(const key of this.activeKeys)if(!chosen.some(g=>g.key===key))
        {
            const old=candidates.find(g=>g.key===key);
            if(old){if(chosen.length>=cfg.maxCandidates)chosen.pop();chosen.push(old);}
        }
        return chosen;
    }

    unitDistances(unitsToAllocate)
    {
        const maps=new Map();
        for(const u of unitsToAllocate)maps.set(u,this.ai.getDistanceMap(u,u.mapX,u.mapY,null,()=>true));
        return maps;
    }
    travelTurns(unit,g,maps)
    {
        const d=maps.get(unit)?.[g.y]?.[g.x];
        return d!=null&&d>=0?d/Math.max(1,unit.config?.features?.move||1):Infinity;
    }
    switchPenalty(unit,g)
    {
        const previous=this.assignments.get(unit);
        if(!previous||previous===g.key)return 0;
        const current=this.ai.getOrder(unit),type=AIOrder.type(current);
        return this.config.switchWeight*(type==='hold'?1.45:type==='engage'?1.7:1);
    }

    // The existing EXECUTING operation is a commitment, not a score bonus.
    // It remains in every trial portfolio until it has genuinely completed or
    // becomes invalid (dead target, topology change, etc.). PREPARING is mutable.
    committedGoals(candidates)
    {
        return candidates.filter(g=>g.type!=='HOLD_ZONE'&&this.activeKeys.includes(g.key)&&
            this.goals.get(g.key)?.status==='EXECUTING');
    }

    // Pure trial allocation, including fixed members of continuing operations.
    // Interceptors are NOT in `available`; their strategic membership is kept
    // separately in this.assignments and is restored when interception ends.
    // Never change orders, assignments or lifecycle state during enumeration.
    evaluatePortfolio(goals,available,maps)
    {
        const assigned=new Map(goals.map(g=>[g.key,[]])),strengths=new Map(goals.map(g=>[g.key,0]));
        const unused=new Set(available),cfg=this.config;
        for(const u of available)
        {
            const key=this.assignments.get(u),g=goals.find(g=>g.key===key);
            if(!g)continue;
            const travel=this.travelTurns(u,g,maps);
            // Preserve an existing commitment even if the map currently has a
            // transient obstruction. The tactical layer handles actual movement.
            assigned.get(key).push({unit:u,travel:Number.isFinite(travel)?travel:0});
            strengths.set(key,strengths.get(key)+this.strength(u));unused.delete(u);
        }
        while(unused.size)
        {
            let best=null;
            for(const u of unused)for(const g of goals)
            {
                const before=strengths.get(g.key),value=this.strength(u);
                if(before>=g.required||value<=0)continue;
                const travel=this.travelTurns(u,g,maps);if(!Number.isFinite(travel))continue;
                const gain=g.value*Math.min(value,g.required-before)/g.required;
                // Reinforce a fighting operation before initiating a new one.
                // The lower its current supply ratio, the larger this bonus.
                const executing=this.goals.get(g.key)?.status==='EXECUTING';
                const reinforcement=executing&&before/g.required<cfg.reinforcementThreshold
                    ?cfg.reinforcementBonus*(cfg.reinforcementThreshold-before/g.required)/cfg.reinforcementThreshold:0;
                const utility=gain+reinforcement-cfg.travelWeight*travel-this.switchPenalty(u,g)+
                    (this.assignments.get(u)===g.key?cfg.persistenceBonus*.5:0);
                if(!best||utility>best.utility||utility===best.utility&&g.key<best.goal.key)
                    best={unit:u,goal:g,utility,travel};
            }
            if(!best||best.utility<=0)break;
            unused.delete(best.unit);
            assigned.get(best.goal.key).push({unit:best.unit,travel:best.travel});
            strengths.set(best.goal.key,strengths.get(best.goal.key)+this.strength(best.unit));
        }
        let score=0,preparing=0;const details=[];
        for(const g of goals)
        {
            const group=assigned.get(g.key),strength=strengths.get(g.key);
            const old=this.goals.get(g.key);
            const continued=old?.status==='EXECUTING';
            const readiness=Math.min(1,strength/g.required),supplyRatio=strength/g.required;
            // LATCH: once the operation starts, losses NEVER return it to PREPARING.
            const status=continued||g.type==='HOLD_ZONE'||strength>=g.required?'EXECUTING':'PREPARING';
            if(!group.length&&!continued)continue;
            if(status==='PREPARING'&&g.type!=='HOLD_ZONE')preparing++;
            const travel=group.reduce((v,x)=>v+x.travel,0);
            const switches=group.reduce((v,x)=>v+this.switchPenalty(x.unit,g),0);
            score+=g.value*(cfg.readinessFloor+(1-cfg.readinessFloor)*readiness)
                -cfg.travelWeight*travel-switches;
            if(this.activeKeys.includes(g.key))score+=cfg.persistenceBonus;
            details.push({...g,assigned:group,strength,readiness:continued?1:readiness,
                supplyRatio,status,travel,switches});
        }
        if(preparing>1)return null;
        if(!details.length)return {goals:[],score:0,assignments:new Map()};
        const allocation=new Map();
        for(const g of details)for(const item of g.assigned)allocation.set(item.unit,g.key);
        return {goals:details,score,assignments:allocation};
    }

    allPortfolios(candidates,available,maps)
    {
        const locked=this.committedGoals(candidates),lockedKeys=new Set(locked.map(g=>g.key));
        // Lowering maxActiveGoals must not silently abort an existing attack.
        const max=Math.max(locked.length,Math.min(candidates.length,Math.max(1,this.config.maxActiveGoals)));
        const optional=candidates.filter(g=>!lockedKeys.has(g.key)),plans=[];
        const enumerate=(chosen,next)=>{
            const goals=locked.concat(chosen);
            if(goals.length)
            {
                const result=this.evaluatePortfolio(goals,available,maps);
                if(result)plans.push(result);
            }
            if(goals.length===max)return;
            for(let i=next;i<optional.length;i++)enumerate(chosen.concat(optional[i]),i+1);
        };
        enumerate([],0);
        if(!locked.length)plans.push({goals:[],score:0,assignments:new Map()});
        plans.sort((a,b)=>b.score-a.score||a.goals.map(g=>g.key).join('|').localeCompare(b.goals.map(g=>g.key).join('|')));
        return plans;
    }

    // Dynamic supply is for reinforcements and diagnostics, NEVER for undoing
    // EXECUTING. An interceptor is still a member of its strategic operation,
    // but its strength is temporarily unavailable to that operation.
    goalReport(goal)
    {
        const members=[],deployed=[];
        for(const [unit,key] of this.assignments)
        {
            if(key!==goal.key||unit.died)continue;
            members.push(unit);
            if(!AIOrder.is(this.ai.getOrder(unit),'intercept'))deployed.push(unit);
        }
        const total=members.reduce((v,u)=>v+this.strength(u),0);
        const effective=deployed.reduce((v,u)=>v+this.strength(u),0);
        return {members,deployed,total,effective,supplyRatio:effective/goal.required,
            detached:members.filter(u=>!deployed.includes(u))};
    }

    finishGoal(key,status,reason)
    {
        const old=this.goals.get(key);
        if(!old)return;
        this.goalEvents.push({key,type:old.type,status,reason,turn:this.turn});
        if(this.goalEvents.length>20)this.goalEvents.shift();
    }

    // Stable nearest currently known defender for each capturing soldier;
    // do not chase enemies that have already left the target zone.
    captureTarget(unit,g,graph)
    {
        let closest=null,best=Infinity;
        for(const enemy of g.enemies||[])
        {
            if(enemy.died||!this.ai.isUnitKnown(enemy)||this.areaAt(graph,enemy.mapX,enemy.mapY)!==g.zoneId)continue;
            const d=Math.max(Math.abs(unit.mapX-enemy.mapX),Math.abs(unit.mapY-enemy.mapY));
            if(d<best){best=d;closest=enemy;}
        }
        return closest;
    }
    sameGoalOrder(unit,g)
    {
        const order=this.ai.getOrder(unit),state=order?AIOrder.state(order):null;
        if(state?.graphGoalKey!==g.key)return false;
        if(g.status==='PREPARING'&&g.type!=='HOLD_ZONE')return AIOrder.is(order,'guard');
        if(g.type==='HOLD_ZONE')return AIOrder.is(order,'hold')&&state.areaMode==='graphZone'&&state.zoneId===g.zoneId;
        if(g.type==='ATTACK_WIZARD')return AIOrder.is(order,'engage')&&AIOrder.target(order)===g.target;
        if(g.type==='CAPTURE_ZONE')return AIOrder.is(order,'engage')&&
            this.areaAt(this.lastGraph,AIOrder.target(order)?.mapX,AIOrder.target(order)?.mapY)===g.zoneId&&
            !AIOrder.target(order)?.died&&this.ai.isUnitKnown(AIOrder.target(order));
        return false;
    }
    applyOrder(unit,g,graph)
    {
        if(this.sameGoalOrder(unit,g))return;
        const ai=this.ai;
        if(g.status==='PREPARING'&&g.type!=='HOLD_ZONE')
        {
            if(ai.player.wizard&&!ai.player.wizard.died)ai.chooseGuardTarget(unit);
            else ai.setHoldOrder(unit,[unit.mapX,unit.mapY],{radius:2});
        }
        else if(g.type==='HOLD_ZONE')ai.setHoldOrder(unit,[g.x,g.y],{areaMode:'graphZone',
            state:{areaMode:'graphZone',zoneId:g.zoneId,radius:AI_HOLD_CONFIG.defaultRadius,graphGoalKey:g.key}});
        else if(g.type==='ATTACK_WIZARD')ai.setEngageOrder(unit,g.target,{reason:'attack'});
        else if(g.type==='CAPTURE_ZONE')
        {
            const target=this.captureTarget(unit,g,graph);
            if(target)ai.setEngageOrder(unit,target,{reason:'attack'});
            else ai.setHoldOrder(unit,[g.x,g.y],{areaMode:'graphZone',state:{zoneId:g.zoneId,graphGoalKey:g.key}});
        }
        const order=ai.getOrder(unit);
        if(order)
        {
            const state=AIOrder.state(order);
            state.graphGoalKey=g.key;
            state.graphGoalType=g.type;
        }
    }

    // Every unassigned living soldier gets a REAL defensive order. GUARD is
    // the fallback job, not a missing strategic assignment (and not free IDLE).
    fallbackGuard(unit)
    {
        const ai=this.ai,order=ai.getOrder(unit),wizard=ai.player.wizard;
        if(wizard&&!wizard.died)
        {
            const state=order?AIOrder.state(order):null;
            if(AIOrder.is(order,'guard')&&AIOrder.target(order)===wizard&&!state?.graphGoalKey)return;
            ai.setOrder(unit,null);
            ai.chooseGuardTarget(unit);
        }
        else if(!AIOrder.is(order,'hold')||AIOrder.state(order)?.graphGoalKey)
        {
            ai.setOrder(unit,null);
            ai.setHoldOrder(unit,[unit.mapX,unit.mapY],{radius:2});
        }
    }

    commit(plan,graph,available,midTurn,reserved)
    {
        const before=new Map(this.assignments),newAssignments=new Map();
        for(const g of plan.goals)for(const item of g.assigned)newAssignments.set(item.unit,g.key);
        const active=new Set(plan.goals.map(g=>g.key)),next=new Map();
        // Do not drop a strategic member merely because a tactical INTERCEPT
        // temporarily borrowed it. Its order is left to wizard defense.
        for(const [unit,key] of before)
        {
            if(unit&&!unit.died&&reserved.has(unit)&&active.has(key))next.set(unit,key);
            else if(midTurn&&!this.ai.canStillAct(unit)&&active.has(key))next.set(unit,key);
        }
        for(const [unit,key] of newAssignments)next.set(unit,key);
        for(const unit of this.ai.player.units)
        {
            if(!unit||unit.died||unit===this.ai.player.wizard)continue;
            if(midTurn&&!this.ai.canStillAct(unit))continue;
            if(reserved.has(unit))continue;
            const key=next.get(unit),g=plan.goals.find(g=>g.key===key);
            if(g)this.applyOrder(unit,g,graph);
            else this.fallbackGuard(unit);
        }
        this.assignments=next;
        this.activeKeys=plan.goals.map(g=>g.key);
        for(const g of plan.goals)
        {
            const old=this.goals.get(g.key),state=old||{started:this.turn,preparingSince:null,lastProgressTurn:this.turn,lastStrength:0};
            const status=old?.status==='EXECUTING'?'EXECUTING':g.status;
            if(old?.type==='CAPTURE_ZONE'&&g.type==='HOLD_ZONE')
                this.finishGoal(g.key,'COMPLETED','zone captured; hold begins');
            if(g.strength>state.lastStrength+this.config.minProgress)state.lastProgressTurn=this.turn;
            if(status==='PREPARING')state.preparingSince??=this.turn;
            else state.preparingSince=null;
            if(status==='EXECUTING'&&(old?.status!=='EXECUTING'||old?.type!==g.type))state.activatedTurn=this.turn;
            Object.assign(state,{key:g.key,type:g.type,status,requiredStrength:g.required,
                assignedStrength:g.strength,readiness:status==='EXECUTING'?1:g.readiness,
                supplyRatio:g.supplyRatio,lastStrength:g.strength});
            this.goals.set(g.key,state);
        }
        for(const [key,old] of [...this.goals])if(!active.has(key))
        {
            const targetOld=old.type==='ATTACK_WIZARD'&&units.find(u=>
                this.keyOfWizard(u)===key&&u===u.player?.wizard);
            const completed=targetOld?.died;
            this.finishGoal(key,completed?'COMPLETED':'ABORTED',completed?'goal reached':'goal not available');
            this.goals.delete(key);
        }
        // Preserve intent outside the current order, which can temporarily be
        // overwritten by intercept. This permits reconstructing the planner.
        for(const unit of this.ai.player.units)
        {
            if(!unit||unit.died||unit===this.ai.player.wizard)continue;
            const key=next.get(unit),state=key?this.goals.get(key):null;
            if(unit.aiControl)unit.aiControl.graphAssignment=state?{
                key,type:state.type,status:state.status,readiness:state.readiness}:null;
        }
    }

    plan(midTurn=false)
    {
        const ai=this.ai;
        if(!midTurn)this.turn++;
        // Clear only tactics, never an order that is still valuable.
        for(const unit of ai.player.units)if(unit&&!unit.died&&(!midTurn||ai.canStillAct(unit)))
        {
            const control=ai.ensureUnitAIControl(unit);
            if(midTurn){control.target=null;control.plan=null;control.action=null;}
        }
        const reserved=this.defendWizard(midTurn);
        // A mid-turn contact may interrupt an order for wizard defense, but must
        // NOT erase goals/assignments belonging to already-moved combat units.
        // Major portfolio changes happen on the next normal strategic turn.
        if(midTurn&&this.lastDecision)
        {
            // Newly summoned troops are not part of a committed portfolio yet;
            // give them GUARD immediately instead of leaving them without a job.
            for(const unit of ai.player.units)
                if(unit&&!unit.died&&unit!==ai.player.wizard&&!reserved.has(unit)&&
                    !this.assignments.has(unit)&&ai.canStillAct(unit))this.fallbackGuard(unit);
            this.lastDecision={...this.lastDecision,reserved:[...reserved],reason:'mid-turn defense'};
            return;
        }
        const graph=ai.getTopologyGraph();
        if(this.lastGraph&&this.lastGraph!==graph)
        {
            // A revealed secret gate may relabel zones. Do not carry old zone
            // IDs or HOLD geometry across a changed physical topology snapshot.
            for(const key of this.activeKeys)this.finishGoal(key,'ABORTED','topology changed');
            this.goals.clear();this.assignments.clear();this.activeKeys=[];this.cooldowns.clear();
            for(const u of ai.player.units)if(u?.aiControl)u.aiControl.graphAssignment=null;
            ai.holdCoordinator?.areas?.clear();ai.holdCoordinator?.groups?.clear();
        }
        this.lastGraph=graph;
        if(!graph||!graph.zones.length)
        {
            for(const key of this.activeKeys)this.finishGoal(key,'ABORTED','topology unavailable');
            this.goals.clear();this.assignments.clear();this.activeKeys=[];
            for(const u of ai.player.units)if(u?.aiControl)u.aiControl.graphAssignment=null;
            for(const unit of ai.player.units)
            {
                if(!unit||unit.died||unit===ai.player.wizard||reserved.has(unit)||midTurn&&!ai.canStillAct(unit))continue;
                this.fallbackGuard(unit);
            }
            this.lastDecision={turn:this.turn,reason:'no topology',score:0,goals:[],reserved:[...reserved],candidates:[]};
            return;
        }
        const visible=this.visibleZones(graph),observed=this.observed(graph,visible);
        const candidates=this.generateCandidates(graph,visible,observed).filter(g=>{
            if((this.cooldowns.get(g.key)||0)>this.turn)return false;
            const old=this.goals.get(g.key);
            if(old&&old.status==='PREPARING'&&this.turn-old.lastProgressTurn>this.config.preparingTimeout)
            {this.cooldowns.set(g.key,this.turn+2);return false;}
            return true;
        });
        const available=ai.player.units.filter(u=>u&&!u.died&&u!==ai.player.wizard&&!reserved.has(u)&&
            (!midTurn||ai.canStillAct(u)));
        const maps=this.unitDistances(available);
        const plans=this.allPortfolios(candidates,available,maps);
        let chosen=plans[0];
        // Hysteresis compares the FULL trial portfolio, not independent goal values.
        const previous=plans.find(p=>p.goals.length===this.activeKeys.length&&
            p.goals.every(g=>this.activeKeys.includes(g.key)));
        if(previous&&previous!==chosen&&chosen.score<previous.score+this.config.replacementMargin)chosen=previous;
        // During mid-turn discovery, preserve committed goals until the next turn.
        if(midTurn&&previous)chosen=previous;
        this.commit(chosen,graph,available,midTurn,reserved);
        this.lastDecision={turn:this.turn,score:chosen.score,goals:chosen.goals,
            candidates,available:available.length,reserved:[...reserved],
            allocations:[...this.assignments].map(([u,key])=>({unit:u,key})),
            alternative:plans[0]?.score,reason:chosen===previous&&chosen!==plans[0]?'persistence':'best allocation',
            guardCount:available.filter(u=>!this.assignments.has(u)).length};
    }
}

AIStrategicPlannerRegistry.register('graph',ai=>new GraphStrategicPlanner(ai));
