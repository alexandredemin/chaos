//---------------------------- Monster spawn effects ----------------------------

class MonsterSpawnAnimator
{
	static isAnimatedEffect(effectConfig)
	{
		if(effectConfig == null) return false;
		return effectConfig.type === 'emerge' || effectConfig.type === 'burst';
	}

	static playBatch(options={}, onComplete=null)
	{
		const source = options.source || null;
		const scene = options.scene || (source != null ? source.scene : null);
		const units = Array.isArray(options.units) ? options.units : [];
		const effectConfig = options.effect || {};
		const triggerUnit = options.triggerUnit || null;
		const finalVisible = options.finalVisible !== false;
		let finished = false;

		const finishBatch = () =>
		{
			if(finished) return;
			finished = true;
			if(onComplete != null) onComplete();
		};

		if(units.length <= 0)
		{
			finishBatch();
			return;
		}

		const revealAll = () =>
		{
			for(let i = 0; i < units.length; i++)
			{
				this.revealUnit(units[i], finalVisible);
			}
			finishBatch();
		};

		if(finalVisible !== true)
		{
			finishBatch();
			return;
		}
		if(!this.isAnimatedEffect(effectConfig))
		{
			revealAll();
			return;
		}

		if(source == null || scene == null || scene.add == null || scene.tweens == null)
		{
			revealAll();
			return;
		}
		// Do not spend time on visual effects when enemy actions are hidden by the game settings.
		if(typeof shouldShowActionAnimation === 'function' && shouldShowActionAnimation(triggerUnit) !== true)
		{
			revealAll();
			return;
		}
		const staggerDelay = Math.max(0, Number(effectConfig.staggerDelay) || 0);
		const maxStaggerDelay = Math.max(0, effectConfig.maxStaggerDelay != null ? Number(effectConfig.maxStaggerDelay) : 400);
		let completedCount = 0;

		const onUnitComplete = () =>
		{
			completedCount++;
			if(completedCount >= units.length) finishBatch();
		};

		for(let i = 0; i < units.length; i++)
		{
			const unit = units[i];
			const delay = Math.min(i * staggerDelay, maxStaggerDelay);

			const startEffect = () =>
			{
				this.playUnitEffect(source, unit, effectConfig, finalVisible, onUnitComplete);
			};

			if(delay > 0 && scene.time != null && typeof scene.time.delayedCall === 'function') scene.time.delayedCall(delay, startEffect);
			else startEffect();
		}
	}

	static playUnitEffect(source, unit, effectConfig, finalVisible, onComplete)
	{
		if(unit == null || unit.active === false)
		{
			if(onComplete != null) onComplete();
			return;
		}
		switch(effectConfig.type)
		{
			case 'emerge':
				this.playEmergeEffect(source, unit, effectConfig, finalVisible, onComplete);
				return;
			case 'burst':
				this.playBurstEffect(source, unit, effectConfig, finalVisible, onComplete);
				return;
		}
		this.revealUnit(unit, finalVisible);
		if(onComplete != null) onComplete();
	}

	static createEffectSprite(source, unit, effectConfig)
	{
		if(source == null || unit == null || unit.scene == null || unit.texture == null) return null;
		const scene = unit.scene;
		const sourceOffsetX = Number(effectConfig.sourceOffsetX) || 0;
		const sourceOffsetY = Number(effectConfig.sourceOffsetY) || 0;
		const startX = source.x + sourceOffsetX;
		const startY = source.y + sourceOffsetY;
		const frameName = unit.frame != null ? unit.frame.name : 0;
		const sprite = scene.add.sprite(startX, startY, unit.texture.key, frameName);
		sprite.setOrigin(unit.originX, unit.originY);
		sprite.setRotation(unit.rotation || 0);
		sprite.setFlip(unit.x < startX, unit.flipY === true);
		const sourceDepth = Number.isFinite(source.depth) ? source.depth : 0;
		const unitDepth = Number.isFinite(unit.depth) ? unit.depth : 0;
		sprite.setDepth(Math.max(sourceDepth, unitDepth) + 8);
		if(effectConfig.playMoveAnimation !== false && unit.config != null)
		{
			const runAnimationKey = unit.config.sprite + 'run';
			if(scene.anims != null && scene.anims.exists(runAnimationKey)) sprite.anims.play(runAnimationKey, true);
		}
		return {sprite: sprite, startX: startX, startY: startY, baseScaleX: unit.scaleX, baseScaleY: unit.scaleY};
	}

