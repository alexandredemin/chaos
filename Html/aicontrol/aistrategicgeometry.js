//---------------------------- Static strategic geometry diagnostics ----------------------------
// No tactical orders are assigned here. The input is the geometry of *walls*, not
// the unit-dependent AICellPolicy: Web, fire, doors and temporary units are not walls.
// Works on generated maps and handmade tilemaps with no room metadata.
class AIStrategicGeometry
{
    static get config(){return AI_STRATEGIC_GEOMETRY_CONFIG;}
    static neighbors = [[0,-1],[-1,0],[1,0],[0,1]];

    // Felzenszwalb/Huttenlocher 1-D squared Euclidean distance transform.
    // Infinite entries mean "no wall in this row/column"; skip their parabolas.
    static edt1d(f)
    {
        const n=f.length, INF=1e12, d=new Float64Array(n);
        const v=new Int32Array(n),z=new Float64Array(n+1);
        let k=-1;
        for(let q=0;q<n;q++)
        {
            if(f[q]>=INF/2)continue;
            if(k<0){k=0;v[0]=q;z[0]=-Infinity;z[1]=Infinity;continue;}
            let s;
            while(k>=0)
            {
                const p=v[k];
                s=((f[q]+q*q)-(f[p]+p*p))/(2*(q-p));
                if(s>z[k])break;
                k--;
            }
            if(k<0){k=0;v[0]=q;z[0]=-Infinity;z[1]=Infinity;}
            else{k++;v[k]=q;z[k]=s;z[k+1]=Infinity;}
        }
        if(k<0){d.fill(INF);return d;}
        let i=0;
        for(let q=0;q<n;q++)
        {
            while(i<k && z[i+1]<q)i++;
            const delta=q-v[i];d[q]=delta*delta+f[v[i]];
        }
        return d;
    }

    // Exact Euclidean distance to blocking tile *centers*, with an explicit
    // impassable outer border (distance to virtual wall one tile beyond bounds).
    // 4-neighbor connectivity is intentional: diagonal corner-touch is not a room gateway.
    static distanceTransform(width,height,free)
    {
        const INF=1e12,size=width*height,tmp=new Float64Array(size),sq=new Float64Array(size);
        for(let y=0;y<height;y++)
        {
            const row=new Float64Array(width);
            for(let x=0;x<width;x++)row[x]=free[y*width+x]?INF:0;
            const d=this.edt1d(row);
            for(let x=0;x<width;x++)tmp[y*width+x]=d[x];
        }
        for(let x=0;x<width;x++)
        {
            const col=new Float64Array(height);
            for(let y=0;y<height;y++)col[y]=tmp[y*width+x];
            const d=this.edt1d(col);
            for(let y=0;y<height;y++)
            {
                const index=y*width+x;
                const border=Math.min(x+1,width-x,y+1,height-y);
                sq[index]=free[index]?Math.min(d[y],border*border):0;
            }
        }
        return sq;
    }

    static build({width,height,isWall},parameters={})
    {
        if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height>1e7)
            throw new Error('Invalid strategic geometry dimensions');
        const cfg={...this.config,...parameters},N=width*height,free=new Uint8Array(N);
        let walkable=0;
        for(let y=0;y<height;y++)for(let x=0;x<width;x++)
        {
            const i=y*width+x;
            if(!isWall(x,y)){free[i]=1;walkable++;}
        }
        const squared=this.distanceTransform(width,height,free),distance=new Float32Array(N);
        for(let i=0;i<N;i++)distance[i]=Math.sqrt(squared[i]);
        const forNeighbors=(i,fn)=>
        {
            const x=i%width,y=Math.floor(i/width);
            if(y>0)fn(i-width);
            if(x>0)fn(i-1);
            if(x+1<width)fn(i+1);
            if(y+1<height)fn(i+width);
        };

        // Find regional maxima plateaus. Strictly higher neighbors disqualify
        // the entire plateau; a flat ridge is one marker, never many markers.
        const seen=new Uint8Array(N),peaks=[],seeds=[];
        for(let start=0;start<N;start++)
        {
            if(!free[start]||seen[start])continue;
            const plateau=[start];seen[start]=1;
            let localMax=true,sumX=0,sumY=0;
            for(let qi=0;qi<plateau.length;qi++)
            {
                const i=plateau[qi];sumX+=i%width;sumY+=Math.floor(i/width);
                forNeighbors(i,j=>{
                    if(!free[j])return;
                    if(squared[j]>squared[i]+1e-7)localMax=false;
                    if(!seen[j]&&Math.abs(squared[j]-squared[i])<=1e-7)
                    {seen[j]=1;plateau.push(j);}
                });
            }
            if(!localMax)continue;
            const centerX=sumX/plateau.length,centerY=sumY/plateau.length;
            let representative=plateau[0],dBest=Infinity;
            for(const i of plateau)
            {
                const score=(i%width-centerX)**2+(Math.floor(i/width)-centerY)**2;
                if(score<dBest){representative=i;dBest=score;}
            }
            peaks.push({id:peaks.length+1,x:representative%width,y:Math.floor(representative/width),radius:distance[representative],plateauSize:plateau.length,area:0});
            seeds.push(plateau);
        }

