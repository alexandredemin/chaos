//---------------------------- AIControl class ----------------------------

class AIControl
{
    player = null;
    availableUnits = null;
    passStage = 1;
    threats = null;
    distantThreats = null;

    constructor(player)
    {
        this.player = player;
    }

    startTurn()
    {
        if(this.player.units.length === 0)
        {
            setTimeout(endTurn,1);
            return;
        }
        this.availableUnits = [];
        for(let i=this.player.units.length-1;i>=0;i--)
        {
            this.availableUnits.push(this.player.units[i]);
        }
        this.computeEnemyAttackMaps();
        this.planning();
        this.passStage = 1;
        this.pass();
    }

    pass()
    {
        if(this.availableUnits.length > 0)
        {
            let unit = this.availableUnits.pop();
            if(!unit || unit.died)
            {
                this.pass();
            }
            else
            {
                selectUnit(unit);
                this.step(unit);
            }  
        }
        else
        {
            if(this.passStage <= 2) {
                this.passStage++;
                for (let i = this.player.units.length - 1; i >= 0; i--) {
                    let unt = this.player.units[i];
                    if (unt.features.move > 0 || unt.features.abilityPoints > 0) this.availableUnits.push(unt);
                }
                this.pass();
            }
            else
            {
                setTimeout(endTurn,1);
            }
        }
    }

    step(unit)
    {
        if(unit.died)
        {
            this.pass();
            return;
        }
        if(unit.config.name === "wizard")
        {
            this.stepWizard(unit);
            return;
        }
        //if(unit.aiControl && unit.aiControl.order && unit.aiControl.order == "intercept" && unit.aiControl.mainTarget != null && !unit.aiControl.mainTarget.died){
        //    this.stepByPlan(unit);
        //}
        //else{
            this.stepUnit(unit);
        //}
    }

    isGoalAchieved(unit)
    {
        if(unit.aiControl && unit.aiControl.order){
            if(unit.aiControl.order == "intercept" && unit.aiControl.mainTarget != null && unit.aiControl.mainTarget.died) return true;
            else if(unit.aiControl.order == "patrol" && unit.aiControl.mainTargetPos && unit.mapX === unit.aiControl.mainTargetPos[0] && unit.mapY === unit.aiControl.mainTargetPos[1]) return true;
        }
        return false;
    }

    stepByPlan(unit)
    {
        //if(!unit.aiControl) unit.aiControl = {plan: null};
        //if(unit.aiControl && unit.aiControl.order && unit.aiControl.order == "intercept" && unit.aiControl.mainTarget != null && !unit.aiControl.mainTarget.died)
        if(this.isGoalAchieved(unit)){
            // Goal achieved, need to choose new goal
            console.log("goal achieved");
            unit.aiControl.plan = null;
            unit.aiControl.action = null;
            this.setMainTarget(unit,null,null,null,null);
        }
        if(!unit.aiControl.plan){
            unit.aiControl.action = null;
            let state = GameState.createFrom(units, entities, wallsLayer); 
            const order = {
                type: "intercept",
                targetId: unit.aiControl.mainTarget.id
            };
            //const { sequence, score } = planBestTurn(state, unit.id, order);
            const startTime = performance.now();
            const { sequence, score } = planBestTurnMCTS(state, unit.id, order, 1000);
            const endTime = performance.now();
            unit.aiControl.plan = sequence;
            //+log
            console.log(unit.config.name + " " + order.type + " plan: " + sequence.map(a => a.getName()) + " time: " + (endTime - startTime).toFixed(2) + "ms");
            //-
        }
        if(unit.aiControl.action || (unit.aiControl.plan && unit.aiControl.plan.length > 0))
        {
            if(unit.aiControl.action == null) unit.aiControl.action = unit.aiControl.plan.shift();
            if(unit.aiControl.action)
            {
                const action = unit.aiControl.action;
                switch(action.typeName){
                    case "stop":
                    {
                        unit.aiControl.plan = null;
                        unit.aiControl.action = null;
                        this.pass();
                        break;
                    }
                    case "move":
                    {
                        let pos = null;
                        while(action.params.path.length > 0){
                            pos = action.params.path.shift();
                            if(pos.x !== unit.mapX || pos.y !== unit.mapY) break;
                        }
                        if(action.params.path.length === 0) unit.aiControl.action = null;
                        if(pos && unit.canStepTo(pos.x-unit.mapX,pos.y-unit.mapY)){                   
                            unit.stepTo(pos.x,pos.y);
                        }
                        else{
                            unit.aiControl.plan = null;
                            unit.aiControl.action = null;
                            console.log("step failed");
                            this.step(unit);
                        }
                        break;
                    }
                    case "attack":
                    {
                        if(unit.canAtackTo(action.params.position.x-unit.mapX,action.params.position.y-unit.mapY)){
                            unit.atackTo(action.params.position.x,action.params.position.y);
                        }
                        else{
                            unit.aiControl.plan = null;
                            unit.aiControl.action = null;
                            console.log("attack failed");
                            this.step(unit);
                        }
                        unit.aiControl.action = null;
                        break;
                    }
                    case "fire": case "gas": case "jump":
                    {
                        unit.startAbility();
                        unit.aiControl.action = null;
                        break;
                    }
                }
            }
        }
        else{
            unit.aiControl.plan = null;
            unit.aiControl.action = null;
            this.pass();
        }
    }

    stepToTarget(unit,target,dmap)
    {
        if(!dmap) dmap = this.getDistanceMap(unit,unit.mapX,unit.mapY);
        let cell = this.getOptimalStep(dmap,target,[unit.mapX, unit.mapY]);
        if(cell != null)
        {
            if(unit.canStepTo(cell[0]-unit.mapX,cell[1]-unit.mapY)) unit.stepTo(cell[0],cell[1]);
            else if(unit.canAtackTo(cell[0]-unit.mapX,cell[1]-unit.mapY)) unit.atackTo(cell[0], cell[1]);
            else return false;
        }
        else return false;
        return true;
    }

    stepCommonUnit(unit,dmap)
    {
        if(!dmap) dmap = this.getDistanceMap(unit,unit.mapX,unit.mapY);
        let target = this.getNearestEnemyWizard(dmap,unit);
        if(target == null || dmap[target.mapY][target.mapX] > unit.features.move) {
            let trgUnits = this.getAvailableEnemies(dmap,unit,unit.features.move);
            if(trgUnits.length > 0) target = trgUnits[randomInt(0,trgUnits.length-1)];
        }
        if(target != null)
        {
            if (!this.stepToTarget(unit, [target.mapX, target.mapY], dmap)) return false;
        }
        else return false;
        return true;
    }

