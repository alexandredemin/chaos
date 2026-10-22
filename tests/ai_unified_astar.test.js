// Regression for the shared exit-cost transition model and universal A*.
const assert=require('assert'),fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.join(__dirname,'..','Html')+path.sep;
const W=14,H=11,obstacles=new Set(),entities=[],key=(x,y)=>y*W+x;
const map={width:W,height:H},wallKey=(x,y)=>obstacles.has(key(x,y));
const wallsLayer={getTileAt(x,y){return wallKey(x,y)?{properties:{collides:true}}:null;}};
class Entity{static getEntitiesAtMap(x,y){return entities.filter(e=>e.mapX===x&&e.mapY===y);}}
const player={units:[],wizard:null};
const unit={mapX:1,mapY:2,died:false,player,features:{move:3,strength:3},config:{name:'chort',features:{move:3}}};player.units.push(unit);
function getUnitAtMap(x,y){return unit.mapX===x&&unit.mapY===y?unit:null;}
const AI_TACTICAL_PROFILES={balanced:{goal:1,danger:1}};
class AIThreatSystem{constructor(ai){this.ai=ai;}syncDynamicBlockers(){}getDangerAt(u,x,y){return y===2&&x>=3&&x<=7?100:0;}}
class AITrafficController{constructor(){}canRequestYield(){return false;}}
class AIGuardCoordinator{constructor(){}getGameTurnStamp(){return 1;}}
class AIHoldCoordinator{constructor(){}}
Object.assign(global,{map,wallsLayer,Entity,getUnitAtMap,AI_TACTICAL_PROFILES,AIThreatSystem,AIGuardCoordinator,AIHoldCoordinator,AITrafficController});
for(const f of ['aicellpolicy.js','aipathfinder.js','ainavigator.js','aicontrol.js'])
    vm.runInThisContext(fs.readFileSync(root+f,'utf8'),{filename:f});
