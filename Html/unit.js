//---------------------------- Unit class ----------------------------
let nextUnitId = 1;

class Unit extends BaseUnit
{
    player = null;
    target = null;
    isMoving = false;
    filtered = false;
    processedAbility = null;
    states = [];
    recovered = true;

    constructor(config, scene, x, y, visible=true, id=null)
    {
        super(config, scene, x, y, visible);
        if(id)this.id = id;
        else this.id = nextUnitId++;
        this.zOffset = 1;
        this.initAnimations();
    }
  
    serialize() {
        return {
            id: this.id,
            configName: this.config.name,
            mapX: this.mapX,
            mapY: this.mapY,
            features: clone(this.features),
            abilities: clone(this.abilities),
            playerName: this.player.name,
            states: this.states.map(s => s.serialize())
        };
    }
  
    static deserialize(data, scene, playersMap) {
        const cfg = unitConfigs[data.configName];
        const u = new Unit(cfg, scene, data.mapX, data.mapY, true, data.id);
        if(data.id >= nextUnitId) nextUnitId = data.id + 1;
        u.setPositionFromMap(data.mapX, data.mapY);
        for (let key in data.features) {u.features[key] = data.features[key];}
        u.abilities = clone(data.abilities);
        u.player = playersMap[data.playerName];
        units.push(u);
        if(u.player){
            if(u.config.name === "wizard") u.player.addWizard(u);
            else u.player.addUnit(u);
        }
        for (let sd of data.states) UnitState.deserialize(sd, u);
        return u;
    }

    initAnimations()
    {
        this.scene.anims.create({
            key: this.config.sprite+'run',
            frames: this.scene.anims.generateFrameNumbers(this.config.sprite, { start: 0, end: 3 }),
            frameRate: 14,
            repeat: -1
        });
        this.scene.anims.create({
            key: this.config.sprite+'stop',
            frames: [ { key: this.config.sprite, frame: 0 } ],
            frameRate: 14
        });
    }

    die()
    {
        this.died = true;
        if(this.player != null)this.player.removeUnit(this);
        units.splice(units.indexOf(this),1);
        this.destroy();
        if(selectedUnit === this)
        {
            selectedUnit = null;
        }
    }

    onCallback()
    {
        cam.stopFollow();
        if(this.player.control === PlayerControl.human)
        {
            showArrows(selectedUnit);
        }
        else {
            this.player.aiControl.step(this);
        }
    }

    turnTo(x, y)
    {
        if(x<this.x)
        {
            this.flipX = true;
            //this.body.setOffset(16, 12);
        }
        else
        {
            this.flipX = false;
            //this.body.setOffset(0, 12);
        }
    }

    moveTo(x, y)
    {
        this.isMoving = true;
        this.turnTo(x, y);
        this.target = new Phaser.Math.Vector2();
        this.target.x = x;
        this.target.y = y;
        if(gameSettings.showEnemyMoves == true || this.player.control === PlayerControl.human)
        {
            this.anims.play(this.config.sprite+'run', true);           
            this.scene.physics.moveToObject(this, this.target, 25);
            cam.startFollow(this);
        }
        else
        {
            this.setPosition(x, y);
        }
        pointerBlocked = true;
        hideArrows();
    }

    checkEntityStepOut()
    {
        let canStep = true;
        const ents = Entity.getEntitiesAtMap(this.mapX, this.mapY);
        if (ents && ents.length > 0) {
            for (const ent of ents) {
                if (!ent.onStepOut(this)) {
                    canStep = false;
                    break;
                }
            }
        }
        return canStep;
    }

    stepTo(mapX, mapY)
    {
        if(this.checkEntityStepOut())
        {
            this.features.move--;
            let targetXY = map.tileToWorldXY(mapX, mapY);
            this.setDepth(mapY);
            this.moveTo(targetXY.x + 8, targetXY.y + 8);
        }
        else this.onCallback();
    }

    processEntityStepIn(entities)
    {
        while(entities.length > 0){
            const ent = entities.pop();
            const result = ent.onStepIn(this);
            if(result != null)
            {
                let config = {hit: false, damaged: false, killed: false};
                if(result.hit == true) config.hit = true;
                if(result.damaged == true) config.damaged = true;
                if(result.killed == true) config.killed = true;
                if(config.hit == true || config.damaged == true || config.killed == true)
                {
                    if(gameSettings.showEnemyMoves == true || players[playerInd].control === PlayerControl.human)
                    {
                        cam.startFollow(this);
                        let lm = new LossesAnimationManager(this.scene, 200, 200);
                        if(config.killed){
                            lm.playAt(this.x,this.y,this,this,null,config);
                        }
                        else
                        {
                            lm.playAt(this.x,this.y,this,this,"processEntityStepIn",config,[entities]);
                        } 
                        return;
                    }
                    else
                    {
                        if(config.killed){
                            this.die();
                            this.player.aiControl.step(this);
                            return;
                        }
                    }
                }
            }
        }
        this.onCallback();
    }

