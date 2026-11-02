// Door-autotiling regression: single doors, four diagonal pairs, directions and portal order.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),ctx=vm.createContext({console});
for(const file of ['Html/mapgeneration/mapgenerationconfig.js','Html/autotilerules.js','Html/mapgeneration/mapautotiler.js'])
    vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx,{filename:file});
const tiler=vm.runInContext('new MapAutotiler()',ctx), rules=vm.runInContext('DOOR_AUTOTILE_RULES',ctx);
const center={x:3,y:3};

function tile(portals,fromTile=11)
{
    const width=7,height=7;
    tiler.width=width; tiler.height=height;
    const types=Array.from({length:height},()=>Array(width).fill(tiler.TILE.WALL));
    const walls=Array.from({length:height},()=>Array(width).fill(11));
    walls[center.y][center.x]=fromTile;
    for(const p of portals){types[p.y][p.x]=tiler.TILE.FLOOR;walls[p.y][p.x]=null;}
    const map={walls,ground:Array.from({length:height},()=>Array(width).fill(2))};
    tiler._autoTileAroundDoors(types,map,portals);
    return map.walls[center.y][center.x];
}
function door(dx,dy,direction)
{
    return {id:`${dx},${dy},${direction}`,x:center.x+dx,y:center.y+dy,direction,doorSuitable:true};
}
const single=[
    {offset:[1,0],dirs:['N','S'],replacements:{12:11,19:11,13:32,14:34,16:20,17:22,21:31,23:30,33:36}},
    {offset:[-1,0],dirs:['N','S'],replacements:{10:11,19:11,13:33,15:35,16:21,17:23,20:31,22:30,32:36}},
    {offset:[0,1],dirs:['E','W'],replacements:{10:20,11:31,12:21,17:13,18:16,19:16,22:32,23:33,28:20,29:21,30:36}},
    {offset:[0,-1],dirs:['E','W'],replacements:{10:28,12:29}}
];
let singleChecks=0;
for(const s of single)for(const direction of s.dirs)for(const [fromTile,out] of Object.entries(s.replacements))
{
    assert.equal(tile([door(...s.offset,direction)],Number(fromTile)),out,`single ${s.offset} ${direction} from=${fromTile}`);
    singleChecks++;
}
for(const direction of ['N','S','E','W'])
{
    tiler.width=7;tiler.height=7;
    const t=Array.from({length:7},()=>Array(7).fill(tiler.TILE.FLOOR));
    const map={walls:Array.from({length:7},()=>Array(7).fill(null))};
    tiler._autoTileAroundDoors(t,map,[door(0,0,direction)]);
    assert.equal(map.walls[3][3],direction==='N'||direction==='S'?41:40);
}

// Pairs of doors adjacent in two cardinal directions around the same wall.
// Each fromTile is the intersection of the two single-door rule families.
// Output tile follows the north/south-positioned door (not its orientation).
const diagonal=[
    {name:'west+north',west:-1,north:-1,expected:{10:28}},
    {name:'east+north',west:1,north:-1,expected:{12:29}},
    {name:'west+south',west:-1,north:1,expected:{10:20,17:13,19:16,22:32}},
    {name:'east+south',west:1,north:1,expected:{12:21,17:13,19:16,23:33}}
];
let diagonalChecks=0;
for(const d of diagonal)for(const horizontalDir of ['N','S'])for(const verticalDir of ['E','W'])
    for(const [fromTile,out] of Object.entries(d.expected))
    {
        const portals=[door(d.west,0,horizontalDir),door(0,d.north,verticalDir)];
        assert.equal(tile(portals,Number(fromTile)),out,`${d.name} ${horizontalDir}/${verticalDir} from=${fromTile}`);
        assert.equal(tile(portals.slice().reverse(),Number(fromTile)),out,`${d.name} reversed`);
        diagonalChecks++;
    }

// Wrong-orientation doors cannot accidentally trigger a wall replacement.
assert.equal(tile([door(-1,0,'E')],10),10);
assert.equal(tile([door(0,-1,'N')],10),10);

assert(rules.every(r=>!('directions' in r) && !('directionAt' in r)));
assert.equal(rules.filter(r=>r.score===20).length,10);
assert.equal(tiler._matchDoorPattern('*H**WV***'.replace('H','e').replace('V','n'),'*H**WV***'),true);
assert.equal(tiler._matchDoorPattern('*H**WV***'.replace('H','n').replace('V','e'),'*H**WV***'),false);
assert.equal(tiler._matchDoorPattern('****n****','****D****'),true);
console.log(`door autotiling PASS: ${singleChecks} single-direction, ${diagonalChecks} diagonal (+ reversed), 4 door-center checks`);
