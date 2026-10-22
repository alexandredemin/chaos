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
        if(sx===tx&&sy===ty)return {cells:[],cost:0};
        const size=width*height,source=sy*width+sx,target=ty*width+tx;
        const costs=new Float64Array(size),parents=new Int32Array(size);
        costs.fill(Infinity);parents.fill(-1);costs[source]=0;
        const heap=new AIDistanceMinHeap(),heuristic=(x,y)=>Math.max(Math.abs(x-tx),Math.abs(y-ty));
        heap.push({k:source,x:sx,y:sy,g:0,d:heuristic(sx,sy)});
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
            if(cur.g!==costs[cur.k])continue; // stale queue entry
            if(cur.k===target)
            {
                const cells=[];let k=target;
                while(k!==source)
                {
                    cells.push([k%width,Math.floor(k/width)]);
                    k=parents[k];if(k<0)return null;
                }
                cells.reverse();return {cells,cost:cur.g};
            }
            for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)
            {
                if(!dx&&!dy)continue;
                const x=cur.x+dx,y=cur.y+dy;
                if(!inBounds(x,y))continue;
                const edge=options.transitionCost
                    ?options.transitionCost(cur.x,cur.y,x,y,edgeOptions)
                    :AICellPolicy.transitionCost(unit,cur.x,cur.y,x,y,edgeOptions);
                if(edge==null)continue;
                const k=y*width+x,g=cur.g+edge;
                if(g>=costs[k])continue;
                costs[k]=g;parents[k]=cur.k;
                // Admissible 8-way Chebyshev heuristic: every legal step costs >=1.
                heap.push({k,x,y,g,d:g+heuristic(x,y)});
            }
        }
        return null;
    }
}