    stepUnit(unit)
    {
        if(!unit.aiControl)
        {
            unit.aiControl = {target: null};
        }
        if(unit.aiControl.target == null)
        {
            let mainGoal = null;
            if(unit.aiControl.mainTarget){
                if(unit.aiControl.mainTarget.died){
                    this.setMainTarget(unit,null,null,null,null);
                }
                else{
                    mainGoal = [unit.aiControl.mainTarget.mapX,unit.aiControl.mainTarget.mapY];              
                }
            }
            else if(unit.aiControl.mainTargetPos){
                mainGoal = [unit.aiControl.mainTargetPos[0],unit.aiControl.mainTargetPos[1]];                
            } 
            if(mainGoal == null){
                if(unit.player.wizard && !unit.player.wizard.died){
                    if(this.threats.length > 0){
                        this.chooseTargetThreat(unit,this.threats);
                    }
                    if(unit.aiControl.mainTarget){
                        mainGoal = [unit.aiControl.mainTarget.mapX,unit.aiControl.mainTarget.mapY];
                    }
                    else{
                        this.choosePatrolTarget(unit);
                        if(unit.aiControl.mainTargetPos){
                            mainGoal = [unit.aiControl.mainTargetPos[0],unit.aiControl.mainTargetPos[1]];
                        } 
                    }
                }
                else{
                    let dmap = this.getDistanceMap(unit,unit.mapX,unit.mapY);
                    let trgtWiz = this.getNearestEnemyWizard(dmap,unit);
                    if(trgtWiz){
                        this.setMainTarget(unit,trgtWiz,[trgtWiz.mapX,trgtWiz.mapY],"attack",10);
                        mainGoal = [trgtWiz.mapX,trgtWiz.mapY];
                    }
                }
            }
            if(mainGoal == null) mainGoal = [unit.mapX,unit.mapY];
            let aggressionFactor = 2;
            if(unit.aiControl.agression) aggressionFactor = unit.aiControl.agression;
            let dmap = this.getDistanceMap(unit,unit.mapX,unit.mapY);
            let stepPlaces = this.getAvailableCells(dmap,unit,null,true);
            if(unit.features.attackPoints > 0) this.computeAtackMatrix(unit,stepPlaces,dmap);
            if(unit.features.abilityPoints > 0)
            {
                this.computeGasMatrix(unit,stepPlaces);
                this.computeFireMatrix(unit,stepPlaces);
                this.computeWebMatrix(unit,stepPlaces);
            }
            this.computeDangerMatrix(unit,stepPlaces);
            let gDMap = this.getDistanceMap(unit,mainGoal[0],mainGoal[1],null,null,null,0,this.getPenaltyMap(unit,aggressionFactor));
            this.computeDistMatrix(unit,stepPlaces,mainGoal,gDMap);
            //+log
            if(unit.aiControl.mainTarget) console.log(unit.config.name + " " + unit.aiControl.order + ":" + aggressionFactor + " " + unit.aiControl.mainTarget.config.name + "[" + unit.aiControl.mainTarget.mapX + "," + unit.aiControl.mainTarget.mapY +"]");
            else if(unit.aiControl.mainTargetPos) console.log(unit.config.name + " " + unit.aiControl.order + ":" + aggressionFactor + " [" + unit.aiControl.mainTargetPos[0] + "," + unit.aiControl.mainTargetPos[1] +"]");
            //-
            //+debug
            if(this.player.control === PlayerControl.human)
            {
                //let penaltyMap = this.getPenaltyMap();
                this.player.icons = [];
                for(let i=0;i<map.height;i++)
                    for(let j=0;j<map.width;j++)
                    {
                        let pos = map.tileToWorldXY(j, i);
                        let txt = unit.scene.add.text(pos.x + 1, pos.y + 1, gDMap[i][j], {font: "6px Arial",color: "#ffffff", resolution: 10});
                        this.player.icons.push(txt);
                        //txt.setDepth(10000);
                        //let txt2 = unit.scene.add.text(pos.x + 7, pos.y + 7, scoreMap[i][j], {font: "6px Arial",color: "#aaaaaa", resolution: 10});
                        //this.player.icons.push(txt2);
                        //txt2.setDepth(10000);
                    }
            }
            //-
            for(let i=0;i<stepPlaces.length;i++)
            {
                let place = stepPlaces[i];
                place.bestWeight = 0;
                if(place.atackWeight != null && place.atackWeight > 0) place.bestWeight = place.bestWeight + place.atackWeight;
                if(place.gasWeight != null && place.gasWeight > 0) place.bestWeight = place.bestWeight + place.gasWeight;
                if(place.fireWeight != null) place.bestWeight = place.bestWeight + place.fireWeight;
                if(place.webWeight != null && place.webWeight > 0) place.bestWeight = place.bestWeight + place.webWeight;
                place.score = place.bestWeight;
                if(place.dangerWeight != null && place.dangerWeight > 0) place.score = aggressionFactor * place.bestWeight - Math.floor(place.dangerWeight / unit.features.health);
                place.score = place.score + place.distWeight;
                //+debug
                /*
                if(this.player.control === PlayerControl.human)
                {
                    let pos = map.tileToWorldXY(place.cell[0], place.cell[1]);
                    let txt = unit.scene.add.text(pos.x + 1, pos.y + 8, place.score, {font: "6px Arial",color: "blue", resolution: 10});
                    this.player.icons.push(txt);
                    txt.setDepth(10000);
                }
                */
                //-
            }    
            let bestPlaces = [];
            let bestScore = -999999999;
            for(let place of stepPlaces)
            {
                //+debug
                if(this.player.control === PlayerControl.human)
                {
                    let pos = map.tileToWorldXY(place.cell[0], place.cell[1]);
                    let txt = unit.scene.add.text(pos.x + 1, pos.y + 8, place.score, {font: "6px Arial",color: "blue", resolution: 10});
                    this.player.icons.push(txt);
                    txt.setDepth(10000);
                    let txt2 = unit.scene.add.text(pos.x + 8, pos.y + 8, place.bestWeight, {font: "6px Arial",color: "green", resolution: 10});
                    this.player.icons.push(txt2);
                    txt2.setDepth(10000);
                }
                //-
                if(place.score == bestScore) bestPlaces.push(place);
                else if(place.score > bestScore)
                {
                    bestPlaces = [place];
                    bestScore = place.score;
                }
            }
            let bestPlace = bestPlaces[randomInt(0, bestPlaces.length - 1)];
            if(bestPlace != null)
            {
                //+debug
                if(this.player.control === PlayerControl.human)
                {
                    let pos = map.tileToWorldXY(bestPlace.cell[0], bestPlace.cell[1]);
                    let txt = unit.scene.add.text(pos.x + 1, pos.y + 8, bestPlace.score, {font: "6px Arial",color: "red", resolution: 10});
                    this.player.icons.push(txt);
                    txt.setDepth(10000);
                }
                //-
                unit.aiControl.target = bestPlace.cell;
                if(bestPlace.gasWeight != null && bestPlace.gasWeight <= 0) unit.features.abilityPoints = 0;
                if(bestPlace.fireWeight != null && bestPlace.fireWeight <= 0) unit.features.abilityPoints = 0;
                if(bestPlace.webWeight != null && bestPlace.webWeight <= 0) unit.features.abilityPoints = 0;
            }
            else
            {
                if(unit.config.abilities != null && unit.config.abilities.web != null && unit.player.wizard != null)
                {
                    let bestWebCell = null;
                    for(let w of unit.player.wizard.webPlan)
                    {
                        if(Entity.getEntityAtMap(w.cell[0], w.cell[1]) != null) continue;
                        if(this.checkWebCell(unit.player.wizard,w.cell)) if(bestWebCell == null || bestWebCell.dist > w.dist) bestWebCell = w;
                    }
                    if(bestWebCell) unit.aiControl.target = [bestWebCell.cell[0],bestWebCell.cell[1]];
                }
                else
                {
                    if(mainGoal) unit.aiControl.target = [mainGoal[0],mainGoal[1]];
                }
            }
        }
        if(unit.aiControl.target == null)
        {
            this.pass();
            return;
        }
        else
        {
            if(unit.mapX === unit.aiControl.target[0] && unit.mapY === unit.aiControl.target[1])
            {
                if(unit.config.abilities && unit.features.abilityPoints > 0 && unit.config.name !== "imp")
                {
                    unit.startAbility();
                }
                else if(unit.features.move > 0)
                {
                    let trg = null;
                    for(let dy=-1;dy<=1;dy++)
                        for(let dx=-1;dx<=1;dx++)
                            if(unit.canAtackTo(dx,dy)===true)
                                if(trg == null || randomInt(0,1) === 1) trg = [unit.mapX+dx,unit.mapY+dy];
                    if(trg && unit.features.attackPoints > 0) unit.atackTo(trg[0], trg[1]);
                    else
                    {
                        unit.aiControl.target = null;
                        //this.stepUnit(unit);
                        //this.pass();
                        //+debug
                        if(this.player.control === PlayerControl.computer)this.pass();
                        else return;
                        //-
                    }
                }
                else
                {
                    unit.aiControl.target = null;
                    //this.pass();
                    //+debug
                    if(this.player.control === PlayerControl.computer)this.pass();
                    //-
                    return;
                }
            }
            else
            {
                if(!this.stepToTarget(unit,unit.aiControl.target))
                {
                    unit.aiControl.target = null;
                    //this.pass();
                    //+debug
                    if(this.player.control === PlayerControl.computer)this.pass();
                    else return;
                    //-
                }
            }
        }
    }
  
