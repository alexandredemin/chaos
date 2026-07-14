//---------------------------- Player class ----------------------------
class Player
{
    name = '';
    wizard = null;
    units = [];
    control = PlayerControl.human;
    aiControl = null;

    isIndependent = false;
	independentFactionId = null;

    fogExplored = null;
    fogVisible = null;
    fogLayer = null;

    constructor(name)
    {
        this.name = name;
    }

    initializeFog(scene, map)
    {
        this.fogLayer = new FogLayer(
            scene,                // scene
            map.width,
            map.height,
            16,                  // tile size
            'fogGradient',
            scene.fogRadius
        );

        this.fogLayer.redrawAll(this.fogExplored);
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
            lm.playAt(unit.x,unit.y,unit,this,"killUnits",config,[diedUnits, callbackFunction]);
        }
        else {
            unit.die();
            this.killUnits(diedUnits);
        }
    
    }

    consumeResources()
    {
        if(this.isIndependent === true)
        {
            this.startControl();
            return;
        }
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
        if(gameSettings.fogOfWar && this.control === PlayerControl.human)
        {
            players.forEach(p => p.fogLayer.setVisible(false));
            this.fogLayer.setVisible(true);
        }
        if(gameSettings.showEnemyMoves == false && this.control === PlayerControl.human)
        {
            this.units.forEach(item => {item.visible=true; checkUnitVisibility(item);});
        }
        this.units.forEach(item => item.recovered = false);
        this.processRecover();
    }
}

//---------------------------- Independent players helpers ----------------------------
const independentPlayerNamePrefix = '__independent__:';

function getIndependentPlayerName(factionId='default')
{
	return independentPlayerNamePrefix + factionId;
}

function getIndependentFactionIdFromName(playerName)
{
	if(typeof playerName !== 'string') return null;
	if(!playerName.startsWith(independentPlayerNamePrefix)) return null;

	return playerName.substring(independentPlayerNamePrefix.length);
}

function isIndependentPlayer(player)
{
	return player != null && player.isIndependent === true;
}

function initPlayerFogData(player)
{
	if(player == null) return;
	if(typeof map === 'undefined' || map == null) return;
	if(player.fogExplored == null)
	{
		player.fogExplored = Array.from({ length: map.height }, () => Array(map.width).fill(false));
	}
	if(player.fogVisible == null)
	{
		player.fogVisible = Array.from({ length: map.height }, () => Array(map.width).fill(false));
	}
}

function setupPlayerAI(player)
{
	if(isIndependentPlayer(player))
	{
		player.aiControl = new IndependentAIControl(player);
	}
	else
	{
		player.aiControl = new AIControl(player);
	}
}

function createIndependentPlayer(factionId='default', scene=null)
{
	const player = new Player(getIndependentPlayerName(factionId));
	player.control = PlayerControl.computer;
	player.isIndependent = true;
	player.independentFactionId = factionId;
	player.wizard = null;
	initPlayerFogData(player);
	setupPlayerAI(player);
	if(gameSettings.fogOfWar === true && scene != null && player.fogLayer == null)
	{
		player.initializeFog(scene, map);
		player.fogLayer.setVisible(false);
	}
	return player;
}

function getIndependentPlayer(factionId='default', createIfMissing=true, scene=null)
{
	for(let i = 0; i < players.length; i++)
	{
		const player = players[i];
		if(player.isIndependent === true && player.independentFactionId === factionId)
		{
			return player;
		}
	}
	if(createIfMissing !== true) return null;
	const player = createIndependentPlayer(factionId, scene);
	players.push(player);
	return player;
}

function ensureIndependentPlayer(factionId='default', scene=null)
{
	return getIndependentPlayer(factionId, true, scene);
}

function createIndependentUnit(scene, configName, mapX, mapY, independentAI=null, factionId='default')
{
	const cfg = unitConfigs[configName];
	if(cfg == null) return null;
	const player = ensureIndependentPlayer(factionId, scene);
	const unit = new Unit(cfg, scene, 0, 0);
	unit.setPositionFromMap(mapX, mapY);
	unit.independentAI = clone(independentAI || {
		type: 'idle',
		homeX: mapX,
		homeY: mapY
	});
	player.addUnit(unit);
	units.push(unit);
	if(gameSettings.fogOfWar === true && player.fogExplored != null)
	{
		computeFOV(player, mapX, mapY, 20);
		if(player.fogLayer != null)
		{
			player.fogLayer.redrawAll(player.fogExplored);
		}
	}
	return unit;
}
