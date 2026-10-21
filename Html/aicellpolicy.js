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
}