    computeDistMatrix(unit,stepPlaces,goal,gDMap)
    {
        for(let place of stepPlaces) place.distWeight = 0;
        if(goal == null)return;
        if(gDMap == null) gDMap = this.getDistanceMap(unit,goal[0],goal[1]);
        let b = gDMap[unit.mapY][unit.mapX];
        for(let place of stepPlaces)
        {
            place.distWeight = b - gDMap[place.cell[1]][place.cell[0]];
        }
    }

    computeAtackMatrix(unit,stepPlaces,dmap)
    {
        if(unit.hasState("infected")){
            let targets = selectUnits(unit.mapX, unit.mapY, null, [unit], unit.features.move);
            for (let i = 0; i < stepPlaces.length; i++) {
                let place = stepPlaces[i];
                place.atackWeight = 0;
                let infectVal = 0;
                for (let j = 0; j < targets.length; j++) {
                    let trgt = targets[j];
                    if(place.dist < unit.features.move && Math.abs(trgt.mapX - place.cell[0]) <= 1 && Math.abs(trgt.mapY - place.cell[1]) <= 1) {
                        if(trgt.player !== unit.player){
                            let atackVal = unit.features.strength;
                            if(trgt === trgt.player.wizard) atackVal = atackVal + 10;
                            if(atackVal > place.atackWeight) place.atackWeight = atackVal;
                            if(InfectedState.canInfect(trgt)){
                                infectVal = infectVal + Math.floor(0.5*(trgt.features.strength + trgt.features.defense)*trgt.features.health);
                                if(trgt === trgt.player.wizard) infectVal = infectVal + 10;
                            }
                        }
                        else{
                            if(InfectedState.canInfect(trgt)){
                                if(trgt === unit.player.wizard){
                                    infectVal = infectVal - 100;
                                }
                                else{
                                    infectVal = infectVal - Math.floor(0.5*(trgt.features.strength + trgt.features.defense)*trgt.features.health);
                            
                                }
                            }
                        }
                    }  
                }
                place.atackWeight = place.atackWeight + infectVal;
            }
        }
        else{
            if(dmap == null) dmap = this.getDistanceMap(unit,unit.mapX,unit.mapY);
            let enemies = this.getAvailableEnemies(dmap, unit, unit.features.move);
            let startCost = dmap[unit.mapY][unit.mapX];
            for (let i = 0; i < stepPlaces.length; i++) {
                let place = stepPlaces[i];
                place.atackWeight = 0;
                for (let j = 0; j < enemies.length; j++) {
                    let enemy = enemies[j];
                    if (enemy.player !== unit.player) {
                        if (place.dist < unit.features.move && Math.abs(enemy.mapX - place.cell[0]) <= 1 && Math.abs(enemy.mapY - place.cell[1]) <= 1) {
                            let atackVal = unit.features.strength;
                            if(enemy === enemy.player.wizard) atackVal = atackVal + 10;
                            if(atackVal > place.atackWeight) place.atackWeight = atackVal;                          
                        }
                    }
                }
            }
        }
    }

    computeGasMatrix(unit,stepPlaces)
    {
        if(!unit.config.abilities || !unit.config.abilities.gas)return;
        let range = unit.config.abilities.gas.config.range;
        let gasAbility = abilities[unit.config.abilities[Object.keys(unit.config.abilities)[0]].type];
        for(let i=0;i<stepPlaces.length;i++)
        {
            let place = stepPlaces[i];
            place.gasWeight = 0;
            if(unit.features.abilityPoints === 0) continue;
            let targets = selectUnits(place.cell[0], place.cell[1], null, [unit], range);
            for(let j=0;j<targets.length;j++)
            {
                let trgt = targets[j];
                if(gasAbility.canAtack(unit,trgt))
                {
                    if(trgt.player !== unit.player) 
                    {
                        place.gasWeight = place.gasWeight + unit.config.abilities.gas.config.damage;
                        if(trgt === trgt.player.wizard) place.gasWeight = place.gasWeight + 10;
                    }
                    else if(trgt === unit.player.wizard)
                    {
                        place.gasWeight = -100;
                    }
                    else
                    {
                        place.gasWeight = place.gasWeight - unit.config.abilities.gas.config.damage;
                    }
                }
            }
        }
    }

