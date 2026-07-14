//---------------------------- Independent AI ----------------------------
class IndependentAIControl
{
	constructor(player)
	{
		this.player = player;
		this.availableUnits = [];
	}

	startTurn()
	{
		setTimeout(endTurn, 1);
	}
}