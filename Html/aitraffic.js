//---------------------------- AI traffic controller ----------------------------

class AITrafficController
{
	constructor(aiControl)
	{
		this.ai = aiControl;
	}

	getState(unit)
	{
		if(unit.aiTraffic == null)
		{
			unit.aiTraffic = {
				incoming: null,
				outgoing: null,
				deferred: null,
				yieldDir: null,
				pendingStep: null
			};
		}
		return unit.aiTraffic;
	}

	startTurn()
	{
		for(const unit of this.ai.player.units)
		{
			const state = this.getState(unit);
			state.incoming = null;
			state.outgoing = null;
			state.deferred = null;
			state.pendingStep = null;
			unit.aiMessages = [];
		}
	}

	needsActivation(unit)
	{
		if(unit == null || unit.died) return false;
		const state = this.getState(unit);
		if(state.pendingStep != null || state.incoming != null || state.outgoing != null) return true;
		if(state.deferred != null && (state.deferred.reason === 'busy' || state.deferred.reason === 'preempted')) return true;
		return Array.isArray(unit.aiMessages) && unit.aiMessages.length > 0;
	}

	isBusy(unit)
	{
		if(unit == null || unit.died) return false;
		const state = this.getState(unit);
		if(state.incoming != null || state.outgoing != null || state.pendingStep != null) return true;
		return Array.isArray(unit.aiMessages) && unit.aiMessages.some(m => m.type === 'yield_request');
	}

	dirTo(unit, target)
	{
		if(unit == null || target == null) return null;
		return {dx: Math.sign(target.mapX - unit.mapX), dy: Math.sign(target.mapY - unit.mapY)};
	}

	sameDir(a, b)
	{
		return a != null && b != null && a.dx === b.dx && a.dy === b.dy;
	}

	addTriedTarget(incoming, unit)
	{
		if(incoming == null || unit == null) return;
		if(!Array.isArray(incoming.triedTargets)) incoming.triedTargets = [];
		if(!incoming.triedTargets.includes(unit.id)) incoming.triedTargets.push(unit.id);
	}

	reply(unit, incoming, type, reason=null)
	{
		if(incoming == null || incoming.sender == null || incoming.sender.died) return;
		AIMessageBus.send(unit, incoming.sender, type, {reason: reason}, incoming.id);
	}

	sendRootRequest(unit, blocker, cell)
	{
		const state = this.getState(unit);
		const message = AIMessageBus.send(unit, blocker, 'yield_request', {});
		if(message == null) return false;

		state.outgoing = {id: message.id, target: blocker, x: cell[0], y: cell[1], result: null, reason: null};
		return true;
	}

	forwardRequest(unit, incoming, blocker)
	{
		const state = this.getState(unit);
		const message = AIMessageBus.send(unit, blocker, 'yield_request', {}, incoming.id);
		if(message == null) return false;

		state.outgoing = {id: incoming.id, target: blocker, x: blocker.mapX, y: blocker.mapY, result: null, reason: null};
		return true;
	}

