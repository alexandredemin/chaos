//---------------------------- atackFeatures classes ----------------------------

class AtackFeature
{

    constructor()
    {

    }

}

class InfectiousAtack extends AtackFeature
{
    constructor()
    {
        super();
    }

    onAtack(attackUnit, defendUnit)
    {
        if(InfectedState.canInfect(defendUnit)) InfectedState.apply(defendUnit);
        return true;
    }

}