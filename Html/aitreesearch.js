class GameState {

    constructor(unitsData = [], entitiesData = [], wallsLayer = null, sharedCache = null) {
        this.unitsData = unitsData; 
        this.entitiesData = entitiesData;
        this.wallsLayer = wallsLayer;

        // if sharedCache is provided, use it; otherwise, create a new one
        this._distanceMapCache = sharedCache ?? new Map(); // unitId -> distMap
    }

    static createFrom(units, entities, wallsLayer) {
        const unitsData = units.map(u => u.serialize());
        const entitiesData = entities.map(e => e.serialize());
        return new GameState(unitsData, entitiesData, wallsLayer);
    }

    clone(useSharedCache = false) {
        const clonedUnitsData = clone(this.unitsData);
        const clonedEntitiesData = clone(this.entitiesData);
        const newCache = useSharedCache ? this._distanceMapCache : null;
        return new GameState(clonedUnitsData, clonedEntitiesData, this.wallsLayer, newCache);
    }

    clearCache() {
        this._distanceMapCache.clear();
    }

    get mapWidth() {
        return this.wallsLayer ? this.wallsLayer.tilemap.width : 0;
    }

    get mapHeight() {
        return this.wallsLayer ? this.wallsLayer.tilemap.height : 0;
    }

    getUnitsByPlayer(player){
        return this.unitsData.filter(u => u.playerName === player.name);
    }

    getEnemyUnits(player) {
        return this.unitsData.filter(u => u.playerName !== player.name);
    }

    getUnitAt(x, y) {
        return this.unitsData.find(u => u.mapX === x && u.mapY === y);
    }

    getEntityAt(x, y) {
        return this.entitiesData.find(e => e.mapX === x && e.mapY === y);
    }

    static hasState(unit, stateName) {
        if (!unit || !unit.states) return false;
        return unit.states.some(s => s.name === stateName);
    }

    getAvailableActionsForUnit(unit) {
        let actions = [];

        for (const actionType of ActionRegistry.getAll()) {
            if (actionType.isGlobal) {
                actions = actions.concat(actionType.generateActions(this, unit));
            }
        }

        for (const abilityName in unit.abilities) {
            const ability = unit.abilities[abilityName];
            const actionType = ActionRegistry.get(ability.type);
            if (actionType) {
                actions = actions.concat(
                    actionType.generateActions(this, unit, ability.config)
                );
            }
        }

        return actions;
    }

    selectUnits(centerMapX, centerMapY, playerArr, unitArr, radius) {
        let arr = [];
        let res = [];
        if (playerArr == null) {
            arr = this.unitsData;
        } else {
            playerArr.forEach(pl => {
                arr = arr.concat(this.getUnitsByPlayer(pl));
            });
        }
        arr.forEach(unit => {
            let fl = true;
            if (unitArr != null) {
                if (unitArr.includes(unit.id)) fl = false; // filter of excluded units
            }
            if (fl) {
                if (radius > 0) {
                    let dX = Math.abs(unit.mapX - centerMapX);
                    let dY = Math.abs(unit.mapY - centerMapY);
                    if (dX * dX + dY * dY <= radius * radius) {
                        res.push(unit);
                    }
                } else {
                    if ((Math.abs(unit.mapX - centerMapX) <= 1) && (Math.abs(unit.mapY - centerMapY) <= 1)) {
                        res.push(unit);
                    }
                }
            }
        });
        return res;
    }

    checkLineOfSight(x1, y1, x2, y2, onWall, onEntity, onUnit) {
        if (x1 === x2 && y1 === y2) return true;
        let xx1 = x1;
        let xx2 = x2;
        let yy1 = y1;
        let yy2 = y2;
        let invFlag = false;
        if (Math.abs(y2 - y1) > Math.abs(x2 - x1)) {
            invFlag = true;
            xx1 = y1;
            xx2 = y2;
            yy1 = x1;
            yy2 = x2;
        }
        let k = (yy2 - yy1) / (xx2 - xx1);
        let b = yy1 - k * xx1;
        let dx = 1;
        if (xx2 < xx1) dx = -1;
        for (let x = xx1 + dx; x !== xx2; x = x + dx) {
            let y = Math.round(k * x + b);
            let resX = x;
            let resY = y;
            if (invFlag) {
                resX = y;
                resY = x;
            }
            // check unit
            let unit = this.getUnitAt(resX, resY);
            if (unit != null) {
                if (onUnit) {
                    if (onUnit(unit) === false) return false;
                } else return false;
            }
            // check entity
            let entity = this.entitiesData.find(e => e.mapX === resX && e.mapY === resY);
            if (entity != null) {
                if (onEntity) {
                    if (onEntity(entity) === false) return false;
                } else return false;
            }
            // check wall
            if (this.wallsLayer) {
                let wallTile = this.wallsLayer.getTileAt(resX, resY);
                if (wallTile != null) {
                    if (onWall) {
                        if (onWall(wallTile) === false) return false;
                    } else return false;
                }
            }
        }
        return true;
    }

    evaluateStepFromEntity(unit, entity) {
        if(entity.configName == "web"){
            if(unit.features.webImmunity === true)
            {
                return 0;
            }
            else
            {
                return (unit.features.strength + this.features.strength)/unit.features.strength;
            }    
        }
        else if(entity.configName == "fire"){
            return 100;
        }
        else if(entity.configName == "glue_blob"){
            return (unit.features.strength + this.features.strength)/unit.features.strength;
        }
        else return 0;
    }

    getDistanceMap(unit, startX, startY, onEntity, onUnit, onCell, maxDist = 0, penaltyMap = null) {
        const distMap = Array.from({ length: this.mapHeight }, () => Array(this.mapWidth).fill(-1));
        const cellInd = Array.from({ length: this.mapHeight }, () => Array(this.mapWidth).fill(-1));
        let startCost = 0;
        let border = [[startX, startY, startCost]];
        distMap[startY][startX] = startCost;
        while (border.length > 0) {
            let border2 = [];
            for (let cell of border) {
                cellInd[cell[1]][cell[0]] = -10;
            }
            while (border.length > 0) {
                const cell = border.pop();
                for (let yy = cell[1] - 1; yy <= cell[1] + 1; yy++) {
                    for (let xx = cell[0] - 1; xx <= cell[0] + 1; xx++) {
                        if (xx < 0 || xx >= this.mapWidth || yy < 0 || yy >= this.mapHeight) continue;
                        if (xx === cell[0] && yy === cell[1]) continue;
                        if (cellInd[yy][xx] < -1) continue;
                        let d = 1;
                        // walls
                        let wallTile = this.wallsLayer ? this.wallsLayer.getTileAt(xx, yy) : null;
                        if (wallTile != null) continue;
                        // units
                        let unt = this.getUnitAt(xx, yy);
                        if (unt != null && !unt.died) {
                            if (onUnit) {
                                if (onUnit(unt) === false) continue;
                            } else {
                                if (unt.playerName === unit.playerName) {
                                    d += unitConfigs[unit.configName].features.move;
                                } else {
                                    // it is better to change this value according to expectations of time to kill enemy unit
                                    d += unitConfigs[unt.configName].features.health * unitConfigs[unit.configName].features.move;
                                }
                            }
                        }
                        // entities
                        let entity = this.getEntityAt(xx, yy);
                        if (entity != null) {
                            if (onEntity) {
                                if (onEntity(entity) === false) continue;
                            } else {
                                d += Math.floor(this.evaluateStepFromEntity(unit, entity) * unitConfigs[unit.configName].features.move + 0.5);
                            }
                        }
                        if (onCell && onCell([xx, yy]) === false) continue;
                        if (penaltyMap) {
                            d += penaltyMap[yy][xx];
                        }
                        const newDist = cell[2] + d;
                        if (distMap[yy][xx] > -1 && newDist >= distMap[yy][xx]) continue;
                        if (maxDist > 0 && newDist > startCost + maxDist) continue;
                        if (cellInd[yy][xx] >= 0) {
                            border2[cellInd[yy][xx]][2] = newDist;
                        } else {
                            border2.push([xx, yy, newDist]);
                            cellInd[yy][xx] = border2.length - 1;
                        }
                        distMap[yy][xx] = newDist;
                    }
                }
            }
            border = border2;
        }
        return distMap;
    }

    getDistanceMapCached(unit, startX, startY) {
        const posKey = `${startX},${startY}`;
        const cacheKey = `${unit.id}@${posKey}`;
        if (!this._distanceMapCache.has(cacheKey)) {
            const distMap = this.getDistanceMap(unit,startX,startY, null, null, null, 0, null);
            this._distanceMapCache.set(cacheKey, distMap);
        }
        return this._distanceMapCache.get(cacheKey);
    }

    getBaseCost(dMap,x,y){
        let baseCost = dMap[y][x];
        for(let yy=y-1; yy<=y+1; yy++)
            for(let xx=x-1; xx<=x+1; xx++)
            {
                if((xx<0)||(xx>=this.mapWidth)||(yy<0)||(yy>=this.mapHeight)||((xx===x)&&(yy===y)))continue;
                if(dMap[yy][xx] < 0) continue;
                let c = dMap[yy][xx]+1;
                if(c < baseCost) baseCost = c;
            }
        return baseCost;
    }

    getCellDanger(x, y, playerName, ignoreUnits = []) {
        let danger = 0;
        for (const enemy of this.unitsData) {
            if (enemy.playerName === playerName || ignoreUnits.includes(enemy)) continue;
            const distMap = this.getDistanceMapCached(enemy, enemy.mapX, enemy.mapY);
            const dist = distMap[y]?.[x];
            if (dist == null || dist < 0) continue;
            const moveRange = unitConfigs[enemy.configName].features.move;
            // melee attacks
            if (dist <= moveRange) {
                danger += enemy.features.strength;
            }
            // ranged attacks
            if (enemy.abilities) {
                for (const abilityName in enemy.abilities) {
                    const ability = enemy.abilities[abilityName];
                    if(ability.config.range){
                        const abilityRange = ability.config.range;
                        if(Math.abs(enemy.mapX - x) > moveRange + abilityRange || Math.abs(enemy.mapY - y) > moveRange + abilityRange) continue;           
                        for (let yy = Math.max(0, enemy.mapY - moveRange); yy <= Math.min(this.mapHeight - 1, enemy.mapY + moveRange); yy++) {
                            for (let xx = Math.max(0, enemy.mapX - moveRange); xx <= Math.min(this.mapWidth - 1, enemy.mapY + moveRange); xx++) {
                                const dist = distMap[yy]?.[xx];
                                if (dist < 0 || dist > moveRange) continue;
                                const dx = xx - x;
                                const dy = yy - y;
                                const distSq = dx * dx + dy * dy;
                                if (distSq <= abilityRange * abilityRange) {
                                    if(ability.type === "fire" && !this.checkLineOfSight(xx, yy, x, y)) continue;
                                    danger += ability.config.damage;
                                }
                            }
                        }
                    }    
                }
            }
        }
        return danger;
    }
    
}


