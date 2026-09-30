//---------------------------- AIControl class ----------------------------

class AIControl
{
    player = null;
	availableUnits = null;
	passStage = 1;
	normalPassStages = 3;
	maxPassStages = 12;
	currentUnit = null;
	traffic = null;
	threats = null;
	distantThreats = null;
	detectedInvisibleUnits = null;
	invisibleMemoryTurns = 2;
	threatSystem = null;
	tacticalPlannerOptions = {maxDepth:5,beamWidth:16,maxMoveCandidates:10,maxJumpCandidates:10};

    constructor(player)
    {
        this.player = player;
        this.traffic = new AITrafficController(this);
        this.detectedInvisibleUnits = new Map();
        this.threatSystem = new AIThreatSystem(this);
    }

	// Invisible units are known only after adjacent detection and remain remembered for a few future turns.
	isInvisibleUnit(unit)
	{
		if(typeof isUnitInvisible === 'function') return isUnitInvisible(unit);
		return unit != null && unit.features != null && unit.features.invisible === true;
	}

	isUnitKnown(unit)
	{
		if(unit == null || unit.died) return false;
		if(unit.player === this.player) return true;
		if(!this.isInvisibleUnit(unit))
		{
			this.detectedInvisibleUnits.delete(unit);
			return true;
		}
		return this.detectedInvisibleUnits.has(unit);
	}

	canStillAct(unit)
	{
		return unit != null && !unit.died && unit.features != null &&
			(unit.features.move > 0 || unit.features.abilityPoints > 0);
	}

	rememberInvisibleUnit(unit)
	{
		if(unit == null || unit.died || unit.player === this.player || !this.isInvisibleUnit(unit)) return false;
		const isNew = !this.detectedInvisibleUnits.has(unit);
		this.detectedInvisibleUnits.set(unit,this.invisibleMemoryTurns);
		if(isNew) console.log('AI detected invisible unit: ' + (unit.config ? unit.config.name : unit.id));
		return isNew;
	}

	updateInvisibleMemory()
	{
		for(const [unit,turns] of this.detectedInvisibleUnits)
		{
			if(unit == null || unit.died || !this.isInvisibleUnit(unit))
			{
				this.detectedInvisibleUnits.delete(unit);
				continue;
			}
			const nextTurns = turns - 1;
			if(nextTurns < 0) this.detectedInvisibleUnits.delete(unit);
			else this.detectedInvisibleUnits.set(unit,nextTurns);
		}
	}

	detectAdjacentInvisibleUnits(observer)
	{
		if(observer == null || observer.died) return false;
		let discovered = false;
		for(const target of units)
		{
			if(target == null || target.died || target.player === this.player || !this.isInvisibleUnit(target)) continue;
			const adjacent = typeof canSeeInvisibleUnit === 'function'
				? canSeeInvisibleUnit(observer,target)
				: Math.abs(observer.mapX-target.mapX) <= 1 && Math.abs(observer.mapY-target.mapY) <= 1;
			if(adjacent && this.rememberInvisibleUnit(target)) discovered = true;
		}
		return discovered;
	}

	detectAdjacentInvisibleUnitsForPlayer()
	{
		let discovered = false;
		for(const unit of this.player.units)
			if(this.detectAdjacentInvisibleUnits(unit)) discovered = true;
		return discovered;
	}

	// A new contact invalidates tactical choices. Strategic replanning preserves valid attack orders.
	replanAfterInvisibleDetection()
	{
		this.threatSystem.invalidateAll();
		this.computeEnemyAttackMaps();
		this.planning(true);
	}

