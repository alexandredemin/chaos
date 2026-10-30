// Topology v1: exact generated rooms, raw watershed for handmade maps,
// actual 4-connected corridor routes, disconnected islands, overlay smoke.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),ctx=vm.createContext({console});
for(const f of ['aiconfig.js','aiheap.js','aistrategicgeometry.js','aitopologygraph.js'])
  vm.runInContext(fs.readFileSync(path.join(root,'Html/aicontrol',f),'utf8'),ctx,{filename:f});
const build=vm.runInContext('AITopologyGraph.build.bind(AITopologyGraph)',ctx);
function run(lines,metadata=null)
{
  const W=lines[0].length,H=lines.length;
  assert(lines.every(x=>x.length===W));
  return build({width:W,height:H,isWall:(x,y)=>lines[y][x]==='#',metadata});
}
function verify(g,lines)
{
  const W=g.width,H=g.height;
  let floor=0;for(let y=0;y<H;y++)for(let x=0;x<W;x++)
  {
    const isFree=lines[y][x]!=='#',id=g.cellZone[y*W+x];
    assert.equal(!!id,isFree,`coverage (${x},${y})`);if(isFree)floor++;
  }
  assert.equal(g.stats.walkable,floor);assert.equal(g.stats.covered,floor);
  assert.equal(g.zones.length,g.stats.zones);
  const allIds=new Set(g.zones.map(z=>z.id));
  for(const e of g.connections)
  {
    assert(allIds.has(e.from)&&allIds.has(e.to)&&e.from!==e.to);
    assert.equal(e.length,e.path.length-1,'real edge path length');
    assert.deepEqual([e.path[0].x,e.path[0].y],[g.zones[e.from-1].x,g.zones[e.from-1].y]);
    const last=e.path[e.path.length-1];assert.deepEqual([last.x,last.y],[g.zones[e.to-1].x,g.zones[e.to-1].y]);
    for(let k=0;k<e.path.length;k++)
    {
      const c=e.path[k];assert.equal(lines[c.y][c.x],'.');
      if(k)assert.equal(Math.abs(c.x-e.path[k-1].x)+Math.abs(c.y-e.path[k-1].y),1,'4-connected path');
    }
  }
  const visited=new Set();let geomComponents=0;
  for(let i=0;i<W*H;i++)if(lines[(i/W)|0][i%W]==='.'&&!visited.has(i))
  {
    geomComponents++;const q=[i];visited.add(i);
    for(let a=0;a<q.length;a++)
    {
      const p=q[a],x=p%W,y=(p/W)|0;
      for(const n of [x>0?p-1:-1,x+1<W?p+1:-1,y>0?p-W:-1,y+1<H?p+W:-1])
        if(n>=0&&lines[(n/W)|0][n%W]==='.'&&!visited.has(n)) {visited.add(n);q.push(n);}
    }
  }
  assert.equal(g.stats.components,geomComponents,'graph has same reachable components as floor map');
}
const rooms=[
  '#########################',
  '#....#####......#####...#',
  '#....#####......#####...#',
  '#....#####......#####...#',
  '#.......................#',
  '#....#####......#####...#',
  '#....#####......#####...#',
  '#########################'
];
const meta={rooms:[
  {id:'west',x:1,y:1,w:4,h:6},
  {id:'middle',x:10,y:1,w:6,h:6},
  {id:'east',x:21,y:1,w:3,h:6}
]};
const generated=run(rooms,meta);verify(generated,rooms);
assert.equal(generated.mode,'generated');assert.equal(generated.zones.length,3);
assert.equal(generated.zones[0].area,24);
assert.equal(generated.zones[1].area,36);
assert.equal(generated.zones[2].area,18);
assert.equal(generated.stats.components,1);
assert.equal(generated.connections.length,2,'linear corridor room adjacency is sparse');
assert.equal(generated.zones[0].sourceRoomId,'west');
const handmade=run(rooms);verify(handmade,rooms);assert.equal(handmade.mode,'watershed');
const geom=vm.runInContext('AIStrategicGeometry.build.bind(AIStrategicGeometry)',ctx)({width:rooms[0].length,height:rooms.length,isWall:(x,y)=>rooms[y][x]==='#'});
for(let i=0;i<geom.basin.length;i++)assert.equal(handmade.cellZone[i],geom.basin[i],'raw basin exactly preserved');
const islands=['###########','#...##....#','#...##....#','###########'];
const islandGraph=run(islands);verify(islandGraph,islands);assert.equal(islandGraph.stats.components,2);
const unseeded=run(islands,{rooms:[{id:'left',x:1,y:1,w:3,h:2}]});verify(unseeded,islands);
assert.equal(unseeded.zones.length,2);assert.equal(unseeded.zones[1].kind,'unmapped');
// A generated map with a physical obstacle in a supposed link must not
// hallucinate an edge from generator room metadata.
const blocked=['###########','#...##....#','#...##....#','###########'];
const cut=run(blocked,{rooms:[{x:1,y:1,w:3,h:2},{x:6,y:1,w:4,h:2}]});
assert.equal(cut.connections.length,0);assert.equal(cut.stats.components,2);
// Random robustness: graph topology agrees with actual floor connectivity.
let seed=29;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32};
for(let trial=0;trial<50;trial++)
{
  const W=10,H=10,lines=Array.from({length:H},()=>Array.from({length:W},()=>rand()<.35?'#':'.').join(''));
  verify(run(lines),lines);
}
// Full real dungeon generator integration (without Phaser rendering): room
// metadata + generated floor + real corridor loop connections.
for(const file of ['Html/mapgeneration/mapgenerationconfig.js','Html/maptemplates/skirmish_arena.js',
    'Html/mapgeneration/zonegraph.js','Html/mapgeneration/dungeongenerator.js'])
  vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx,{filename:file});
for(const mapSeed of [42,2026,99])
{
  const d=vm.runInContext(`new ZoneGraphMapGenerator({plannerMode:'skirmish',width:40,height:40,seed:${mapSeed},specialCount:2}).generate()`,ctx);
  const rows=d.map.kind.map(r=>r.map(c=>c==='#'?'#':'.').join(''));
  const g=run(rows,{rooms:d.rooms});verify(g,rows);
  assert.equal(g.mode,'generated');assert.equal(g.zones.length,d.rooms.length);
  assert(g.connections.length>=g.zones.length-1,'generated layout connected through corridors');
  for(let i=0;i<g.zones.length;i++)assert.equal(g.zones[i].area,d.rooms[i].w*d.rooms[i].h,
    'room footprint preserved exactly in generated geometry');
}
console.log('AI_TOPOLOGY_GRAPH_PASS',{generatedZones:generated.zones.length,generatedLinks:generated.connections.length,randomMaps:50});