class Action {
    constructor(typeName, params = {}) {
        this.typeName = typeName;
        this.params = params;
    }

    getName() {
        return `${this.typeName} ${JSON.stringify(this.params)}`;
    }
}

class ActionType {
    constructor(name, isGlobal = false) {
        this.name = name;
        this.isGlobal = isGlobal;
    }

    generateActions(state, unit, abilityConfig = null) {
        throw new Error("generateActions must be implemented");
    }

    apply(state, action, evaluator = null) {
        throw new Error("apply must be implemented");
    }
}


class ActionRegistry {
    static actionTypes = new Map();

    static register(actionType) {
        this.actionTypes.set(actionType.name, actionType);
    }

    static get(name) {
        return this.actionTypes.get(name);
    }

    static getAll() {
        return Array.from(this.actionTypes.values());
    }
}

//-------- ActionType implementations --------
class StopActionType extends ActionType {
    constructor() {
        super("stop", true);
    }

    generateActions(state, unit) {
        if (unit.features.move <= 0 && (!unit.abilities || unit.features.abilityPoints <= 0)) return [];
        return [ new Action(this.name, { unitId: unit.id }) ];
    }

    apply(state, action, evaluator = null) {
        const unit = state.unitsData.find(u => u.id === action.params.unitId);
        if (!unit) return;
        unit.features.move = 0;
        unit.features.attackPoints = 0;
        unit.features.abilityPoints = 0;
    }
}