    computeFireMatrix(unit,stepPlaces)
    {
        if(!unit.config.abilities || !unit.config.abilities.fire)return;
        let range = unit.config.abilities.fire.config.range;
        let fireAbility = abilities[unit.config.abilities[Object.keys(unit.config.abilities)[0]].type];
        for(let i=0;i<stepPlaces.length;i++)
        {
            let place = stepPlaces[i];
            place.fireWeight = 0;
            if(unit.features.abilityPoints === 0) continue;
            let targets = selectUnits(place.cell[0], place.cell[1], null, [unit], range);
            for(let j=0;j<targets.length;j++)
            {
                let trgt = targets[j];
                if(trgt.player !== unit.player)
                {
                    if(fireAbility.canAtack(unit,trgt))
                    {
                        place.fireWeight = place.fireWeight + unit.config.abilities.fire.config.damage;
                        if(trgt === trgt.player.wizard) place.fireWeight = place.fireWeight + 10;
                        break;
                    }
                }
            }
        }
    }

    computeWebMatrix(unit,stepPlaces)
    {
        if(!unit.config.abilities || !unit.config.abilities.web)return;
        let wiz = unit.player.wizard;
        if(wiz != null) {
            if(!wiz.webPlan) wiz.webPlan = this.getWebPlanMap(wiz);
            let webPlan = wiz.webPlan;
            for (let i = 0; i < stepPlaces.length; i++)
            {
                let place = stepPlaces[i];
                place.webWeight = 0;
                for(let w of webPlan)if(place.cell[0] === w.cell[0] && place.cell[1] === w.cell[1])
                {
                    if(Entity.getEntityAtMap(w.cell[0], w.cell[1]) != null) continue;
                    if(this.checkWebCell(wiz,place.cell)) place.webWeight = 1.0/w.dist;
                    break;
                }
            }
        }
        else
        {
            for(let place of stepPlaces) place.webWeight = 0;
        }
    }
  
    computeDangerMatrix(unit,stepPlaces)
    {
        let enemies = this.gePossibleEnemies(unit,stepPlaces);
        for(let place of stepPlaces) place.dangerWeight = 0;
        for(let enemy of enemies)
        {
            let dmap = this.getDistanceMap(enemy,enemy.mapX,enemy.mapY,null,null,null,enemy.config.features.move);
            let startCost = dmap[enemy.mapY][enemy.mapX];
            for(let place of stepPlaces)
            {
                if(dmap[place.cell[1]][place.cell[0]] > -1 && dmap[place.cell[1]][place.cell[0]] - startCost <= enemy.config.features.move) place.dangerWeight = place.dangerWeight + enemy.config.features.strength;
            }
        }
    }
  
    getAttackMap(unit, dmap=null)
    {
        if(dmap == null)dmap = this.getDistanceMap(unit,unit.mapX,unit.mapY,null,null,null,unit.config.features.move); 
        let startCost = dmap[unit.mapY][unit.mapX];
        let attackMap = [];
        for(let i=0;i<map.height;i++) attackMap[i]=[];
        for(let i=0;i<map.height;i++)
            for(let j=0;j<map.width;j++)
                if(dmap[i][j] >=0 && dmap[i][j] <= startCost + unit.config.features.move) attackMap[i][j]=unit.features.strength;
                else attackMap[i][j]=0;
        return attackMap;
    }
  
    computeEnemyAttackMaps()
    {
        for(let pl of players)
        {
            if (pl == this.player)continue;
            for(let unt of pl.units)
            {
                if(!unt.cache) unt.cache = {attackMap: null};
                unt.cache.attackMap = this.getAttackMap(unt);
            }
        }
    }

    stepWizard(unit)
    {
        if(unit.features.abilityPoints > 0)
        {
            if(!unit.aiControl)
            {
                unit.aiControl = {pentagramCreated: false, spell: null, plannedSpell: null, spellFailed: false};
            }
            unit.aiControl.spell = null;
            if(unit.aiControl.spellFailed)
            {
                unit.aiControl.spellFailed = false;
                this.pass();
                return;
            }
            let dmap = this.getDistanceMap(unit,unit.mapX,unit.mapY);
            let enemies = this.getAvailableEnemies(dmap,unit,3);
            if(enemies.length > 0)
            {
                let availableSpells = [];
                for(let spl of Object.keys(unit.abilities.conjure.config.spells)) if (spellConfigs[spl].type === 'summon' && spellConfigs[spl].cost <= unit.features.mana && unit.abilities.conjure.config.spells[spl] != 0) availableSpells.push(spl);
                if(availableSpells.length > 0) unit.aiControl.plannedSpell = spellConfigs[availableSpells[randomInt(0, availableSpells.length - 1)]];
            }
            if(unit.aiControl.plannedSpell == null) {
                if (!unit.aiControl.pentagramCreated && unit.abilities.conjure.config.spells['pentagram']!=0 && randomInt(0,1) === 1) {
                    unit.aiControl.plannedSpell = spellConfigs['pentagram'];
                }
                else {
                    let summonSpells = [];
                    for (let spl of Object.keys(unit.abilities.conjure.config.spells)) if (spellConfigs[spl].type === 'summon' && unit.abilities.conjure.config.spells[spl] != 0) summonSpells.push(spl);
                    //if(unit.player.name === "Player1") unit.aiControl.plannedSpell = spellConfigs['spider'];
                    if(unit.player.name === "player 2") unit.aiControl.plannedSpell = spellConfigs['imp'];
                    //else if(unit.player.name === "player 3") unit.aiControl.plannedSpell = spellConfigs['muddy'];
                    else unit.aiControl.plannedSpell = spellConfigs[summonSpells[randomInt(0, summonSpells.length - 1)]];
                    //if(summonSpells.length > 0) unit.aiControl.plannedSpell = spellConfigs[summonSpells[randomInt(0, summonSpells.length - 1)]];
                }
            }
            if(unit.aiControl.plannedSpell != null)
            {
                if(unit.features.mana >= unit.aiControl.plannedSpell.cost)
                {
                    unit.aiControl.spell = unit.aiControl.plannedSpell;
                    unit.startAbility();
                }
                else
                {
                    this.pass();
                }
            }
            else
            {
                if(!this.stepCommonUnit(unit)) this.pass();  
            }
        }
        else
        {
            this.pass();
        }
    }

    onCastSpell(unit,result)
    {
        if(result)
        {
            if(unit.aiControl.plannedSpell.name === 'pentagram')
            {
                unit.aiControl.pentagramCreated = true;
            }
            unit.aiControl.plannedSpell = null;
        }
        else
        {
            unit.aiControl.spellFailed = true;
        }
    }

    selectSpell(unit)
    {
        if(unit.aiControl && unit.aiControl.spell)
        {
            return unit.aiControl.spell;
        }
        return null;
    }

