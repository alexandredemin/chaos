// Static loader and pure-coordinator regression after centralizing AI modules.
const assert=require('assert'),fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const allScripts=[...html.matchAll(/<script\s+[^>]*src="([^"]+)"/g)].map(m=>m[1]);
for(const src of allScripts)assert(fs.existsSync(path.join(root,src)),'broken script import '+src);
const aiScripts=allScripts.filter(s=>s.startsWith('Html/aicontrol/'));
assert(aiScripts.length>=18,'runtime modules are registered');
assert.equal(aiScripts[0],'Html/aicontrol/aiconfig.js','constants loaded first');
assert(aiScripts.indexOf('Html/aicontrol/aiheap.js')<aiScripts.indexOf('Html/aicontrol/aipathfinder.js'));
assert(aiScripts.indexOf('Html/aicontrol/aislots.js')<aiScripts.indexOf('Html/aicontrol/aiguard.js'));
assert(aiScripts.indexOf('Html/aicontrol/behaviors.js')<aiScripts.indexOf('Html/aicontrol/independentai.js'));
assert(!fs.readdirSync(path.join(root,'Html')).some(f=>/^ai.*\.js$/.test(f)),'no loose AI files in Html root');
const context=vm.createContext({console,document:{addEventListener(){}}});
for(const src of aiScripts)vm.runInContext(fs.readFileSync(path.join(root,src),'utf8'),context,{filename:src});
assert(vm.runInContext('typeof AITurnPlanner === "function" && typeof AIControl === "function" && typeof IndependentAIControl === "function"',context),'AI classes load');
assert(vm.runInContext('typeof AI_TACTICAL_PROFILES === "object" && AI_HOLD_CONFIG.fireRayCount === 16',context),'AI tuning values intact');
const heap=vm.runInContext('AIDistanceMinHeap',context),h=new heap();
for(const d of [8,1,4,2,7,3,9,0,6,5])h.push({d});
for(let d=0;d<10;d++)assert.equal(h.pop().d,d,'shared heap order');
assert.equal(h.length,0);
const choose=vm.runInContext('AISlotAssignment.bestByRegret',context);
const orders=new Map([
    ['flexible',[{id:'north',utility:.95},{id:'south',utility:.9}]],
    ['restricted',[{id:'north',utility:.94},{id:'south',utility:.2}]]
]);
assert.equal(choose(['flexible','restricted'],u=>orders.get(u)).unit,'restricted','regret-greedy protects constrained units');
console.log('AI_REFACTOR_STRUCTURE_PASS',{loaded:aiScripts.length,scripts:allScripts.length});