class MoveActionType extends ActionType {
    constructor() {
        super("move", true);
    }

    canStepTo(state, unit, x, y) {
        if(unit.features.move <= 0)return false;
        if((x<0)||(x>=map.width)||(y<0)||(y>=map.height))return false;
        let unitAtPos = state.getUnitAt(x, y);
        if(unitAtPos!=null)return false;
        let wallTile = wallsLayer.getTileAt(x, y);
        if(wallTile != null)
        {
            if(wallTile.properties['collides'] === true)
            {
                return false;
            }
        }
        return true;
    }

    generateActions(state, unit) {
        const actions = [];
        if(unit.features.move <= 0)return actions;
        const possibleTiles = [
            {x: unit.mapX+1, y: unit.mapY},
            {x: unit.mapX-1, y: unit.mapY},
            {x: unit.mapX,   y: unit.mapY+1},
            {x: unit.mapX,   y: unit.mapY-1},
            {x: unit.mapX+1, y: unit.mapY+1},
            {x: unit.mapX-1, y: unit.mapY-1},
            {x: unit.mapX+1, y: unit.mapY-1},
            {x: unit.mapX-1, y: unit.mapY+1}
        ];
        for (const tile of possibleTiles) {
            if (this.canStepTo(state, unit, tile.x, tile.y)) {
                actions.push(new Action(this.name, {
                    unitId: unit.id,
                    startPosition: { x: unit.mapX, y: unit.mapY },
                    endPosition: tile,
                }));
            }
        }
        return actions;
    }

