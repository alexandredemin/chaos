//---------------------------- Universal AI A* route planner ----------------------------
// Works with the SAME exit-cost transition model as AIControl's Dijkstra.
// A* runs FORWARD from the unit to its destination. Unlike a reverse distance
// map, no backward search is needed: just charge the Web/Glue penalty at FROM.
//
// AIPathfinder.findPath(unit, [sx,sy], [gx,gy], options) -> {cells,cost} | null
// `cells` excludes the starting cell and includes the destination.
// `options`: canEnter(x,y), occupantCost(occupant,x,y),
//            riskPenalty(x,y,fromX,fromY), and optionally transitionCost(...).
// riskPenalty is nonnegative and is added when ENTERING the destination cell.
// Risk-free and risk-aware callers use the same pathfinding implementation.
// `maxSteps` and `maxCost` optionally limit physical steps and movement budget.
// A weighted cheapest path may be LONGER in cells than another affordable path;
// when maxSteps is set, A* searches separate (cell, stepsUsed) states.
// `debug` (mutable object) gathers best discovered g scores and expanded cells.
// Runtime normally loads this module before aicontrol.js; AIDistanceMinHeap is
// resolved when findPath() is called, after all scripts have loaded.
class AIPathfinder
{
    static findPath(unit,start,goal,options={})
    {
        if(!Array.isArray(start)||!Array.isArray(goal))return null;
        const [sx,sy]=start,[tx,ty]=goal,width=map.width,height=map.height;
        const inBounds=(x,y)=>Number.isInteger(x)&&Number.isInteger(y)&&x>=0&&y>=0&&x<width&&y<height;
        if(!inBounds(sx,sy)||!inBounds(tx,ty))return null;
        if(sx===tx&&sy===ty)
        {
            if(options.debug)
            {
                const k=sy*width+sx,size=width*height;
                options.debug.g=new Float64Array(size);options.debug.g.fill(Infinity);options.debug.g[k]=0;
                options.debug.expanded=new Uint8Array(size);options.debug.expanded[k]=1;
                options.debug.expansions=1;
            }
            return {cells:[],cost:0};
        }
        const size=width*height,source=sy*width+sx,target=ty*width+tx;
        const bounded=Number.isInteger(options.maxSteps)&&options.maxSteps>=0;
        const stride=bounded?size:0,limit=bounded?options.maxSteps:0;
        const stateSize=bounded?size*(limit+1):size;
        const costs=new Float64Array(stateSize),parents=new Int32Array(stateSize);
        costs.fill(Infinity);parents.fill(-1);costs[source]=0;
        const heap=new AIDistanceMinHeap(),heuristic=(x,y)=>Math.max(Math.abs(x-tx),Math.abs(y-ty));
        heap.push({k:source,x:sx,y:sy,g:0,d:heuristic(sx,sy),steps:0});
        const maxCost=Number.isFinite(options.maxCost)?Math.max(0,options.maxCost):Infinity;
        const debug=options.debug||null;
        if(debug)
        {
            debug.g=new Float64Array(size);debug.g.fill(Infinity);
            debug.expanded=new Uint8Array(size);debug.expansions=0;debug.g[source]=0;
        }
        // Cache one policy assessment per cell across expansions.
        const policyCache=new Map(),policyAt=(x,y)=>
        {
            const k=y*width+x;
            if(!policyCache.has(k))policyCache.set(k,AICellPolicy.assess(unit,x,y));
            return policyCache.get(k);
        };
        const edgeOptions={...options,policyAt};
        while(heap.length)
        {
            const cur=heap.pop();
            if(cur.g!==costs[cur.k])continue;
            const cellKey=cur.y*width+cur.x;
            if(debug){debug.expanded[cellKey]=1;debug.expansions++;}
            if(cellKey===target)
            {
                const cells=[];let k=cur.k;
                while(k!==source)
                {
                    const cellId=k%size;
                    cells.push([cellId%width,Math.floor(cellId/width)]);
                    k=parents[k];if(k<0)return null;
                }
                cells.reverse();return {cells,cost:cur.g};
            }
            if(bounded&&cur.steps>=limit)continue;
            for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)
            {
                if(!dx&&!dy)continue;
                const x=cur.x+dx,y=cur.y+dy;
                if(!inBounds(x,y))continue;
                const edge=options.transitionCost
                    ?options.transitionCost(cur.x,cur.y,x,y,edgeOptions)
                    :AICellPolicy.transitionCost(unit,cur.x,cur.y,x,y,edgeOptions);
                if(edge==null)continue;
                const steps=cur.steps+1,cell=y*width+x,k=cell+(bounded?steps*stride:0);
                const g=cur.g+edge;
                if(g>maxCost+1e-9||g>=costs[k])continue;
                costs[k]=g;parents[k]=cur.k;
                if(debug&&g<debug.g[cell])debug.g[cell]=g;
                heap.push({k,x,y,g,d:g+heuristic(x,y),steps});
            }
        }
        return null;
    }
}