	static playEmergeEffect(
		source,
		unit,
		effectConfig,
		finalVisible,
		onComplete
	)
	{
		const effect = this.createEffectSprite(
			source,
			unit,
			effectConfig
		);

		if(effect == null)
		{
			this.revealUnit(unit, finalVisible);

			if(onComplete != null)
			{
				onComplete();
			}

			return;
		}

		const sprite = effect.sprite;

		const initialScale =
			effectConfig.initialScale != null
				? Math.max(
					0.01,
					Number(effectConfig.initialScale)
				)
				: 0.18;

		const intermediateScale =
			effectConfig.intermediateScale != null
				? Math.max(
					initialScale,
					Number(effectConfig.intermediateScale)
				)
				: 0.45;

		const initialAlpha =
			effectConfig.initialAlpha != null
				? Math.max(
					0,
					Math.min(
						1,
						Number(effectConfig.initialAlpha)
					)
				)
				: 0.35;

		const emergeLift =
			effectConfig.emergeLift != null
				? Number(effectConfig.emergeLift)
				: 2;

		const emergeDuration = Math.max(
			1,
			effectConfig.emergeDuration != null
				? Number(effectConfig.emergeDuration)
				: 150
		);

		const moveDuration = Math.max(
			1,
			effectConfig.moveDuration != null
				? Number(effectConfig.moveDuration)
				: 320
		);

		sprite.setScale(
			effect.baseScaleX * initialScale,
			effect.baseScaleY * initialScale
		);

		sprite.setAlpha(initialAlpha);

		unit.setVisible(false);

		unit.scene.tweens.add({
			targets: sprite,

			y: effect.startY - emergeLift,

			scaleX:
				effect.baseScaleX *
				intermediateScale,

			scaleY:
				effect.baseScaleY *
				intermediateScale,

			alpha: 1,

			duration: emergeDuration,
			ease: effectConfig.emergeEase || 'Quad.Out',

			onComplete: () =>
			{
				if(sprite.active === false)
				{
					this.revealUnit(
						unit,
						finalVisible
					);

					if(onComplete != null)
					{
						onComplete();
					}

					return;
				}

				unit.scene.tweens.add({
					targets: sprite,

					x: unit.x,
					y: unit.y,

					scaleX: effect.baseScaleX,
					scaleY: effect.baseScaleY,

					alpha: 1,

					duration: moveDuration,
					ease:
						effectConfig.moveEase ||
						'Cubic.Out',

					onComplete: () =>
					{
						this.finishEffect(
							sprite,
							unit,
							finalVisible,
							onComplete
						);
					}
				});
			}
		});
	}