    selectSummonPlace(unit, places)
    {
        let res = {};
        let i = randomInt(0,places.length-1);
        res.x = places[i][0];
        res.y = places[i][1];
        return res;
    }

    onFire(unit,res)
    {
        if(!res) unit.features.abilityPoints = 0;
    }

    selectFireTarget(unit,targets)
    {
        let res = null;
        if(unit.aiControl && unit.aiControl.action && unit.aiControl.action.type === "fire" && unit.aiControl.action.targetId){
            for(let trg of targets) if(trg.id === unit.aiControl.action.targetId) return trg;
        }
        else{
            targets.forEach(trg => {
                if(trg === trg.player.wizard) return trg;
                if(!res || (trg.features.strength > res.features.strength || (trg.features.strength === res.features.strength && randomInt(0,1) === 1))) res = trg;
            });
        }
        return res;
    }

    selectRocketJumpTarget(unit)
    {
        if(unit.aiControl && unit.aiControl.action && unit.aiControl.action.typeName === "jump"){
            return unit.aiControl.action.params.position;
        }
        return null;
    }

    getNearestEnemyWizard(dMap,unit)
    {
        let wiz = null;
        let dist = 999999999;
        players.forEach(pl => {
            if(pl !== unit.player && pl.wizard)
            {
                if(dMap[pl.wizard.mapY][pl.wizard.mapX] > 0 && dMap[pl.wizard.mapY][pl.wizard.mapX] <= dist)
                {
                    //if(dMap[pl.wizard.mapY][pl.wizard.mapX] < dist || randomInt(0,1) === 1)
                    if(dMap[pl.wizard.mapY][pl.wizard.mapX] < dist)
                    {
                        dist = dMap[pl.wizard.mapY][pl.wizard.mapX];
                        wiz = pl.wizard;
                    }
                }
            }
        });
        return wiz;
    }

    getAvailableEnemies(dMap,unit,dist)
    {
        let startCost = dMap[unit.mapY][unit.mapX];
        let enemies = [];
        players.forEach(pl => {
            if (pl !== unit.player) {
                pl.units.forEach(unt => {
                    if(dMap[unt.mapY][unt.mapX] > 0 && dMap[unt.mapY][unt.mapX] <= startCost + dist) enemies.push(unt);
                });
            }
        });
        return enemies;
    }
  
    gePossibleEnemies(unit,stepPlaces)
    {
        let enemies = [];
        players.forEach(pl => {
            if (pl !== unit.player) {
                for(let enemy of pl.units)
                {
                    for(let place of stepPlaces)
                    {
                        let dX = Math.abs(place.cell[0] - enemy.mapX);
                        let dY = Math.abs(place.cell[1] - enemy.mapY);
                        if (dX * dX + dY * dY <= enemy.config.features.move * enemy.config.features.move)
                        {
                            enemies.push(enemy);
                            break;
                        }
                    }
                }
            }
        });
        return enemies;
    }
  
    getPenaltyMap(unit,aggressionFactor)
    {
        let penaltyMap = [];
        for(let i=0;i<map.height;i++) penaltyMap[i]=[];
        for(let i=0;i<map.height;i++)
            for(let j=0;j<map.width;j++) 
            {
                let x = 0;
                for(let unt of units)
                {
                    if(unt.died || unt.player == this.player)continue;
                    if(unt.cache && unt.cache.attackMap) x = x + unt.cache.attackMap[i][j];
                }
                //unit.features.health
                let unitStr = 0.5*(unit.features.strength + unit.features.defense);
                x = x - aggressionFactor*unitStr;
                if(x<0)x = 0;
                penaltyMap[i][j]=x;
            }
        return penaltyMap;
    }

    getDistanceMap(unit,x,y,onEntity,onUnit,onCell,maxDist=0,penaltyMap=null)
    {
        let distMap = [];
        for(let i=0;i<map.height;i++) distMap[i]=[];
        for(let i=0;i<map.height;i++)
            for(let j=0;j<map.width;j++) distMap[i][j]=-1;
        let startCost = 0;
        let border = [[x,y,startCost]];
        distMap[y][x] = startCost;
        let cellInd = [];
        for(let i=0;i<map.height;i++) cellInd[i]=[];
        while(border.length > 0)
        {
            let border2 = [];
            for(let i=0;i<map.height;i++)
                for(let j=0;j<map.width;j++)if(cellInd[i][j] >= 0)cellInd[i][j]=-1;
            for(let k=0;k<border.length;k++)
            {
                let cell = border[k];
                cellInd[cell[1]][cell[0]] = -10;
            }
            while(border.length > 0)
            {
                let cell = border.pop();
                for(let yy=cell[1]-1; yy<=cell[1]+1; yy++)
                    for(let xx=cell[0]-1; xx<=cell[0]+1; xx++)
                    {
                        if((xx<0)||(xx>=map.width)||(yy<0)||(yy>=map.height)||( (xx===cell[0])&&(yy===cell[1])))continue;
                        if(cellInd[yy][xx] < -1)continue;
                        let d = 1;
                        let wallTile = wallsLayer.getTileAt(xx,yy);
                        if(wallTile != null) continue;
                        let unt = getUnitAtMap(xx, yy, unit.player);
                        if(unt != null && unt.died == false) {
                            if(onUnit) {
                                if(onUnit(unt) === false) continue;
                            }
                            else{
                                if(unt.player === unit.player) d = d + unit.config.features.move;
                                else d = d + unt.config.features.health * unit.config.features.move;
                            }
                        }
                        let entity = Entity.getEntityAtMap(xx, yy);
                        if(entity != null) {
                            if(onEntity) {
                                if(onEntity(entity) === false) continue;
                            }
                            else{
                                d = d + Math.floor(entity.evaluateStep(unit)+0.5) * unit.config.features.move;
                            }
                        }
                        if(onCell){
                            if(onCell([xx,yy]) === false) continue;
                        }
                        if(penaltyMap){
                            d = d + penaltyMap[yy][xx];
                        }
                        if(distMap[yy][xx] > -1 && cell[2]+d >= distMap[yy][xx]) continue;
                        if(maxDist > 0 && cell[2]+d > startCost + maxDist) continue;
                        if(cellInd[yy][xx] >= 0) border2[cellInd[yy][xx]][2] = cell[2]+d;
                        else{
                            border2.push([xx,yy,cell[2]+d]);
                            cellInd[yy][xx] = border2.length-1;
                        }
                        distMap[yy][xx] = cell[2]+d;
                    }
            }
            border = border2;
        }
        return distMap;
    }
  
    getBaseCost(dMap,x,y)
    {
        let baseCost = dMap[y][x];
        for(let yy=y-1; yy<=y+1; yy++)
            for(let xx=x-1; xx<=x+1; xx++)
            {
                if((xx<0)||(xx>=map.width)||(yy<0)||(yy>=map.height)||((xx===x)&&(yy===y)))continue;
                if(dMap[yy][xx] < 0) continue;
                let c = dMap[yy][xx]+1;
                if(c < baseCost) baseCost = c;
            }
        return baseCost;
    }

