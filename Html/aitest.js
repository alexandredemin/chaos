//---------------------------- AI Test Mode ----------------------------

const AITest = {
	debugUnit: null,
	pickMode: null,
	draft: null,
	menu: null,
	status: null,
	statusText: null,
	statusClose: null,
	statusVisible: true,
	statusNote: null,
	statusNoteUntil: 0,
	lastStatusTick: 0,
	lastPlan: null,
	consumePointer: false,
	liveRefresh: false,
	guardOverlayMode: 'none',
	guardOverlayObjects: [],
	guardOverlaySignature: null,

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
				background:'rgba(0,0,0,.78)', color:'#fff', padding:'6px 28px 6px 8px', border:'1px solid #777',
				font:'13px monospace', whiteSpace:'pre', pointerEvents:'auto', minWidth:'280px'
			});
			this.statusText = document.createElement('div');
			this.status.appendChild(this.statusText);
			this.statusClose = document.createElement('button');
			this.statusClose.textContent = '×';
			this.statusClose.title = 'Close AI Test status';
			Object.assign(this.statusClose.style,{position:'absolute',right:'4px',top:'3px',border:'0',background:'transparent',color:'#ddd',font:'18px sans-serif',cursor:'pointer',padding:'0 3px'});
			this.statusClose.onclick = e => { e.stopPropagation(); this.statusVisible=false; this.status.style.display='none'; this.refreshLiveRefresh(); };
			this.status.appendChild(this.statusClose);
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
		const ai=unit&&unit.aiControl?unit.aiControl:{};
		return {enabled:false,order:ai.order||null};
	},

	getOverride(unit)
	{
		const ai=unit&&unit.aiControl?unit.aiControl:null;
		return ai&&ai.aiTestOverride&&ai.aiTestOverride.enabled===true?ai.aiTestOverride:null;
	},

	getEffectiveState(unit)
	{
		return this.getOverride(unit)||this.getCurrentState(unit);
	},

	makeDraft(unit)
	{
		const state=this.getOverride(unit)||this.getCurrentState(unit),order=state.order||null,orderState=AIOrder.state(order)||{};
		return {
			order:AIOrder.type(order)||'',
			profile:order&&typeof order==='object'?order.profile||'auto':'auto',
			target:AIOrder.target(order),
			targetPos:AIOrder.targetPos(order),
			threatTurns:orderState.threatTurns??null
		};
	},

	setDebugUnit(unit)
	{
		if(unit == null || unit.died) return false;
		this.debugUnit = unit;
		this.draft = this.makeDraft(unit);
		this.lastPlan = null;
		this.guardOverlaySignature = null;
		this.clearGuardOverlay();
		this.statusVisible = true;
		this.updateStatus(null,true);
		if(this.guardOverlayMode!=='none')this.refreshGuardOverlay(true);
		return true;
	},

	refreshLiveRefresh()
	{
		const menuOpen=this.menu!=null&&this.menu.style.display!=='none';
		const statusOpen=this.statusVisible&&this.status!=null&&this.status.style.display!=='none';
		this.liveRefresh=menuOpen||statusOpen||this.pickMode!=null||this.guardOverlayMode!=='none';
	},

	updateStatus(note=null,forceShow=false)
	{
		this.ensureUI();
		if(forceShow)this.statusVisible=true;
		if(note!=null)
		{
			this.statusNote=note;
			this.statusNoteUntil=(typeof performance!=='undefined'?performance.now():Date.now())+1800;
		}
		if(!this.statusVisible)
		{
			this.status.style.display='none';
			this.refreshLiveRefresh();
			return;
		}
		if(this.debugUnit == null || this.debugUnit.died)
		{
			this.status.style.display = this.pickMode ? 'block' : 'none';
			this.statusText.textContent = this.pickMode ? 'AI TEST\n' + this.pickPrompt() : '';
			return;
		}

		const game=this.getCurrentState(this.debugUnit),effective=this.getEffectiveState(this.debugUnit);
		const gameProfile=this.resolveProfile(this.debugUnit,game),effectiveProfile=this.resolveProfile(this.debugUnit,effective);
		let text='AI TEST | F6 PLAN | F7 STEP | F8 MENU\n';
		text+=this.unitName(this.debugUnit)+'\n';
		text+='GAME: '+(AIOrder.type(game.order)||'none')+' ['+gameProfile+'] -> '+this.targetName(AIOrder.target(game.order),AIOrder.targetPos(game.order));
		if(this.getOverride(this.debugUnit))
			text+='\nTEST: '+(AIOrder.type(effective.order)||'none')+' ['+effectiveProfile+'] -> '+this.targetName(AIOrder.target(effective.order),AIOrder.targetPos(effective.order))+' [ACTIVE]';
		else text+='\nTEST: override off';
		if(this.pickMode)text+='\n'+this.pickPrompt();
		const now=typeof performance!=='undefined'?performance.now():Date.now();
		if(this.statusNote&&now<this.statusNoteUntil)text+='\n'+this.statusNote;
		else if(now>=this.statusNoteUntil)this.statusNote=null;
		this.statusText.textContent=text;
		this.status.style.display='block';
		this.updateCurrentGamePanel();
		this.refreshLiveRefresh();
	},

	tick()
	{
		if(!this.liveRefresh)return;
		const now=typeof performance!=='undefined'?performance.now():Date.now();
		if(now-this.lastStatusTick<250)return;
		this.lastStatusTick=now;
		this.updateCurrentGamePanel();
		if(this.statusVisible&&this.status!=null&&this.status.style.display!=='none')this.updateStatus();
		if(this.guardOverlayMode!=='none')this.refreshGuardOverlay();
	},

	updateCurrentGamePanel()
	{
		if(this.menu==null||this.menu.style.display==='none'||this.debugUnit==null)return;
		const el=this.menu.querySelector('#aiTestCurrentGame');
		if(el==null)return;
		const current=this.getCurrentState(this.debugUnit),profile=this.resolveProfile(this.debugUnit,current);
		el.innerHTML='<b>Current game AI</b><br>Order: '+(AIOrder.type(current.order)||'none')+'<br>Profile: '+profile+'<br>Target: '+this.targetName(AIOrder.target(current.order),AIOrder.targetPos(current.order));
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
		this.refreshLiveRefresh();
		this.updateStatus();
	},

	closeMenu()
	{
		if(this.menu) this.menu.style.display = 'none';
		this.refreshLiveRefresh();
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

		const game=document.createElement('div');game.id='aiTestCurrentGame';
		game.style.cssText='margin:10px 0;padding:8px;border:1px solid #444;background:#171717;line-height:1.45';
		const currentProfile=this.resolveProfile(unit,current);
		game.innerHTML='<b>Current game AI</b><br>Order: '+(AIOrder.type(current.order)||'none')+'<br>Profile: '+currentProfile+'<br>Target: '+this.targetName(AIOrder.target(current.order),AIOrder.targetPos(current.order));
		this.menu.appendChild(game);

		const test=document.createElement('div');test.style.cssText='margin:10px 0;padding:8px;border:1px solid #555;line-height:1.7';
		const orderRow=document.createElement('div');orderRow.append('Order: ');
		orderRow.appendChild(this.select([
			['','none'],['attack','Attack'],['intercept','Intercept'],['guard','Guard'],['cleanup','Cleanup']
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
		test.appendChild(targetButtons);

		const overlayRow=document.createElement('div');overlayRow.style.marginTop='8px';overlayRow.append('Guard overlay: ');
		overlayRow.appendChild(this.select([
			['none','Off'],
			['score','Total GuardScore'],
			['proximity','Proximity'],
			['intercept','Interception'],
			['fireShield','Fire shield'],
			['jumpShield','Jump shield'],
			['congestion','Congestion penalty'],
			['pressure','Guard pressure'],
			['goalDistance','Guard path distance'],
			['danger','Tactical danger total'],
			['dangerMelee','Danger: melee'],
			['dangerFire','Danger: fire'],
			['dangerGas','Danger: gas'],
			['dangerJump','Danger: jump']
		],this.guardOverlayMode,v=>this.setGuardOverlayMode(v)));
		test.appendChild(overlayRow);
		const overlayButtons=document.createElement('div');
		overlayButtons.appendChild(this.button('Refresh overlay',()=>this.refreshGuardOverlay(true)));
		overlayButtons.appendChild(this.button('Hide overlay',()=>this.setGuardOverlayMode('none')));
		test.appendChild(overlayButtons);
		this.menu.appendChild(test);

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
		const order=this.draft.order?AIOrder.create(this.draft.order,this.draft.target||null,this.draft.targetPos,{profile:this.draft.profile||'auto',state:{threatTurns:this.draft.threatTurns??null}}):null;
		ai.aiTestOverride={enabled:true,order};
		ai.macroMove=null;
		if(unit.player&&unit.player.aiControl&&unit.player.aiControl.guardCoordinator)unit.player.aiControl.guardCoordinator.invalidate();
		this.lastPlan=null;
		this.guardOverlaySignature=null;
		if(this.guardOverlayMode!=='none')this.refreshGuardOverlay(true);
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
		if(this.debugUnit && this.debugUnit.aiControl){delete this.debugUnit.aiControl.aiTestOverride;this.debugUnit.aiControl.macroMove=null;}
		if(this.debugUnit&&this.debugUnit.player&&this.debugUnit.player.aiControl&&this.debugUnit.player.aiControl.guardCoordinator)this.debugUnit.player.aiControl.guardCoordinator.invalidate();
		this.lastPlan=null;
		this.guardOverlaySignature=null;
		if(this.guardOverlayMode!=='none')this.refreshGuardOverlay(true);
		if(this.debugUnit)this.draft=this.makeDraft(this.debugUnit);
		this.updateStatus('test override cleared');
		if(render&&this.menu&&this.menu.style.display!=='none')this.renderMenu();
	},

	beginPick(mode)
	{
		this.pickMode=mode;
		this.ensureUI();
		if(this.menu)this.menu.style.display='none';
		this.refreshLiveRefresh();
		this.updateStatus();
	},

	acceptUnitPick(unit)
	{
		if(unit==null||unit.died)return false;
		const mode=this.pickMode;
		if(mode!=='debugUnit'&&mode!=='targetUnit'&&mode!=='targetPosition')return false;
		this.pickMode=null;this.consumePointer=true;pointerPressed=true;
		if(mode==='debugUnit')this.setDebugUnit(unit);
		else if(mode==='targetUnit'){this.draft.target=unit;this.draft.targetPos=[unit.mapX,unit.mapY];}
		else {this.draft.target=null;this.draft.targetPos=[unit.mapX,unit.mapY];}
		this.openMenu(mode!=='debugUnit');
		return true;
	},

	handleUnitPointer(unit,mapX,mapY)
	{
		if(this.pickMode==null||this.consumePointer||unit==null)return false;
		if(mapX!==unit.mapX||mapY!==unit.mapY)return false;
		return this.acceptUnitPick(unit);
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

		if(mode==='debugUnit'||mode==='targetUnit')
		{
			const unit=getUnitAtMap(tile.x,tile.y);
			if(unit==null){this.beginPick(mode);this.updateStatus('no unit at '+tile.x+','+tile.y,true);return true;}
			this.pickMode=mode;
			this.consumePointer=false;pointerPressed=false;
			this.acceptUnitPick(unit);return true;
		}
		if(mode==='targetPosition')
		{
			this.draft.target=null;this.draft.targetPos=[tile.x,tile.y];this.openMenu(true);return true;
		}
		return true;
	},

	guardOverlayLabel(mode=this.guardOverlayMode)
	{
		const labels={score:'GuardScore',proximity:'Proximity',intercept:'Interception',fireShield:'Fire shield',jumpShield:'Jump shield',congestion:'Congestion penalty',pressure:'Guard pressure',goalDistance:'Guard path distance',danger:'Danger total',dangerMelee:'Danger melee',dangerFire:'Danger fire',dangerGas:'Danger gas',dangerJump:'Danger jump'};
		return labels[mode]||'Off';
	},

	setGuardOverlayMode(mode)
	{
		this.guardOverlayMode=mode||'none';
		this.guardOverlaySignature=null;
		if(this.guardOverlayMode==='none')this.clearGuardOverlay();
		else this.refreshGuardOverlay(true);
		this.refreshLiveRefresh();
		if(this.menu&&this.menu.style.display!=='none')this.renderMenu();
	},

	clearGuardOverlay()
	{
		for(const obj of this.guardOverlayObjects)
		{
			if(obj&&obj.active!==false&&typeof obj.destroy==='function')obj.destroy();
		}
		this.guardOverlayObjects=[];
	},

	getGuardOverlayContext()
	{
		const unit=this.debugUnit;
		if(unit==null||unit.died||unit.player==null||unit.player.aiControl==null)return null;
		const state=this.getEffectiveState(unit),order=state?state.order:null;
		if(!AIOrder.is(order,'guard'))return null;
		const coordinator=unit.player.aiControl.guardCoordinator;
		if(coordinator==null)return null;
		const data=coordinator.getGroupFor(unit,order);
		if(data==null||data.group==null||data.group.evaluator==null)return null;
		const assignment=data.assignment;
		const goalMap=assignment?unit.player.aiControl.getDistanceMap(unit,assignment.x,assignment.y):null;
		return{unit,state,order,coordinator,group:data.group,evaluator:data.group.evaluator,assignment,goalMap,scene:unit.scene};
	},

	getGuardOverlayValue(ctx,x,y)
	{
		const mode=this.guardOverlayMode,b=ctx.evaluator.getScoreBreakdown(x,y);
		if(mode==='score')return b.score;
		if(mode==='proximity')return b.proximity;
		if(mode==='intercept')return b.intercept;
		if(mode==='fireShield')return b.fireShield;
		if(mode==='jumpShield')return b.jumpShield;
		if(mode==='congestion')return -b.congestion;
		if(mode==='pressure')return b.pressure;
		if(mode==='goalDistance')return ctx.goalMap&&ctx.goalMap[y]?ctx.goalMap[y][x]:-1;
		if(mode.startsWith('danger'))
		{
			const d=ctx.unit.player.aiControl.threatSystem.getDangerBreakdown(ctx.unit,x,y);
			if(mode==='dangerMelee')return d.melee;
			if(mode==='dangerFire')return d.fire;
			if(mode==='dangerGas')return d.gas;
			if(mode==='dangerJump')return d.jump;
			return d.total;
		}
		return 0;
	},

	refreshGuardOverlay(force=false)
	{
		if(this.guardOverlayMode==='none'){this.clearGuardOverlay();return;}
		const ctx=this.getGuardOverlayContext();
		if(ctx==null||ctx.scene==null||ctx.scene.add==null){this.clearGuardOverlay();return;}
		const threatRevision=ctx.unit.player.aiControl.threatSystem.dynamicRevision??0,a=ctx.assignment,stamp=[this.guardOverlayMode,ctx.group.epoch,ctx.group.turnStamp,ctx.group.anchorX,ctx.group.anchorY,a?a.x:'x',a?a.y:'x',ctx.unit.mapX,ctx.unit.mapY,ctx.unit.features.health,threatRevision].join('|');
		if(!force&&stamp===this.guardOverlaySignature)return;
		this.guardOverlaySignature=stamp;
		this.clearGuardOverlay();

		for(const cell of ctx.evaluator.ringCells)
		{
			const value=this.getGuardOverlayValue(ctx,cell.x,cell.y);
			const pos=map.tileToWorldXY(cell.x,cell.y),isSlot=a&&a.x===cell.x&&a.y===cell.y;
			const str=(isSlot?'*':'')+(Number.isFinite(value)?value.toFixed(2):'--');
			const txt=ctx.scene.add.text(pos.x+1,pos.y+1,str,{font:'5px monospace',color:isSlot?'#ffff66':'#ffffff',backgroundColor:'#000000',resolution:6});
			txt.setDepth(20000);txt.setAlpha(.9);this.guardOverlayObjects.push(txt);
		}
	},

	resolveProfile(unit,state)
	{
		const order=state?state.order:null,profile=order&&typeof order==='object'?order.profile:null;
		if(profile&&profile!=='auto'&&AI_TACTICAL_PROFILES[profile])return profile;
		return unit.player.aiControl.getTacticalProfile(unit,state);
	},

	resolveGoal(state)
	{
		if(state==null)return null;
		const order=state.order,target=AIOrder.target(order),targetPos=AIOrder.targetPos(order);
		if(target!=null&&!target.died)
		{
			if(AIOrder.is(order,'guard'))
			{
				const unit=this.debugUnit,assignment=unit&&unit.player?unit.player.aiControl.guardCoordinator.ensureAssignment(unit,order):null;
				if(assignment)return[assignment.x,assignment.y];
			}
			return[target.mapX,target.mapY];
		}
		if(targetPos!=null)return[targetPos[0],targetPos[1]];
		return null;
	},

	buildPlan()
	{
		const unit=this.debugUnit;
		if(unit==null||unit.died)return{error:'Select a debug unit first'};
		if(unit.isMoving||unit.processedAbility!=null)return{error:'Unit is busy'};
		const state=this.getEffectiveState(unit),goal=this.resolveGoal(state);
		if(goal==null)return{error:'No AI goal/target assigned. Use F8 to set one.'};
		const ai=unit.player.aiControl,profile=this.resolveProfile(unit,state),order=state.order||null;
		const planner=new AITurnPlanner(ai,unit,goal,{...ai.tacticalPlannerOptions,profile,order});
		const result=planner.plan();
		return{unit,state,goal,profile,result,planner};
	},

	formatPlan(plan)
	{
		if(plan.error)return'AI TEST: '+plan.error;
		const labels=plan.result.actions&&plan.result.actions.length?plan.result.actions.map(a=>a.label||a.type).join(' -> '):'HOLD';
		const goal=plan.goal?' goal='+plan.goal[0]+','+plan.goal[1]:'';
		const assignment=AIOrder.is(plan.state.order,'guard')?AIOrder.state(plan.state.order).assignment:null;
		let slot='';
		if(assignment)
		{
			slot=' slot='+assignment.x+','+assignment.y+' guardScore='+Number(assignment.score||0).toFixed(2)+' epoch='+assignment.epoch+' turn='+String(assignment.turnStamp??'?');
			const c=assignment.components;
			if(c)slot+=' guardParts[p='+Number(c.proximity||0).toFixed(2)+' i='+Number(c.intercept||0).toFixed(2)+' f='+Number(c.fireShield||0).toFixed(2)+' j='+Number(c.jumpShield||0).toFixed(2)+' c='+Number(c.congestion||0).toFixed(2)+' q='+Number(c.pressure||0).toFixed(2)+' r='+Number(c.idealRadius||0).toFixed(2)+']';
		}
		const f=plan.unit.features||{};
		const resources=' pos='+plan.unit.mapX+','+plan.unit.mapY+' M='+Number(f.move||0)+' AP='+Number(f.abilityPoints||0)+' Atk='+Number(f.attackPoints||0);
		let nav='';
		if(AIOrder.is(plan.state.order,'guard')&&plan.planner)
		{
			const d0=plan.planner.rootGoalDistance,first=plan.result.actions&&plan.result.actions.length?plan.result.actions[0]:null;
			let d1=d0;
			if(first&&first.type==='move'&&first.to&&plan.planner.goalMap[first.to[1]])d1=plan.planner.goalMap[first.to[1]][first.to[0]];
			nav=' guardNav[d='+d0;
			if(first&&first.type==='move')
			{
				nav+=' next='+d1+' progress='+(d0>=0&&d1>=0?(d0-d1):'?');
				const ai=plan.unit.player&&plan.unit.player.aiControl,route=ai&&typeof ai.findMacroMovePath==='function'?ai.findMacroMovePath(plan.unit,first.to):null;
				if(route)nav+=' macroPath='+[[plan.unit.mapX,plan.unit.mapY]].concat(route).map(c=>c[0]+','+c[1]).join('>');
			}
			nav+=']';
		}
		return plan.unit.config.name+' '+(AIOrder.type(plan.state.order)||'none')+' ['+plan.profile+']'+resources+goal+slot+nav+'\n'+labels+'\nscore='+plan.result.score.toFixed(2);
	},

	planOnly()
	{
		const plan=this.buildPlan();
		this.lastPlan=plan.error?null:plan;
		const text=this.formatPlan(plan);console.log(text);this.updateStatus(text.replace(/\n/g,' | '),true);
		if(this.guardOverlayMode!=='none')this.refreshGuardOverlay(true);
		return plan;
	},

	executeStep()
	{
		if(typeof pointerBlocked!=='undefined'&&pointerBlocked){this.updateStatus('cannot step: game action is in progress');return;}
		const plan=this.buildPlan();
		if(plan.error){console.log(this.formatPlan(plan));this.updateStatus(plan.error,true);return;}
		const text=this.formatPlan(plan);
		console.log(text);
		this.updateStatus(text.replace(/\n/g,' | '),true);
		if(this.guardOverlayMode!=='none')this.refreshGuardOverlay(true);
		const action=plan.result.actions&&plan.result.actions.length?plan.result.actions[0]:null;
		if(action==null)return;

		const unit=plan.unit,ai=unit.player.aiControl,unitAI=ai.ensureUnitAIControl(unit);
		ai.aiTestSingleStepUnit=unit;
		unitAI.aiTestStopAfterAction=true;
		unitAI.aiTestAbilityControl=true;
		console.log('AI TEST STEP: '+(action.label||action.type));
		try{ai.executeTacticalAction(unit,action,{singleStep:true});}
		catch(err){ai.finishAITestSingleStep(unit);throw err;}
		finally{unitAI.aiTestAbilityControl=false;}
		this.lastPlan=null;
		this.updateStatus('executed: '+(action.label||action.type),true);
	},

	onActionComplete(unit)
	{
		if(unit===this.debugUnit)
		{
			this.guardOverlaySignature=null;
			if(this.guardOverlayMode!=='none')this.refreshGuardOverlay(true);
			this.updateStatus('AI step complete');
		}
	}
};

AITest.init();
