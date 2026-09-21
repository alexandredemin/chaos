const LockType = {
	KEY: 'key',
	SCENARIO: 'scenario'
};

const CloseMode = {
	AUTO: 'auto',
	MANUAL: 'manual',
	NEVER: 'never'
};

class OpenableSystem
{
	static getCloseMode(entity)
	{
		return entity && entity.features && entity.features.closeMode ? entity.features.closeMode : CloseMode.MANUAL;
	}

	static canClose(entity)
	{
		return this.getCloseMode(entity) !== CloseMode.NEVER;
	}

	static shouldAutoClose(entity)
	{
		return this.getCloseMode(entity) === CloseMode.AUTO;
	}
}

class LockSystem
{
	static getLock(entity)
	{
		return entity && entity.features ? entity.features.lock || null : null;
	}

	static isLocked(entity)
	{
		const lock = this.getLock(entity);
		return lock != null && lock.locked === true;
	}

	static getRequiredKeyId(entity)
	{
		const lock = this.getLock(entity);
		return lock && lock.keyId != null ? lock.keyId : 'common';
	}

	static findKey(unit,entity)
	{
		const lock = this.getLock(entity);
		if(unit == null || lock == null || lock.type !== LockType.KEY) return null;
		if(!unit.features || !Array.isArray(unit.features.items)) return null;

		const keyId = this.getRequiredKeyId(entity);
		for(let i=0;i<unit.features.items.length;i++)
		{
			const item = Item.deserialize(unit.features.items[i]);
			if(item == null || item.configName !== 'key') continue;
			if((item.params && item.params.keyId != null ? item.params.keyId : 'common') !== keyId) continue;
			return {index:i,uid:item.uid,item:item};
		}
		return null;
	}

	static canUnlock(unit,entity)
	{
		if(!this.isLocked(entity)) return true;
		const lock = this.getLock(entity);
		if(lock.type !== LockType.KEY) return false;
		return this.findKey(unit,entity) != null;
	}

	static prepareUnlock(unit,entity)
	{
		if(!this.isLocked(entity)) return {success:true,alreadyUnlocked:true,consumeKey:false,keyUid:null};
		if(entity && entity._unlocking === true) return {success:false,reason:'busy'};

		const lock = this.getLock(entity);
		if(lock == null) return {success:true,alreadyUnlocked:true,consumeKey:false,keyUid:null};
		if(lock.type === LockType.SCENARIO) return {success:false,reason:'scenario_locked'};
		if(lock.type !== LockType.KEY) return {success:false,reason:'unsupported_lock'};

		const key = this.findKey(unit,entity);
		if(key == null) return {success:false,reason:'no_key'};

		return {
			success:true,
			alreadyUnlocked:false,
			keyUid:key.uid,
			consumeKey:lock.consumeKey !== false
		};
	}

	static commitUnlock(unit,entity,plan)
	{
		if(plan == null || plan.success !== true) return false;
		if(!this.isLocked(entity)) return true;

		if(plan.keyUid != null)
		{
			if(unit == null || !unit.features || !Array.isArray(unit.features.items)) return false;

			let keyIndex = -1;
			for(let i=0;i<unit.features.items.length;i++)
			{
				if(unit.features.items[i] && unit.features.items[i].uid === plan.keyUid)
				{keyIndex = i; break;}
			}

			if(keyIndex < 0) return false;
			if(plan.consumeKey === true) unit.removeItem(keyIndex);
		}

		const lock = this.getLock(entity);
		if(lock == null) return false;

		lock.locked = false;
		return true;
	}

	static unlockByScenario(entity)
	{
		const lock = this.getLock(entity);
		if(lock == null || lock.locked !== true) return false;

		lock.locked = false;
		if(typeof entity.updateSprite === 'function') entity.updateSprite();
		return true;
	}
}

// Manages generic hidden/revealed state without knowing how a concrete entity is rendered.
// Any entity may use features.hidden = {hidden:true,difficulty:N}; SearchAbility calls reveal().
class HiddenSystem
{
	static getHidden(entity)
	{
		return entity && entity.features ? entity.features.hidden || null : null;
	}

	static isHidden(entity)
	{
		const hidden = this.getHidden(entity);
		return hidden != null && hidden.hidden === true;
	}

