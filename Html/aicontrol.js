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
        /*
        if(unit.config.name === "muddy")
        {
            this.stepMuddy(unit);
            return;
        }
        */
        this.stepUnit(unit);
    }

    stepUnit(unit)
    {
        let dmap = this.getDistanceMap(unit,unit.mapX,unit.mapY);
        let target = null;
        let dist = map.height + map.width;
        players.forEach(pl => {
            if(pl !== unit.player && pl.wizard)
            {
                if(dmap[pl.wizard.mapY][pl.wizard.mapX] < dist)
                {
                    dist = dmap[pl.wizard.mapY][pl.wizard.mapX];
                    target = pl.wizard;
                }
            }
        });
        if(target == null || dmap[target.mapY][target.mapX] > unit.features.move) {
            let trgUnits = [];
            players.forEach(pl => {
                if (pl !== unit.player) {
                    pl.units.forEach(unt => {
                        if (dmap[unt.mapY][unt.mapX] <= unit.features.move) trgUnits.push(unt);
                    });
                }
            });
            if(trgUnits.length > 0) target = trgUnits[randomInt(0,trgUnits.length-1)];
        }
        if(target != null)
        {
            let cell = this.getOptimalStep(dmap,[target.mapX,target.mapY]);
            if(cell != null)
            {
                if(unit.canStepTo(cell[0]-unit.mapX,cell[1]-unit.mapY)) unit.stepTo(cell[0],cell[1]);
                else if(unit.canAtackTo(cell[0]-unit.mapX,cell[1]-unit.mapY)) unit.atackTo(cell[0], cell[1]);
                else this.pass();
            }
            else{
                this.pass();
            }
        }
        else
        {
            this.pass();
        }
    }

    stepMuddy(unit)
    {
        let dmap = this.getDistanceMap(unit,unit.mapX,unit.mapY);
        let target = null;
        let dist = map.height + map.width;
        let stepPlaces = getAvailableCells(dMap,unit,null,true);
        /*
        players.forEach(pl => {
            if (pl !== unit.player) {
                pl.units.forEach(unt => {
                    if (dmap[unt.mapY][unt.mapX] <= unit.features.move + unit.features.abilities.gas.config.range) trgUnits.push(unt);
                });
            }
        targets = selectUnits(this.unit.mapX, this.unit.mapY, null, [this.unit], this.unit.config.abilities.gas.config.range);
        });
        */
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
                    unit.aiControl.plannedSpell = spellConfigs[summonSpells[randomInt(0, summonSpells.length - 1)]];
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
        let cells = [];
        let range = unit.features.move;
        for(let yy=unit.mapY-range; yy<=unit.mapY+range; yy++)
            for(let xx=unit.mapX-range; xx<=unit.mapX+range; xx++)
            {
                if((xx<0)||(xx>=map.width)||(yy<0)||(yy>=map.height)||( (xx===cell[0])&&(yy===cell[1])))continue;
                if(bypassEntities)
                {
                    if(Entity.getEntityAtMap(xx,yy) != null)continue;
                }
                if(bypassUnits)
                {
                    if(getUnitAtMap(xx,yy) != null)continue;
                }
                if(dMap[yy][xx] > -1 && dMap[yy][xx] <= range) cells.push([xx,yy]);
            }
        return cells;
    }

}