	processMessages(unit)
	{
		if(!Array.isArray(unit.aiMessages) || unit.aiMessages.length <= 0) return;

		const state = this.getState(unit);
		const replies = [];
		const requests = [];
		for(const message of unit.aiMessages)
		{
			if(message.type === 'yield_request') requests.push(message);
			else replies.push(message);
		}
		unit.aiMessages.length = 0;
		requests.sort((a,b) => a.id - b.id);

		for(const message of replies)
		{
			const out = state.outgoing;
			if(out == null || out.id !== message.id || out.target !== message.sender) continue;
			out.result = message.type;
			out.reason = message.data ? message.data.reason : null;
		}

		for(const message of requests)
		{
			if(message.sender == null || message.sender.died) continue;

			const sameActiveId = (state.incoming && state.incoming.id === message.id) || (state.outgoing && state.outgoing.id === message.id);
			if(sameActiveId)
			{
				this.reply(unit, {id: message.id, sender: message.sender}, 'yield_failed', 'cycle');
				continue;
			}

			if(state.incoming != null || state.outgoing != null)
			{
				if(state.outgoing != null && state.outgoing.target === message.sender && message.id < state.outgoing.id)
				{
					const oldOutgoing = state.outgoing;
					if(state.incoming != null) this.reply(unit, state.incoming, 'yield_rejected', 'preempted');
					else state.deferred = {target: oldOutgoing.target, x: oldOutgoing.x, y: oldOutgoing.y, reason: 'preempted'};
					state.incoming = null;
					state.outgoing = null;
					state.incoming = {id: message.id, sender: message.sender, triedTargets: []};
					continue;
				}

				this.reply(unit, {id: message.id, sender: message.sender}, 'yield_rejected', 'busy');
				continue;
			}

			state.incoming = {id: message.id, sender: message.sender, triedTargets: []};
		}
	}

	canUseCell(unit, x, y, ignoreUnit=null)
	{
		if(x < 0 || x >= map.width || y < 0 || y >= map.height) return false;
		const occupant = getUnitAtMap(x,y);
		if(occupant != null && occupant !== ignoreUnit) return false;

		const wallTile = wallsLayer.getTileAt(x,y);
		if(wallTile != null && wallTile.properties['collides'] === true) return false;

		const ents = Entity.getEntitiesAtMap(x,y);
		if(ents != null)
			for(const ent of ents)
				if(typeof ent.canStepOn === 'function' && ent.canStepOn(unit) !== true) return false;

		return true;
	}

	openDegree(unit, x, y)
	{
		let score = 0;
		for(let dy=-1;dy<=1;dy++)
			for(let dx=-1;dx<=1;dx++)
			{
				if(dx === 0 && dy === 0) continue;
				if(this.canUseCell(unit,x+dx,y+dy,unit)) score++;
			}
		return score;
	}

	findYieldCell(unit)
	{
		if(unit.features.move <= 0) return null;
		let best = [];
		let bestScore = -1;

		for(let dy=-1;dy<=1;dy++)
			for(let dx=-1;dx<=1;dx++)
			{
				if(dx === 0 && dy === 0) continue;
				if(!unit.canStepTo(dx,dy)) continue;

				const cell = [unit.mapX+dx,unit.mapY+dy];
				const score = this.openDegree(unit,cell[0],cell[1]);
				if(score > bestScore) {best = [cell]; bestScore = score;}
				else if(score === bestScore) best.push(cell);
			}

		if(best.length <= 0) return null;
		return best[randomInt(0,best.length-1)];
	}

	findFriendlyCandidates(unit, incoming)
	{
		const result = [];
		const tried = new Set(incoming && Array.isArray(incoming.triedTargets) ? incoming.triedTargets : []);

		for(let dy=-1;dy<=1;dy++)
			for(let dx=-1;dx<=1;dx++)
			{
				if(dx === 0 && dy === 0) continue;
				const other = getUnitAtMap(unit.mapX+dx,unit.mapY+dy);
				if(other == null || other.died || other.player !== unit.player) continue;
				if(incoming && other === incoming.sender) continue;
				if(tried.has(other.id)) continue;
				result.push({unit: other, score: this.openDegree(unit,other.mapX,other.mapY)});
			}

		if(result.length <= 0) return [];
		let bestScore = Math.max(...result.map(item => item.score));
		let best = result.filter(item => item.score === bestScore);
		for(let i=best.length-1;i>0;i--)
		{
			const j = randomInt(0,i);
			const tmp = best[i]; best[i] = best[j]; best[j] = tmp;
		}
		return best.map(item => item.unit).concat(result.filter(item => item.score !== bestScore).map(item => item.unit));
	}