const ai=new AIControl(player);player.aiControl=ai;
const fake=(name,x,y,penalty)=>({mapX:x,mapY:y,config:{name},features:{},evaluateStep(){return penalty;}});
for(let x=0;x<W;x++){obstacles.add(key(x,0));obstacles.add(key(x,H-1));}
for(let y=0;y<H;y++){obstacles.add(key(0,y));obstacles.add(key(W-1,y));}
const pathCost=(cells,start,opts={})=>{
    let [fx,fy]=start,cost=0;
    for(const [x,y] of cells){const edge=AICellPolicy.transitionCost(unit,fx,fy,x,y,opts);assert.notEqual(edge,null);cost+=edge;fx=x;fy=y;}
    return cost;
};
// One-cell-wide corridor makes entering vs leaving an entity unambiguous.
for(let x=1;x<=7;x++){obstacles.add(key(x,1));obstacles.add(key(x,3));}
entities.push(fake('web',3,2,2),fake('glue_blob',4,2,1));
const normal=(a,b)=>AICellPolicy.transitionCost(unit,...a,...b);
assert.equal(normal([2,2],[3,2]),1,'entering Web is an ordinary step');
assert.equal(normal([3,2],[4,2]),7,'leaving Web adds two full turns');
assert.equal(normal([4,2],[5,2]),4,'leaving Glue adds one full turn');
assert.equal(ai.getDistanceMap(unit,1,2)[2][3],2,'forward Dijkstra does not charge entry');
assert.equal(ai.getMultiSourceDistanceMap(unit,[[3,2]],{reverse:true}).distances[2][1],2,'reverse map computes cost TO Web');
assert.equal(ai.getMultiSourceDistanceMap(unit,[[1,2]],{reverse:true}).distances[2][3],8,'reverse map computes cost FROM Web');
const corridor=AIPathfinder.findPath(unit,[1,2],[5,2]);
assert.equal(corridor.cost,13,'correct A* weighted corridor cost');
assert.deepEqual(corridor.cells,[[2,2],[3,2],[4,2],[5,2]]);
assert.equal(ai.findMacroMovePath(unit,[5,2]).length,4,'macro-MOVE uses shared route');
assert.equal(ai.navigator.findPath(unit,[1,2],[5,2],0).cost,13,'MOVE_TO uses shared route');
entities.length=0;obstacles.clear();
for(let x=0;x<W;x++){obstacles.add(key(x,0));obstacles.add(key(x,H-1));}
for(let y=0;y<H;y++){obstacles.add(key(0,y));obstacles.add(key(W-1,y));}
// Independent shortest-path oracle: simple O(V^2) unoptimized Dijkstra.
function oracle(start,goal,riskPenalty=null)
{
    const distance=new Map([[key(...start),0]]),done=new Set(),width=W;
    while(true)
    {
        let current=-1,best=Infinity;
        for(const [k,cost] of distance)if(!done.has(k)&&cost<best){best=cost;current=k;}
        if(current<0)return Infinity;
        const x=current%width,y=Math.floor(current/width);
        if(x===goal[0]&&y===goal[1])return best;
        done.add(current);
        for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)
        {
            if(!dx&&!dy)continue;
            const nx=x+dx,ny=y+dy;
            if(nx<0||ny<0||nx>=W||ny>=H)continue;
            const n=key(nx,ny);
            const edge=AICellPolicy.transitionCost(unit,x,y,nx,ny,{riskPenalty});
            if(edge==null)continue;
            const d=best+edge;
            if(d<(distance.get(n)??Infinity))distance.set(n,d);
        }
    }
}
let rng=1729;function random(){rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296;}
let cases=0;
for(let scenario=0;scenario<15;scenario++)
{
    obstacles.clear();entities.length=0;
    for(let y=0;y<H;y++)for(let x=0;x<W;x++)
    {
        if(!x||!y||x===W-1||y===H-1||(random()<.19&&!(x===1&&y===2)&&!(x===12&&y===9)))obstacles.add(key(x,y));
        else if(random()<.16)entities.push(fake(random()<.5?'web':'glue_blob',x,y,random()<.5?1:3));
    }
    for(const risk of [null,(x,y)=>x>5?3:0])
    {
        const opts=risk?{riskPenalty:risk}:{};
        const expected=oracle([1,2],[12,9],risk),actual=AIPathfinder.findPath(unit,[1,2],[12,9],opts);
        assert.equal(actual?.cost??Infinity,expected,'A* cost must match independent oracle');
        if(actual)assert.equal(pathCost(actual.cells,[1,2],opts),expected,'reconstructed path cost');
        const dmap=ai.getMultiSourceDistanceMap(unit,[[12,9]],{reverse:true}).distances;
        if(!risk)assert.equal(dmap[2][1]<0?Infinity:dmap[2][1],expected,'reverse Dijkstra matches forward A*');
        cases++;
    }
}
// Explicitly verify risk only affects global route, not the macro-MOVE A*.
obstacles.clear();entities.length=0;
for(let x=0;x<W;x++){obstacles.add(key(x,0));obstacles.add(key(x,H-1));}
for(let y=0;y<H;y++){obstacles.add(key(0,y));obstacles.add(key(W-1,y));}
const clearRoute=ai.navigator.findPath(unit,[1,2],[9,2],0);
const safeRoute=ai.navigator.findPath(unit,[1,2],[9,2],2);
assert(clearRoute&&safeRoute);
assert(safeRoute.cells.some(([x,y])=>y!==2),'risk-aware MOVE_TO diverts around dangerous cells');
assert.equal(pathCost(ai.findMacroMovePath(unit,[9,2]),[1,2]),clearRoute.cost,'macro-MOVE optimizes ordinary physical cost without risk');
console.log('UNIFIED_ASTAR_PASS',{cases,weightedCorridor:13,riskAwareCost:safeRoute.cost});
