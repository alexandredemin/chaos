// Legacy strategic decisions extracted verbatim from AIControl.planning().
// This planner deliberately keeps wizard defense, random attack tie-breaking,
// order persistence and the existing attack/guard thresholds unchanged.
// Future planners implement plan(midTurn=false) and use the same AIControl orders.
class AILegacyStrategicPlanner
{
    constructor(ai)
    {
        this.ai=ai;
    }

    plan(midTurn=false)
    {
        const ai=this.ai;
        console.log(midTurn ? "replanning" : "planning");
        let wizard = ai.player.wizard;
        ai.computeEnemiesInfo();
        console.log("Players stats:");
        for(let pl of players)if(pl.Info)console.log(pl.name + ": " + pl.Info.closeStr + "(" + pl.Info.sumStr + ")");
        for(const unit of ai.player.units){
            if(midTurn && !ai.canStillAct(unit)) continue;
            const unitAI = ai.ensureUnitAIControl(unit);
            if(midTurn)
            {
                unitAI.target = null;
                unitAI.plan = null;
                unitAI.action = null;
            }
            const activeOrder=unitAI.order,activeTarget=AIOrder.target(activeOrder),activeType=AIOrder.type(activeOrder);
            // Explicit MOVE_TO persists across strategic turns until its destination is reached.
            if(activeType==='move_to')
            {
                const pos=AIOrder.targetPos(activeOrder);
                if(pos&&!(unit.mapX===pos[0]&&unit.mapY===pos[1]))continue;
            }
            // HOLD remains assigned across turns until explicitly replaced (including intercept).
            if(activeType==='hold')continue;
            // Strategic attack persists; interception and cleanup may be reassigned.
            if(activeType==='engage'&&AIOrder.reason(activeOrder)==='attack'&&activeTarget&&!activeTarget.died&&ai.isUnitKnown(activeTarget))continue;
            ai.setMainTarget(unit,null,null,null,null);
        }
        if(wizard && !wizard.died){
            //Note: можно проверить текущее и прошлое положение волшебника и если оно не имзменилось, то не пересчитывать webPlan
            wizard.webPlan = ai.getWebPlanMap(wizard);
            //Compute enemies
            let maxDist = 10;
            let maxTurns = 3;
            let enemies = [];
            for(let i=0;i<maxTurns;i++)enemies[i] = [];
            //+ simple way
            /*
            let dMap = ai.getDistanceMap(wizard,wizard.mapX,wizard.mapY,function(ent){return true;},function(unt){return true;},null);
            let startCost = dMap[wizard.mapY][wizard.mapX];
            for(let pl of players){
                if (pl == wizard.player)continue;
                for(let unt of pl.units){
                    if(dMap[unt.mapY][unt.mapX] > 0 && dMap[unt.mapY][unt.mapX] <= startCost + maxDist){
                        let turns = Math.ceil((dMap[unt.mapY][unt.mapX] - startCost) / unt.config.features.move);
                        if(turns <= maxTurns)enemies[turns-1].push(unt);
                    }
                }
            }
            */
            //-
            for(let pl of players){
                if (pl == wizard.player)continue;
                for(let unt of pl.units){
                    if(!ai.isUnitKnown(unt)) continue;
                    if(Math.abs(unt.mapX - wizard.mapX) > maxDist || Math.abs(unt.mapY - wizard.mapY) > maxDist) continue;
                    let dMap = ai.getDistanceMap(unt,unt.mapX,unt.mapY);
                    let startCost = dMap[unt.mapY][unt.mapX];
                    let distToWiz = ai.getBaseCost(dMap,wizard.mapX,wizard.mapY);
                    if(dMap[wizard.mapY][wizard.mapX] > 0 && distToWiz <= startCost + maxDist){
                        let turns = Math.ceil((distToWiz - startCost) / unt.config.features.move);
                        if(turns <= maxTurns)enemies[turns-1].push(unt);
                    }
                }
            }
            let threats = [];
            let distantThreats = [];
            if(!ai.distantThreats) ai.distantThreats = [];
            ai.distantThreats = ai.distantThreats.filter(unt => !unt.died && ai.isUnitKnown(unt));
            //Threats estimation for defense
            for (let turns = 0; turns < enemies.length; turns++) {
                enemies[turns].forEach(enemy => {
                    if(distantThreats.includes(enemy))distantThreats.splice(distantThreats.indexOf(enemy),1);
                    threats.push({
                        enemy,
                        turns: turns+1,
                        threatLevel: AICombatValue.unitValue(enemy) * (enemies.length - turns)
                    });
                });
            }
            distantThreats = ai.distantThreats.map(u => {
                let x = {enemy:u, turns: 2, threatLevel: AICombatValue.unitValue(u)};
                return x;
            });
            //Sort enemies by threat level (from highest)
            threats.sort((a, b) => b.threatLevel - a.threatLevel);
            distantThreats.sort((a, b) => b.threatLevel - a.threatLevel);
            ai.threats = threats;
            //assign targets
            ai.assignTargets(threats,midTurn);
            ai.assignTargets(distantThreats,midTurn);
            //choose targets for units which doesn't have main target
            let freeunits = ai.player.units.filter(unt => unt!=ai.player.wizard && ai.getOrder(unt)==null && (!midTurn || ai.canStillAct(unt)));
            let sumStrength = 0;
            for(const unit of freeunits) sumStrength += AICombatValue.unitValue(unit);
            console.log("Attack strength: " + sumStrength);
            //Check for attack opportunity
            if(sumStrength >= 10){
                let victims = players.filter(pl => pl != ai.player && pl.wizard && !pl.wizard.died && ai.isUnitKnown(pl.wizard) && pl.Info && pl.Info.closeStr < sumStrength);
                if(victims.length > 0){
                    let distToVictim = [];
                    let capableUnits = [];
                    for(let i = 0; i < victims.length; i++){
                        distToVictim[i] = 0;
                        capableUnits[i] = 0;
                    }
                    for(const unit of freeunits){
                        let dmap = ai.getDistanceMap(unit,unit.mapX,unit.mapY);
                        for(let i = 0; i < victims.length; i++){
                            let pl = victims[i];
                            let dist = dmap[pl.wizard.mapY][pl.wizard.mapX];
                            if(dist > 0){
                                distToVictim[i] += dist;
                                capableUnits[i] += 1;
                            }
                        }
                    }    
                    let bestDist = 999999999;
                    let targetVictim = null;
                    console.log("Possible victims:")
                    for(let i = 0; i < victims.length; i++){
                        if(capableUnits[i] > 0){
                            let meanDist = distToVictim[i]/capableUnits[i];
                            if(meanDist < bestDist || (meanDist == bestDist) && (randomInt(0,1) == 1)){
                                bestDist = meanDist;
                                targetVictim = victims[i];
                            }
                            console.log("- " + victims[i].name + " dist: " + meanDist);
                        }
                    }
                    if(targetVictim){
                        for(const unit of freeunits) ai.setEngageOrder(unit,targetVictim.wizard,{reason:'attack'});
                    }
                    //update list of units which don't have main target
                    freeunits = ai.player.units.filter(unt => unt!=ai.player.wizard && ai.getOrder(unt)==null && (!midTurn || ai.canStillAct(unt)));
                }
            }
            //If there are units left that do not have a main goal, assign them to wizard guard duty or defense
            if(freeunits.length > 0){
                for(const unit of freeunits){
                    if(ai.threats.length > 0) ai.chooseTargetThreat(unit,ai.threats);
                    if(ai.getOrder(unit)==null)ai.chooseGuardTarget(unit);
                }
            }
        }
        else{
        //If no wizard or wizard died
            for(const unit of ai.player.units){
                if(midTurn && !ai.canStillAct(unit)) continue;
                if(AIOrder.is(ai.getOrder(unit),'hold'))continue; // Persistent even without a living wizard.
                let dmap = ai.getDistanceMap(unit,unit.mapX,unit.mapY);
                let trgtWiz = ai.getNearestEnemyWizard(dmap,unit);
                if(trgtWiz)ai.setEngageOrder(unit,trgtWiz,{reason:'attack'});
            }
        }
        if(!midTurn)ai.guardCoordinator.prepareTurnAssignments();
        // HOLD assignments are cached per area and built lazily from the effective orders.
        for(const unit of ai.player.units)
        {
            const order=ai.getOrder(unit);
            if(AIOrder.is(order,'hold'))ai.holdCoordinator.ensureAssignment(unit,order);
        }
    }
}

AIStrategicPlannerRegistry.register('legacy',ai=>new AILegacyStrategicPlanner(ai));