    apply(state, action, evaluator = null) {
        const unit = state.unitsData.find(u => u.id === action.params.unitId);
        if (unit) {
            // Check if can step out from current tile
            /*
            checkEntityStepOut()
            {
                let canStep = true;
                let ent = Entity.getEntityAtMap(unit.mapX,unit.mapY);
                if(ent != null)
                {
                    canStep = ent.onStepOut(unit);
                }
                return canStep;
            }
            if(checkEntityStepOut()) {
            */
            unit.mapX = action.params.endPosition.x;
            unit.mapY = action.params.endPosition.y;
            unit.features.move -= 1;
            if(unit.features.move < 0)unit.features.move = 0;
            // 
            if (evaluator) {
                if(GameState.hasState(unit, "infected")){
                    //evaluator.addDamageDealt(expectedDamage);
                }
            }
            //
            /*
            let ent = Entity.getEntityAtMap(unit.mapX,unit.mapY);
            if(ent != null)
            {
                let result = ent.onStepIn(unit);
                if(result != null)
                {
            */
        }
    }
}


class AttackActionType extends ActionType {
    constructor() {
        super("attack", true);
    }

    canAtackTo(state, unit, x, y) {
        if(unit.features.move <= 0 || unit.features.attackPoints <= 0)return false;
        if((x<0)||(x>=map.width)||(y<0)||(y>=map.height))return false;
        let unitAtPos = state.getUnitAt(x, y);
        if(unitAtPos==null)return false;
        if(unit.playerName!==unitAtPos.playerName)return true;
        return false;
    }

