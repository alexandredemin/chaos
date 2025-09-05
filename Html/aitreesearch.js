class GameState {

    constructor(unitsData = [], entitiesData = [], wallsLayer = null) {
        this.unitsData = unitsData; 
        this.entitiesData = entitiesData;
        this.wallsLayer = wallsLayer;
    }

    static createFrom(units, entities, wallsLayer) {
        const unitsData = units.map(u => u.serialize());
        const entitiesData = entities.map(e => e.serialize());
        return new GameState(unitsData, entitiesData, wallsLayer);
    }

    clone() {
        const clonedUnitsData = clone(this.unitsData);
        const clonedEntitiesData = clone(this.entitiesData);
        return new GameState(clonedUnitsData, clonedEntitiesData, this.wallsLayer);
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
                if (unitArr.includes(unit.id)) fl = false; // фильтр исключений
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

    apply(state, action) {
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
        return [ new Action(this.name, { unitId: unit.id }) ];
    }

    apply(state, action) {
        //do nothing
    }
}

class MoveActionType extends ActionType {
    constructor() {
        super("move", true);
    }

    canStepTo(state, unit, x, y) {
        if(unit.features.move <= 0)return false;
        if((x<0)||(x>=map.width)||(y<0)||(y>=map.height))return false;
        let unitAtPos = state.getUnitAtMap(x, y);
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
        const possibleTiles = [
            {x: unit.mapX+1, y: unit.mapY},
            {x: unit.mapX-1, y: unit.mapY},
            {x: unit.mapX,   y: unit.mapY+1},
            {x: unit.mapX,   y: unit.mapY-1}
        ];
        for (const tile of possibleTiles) {
            if (this.canStepTo(state, unit, tile.x, tile.y)) {
                actions.push(new Action(this.name, {
                    unitId: unit.id,
                    position: tile
                }));
            }
        }
        return actions;
    }

    apply(state, action) {
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
            unit.mapX = action.params.position.x;
            unit.mapY = action.params.position.y;
            unit.features.move -= 1;
            if(unit.features.move < 0)unit.features.move = 0;
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
        if(unit.features.move <= 0)return false;
        if((x<0)||(x>=map.width)||(y<0)||(y>=map.height))return false;
        let unitAtPos = state.getUnitAtMap(x, y);
        if(unitAtPos==null)return false;
        if(unit.player!==unitAtPos.player)return true;
        return false;
    }

    generateActions(state, unit) {
        const actions = [];
        const possibleTiles = [
            {x: unit.mapX+1, y: unit.mapY},
            {x: unit.mapX-1, y: unit.mapY},
            {x: unit.mapX,   y: unit.mapY+1},
            {x: unit.mapX,   y: unit.mapY-1}
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

    apply(state, action) {
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
            let enemyUnit = state.getUnitAtMap(action.params.position.x, action.params.position.y);
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
            // remove enemy unit from state if killed
            if(enemyUnit.features.health <= 0) state.unitsData = state.unitsData.filter(u => u.id !== enemyUnit.id);
        }
    }
}


class FireActionType extends ActionType {
    constructor() {
        super("fire", false);
    }

    generateActions(state, unit, abilityConfig) {
        /*
        const actions = [];
        const enemies = state.getEnemyUnits({ name: unit.playerName });
        for (const enemy of enemies) {
            const dx = unit.mapX - enemy.mapX;
            const dy = unit.mapY - enemy.mapY;
            const dist = Math.abs(dx) + Math.abs(dy);
            if (dist <= abilityConfig.range) {
                actions.push(new Action(this.name, {
                    casterId: unit.id,
                    targetId: enemy.id,
                    damage: abilityConfig.damage
                }));
            }
        }
        return actions;
        */

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

    apply(state, action) {
        const unit = state.unitsData.find(u => u.id === action.params.unitId);
        const target = state.unitsData.find(u => u.id === action.params.targetId);
        if (!unit || !target) return;
        this.unit.features.abilityPoints--;
        if (unit.features.abilityPoints < 0) unit.features.abilityPoints = 0;
        const ability = unit.abilities.fire;
        let enemyCurrentFeatures = target.features; 
        const chance = unit.abilities.fire.config.damage/(this.unit.abilities.fire.config.damage + enemyCurrentFeatures.defense);
        const expectedDamage = Math.round(chance * 100) / 100;
        target.features.health -= expectedDamage;
        // remove enemy unit from state if killed
        if(target.features.health <= 0) state.unitsData = state.unitsData.filter(u => u.id !== target.id);
    }
}

//-------- Search --------
function planBestTurn(state, unit, evaluateFunction) {
    let bestSequence = [];
    let bestScore = -Infinity;

    function dfs(currentState, currentUnit, sequence) {
        const actions = currentState.getAvailableActionsForUnit(currentUnit);
        let hasAnyAction = false;

        for (const action of actions) {
            const actionType = ActionRegistry.get(action.typeName);
            if (!actionType) continue;

            // check action points
            if (action.typeName === "move" && currentUnit.features.move <= 0) continue;
            if (action.typeName !== "move" && action.typeName !== "stop" && currentUnit.features.abilityPoints <= 0) continue;

            //check repeating moves
            if (action.typeName === "move") {
                const pos = action.params.position;
                if(sequence.length > 0 && sequence[sequence.length - 1].typeName === "move") {
                    const lastPos = sequence[sequence.length - 1].params.position;
                    if (lastPos.x === pos.x && lastPos.y === pos.y) {
                        continue;
                    }
                }
            }

            hasAnyAction = true;
            const nextState = currentState.clone();
            actionType.apply(nextState, action);

            // find the corresponding unit in the new state
            const nextUnit = nextState.unitsData.find(u => u.id === currentUnit.id);
            // recurse step
            dfs(nextState, nextUnit, sequence.concat(action));
        }

        // evaluate if no actions left
        if (!hasAnyAction) {
            const score = evaluateFunction(currentState, unit.playerName);
            if (score > bestScore) {
                bestScore = score;
                bestSequence = sequence;
            }
        }
    }

    dfs(state.clone(), unit, unit.features.move, unit.features.abilityPoints, []);
    return { sequence: bestSequence, score: bestScore };
}