	startTrafficStep(unit, cell, options={})
	{
		if(cell == null || !unit.canStepTo(cell[0]-unit.mapX,cell[1]-unit.mapY)) return false;
		const state = this.getState(unit);

		state.pendingStep = {
			fromX: unit.mapX,
			fromY: unit.mapY,
			toX: cell[0],
			toY: cell[1],
			clearIncoming: options.clearIncoming === true,
			clearOutgoing: options.clearOutgoing === true,
			clearDeferred: options.clearDeferred === true,
			clearYield: options.clearYield === true,
			yieldDir: options.yieldDir || null
		};

		unit.stepTo(cell[0],cell[1]);
		return true;
	}

	finishPendingStep(unit)
	{
		const state = this.getState(unit);
		const pending = state.pendingStep;
		if(pending == null) return false;

		const success = unit.mapX === pending.toX && unit.mapY === pending.toY;
		state.pendingStep = null;
		if(success)
		{
			if(pending.clearIncoming) state.incoming = null;
			if(pending.clearOutgoing) state.outgoing = null;
			if(pending.clearDeferred) state.deferred = null;
			if(pending.clearYield) state.yieldDir = null;
			if(pending.yieldDir != null) state.yieldDir = pending.yieldDir;
		}

		this.ai.pass(true);
		return true;
	}

	beforeNormalStep(unit, cell)
	{
		const state = this.getState(unit);
		if(state.incoming == null && state.yieldDir == null) return;

		state.pendingStep = {
			fromX: unit.mapX,
			fromY: unit.mapY,
			toX: cell[0],
			toY: cell[1],
			clearIncoming: state.incoming != null,
			clearOutgoing: false,
			clearDeferred: true,
			clearYield: true,
			yieldDir: null
		};
	}

	resolveOutgoing(unit)
	{
		const state = this.getState(unit);
		const out = state.outgoing;
		if(out == null) return 'continue';

		const occupant = getUnitAtMap(out.x,out.y);
		if(occupant == null)
		{
			const sender = state.incoming ? state.incoming.sender : null;
			const yieldDir = sender ? this.dirTo(unit,sender) : null;
			if(this.startTrafficStep(unit,[out.x,out.y],{
				clearIncoming: state.incoming != null,
				clearOutgoing: true,
				clearDeferred: true,
				clearYield: state.incoming == null,
				yieldDir: yieldDir
			})) return 'move';

			if(state.incoming != null) this.addTriedTarget(state.incoming,out.target);
			else state.deferred = {target: out.target, x: out.x, y: out.y, reason: 'failed'};
			state.outgoing = null;
			return state.incoming != null ? 'continue' : 'pass';
		}

		if(out.target == null || out.target.died || occupant !== out.target)
		{
			if(state.incoming != null) this.addTriedTarget(state.incoming,out.target);
			state.outgoing = null;
			return state.incoming != null ? 'continue' : 'pass';
		}

		if(out.result === 'yield_failed' || out.result === 'yield_rejected')
		{
			if(state.incoming != null)
			{
				this.addTriedTarget(state.incoming,out.target);
				state.outgoing = null;
				return 'continue';
			}

			state.deferred = {target: out.target, x: out.x, y: out.y, reason: out.result === 'yield_rejected' ? 'busy' : 'failed'};
			state.outgoing = null;
			return 'pass';
		}

		return 'wait';
	}

	handleIncoming(unit)
	{
		const state = this.getState(unit);
		const incoming = state.incoming;
		if(incoming == null) return false;

		if(unit.features.move <= 0)
		{
			this.reply(unit,incoming,'yield_failed','no_move');
			state.incoming = null;
			this.ai.pass(true);
			return true;
		}

		const yieldCell = this.findYieldCell(unit);
		if(yieldCell != null)
		{
			const yieldDir = this.dirTo(unit,incoming.sender);
			if(this.startTrafficStep(unit,yieldCell,{clearIncoming:true,clearDeferred:true,yieldDir:yieldDir})) return true;
		}

		const candidates = this.findFriendlyCandidates(unit,incoming);
		if(candidates.length > 0)
		{
			this.forwardRequest(unit,incoming,candidates[0]);
			this.ai.pass(true);
			return true;
		}

		this.reply(unit,incoming,'yield_failed','dead_end');
		state.incoming = null;
		this.ai.pass(true);
		return true;
	}

