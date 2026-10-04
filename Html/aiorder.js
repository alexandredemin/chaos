//---------------------------- Structured AI orders ----------------------------

class AIOrder
{
	static create(type,target=null,targetPos=null,options={})
	{
		if(type==null)return null;
		return {
			type,
			target:target||null,
			targetPos:targetPos?[targetPos[0],targetPos[1]]:null,
			reason:options.reason??null,
			profile:options.profile??'auto',
			priority:options.priority??null,
			state:options.state||{}
		};
	}

	static type(order){return order&&typeof order==='object'?order.type:order||null;}
	static target(order){return order&&typeof order==='object'?order.target||null:null;}
	static targetPos(order){return order&&typeof order==='object'&&order.targetPos?[order.targetPos[0],order.targetPos[1]]:null;}
	static is(order,type){return this.type(order)===type;}
	static state(order){if(order==null||typeof order!=='object')return null;if(order.state==null)order.state={};return order.state;}
}
