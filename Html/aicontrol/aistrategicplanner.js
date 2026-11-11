// Strategy selection is per player. Registration is explicit and ordered.
// A strategy controls order selection only; execution remains in AIControl.
// Contract: factory(ai) -> {plan(midTurn=false)}.
const AIStrategicPlannerRegistry=(()=>{
    const factories=new Map();
    return Object.freeze({
        register(id,factory)
        {
            if(typeof id!=='string'||!id||typeof factory!=='function')throw new Error('Invalid strategic planner registration');
            if(factories.has(id))throw new Error('Strategic planner already registered: '+id);
            factories.set(id,factory);
        },
        create(id,ai)
        {
            const factory=factories.get(id);
            if(!factory)throw new Error('Unknown strategic planner: '+id);
            const planner=factory(ai);
            if(!planner||typeof planner.plan!=='function')throw new Error('Strategic planner missing plan(): '+id);
            return planner;
        },
        list(){return [...factories.keys()];},
        has(id){return factories.has(id);}
    });
})();