	static playBurstEffect(
		source,
		unit,
		effectConfig,
		finalVisible,
		onComplete
	)
	{
		const effect = this.createEffectSprite(
			source,
			unit,
			effectConfig
		);

		if(effect == null)
		{
			this.revealUnit(unit, finalVisible);

			if(onComplete != null)
			{
				onComplete();
			}

			return;
		}

		const sprite = effect.sprite;

		const initialScale =
			effectConfig.initialScale != null
				? Math.max(
					0.01,
					Number(effectConfig.initialScale)
				)
				: 0.25;

		const launchScale =
			effectConfig.launchScale != null
				? Math.max(
					initialScale,
					Number(effectConfig.launchScale)
				)
				: 0.72;

		const overshootScale =
			effectConfig.overshootScale != null
				? Math.max(
					1,
					Number(effectConfig.overshootScale)
				)
				: 1.10;

		const jumpHeight =
			effectConfig.jumpHeight != null
				? Math.max(
					0,
					Number(effectConfig.jumpHeight)
				)
				: 7;

		const initialAlpha =
			effectConfig.initialAlpha != null
				? Math.max(
					0,
					Math.min(
						1,
						Number(effectConfig.initialAlpha)
					)
				)
				: 0.65;

		const launchDuration = Math.max(
			1,
			effectConfig.launchDuration != null
				? Number(effectConfig.launchDuration)
				: (
					effectConfig.emergeDuration != null
						? Number(
							effectConfig.emergeDuration
						)
						: 110
				)
		);

		const moveDuration = Math.max(
			1,
			effectConfig.moveDuration != null
				? Number(effectConfig.moveDuration)
				: 240
		);

		const settleDuration = Math.max(
			1,
			effectConfig.settleDuration != null
				? Number(effectConfig.settleDuration)
				: 90
		);

		sprite.setScale(
			effect.baseScaleX * initialScale,
			effect.baseScaleY * initialScale
		);

		sprite.setAlpha(initialAlpha);

		unit.setVisible(false);

		/*
		 * First phase: the creature jumps out of the source.
		 */
		unit.scene.tweens.add({
			targets: sprite,

			y: effect.startY - jumpHeight,

			scaleX:
				effect.baseScaleX *
				launchScale,

			scaleY:
				effect.baseScaleY *
				launchScale,

			alpha: 1,

			duration: launchDuration,
			ease:
				effectConfig.launchEase ||
				'Back.Out',

			onComplete: () =>
			{
				if(sprite.active === false)
				{
					this.revealUnit(
						unit,
						finalVisible
					);

					if(onComplete != null)
					{
						onComplete();
					}

					return;
				}

				/*
				 * Second phase: move to the reserved cell
				 * and slightly overshoot the final scale.
				 */
				unit.scene.tweens.add({
					targets: sprite,

					x: unit.x,
					y: unit.y,

					scaleX:
						effect.baseScaleX *
						overshootScale,

					scaleY:
						effect.baseScaleY *
						overshootScale,

					duration: moveDuration,
					ease:
						effectConfig.moveEase ||
						'Cubic.Out',

					onComplete: () =>
					{
						if(sprite.active === false)
						{
							this.revealUnit(
								unit,
								finalVisible
							);

							if(onComplete != null)
							{
								onComplete();
							}

							return;
						}

						/*
						 * Third phase: short landing/settling.
						 */
						unit.scene.tweens.add({
							targets: sprite,

							scaleX:
								effect.baseScaleX,

							scaleY:
								effect.baseScaleY,

							duration:
								settleDuration,

							ease:
								effectConfig.settleEase ||
								'Quad.Out',

							onComplete: () =>
							{
								this.finishEffect(
									sprite,
									unit,
									finalVisible,
									onComplete
								);
							}
						});
					}
				});
			}
		});
	}

	static finishEffect(
		sprite,
		unit,
		finalVisible,
		onComplete
	)
	{
		if(sprite != null &&
			sprite.active !== false)
		{
			sprite.destroy();
		}

		this.revealUnit(
			unit,
			finalVisible
		);

		if(onComplete != null)
		{
			onComplete();
		}
	}

	static revealUnit(unit, visible=true)
	{
		if(unit == null ||
			unit.active === false)
		{
			return;
		}

		unit.setVisible(
			visible === true
		);

		if(visible !== true)
		{
			return;
		}

		let alpha = 1;

		if(unit.features != null &&
			unit.features.alpha != null)
		{
			alpha = unit.features.alpha;
		}
		else if(unit.config != null &&
			unit.config.features != null &&
			unit.config.features.alpha != null)
		{
			alpha = unit.config.features.alpha;
		}

		unit.setAlpha(alpha);
		unit.setDepthFromBottom();

		if(unit.config != null &&
			unit.scene != null &&
			unit.scene.anims != null)
		{
			const stopAnimationKey =
				unit.config.sprite + 'stop';

			if(unit.scene.anims.exists(
				stopAnimationKey
			))
			{
				unit.anims.play(
					stopAnimationKey,
					true
				);
			}
		}
	}
}