	startTurn()
	{
        GameFlowWatchdog.beginPhase('ai_turn',{
            player:this.player ? this.player.name : null,
            independent:this.player ? this.player.isIndependent === true : false
        });

        if(this.player.units.length === 0)
		{
			setTimeout(endTurn,1);
			return;
		}
		this.traffic.startTurn();
		this.threatSystem.startTurn();
		this.updateInvisibleMemory();
		this.detectAdjacentInvisibleUnitsForPlayer();
		this.availableUnits = [];
		for(let i=this.player.units.length-1;i>=0;i--) this.availableUnits.push(this.player.units[i]);
		this.computeEnemyAttackMaps();
		this.planning(false);
		this.passStage = 1;
		this.currentUnit = null;
		this.pass(true);
	}

    pass(force=false)
	{
        GameFlowWatchdog.touch('ai_pass',{
            player:this.player ? this.player.name : null,
            stage:this.passStage,
            available:this.availableUnits ? this.availableUnits.length : 0
        });

        if(!force && this.currentUnit != null && this.traffic.beforePass(this.currentUnit)) return;
		this.currentUnit = null;
		if(this.availableUnits.length > 0)
		{
			let unit = this.availableUnits.pop();
			if(!unit || unit.died)
			{
				this.pass(true);
				return;
			}
			this.currentUnit = unit;
			selectUnit(unit);
			this.step(unit);
			return;
		}
		if(this.passStage < this.maxPassStages)
		{
			this.passStage++;
			for(let i=this.player.units.length-1;i>=0;i--)
			{
				let unit = this.player.units[i];
				if(!unit || unit.died) continue;
				if(this.passStage <= this.normalPassStages)
				{
					if(unit.features.move > 0 || unit.features.abilityPoints > 0) this.availableUnits.push(unit);
				}
				else if(this.traffic.needsActivation(unit)) this.availableUnits.push(unit);
			}
			this.pass(true);
			return;
		}
		setTimeout(endTurn,1);
	}

