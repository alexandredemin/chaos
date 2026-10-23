// Shared binary min-heap, ordered by `d` (priority / estimated total route cost).
// Used by both Dijkstra distance maps and the universal A* pathfinder.
class AIDistanceMinHeap
{
    constructor(){this.items=[];}
    push(v)
    {
        const a=this.items;let i=a.length;a.push(v);
        while(i>0){const j=(i-1)>>1;if(a[j].d<=v.d)break;a[i]=a[j];i=j;}
        a[i]=v;
    }
    pop()
    {
        const a=this.items,r=a[0],v=a.pop();
        if(a.length)
        {
            let i=0;
            while(2*i+1<a.length)
            {
                let j=2*i+1;if(j+1<a.length&&a[j+1].d<a[j].d)j++;
                if(v.d<=a[j].d)break;a[i]=a[j];i=j;
            }
            a[i]=v;
        }
        return r;
    }
    get length(){return this.items.length;}
}
