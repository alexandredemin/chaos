// Graph S1 headless integration: actual topology/geometry + strategy allocation.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'..','Html','aicontrol');
const rows=[
    '#########################',
    '#....#####......#####...#',
    '#....#####......#####...#',
    '#....#####......#####...#',
    '#.......................#',
    '#....#####......#####...#',
    '#....#####......#####...#',
    '#########################'
];
const W=rows[0].length,H=rows.length,walls=new Set();
const key=(x,y)=>x+':'+y;
for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(rows[y][x]==='#')walls.add(key(x,y));
const map={width:W,height:H,tileWidth:16,tileHeight:16,tileToWorldXY(x,y){return {x:x*16,y:y*16}}};
const wallsLayer={getTileAt(x,y){return walls.has(key(x,y))?{properties:{collides:true}}:null;}};
const metadata={rooms:[{id:'west',x:1,y:1,w:4,h:6},{id:'center',x:10,y:1,w:6,h:6},{id:'east',x:21,y:1,w:3,h:6}]};
const ScenarioEvents={mapMetadata:metadata};
const players=[];const units=[];
const player={name:'Us',units:[],wizard:null};const enemyPlayer={name:'Them',units:[],wizard:null};players.push(player,enemyPlayer);
function makeUnit(id,owner,x,y,wizard=false,health=4)
{
    const u={id,mapX:x,mapY:y,player:owner,died:false,
        config:{name:wizard?'Wizard':'Chort',features:{move:4}},features:{move:4,abilityPoints:1,attackPoints:1,health,strength:3,defense:1},aiControl:{order:null}};
    owner.units.push(u);units.push(u);if(wizard)owner.wizard=u;
    return u;
}
const wizard=makeUnit(1,player,2,2,true),a=makeUnit(2,player,3,2),b=makeUnit(3,player,3,3),c=makeUnit(4,player,2,5);
const enemyWizard=makeUnit(5,enemyPlayer,22,3,true),defender=makeUnit(6,enemyPlayer,11,3);
const AICombatValue={unitValue(u){return u===u.player.wizard?100:4;}};
const Entity={getEntitiesAtMap(){return[];}};
const ctx=vm.createContext({console,map,wallsLayer,ScenarioEvents,players,units,AICombatValue,Entity,
    checkLineOfSight(){return true;},getUnitAtMap(x,y){return units.find(u=>!u.died&&u.mapX===x&&u.mapY===y)||null;}});