    generateActions(state, unit) {
        const actions = [];
        if(unit.features.move <= 0 || unit.features.attackPoints <= 0)return actions;
        const possibleTiles = [
            {x: unit.mapX+1, y: unit.mapY},
            {x: unit.mapX-1, y: unit.mapY},
            {x: unit.mapX,   y: unit.mapY+1},
            {x: unit.mapX,   y: unit.mapY-1},
            {x: unit.mapX+1, y: unit.mapY+1},
            {x: unit.mapX-1, y: unit.mapY-1},
            {x: unit.mapX+1, y: unit.mapY-1},
            {x: unit.mapX-1, y: unit.mapY+1}
        ];
        for (const tile of possibleTiles) {
            if (this.canAtackTo(state, unit, tile.x, tile.y)) {
                actions.push(new Action(this.name, {
                    unitId: unit.id,
                    position: tile
                }));
            }
        }
        return actions;
    }

    apply(state, action, evaluator = null) {
        const unit = state.unitsData.find(u => u.id === action.params.unitId);
        if (unit) {
            // Check if can step out from current tile
            /*
            if(checkEntityStepOut()) {
            */
            unit.features.move = unit.features.move - unit.features.attackCost;
            if(unit.features.move < 0)unit.features.move = 0;
            unit.features.attackPoints--;
            if(unit.features.attackPoints < 0)unit.features.attackPoints = 0;
            let enemyUnit = state.getUnitAt(action.params.position.x, action.params.position.y);
            //
            /*
            let damaged = false;
            let killed = false;
            let performStandardCalculation = true;
            let enemyHealth = enemyUnit.features.health;
            if(this.config.atack_features != null)if(Object.keys(this.config.atack_features).length > 0)
            {
                for(let i=0; i<Object.keys(this.config.atack_features).length; i++)
                {
                    let atackFeature = atackFeatures[this.config.atack_features[Object.keys(this.config.atack_features)[i]].type];
                    performStandardCalculation = atackFeature.onAtack(this,enemyUnit);
                    if(enemyUnit.features.health < enemyHealth) damaged = true;
                    if(enemyUnit.features.health <= 0)
                    {
                        killed = true;
                        break;
                    }
                }
            }
            if(performStandardCalculation && !killed)
            {
                let curFeatures = unit.getCurrentFeatures();
                let enemyCurrentFeatures = enemyUnit.getCurrentFeatures();
            */
            let curFeatures = unit.features;
            let enemyCurrentFeatures = enemyUnit.features;
            const chance = curFeatures.strength/(curFeatures.strength + enemyCurrentFeatures.defense);
            const expectedDamage = Math.round(chance * 100) / 100;
            enemyUnit.features.health -= expectedDamage;
            if (evaluator) {
                evaluator.addDamageDealt(expectedDamage, enemyUnit.id);
            }
            // remove enemy unit from state if killed
            if(enemyUnit.features.health <= 0){
                if (evaluator) {
                    evaluator.addUnitKilled(enemyUnit.id);
                }
                state.unitsData = state.unitsData.filter(u => u.id !== enemyUnit.id);
            }
        }
    }
}


class FireActionType extends ActionType {
    constructor() {
        super("fire", false);
    }

    generateActions(state, unit, abilityConfig) {
        const actions = [];
        if (unit.features.abilityPoints <= 0) return actions;
        if (!unit.abilities || !unit.abilities.fire) return actions;
        const range = unit.abilities.fire.config.range;
        const targets = state.selectUnits(unit.mapX, unit.mapY, null, [unit.id], range);
        for (let target of targets) {
            if (target.playerName !== unit.playerName) {
                const hasLOS = state.checkLineOfSight(unit.mapX, unit.mapY, target.mapX, target.mapY);
                if (hasLOS) {
                    actions.push(new Action(this.name, {
                        unitId: unit.id,
                        targetId: target.id
                    }));
                }
            }
        }
        return actions;
    }