    getOptimalStep(dMap,targetCell, startCell)
    {
        let dist = 999999999;
        let cell = [targetCell[0],targetCell[1]];
        while(true)
        {
            let cell2 = [cell[0],cell[1]];
            let dist2 = dist;
            for(let yy=cell[1]-1; yy<=cell[1]+1; yy++)
                for(let xx=cell[0]-1; xx<=cell[0]+1; xx++)
                {
                    if((xx<0)||(xx>=map.width)||(yy<0)||(yy>=map.height)||( (xx===cell[0])&&(yy===cell[1])))continue;
                    if(dMap[yy][xx] > -1)
                    {
                        if(dMap[yy][xx] < dist2 || (dMap[yy][xx] === dist2 && randomInt(0,1) === 1))
                        {
                            dist2 = dMap[yy][xx];
                            cell2 = [xx, yy];
                            if(cell2[0] == startCell[0] && cell2[1] == startCell[1]) return cell;
                        }
                    }
                }
            if(dist2 < dist)
            {
                cell = [cell2[0],cell2[1]];
                dist = dist2;
            }
            else return null;
        }
    }

    getAvailableCells(dMap,unit,bypassEntities,bypassUnits)
    {
        let startCost = dMap[unit.mapY][unit.mapX];
        let cells = [{cell:[unit.mapX,unit.mapY],dist:0}];
        let range = unit.features.move;
        for(let yy=unit.mapY-range; yy<=unit.mapY+range; yy++)
            for(let xx=unit.mapX-range; xx<=unit.mapX+range; xx++)
            {
                if((xx<0)||(xx>=map.width)||(yy<0)||(yy>=map.height)||( (xx===unit.mapX)&&(yy===unit.mapY)))continue;
                if(bypassEntities)
                {
                    if(Entity.getEntityAtMap(xx,yy) != null)continue;
                }
                if(bypassUnits)
                {
                    if(getUnitAtMap(xx,yy) != null)continue;
                }
                //if(dMap[yy][xx] > -1 && dMap[yy][xx] <= startCost + range) cells.push({cell:[xx,yy],dist:(dMap[yy][xx]-startCost)});
              if(dMap[yy][xx] > -1) cells.push({cell:[xx,yy],dist:(dMap[yy][xx]-startCost)});
            }
        return cells;
    }

    getWebPlanMap(wizard)
    {
        let res = [];
        const minR = 3;
        const maxR = 10;
        let r = maxR;
        for (let y = wizard.mapY - r; y <= wizard.mapY + r; y++) {
            for (let x = wizard.mapX - r; x <= wizard.mapX + r; x++) {
                if((x < 0) || (x >= map.width) || (y < 0) || (y >= map.height) || ((x === wizard.mapX) && (y === wizard.mapY))) continue;
                if(Entity.getEntityAtMap(x, y) != null) continue;
                let wallTile = wallsLayer.getTileAt(x, y);
                if (wallTile != null) continue;
                let dX = Math.abs(x - wizard.mapX);
                let dY = Math.abs(y - wizard.mapY);
                let dr = dX*dX + dY*dY;
                if(dr > maxR * maxR) continue;
                if(dr <= minR * minR) continue;
                if (checkLineOfSight(wizard.mapX, wizard.mapY, x, y, null, null, function(){return true;}) === true) res.push({cell: [x, y], dist: dr});
            }
        }
        return res;
    }

    checkWebCell(wizard,cell)
    {
        let dMapBefore = this.getDistanceMap(wizard,wizard.mapX,wizard.mapY,function(ent){return false;},function(unt){return true;},null);
        let dMapAfter = this.getDistanceMap(wizard,wizard.mapX,wizard.mapY,function(ent){return false;},function(unt){return true;},function(c){
            return !(c[0] === cell[0] && c[1] === cell[1]);
        });
        for(let yy=cell[1]-1; yy<=cell[1]+1; yy++)
            for(let xx=cell[0]-1; xx<=cell[0]+1; xx++)
            {
                if((xx<0)||(xx>=map.width)||(yy<0)||(yy>=map.height)||( (xx===cell[0])&&(yy===cell[1])))continue;
                if(dMapBefore[yy][xx] > -1){
                    if(dMapAfter[yy][xx] < 0) return false;
                    if(dMapAfter[yy][xx] - dMapBefore[yy][xx] > 5) return false;
                }
            }
        return true;
    }
  
    getPatrolArea(wizard)
    {
        let res = [];
        const minR = 2;
        const maxR = 5;
        let r = maxR;
        for (let y = wizard.mapY - r; y <= wizard.mapY + r; y++) {
            for (let x = wizard.mapX - r; x <= wizard.mapX + r; x++) {
                if((x < 0) || (x >= map.width) || (y < 0) || (y >= map.height) || ((x === wizard.mapX) && (y === wizard.mapY))) continue;
                if(Entity.getEntityAtMap(x, y) != null) continue;
                let wallTile = wallsLayer.getTileAt(x, y);
                if (wallTile != null) continue;
                let dX = Math.abs(x - wizard.mapX);
                let dY = Math.abs(y - wizard.mapY);
                let dr = dX*dX + dY*dY;
                if(dr > maxR * maxR) continue;
                if(dr <= minR * minR) continue;
                if (checkLineOfSight(wizard.mapX, wizard.mapY, x, y, null, null, function(){return true;}) === true) res.push({cell: [x, y], dist: dr});
            }
        }
        return res;
    }
  
    choosePatrolTarget(unit)
    {
        if(unit.player && unit.player.wizard && !unit.player.wizard.died && unit.player.wizard.patrolArea){
            let possibleCells = unit.player.wizard.patrolArea.filter(p => (Entity.getEntityAtMap(p.cell[0], p.cell[1]) == null) && (getUnitAtMap(p.cell[0], p.cell[1]) == null));
            let trgt = null;
            if(possibleCells.length > 0)trgt = possibleCells[randomInt(0, possibleCells.length - 1)];
            if(trgt) this.setMainTarget(unit,null,[trgt.cell[0],trgt.cell[1]],"patrol",2);
        }
    }
  