        // Marker-controlled descending watershed. Propagate broad regions to
        // narrow cells with a max-priority queue (negative values on min-heap).
        const basin=new Int32Array(N),heap=new AIDistanceMinHeap();
        for(let n=0;n<seeds.length;n++)for(const i of seeds[n])
        {
            basin[i]=n+1;
            heap.push({d:-squared[i],i});
        }
        while(heap.length)
        {
            const cur=heap.pop(),tag=basin[cur.i];
            forNeighbors(cur.i,j=>{
                if(free[j]&&!basin[j]){basin[j]=tag;heap.push({d:-squared[j],i:j});}
            });
        }
        const counts=new Int32Array(peaks.length+1);
        for(let i=0;i<N;i++)if(basin[i])counts[basin[i]]++;
        for(const p of peaks)p.area=counts[p.id];

        // Each preliminary basin boundary has a "saddle": the widest pass
        // connecting both basins. This is the maximum of minimum clearance
        // over neighboring tiles at the boundary (one static watershed pass).
        const seamMap=new Map();
        for(let i=0;i<N;i++)
        {
            if(!basin[i])continue;
            for(const j of [i+1,i+width])
            {
                if(j>=N||(j===i+1 && i%width===width-1))continue;
                if(!basin[j]||basin[j]===basin[i])continue;
                const a=Math.min(basin[i],basin[j]),b=Math.max(basin[i],basin[j]),key=a+':'+b;
                const saddle=Math.min(distance[i],distance[j]);
                const old=seamMap.get(key);
                if(!old||saddle>old.saddle)seamMap.set(key,{a,b,saddle,x:i%width,y:Math.floor(i/width)});
            }
        }
        const seams=[...seamMap.values()].sort((a,b)=>b.saddle-a.saddle||a.a-b.a||a.b-b.b);

        // Hierarchical basin merging: suppress shallow maxima whose peak-to-
        // saddle prominence is small, as well as tiny fragments. Roots retain
        // the largest peak and the sum of areas; recompute after each merge.
        const parent=new Int32Array(peaks.length+1),areas=new Int32Array(peaks.length+1),radii=new Float32Array(peaks.length+1),rootPeak=new Int32Array(peaks.length+1);
        for(const p of peaks){parent[p.id]=p.id;areas[p.id]=p.area;radii[p.id]=p.radius;rootPeak[p.id]=p.id;}
        const root=a=>{while(parent[a]!==a){parent[a]=parent[parent[a]];a=parent[a];}return a;};
        let merges=0;
        for(const edge of seams)
        {
            let a=root(edge.a),b=root(edge.b);
            if(a===b||cfg.rawOnly===true)continue;
            const small=Math.min(radii[a],radii[b]);
            const prominence=Math.max(0,small-edge.saddle);
            const weak=prominence<cfg.minProminence || prominence/Math.max(small,1e-6)<cfg.minRelativeProminence;
            const tiny=Math.min(areas[a],areas[b])<cfg.minRegionArea;
            if(!weak&&!tiny)continue;
            // Merge into root with stronger peak (stable on ties).
            if(radii[a]<radii[b]||(radii[a]===radii[b]&&a>b))[a,b]=[b,a];
            parent[b]=a;areas[a]+=areas[b];
            if(radii[b]>radii[a]){radii[a]=radii[b];rootPeak[a]=rootPeak[b];}
            merges++;
        }
        const region=new Int32Array(N),rootIds=new Map(),regions=[];
        const accum=[];
        for(let i=0;i<N;i++)
        {
            if(!basin[i])continue;
            const r=root(basin[i]);
            if(!rootIds.has(r))
            {
                const id=rootIds.size+1;rootIds.set(r,id);
                const peak=peaks[rootPeak[r]-1];
                regions.push({id,area:0,centerX:0,centerY:0,peakX:peak.x,peakY:peak.y,peakRadius:peak.radius,basins:0});
                accum[id]=[0,0];
            }
            const id=rootIds.get(r),entry=regions[id-1];region[i]=id;
            entry.area++;accum[id][0]+=i%width;accum[id][1]+=Math.floor(i/width);
        }
        for(const entry of regions)
        {
            entry.centerX=accum[entry.id][0]/entry.area;
            entry.centerY=accum[entry.id][1]/entry.area;
        }
        for(const p of peaks)if(rootIds.has(root(p.id)))regions[rootIds.get(root(p.id))-1].basins++;
        const edges=[];
        for(const e of seams)
        {
            const a=rootIds.get(root(e.a)),b=rootIds.get(root(e.b));
            if(a!==b)edges.push({...e,regionA:a,regionB:b});
        }
        return {width,height,free,distance,squared,basin,region,peaks,regions,seams,edges,
            stats:{walkable,peaks:peaks.length,basins:peaks.length,regions:regions.length,merges,originalSeams:seams.length}};
    }

    static fromTilemap(gameMap,layer,parameters={})
    {
        return this.build({width:gameMap.width,height:gameMap.height,isWall:(x,y)=>{
            const tile=layer.getTileAt(x,y);
            return tile!=null&&tile.properties?.collides===true;
        }},parameters);
    }
}
