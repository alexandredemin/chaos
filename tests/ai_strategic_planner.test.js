// S1.0: per-player strategy registry, Legacy extraction invariance and caller compatibility.
const assert=require('assert'),fs=require('fs'),vm=require('vm'),crypto=require('crypto'),path=require('path');
const root=path.join(__dirname,'..','Html','aicontrol');
const legacy=fs.readFileSync(path.join(root,'ailegacystrategicplanner.js'),'utf8');
const begin=legacy.indexOf('        const ai=this.ai;');
const finish=legacy.indexOf('\n    }\n}\n\nAIStrategicPlannerRegistry.register',begin);
assert(begin>=0&&finish>begin,'legacy method exists');
const oldBody=legacy.slice(begin+'        const ai=this.ai;'.length,finish).replace(/\bai\./g,'this.');
const oldMethod='    planning(midTurn=false)\n    {'+oldBody+'\n    }\n';
// SHA of the exact pre-refactor method, extracted before any refactor.
const originalDigest='c108986ca6910b0daa19446505ac64ec6408600fd6c64fbf5d5ddc339da607a2';
assert.equal(crypto.createHash('sha256').update(oldMethod).digest('hex'),originalDigest,
    'Legacy decisions must stay byte-for-byte identical aside from this->ai substitution');
const context=vm.createContext({console,document:{addEventListener(){}}});
for(const file of ['aiconfig.js','aistrategicplanner.js','ailegacystrategicplanner.js'])
    vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context,{filename:file});
vm.runInContext(`
    const fakeAI={player:{units:[],wizard:null},computeEnemiesInfo(){this.calls.push('compute');},calls:[]};
    const legacyPlanner=AIStrategicPlannerRegistry.create('legacy',fakeAI);
    const names=AIStrategicPlannerRegistry.list();
    const unknownThrows=(()=>{try{AIStrategicPlannerRegistry.create('missing',fakeAI);return false;}catch{return true;}})();
    AIStrategicPlannerRegistry.register('fixture',ai=>({plan(midTurn){ai.calls.push(midTurn?'mid':'turn');}}));
    const other=AIStrategicPlannerRegistry.create('fixture',fakeAI);
    other.plan(false);other.plan(true);
    globalThis.registryResult={names,unknownThrows,calls:fakeAI.calls};
`,context);
assert.deepEqual(Array.from(context.registryResult.names),['legacy']);
assert(context.registryResult.unknownThrows);
assert.deepEqual(Array.from(context.registryResult.calls),['turn','mid']);
// AIControl remains the stable public entry point. Instantiate with minimal helper stubs.
vm.runInContext(`
    class AITrafficController{constructor(){}}
    class AIThreatSystem{constructor(){}}
    class AIGuardCoordinator{constructor(){}}
    class AIHoldCoordinator{constructor(){}}
    class AIMoveToNavigator{constructor(){}}
`,context);
vm.runInContext(fs.readFileSync(path.join(root,'aicontrol.js'),'utf8'),context,{filename:'aicontrol.js'});
vm.runInContext(`
    const p1={name:'P1',units:[],wizard:null},p2={name:'P2',units:[],wizard:null};
    const a=new AIControl(p1),b=new AIControl(p2);a.calls=[];
    const initial=[a.getStrategicPlannerName(),b.getStrategicPlannerName()];
    a.setStrategicPlanner('fixture');
    a.planning(false);a.planning(true);
    const independent=b.getStrategicPlannerName();
    let unknownSelection=false;
    try{a.setStrategicPlanner('missing');}catch(e){unknownSelection=true;}
    globalThis.dispatchResult={initial,independent,selected:a.getStrategicPlannerName(),p1:p1.strategicPlannerId,
        p2:p2.strategicPlannerId||null,unknownSelection,events:a.calls};
`,context);
assert.deepEqual(Array.from(context.dispatchResult.initial),['legacy','legacy']);
assert.equal(context.dispatchResult.selected,'fixture');
assert.equal(context.dispatchResult.independent,'legacy');
assert.equal(context.dispatchResult.p1,'fixture');
assert.equal(context.dispatchResult.p2,null);
assert(context.dispatchResult.unknownSelection);
console.log('AI_STRATEGIC_PLANNER_PASS',{legacyUnchanged:true,perPlayer:true,midTurn:true});
// Minimal DOM smoke test for the F8 category selector (no Phaser necessary).
const ui=vm.createContext({console,document:{addEventListener(){}}});
for(const name of ['aiconfig.js','aiorder.js','aistrategicplanner.js','ailegacystrategicplanner.js'])
    vm.runInContext(fs.readFileSync(path.join(root,name),'utf8'),ui,{filename:name});
vm.runInContext(`
    document.createElement=function(tag){
        return {tagName:tag,children:[],style:{},value:'',textContent:'',
            appendChild(child){this.children.push(child);return child;},
            append(...children){this.children.push(...children);},
            set innerHTML(v){this.children=[];this.html=v;},get innerHTML(){return this.html||'';}};
    };
    document.body={appendChild(){}};
    globalThis.selectedUnit=null;
`,ui);
vm.runInContext(fs.readFileSync(path.join(root,'aitest.js'),'utf8').replace(/AITest\.init\(\);\s*$/,''),ui,{filename:'aitest.js'});
vm.runInContext(`
    const player={name:'Test',aiControl:{getTacticalProfile(){return 'balanced';},
        getStrategicPlannerName(){return 'legacy';},setStrategicPlanner(){}}};
    const unit={player,mapX:1,mapY:1,config:{name:'Chort'},aiControl:{order:null}};
    AITest.debugUnit=unit;AITest.draft=AITest.makeDraft(unit);AITest.menu=document.createElement('div');
    const textTree=node=>[node.textContent||'',...(node.children||[]).flatMap(x=>typeof x==='object'?textTree(x):[String(x)])].join(' ');
    const views={};for(const type of ['orders','strategy','path','geometry','guard','hold','danger']){
        AITest.menuCategory=type;AITest.renderMenu();views[type]=textTree(AITest.menu);
    }
    globalThis.menuViews=views;
`,ui);
const views=ui.menuViews;
assert(views.path.includes('PATHFINDER DIAGNOSTICS')&&!views.orders.includes('PATHFINDER DIAGNOSTICS'));
assert(views.geometry.includes('MAP TOPOLOGY')&&!views.hold.includes('MAP TOPOLOGY'));
assert(views.strategy.includes('Strategic planner')&&!views.orders.includes('Strategic planner'));
assert(views.orders.includes('Order:')&&!views.danger.includes('Order:'));
console.log('AI_TEST_CATEGORIES_PASS');
