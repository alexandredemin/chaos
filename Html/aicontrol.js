//---------------------------- AIControl class ----------------------------

class AIControl
{
    player = null;
    availableUnits = null;
    passStage = 1;

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
        this.passStage = 1;
        this.pass();
    }

    pass()
    {
        if(this.availableUnits.length > 0)
        {
            let unit = this.availableUnits.pop();
            selectUnit(unit);
            this.step(unit);
        }
        else
        {
            if(this.passStage === 1) {
                this.passStage = 2;
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
        if(unit.config.name === "muddy")
        {
            this.stepMuddy(unit);
            return;
        }
        if(unit.config.name === "demon")
        {
            this.stepDemon(unit);
            return;
        }
        if(!this.stepCommonUnit(unit)) this.pass();
    }

    stepToTarget(unit,target,dmap)
    {
        if(!dmap) dmap = this.getDistanceMap(unit,unit.mapX,unit.mapY);
        let cell = this.getOptimalStep(dmap,target);
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

    stepMuddy(unit)
    {
        if(!unit.aiControl)
        {
            unit.aiControl = {target: null};
        }
        if(unit.aiControl.target == null)
        {
            let dmap = this.getDistanceMap(unit,unit.mapX,unit.mapY);
            let stepPlaces = this.getAvailableCells(dmap,unit,null,true);
            for(let i=0;i<stepPlaces.length;i++)
            {
                let place = stepPlaces[i];
                place.gasWeight = 0;
                place.atackWeight = 0;
                let range = unit.config.abilities.gas.config.range;
                if(unit.features.abilityPoints === 0) range = 0;
                let targets = selectUnits(place.cell[0], place.cell[1], null, [unit], range);
                let gasAbility = abilities[unit.config.abilities[Object.keys(unit.config.abilities)[0]].type];
                let canAttack = false;
                for(let j=0;j<targets.length;j++)
                {
                    let trgt = targets[j];
                    if(!canAttack && trgt.player !== unit.player && place.dist < unit.features.move)
                    {
                        place.atackWeight = place.atackWeight + unit.config.features.strength;
                        canAttack = true;
                    }
                    if(gasAbility.canAtack(unit,trgt))
                    {
                        if (trgt.player !== unit.player) place.gasWeight = place.gasWeight + unit.config.abilities.gas.config.damage;
                        else place.gasWeight = place.gasWeight - unit.config.abilities.gas.config.damage;
                    }
                }
                place.bestWeight = place.atackWeight;
                if(place.gasWeight > 0) place.bestWeight = place.bestWeight + place.gasWeight;
            }
            let bestPlace = stepPlaces[0];  
            for(let i=1;i<stepPlaces.length;i++)
            {
                if (stepPlaces[i].bestWeight > bestPlace.bestWeight) bestPlace = stepPlaces[i];
            }
            if(bestPlace.bestWeight > 0)
            {
                unit.aiControl.target = bestPlace.cell;
                if (bestPlace.gasWeight <= 0) unit.features.abilityPoints = 0;
            }
            else
            {
                let trgtWiz = this.getNearestEnemyWizard(dmap,unit);
                if(trgtWiz) unit.aiControl.target = [trgtWiz.mapX,trgtWiz.mapY];
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
                if(unit.features.abilityPoints > 0)
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
                    if(trg) unit.atackTo(trg[0], trg[1]);
                    else
                    {
                        unit.aiControl.target = null;
                        this.stepMuddy(unit);
                    }
                }
                else
                {
                    unit.aiControl.target = null;
                    this.pass();
                    return;
                }
            }
            else
            {
                if(!this.stepToTarget(unit,unit.aiControl.target))
                {
                    unit.aiControl.target = null;
                    this.pass();
                }
            }
        }
    }

    stepDemon(unit)
    {
        if(!unit.aiControl)
        {
            unit.aiControl = {target: null};
        }
        if(unit.aiControl.target == null)
        {
            let dmap = this.getDistanceMap(unit,unit.mapX,unit.mapY);
            let stepPlaces = this.getAvailableCells(dmap,unit,null,true);
            for(let i=0;i<stepPlaces.length;i++)
            {
                let place = stepPlaces[i];
                place.fireWeight = 0;
                place.atackWeight = 0;
                let range = unit.config.abilities.fire.config.range;
                if(unit.features.abilityPoints === 0) range = 0;
                let targets = selectUnits(place.cell[0], place.cell[1], null, [unit], range);
                let fireAbility = abilities[unit.config.abilities[Object.keys(unit.config.abilities)[0]].type];
                let canFire = false;
                let canAttack = false;
                for(let j=0;j<targets.length;j++)
                {
                    let trgt = targets[j];
                    if(trgt.player !== unit.player)
                    {
                      if(!canFire && fireAbility.canAtack(unit,trgt))
                      {
                          place.fireWeight + unit.config.abilities.fire.config.damage;
                          canFire = true;
                      }
                      if(!canAttack && place.dist < unit.features.move)
                      {
                          place.atackWeight = place.atackWeight + unit.config.features.strength;
                          canAttack = true;
                      }
                    }   
                    if(canFire && canAttack) break;
                }
                place.bestWeight = place.atackWeight + place.fireWeight;
            }
            let bestPlace = stepPlaces[0];  
            for(let i=1;i<stepPlaces.length;i++)
            {
                if (stepPlaces[i].bestWeight > bestPlace.bestWeight) bestPlace = stepPlaces[i];
            }
            if(bestPlace.bestWeight > 0)
            {
                unit.aiControl.target = bestPlace.cell;
                if (bestPlace.fireWeight <= 0) unit.features.abilityPoints = 0;
            }
            else
            {
                let trgtWiz = this.getNearestEnemyWizard(dmap,unit);
                if(trgtWiz) unit.aiControl.target = [trgtWiz.mapX,trgtWiz.mapY];
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
                if(unit.features.abilityPoints > 0)
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
                    if(trg) unit.atackTo(trg[0], trg[1]);
                    else
                    {
                        unit.aiControl.target = null;
                        this.stepDemon(unit);
                    }
                }
                else
                {
                    unit.aiControl.target = null;
                    this.pass();
                    return;
                }
            }
            else
            {
                if(!this.stepToTarget(unit,unit.aiControl.target))
                {
                    unit.aiControl.target = null;
                    this.pass();
                }
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
            if(unit.aiControl.plannedSpell == null) {
                if (!unit.aiControl.pentagramCreated && randomInt(0,1) === 1) {
                    unit.aiControl.plannedSpell = spellConfigs['pentagram'];
                }
                else {
                    let summonSpells = [];
                    for (let spl in spellConfigs) {
                        if (spellConfigs[spl].type === 'summon') summonSpells.push(spl);
                    }
                    if(unit.player.name === "Player1") unit.aiControl.plannedSpell = spellConfigs['muddy'];
                    //else if(unit.player.name === "Player2") unit.aiControl.plannedSpell = spellConfigs['rat'];
                    else unit.aiControl.plannedSpell = spellConfigs[summonSpells[randomInt(0, summonSpells.length - 1)]];
                    //unit.aiControl.plannedSpell = spellConfigs[summonSpells[randomInt(0, summonSpells.length - 1)]];
                }
            }
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

    getNearestEnemyWizard(dMap,unit)
    {
        let wiz = null;
        let dist = map.height + map.width;
        players.forEach(pl => {
            if(pl !== unit.player && pl.wizard)
            {
                if(dMap[pl.wizard.mapY][pl.wizard.mapX] <= dist)
                {
                    if(dMap[pl.wizard.mapY][pl.wizard.mapX] < dist || randomInt(0,1) === 1)
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
        let enemies = [];
        players.forEach(pl => {
            if (pl !== unit.player) {
                pl.units.forEach(unt => {
                    if (dMap[unt.mapY][unt.mapX] <= dist) enemies.push(unt);
                });
            }
        });
        return enemies;
    }

    getDistanceMap(unit,x,y)
    {
        let distMap = [];
        for(let i=0;i<map.height;i++) distMap[i]=[];
        for(let i=0;i<map.height;i++)
            for(let j=0;j<map.width;j++) distMap[i][j]=-1;
        let border = [[x,y,0]];
        distMap[y][x] = 0;
        while(border.length > 0)
        {
            let border2 = [];
            while(border.length > 0)
            {
                let cell = border.pop();
                for(let yy=cell[1]-1; yy<=cell[1]+1; yy++)
                    for(let xx=cell[0]-1; xx<=cell[0]+1; xx++)
                    {
                        if((xx<0)||(xx>=map.width)||(yy<0)||(yy>=map.height)||( (xx===cell[0])&&(yy===cell[1])))continue;
                        if(distMap[yy][xx] > -1) continue;
                        let wallTile = wallsLayer.getTileAt(xx,yy);
                        if(wallTile != null) continue;
                        let unt = getUnitAtMap(xx, yy, unit.player);
                        if(unt) continue;
                        border2.push([xx,yy,cell[2]+1]);
                        distMap[yy][xx] = cell[2]+1;
                    }
            }
            border = border2;
        }
        return distMap;
    }

    getOptimalStep(dMap,targetCell)
    {
        if(dMap[targetCell[1]][targetCell[0]] === 1) return [targetCell[0],targetCell[1]];
        let dist = map.height + map.width;
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
                        }
                    }
                }
            if(dist2 < dist)
            {
                cell = [cell2[0],cell2[1]];
                dist = dist2;
                if(dist <= 1) return cell;
            }
            else return null;
        }
    }

    getAvailableCells(dMap,unit,bypassEntities,bypassUnits)
    {
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
                if(dMap[yy][xx] > -1 && dMap[yy][xx] <= range) cells.push({cell:[xx,yy],dist:dMap[yy][xx]});
            }
        return cells;
    }

}