    apply(state, action, evaluator = null) {
        const unit = state.unitsData.find(u => u.id === action.params.unitId);
        const target = state.unitsData.find(u => u.id === action.params.targetId);
        if (!unit || !target) return;
        unit.features.abilityPoints = Math.max(0, unit.features.abilityPoints - 1);
        const ability = unit.abilities.fire;
        const enemyCurrentFeatures = target.features; 
        const chance = ability.config.damage / (ability.config.damage + enemyCurrentFeatures.defense);
        const expectedDamage = Math.round(chance * 100) / 100;
        target.features.health -= expectedDamage;
        if (evaluator) {
            evaluator.addDamageDealt(expectedDamage, target.id);
        }
        // remove target if killed
        if (target.features.health <= 0) {
            if (evaluator) {
                evaluator.addUnitKilled(target, target.id);
            }
            state.unitsData = state.unitsData.filter(u => u.id !== target.id);
        }
    }
}

//--------- Evaluator --------
class Evaluator {
    constructor(initialState, playerName, unitId) {
        this.playerName = playerName;
        this.unitId = unitId;

        // cumulated metrics
        this.damageDealt = 0;
        this.damageTaken = 0;
        this.unitsLost = 0;

        // damage by unit : { unitId: damage }
        this.damageByUnit = {};
        // array of killed units ids
        this.unitsKilled = [];

        this.initialState = initialState.clone();
    }

    clone() {
        const cloned = new Evaluator(this.initialState, this.playerName, this.unitId);
        cloned.damageDealt = this.damageDealt;
        cloned.damageTaken = this.damageTaken;
        cloned.unitsLost = this.unitsLost;
        cloned.damageByUnit = { ...this.damageByUnit };
        cloned.unitsKilled = [...this.unitsKilled];
        return cloned;
    }

    addDamageDealt(amount, targetUnitId = null) {
        this.damageDealt += amount;
        if (targetUnitId) {
            if (!this.damageByUnit[targetUnitId]) {
                this.damageByUnit[targetUnitId] = 0;
            }
            this.damageByUnit[targetUnitId] += amount;
        }
    }

    addDamageTaken(amount) {
        this.damageTaken += amount;
    }

    addUnitKilled(targetUnitId) {
        if (!this.unitsKilled.includes(targetUnitId)) {
            this.unitsKilled.push(targetUnitId);
        }
    }

    addUnitLost(unit) {
        this.unitsLost += 1;
    }

    // get damage dealt to a specific unit
    getDamageToUnit(unitId) {
        return this.damageByUnit[unitId] || 0;
    }

    // check if a specific unit was killed
    hasKilledUnit(unitId) {
        return this.unitsKilled.includes(unitId);
    }

    finalize(finalState, order) {
        /*
        const initUnits = this.initialState.unitsData;
        const finalUnits = finalState.unitsData;
        // сравниваем здоровье
        for (let initUnit of initUnits) {
            const finalUnit = finalUnits.find(u => u.id === initUnit.id);
            if (!finalUnit) {
                // юнит погиб
                if (initUnit.playerName === this.playerName) {
                    this.unitsLost += 1;
                } else {
                    this.unitsKilled += 1;
                }
            } else {
                const diff = initUnit.features.health - finalUnit.features.health;
                if (diff > 0) {
                    if (initUnit.playerName === this.playerName) {
                        this.damageTaken += diff;
                    } else {
                        this.damageDealt += diff;
                    }
                }
            }
        }
        
        const score =
            this.damageDealt * 2 -
            this.damageTaken * 1.5 -
            this.unitsKilled * 5 -
            this.unitsLost * 5;

        */
        
        const unit = finalState.unitsData.find(u => u.id === this.unitId);
        let score = 0;
        switch(order.type) {
            case 'attack':
            {
                break;
            }
            case 'intercept':
            {
                score = this.evaluateInterception(finalState, unit, order); 
                break;
            }
            case 'patrol':
            {
                break;
            }
        }

        return Math.round(score * 100) / 100;
    }

