// Shared read-only topology snapshot for strategic AI.  Neither the strategy nor
// HOLD constructs private copies: they use the same graph for the current map.
// Tile COLLISION is hashed once per strategic planning call, so revealing a
// hidden passage also invalidates the graph without a special door hook.
class AITopologyRuntime
{
    static snapshot = null;

    static invalidate(){this.snapshot=null;}

    static get()
    {
        if(typeof map==='undefined'||!map||typeof wallsLayer==='undefined'||!wallsLayer)return null;
        const metadata=typeof ScenarioEvents!=='undefined'?ScenarioEvents.mapMetadata:null;
        const width=map.width,height=map.height;
        let hash=2166136261;
        for(let y=0;y<height;y++)for(let x=0;x<width;x++)
        {
            const wall=wallsLayer.getTileAt(x,y)?.properties?.collides===true?1:0;
            hash=Math.imul(hash^wall,16777619)>>>0;
        }
        const cached=this.snapshot;
        if(cached&&cached.gameMap===map&&cached.layer===wallsLayer&&cached.metadata===metadata&&
            cached.width===width&&cached.height===height&&cached.hash===hash)return cached.graph;
        // Raw geometry is only needed for handmade maps: generated zones use
        // room rectangles and the actual collision layer for connections.
        const graph=AITopologyGraph.fromTilemap(map,wallsLayer,metadata);
        this.snapshot={gameMap:map,layer:wallsLayer,metadata,width,height,hash,graph};
        return graph;
    }
}
