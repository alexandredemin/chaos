//---------------------------- Player class ----------------------------
class Player
{
    name = '';
    wizard = null;
    units = [];
    control = PlayerControl.human;
    aiControl = null;

    constructor(name)
    {
        this.name = name;
    }

    addWizard(unit)
    {
        this.addUnit(unit);
        this.wizard = unit;
    }

    addUnit(unit)
    {
        if(unit.player != null)unit.player.removeUnit(unit);
        this.units.push(unit);
        unit.player = this;
    }

    removeUnit(unit)
    {
        if(unit.player === this)
        {
            if(unit === this.wizard) this.wizard = null;
            const index = this.units.indexOf(unit);
            if (index > -1)this.units.splice(index, 1);
        }
    }

    processRecover()
    {
        for(let i=0; i<this.units.length; i++)
        {
            if(this.units[i].recovered===false)
            {
                this.units[i].recover();
                return;
            }
        }
        if(this.control === PlayerControl.human) {
            if (this.units.length > 0)
            {
                if(this.wizard != null) selectUnit(this.wizard);
                else selectUnit(this.units[0]);
            }
            else
            {
                setTimeout(endTurn,1);
            }
        }
        else{
            this.aiControl.startTurn();
        }
    }

    startTurn()
    {
        //if(gameSettings.showEnemyMoves == true || this.control === PlayerControl.human)
        if(gameSettings.showEnemyMoves == false && this.control === PlayerControl.human)
        {
            this.units.forEach(item => {item.visible=true; checkUnitVisibility(item);});
        }
        this.units.forEach(item => item.recovered = false);
        this.processRecover();
    }
}
