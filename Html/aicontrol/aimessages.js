//---------------------------- AI message bus ----------------------------

class AIMessageBus
{
	static nextId = 1;

	static send(sender, target, type, data={}, id=null)
	{
		if(target == null) return null;
		if(!Array.isArray(target.aiMessages)) target.aiMessages = [];

		const message = {
			id: id != null ? id : this.nextId++,
			type: type,
			sender: sender,
			data: data || {}
		};

		target.aiMessages.push(message);
		return message;
	}

	static forward(message, sender, target, type=null, data=null)
	{
		if(message == null) return null;
		return this.send(sender, target, type || message.type, data != null ? data : message.data, message.id);
	}
}