    evaluateInterception(state, unit, order) {
        /*
        const target = state.unitsData.find(u => u.id === order.targetId);
        // find my wizard
        const myUnits = state.getUnitsByPlayer({ name: unit.playerName }) || [];
        const myWizard = myUnits.find(u => u.configName === "wizard");
        // distance from my unit to target
        const dmUnit = state.getDistanceMapCached(unit);
        let distUnitToTarget = (dmUnit && target) ? dmUnit[target.mapY]?.[target.mapX] : -1;
        if(distUnitToTarget > 0) distUnitToTarget = state.getBaseCost(dmUnit,target.mapX,target.mapY);
        // distance from my unit to my wizard
        let distUnitToWizard = (dmUnit && myWizard) ? dmUnit[myWizard.mapY]?.[myWizard.mapX] : -1;
        if(distUnitToWizard > 0) distUnitToWizard = state.getBaseCost(dmUnit,myWizard.mapX,myWizard.mapY);
        // distance from target to my wizard
        const dmTarget = state.getDistanceMapCached(target);
        let distTargetToWizard = (dmTarget && myWizard) ? dmTarget[myWizard.mapY]?.[myWizard.mapX] : -1;
        if(distTargetToWizard > 0) distTargetToWizard = state.getBaseCost(dmTarget,myWizard.mapX,myWizard.mapY);
        // check if unit is on the path from target to my wizard
        // simple heuristic: dist(target->unit) + dist(unit->wizard) ≈ dist(target->wizard)
        let onPathBonus = 0;
        if(distUnitToTarget >= 0 && distUnitToWizard >= 0 && distTargetToWizard >= 0) {
            onPathBonus = - Math.abs((distUnitToTarget + distUnitToWizard) - distTargetToWizard);
        }
        // danger at unit's position
        const danger = state.getCellDanger(unit.mapX, unit.mapY, unit.playerName,[]);
        
        // final score calculation
        const W_TARGET_DAMAGE = 1.5; // weight for target damage
        const MIN_DANGER_FACTOR = 0.2;   // minimal penalty for danger when close to my wizard
        const MAX_DANGER_FACTOR = 3.0;   // maximal penalty for danger when far from my wizard
        const MAX_INFLUENCE_DIST = 12;   // distance where danger penalty is maximal

        let score = 0;
        // 1) reward for damage
        let totalDamage = this.damageDealt;
        let targetDamage = this.getDamageToUnit(target.id);
        // reward for damage to the target, more weight
        if (targetDamage > 0) {
            totalDamage += targetDamage * W_TARGET_DAMAGE;
        }
        // maximal reward for killing the target
        if (this.hasKilledUnit(target.id)) {
            totalDamage += 1000;
        }
        score += totalDamage;
        // 2) penalty for deviation from the path
        score += onPathBonus;

        if(distTargetToWizard <= MAX_INFLUENCE_DIST / 3){
            score -= distUnitToTarget;
        }
        else if(distUnitToTarget <= 2 * MAX_INFLUENCE_DIST / 3){
            score -= distUnitToTarget;
            score -= danger;
        }
        else if(distUnitToTarget <= MAX_INFLUENCE_DIST){
            score -= danger * 3;
        }
        return score;
        */

        const target = state.unitsData.find(u => u.id === order.targetId);
        const myUnits = state.getUnitsByPlayer({ name: unit.playerName }) || [];
        const myWizard = myUnits.find(u => u.configName === "wizard");
        const dmUnitFromTarget = state.getDistanceMapCached(unit,target.mapX, target.mapY);
        let distUnitToTarget = (dmUnitFromTarget && target) ? dmUnitFromTarget[unit.mapY]?.[unit.mapX] : -1;
        if(distUnitToTarget > 0) distUnitToTarget = state.getBaseCost(dmUnitFromTarget,unit.mapX,unit.mapY);
        const dmTarget = state.getDistanceMapCached(target, target.mapX, target.mapY);
        let distTargetToWizard = (dmTarget && myWizard) ? dmTarget[myWizard.mapY]?.[myWizard.mapX] : -1;
        if(distTargetToWizard > 0) distTargetToWizard = state.getBaseCost(dmTarget,myWizard.mapX,myWizard.mapY);
        
        const W_TARGET_DAMAGE = 1.5; // weight for target damage
        let score = 0;
        let totalDamage = this.damageDealt;
        let targetDamage = this.getDamageToUnit(target.id);
        if (targetDamage > 0) {
            totalDamage += targetDamage * W_TARGET_DAMAGE;
        }
        if (this.hasKilledUnit(target.id)) {
            totalDamage += 1000;
        }
        score += totalDamage;
        if(distUnitToTarget >= 0) score -= distUnitToTarget;

        return score;
    }

}

