const assert=require('assert'),fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.join(__dirname,'..','Html','aicontrol')+path.sep;
const W=18,H=14, walls=new Set(),objects=[],actors=[];
const key=(x,y)=>x+','+y;
const map={width:W,height:H,tileToWorldXY:(x,y)=>({x:x*16,y:y*16})};
for(let x=0;x<W;x++){walls.add(key(x,0));walls.add(key(x,H-1));}
for(let y=0;y<H;y++){walls.add(key(0,y));walls.add(key(W-1,y));}
const wallsLayer={getTileAt(x,y){return walls.has(key(x,y))?{properties:{collides:true}}:null;}};
class Entity {static getEntitiesAtMap(x,y){return objects.filter(e=>e.mapX===x&&e.mapY===y)} static getEntityAtMap(x,y){return this.getEntitiesAtMap(x,y)[0]||null;}}
const unit={id:1,player:null,mapX:2,mapY:5,died:false,config:{name:'chort',features:{move:3,attackPoints:1}},features:{move:3,abilityPoints:1,attackPoints:1,strength:3,health:3},aiControl:{order:null}};
const spider={id:2,player:null,mapX:3,mapY:5,died:false,config:{name:'spider',features:{move:3,attackPoints:1}},features:{move:3,abilityPoints:1,attackPoints:1,strength:2,health:3,webImmunity:true},aiControl:{order:null}};
const wizard={id:3,player:null,mapX:7,mapY:7,died:false,config:{name:'wizard',features:{move:3}},features:{move:3,strength:3,health:5},aiControl:{order:null}};
const player={units:[unit,spider,wizard],wizard};unit.player=spider.player=wizard.player=player;actors.push(unit,spider,wizard);
const getUnitAtMap=(x,y)=>actors.find(e=>e.mapX===x&&e.mapY===y&&!e.died)||null;
const AICombatValue={unitValue:()=>5,hitChance:()=>0.5};
const AI_TACTICAL_PROFILES={cautious:{goal:.5,offense:1,danger:2},balanced:{goal:1,offense:2,danger:1},aggressive:{goal:.75,offense:3,danger:.5},critical:{goal:1.5,offense:5,danger:.1}};
const checkLineOfSight=()=>true;
const ScenarioEvents={roundIndex:0,activeTurnPlayerInd:0,getRoomAt(){return null;}};
class AIThreatSystem{constructor(ai){this.ai=ai}syncDynamicBlockers(){} getDangerAt(){return 0} }
Object.assign(global,{map,wallsLayer,Entity,checkLineOfSight,units:actors,getUnitAtMap,AICombatValue,AI_TACTICAL_PROFILES,AIThreatSystem,ScenarioEvents});
for(const fname of ['aiconfig.js','aiheap.js','aislots.js','aiorder.js','aicellpolicy.js','aiguard.js','aihold.js','aitraffic.js','aipathfinder.js','ainavigator.js','aiturnplanner.js','aicontrol.js'])vm.runInThisContext(fs.readFileSync(root+fname,'utf8').replace(/\r\n/g,'\n'),{filename:fname});
const fake=(name,x,y,extra=1,canStepOn)=>({config:{name},mapX:x,mapY:y,features:{strength:2},evaluateStep(unit){return name==='web'&&unit.features.webImmunity?0:extra},...(canStepOn?{canStepOn}: {})});
const fire=fake('fire',3,5,100),web=fake('web',4,5,2),glue=fake('glue_blob',5,5,2),item=fake('item',6,5,1),door=fake('door',7,5,1),cabinet=fake('wardrobe',8,5,1,()=>false);
objects.push(fire,web,glue,item,door,cabinet);
function assess(u,x,y){return AICellPolicy.assess(u,x,y)}
assert.equal(assess(unit,3,5).blocked,true,'fire prohibited for normal chort');
assert(assess(unit,4,5).slotPenalty>0,'web penalty');
assert.equal(assess(spider,4,5).slotPenalty,0,'spider web immunity');
assert(assess(unit,5,5).slotPenalty>0,'glue penalized');
assert.equal(assess(unit,6,5).slotPenalty,0,'neutral item no slot penalty');
assert.equal(assess(unit,7,5).slotPenalty,0,'door no slot penalty');
assert(assess(unit,8,5).blocked,'non-passable furniture');
const immune={...unit,features:{...unit.features,fireImmunity:true}};
assert.equal(assess(immune,3,5).blocked,false,'future fire immunity hook');
assert.equal(assess(immune,3,5).movePenalty,0,'fire immune no artificial path cost');
const ai=new AIControl(player);player.aiControl=ai;
assert.equal(ai.macroMoveCellCost(unit,3,5),null,'macro-MOVE blocks fire');
assert.equal(ai.macroMoveCellCost(unit,4,5,2,5),1,'enter Web costs an ordinary step');
assert(ai.macroMoveCellCost(unit,5,5,4,5)>ai.macroMoveCellCost(unit,6,5,2,5),'leaving Web costs extra');
assert.equal(ai.getDistanceMap(unit,2,5)[5][3],-1,'distance map blocks fire');
assert.equal(ai.canMacroMoveThroughCell(unit,3,5),false,'physical next step also blocks');
assert(!ai.findMacroMovePath(unit,[5,5]).some(p=>p[0]===3&&p[1]===5),'path skirts the active fire');
assert.equal(ai.traffic.canUseCell(unit,3,5),false,'traffic refuses fire');
// Only passage via fire: no path should be found, even when destination is beyond it.
for(let x=1;x<=7;x++){walls.add(key(x,4));walls.add(key(x,6));}
assert.equal(ai.findMacroMovePath(unit,[4,5]),null,'cannot path through fire choke');
for(let x=1;x<=7;x++){walls.delete(key(x,4));walls.delete(key(x,6));}
// Guard evaluator must no longer blanket-ban neutral entities, but must avoid fire.
const guardEvaluator=new AIGuardEvaluator(ai,wizard,undefined,[unit,spider]);
assert(guardEvaluator.ringCells.some(c=>c.x===8&&c.y===5),'entity cell is in initial geometry');
const guardCandidates=guardEvaluator.getCandidates([unit,spider]);
assert(!guardCandidates.some(c=>c.x===3&&c.y===5),'fire excluded');
assert(guardCandidates.some(c=>c.x===6&&c.y===5),'item permitted as a defensive slot');
assert(guardCandidates.some(c=>c.x===4&&c.y===5),'web permitted with penalty/possible immunity');
assert(!guardCandidates.some(c=>c.x===8&&c.y===5),'non-passable furniture excluded');
// Direct unit-aware guard option calculation.
const itemSlot=guardCandidates.find(c=>c.x===6&&c.y===5);
assert(itemSlot);
const guardOptions=ai.guardCoordinator.buildGuardOptions(unit,[itemSlot]);
assert(guardOptions.length===1,'item slot usable by guard');
// HOLD can move out of its area, since this is a tactical objective, not a jail.
const hold=AIOrder.create('hold',null,[2,5],{state:{areaMode:'radius',radius:2}});
unit.aiControl.order=hold;
assert.equal(ai.canMacroMoveThroughCell(unit,10,5),true,'HOLD border no longer blocks traversable cells');
assert.equal(ai.canMacroMoveThroughCell(unit,3,5),false,'fire still blocks while HOLD active');
// HOLD slot selection shares the same restrictions, including real unit capabilities.
const area=ai.holdCoordinator.getArea(hold);
const group=ai.holdCoordinator.getGroup(unit,hold);
assert(group&&area);
const areaAssignment=group.assignments.get(unit);
assert.equal(area.unitScores.has(unit),true,'per-unit HOLD score cached');
assert(areaAssignment&&!assess(unit,areaAssignment.x,areaAssignment.y).blocked,'safe HOLD slot');
// policy also applies to frontier MOVE entries for otherwise weighted reachable cells.
const fakePlanner={ai,unit,goal:[9,5],profile:'balanced',getProfileWeights:(p)=>AI_TACTICAL_PROFILES[p],positionDangerAt:()=>0,goalProgressAt:()=>0,positionScoreAt:()=>0,adapter:null,focusTarget:null};
const adapter=new AIPlannerMatrixAdapter(fakePlanner);fakePlanner.adapter=adapter;
const state={x:2,y:5,move:3,ap:1,attackPoints:1};
const dmap=ai.getDistanceMap(unit,2,5);
const frontier=adapter.frontierEntries(state,unit,dmap,[{cell:[2,5],dist:0}]);
assert(!frontier.some(p=>p.cell[0]===3&&p.cell[1]===5),'frontier may not reintroduce fire');
// JUMP must not land on a burning cell either.
const extraFire=fake('fire',3,6,100);objects.push(extraFire);
const jump=new AIJumpActionProvider(fakePlanner);
const landings=jump.landingCells(state,{adapter:{getAbility:()=>({config:{range:3}})}});
assert(!landings.some(c=>c.x===3&&c.y===6),'JUMP cannot land on fire');
objects.pop();
// A new fire may appear after the macro-MOVE path is cached. Recheck just before the step.
unit.mapX=2;unit.mapY=8;const lateFire=fake('fire',3,8,100);objects.push(lateFire);
unit.aiControl.macroMove={target:[3,8],path:[[3,8]],pathIndex:0};
unit.canStepTo=()=>true;unit.stepTo=()=>{throw new Error('unsafe physical step executed')};
assert.equal(ai.continueMacroMove(unit),false,'new fire cancels cached macro move');
assert.equal(unit.aiControl.macroMove,null,'unsafe cached route invalidated');
objects.pop();
console.log('POLICY_PASS', {guardOptions:guardOptions.length,guardCandidates:guardCandidates.length,holdAssignment:areaAssignment});