	handleDeferred(unit)
	{
		const state = this.getState(unit);
		const deferred = state.deferred;
		if(deferred == null) return false;
		if(deferred.reason === 'failed') return false;

		const occupant = getUnitAtMap(deferred.x,deferred.y);
		if(occupant == null)
		{
			if(this.startTrafficStep(unit,[deferred.x,deferred.y],{clearDeferred:true,clearYield:true})) return true;
			state.deferred = null;
			return false;
		}

		if(occupant !== deferred.target)
		{
			state.deferred = null;
			return false;
		}

		if(this.isBusy(occupant))
		{
			this.ai.pass(true);
			return true;
		}

		state.deferred = null;
		this.sendRootRequest(unit,occupant,[deferred.x,deferred.y]);
		this.ai.pass(true);
		return true;
	}

	beforeStep(unit)
	{
		const state = this.getState(unit);
		if(state.pendingStep != null) return this.finishPendingStep(unit);

		this.processMessages(unit);
		if(state.outgoing != null)
		{
			const result = this.resolveOutgoing(unit);
			if(result === 'move') return true;
			if(result === 'wait' || result === 'pass') {this.ai.pass(true); return true;}
			if(state.incoming != null) return this.handleIncoming(unit);
		}

		return false;
	}

	beforePass(unit)
	{
		const state = this.getState(unit);
		this.processMessages(unit);
		if(state.outgoing != null)
		{
			const result = this.resolveOutgoing(unit);
			if(result === 'move') return true;
			if(result === 'wait' || result === 'pass') {this.ai.pass(true); return true;}
		}
		if(state.incoming != null) return this.handleIncoming(unit);
		return false;
	}

	onFriendlyBlock(unit, cell, blocker)
	{
		const state = this.getState(unit);
		if(blocker == null || blocker.died || blocker.player !== unit.player) return false;

		if(state.incoming != null) return this.handleIncoming(unit);

		if(state.yieldDir != null)
		{
			const blockedDir = {dx: Math.sign(cell[0]-unit.mapX), dy: Math.sign(cell[1]-unit.mapY)};
			if(this.sameDir(blockedDir,state.yieldDir))
			{
				const yieldCell = this.findYieldCell(unit);
				if(yieldCell != null && this.startTrafficStep(unit,yieldCell,{yieldDir:state.yieldDir})) return true;
				this.ai.pass(true);
				return true;
			}
		}

		if(state.deferred != null)
		{
			const sameBlocker = state.deferred.target === blocker && state.deferred.x === cell[0] && state.deferred.y === cell[1];
			if(!sameBlocker) state.deferred = null;
			else if(state.deferred.reason === 'failed') {this.ai.pass(true); return true;}
			else if(this.isBusy(blocker)) {this.ai.pass(true); return true;}
			else state.deferred = null;
		}

		this.sendRootRequest(unit,blocker,cell);
		this.ai.pass(true);
		return true;
	}

	stepOnly(unit)
	{
		const state = this.getState(unit);
		if(state.pendingStep != null) return this.finishPendingStep(unit);

		this.processMessages(unit);
		if(state.outgoing != null)
		{
			const result = this.resolveOutgoing(unit);
			if(result === 'move') return true;
			if(result === 'wait' || result === 'pass') {this.ai.pass(true); return true;}
		}
		if(state.incoming != null) return this.handleIncoming(unit);
		if(state.deferred != null && (state.deferred.reason === 'busy' || state.deferred.reason === 'preempted')) return this.handleDeferred(unit);

		this.ai.pass(true);
		return true;
	}
}
