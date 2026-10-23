// Regression: weighted cheapest A* can take MORE steps than remaining MOVE,
// and the AITest inspector must display the SAME edge costs as Dijkstra.
const assert=require('assert'),fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.join(__dirname,'..','Html','aicontrol')+path.sep;
const W=11,H=9,blocked=new Set(),entities=[],key=(x,y)=>x+':'+y;
const map={width:W,height:H,tileToWorldXY(x,y){return{x:x*16,y:y*16}}};
const wallsLayer={getTileAt(x,y){return blocked.has(key(x,y))?{properties:{collides:true}}:null;}};
class Entity{static getEntitiesAtMap(x,y){return entities.filter(e=>e.mapX===x&&e.mapY===y);}}
const player={name:'AI',units:[],wizard:null};
const unit={id:1,mapX:2,mapY:4,player,died:false,config:{name:'Chort',features:{move:3}},features:{move:3,abilityPoints:0,attackPoints:0}};
player.units.push(unit);
let diagnosticTargetOccupant=null;
function getUnitAtMap(x,y){
    if(x===unit.mapX&&y===unit.mapY)return unit;
    if(diagnosticTargetOccupant&&x===diagnosticTargetOccupant.mapX&&y===diagnosticTargetOccupant.mapY)return diagnosticTargetOccupant;
    return null;
}
const AI_TACTICAL_PROFILES={balanced:{goal:1,offense:2,danger:1}};
class AIThreatSystem{constructor(){}syncDynamicBlockers(){}getDangerAt(u,x,y){return x===3&&y===4?10:0;}}
class AITrafficController{constructor(){}canRequestYield(){return false;}}
class AIGuardCoordinator{constructor(){}getGameTurnStamp(){return 1;}}
class AIHoldCoordinator{constructor(){}}
Object.assign(global,{map,wallsLayer,Entity,getUnitAtMap,AI_TACTICAL_PROFILES,AIThreatSystem,AITrafficController,AIGuardCoordinator,AIHoldCoordinator});
for(const f of ['aiconfig.js','aiheap.js','aiorder.js','aicellpolicy.js','aipathfinder.js','ainavigator.js','aicontrol.js'])vm.runInThisContext(fs.readFileSync(root+f,'utf8'),{filename:f});
for(let x=0;x<W;x++){blocked.add(key(x,0));blocked.add(key(x,H-1));}
for(let y=0;y<H;y++){blocked.add(key(0,y));blocked.add(key(W-1,y));}
// A vertical barrier; straight 3-step path uses Web, cheap detour needs 6 steps.
for(const y of [2,3,5,6,7])blocked.add(key(3,y));
entities.push({mapX:3,mapY:4,features:{},config:{name:'web'},evaluateStep(){return 3;}});
const ai=new AIControl(player);player.aiControl=ai;
const src=[2,4],dst=[5,4];
const globalRoute=AIPathfinder.findPath(unit,src,dst),bounded=AIPathfinder.findPath(unit,src,dst,{maxSteps:unit.features.move});
assert(globalRoute&&bounded,'both routes exist');
assert(globalRoute.cells.length>unit.features.move,'cheap detour too long to execute in one turn');
assert(bounded.cells.length<=unit.features.move,'constrained A* finds executable alternative');
assert(bounded.cost>globalRoute.cost,'bounded route costs more because it crosses Web');
assert.equal(ai.findMacroMovePath(unit,dst),null,'macro-MOVE rejects a route exceeding weighted budget');
// Escape from an existing sticky tile is still allowed as a ONE-step attempt.
unit.mapX=3;unit.mapY=4;
assert.deepEqual(ai.findMacroMovePath(unit,[4,4]),[[4,4]],'trapped unit can attempt adjacent escape');
unit.mapX=2;unit.mapY=4;

const sceneLabels=[],scene={add:{text(x,y,value){let item={text:value,active:true,setDepth(){return this;},setAlpha(){return this;},destroy(){this.active=false;}};sceneLabels.push(item);return item;}}};
unit.scene=scene;
const originalConsole=console.log; // capture diagnostics without relying on browser DOM
const code=fs.readFileSync(root+'aitest.js','utf8').replace(/AITest\.init\(\);\s*$/,'');
vm.runInThisContext(code,{filename:'aitest.js'});
AITest.debugUnit=unit;AITest.pathGoal=dst;AITest.pathRisk=0;AITest.pathLimitMove=false;AITest.pathViewRadius=0;AITest.guardOverlayMode='path:route';
AITest.refreshGuardOverlay(true);
assert(sceneLabels.some(x=>x.text==='S')&&sceneLabels.some(x=>x.text==='G'),'start and goal marked');
assert(sceneLabels.some(x=>x.text==='1'),'path step marked');
const d=AITest.computePathDiagnostic(unit,dst,0,false);
assert.equal(d.astar.cost,globalRoute.cost);
assert.equal(d.reverse[unit.mapY][unit.mapX],globalRoute.cost,'reverse Dijkstra matches unconstrained A*');
assert.equal(d.forward[dst[1]][dst[0]],globalRoute.cost,'forward Dijkstra matches unconstrained A*');
AITest.pathLimitMove=true;AITest.guardOverlayMode='path:astar';AITest.refreshGuardOverlay(true);
assert(AITest.pathSummary.includes('NO ROUTE'),'one-turn weighted budget shown in status');
AITest.guardOverlayMode='path:reverse';AITest.refreshGuardOverlay(true);
assert(sceneLabels.some(x=>x.active&&x.text===globalRoute.cost.toFixed(1)),'distance overlay shows weighted cost');
AITest.setGuardOverlayMode('none');assert.equal(AITest.guardOverlayObjects.length,0,'overlay cleanup');
// AITest is a *measurement* tool: unlike runtime movement, occupied destinations
// must remain valid goals, while blocked transit cells must not become walkable.
diagnosticTargetOccupant={mapX:dst[0],mapY:dst[1],died:false,player:{name:'enemy'}};
assert.equal(ai.canMacroMoveThroughCell(unit,...dst),false,'occupied cell remains forbidden to runtime macro-MOVE');
assert.equal(ai.findMacroMovePath(unit,dst),null,'runtime still cannot step onto enemy');
const occupied=AITest.computePathDiagnostic(unit,dst,0,false);
assert(occupied.astar,'diagnostic A* can inspect occupied target');
assert(occupied.reverse[unit.mapY][unit.mapX]>=0,'reverse Dijkstra reaches occupied target');
assert.equal(occupied.astar.cost,occupied.reverse[unit.mapY][unit.mapX], 'both algorithms agree on occupied goal');
AITest.pathGoal=dst;AITest.pathLimitMove=false;AITest.setGuardOverlayMode('path:route');
assert(!AITest.pathSummary.includes('NO ROUTE'),'occupied goal display no longer says NO ROUTE');
// The exception belongs ONLY to the exact diagnostic terminal position.
assert.equal(ai.canMacroMoveThroughCell(unit,...dst),false);
diagnosticTargetOccupant=null;

console.log('PATH_DIAGNOSTIC_PASS',{cheap:globalRoute.cells.length,bounded:bounded.cells.length,cheapCost:globalRoute.cost,boundedCost:bounded.cost});