function load(name){vm.runInContext(fs.readFileSync(path.join(root,name),'utf8').replace(/\r\n/g,'\n'),ctx,{filename:name});}
for(const name of ['aiconfig.js','aistrategicgeometry.js','aitopologygraph.js','aitopologyruntime.js','aiorder.js','aistrategicplanner.js','aigraphstrategicplanner.js'])load(name);
const get=vm.runInContext('AITopologyRuntime.get.bind(AITopologyRuntime)',ctx);
let graph=get();assert.equal(graph.zones.length,3);assert.equal(graph.connections.length,2);
assert.strictEqual(get(),graph,'one shared cached graph');
assert.equal(graph.areaZone[4*W+7],0,'generated corridors are not part of room footprint');
assert(graph.cellZone[4*W+7]>0,'but corridors belong to catchments');
const registry=vm.runInContext('AIStrategicPlannerRegistry',ctx);
assert(registry.has('graph'));
class FakeAI
{
    constructor(player){this.player=player;this.commands=[];this.distantThreats=[];this.threats=[];this.guardCoordinator=null;}
    getTopologyGraph(){return get();}
    isUnitKnown(u){return !u.died&&u.id!==999;}
    computeEnemiesInfo(){}
    canStillAct(u){return u.features.move>0||u.features.abilityPoints>0;}
    ensureUnitAIControl(u){return u.aiControl;}
    getOrder(u){return u.aiControl.order;}
    setOrder(u,order){u.aiControl.order=order;this.commands.push([u.id,'set',order?.type||'none']);return order;}
    setEngageOrder(u,target,options={})
    {
        const order=ctx.orderFactory('engage',target,[target.mapX,target.mapY],{reason:options.reason||'attack'});
        return this.setOrder(u,order);
    }
    setHoldOrder(u,pos,options={})
    {
        return this.setOrder(u,ctx.orderFactory('hold',null,pos,{state:{areaMode:options.areaMode||'radius',radius:options.radius||5,...options.state}}));
    }
    chooseGuardTarget(u){return this.setOrder(u,ctx.orderFactory('guard',wizard,[wizard.mapX,wizard.mapY]));}
    getDistanceMap(u,x,y)
    {
        const d=Array.from({length:H},()=>Array(W).fill(-1)),q=[[x,y]];d[y][x]=0;
        for(let i=0;i<q.length;i++)
        {
            const [x,y]=q[i];for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)
            {
                if(!dx&&!dy)continue;const xx=x+dx,yy=y+dy;
                if(xx<0||yy<0||xx>=W||yy>=H||walls.has(key(xx,yy))||d[yy][xx]>=0)continue;
                d[yy][xx]=d[y][x]+1;q.push([xx,yy]);
            }
        }
        return d;
    }
    assignTargets(threats,midTurn)
    {
        if(!threats.length)return;
        const available=player.units.filter(u=>u!==wizard&&!u.died&&(!midTurn||this.canStillAct(u)));
        const u=available[0];if(u)this.setEngageOrder(u,threats[0].enemy,{reason:'intercept'});
    }
}
ctx.orderFactory=vm.runInContext('AIOrder.create.bind(AIOrder)',ctx);
const ai=new FakeAI(player),planner=registry.create('graph',ai);player.aiControl=ai;
assert.equal(planner.config.maxActiveGoals,2);
let visible=planner.visibleZones(graph);assert.equal(visible.size,3);
let observed=planner.observed(graph,visible);
let candidates=planner.generateCandidates(graph,visible,observed);
assert(candidates.some(g=>g.type==='ATTACK_WIZARD'));
assert(candidates.some(g=>g.type==='CAPTURE_ZONE'&&g.zoneId===2));
assert(!candidates.some(g=>g.type==='HOLD_ZONE'&&g.zoneId===3),'enemy wizard zone should not be garrisoned');
const available=[a,b,c],maps=planner.unitDistances(available);
const before=ai.commands.length;
for(const n of [1,2,3])
{
    planner.config.maxActiveGoals=n;
    const portfolios=planner.allPortfolios(candidates,available,maps);
    assert(portfolios.length>=1);
    for(const p of portfolios)
    {
        assert(p.goals.length<=n);
        assert.equal(new Set(p.assignments.keys()).size,p.assignments.size,'no double allocation');
        assert(p.goals.filter(g=>g.status==='PREPARING'&&g.type!=='HOLD_ZONE').length<=1);
    }
}
assert.equal(ai.commands.length,before,'trial allocations are side-effect free');
planner.config.maxActiveGoals=2;
planner.plan(false);assert(planner.lastDecision);
assert(planner.lastDecision.goals.length<=2);
assert(planner.lastDecision.allocations.every(x=>x.unit!==wizard));
const remembered=new Map(player.units.map(u=>[u,u.aiControl.order]));
const initialCommands=ai.commands.length;
planner.plan(false);
assert.equal(ai.commands.length,initialCommands,'stable plan and wizard defense do not rewrite orders');
// Mid-turn interception may act on still available soldiers, but spent units
// and the portfolio keys must survive unchanged.
const storedKeys=[...planner.activeKeys],oldOrder=b.aiControl.order;
b.features.move=0;b.features.abilityPoints=0;
defender.mapX=3;defender.mapY=4;
planner.plan(true);
assert.deepEqual(Array.from(planner.activeKeys),Array.from(storedKeys));
assert.strictEqual(b.aiControl.order,oldOrder,'spent unit untouched on mid-turn');
assert.equal(planner.lastDecision.reason,'mid-turn defense');
// CAPTURE -> HOLD only once observed defender has disappeared AND we arrived.
const oldGoal=planner.goals.get('zone:2')||{lastProgressTurn:planner.turn,status:'EXECUTING'};
oldGoal.type='CAPTURE_ZONE';planner.goals.set('zone:2',oldGoal);
defender.died=true;c.mapX=11;c.mapY=4;
observed=planner.observed(graph,planner.visibleZones(graph));
candidates=planner.generateCandidates(graph,planner.visibleZones(graph),observed);
assert(candidates.some(g=>g.key==='zone:2'&&g.type==='HOLD_ZONE'),'occupied cleared capture becomes HOLD');
c.mapX=2;c.mapY=5;
candidates=planner.generateCandidates(graph,planner.visibleZones(graph),planner.observed(graph,planner.visibleZones(graph)));
assert(candidates.some(g=>g.key==='zone:2'&&g.type==='CAPTURE_ZONE'),'unreached capture does not complete early');
// Unknown units must not influence zone control or goal generation.
const invisible=makeUnit(999,enemyPlayer,12,5);
assert(!planner.observed(graph,planner.visibleZones(graph)).enemy.get(2)?.includes(invisible));
// Sealed hidden room physically disconnected: topology recomputed on wall edits.
for(let x=5;x<=9;x++)walls.add(key(x,4));
for(let x=16;x<=20;x++)walls.add(key(x,4));
const sealed=get();assert.notStrictEqual(sealed,graph,'collision-map edit invalidates cache');
visible=planner.visibleZones(sealed);assert(visible.has(1)&&!visible.has(2)&&!visible.has(3));
candidates=planner.generateCandidates(sealed,visible,planner.observed(sealed,visible));
assert(!candidates.some(g=>g.type==='ATTACK_WIZARD'||g.zoneId===2),'unrevealed components not planned');
// HOLD graph-zone geometry uses ORIGINAL footprint, excluding corridor catchments.
for(let x=5;x<=9;x++)walls.delete(key(x,4));
for(let x=16;x<=20;x++)walls.delete(key(x,4));
graph=get();c.mapX=2;c.mapY=5;
ctx.ai=ai;ctx.getUnitAtMap=(x,y)=>units.find(u=>!u.died&&u.mapX===x&&u.mapY===y)||null;
load('aislots.js');load('aihold.js');
ctx.holdArea=vm.runInContext('AIHoldArea',ctx);
const zone=graph.zones[1];
const area=new ctx.holdArea(ai,[zone.x,zone.y],'graphZone',5,{fireRayCount:4,fireRayRadius:4,fireExposureTau:16},graph.areaZone,zone.id);
assert.equal(area.cells.length,zone.area,'HOLD exact original room geometry');
assert(!area.contains(7,4),'HOLD does not consume corridor');
const coordinator=vm.runInContext('AIHoldCoordinator',ctx);
const holdCoordinator=new coordinator(ai,{fireRayCount:4,fireRayRadius:4,fireExposureTau:16,defaultRadius:5});
const holdOrder=ctx.orderFactory('hold',null,[zone.x,zone.y],{state:{areaMode:'graphZone',zoneId:zone.id,radius:5}});
assert.equal(holdCoordinator.areaKey(holdOrder),'graphZone:'+zone.id);
assert.equal(holdCoordinator.getArea(holdOrder).cells.length,zone.area,'real HOLD order resolves topology zone mask');
console.log('AI_GRAPH_S1_PASS',{zones:graph.zones.length,active:planner.lastDecision.goals.length,candidates:candidates.length,orders:ai.commands.length});

