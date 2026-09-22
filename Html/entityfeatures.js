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

	// Synchronizes visual visibility with hidden state and keeps the optional debug marker in sync.
	static syncVisibility(entity)
	{
		if(entity == null || typeof entity.setVisability !== 'function') return;
		if(this.getHidden(entity) == null) return;
		entity.setVisability(!this.isHidden(entity));
		this.syncDebugMarker(entity);
	}

	// Restores the final visual state and cancels any unfinished reveal tween.
	static finishRevealEffect(entity)
	{
		const state = entity != null ? entity._hiddenRevealState : null;
		if(state == null) return;
		if(entity.scene != null && entity.scene.tweens != null) entity.scene.tweens.killTweensOf(entity);
		if(entity.active !== false)
		{
			entity.setAlpha(state.alpha);
			entity.setScale(state.scaleX,state.scaleY);
		}
		entity._hiddenRevealState = null;
	}

	// Plays a short fade/pulse when a hidden entity becomes visible.
	static playRevealEffect(entity,unit=null,onComplete=null)
	{
		const finish = () =>
		{
			this.finishRevealEffect(entity);
			if(onComplete != null) onComplete();
		};

		if(entity == null || entity.scene == null || entity.scene.tweens == null || entity.visible === false)
		{
			if(onComplete != null) onComplete();
			return;
		}
		if(typeof shouldShowActionAnimation === 'function' && !shouldShowActionAnimation(unit))
		{
			if(onComplete != null) onComplete();
			return;
		}

		const scene = entity.scene;
		const state = {
			alpha:Number.isFinite(entity.alpha) ? entity.alpha : 1,
			scaleX:Number.isFinite(entity.scaleX) ? entity.scaleX : 1,
			scaleY:Number.isFinite(entity.scaleY) ? entity.scaleY : 1
		};
		entity._hiddenRevealState = state;
		entity.setAlpha(0);
		entity.setScale(state.scaleX*0.90,state.scaleY*0.90);
		scene.tweens.add({
			targets:entity,
			alpha:state.alpha,
			scaleX:state.scaleX*1.05,
			scaleY:state.scaleY*1.05,
			duration:170,
			ease:'Quad.easeOut',
			onComplete:() => {
				if(entity.active === false) {finish(); return;}
				scene.tweens.add({targets:entity,scaleX:state.scaleX,scaleY:state.scaleY,duration:80,ease:'Quad.easeIn',onComplete:finish});
			}
		});
	}

	// Removes the separate developer-only marker attached to one hidden entity.
	static clearDebugMarker(entity)
	{
		const marker = entity != null ? entity._hiddenDebugMarker : null;
		if(marker == null) return;
		if(marker.box != null && marker.box.active !== false) marker.box.destroy();
		if(marker.text != null && marker.text.active !== false) marker.text.destroy();
		entity._hiddenDebugMarker = null;
	}

	// Creates/removes a developer overlay without changing the real visibility of the hidden object.
	static syncDebugMarker(entity)
	{
		this.clearDebugMarker(entity);
		if(globalThis.debugShowHiddenObjects !== true || !this.isHidden(entity) || entity.scene == null) return;

		const color = entity.features && entity.features.containerType === 'tall' ? 0xffb347 : 0x55ffaa;
		const box = entity.scene.add.rectangle(entity.x,entity.y,14,14,color,0.12);
		box.setStrokeStyle(1,color,0.95);
		box.setDepth(20000);

		const text = entity.scene.add.text(entity.x,entity.y,'H'+this.getDifficulty(entity),{font:'8px monospace',color:'#ffffff',backgroundColor:'#000000'});
		text.setOrigin(0.5,0.5);
		text.setDepth(20001);
		entity._hiddenDebugMarker = {box,text};
	}

	// Enables/disables developer markers for every currently hidden entity. Returns the new state.
	static setDebugOverlayEnabled(enabled)
	{
		globalThis.debugShowHiddenObjects = enabled === true;
		if(typeof entities !== 'undefined' && Array.isArray(entities))
			for(const entity of entities) this.syncDebugMarker(entity);
		return globalThis.debugShowHiddenObjects;
	}

	// Reveals every hidden entity immediately. Intended for developer-console testing.
	static revealAll()
	{
		if(typeof entities === 'undefined' || !Array.isArray(entities)) return 0;
		let count = 0;
		for(const entity of entities) if(this.reveal(entity,null,Number.MAX_SAFE_INTEGER,{animate:false})) count++;
		console.log('[Hidden] revealAllHidden(): revealed '+count+' object(s)');
		return count;
	}

	// Reveals an entity once. Optional animation completion is used by blocking Search actions.
	static reveal(entity,unit=null,searchPower=null,options={})
	{
		if(!this.canReveal(unit,entity,searchPower))
		{
			if(typeof options.onComplete === 'function') options.onComplete(false);
			return false;
		}

		this.getHidden(entity).hidden = false;
		this.clearDebugMarker(entity);
		if(typeof entity.onHiddenRevealed === 'function') entity.onHiddenRevealed(unit);
		else if(typeof entity.setVisability === 'function') entity.setVisability(true);

		if(options.animate === false)
		{
			this.finishRevealEffect(entity);
			if(typeof options.onComplete === 'function') options.onComplete(true);
			return true;
		}

		this.playRevealEffect(entity,unit,() => {
			if(typeof options.onComplete === 'function') options.onComplete(true);
		});
		return true;
	}
}

if(globalThis.debugShowHiddenObjects == null) globalThis.debugShowHiddenObjects = false;
globalThis.setHiddenDebugOverlay = enabled => HiddenSystem.setDebugOverlayEnabled(enabled);
globalThis.revealAllHidden = () => HiddenSystem.revealAll();

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