    step(unit)
	{
        if(unit && unit.aiControl && unit.aiControl.aiTestStopAfterAction === true)
        {
            unit.aiControl.aiTestStopAfterAction = false;
            if(typeof AITest !== 'undefined') AITest.onActionComplete(unit);
            return;
        }

        GameFlowWatchdog.touch('ai_step',{
            player:this.player ? this.player.name : null,
            unitId:unit ? unit.id : null,
            unit:unit && unit.config ? unit.config.name : null,
            stage:this.passStage,
            x:unit ? unit.mapX : null,
            y:unit ? unit.mapY : null
        });

		if(unit.died)
		{
			this.pass(true);
			return;
		}
		if(this.passStage <= this.normalPassStages && this.detectAdjacentInvisibleUnits(unit))
			this.replanAfterInvisibleDetection();
		if(this.passStage > this.normalPassStages)
		{
			const handled = this.traffic.stepOnly(unit);
			if(handled !== true)
			{
				console.error('AI traffic step was not handled',{
					unitId:unit.id,
					unit:unit.config ? unit.config.name : null,
					stage:this.passStage,
					traffic:unit.aiTraffic
				});

				GameFlowWatchdog.touch('traffic_step_unhandled',{
					unitId:unit.id,
					unit:unit.config ? unit.config.name : null,
					stage:this.passStage
				});

				this.pass(true);
			}
			return;
		}
		if(this.traffic.beforeStep(unit)) return;
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
		let cell = this.getOptimalStep(dmap,target,[unit.mapX,unit.mapY]);
		if(cell == null) return false;
		let dx = cell[0] - unit.mapX;
		let dy = cell[1] - unit.mapY;
		if(unit.canStepTo(dx,dy))
		{
			this.traffic.beforeNormalStep(unit,cell);
			unit.stepTo(cell[0],cell[1]);
			return true;
		}
		if(unit.canAtackTo(dx,dy))
		{
			unit.atackTo(cell[0],cell[1]);
			return true;
		}
		const blocker = getUnitAtMap(cell[0],cell[1]);
		if(blocker != null && blocker.player === unit.player)
		{
			this.traffic.onFriendlyBlock(unit,cell,blocker);
			return true;
		}
		return false;
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

	ensureUnitAIControl(unit)
	{
		if(!unit.aiControl)
		{
			unit.aiControl = {target: null};
		}
		return unit.aiControl;
	}

	getAITestOverride(unit)
	{
		const ai=this.ensureUnitAIControl(unit),o=ai.aiTestOverride;
		return o&&o.enabled===true?o:null;
	}

	getTacticalGoalFromState(unit,state)
	{
		if(state&&state.target&&!state.target.died)return[state.target.mapX,state.target.mapY];
		if(state&&state.targetPos)return[state.targetPos[0],state.targetPos[1]];
		return[unit.mapX,unit.mapY];
	}

	getTrafficPriority(unit)
	{
		if(unit == null) return 0;
		if(unit === this.player.wizard)
		{
			const ents = Entity.getEntitiesAtMap(unit.mapX,unit.mapY);
			if(ents.some(ent => ent.config && ent.config.name === 'pentagram')) return 100;
			return 70;
		}
		const order = unit.aiControl ? unit.aiControl.order : null;
		if(order === 'intercept') return 80;
		if(order === 'attack') return 60;
		if(order === 'patrol') return 10;
		return 40;
	}

	getCurrentMainGoal(unit)
	{
		this.ensureUnitAIControl(unit);
		if(unit.aiControl.mainTarget)
		{
			if(unit.aiControl.mainTarget.died || !this.isUnitKnown(unit.aiControl.mainTarget))
			{
				this.setMainTarget(unit, null, null, null, null);
				return null;
			}
			return [unit.aiControl.mainTarget.mapX, unit.aiControl.mainTarget.mapY];
		}
		if(unit.aiControl.mainTargetPos)
		{
			return [unit.aiControl.mainTargetPos[0], unit.aiControl.mainTargetPos[1]];
		}
		return null;
	}

	chooseNewMainGoal(unit)
	{
		let mainGoal = null;
		if(unit.player.wizard && !unit.player.wizard.died)
		{
			if(this.threats && this.threats.length > 0)
			{
				this.chooseTargetThreat(unit, this.threats);
			}
			if(unit.aiControl.mainTarget)
			{
				mainGoal = [unit.aiControl.mainTarget.mapX, unit.aiControl.mainTarget.mapY];
			}
			else
			{
				this.choosePatrolTarget(unit);
				if(unit.aiControl.mainTargetPos)
				{
					mainGoal = [unit.aiControl.mainTargetPos[0], unit.aiControl.mainTargetPos[1]];
				}
			}
		}
		else
		{
			let dmap = this.getDistanceMap(unit, unit.mapX, unit.mapY);
			let trgtWiz = this.getNearestEnemyWizard(dmap, unit);
			if(trgtWiz)
			{
				this.setMainTarget(unit, trgtWiz, [trgtWiz.mapX, trgtWiz.mapY], "attack", 10);
				mainGoal = [trgtWiz.mapX, trgtWiz.mapY];
			}
		}
		return mainGoal;
	}

	getMainGoal(unit)
	{
		this.ensureUnitAIControl(unit);
		let mainGoal = this.getCurrentMainGoal(unit);
		if(mainGoal == null)
		{
			mainGoal = this.chooseNewMainGoal(unit);
		}
		if(mainGoal == null)
		{
			mainGoal = [unit.mapX, unit.mapY];
		}
		return mainGoal;
	}

    getTacticalProfile(unit, aiState = null)
    {
        const ai = aiState || this.ensureUnitAIControl(unit);
        if(ai.profile && ai.profile !== 'auto' && AI_TACTICAL_PROFILES[ai.profile]) return ai.profile;
        if(ai.tacticalProfile && AI_TACTICAL_PROFILES[ai.tacticalProfile]) return ai.tacticalProfile;
        if(ai.order === 'intercept')
        {
            const turns = ai.threatTurns;
            if(turns != null && turns <= 1) return 'critical';
            if(turns != null && turns <= 2) return 'aggressive';
            if(turns != null && turns <= 3) return 'balanced';
            return 'cautious';
        }
        if(ai.order === 'patrol') return 'cautious';
        return 'balanced';
    }

    stepUnit(unit)
    {
        const ai = this.ensureUnitAIControl(unit);
        ai.target = null;

        const testOverride=this.getAITestOverride(unit);
        const tacticalState=testOverride||ai;
        const mainGoal=testOverride?this.getTacticalGoalFromState(unit,testOverride):this.getMainGoal(unit);
        const profile=this.getTacticalProfile(unit,tacticalState);
        const order=tacticalState.order||null;
        const planner=new AITurnPlanner(this,unit,mainGoal,{...this.tacticalPlannerOptions,profile,order});
        const result = planner.plan();
        const action = result.actions && result.actions.length ? result.actions[0] : null;
        const testTag=testOverride?' [TEST]':'';

        if(action == null)
        {
            console.log(unit.config.name + ' ' + (order || 'none') + ' [' + profile + ']' + testTag + ' hold: no progressing tactical action');
            this.pass();
            return;
        }

        console.log(unit.config.name + ' ' + (order || 'none') + ' [' + profile + ']' + testTag + ' plan: ' + result.actions.map(a => a.label || a.type).join(' -> ') + ' score=' + result.score.toFixed(2));
        this.executeTacticalAction(unit,action);
    }

    executeTacticalAction(unit,action,options={})
    {
        const singleStep = options.singleStep === true;
        const fail = () => {
            if(singleStep)
            {
                if(unit && unit.aiControl) unit.aiControl.aiTestStopAfterAction = false;
                if(typeof AITest !== 'undefined') AITest.onActionComplete(unit);
                return;
            }
            this.pass();
        };
        const retry = () => singleStep ? fail() : this.step(unit);

        if(action == null)
        {
            fail();
            return;
        }

        switch(action.type)
        {
            case 'move':
                if(!this.stepToTarget(unit,action.to)) fail();
                return;

            case 'attack':
                if(action.target && !action.target.died && unit.canAtackTo(action.target.mapX-unit.mapX,action.target.mapY-unit.mapY))
                {
                    unit.atackTo(action.target.mapX,action.target.mapY);
                    return;
                }
                retry();
                return;

            case 'fire':
                if(action.target == null || action.target.died)
                {
                    retry();
                    return;
                }
                unit.aiControl.action = {type:'fire',targetId:action.target.id};
                if(!unit.startAbility('fire')){unit.aiControl.action=null;fail();}
                return;

            case 'gas':
                if(!unit.startAbility('gas')) fail();
                return;

            case 'web':
                if(!unit.startAbility('web')) fail();
                else this.threatSystem.invalidateAll();
                return;

            case 'jump':
                unit.aiControl.action = {typeName:'jump',params:{position:{x:action.to[0],y:action.to[1]}}};
                if(!unit.startAbility('jump')){unit.aiControl.action=null;fail();}
                return;
        }

        fail();
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
        for(const place of stepPlaces) place.atackWeight = 0;
        if(unit.features.attackPoints <= 0) return;
        const infected = unit.hasState('infected');
        for(const place of stepPlaces)
        {
            if(place.dist >= unit.features.move) continue;
            let bestAttack = 0, infectionValue = 0;
            for(const target of units)
            {
                if(target == null || target.died || target === unit) continue;
                if(Math.abs(target.mapX-place.cell[0])>1 || Math.abs(target.mapY-place.cell[1])>1) continue;
                if(target.player !== unit.player && !this.isUnitKnown(target)) continue;
                if(target.player !== unit.player)
                    bestAttack = Math.max(bestAttack,AICombatValue.expectedDamageValue(target,unit.features.strength||1));
                if(infected && InfectedState.canInfect(target))
                {
                    const value = AICombatValue.unitValue(target);
                    infectionValue += target.player === unit.player ? -value : value;
                }
            }
            place.atackWeight = bestAttack + infectionValue;
        }
    }

    computeGasMatrix(unit,stepPlaces)
    {
        if(!unit.config.abilities || unit.features.abilityPoints <= 0) return;
        const gas = Object.values(unit.config.abilities).find(a => a && a.type === 'gas');
        if(gas == null) return;
        const range = gas.config.range || 0, damage = gas.config.damage || 1;
        for(const place of stepPlaces)
        {
            place.gasWeight = 0;
            for(const target of units)
            {
                if(target == null || target.died || target === unit || target.features.gasImmunity) continue;
                if(target.player !== unit.player && !this.isUnitKnown(target)) continue;
                const dx=target.mapX-place.cell[0],dy=target.mapY-place.cell[1];
                if(dx*dx+dy*dy > range*range) continue;
                const value = AICombatValue.expectedDamageValue(target,damage);
                place.gasWeight += target.player === unit.player ? -value : value;
            }
        }
    }

    computeFireMatrix(unit,stepPlaces)
    {
        if(!unit.config.abilities || unit.features.abilityPoints <= 0) return;
        const fire = Object.values(unit.config.abilities).find(a => a && a.type === 'fire');
        if(fire == null) return;
        const range = fire.config.range || 0, damage = fire.config.damage || 1;
        for(const place of stepPlaces)
        {
            place.fireWeight = 0;
            for(const target of units)
            {
                if(target == null || target.died || target.player === unit.player || !this.isUnitKnown(target)) continue;
                const dx=target.mapX-place.cell[0],dy=target.mapY-place.cell[1];
                if(dx*dx+dy*dy > range*range) continue;
                if(!checkLineOfSight(place.cell[0],place.cell[1],target.mapX,target.mapY,null,null,u => u===unit ? true : false)) continue;
                place.fireWeight = Math.max(place.fireWeight,AICombatValue.expectedDamageValue(target,damage));
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
        this.threatSystem.syncDynamicBlockers();
        for(const place of stepPlaces)
            place.dangerWeight = this.threatSystem.getDangerAt(unit,place.cell[0],place.cell[1]);
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
        // Threat maps are built lazily per relevant enemy and cached in AIThreatSystem.
        this.threatSystem.syncDynamicBlockers();
    }

    stepWizard(unit)
    {
        if (unit.features.abilityPoints <= 0) {
            this.pass();
            return;
        }

        if (!unit.aiControl) {
            unit.aiControl = {
                pentagramCreated: false,
                spell: null,
                plannedSpell: null,
                spellFailed: false
            };
        }

        unit.aiControl.spell = null;

        if (unit.aiControl.spellFailed) {
            unit.aiControl.spellFailed = false;
            this.pass();
            return;
        }

        let state = GameState.createFrom(units, entities, wallsLayer); 
        const expectedIncome = state.getAvgManaIncome(unit.player.name);
        const currentUpkeep = state.getManaUpkeep(unit.player.name);

        //function checks "can we afford summon?"
        const canAffordSummon = (spellCfg) => {
            if (spellCfg.type !== 'summon') return true;
            const creatureCfg = unitConfigs[spellCfg.id];
            if (!creatureCfg || !creatureCfg.features) return true;
            const upkeep = creatureCfg.features.manaUpkeep || 0;
            if (upkeep === 0) return true;
            return (currentUpkeep + upkeep) + 0.5 <= expectedIncome;
        };
        
        let dmap = this.getDistanceMap(unit, unit.mapX, unit.mapY);
        let enemies = this.getAvailableEnemies(dmap, unit, 3);

        // List of allowed summon spells with correct upkeep
        const getAffordableSummonSpells = () => {
            const list = [];
            for (let spl of Object.keys(unit.abilities.conjure.config.spells)) {
                if(!spellConfigs[spl]) continue;
                if(spellConfigs[spl].type !== 'summon') continue;
                if(unit.abilities.conjure.config.spells[spl] === 0) continue;
                if (!canAffordSummon(spellConfigs[spl])) continue;
                list.push(spl);
            }
            return list;
        };

        let affordableSummons = getAffordableSummonSpells();
        // if enemys are near, try to summon something first
        if (enemies.length > 0 && affordableSummons.length > 0) {
            const affordableNow = affordableSummons.filter(spl => spellConfigs[spl].cost < unit.features.mana);
            if (affordableNow.length > 0) {
                const chosen = affordableNow[randomInt(0, affordableNow.length - 1)];
                unit.aiControl.plannedSpell = spellConfigs[chosen];
            }
        }
        // if no plan yet, try to plan pentagram or something else
        if (!unit.aiControl.plannedSpell) {
            if (!unit.aiControl.pentagramCreated && unit.abilities.conjure.config.spells['pentagram'] != 0 && randomInt(0, 1) === 1) {
                unit.aiControl.plannedSpell = spellConfigs['pentagram'];
            }
            else {
                // summon something random
                if (affordableSummons.length > 0) {
                    /*
                    if(unit.player.name === "player 1") {
                        if(affordableSummons.includes('demon')) unit.aiControl.plannedSpell = spellConfigs['demon'];
                        else if(unit.abilities.conjure.config.spells['pentagram'] != 0) unit.aiControl.plannedSpell = spellConfigs['pentagram'];
                        else {
                            this.pass();
                            return;
                        }
                    }
                    else {
                        const chosen = affordableSummons[randomInt(0, affordableSummons.length - 1)];
                        unit.aiControl.plannedSpell = spellConfigs[chosen];
                    }
                    */
                    const chosen = affordableSummons[randomInt(0, affordableSummons.length - 1)];
                    unit.aiControl.plannedSpell = spellConfigs[chosen];
                }
            }
        }
        // check if we can cast planned spell
        if (unit.aiControl.plannedSpell) {

            if (unit.features.mana >= unit.aiControl.plannedSpell.cost) {
                unit.aiControl.spell = unit.aiControl.plannedSpell;
                unit.startAbility(unit.abilities.conjure.type);
            }
            else {
                this.pass();
            }
        }
        else {
            // no spell planned, proceed as normal unit
            if (!this.stepCommonUnit(unit)) this.pass();
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
            for(let trg of targets) if(trg.id === unit.aiControl.action.targetId && this.isUnitKnown(trg)){unit.aiControl.action=null;return trg;}
        }
        else{
            targets.forEach(trg => {
                if(!this.isUnitKnown(trg)) return;
                if(trg === trg.player.wizard) return trg;
                if(!res || AICombatValue.expectedDamageValue(trg,unit.config.abilities.fire.config.damage) > AICombatValue.expectedDamageValue(res,unit.config.abilities.fire.config.damage)) res = trg;
            });
        }
        return res;
    }

    selectRocketJumpTarget(unit)
    {
        if(unit.aiControl && unit.aiControl.action && unit.aiControl.action.typeName === "jump"){
            const pos = unit.aiControl.action.params.position;
            unit.aiControl.action = null;
            return pos;
        }
        return null;
    }

    getNearestEnemyWizard(dMap,unit)
    {
        let wiz = null;
        let dist = 999999999;
        players.forEach(pl => {
            if(pl !== unit.player && pl.wizard && this.isUnitKnown(pl.wizard))
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
                    if(!this.isUnitKnown(unt)) return;
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
                    if(!this.isUnitKnown(enemy)) continue;
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
        this.threatSystem.syncDynamicBlockers();
        const penaltyMap = [];
        for(let y=0;y<map.height;y++)
        {
            penaltyMap[y]=[];
            for(let x=0;x<map.width;x++) penaltyMap[y][x]=this.threatSystem.getDangerAt(unit,x,y);
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
                for(let j=0;j<map.width;j++)
                    if(cellInd[i][j] >= 0) cellInd[i][j]=-1;
            for(let k=0;k<border.length;k++)
            {
                let cell = border[k];
                cellInd[cell[1]][cell[0]]=-10;
            }
            while(border.length > 0)
            {
                let cell = border.pop();
                for(let yy=cell[1]-1;yy<=cell[1]+1;yy++)
                    for(let xx=cell[0]-1;xx<=cell[0]+1;xx++)
                    {
                        if(xx<0 || xx>=map.width || yy<0 || yy>=map.height || (xx===cell[0] && yy===cell[1])) continue;
                        if(cellInd[yy][xx] < -1) continue;
                        let d = 1;
                        let wallTile = wallsLayer.getTileAt(xx,yy);
                        if(wallTile != null && wallTile.properties['collides'] === true) continue;
                        let unt = getUnitAtMap(xx,yy,unit.player);
                        if(unt != null && unt.died == false)
                        {
                            if(onUnit)
                            {
                                if(onUnit(unt) === false) continue;
                            }
                            else
                            {
                                if(unt.player === unit.player) d += unit.config.features.move;
                                else d += unt.config.features.health*unit.config.features.move;
                            }
                        }
                        let entity = Entity.getEntityAtMap(xx,yy);
                        if(entity != null)
                        {
                            if(onEntity)
                            {
                                if(onEntity(entity) === false) continue;
                            }
                            else
                            {
                                const stepCost = entity.evaluateStep(unit);
                                if(stepCost === false) continue;
                                d += Math.floor(stepCost+0.5)*unit.config.features.move;
                            }
                        }
                        if(onCell && onCell([xx,yy]) === false) continue;
                        if(penaltyMap) d += penaltyMap[yy][xx];
                        if(distMap[yy][xx] > -1 && cell[2]+d >= distMap[yy][xx]) continue;
                        if(maxDist > 0 && cell[2]+d > startCost+maxDist) continue;
                        if(cellInd[yy][xx] >= 0)
                        {
                            border2[cellInd[yy][xx]][2]=cell[2]+d;
                        }
                        else
                        {
                            border2.push([xx,yy,cell[2]+d]);
                            cellInd[yy][xx]=border2.length-1;
                        }
                        distMap[yy][xx]=cell[2]+d;
                    }
            }
            border=border2;
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
                if (wallTile != null && wallTile.properties['collides'] === true) continue;
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
                if (wallTile != null && wallTile.properties['collides'] === true) continue;
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
                    if(!this.isUnitKnown(unt)) continue;
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
                for(const unt of closeUnits) sumCloseStrength += AICombatValue.unitValue(unt);
                let sumDistantStrength = 0;
                for(const unt of distantUnits) sumDistantStrength += AICombatValue.unitValue(unt);
                pl.Info.sumStr = sumCloseStrength + sumDistantStrength;
                pl.Info.closeStr = sumCloseStrength;
            }
        }
    }
  
    planning(midTurn=false)
    {
        console.log(midTurn ? "replanning" : "planning");
        let wizard = this.player.wizard;
        this.computeEnemiesInfo();
        console.log("Players stats:");
        for(let pl of players)if(pl.Info)console.log(pl.name + ": " + pl.Info.closeStr + "(" + pl.Info.sumStr + ")");
        for(const unit of this.player.units){
            if(midTurn && !this.canStillAct(unit)) continue;
            const unitAI = this.ensureUnitAIControl(unit);
            if(midTurn)
            {
                unitAI.target = null;
                unitAI.plan = null;
                unitAI.action = null;
            }
            if(unitAI.order == "attack" && unitAI.mainTarget != null && !unitAI.mainTarget.died && this.isUnitKnown(unitAI.mainTarget)) continue;
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
                    if(!this.isUnitKnown(unt)) continue;
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
            this.distantThreats = this.distantThreats.filter(unt => !unt.died && this.isUnitKnown(unt));
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
            distantThreats = this.distantThreats.map(u => {
                let x = {enemy:u, turns: 2, threatLevel: AICombatValue.unitValue(u)};
                return x;
            });
            //Sort enemies by threat level (from highest)
            threats.sort((a, b) => b.threatLevel - a.threatLevel);
            distantThreats.sort((a, b) => b.threatLevel - a.threatLevel);
            this.threats = threats;
            //assign targets
            this.assignTargets(threats,midTurn);
            this.assignTargets(distantThreats,midTurn);
            //choose targets for units which doesn't have main target
            let freeunits = this.player.units.filter(unt => unt!=this.player.wizard && this.ensureUnitAIControl(unt).mainTarget == null && (!midTurn || this.canStillAct(unt)));
            let sumStrength = 0;
            for(const unit of freeunits) sumStrength += AICombatValue.unitValue(unit);
            console.log("Attack strength: " + sumStrength);
            //Check for attack opportunity
            if(sumStrength >= 10){
                let victims = players.filter(pl => pl != this.player && pl.wizard && !pl.wizard.died && this.isUnitKnown(pl.wizard) && pl.Info && pl.Info.closeStr < sumStrength);
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
                    freeunits = this.player.units.filter(unt => unt!=this.player.wizard && this.ensureUnitAIControl(unt).mainTarget == null && (!midTurn || this.canStillAct(unt)));
                }
            }
            //If there are units left that do not have a main goal, then we assign them patrol or defense
            if(freeunits.length > 0){
                for(const unit of freeunits){
                    if(this.threats.length > 0) this.chooseTargetThreat(unit,this.threats);
                    if(unit.aiControl.mainTarget == null) this.choosePatrolTarget(unit);
                }
            }
        }
        else{
        //If no wizard or wizard died
            for(const unit of this.player.units){
                if(midTurn && !this.canStillAct(unit)) continue;
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
            let enemyStr = AICombatValue.unitValue(threat.enemy);
            for(const { attacker } of nearestUnits) {
                totalStrength += AICombatValue.unitValue(attacker.unit);
                attacker.assigned = true;
                this.setMainTarget(attacker.unit,threat.enemy,[threat.enemy.mapX,threat.enemy.mapY],"intercept",10);
                attacker.unit.aiControl.threatTurns = threat.turns;
                console.log("    - " + attacker.unit.config.name + " target: " + threat.enemy.config.name);
                if (totalStrength >= enemyStr) break;
            }          
        }       
    }
    */
  
    assignTargets(threats,midTurn=false)
    {
        //Prepare list of available units
        let activeUnits = [];
        for(const unit of this.player.units){
            if(unit != this.player.wizard && (!midTurn || this.canStillAct(unit))){
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
                if(unt.unit.aiControl && unt.unit.aiControl.order && unt.unit.aiControl.order == "attack" && unt.unit.aiControl.mainTarget != null && !unt.unit.aiControl.mainTarget.died && this.isUnitKnown(unt.unit.aiControl.mainTarget)) target = unt.unit.aiControl.mainTarget;
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
            let enemyStr = AICombatValue.unitValue(threat.enemy);
            for(const { attacker } of nearestUnits) {
                totalStrength += AICombatValue.unitValue(attacker.unit);
                attacker.assigned = true;
                this.setMainTarget(attacker.unit,threat.enemy,[threat.enemy.mapX,threat.enemy.mapY],"intercept",10);
                attacker.unit.aiControl.threatTurns = threat.turns;
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
                if(threat.enemy.died || !this.isUnitKnown(threat.enemy))continue;
                //Choose nearest threat
                let score = dmap[threat.enemy.mapY][threat.enemy.mapX];
                if(score < bestScore){
                    bestScore = score;
                    bestThreat = threat;
                }
            }
            if(bestThreat != null){this.setMainTarget(unit,bestThreat.enemy,[bestThreat.enemy.mapX,bestThreat.enemy.mapY],"intercept",10);unit.aiControl.threatTurns=bestThreat.turns;}
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
        if(order !== "intercept") unit.aiControl.threatTurns = null;
    }
  
}