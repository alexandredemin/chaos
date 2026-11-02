// Generated dungeon regression: diagonal-specific rules are the ONLY change to output.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),ctx=vm.createContext({console});
for(const file of ['Html/mapgeneration/mapgenerationconfig.js','Html/autotilerules.js','Html/maptemplates/skirmish_arena.js','Html/mapgeneration/zonegraph.js','Html/mapgeneration/dungeongenerator.js','Html/mapgeneration/mapautotiler.js'])
    vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx,{filename:file});
let maps=0,changed=0,hidden=0,diagonalPairs=0;
for(const size of [20,30,40])for(let seed=1;seed<=80;seed++)
{
    const dungeon=vm.runInContext(`new ZoneGraphMapGenerator({plannerMode:'skirmish',width:${size},height:${size},seed:${seed},specialCount:2}).generate()`,ctx);
    vm.runInContext('DungeonPortalBuilder.build',ctx)(dungeon);
    const portals=dungeon.portals;
    const legacy=vm.runInContext('new MapAutotiler()',ctx),current=vm.runInContext('new MapAutotiler()',ctx);
    legacy.doorAutotileRules=legacy.doorAutotileRules.filter(r=>r.score!==20);
    legacy.width=current.width=size;legacy.height=current.height=size;
    const original=legacy._buildState(dungeon,portals),next=current._buildState(dungeon,portals);
    const dirs=new Map(portals.filter(p=>p.doorSuitable&&p.direction).map(p=>[p.x+':'+p.y,p.direction]));
    for(let y=0;y<size;y++)for(let x=0;x<size;x++)
    {
        if(original.walls[y][x]===next.walls[y][x])continue;
        changed++;
        const pairs=[
            [[x-1,y],[x,y-1]],[[x+1,y],[x,y-1]],
            [[x-1,y],[x,y+1]],[[x+1,y],[x,y+1]]
        ];
        const isDiagonal=pairs.some(([a,b])=>['N','S'].includes(dirs.get(a.join(':')))&&['E','W'].includes(dirs.get(b.join(':'))));
        assert(isDiagonal,`unexpected changed tile ${size}x${size} seed=${seed} (${x},${y}) ${original.walls[y][x]} -> ${next.walls[y][x]}`);
    }
    // A single secret door remains a solid wall, then its precomputed reveal patch
    // reproduces the fully revealed state even with nearby regular doors.
    const secret=portals.find(p=>p.doorSuitable&&p.direction);
    if(secret && seed<=20)
    {
        secret.hiddenByDefault=true;
        const hidden=current.build(dungeon,portals);
        const opened=hidden.walls.map(row=>row.slice());
        for(const cell of secret.tilePatch.revealed.cells)if(Object.hasOwn(cell,'wall'))opened[cell.y][cell.x]=cell.wall;
        assert.equal(JSON.stringify(opened),JSON.stringify(next.walls),`secret reveal changed expected state ${size}x${size} seed=${seed}`);
        secret.hiddenByDefault=false;
    }
    diagonalPairs+=portals.reduce((n,p)=>n+portals.filter(q=>q!==p&&Math.abs(q.x-p.x)===1&&Math.abs(q.y-p.y)===1).length,0)/2;
    maps++;
}
console.log(`generated regression PASS: ${maps} maps, ${changed} changed wall sprites (diagonal pairs encountered: ${diagonalPairs})`);