	static getDifficulty(entity)
	{
		const hidden = this.getHidden(entity);
		const value = Number(hidden && hidden.difficulty);
		return Number.isFinite(value) ? Math.max(0,value) : 0;
	}

	static getSearchPower(unit)
	{
		const value = Number(unit && unit.features ? unit.features.searchPower : 0);
		return Number.isFinite(value) ? Math.max(0,value) : 0;
	}

	// Returns true when the unit/search power is sufficient to discover this hidden entity.
	static canReveal(unit,entity,searchPower=null)
	{
		if(!this.isHidden(entity)) return false;
		const power = searchPower == null ? this.getSearchPower(unit) : Number(searchPower);
		return Number.isFinite(power) && power >= this.getDifficulty(entity);
	}

	// Synchronizes visual visibility with hidden state.
	static syncVisibility(entity)
	{
		if(entity == null || typeof entity.setVisability !== 'function') return;
		if(this.getHidden(entity) == null) return;
		entity.setVisability(!this.isHidden(entity));
	}

	// Reveals an entity once. Returns true only when a hidden entity was successfully discovered.
	static reveal(entity,unit=null,searchPower=null)
	{
		if(!this.canReveal(unit,entity,searchPower)) return false;
		this.getHidden(entity).hidden = false;
		if(typeof entity.onHiddenRevealed === 'function') entity.onHiddenRevealed(unit);
		else if(typeof entity.setVisability === 'function') entity.setVisability(true);
		return true;
	}
}

function playEntityVisualTransition(entity,targetState,commitState,onComplete=null,duration=170)
{
	const finish = () =>
	{
		const result = typeof commitState === 'function' ? commitState() : true;
		if(typeof entity.updateSprite === 'function') entity.updateSprite();
		if(onComplete != null) onComplete(result);
	};

	if(entity == null || entity.scene == null || typeof entity.getVisualDescriptor !== 'function')
		{finish(); return;}

	if(typeof shouldShowActionAnimation === 'function' && !shouldShowActionAnimation())
		{finish(); return;}

	const scene = entity.scene;
	const oldVisual = entity.getVisualDescriptor(typeof entity.getVisualState === 'function' ? entity.getVisualState() : null);
	const newVisual = entity.getVisualDescriptor(targetState);

	if(oldVisual == null || newVisual == null || oldVisual.texture == null || newVisual.texture == null)
		{finish(); return;}

	const prevAlpha = entity.alpha;
	const overlay = scene.add.image(entity.x,entity.y,newVisual.texture,newVisual.frame ?? 0);

	overlay.setOrigin(entity.originX,entity.originY);
	if(Number.isFinite(entity.displayOriginX) && Number.isFinite(entity.displayOriginY))
		overlay.setDisplayOrigin(entity.displayOriginX,entity.displayOriginY);

	overlay.setScale(entity.scaleX,entity.scaleY);
	overlay.setRotation(entity.rotation);
	overlay.setFlip(entity.flipX,entity.flipY);
	overlay.setDepth(typeof entity.getTransitionDepthForState === 'function' ? entity.getTransitionDepthForState(targetState) : entity.depth+0.01);
	overlay.setAlpha(0);

	entity.setTexture(oldVisual.texture,oldVisual.frame ?? 0);
	entity.setAlpha(prevAlpha);

	let oldTween = null;
	let newTween = null;

	const complete = () =>
	{
		if(overlay.active !== false) overlay.destroy();
		entity.setAlpha(prevAlpha);
		finish();
	};

	const guardedComplete = typeof AsyncGuard !== 'undefined' ? AsyncGuard.wrap(
		'entity_visual_transition',
		complete,
		{
			timeoutMs:duration+1500,
			data:{
				entity:entity.config ? entity.config.name : null,
				x:entity.mapX,
				y:entity.mapY,
				state:targetState
			},
			onTimeout:() =>
			{
				if(oldTween != null) oldTween.stop();
				if(newTween != null) newTween.stop();
				if(scene.tweens != null) scene.tweens.killTweensOf(overlay);
			}
		}
	) : complete;

	oldTween = scene.tweens.add({
		targets:entity,
		alpha:0,
		duration:duration,
		ease:'Linear'
	});

	newTween = scene.tweens.add({
		targets:overlay,
		alpha:prevAlpha,
		duration:duration,
		ease:'Linear',
		onComplete:guardedComplete
	});
}