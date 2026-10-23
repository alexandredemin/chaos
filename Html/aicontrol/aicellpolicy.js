//---------------------------- Unit-aware AI cell traversal and defensive-slot policy ----------------------------
// One place to extend AI hazard and immunity rules. This is not a game movement
// restriction: human players can deliberately enter dangerous cells.
class AICellPolicy
{
    static damageType(entity)
    {
        // Fire is the only built-in on-entry damage entity today. Future entities
        // can declare features.entryDamage and features.entryDamageType without
        // changing any planner, navigation or defensive-slot code.
        if(entity?.config?.name==='fire')return 'fire';
        const damage=entity?.features?.entryDamage??entity?.config?.features?.entryDamage;
        if(!(damage===true||(Number.isFinite(damage)&&damage>0)))return null;
        return entity?.features?.entryDamageType??entity?.config?.features?.entryDamageType??'generic';
    }

    static immune(unit,type)
    {
        return unit?.features?.[type+'Immunity']===true;
    }

    static assess(unit,x,y)
    {
        if(x<0||y<0||x>=map.width||y>=map.height)return{blocked:true,reason:'bounds',movePenalty:0,slotPenalty:0};
        const wall=wallsLayer.getTileAt(x,y);
        if(wall?.properties?.collides===true)return{blocked:true,reason:'wall',movePenalty:0,slotPenalty:0};
        let movePenalty=0,slotPenalty=0;
        for(const entity of Entity.getEntitiesAtMap(x,y)||[])
        {
            const damageType=this.damageType(entity);
            if(damageType!=null)
            {
                if(!this.immune(unit,damageType))return{blocked:true,reason:'entryDamage:'+damageType,movePenalty:0,slotPenalty:0};
                // Immunity to an entry hazard also removes its artificial traversal cost.
                // Each damage type must implement corresponding runtime immunity.
                continue;
            }
            if(typeof entity.canStepOn==='function'&&entity.canStepOn(unit)!==true)
                return{blocked:true,reason:'entity',movePenalty:0,slotPenalty:0};
            if(typeof entity.evaluateStep==='function')
            {
                const extra=entity.evaluateStep(unit);
                if(extra===false)return{blocked:true,reason:'entity',movePenalty:0,slotPenalty:0};
                if(Number.isFinite(extra))
                {
                    movePenalty+=Math.max(0,extra);
                    // Web and Glue cost movement / control without causing on-entry HP damage.
                    // Spider immunity is already encoded in WebEntity.evaluateStep(unit).
                    if(entity.config?.name==='web'||entity.config?.name==='glue_blob')
                        slotPenalty+=Math.max(0,extra)*.5;
                }
            }
            // Future non-damaging entities can declare their own defensive-slot cost.
            const explicit=entity.features?.aiSlotPenalty??entity.config?.features?.aiSlotPenalty;
            if(Number.isFinite(explicit))slotPenalty+=Math.max(0,explicit);
        }
        return{blocked:false,reason:null,movePenalty,slotPenalty};
    }

    /**
     * Shared *directed* AI movement edge cost (fromX,fromY) -> (toX,toY).
     * Web/Glue are charged when LEAVING the source cell, not when entering
     * the destination. The ordinary step always costs one movement point.
     *
     * This is the cost model used by Dijkstra, tactical MOVE, global MOVE_TO
     * A* and macro-MOVE A*. Risk, when supplied, is charged at the destination
     * (it represents exposure at a new position, not a movement penalty).
     *
     * `options` keeps special-purpose occupancy rules outside the cost model:
     *   policyAt(x,y), occupantAt(x,y), entitiesAt(x,y) - optional caches
     *   onEntity(entity), onUnit(unit) - legacy Dijkstra callbacks
     *   occupantCost(occupant,toX,toY) - custom A* occupancy cost, null=blocked
     *   canEnter(x,y), penaltyMap, riskPenalty(toX,toY,fromX,fromY)
     *
     * Returns null for a forbidden transition, otherwise a nonnegative cost.
     */
    static transitionCost(unit,fromX,fromY,toX,toY,options={})
    {
        const policyAt=options.policyAt||((x,y)=>this.assess(unit,x,y));
        const from=policyAt(fromX,fromY),to=policyAt(toX,toY);
        if(from.blocked||to.blocked)return null;
        if(options.canEnter&&options.canEnter(toX,toY)===false)return null;
        const move=Math.max(1,unit.config?.features?.move||1);
        let cost=1;
        // Preserve legacy getDistanceMap(onEntity) semantics: such callbacks
        // explicitly control entities, without movement penalties.
        if(!options.onEntity)
            cost+=Math.floor(from.movePenalty+.5)*move;
        if(options.onEntity)
        {
            const entities=options.entitiesAt?options.entitiesAt(toX,toY):Entity.getEntitiesAtMap(toX,toY)||[];
            if(entities.some(e=>options.onEntity(e)===false))return null;
        }
        const occupant=options.occupantAt
            ?options.occupantAt(toX,toY)
            :getUnitAtMap(toX,toY,unit.player);
        if(occupant&&occupant!==unit&&!occupant.died)
        {
            if(options.occupantCost)
            {
                const extra=options.occupantCost(occupant,toX,toY);
                if(extra==null||extra===false)return null;
                cost+=extra;
            }
            else if(options.onUnit)
            {
                if(options.onUnit(occupant)===false)return null;
            }
            else cost+=(occupant.player===unit.player?move:(occupant.config?.features?.health||1)*move);
        }
        if(options.penaltyMap)cost+=Number(options.penaltyMap[toY]?.[toX]||0);
        if(options.riskPenalty)cost+=Number(options.riskPenalty(toX,toY,fromX,fromY)||0);
        return Number.isFinite(cost)&&cost>=0?cost:null;
    }
}