// Stabilization regression: a live offensive operation must NOT restart after
// losing strength or being temporarily borrowed for wizard interception.
const AIOrder=vm.runInContext('AIOrder',ctx);
for(const u of [a,b,c]){u.died=false;u.features.move=4;u.features.abilityPoints=1;ai.setOrder(u,null);}
ai.distantThreats=[];defender.died=true;
const stable=registry.create('graph',ai);
stable.config.maxActiveGoals=1;
stable.plan(false);
const attackKey=stable.keyOfWizard(enemyWizard);
console.log('FIRST_GOAL', stable.lastDecision.goals.map(g=>({key:g.key,type:g.type,status:g.status,strength:g.strength})));
assert(stable.activeKeys.includes(attackKey),'wizard attack starts after reaching critical mass');
assert.equal(stable.goals.get(attackKey).status,'EXECUTING');
assert([...stable.assignments].some(([u,key])=>key===attackKey));
// The last known attack strength is now insufficient, but execution is latched.
c.died=true;stable.plan(false);
assert.equal(stable.goals.get(attackKey).status,'EXECUTING','losses must not restart PREPARING');
assert(stable.activeKeys.includes(attackKey),'in-flight attack survives loss');
assert.equal(stable.lastDecision.goals[0].readiness,1);
assert(stable.lastDecision.goals[0].supplyRatio<1,'supply reflects real losses');
assert([a,b].some(u=>AIOrder.is(ai.getOrder(u),'engage')),'remaining attackers continue');
// On a sudden independent shooter, defendWizard can borrow a soldier;
// the strategic group key must NOT disappear when the soldier turns INTERCEPT.
ai.distantThreats=[defender];defender.died=false;
stable.plan(true);
const taken=[a,b].filter(u=>AIOrder.is(ai.getOrder(u),'intercept'));
assert(taken.length,'fake legacy interception matcher borrowed an attacker');
const borrowed=taken[0];
assert.equal(stable.assignments.get(borrowed),attackKey,'intercept retains strategic assignment');
assert(stable.goalReport(stable.lastDecision.goals[0]).supplyRatio<1,'borrowed soldier is not counted as deployed strength');
defender.died=true;ai.distantThreats=[];
stable.plan(false);
assert.equal(stable.assignments.get(borrowed),attackKey,'soldier returns to same operation');
assert(AIOrder.is(ai.getOrder(borrowed),'engage')&&AIOrder.reason(ai.getOrder(borrowed))==='attack','interceptor resumes attack');
// More forces must not be left without any job.
a.died=false;b.died=false;c.died=false;
const free=makeUnit(1100,player,2,3); // another unit; only one active goal, excess goes to GUARD
stable.plan(false);
for(const u of player.units)
{
    if(u===wizard||u.died||stable.assignments.has(u)||AIOrder.is(ai.getOrder(u),'intercept'))continue;
    assert(AIOrder.is(ai.getOrder(u),'guard'),'unassigned soldiers must GUARD wizard');
}
// Newly conjured soldiers should also get GUARD on mid-turn defense-only planning.
const midSummon=makeUnit(1101,player,2,4);
stable.plan(true);
assert(AIOrder.is(ai.getOrder(midSummon),'guard'),'new summon immediately GUARDs during mid-turn');
console.log('AI_GRAPH_STABILITY_PASS',{goal:attackKey,turn:stable.turn,supply:stable.goalReport(stable.lastDecision.goals[0]).supplyRatio});

