class GameState {

    constructor(unitsData = [], entitiesData = []) {
        this.unitsData = unitsData; 
        this.entitiesData = entitiesData;
    }

    static createFrom(units) {
        const unitsData = units.map(u => u.serialize());
        const entitiesData = entities.map(e => e.serialize());
        return new GameState(unitsData, entitiesData);
    }

    clone() {
        const clonedUnitsData = clone(this.unitsData);
        const clonedEntitiesData = clone(this.entitiesData);
        return new GameState(clonedUnitsData, clonedEntitiesData);
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

        // глобальные действия
        for (const actionType of ActionRegistry.getAll()) {
            if (actionType.isGlobal) {
                actions = actions.concat(actionType.generateActions(this, unit));
            }
        }

        // способности юнита
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
class MoveActionType extends ActionType {
    constructor() {
        super("move", true);
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
            if (!state.getUnitAt(tile.x, tile.y)) {
                actions.push(new Action(this.name, {
                    unitId: unit.id,
                    position: tile
                }));
            }
        }
        return actions;
    }
}


class FireActionType extends ActionType {
    constructor() {
        super("fire", false);
    }

    generateActions(state, unit, abilityConfig) {
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
    }
}