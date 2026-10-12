//---------------------------- Structured AI orders ----------------------------

class AIOrder
{
	static normalizeType(type)
	{
		return type==='attack'||type==='intercept'||type==='cleanup'?'engage':type;
	}

	static create(type,target=null,targetPos=null,options={})
	{
		if(type==null)return null;
		const originalType=typeof type==='object'?type.type:type;
		const normalizedType=this.normalizeType(originalType);
		const reason=options.reason??(normalizedType==='engage'&&originalType!==normalizedType?originalType:null);
		return {
			type:normalizedType,
			target:normalizedType==='move_to'?null:target||null,
			targetPos:targetPos?[targetPos[0],targetPos[1]]:null,
			reason,
			profile:options.profile??'auto',
			priority:options.priority??null,
			state:options.state||{}
		};
	}

	static type(order){return this.normalizeType(order&&typeof order==='object'?order.type:order||null);}
	static reason(order)
	{
		if(order==null)return null;
		const raw=order&&typeof order==='object'?order.type:order;
		return order&&typeof order==='object'&&order.reason!=null?order.reason:
			this.normalizeType(raw)==='engage'&&raw!=='engage'?raw:null;
	}
	static target(order){return order&&typeof order==='object'?order.target||null:null;}
	static targetPos(order){return order&&typeof order==='object'&&order.targetPos?[order.targetPos[0],order.targetPos[1]]:null;}
	// A tactical goal is either a live unit position or a fixed map point.
	static goal(order)
	{
		if(this.type(order)==='move_to')return this.targetPos(order);
		const target=this.target(order);
		if(target!=null&&!target.died)return[target.mapX,target.mapY];
		return this.targetPos(order);
	}
	static is(order,type)
	{
		if(type==='attack'||type==='intercept'||type==='cleanup')
			return this.type(order)==='engage'&&this.reason(order)===type;
		return this.type(order)===this.normalizeType(type);
	}
	static state(order){if(order==null||typeof order!=='object')return null;if(order.state==null)order.state={};return order.state;}
}