// Map overlay refresh is in AITest only; no hooks in Unit / GameScene.
const visibleLabels=[];
const scene={add:{
    graphics(){return{lineStyle(){},strokeCircle(){},lineBetween(){},destroy(){}};},
    text(x,y,value){const label={value,active:true,setDepth(){return this;},destroy(){this.active=false;}};
        visibleLabels.push(label);return label;}
}};
for(const u of player.units)u.scene=scene;
ai.getStrategicPlanner=()=>stable;
const testSource=fs.readFileSync(path.join(root,'aitest.js'),'utf8').replace(/AITest\.init\(\);\s*$/,'');
vm.runInContext(testSource,ctx,{filename:'aitest.js'});
const test=vm.runInContext('AITest',ctx);
test.debugUnit=a;test.guardOverlayMode='strategy:goals';
test.refreshStrategyOverlay(true);
const firstStamp=test.guardOverlaySignature;
assert(visibleLabels.some(x=>x.active&&x.value.includes('SUP ')),'executing goal shows current supply ratio');
assert(visibleLabels.some(x=>x.active&&x.value==='GUARD'),'unassigned GUARD is displayed');
a.mapX+=1;test.refreshStrategyOverlay(false);
assert.notEqual(test.guardOverlaySignature,firstStamp,'the overlay reacts to unit motion within AI turn');
defender.died=false;
ai.setEngageOrder(a,defender,{reason:'intercept'});
test.refreshStrategyOverlay(false);
assert(visibleLabels.some(x=>x.active&&x.value.startsWith('INT')),'current interceptor order shown');
assert(!visibleLabels.some(x=>x.active&&x.value==='DEF'),'ambiguous DEF label no longer used');
const panel=test.formatGraphDecision(stable);
assert(panel.includes('supply=')&&panel.includes('INTERCEPT'),'diagnostic panel has live support and assignments');
test.clearGuardOverlay();
console.log('AI_GRAPH_OVERLAY_PASS',{labels:visibleLabels.length});
