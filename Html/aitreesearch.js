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
}