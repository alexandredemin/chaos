//---------------------------- AI Topology Graph v1 ----------------------------
// Static, order-independent, four-connected map topology. TWO public object types:
// zones (room/region) and connections (actual walkable transitions).
// - generated maps: seed zones with generator room rectangles; grow through all
//   leftover corridor tiles to determine sparse physical room adjacency.
// - handmade maps: seed zones with RAW watershed basins (never merged basins).
// A connection path is an actual sequence of 4-neighbor walkable cells; its
// length is a GEOMETRIC step count, not a unit-dependent Web/Glue move cost.
// This module does not issue orders, predict control, or assign strategic value.
class AITopologyGraph
{
    static build({width,height,isWall,metadata=null,geometry=null})
    {
        if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height>1e7)
            throw new Error('Invalid topology dimensions');
        const N=width*height,free=new Uint8Array(N),labels=new Int32Array(N),zones=[];
        for(let y=0;y<height;y++)for(let x=0;x<width;x++)free[y*width+x]=isWall(x,y)?0:1;
        const geometryValid=geometry&&geometry.width===width&&geometry.height===height;
        const index=(x,y)=>y*width+x;
        const neighbors=(i,fn)=>{
            const x=i%width,y=(i/width)|0;
            if(y>0)fn(i-width);if(x>0)fn(i-1);
            if(x+1<width)fn(i+1);if(y+1<height)fn(i+width);
        };
        let mode='watershed';
        const roomItems=Array.isArray(metadata?.rooms)?metadata.rooms:[];
        if(roomItems.length)
        {
            // Seed exact, valid, walkable room geometry. Never assume generation
            // edge metadata is complete: loops and late corridors may be absent.
            for(const room of roomItems)
            {
                if(!room||!Number.isInteger(room.x)||!Number.isInteger(room.y)||!Number.isInteger(room.w)||!Number.isInteger(room.h))continue;
                const cells=[];
                for(let y=Math.max(0,room.y);y<Math.min(height,room.y+room.h);y++)
                    for(let x=Math.max(0,room.x);x<Math.min(width,room.x+room.w);x++)
                    {
                        const i=index(x,y);if(free[i]&&!labels[i])cells.push(i);
                    }
                if(!cells.length)continue;
                const id=zones.length+1;
                for(const i of cells)labels[i]=id;
                zones.push({id,kind:'room',sourceRoomId:room.id??null,zoneId:room.zoneId??null,
                    roomType:room.roomType??null,special:room.special===true,seedCells:cells});
            }
            if(zones.length)mode='generated';
        }
        if(mode==='watershed')
        {
            const geo=geometryValid?geometry:AIStrategicGeometry.build({width,height,isWall});
            // Take raw labels directly. Never consume geo.region: it may have
            // been hierarchically merged for legacy visual diagnostics.
            for(let i=0;i<N;i++)if(free[i])labels[i]=geo.basin[i];
            for(const peak of geo.peaks)
                zones.push({id:peak.id,kind:'region',sourceRoomId:null,seedCells:[],peak:peak});
        }
        // Generate a compact connected catchment for each room. In generated
        // maps corridor tiles belong to the nearest seeded room for the sole
        // purpose of discovering real connections (not changing room area).
        const wave=new Int32Array(N);let head=0,tail=0;
        if(mode==='generated')
        {
            for(let i=0;i<N;i++)if(labels[i])wave[tail++]=i;
            while(head<tail)
            {
                const i=wave[head++];
                neighbors(i,j=>{if(free[j]&&!labels[j]){labels[j]=labels[i];wave[tail++]=j;}});
            }
            // If a handmade island has been embedded in a generated map, keep
            // it instead of silently dropping reachable floors with no room.
            for(let i=0;i<N;i++)if(free[i]&&!labels[i])
            {
                const id=zones.length+1,cells=[i];labels[i]=id;
                for(let q=0;q<cells.length;q++)neighbors(cells[q],j=>{
                    if(free[j]&&!labels[j]){labels[j]=id;cells.push(j);}
                });
                zones.push({id,kind:'unmapped',sourceRoomId:null,seedCells:cells});
            }
        }
        // Geometry per zone. 'area' is the original room/basin footprint;
        // catchmentArea includes corridor tiles assigned by the Voronoi wave.
        const sumX=new Float64Array(zones.length+1),sumY=new Float64Array(zones.length+1);
        const nCatch=new Int32Array(zones.length+1),nRoom=new Int32Array(zones.length+1);
        const zoneSeeds=new Int32Array(N);
        if(mode==='generated')for(const z of zones)for(const i of z.seedCells)zoneSeeds[i]=z.id;
        else zoneSeeds.set(labels);
        for(let i=0;i<N;i++)
        {
            const id=labels[i];if(!id)continue;
            nCatch[id]++;
            if(zoneSeeds[i]===id){nRoom[id]++;sumX[id]+=i%width;sumY[id]+=(i/width)|0;}
        }
        const anchors=new Int32Array(zones.length+1);anchors.fill(-1);
        for(const z of zones)
        {
            const cx=sumX[z.id]/Math.max(1,nRoom[z.id]),cy=sumY[z.id]/Math.max(1,nRoom[z.id]);
            let best=Infinity;
            for(let i=0;i<N;i++)if(zoneSeeds[i]===z.id)
            {
                const d=(i%width-cx)**2+(((i/width)|0)-cy)**2;
                if(d<best){best=d;anchors[z.id]=i;}
            }
            const a=anchors[z.id];
            z.area=nRoom[z.id];z.catchmentArea=nCatch[z.id];
            z.centerX=cx;z.centerY=cy;
            z.x=a%width;z.y=(a/width)|0;
            if(z.peak){z.radius=z.peak.radius;z.peakX=z.peak.x;z.peakY=z.peak.y;}
            else
            {
                let radius=0,px=z.x,py=z.y;
                if(geometryValid)for(let i=0;i<N;i++)if(zoneSeeds[i]===z.id&&geometry.distance[i]>radius)
                    {radius=geometry.distance[i];px=i%width;py=(i/width)|0;}
                z.radius=radius;z.peakX=px;z.peakY=py;
            }
            delete z.seedCells;delete z.peak;
        }
        // One BFS over all zone catchments at once, starting from their
        // representative cells. Used to produce real (non-wall-crossing) edge
        // polylines and anchor-to-anchor graph distances.
        const parent=new Int32Array(N),distance=new Int32Array(N);parent.fill(-1);distance.fill(-1);
        head=0;tail=0;
        for(const z of zones){const i=anchors[z.id];if(i>=0){distance[i]=0;wave[tail++]=i;}}
        while(head<tail)
        {
            const i=wave[head++];
            neighbors(i,j=>{if(labels[j]===labels[i]&&distance[j]<0)
                {distance[j]=distance[i]+1;parent[j]=i;wave[tail++]=j;}});
        }
        const pairs=new Map();
        for(let y=0;y<height;y++)for(let x=0;x<width;x++)
        {
            const i=index(x,y),a=labels[i];if(!a)continue;
            for(const j of [x+1<width?i+1:-1,y+1<height?i+width:-1])
            {
                if(j<0)continue;
                const b=labels[j];if(!b||a===b||distance[i]<0||distance[j]<0)continue;
                const lo=Math.min(a,b),hi=Math.max(a,b),key=lo+':'+hi;
                let e=pairs.get(key);
                if(!e){e={from:lo,to:hi,contacts:0,length:Infinity,aCell:-1,bCell:-1};pairs.set(key,e);}
                e.contacts++;
                const length=distance[i]+1+distance[j];
                if(length<e.length)
                {
                    e.length=length;
                    e.aCell=a===lo?i:j;
                    e.bCell=a===lo?j:i;
                }
            }
        }
        const trace=i=>{const path=[];while(i>=0){path.push(i);i=parent[i];}return path;};
        const connections=[...pairs.values()].sort((a,b)=>a.from-b.from||a.to-b.to).map((e,k)=>
        {
            const a=trace(e.aCell).reverse(),b=trace(e.bCell);
            const path=a.concat(b).map(i=>({x:i%width,y:(i/width)|0}));
            const u=e.aCell,v=e.bCell;
            return {id:k+1,from:e.from,to:e.to,length:e.length,contacts:e.contacts,
                widthEstimate:geometryValid?Math.max(1,Math.round(2*Math.min(geometry.distance[u],geometry.distance[v])-1)):null,
                gateA:{x:u%width,y:(u/width)|0},gateB:{x:v%width,y:(v/width)|0},path};
        });
        const adjacency=Array.from({length:zones.length+1},()=>[]);
        for(const e of connections){adjacency[e.from].push(e.id);adjacency[e.to].push(e.id);}
        let components=0;const seen=new Uint8Array(zones.length+1);
        for(const z of zones)if(!seen[z.id])
        {
            components++;const queue=[z.id];seen[z.id]=1;
            for(let q=0;q<queue.length;q++)for(const id of adjacency[queue[q]])
            {
                const e=connections[id-1],other=e.from===queue[q]?e.to:e.from;
                if(!seen[other]){seen[other]=1;queue.push(other);}
            }
        }
        return {width,height,mode,zones,connections,cellZone:labels,free,adjacency,
            stats:{zones:zones.length,connections:connections.length,components,
                walkable:free.reduce((s,x)=>s+x,0),covered:nCatch.reduce((s,x)=>s+x,0)}};
    }
    static fromTilemap(gameMap,wallsLayer,metadata=null,geometry=null)
    {
        return this.build({width:gameMap.width,height:gameMap.height,metadata,geometry,
            isWall:(x,y)=>wallsLayer.getTileAt(x,y)?.properties?.collides===true});
    }
}