    computeEnemiesInfo()
    {
        if(this.player.wizard){
            let maxDist = 10;
            let maxTurns = 3;
            for(let pl of players){
                if (pl == this.player)continue;
                if(pl.wizard == null || pl.wizard.died)continue;
                let closeUnits = [];
                let distantUnits = [];
                for(let unt of pl.units){
                    if(Math.abs(unt.mapX - pl.wizard.mapX) <= maxDist && Math.abs(unt.mapY - pl.wizard.mapY) <= maxDist){                 
                        let dMap = this.getDistanceMap(unt,unt.mapX,unt.mapY);
                        let startCost = dMap[unt.mapY][unt.mapX];
                        let distToWiz = this.getBaseCost(dMap,pl.wizard.mapX,pl.wizard.mapY);
                        if(dMap[pl.wizard.mapY][pl.wizard.mapX] > 0 && distToWiz <= startCost + maxDist){
                            let turns = Math.ceil((distToWiz - startCost) / unt.config.features.move);
                            if(turns <= maxTurns){
                                closeUnits.push(unt);
                                continue;
                            }
                        }
                    }
                    distantUnits.push(unt);
                }
                if(!pl.Info) pl.Info = {sumStr: 0, closeStr: 0};
                let sumCloseStrength = 0;
                for(const unt of closeUnits) sumCloseStrength += 0.5*(unt.features.strength + unt.features.defense) * unt.features.health;
                let sumDistantStrength = 0;
                for(const unt of distantUnits) sumDistantStrength += 0.5*(unt.features.strength + unt.features.defense) * unt.features.health;
                pl.Info.sumStr = sumCloseStrength + sumDistantStrength;
                pl.Info.closeStr = sumCloseStrength;
            }
        }
    }
  