//-------- Search --------
function planBestTurn(state, unitId, order) {
    let bestSequence = [];
    let bestScore = -Infinity;

    function dfs(currentState, currentUnit, sequence, evaluator) {
        const actions = currentState.getAvailableActionsForUnit(currentUnit);
        let hasAnyAction = false;

        for (const action of actions) {
            const actionType = ActionRegistry.get(action.typeName);
            if (!actionType) continue;

            // check action points
            if((currentUnit.features.move <= 0) && (currentUnit.features.abilityPoints <= 0)) continue;
            if (action.typeName === "move" && currentUnit.features.move <= 0) continue;
            if (action.typeName === "attack" && (currentUnit.features.move <= 0 || currentUnit.features.attackPoints <=0)) continue;
            if ((action.typeName !== "move" && action.typeName !== "attack" && action.typeName !== "stop") && currentUnit.features.abilityPoints <= 0) continue;

            // check repeating moves
            if (action.typeName === "move") {
                const pos = action.params.endPosition;
                if(sequence.length > 0 && sequence[sequence.length - 1].typeName === "move") {
                    const lastPos = sequence[sequence.length - 1].params.startPosition;
                    if (lastPos.x === pos.x && lastPos.y === pos.y) {
                        continue;
                    }
                }
            }

            hasAnyAction = true;

            // clone state and evaluator
            const nextState = currentState.clone(true);
            const nextEvaluator = evaluator.clone();

            // apply action
            actionType.apply(nextState, action, nextEvaluator);

            // find the updated unit in the new state
            const nextUnit = nextState.unitsData.find(u => u.id === currentUnit.id);

            // recurse step
            dfs(nextState, nextUnit, sequence.concat(action), nextEvaluator);
        }

        // if no actions left, evaluate the state
        if (!hasAnyAction) {
            const score = evaluator.finalize(currentState, order);
            console.log(`Sequence: ${sequence.map(a => a.getName()).join(" -> ")}, Score: ${score}`);
            if (score > bestScore) {
                bestScore = score;
                bestSequence = sequence;
            }
        }
    }

    // find unit in the state
    const unit = state.unitsData.find(u => u.id === unitId);
    const evaluator = new Evaluator(state, unit.playerName, unitId);
    dfs(state.clone(true), unit, [], evaluator);

    return { sequence: bestSequence, score: bestScore };
}

//---------auxiliary functions---------

//---------initialization---------
function initActionRegistry(){
    ActionRegistry.register(new StopActionType());
    ActionRegistry.register(new MoveActionType());
    ActionRegistry.register(new AttackActionType());
    ActionRegistry.register(new FireActionType());
}
