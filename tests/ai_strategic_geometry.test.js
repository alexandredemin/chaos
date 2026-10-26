// Pure geometry checks + AITest integration without Phaser/browser.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const dir=path.resolve(__dirname,'..');
const ctx=vm.createContext({console,document:{addEventListener(){}}});
for(const file of ['aiconfig.js','aiheap.js','aistrategicgeometry.js','aitest.js'])
    vm.runInContext(fs.readFileSync(path.join(dir,'Html/aicontrol',file),'utf8'),ctx,{filename:file});
const build=vm.runInContext('AIStrategicGeometry.build.bind(AIStrategicGeometry)',ctx);
const fromMap=vm.runInContext('AIStrategicGeometry.fromTilemap.bind(AIStrategicGeometry)',ctx);
function mapText(lines,config={})
{
    assert(lines.every(r=>r.length===lines[0].length));
    return build({width:lines[0].length,height:lines.length,isWall:(x,y)=>lines[y][x]==='#'},config);
}
const rooms=mapText([
    '###################',
    '#.......#.........#',
    '#.......#.........#',
    '#.......#.........#',
    '#.................#',
    '#.......#.........#',
    '#.......#.........#',
    '#.......#.........#',
    '###################'
]);
assert.equal(rooms.regions.length,2,'two rooms connected by one-cell door');
assert.equal(rooms.distance[4*rooms.width+4],4,'radius to wall in left chamber');
assert.equal(rooms.distance[4*rooms.width+8],1,'narrow doorway clearance');
assert.equal(rooms.edges.length,1,'one watershed boundary');
assert(rooms.peaks.some(p=>p.x===4&&p.y===4));
const blank=mapText(Array(9).fill('.'.repeat(15)));
assert.equal(blank.regions.length,1,'open arena is one region');
assert.equal(blank.peaks.length,1,'central maximum plateau is a single seed');
const connected=mapText(['######','#..###','###..#','######']);
assert.equal(connected.regions.length,2,'wall-separated areas are disconnected');
const one=mapText(['#####','#...#','#...#','#...#','#####']);
assert.equal(one.regions.length,1,'simple room');
const noRooms=mapText(['###','###','###']);
assert.equal(noRooms.regions.length,0);

// Compare exact EDT with an independent slow brute-force oracle on deterministic
// random maps, including walls of different shapes and virtual outside border.
let seed=117;
const rng=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
for(let trial=0;trial<80;trial++)
{
    const W=3+Math.floor(rng()*18),H=3+Math.floor(rng()*18);
    const walls=Array.from({length:W*H},()=>rng()<.25);
    const g=build({width:W,height:H,isWall:(x,y)=>walls[y*W+x]});
    for(let y=0;y<H;y++)for(let x=0;x<W;x++)
    {
        const i=y*W+x;
        let sq=walls[i]?0:Math.min((x+1)**2,(y+1)**2,(W-x)**2,(H-y)**2);
        for(let sy=0;sy<H;sy++)for(let sx=0;sx<W;sx++)if(walls[sy*W+sx])
            sq=Math.min(sq,(x-sx)**2+(y-sy)**2);
        assert.equal(g.squared[i],sq,`EDT oracle trial ${trial} (${x},${y})`);
        if(g.free[i])assert(g.region[i]>0,'all walkable cells receive a final region');
        else assert.equal(g.region[i],0,'walls have no region');
    }
}
// Distinct regions must not be joined through walls. Labels must not be 0 for
// free cells; regions must each be a 4-connected set.
function checkConnectivity(g)
{
    for(const r of g.regions)
    {
        const start=g.region.indexOf(r.id),seen=new Set([start]),queue=[start];
        for(let p=0;p<queue.length;p++)
        {
            const i=queue[p],x=i%g.width,y=(i/g.width)|0;
            for(const j of [x>0?i-1:-1,x+1<g.width?i+1:-1,y>0?i-g.width:-1,y+1<g.height?i+g.width:-1])
                if(j>=0&&g.region[j]===r.id&&!seen.has(j)){seen.add(j);queue.push(j);}
        }
        assert.equal(seen.size,r.area,`region ${r.id} remains connected`);
    }
}
checkConnectivity(rooms);checkConnectivity(blank);
for(let trial=0;trial<30;trial++)
{
    const W=10,H=10,walls=Array.from({length:100},()=>rng()<.32);
    checkConnectivity(build({width:W,height:H,isWall:(x,y)=>walls[y*W+x]}));
}
// Large merge thresholds can merge only adjacent, reachable basins, but cannot
// cross blocked cells. The raw watershed must not depend on those thresholds.
const allMerge=mapText([
    '###################','#.......#.........#','#.......#.........#','#.......#.........#',
    '#.................#','#.......#.........#','#.......#.........#','#.......#.........#','###################'
],{minProminence:100});
assert.equal(allMerge.regions.length,1);
assert.equal(allMerge.peaks.length,rooms.peaks.length);

// AITest geometry mode stays order-independent and uses one Phaser Graphics
// heatmap rather than thousands of text objects.
const layer={getTileAt(x,y){return {properties:{collides:(x===0||y===0||x===8||y===6)}};}};
const gameMap={width:9,height:7,tileWidth:16,tileHeight:16,tileToWorldXY(x,y){return {x:x*16,y:y*16};}};
const gm=fromMap(gameMap,layer);
assert.equal(gm.stats.walkable,35);
const items=[];
const scene={add:{graphics(){let g={active:true,fillStyle(){return this;},fillRect(){return this;},setDepth(){},destroy(){this.active=false;}};items.push(g);return g;},text(){let t={active:true,setDepth(){},destroy(){this.active=false;}};items.push(t);return t;}}};
ctx.map=gameMap;ctx.wallsLayer=layer;
ctx.testScene=scene;
vm.runInContext('AITest.debugUnit={scene:testScene, mapX:3, mapY:3}; AITest.guardOverlayMode="geo:regions"; AITest.refreshGeometryOverlay(true)',ctx);
assert(vm.runInContext('AITest.geometryCache.result.regions.length',ctx)>=1);
assert(items.length<30,'graphics batching / bounded number of labels');
vm.runInContext('AITest.guardOverlayMode="geo:distance"; AITest.refreshGeometryOverlay(true); AITest.clearGuardOverlay()',ctx);
assert(items.every(item=>item.active===false),'overlay resources removed after mode change');
console.log('AI_STRATEGIC_GEOMETRY_PASS',{edtTrials:80,connectivityTrials:30,rooms:rooms.regions.length,blank:blank.regions.length});