    planning()
    {
        console.log("planning");  
        let wizard = this.player.wizard;
        this.computeEnemiesInfo();
        console.log("Players stats:");
        for(let pl of players)if(pl.Info)console.log(pl.name + ": " + pl.Info.closeStr + "(" + pl.Info.sumStr + ")");
        for(const unit of this.player.units){
            if(unit.aiControl && unit.aiControl.order && unit.aiControl.order == "attack" && unit.aiControl.mainTarget != null && !unit.aiControl.mainTarget.died)continue;
            this.setMainTarget(unit,null,null,null,null);
        }
        if(wizard && !wizard.died){
            //Note: можно проверить текущее и прошлое положение волшебника и если оно не имзменилось, то не пересчитывать webPlan и patrolArea
            wizard.webPlan = this.getWebPlanMap(wizard);
            wizard.patrolArea = this.getPatrolArea(wizard);
            //Compute enemies
            let maxDist = 10;
            let maxTurns = 3;
            let enemies = [];
            for(let i=0;i<maxTurns;i++)enemies[i] = [];
            //+ simple way
            /*
            let dMap = this.getDistanceMap(wizard,wizard.mapX,wizard.mapY,function(ent){return true;},function(unt){return true;},null);
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
                    if(Math.abs(unt.mapX - wizard.mapX) > maxDist || Math.abs(unt.mapY - wizard.mapY) > maxDist) continue;
                    let dMap = this.getDistanceMap(unt,unt.mapX,unt.mapY);
                    let startCost = dMap[unt.mapY][unt.mapX];
                    let distToWiz = this.getBaseCost(dMap,wizard.mapX,wizard.mapY);
                    if(dMap[wizard.mapY][wizard.mapX] > 0 && distToWiz <= startCost + maxDist){
                        let turns = Math.ceil((distToWiz - startCost) / unt.config.features.move);
                        if(turns <= maxTurns)enemies[turns-1].push(unt);
                    }
                }
            }
            let threats = [];
            let distantThreats = [];
            if(!this.distantThreats) this.distantThreats = [];
            this.distantThreats = this.distantThreats.filter(unt => !unt.died);
            //Threats estimation for defense
            for (let turns = 0; turns < enemies.length; turns++) {
                enemies[turns].forEach(enemy => {
                    if(distantThreats.includes(enemy))distantThreats.splice(distantThreats.indexOf(enemy),1);
                    threats.push({
                        enemy,
                        turns: turns+1,
                        threatLevel: 0.5*(enemy.features.strength + enemy.features.defense) * enemy.features.health * (enemies.length - turns)
                    });
                });
            }
            distantThreats = this.distantThreats.map(u => {
                let x = {enemy:u, turns: 2, threatLevel: 1};
                return x;
            });
            //Sort enemies by threat level (from highest)
            threats.sort((a, b) => b.threatLevel - a.threatLevel);
            distantThreats.sort((a, b) => b.threatLevel - a.threatLevel);
            this.threats = threats;
            //assign targets
            this.assignTargets(threats); 
            this.assignTargets(distantThreats); 
            //choose targets for units which doesn't have main target
            let freeunits = this.player.units.filter(unt => unt.aiControl.mainTarget == null && unt!=this.player.wizard);
            let sumStrength = 0;
            for(const unit of freeunits) sumStrength += 0.5*(unit.features.strength + unit.features.defense) * unit.features.health;
            console.log("Attack strength: " + sumStrength);
            //Check for attack opportunity
            if(sumStrength >= 10){
                let victims = players.filter(pl => pl != this.player && pl.wizard && !pl.wizard.died && pl.Info && pl.Info.closeStr < sumStrength);
                if(victims.length > 0){
                    let distToVictim = [];
                    let capableUnits = [];
                    for(let i = 0; i < victims.length; i++){
                        distToVictim[i] = 0;
                        capableUnits[i] = 0;
                    }
                    for(const unit of freeunits){
                        let dmap = this.getDistanceMap(unit,unit.mapX,unit.mapY);
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
                        for(const unit of freeunits) this.setMainTarget(unit,targetVictim.wizard,[targetVictim.wizard.mapX,targetVictim.wizard.mapY],"attack",10);
                    }
                    //update list of units which don't have main target
                    freeunits = this.player.units.filter(unt => unt.aiControl.mainTarget == null && unt!=this.player.wizard);
                }
            }
            //If there are units left that do not have a main goal, then we assign them patrol or defense
            if(freeunits.lenght > 0){
                for(const unit of freeunits){
                    if(this.threats.length > 0) this.chooseTargetThreat(unit,this.threats);
                    if(unit.aiControl.mainTarget == null) this.choosePatrolTarget(unit);
                }
            }
        }
        else{
        //If no wizard or wizard died
            for(const unit of this.player.units){
                let dmap = this.getDistanceMap(unit,unit.mapX,unit.mapY);
                let trgtWiz = this.getNearestEnemyWizard(dmap,unit);
                if(trgtWiz)this.setMainTarget(unit,trgtWiz,[trgtWiz.mapX,trgtWiz.mapY],"attack",10);
            }
        }
    }
  
    /*
    assignTargets(threats)
    {
        //Prepare list of available units
        let activeUnits = [];
        for(const unit of this.player.units){
            if(unit != this.player.wizard){
                activeUnits.push({
                    unit,
                    assigned: false,
                    dmap: this.getDistanceMap(unit,unit.mapX,unit.mapY,null,function(unt){return true;})  
                });
            }
        }
        //Distribute units for defense
        for(const threat of threats){
            //Available units sorted by optimal distribution between attack and defense
            console.log("threat: " + threat.enemy.config.name + " turns: " + threat.turns);
            let logStr = "";
            for(let u of activeUnits) logStr = logStr + u.unit.config.name + " ";
            console.log(" - activeUnits: " + logStr);
            const nearestUnits = activeUnits
            .filter(unt => !unt.assigned)
            .map(unt => {
                let target = null;
                if(unt.unit.aiControl && unt.unit.aiControl.order && unt.unit.aiControl.order == "attack" && unt.unit.aiControl.mainTarget != null && !unt.unit.aiControl.mainTarget.died) target = unt.unit.mainTarget;
                let x = {
                attacker: unt,  
                distanceToEnemy: this.getBaseCost(unt.dmap,threat.enemy.mapX,threat.enemy.mapY) - unt.dmap[unt.unit.mapY][unt.unit.mapX],
                distanceToTarget: (target != null) ? this.getBaseCost(unt.dmap,target.mapX,target.mapY) - unt.dmap[unt.unit.mapY][unt.unit.mapX] : 9999999,
                distanceToOwnWizard: (unt.unit.player.wizard != null) ? this.getBaseCost(unt.dmap,unt.unit.player.wizard.mapX,unt.unit.player.wizard.mapY) - unt.dmap[unt.unit.mapY][unt.unit.mapX] : 9999999
                };
                return x;
            })
            .filter(unt => unt.distanceToOwnWizard <= (threat.turns + 2) * unt.attacker.unit.config.features.move )
            .sort((a, b) => {
                const aAttackPriority = a.distanceToTarget < a.distanceToOwnWizard;
                const bAttackPriority = b.distanceToTarget < b.distanceToOwnWizard;
                if(aAttackPriority && !bAttackPriority) return 1;
                if(!aAttackPriority && bAttackPriority) return -1;
                return a.distanceToEnemy - b.distanceToEnemy;
            });          
            logStr = "";
            for(let u of nearestUnits) logStr = logStr + u.attacker.unit.config.name + "(" + u.distanceToEnemy + "," + u.distanceToTarget + "," + u.distanceToOwnWizard + ") ";
            console.log(" - nearestUnits: " + logStr);
            //Assign units to the enemy
            let totalStrength = 0;
            let enemyStr = 0.5*(threat.enemy.features.strength + threat.enemy.features.defense) * threat.enemy.features.health; 
            for(const { attacker } of nearestUnits) {
                totalStrength += 0.5*(attacker.unit.features.strength + attacker.unit.features.defense) * attacker.unit.features.health;
                attacker.assigned = true;
                this.setMainTarget(attacker.unit,threat.enemy,[threat.enemy.mapX,threat.enemy.mapY],"intercept",10);
                console.log("    - " + attacker.unit.config.name + " target: " + threat.enemy.config.name);
                if (totalStrength >= enemyStr) break;
            }          
        }       
    }
    */
  
    assignTargets(threats)
    {
        //Prepare list of available units
        let activeUnits = [];
        for(const unit of this.player.units){
            if(unit != this.player.wizard){
                activeUnits.push({
                    unit,
                    assigned: false,
                    dmap: this.getDistanceMap(unit,unit.mapX,unit.mapY,null,function(unt){return true;})  
                });
            }
        }
        //Distribute units for defense
        for(const threat of threats){
            //Available units sorted by optimal distribution between attack and defense
            console.log("threat: " + threat.enemy.config.name + " turns: " + threat.turns);
            let logStr = "";
            for(let u of activeUnits) logStr = logStr + u.unit.config.name + " ";
            console.log(" - activeUnits: " + logStr);
            const nearestUnits = activeUnits
            .filter(unt => !unt.assigned)
            .map(unt => {
                let target = null;
                if(unt.unit.aiControl && unt.unit.aiControl.order && unt.unit.aiControl.order == "attack" && unt.unit.aiControl.mainTarget != null && !unt.unit.aiControl.mainTarget.died) target = unt.unit.mainTarget;
                let x = {
                attacker: unt,  
                distanceToEnemy: this.getBaseCost(unt.dmap,threat.enemy.mapX,threat.enemy.mapY) - unt.dmap[unt.unit.mapY][unt.unit.mapX],
                distanceToTarget: (target != null) ? this.getBaseCost(unt.dmap,target.mapX,target.mapY) - unt.dmap[unt.unit.mapY][unt.unit.mapX] : 9999999,
                };
                return x;
            })
            .filter(unt => unt.distanceToEnemy <= (threat.turns + 2) * unt.attacker.unit.config.features.move )
            .sort((a, b) => {
                const aAttackPriority = a.distanceToTarget < a.distanceToEnemy;
                const bAttackPriority = b.distanceToTarget < b.distanceToEnemy;
                if(aAttackPriority && !bAttackPriority) return 1;
                if(!aAttackPriority && bAttackPriority) return -1;
                return a.distanceToEnemy - b.distanceToEnemy;
            });          
            logStr = "";
            for(let u of nearestUnits) logStr = logStr + u.attacker.unit.config.name + "(" + u.distanceToEnemy + "," + u.distanceToTarget + ") ";
            console.log(" - nearestUnits: " + logStr);
            //Assign units to the enemy
            let totalStrength = 0;
            let enemyStr = 0.5*(threat.enemy.features.strength + threat.enemy.features.defense) * threat.enemy.features.health; 
            for(const { attacker } of nearestUnits) {
                totalStrength += 0.5*(attacker.unit.features.strength + attacker.unit.features.defense) * attacker.unit.features.health;
                attacker.assigned = true;
                this.setMainTarget(attacker.unit,threat.enemy,[threat.enemy.mapX,threat.enemy.mapY],"intercept",10);
                console.log("    - " + attacker.unit.config.name + " target: " + threat.enemy.config.name);
                if (totalStrength >= enemyStr) break;
            }          
        }       
    }
  
    chooseTargetThreat(unit,threats)
    {
        if(threats != null && threats.length > 0){
            let dmap = this.getDistanceMap(unit,unit.mapX,unit.mapY,null,function(unt){return true;}) 
            let bestThreat = null;
            let bestScore = 999999999;
            for(const threat of threats){
                if(threat.enemy.died)continue;
                //Choose nearest threat
                let score = dmap[threat.enemy.mapY][threat.enemy.mapX];
                if(score < bestScore){
                    bestScore = score;
                    bestThreat = threat;
                }
            }
            if(bestThreat != null)this.setMainTarget(unit,bestThreat.enemy,[bestThreat.enemy.mapX,bestThreat.enemy.mapY],"intercept",10);
            else this.setMainTarget(unit,null,null,null,null);
        }
    }
  
    setMainTarget(unit,target,targetPos,order,agression)
    {
        if(!unit.aiControl)
        {
            unit.aiControl = {mainTarget: null, order: null, agression: 2};
        }
        unit.aiControl.mainTarget = target;
        unit.aiControl.mainTargetPos = targetPos;
        unit.aiControl.order = order;
        unit.aiControl.agression = agression;
    }
  
}