    updateVisability()
    {
        if(gameSettings.fogOfWar && this.player.control === PlayerControl.human){
            updateFog(this);
        }
        if(gameSettings.showEnemyMoves == false && this.player.control === PlayerControl.human){
            checkUnitVisibility(this);
        }
    }

    endStep()
    {
        this.body.reset(this.target.x, this.target.y);
        this.isMoving = false;
        this.anims.play(this.config.sprite+'stop', true);
        this.updateVisability();
        this.states.forEach(item => item.onStep());
        const ents = Entity.getEntitiesAtMap(this.mapX, this.mapY);
        if (ents && ents.length > 0) {
            this.processEntityStepIn(ents);
            return;
        }
        showArrows(this);
        cam.stopFollow(this);
        if(this.player.control === PlayerControl.computer) this.player.aiControl.step(this);
    }

    getCurrentFeatures()
    {
        let curFeatures = [];
        for (let key in this.config.features) {curFeatures[key] = this.config.features[key];}
        let ent = Entity.getEntityAtMap(this.mapX,this.mapY);
        if(ent != null)
        {
            curFeatures = ent.transformFeatures(this, curFeatures);
        }
        return curFeatures;
    }

    atackTo(mapX, mapY)
    {
        if(! this.checkEntityStepOut())
        {
            this.onCallback();
            return;
        }
        this.features.move = this.features.move - this.features.attackCost;
        if(this.features.move < 0)this.features.move = 0;
        this.features.attackPoints--;
        if(this.features.attackPoints < 0)this.features.attackPoints = 0;
        let enemyUnit = getUnitAtMap(mapX, mapY);
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
            let curFeatures = this.getCurrentFeatures();
            if(Math.random() <= curFeatures.strength/(curFeatures.strength + enemyUnit.getCurrentFeatures().defense))
            {
                damaged = true;
                enemyUnit.features.health--;
                if(enemyUnit.features.health <= 0) killed = true;
            }
        }
        if(gameSettings.showEnemyMoves == true || this.player.control === PlayerControl.human)
        {
            let config = {hit: true, damaged: false, killed: false};
            if(killed) config.killed = true;
            if(damaged) config.damaged = true;
            pointerBlocked = true;
            hideArrows();
            cam.startFollow(enemyUnit);
            let lm = new LossesAnimationManager(this.scene, 200, 200);
            lm.playAt(enemyUnit.x,enemyUnit.y,enemyUnit,this,null,config);
        }
        else
        {
            if(killed) enemyUnit.die();
            this.player.aiControl.step(this);
        }
    }

    canAtackTo(offsetX, offsetY)
    {
        if(this.features.move <= 0 || this.features.attackPoints <= 0)return false;
        let x = this.mapX + offsetX;
        let y = this.mapY + offsetY;
        if((x<0)||(x>=map.width)||(y<0)||(y>=map.height))return false;
        let unitAtPos = getUnitAtMap(x, y);
        if(unitAtPos==null)return false;
        if(this.player!==unitAtPos.player)return true;
        return false;
    }

    canStepTo(offsetX, offsetY)
    {
        if(this.features.move <= 0)return false;
        let x = this.mapX + offsetX;
        let y = this.mapY + offsetY;
        if((x<0)||(x>=map.width)||(y<0)||(y>=map.height))return false;
        let unitAtPos = getUnitAtMap(x, y);
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

    processStates()
    {
        for(let i=0; i<this.states.length; i++)
        {
            if(this.states[i].processed===false)
            {
                this.states[i].onRecover();
                return;
            }
        }
        this.player.processRecover();
    }

    recover()
    {
        this.features.move = this.config.features.move;
        this.features.abilityPoints = this.config.features.abilityPoints;
        this.features.attackPoints = this.config.features.attackPoints;
        if(this.config.abilities != null)if(Object.keys(this.config.abilities).indexOf('conjure') >=0 )
        {
            this.features.mana = this.features.mana + this.features.manaIncome;
        }
        this.states.forEach(item => item.processed=false);
        this.recovered = true;
        this.processStates();
    }

    addState(state)
    {
        this.states.push(state);
    }

    removeState(state)
    {
        this.states.splice(this.states.indexOf(state),1);
    }

    hasState(stateName)
    {
        for(var i=0; i<this.states.length; i++)
        {
            if(this.states[i].name === stateName)return true;
        }
        return false;
    }

    startAbility()
    {
        this.processedAbility = abilities[this.config.abilities[Object.keys(this.config.abilities)[0]].type];
        this.processedAbility.start(this);
        this.processedAbility.next();
    }
    
    endAbility()
    {
        this.processedAbility = null;
        if(this.player.control === PlayerControl.human)
        {
            setInteractionScenario(userInteractionScenario.movement);
        }
        else
        {
            this.player.aiControl.step(this);
        }
    }

    stopAbility()
    {
        if(this.processedAbility != null)
        {
            if(this.processedAbility.spell != null)
            {
                spellTypes[this.processedAbility.spell.type].stop(false);
            }
            else
            {
                this.processedAbility.stop(this);
            }
        }
    }

    update()
    {

        if(this.isMoving)
        {
            let distance = Phaser.Math.Distance.Between(this.x, this.y, this.target.x, this.target.y);
            if (distance < 2)
            {
                this.endStep();
            }
        }
        else
        {
            if(pointerBlocked===false)
            {
                let pointer = this.scene.input.activePointer;
                if(pointer.isDown && pointerPressed===false)
                {
                    let touchX = pointer.worldX;
                    let touchY = pointer.worldY;
                    let mapX = map.worldToTileXY(touchX,touchY).x;
                    let mapY = map.worldToTileXY(touchX,touchY).y;
                    if(this === selectedUnit)
                    {
                        let ind = ((mapY-this.mapY)+1)*3 + ((mapX-this.mapX)+1);
                        let inAdjacentPlaces = (mapX<=this.mapX+1)&&(mapX>=this.mapX-1)&&(mapY<=this.mapY+1)&&(mapY>=this.mapY-1);

                        if(activeInteractionScenario === userInteractionScenario.placeSelection)
                        {
                            if(inAdjacentPlaces && (ind === 4))
                            {
                                pointerPressed = true;
                                selectedUnit.stopAbility();
                            }
                            else
                            {
                                pointerPressed = true;
                                if(placeSelector.check(mapX,mapY)===true) placeSelector.select(mapX,mapY);
                            }
                        }
                        else if(inAdjacentPlaces)
                        {
                            if(activeInteractionScenario === userInteractionScenario.movement)
                            {
                                if(ind === 4)
                                {
                                    pointerPressed = true;
                                    if(this.features.abilityPoints > 0)
                                    {
                                        if(this.config.abilities != null)if(Object.keys(this.config.abilities).length > 0) this.startAbility();
                                    }
                                }
                                else
                                {
                                    if(ind>4)ind--;
                                    if(arrows[ind].state === ArrowState.green)
                                    {
                                        pointerPressed = true;
                                        this.stepTo(mapX, mapY);
                                    }
                                    else if(arrows[ind].state === ArrowState.red)
                                    {
                                        pointerPressed = true;
                                        this.atackTo(mapX, mapY);
                                    }
                                }
                            }
                            else if(activeInteractionScenario === userInteractionScenario.targetSelection)
                            {
                                if(ind === 4)
                                {
                                    pointerPressed = true;
                                    selectedUnit.stopAbility();
                                }
                            }
                        }
                    }
                    else
                    {
                        if((mapX===this.mapX)&&(mapY===this.mapY))
                        {
                            if(activeInteractionScenario === userInteractionScenario.movement)
                            {
                                if(this.player === players[playerInd])
                                {
                                    pointerPressed = true;
                                    selectUnit(this);
                                }
                            }
                            else if(activeInteractionScenario === userInteractionScenario.targetSelection)
                            {
                                //if(this.player != selectedUnit.player)
                                if(this.filtered)
                                {
                                    pointerPressed = true;
                                    if(selectedUnit != null)
                                    {
                                        if(selectedUnit.processedAbility != null)
                                        {
                                            if(selectedUnit.processedAbility.spell != null)
                                            {
                                                spellTypes[selectedUnit.processedAbility.spell.type].setTarget(this);
                                                spellTypes[selectedUnit.processedAbility.spell.type].next();
                                            }
                                            else
                                            {
                                                selectedUnit.processedAbility.setTarget(this);
                                                selectedUnit.processedAbility.next();
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}