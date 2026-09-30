//---------------------------- AI Test Mode ----------------------------

const AITest = {
	debugUnit: null,
	pickMode: null,
	draft: null,
	menu: null,
	status: null,
	lastPlan: null,
	consumePointer: false,

	init()
	{
		document.addEventListener('keydown', e => {
			const tag = e.target && e.target.tagName ? e.target.tagName.toLowerCase() : '';
			if(tag === 'input' || tag === 'textarea' || tag === 'select') return;
			if(e.key !== 'F6' && e.key !== 'F7' && e.key !== 'F8' && e.key !== 'Escape') return;

			if(e.key === 'Escape' && this.pickMode != null)
			{
				e.preventDefault();
				this.pickMode = null;
				this.updateStatus('selection cancelled');
				this.openMenu(true);
				return;
			}
			if(e.key === 'F6')
			{
				e.preventDefault();
				this.planOnly();
			}
			else if(e.key === 'F7')
			{
				e.preventDefault();
				this.executeStep();
			}
			else if(e.key === 'F8')
			{
				e.preventDefault();
				this.openMenu();
			}
		}, true);
	},

	ensureUI()
	{
		if(this.status == null)
		{
			this.status = document.createElement('div');
			Object.assign(this.status.style, {
				position:'fixed', left:'8px', top:'8px', zIndex:'3000000', display:'none',
				background:'rgba(0,0,0,.78)', color:'#fff', padding:'6px 8px', border:'1px solid #777',
				font:'13px monospace', whiteSpace:'pre', pointerEvents:'none'
			});
			document.body.appendChild(this.status);
		}
		if(this.menu != null) return;

		this.menu = document.createElement('div');
		Object.assign(this.menu.style, {
			position:'fixed', left:'50%', top:'50%', transform:'translate(-50%,-50%)', zIndex:'3000001',
			width:'430px', maxWidth:'calc(100vw - 24px)', background:'rgba(12,12,12,.97)', color:'#fff',
			border:'1px solid #888', padding:'14px', font:'14px monospace', display:'none', boxSizing:'border-box'
		});
		document.body.appendChild(this.menu);
	},

	unitName(unit)
	{
		if(unit == null) return 'none';
		const player = unit.player ? unit.player.name : '?';
		return (unit.config ? unit.config.name : 'unit') + ' [' + player + '] @ ' + unit.mapX + ',' + unit.mapY;
	},

	targetName(target,targetPos)
	{
		if(target != null && !target.died) return this.unitName(target);
		if(targetPos != null) return 'position ' + targetPos[0] + ',' + targetPos[1];
		return 'none';
	},

	getCurrentState(unit)
	{
		const ai = unit && unit.aiControl ? unit.aiControl : {};
		return {
			enabled:false,
			order:ai.order || '',
			profile:ai.tacticalProfile || 'auto',
			target:ai.mainTarget && !ai.mainTarget.died ? ai.mainTarget : null,
			targetPos:ai.mainTargetPos ? [ai.mainTargetPos[0],ai.mainTargetPos[1]] : null,
			threatTurns:ai.threatTurns ?? null
		};
	},

	getOverride(unit)
	{
		const ai = unit && unit.aiControl ? unit.aiControl : null;
		return ai && ai.aiTestOverride && ai.aiTestOverride.enabled === true ? ai.aiTestOverride : null;
	},

	getEffectiveState(unit)
	{
		return this.getOverride(unit) || this.getCurrentState(unit);
	},

	makeDraft(unit)
	{
		const state = this.getOverride(unit) || this.getCurrentState(unit);
		return {
			order:state.order || '',
			profile:state.profile || 'auto',
			target:state.target || null,
			targetPos:state.targetPos ? [state.targetPos[0],state.targetPos[1]] : null,
			threatTurns:state.threatTurns ?? null
		};
	},

	setDebugUnit(unit)
	{
		if(unit == null || unit.died) return false;
		this.debugUnit = unit;
		this.draft = this.makeDraft(unit);
		this.lastPlan = null;
		this.updateStatus();
		return true;
	},

	updateStatus(note=null)
	{
		this.ensureUI();
		if(this.debugUnit == null || this.debugUnit.died)
		{
			this.status.style.display = this.pickMode ? 'block' : 'none';
			this.status.textContent = this.pickMode ? 'AI TEST\n' + this.pickPrompt() : '';
			return;
		}
		const state = this.getEffectiveState(this.debugUnit);
		const profile = this.resolveProfile(this.debugUnit,state);
		let text = 'AI TEST | F6 PLAN | F7 STEP | F8 MENU\n';
		text += this.unitName(this.debugUnit) + '\n';
		text += 'order=' + (state.order || 'none') + ' profile=' + profile + ' target=' + this.targetName(state.target,state.targetPos);
		if(this.getOverride(this.debugUnit)) text += ' [TEST OVERRIDE]';
		if(this.pickMode) text += '\n' + this.pickPrompt();
		if(note) text += '\n' + note;
		this.status.textContent = text;
		this.status.style.display = 'block';
	},

	pickPrompt()
	{
		if(this.pickMode === 'debugUnit') return 'Click any unit to inspect (ESC cancel)';
		if(this.pickMode === 'targetUnit') return 'Click target unit (ESC cancel)';
		if(this.pickMode === 'targetPosition') return 'Click target map position (ESC cancel)';
		return '';
	},

	openMenu(preserveDraft=false)
	{
		this.ensureUI();
		if(this.menu.style.display !== 'none')
		{
			this.closeMenu();
			return;
		}

		if((this.debugUnit == null || this.debugUnit.died) && typeof selectedUnit !== 'undefined' && selectedUnit != null && !selectedUnit.died)
			this.setDebugUnit(selectedUnit);
		if(this.debugUnit == null || this.debugUnit.died)
		{
			this.beginPick('debugUnit');
			return;
		}
		if(!preserveDraft || this.draft == null) this.draft = this.makeDraft(this.debugUnit);
		this.renderMenu();
		this.menu.style.display = 'block';
		this.updateStatus();
	},

	closeMenu()
	{
		if(this.menu) this.menu.style.display = 'none';
		this.updateStatus();
	},

	button(label,handler)
	{
		const b=document.createElement('button');
		b.textContent=label;
		Object.assign(b.style,{margin:'3px',padding:'5px 8px',background:'#222',color:'#fff',border:'1px solid #777',cursor:'pointer',font:'13px monospace'});
		b.onclick=handler;
		return b;
	},

	select(values,current,onChange)
	{
		const s=document.createElement('select');
		Object.assign(s.style,{background:'#111',color:'#fff',border:'1px solid #777',padding:'4px',font:'13px monospace'});
		for(const [value,label] of values)
		{
			const o=document.createElement('option');o.value=value;o.textContent=label;s.appendChild(o);
		}
		s.value=current;
		s.onchange=()=>onChange(s.value);
		return s;
	},

	renderMenu()
	{
		const unit=this.debugUnit,current=this.getCurrentState(unit),override=this.getOverride(unit);
		this.menu.innerHTML='';

		const title=document.createElement('div');title.textContent='AI TEST';title.style.fontWeight='bold';title.style.fontSize='16px';title.style.marginBottom='10px';this.menu.appendChild(title);
		const unitLine=document.createElement('div');unitLine.textContent='Unit: '+this.unitName(unit);unitLine.style.marginBottom='6px';this.menu.appendChild(unitLine);
		this.menu.appendChild(this.button('Select another unit',()=>{this.closeMenu();this.beginPick('debugUnit');}));

		const game=document.createElement('div');
		game.style.cssText='margin:10px 0;padding:8px;border:1px solid #444;background:#171717;line-height:1.45';
		const currentProfile=this.resolveProfile(unit,current);
		game.innerHTML='<b>Current game AI</b><br>Order: '+(current.order||'none')+'<br>Profile: '+currentProfile+'<br>Target: '+this.targetName(current.target,current.targetPos);
		this.menu.appendChild(game);

		const test=document.createElement('div');test.style.cssText='margin:10px 0;padding:8px;border:1px solid #555;line-height:1.7';
		const orderRow=document.createElement('div');orderRow.append('Order: ');
		orderRow.appendChild(this.select([
			['','none'],['attack','Attack'],['intercept','Intercept'],['patrol','Patrol'],['cleanup','Cleanup']
		],this.draft.order,v=>this.draft.order=v));test.appendChild(orderRow);
		const profileRow=document.createElement('div');profileRow.append('Profile: ');
		profileRow.appendChild(this.select([
			['auto','Auto'],['cautious','Cautious'],['balanced','Balanced'],['aggressive','Aggressive'],['critical','Critical']
		],this.draft.profile,v=>this.draft.profile=v));test.appendChild(profileRow);
		const target=document.createElement('div');target.id='aiTestTargetLabel';target.textContent='Target: '+this.targetName(this.draft.target,this.draft.targetPos);test.appendChild(target);
		const targetButtons=document.createElement('div');
		targetButtons.appendChild(this.button('Select unit target',()=>{this.closeMenu();this.beginPick('targetUnit');}));
		targetButtons.appendChild(this.button('Select position',()=>{this.closeMenu();this.beginPick('targetPosition');}));
		targetButtons.appendChild(this.button('Clear target',()=>{this.draft.target=null;this.draft.targetPos=null;this.renderMenu();}));
		test.appendChild(targetButtons);this.menu.appendChild(test);

		const actions=document.createElement('div');actions.style.marginTop='10px';
		actions.appendChild(this.button('Apply test override',()=>this.applyOverride()));
		actions.appendChild(this.button('Use current game AI order',()=>this.useCurrentOrder()));
		actions.appendChild(this.button('Clear override',()=>this.clearOverride()));
		actions.appendChild(this.button('Close',()=>this.closeMenu()));
		this.menu.appendChild(actions);

		const hint=document.createElement('div');hint.style.cssText='margin-top:10px;color:#bbb;font-size:12px';hint.textContent='F6 = plan only   F7 = execute one AI action   F8 = menu';this.menu.appendChild(hint);
		if(override)
		{
			const mark=document.createElement('div');mark.style.cssText='margin-top:8px;color:#ffd060';mark.textContent='Test override is active';this.menu.appendChild(mark);
		}
	},

	applyOverride()
	{
		const unit=this.debugUnit;if(unit==null)return;
		const ai=unit.player.aiControl.ensureUnitAIControl(unit);
		ai.aiTestOverride={
			enabled:true,
			order:this.draft.order || null,
			profile:this.draft.profile || 'auto',
			target:this.draft.target || null,
			targetPos:this.draft.targetPos ? [this.draft.targetPos[0],this.draft.targetPos[1]] : null,
			threatTurns:this.draft.threatTurns ?? null
		};
		this.lastPlan=null;
		this.updateStatus('override applied');
		this.renderMenu();
	},

	useCurrentOrder()
	{
		this.clearOverride(false);
		this.draft=this.makeDraft(this.debugUnit);
		this.updateStatus('using current game AI order');
		this.renderMenu();
	},

	clearOverride(render=true)
	{
		if(this.debugUnit && this.debugUnit.aiControl) delete this.debugUnit.aiControl.aiTestOverride;
		this.lastPlan=null;
		if(this.debugUnit)this.draft=this.makeDraft(this.debugUnit);
		this.updateStatus('test override cleared');
		if(render&&this.menu&&this.menu.style.display!=='none')this.renderMenu();
	},

	beginPick(mode)
	{
		this.pickMode=mode;
		this.ensureUI();
		if(this.menu)this.menu.style.display='none';
		this.updateStatus();
	},

	handlePointer(scene,pointer)
	{
		if(this.consumePointer)
		{
			if(!pointer.isDown){this.consumePointer=false;pointerPressed=false;}
			return true;
		}
		if(this.pickMode==null||!pointer.isDown||pointerPressed)return false;
		pointer.updateWorldPoint(scene.cameras.main);
		const tile=map.worldToTileXY(pointer.worldX,pointer.worldY);
		if(tile.x<0||tile.y<0||tile.x>=map.width||tile.y>=map.height)return true;
		pointerPressed=true;this.consumePointer=true;
		const mode=this.pickMode;this.pickMode=null;

		if(mode==='debugUnit')
		{
			const unit=getUnitAtMap(tile.x,tile.y);
			if(unit==null){this.beginPick('debugUnit');this.updateStatus('no unit at '+tile.x+','+tile.y);return true;}
			this.setDebugUnit(unit);this.openMenu();return true;
		}
		if(mode==='targetUnit')
		{
			const unit=getUnitAtMap(tile.x,tile.y);
			if(unit==null){this.beginPick('targetUnit');this.updateStatus('no unit at '+tile.x+','+tile.y);return true;}
			this.draft.target=unit;this.draft.targetPos=[unit.mapX,unit.mapY];this.openMenu(true);return true;
		}
		if(mode==='targetPosition')
		{
			this.draft.target=null;this.draft.targetPos=[tile.x,tile.y];this.openMenu(true);return true;
		}
		return true;
	},

	resolveProfile(unit,state)
	{
		if(state&&state.profile&&state.profile!=='auto'&&AI_TACTICAL_PROFILES[state.profile])return state.profile;
		return unit.player.aiControl.getTacticalProfile(unit,state);
	},

	resolveGoal(state)
	{
		if(state==null)return null;
		if(state.target!=null&&!state.target.died)return[state.target.mapX,state.target.mapY];
		if(state.targetPos!=null)return[state.targetPos[0],state.targetPos[1]];
		return null;
	},

	buildPlan()
	{
		const unit=this.debugUnit;
		if(unit==null||unit.died)return{error:'Select a debug unit first'};
		if(unit.isMoving||unit.processedAbility!=null)return{error:'Unit is busy'};
		const state=this.getEffectiveState(unit),goal=this.resolveGoal(state);
		if(goal==null)return{error:'No AI goal/target assigned. Use F8 to set one.'};
		const ai=unit.player.aiControl,profile=this.resolveProfile(unit,state);
		const planner=new AITurnPlanner(ai,unit,goal,{...ai.tacticalPlannerOptions,profile,order:state.order||null});
		const result=planner.plan();
		return{unit,state,goal,profile,result};
	},

	formatPlan(plan)
	{
		if(plan.error)return'AI TEST: '+plan.error;
		const labels=plan.result.actions&&plan.result.actions.length?plan.result.actions.map(a=>a.label||a.type).join(' -> '):'HOLD';
		return plan.unit.config.name+' '+(plan.state.order||'none')+' ['+plan.profile+']\n'+labels+'\nscore='+plan.result.score.toFixed(2);
	},

	planOnly()
	{
		const plan=this.buildPlan();
		this.lastPlan=plan.error?null:plan;
		const text=this.formatPlan(plan);console.log(text);this.updateStatus(text.replace(/\n/g,' | '));
		return plan;
	},

	executeStep()
	{
		if(typeof pointerBlocked!=='undefined'&&pointerBlocked){this.updateStatus('cannot step: game action is in progress');return;}
		const plan=this.buildPlan();
		if(plan.error){console.log(this.formatPlan(plan));this.updateStatus(plan.error);return;}
		const action=plan.result.actions&&plan.result.actions.length?plan.result.actions[0]:null;
		if(action==null){this.updateStatus('AI plan = HOLD');console.log(this.formatPlan(plan));return;}

		const unit=plan.unit,ai=unit.player.aiControl,unitAI=ai.ensureUnitAIControl(unit);
		if(unit.player.control===PlayerControl.computer)unitAI.aiTestStopAfterAction=true;
		unitAI.aiTestAbilityControl=true;
		console.log('AI TEST STEP: '+(action.label||action.type));
		try{ai.executeTacticalAction(unit,action,{singleStep:true});}
		finally{unitAI.aiTestAbilityControl=false;}
		this.lastPlan=null;
		this.updateStatus('executed: '+(action.label||action.type));
	},

	onActionComplete(unit)
	{
		if(unit===this.debugUnit)this.updateStatus('AI step complete');
	}
};

AITest.init();
