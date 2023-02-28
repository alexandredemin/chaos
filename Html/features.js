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
        if(InfectedState.canInfect(defendUnit))defendUnit.addState(new InfectedState(defendUnit));
        return true;
    }

}