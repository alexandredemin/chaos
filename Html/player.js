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

    killUnits(diedUnits, callbackFunction = null)
    {
        if(diedUnits.length === 0) {
            if(callbackFunction) callbackFunction();
            return;
        }
        let unit = diedUnits.pop();
        if(gameSettings.showEnemyMoves == true || this.control === PlayerControl.human)
        {
            const config = {hit: false, damaged: false, killed: true};
            cam.startFollow(unit);
            let lm = new LossesAnimationManager(unit.scene, 200, 200);
            lm.playAt(unit.x,unit.y,unit,this,"killUnits",config,[diedUnits]);
        }
        else {
            unit.die();
            this.killUnits(diedUnits);
        }
    
    }

    consumeResources()
    {
        let availableMana = 0;
        if(this.wizard) availableMana = this.wizard.features.mana;
        let diedUnits = [];
        for (let i = this.units.length - 1; i >= 0; i--) {
            const unit = this.units[i];
            if (unit !== this.wizard && unit.features.manaUpkeep) {
                if (unit.features.manaUpkeep > availableMana) {
                    diedUnits.push(unit);
                } else {
                    availableMana -= unit.features.manaUpkeep;
                }
            }
        }
        if(this.wizard) this.wizard.features.mana = availableMana;
        if(diedUnits.length > 0)
        {
            if(gameSettings.showEnemyMoves == true || this.control === PlayerControl.human)
            {
                this.killUnits(diedUnits, this.startControl.bind(this));
            }
            else {
                diedUnits.forEach(unit => unit.die());
                this.startControl();
            }
        }
        else {
            this.startControl();
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
        if(gameSettings.rules === "advanced") this.consumeResources();
        else this.startControl();
    }

    startControl()
    {
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
        if(gameSettings.showEnemyMoves == false && this.control === PlayerControl.human)
        {
            this.units.forEach(item => {item.visible=true; checkUnitVisibility(item);});
        }
        this.units.forEach(item => item.recovered = false);
        this.processRecover();
    }
}
