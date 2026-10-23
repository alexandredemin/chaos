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
	pathGoal: null,
	pathRisk: 0,
	pathLimitMove: false,
	pathViewRadius: 20,
	pathSummary: '',

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
			reason:AIOrder.reason(order)||'attack',
			profile:order&&typeof order==='object'?order.profile||'auto':'auto',
			target:AIOrder.target(order),
			targetPos:AIOrder.targetPos(order),
			threatTurns:orderState.threatTurns??null,
			areaMode:orderState.areaMode||'radius',radius:orderState.radius||5
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
		if(AIOrder.is(this.getEffectiveState(unit).order,'move_to'))this.guardOverlayMode='waypoints';
		if(AIOrder.is(this.getEffectiveState(unit).order,'hold'))this.guardOverlayMode='hold:score';
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
		if(this.pickMode === 'pathGoal') return 'Click diagnostic A*/Dijkstra destination (ESC cancel)';
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
			['','none'],['engage','Engage'],['move_to','Move To'],['guard','Guard'],['hold','Hold']
		],this.draft.order,v=>{this.draft.order=v;this.renderMenu();}));test.appendChild(orderRow);
		if(this.draft.order==='engage')
        {
            const reasonRow=document.createElement('div');reasonRow.append('Reason: ');
            reasonRow.appendChild(this.select([['attack','Attack'],['intercept','Intercept'],['cleanup','Cleanup']],this.draft.reason||'attack',v=>this.draft.reason=v));
            test.appendChild(reasonRow);
        }
        const profileRow=document.createElement('div');profileRow.append('Profile: ');
		profileRow.appendChild(this.select([
			['auto','Auto'],['cautious','Cautious'],['balanced','Balanced'],['aggressive','Aggressive'],['critical','Critical']
		],this.draft.profile,v=>this.draft.profile=v));test.appendChild(profileRow);
		if(this.draft.order==='hold')
		{
			const row=document.createElement('div');row.append('HOLD area: ');
			row.appendChild(this.select([['room','Room'],['radius','Radius']],this.draft.areaMode||'radius',v=>{this.draft.areaMode=v;this.renderMenu();}));
			row.append(' radius: ');
			const radius=document.createElement('input');radius.type='number';radius.min=1;radius.max=30;radius.value=this.draft.radius||5;radius.style.width='55px';
			radius.onchange=()=>this.draft.radius=Math.max(1,Math.min(30,Number(radius.value)||5));row.appendChild(radius);test.appendChild(row);
		}
		const target=document.createElement('div');target.id='aiTestTargetLabel';target.textContent='Target: '+this.targetName(this.draft.target,this.draft.targetPos);test.appendChild(target);
		const targetButtons=document.createElement('div');
		targetButtons.appendChild(this.button('Select unit target',()=>{this.closeMenu();this.beginPick('targetUnit');}));
		targetButtons.appendChild(this.button('Select position',()=>{this.closeMenu();this.beginPick('targetPosition');}));
		targetButtons.appendChild(this.button('Clear target',()=>{this.draft.target=null;this.draft.targetPos=null;this.renderMenu();}));
		test.appendChild(targetButtons);

		const pathRow=document.createElement('div');
		pathRow.style.cssText='margin-top:10px;padding:8px;border:1px solid #555;background:#171717';
		const pathTitle=document.createElement('div');pathTitle.textContent='PATHFINDER DIAGNOSTICS (independent of order)';pathTitle.style.fontWeight='bold';pathRow.appendChild(pathTitle);
		const goal=document.createElement('div');goal.textContent='From: '+unit.mapX+','+unit.mapY+'   To: '+(this.pathGoal?this.pathGoal.join(','):'not selected');pathRow.appendChild(goal);
		pathRow.appendChild(this.button('Select path goal on map',()=>{this.closeMenu();this.beginPick('pathGoal');}));
		const riskRow=document.createElement('div');riskRow.append('Risk factor: ');
		const risk=document.createElement('input');risk.type='number';risk.min=0;risk.max=20;risk.step=.25;risk.value=this.pathRisk;risk.style.width='65px';
		risk.onchange=()=>{this.pathRisk=Math.max(0,Math.min(20,Number(risk.value)||0));this.guardOverlaySignature=null;this.refreshGuardOverlay(true);};
		riskRow.appendChild(risk);riskRow.append(' × AI danger at destination');pathRow.appendChild(riskRow);
		const limitRow=document.createElement('label'),limit=document.createElement('input');limit.type='checkbox';limit.checked=this.pathLimitMove;
		limit.onchange=()=>{this.pathLimitMove=limit.checked;this.guardOverlaySignature=null;this.refreshGuardOverlay(true);};
		limitRow.appendChild(limit);limitRow.append(' Limit A* to one-turn budget (steps + cost)');pathRow.appendChild(limitRow);
		const radiusRow=document.createElement('div');radiusRow.append('Show values around start/goal: ');
		radiusRow.appendChild(this.select([['10','10 cells'],['20','20 cells'],['40','40 cells'],['0','whole map']],String(this.pathViewRadius),v=>{this.pathViewRadius=Number(v);this.refreshGuardOverlay(true);}));
		pathRow.appendChild(radiusRow);
		const info=document.createElement('div');info.id='aiTestPathInfo';info.style.cssText='color:#ddd;white-space:pre-wrap;font-size:11px;margin-top:5px';info.textContent=this.pathSummary;pathRow.appendChild(info);
		test.appendChild(pathRow);
		const overlayRow=document.createElement('div');overlayRow.style.marginTop='8px';overlayRow.append('AI overlay: ');
		overlayRow.appendChild(this.select([
			['none','Off'],
			['waypoints','MOVE_TO waypoints (WP)'],
			['path:route','PATH: A* route / steps'],
			['path:astar','PATH: A* discovered g-cost'],
			['path:expanded','PATH: A* expanded cells'],
			['path:dijkstra','PATH: Dijkstra from unit'],
			['path:reverse','PATH: Dijkstra to goal'],
			['hold:score','HOLD: total HoldScore'],
			['hold:direction','HOLD: direction bonus'],
			['hold:assignmentUtility','HOLD: assignment utility'],
			['hold:entryThreat','HOLD: entry threat weights'],
			['hold:slotPenalty','HOLD: slot penalty / X blocked'],
			['hold:fireProtection','HOLD: FireProtection'],
			['hold:externalExposure','HOLD: ExternalExposure'],
			['hold:meleeProtection','HOLD: MeleeProtection'],
			['hold:fireControl','HOLD: FireControl'],
			['hold:meleeControl','HOLD: MeleeControl'],
			['hold:congestion','HOLD: congestion'],
			['hold:area','HOLD: area and slots'],
			['hold:entry','HOLD: entry cells'],
			['score','Total GuardScore'],
			['cellPenalty','GUARD: slot penalty / X blocked'],
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
        if((this.draft.order==='move_to'||this.draft.order==='hold')&&(!this.draft.targetPos||!Number.isInteger(this.draft.targetPos[0])||!Number.isInteger(this.draft.targetPos[1])))
        {
            this.updateStatus('MOVE_TO/HOLD: select a map position first',true);return;
        }
        if(this.draft.order==='engage'&&(!this.draft.target||this.draft.target.died))
        {
            this.updateStatus('ENGAGE: select a living target unit first',true);return;
        }
		const ai=unit.player.aiControl.ensureUnitAIControl(unit);
		const order=this.draft.order?AIOrder.create(this.draft.order,(this.draft.order==='move_to'||this.draft.order==='hold')?null:this.draft.target||null,this.draft.targetPos,{reason:this.draft.order==='engage'?(this.draft.reason||'attack'):null,profile:this.draft.profile||'auto',state:{threatTurns:this.draft.threatTurns??null,areaMode:this.draft.areaMode||'radius',radius:this.draft.radius||5}}):null;
		ai.aiTestOverride={enabled:true,order};
		ai.macroMove=null;
		if(unit.player&&unit.player.aiControl&&unit.player.aiControl.guardCoordinator)unit.player.aiControl.guardCoordinator.invalidate();
		if(AIOrder.is(order,'move_to'))this.guardOverlayMode='waypoints';
		if(AIOrder.is(order,'hold'))this.guardOverlayMode='hold:score';
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
		if(mode!=='debugUnit'&&mode!=='targetUnit'&&mode!=='targetPosition'&&mode!=='pathGoal')return false;
		this.pickMode=null;this.consumePointer=true;pointerPressed=true;
		if(mode==='debugUnit')this.setDebugUnit(unit);
		else if(mode==='pathGoal'){this.pathGoal=[unit.mapX,unit.mapY];this.guardOverlayMode='path:route';this.guardOverlaySignature=null;}
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
		if(mode==='pathGoal')
		{
			this.pathGoal=[tile.x,tile.y];this.guardOverlayMode='path:route';this.guardOverlaySignature=null;this.openMenu(true);this.refreshGuardOverlay(true);return true;
		}
		if(mode==='targetPosition')
		{
			this.draft.target=null;this.draft.targetPos=[tile.x,tile.y];this.openMenu(true);return true;
		}
		return true;
	},

	guardOverlayLabel(mode=this.guardOverlayMode)
	{
		const labels={
			'path:route':'A* route','path:astar':'A* best discovered g','path:expanded':'A* expanded cells',
			'path:dijkstra':'Dijkstra from unit','path:reverse':'Dijkstra to goal',
			'hold:score':'HOLD: HoldScore','hold:direction':'HOLD: Direction bonus','hold:assignmentUtility':'HOLD: Assignment utility','hold:entryThreat':'HOLD: Entry threat weights','hold:slotPenalty':'HOLD: slot penalty','hold:fireProtection':'HOLD: FireProtection','hold:externalExposure':'HOLD: ExternalExposure','hold:meleeProtection':'HOLD: MeleeProtection',
			'hold:fireControl':'HOLD: FireControl','hold:meleeControl':'HOLD: MeleeControl','hold:congestion':'HOLD: congestion',
			'hold:area':'HOLD area','hold:entry':'HOLD entries',waypoints:'MOVE_TO waypoints',cellPenalty:'GUARD slot penalty',score:'GuardScore',proximity:'Proximity',intercept:'Interception',fireShield:'Fire shield',jumpShield:'Jump shield',congestion:'Congestion penalty',pressure:'Guard pressure',goalDistance:'Guard path distance',danger:'Danger total',dangerMelee:'Danger melee',dangerFire:'Danger fire',dangerGas:'Danger gas',dangerJump:'Danger jump'};
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

	getWaypointOverlayContext()
	{
		const unit=this.debugUnit;
		if(!unit||unit.died||!unit.player?.aiControl)return null;
		const state=this.getEffectiveState(unit),order=state.order;
		if(!AIOrder.is(order,'move_to'))return null;
		const ai=unit.player.aiControl,profile=this.resolveProfile(unit,state);
		const navigation=ai.navigator.ensure(unit,order,profile);
		return{unit,order,navigation,scene:unit.scene};
	},

	refreshWaypointOverlay(force=false)
	{
		const ctx=this.getWaypointOverlayContext(),nav=ctx?.navigation;
		if(!ctx?.scene?.add||!nav){this.clearGuardOverlay();this.guardOverlaySignature=null;return;}
		const stamp=['wp',ctx.unit.id,ctx.unit.mapX,ctx.unit.mapY,nav.index,
			...nav.waypoints.map(p=>p.x+','+p.y)].join('|');
		if(!force&&stamp===this.guardOverlaySignature)return;
		this.guardOverlaySignature=stamp;
		this.clearGuardOverlay();
		for(let i=0;i<nav.waypoints.length;i++)
		{
			const wp=nav.waypoints[i],current=i===nav.index,last=i===nav.waypoints.length-1;
			const pos=map.tileToWorldXY(wp.x,wp.y),label=last?'GOAL':'WP'+(i+1);
			const txt=ctx.scene.add.text(pos.x+1,pos.y+1,label,{
				font:'5px monospace',color:current?'#ffff66':last?'#77ff99':'#ffae66',
				backgroundColor:'#000000',resolution:6
			});
			txt.setDepth(20001);txt.setAlpha(.95);this.guardOverlayObjects.push(txt);
		}
	},

	/** Pathfinding inspector: uses exactly the SAME transition/cell policies as
	 * macro-MOVE for both algorithms. It does not modify the selected order. */
	computePathDiagnostic(unit,goal,riskFactor=this.pathRisk,limitMove=this.pathLimitMove)
	{
		const ai=unit.player.aiControl,from=[unit.mapX,unit.mapY],debug={};
		ai.threatSystem?.syncDynamicBlockers?.();
		const dangerCache=new Map(),width=map.width;
		const riskPenalty=Number(riskFactor)>0?(x,y)=>{
			const k=y*width+x;
			if(!dangerCache.has(k))dangerCache.set(k,Math.max(0,ai.threatSystem.getDangerAt(unit,x,y)));
			return riskFactor*dangerCache.get(k);
		}:null;
		// Path diagnostics may target an occupied cell (e.g. an enemy).  In a real
		// macro-MOVE it is rightly forbidden to ENTER that cell.  The inspector,
		// however, measures a hypothetical path TO it; only the terminal cell is
		// exempt. No intervening unit or hazardous/impassable entity is bypassed.
		const terminal=(x,y)=>x===goal[0]&&y===goal[1];
		const options={
			canEnter:(x,y)=>terminal(x,y)
				?!AICellPolicy.assess(unit,x,y).blocked
				:ai.canMacroMoveThroughCell(unit,x,y),
			occupantAt:(x,y)=>getUnitAtMap(x,y),
			occupantCost:(occupant,x,y)=>terminal(x,y)?0:Math.max(1,unit.config?.features?.move||1),
			riskPenalty
		};
		const trapped=AICellPolicy.assess(unit,unit.mapX,unit.mapY).movePenalty>0;
		const astar=AIPathfinder.findPath(unit,from,goal,{
			...options,debug,...(limitMove?{maxSteps:trapped?Math.min(1,unit.features.move):Math.max(0,unit.features.move),
				...(trapped?{}:{maxCost:Math.max(0,unit.features.move)})}:{})
		});
		const forward=ai.getMultiSourceDistanceMap(unit,[from],options).distances;
		const reverse=ai.getMultiSourceDistanceMap(unit,[goal],{...options,reverse:true}).distances;
		return{astar,debug,forward,reverse,from,goal,riskFactor,limitMove};
	},

	refreshPathOverlay(force=false)
	{
		const unit=this.debugUnit,goal=this.pathGoal;
		if(!unit||unit.died||!goal||!unit.scene?.add||!unit.player?.aiControl)
		{
			this.clearGuardOverlay();this.guardOverlaySignature=null;
			this.pathSummary='Select a unit and a diagnostic path goal';return;
		}
		const mode=this.guardOverlayMode;
		const stamp=['path',mode,unit.id,unit.mapX,unit.mapY,unit.features.move,goal.join(','),this.pathRisk,this.pathLimitMove,this.pathViewRadius].join('|');
		if(!force&&stamp===this.guardOverlaySignature)return;
		this.guardOverlaySignature=stamp;this.clearGuardOverlay();
		const r=this.computePathDiagnostic(unit,goal),width=map.width;
		const route=r.astar?.cells||[],indices=new Map();
		for(let i=0;i<route.length;i++)indices.set(route[i][1]*width+route[i][0],i+1);
		const reverseCost=r.reverse[unit.mapY]?.[unit.mapX];
		this.pathSummary='A*: '+(r.astar?('cost='+r.astar.cost.toFixed(2)+' steps='+route.length):'NO ROUTE')+
			' | Dijkstra-to-goal='+ (reverseCost>=0?reverseCost.toFixed(2):'unreachable')+
			' | expansions='+r.debug.expansions+
			' | risk='+this.pathRisk+(this.pathLimitMove?' | one-turn budget='+unit.features.move:'');
		const info=this.menu?.querySelector?.('#aiTestPathInfo');if(info)info.textContent=this.pathSummary;
		console.log('AI PATH DIAGNOSTICS',this.pathSummary,'route',r.astar?.cells||null);
		const radius=this.pathViewRadius;
		const inView=(x,y)=>!radius||
			(Math.max(Math.abs(x-unit.mapX),Math.abs(y-unit.mapY))<=radius)||
			(Math.max(Math.abs(x-goal[0]),Math.abs(y-goal[1]))<=radius);
		for(let y=0;y<map.height;y++)for(let x=0;x<map.width;x++)
		{
			const k=y*width+x,step=indices.get(k),start=x===unit.mapX&&y===unit.mapY,end=x===goal[0]&&y===goal[1];
			if(!inView(x,y)&&!step)continue;
			let value='';
			if(mode==='path:route')value=step?String(step):'';
			else if(mode==='path:expanded')value=r.debug.expanded[k]?'●':'';
			else
			{
				const d=mode==='path:astar'?r.debug.g[k]:mode==='path:dijkstra'?r.forward[y][x]:r.reverse[y][x];
				if(Number.isFinite(d)&&d>=0)value=d.toFixed(d>=100?0:1);
			}
			if(start)value='S';if(end)value='G';if(!value)continue;
			const pos=map.tileToWorldXY(x,y),txt=unit.scene.add.text(pos.x+1,pos.y+1,value,{
				font:'5px monospace',color:end?'#88ff88':start?'#88ddff':step?'#ffff66':'#ffffff',
				backgroundColor:'#000000',resolution:6
			});
			txt.setDepth(20003);txt.setAlpha(.95);this.guardOverlayObjects.push(txt);
		}
	},

	getHoldOverlayContext()
	{
		const unit=this.debugUnit;
		if(!unit||unit.died||!unit.player?.aiControl)return null;
		const state=this.getEffectiveState(unit),order=state.order;
		if(!AIOrder.is(order,'hold'))return null;
		const ai=unit.player.aiControl,ctx=ai.holdCoordinator.getContext(unit,order);
		return ctx?{...ctx,unit,scene:unit.scene,coordinator:ai.holdCoordinator}:null;
	},

	refreshHoldOverlay(force=false)
	{
		const ctx=this.getHoldOverlayContext();
		if(!ctx?.scene?.add){this.clearGuardOverlay();this.guardOverlaySignature=null;return;}
		const stamp=['hold',this.guardOverlayMode,ctx.group.epoch,ctx.group.turnStamp,ctx.assignment?.x,ctx.assignment?.y,
			ctx.unit.id,ctx.unit.mapX,ctx.unit.mapY,ctx.focusTarget?.id].join('|');
		if(!force&&this.guardOverlaySignature===stamp)return;
		this.guardOverlaySignature=stamp;this.clearGuardOverlay();
		const mode=this.guardOverlayMode,area=ctx.area,assignments=[...ctx.group.assignments.values()];
		const assignDMap=mode==='hold:assignmentUtility'?ctx.unit.player.aiControl.getDistanceMap(ctx.unit,ctx.unit.mapX,ctx.unit.mapY,null,()=>true):null;
		for(const c of area.cells)
		{
			const b=area.breakdown(ctx.unit,c.x,c.y);
			if(!b)continue;
			const isSlot=assignments.some(a=>a.x===c.x&&a.y===c.y);
			const mySlot=ctx.assignment&&ctx.assignment.x===c.x&&ctx.assignment.y===c.y;
			const isEntry=area.entries.some(e=>e.k===c.k);
			const congestion=ctx.coordinator.congestion(c,assignments.filter(a=>!mySlot||a.x!==c.x||a.y!==c.y).map(a=>({x:a.x,y:a.y})));
			let value='';
			if(mode==='hold:area')value=mySlot?'S':isSlot?'s':isEntry?'E':'·';
			else if(mode==='hold:entry')value=isEntry?'E':'';
			else if(mode==='hold:congestion')value=(-congestion).toFixed(2);
			else if(mode==='hold:entryThreat')
			{
				const index=area.entries.findIndex(e=>e.k===c.k);
				value=index<0?'':(ctx.group.approach?.weights[index]||0).toFixed(2);
			}
			else if(mode==='hold:direction')value=ctx.coordinator.directionBonus(area,ctx.unit,c,ctx.group.approach,b).toFixed(2);
			else if(mode==='hold:assignmentUtility')
			{
				const policy=AICellPolicy.assess(ctx.unit,c.x,c.y);
				const d=assignDMap[c.y]?.[c.x],atStart=assignDMap[ctx.unit.mapY][ctx.unit.mapX];
				const previous=ctx.group.previousAssignments?.get(ctx.unit);
				const keep=previous?.x===c.x&&previous?.y===c.y?ctx.coordinator.config.keepSlotBonus:0;
				value=policy.blocked||d==null||d<0?'X':(
					b.score+ctx.coordinator.directionBonus(area,ctx.unit,c,ctx.group.approach,b)+keep-
					ctx.coordinator.config.travelPenalty*Math.max(0,d-atStart)-policy.slotPenalty-congestion).toFixed(2);
			}
			else if(mode==='hold:slotPenalty')
			{
				const policy=AICellPolicy.assess(ctx.unit,c.x,c.y);
				value=policy.blocked?'X':policy.slotPenalty.toFixed(2);
			}
			else value=(mode==='hold:score'?b.score-congestion:b[mode.slice(5)]??0).toFixed(2);
			if(!value)continue;
			const pos=map.tileToWorldXY(c.x,c.y),txt=ctx.scene.add.text(pos.x+1,pos.y+1,(mySlot?'*':'')+value,{
				font:'5px monospace',color:mySlot?'#ffff66':isSlot?'#ffae66':'#ffffff',backgroundColor:'#000000',resolution:6
			});
			txt.setDepth(20002);txt.setAlpha(.9);this.guardOverlayObjects.push(txt);
		}
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
		const goalMap=assignment?unit.player.aiControl.getMultiSourceDistanceMap(unit,[[assignment.x,assignment.y]],{reverse:true}).distances:null;
		return{unit,state,order,coordinator,group:data.group,evaluator:data.group.evaluator,assignment,goalMap,scene:unit.scene};
	},

	getGuardOverlayValue(ctx,x,y)
	{
		const mode=this.guardOverlayMode,b=ctx.evaluator.getScoreBreakdown(x,y);
		if(mode==='cellPenalty')
		{
			const policy=AICellPolicy.assess(ctx.unit,x,y);
			return policy.blocked?NaN:policy.slotPenalty;
		}
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
		if(this.guardOverlayMode==='waypoints'){this.refreshWaypointOverlay(force);return;}
		if(this.guardOverlayMode.startsWith('path:')){this.refreshPathOverlay(force);return;}
		if(this.guardOverlayMode.startsWith('hold:')){this.refreshHoldOverlay(force);return;}
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
			const str=(isSlot?'*':'')+(Number.isFinite(value)?value.toFixed(2):this.guardOverlayMode==='cellPenalty'?'X':'--');
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
		if(state==null||this.debugUnit==null||AIOrder.goal(state.order)==null)return null;
		return this.debugUnit.player.aiControl.getTacticalGoalFromState(this.debugUnit,state);
	},

	buildPlan()
	{
		const unit=this.debugUnit;
		if(unit==null||unit.died)return{error:'Select a debug unit first'};
		if(unit.isMoving||unit.processedAbility!=null)return{error:'Unit is busy'};
		const state=this.getEffectiveState(unit),goal=this.resolveGoal(state);
		if(goal==null)return{error:'No AI goal/target assigned. Use F8 to set one.'};
		if(AIOrder.is(state.order,'engage')&&(!AIOrder.target(state.order)||AIOrder.target(state.order).died))return{error:'ENGAGE target is missing or dead'};
		const ai=unit.player.aiControl,profile=this.resolveProfile(unit,state),order=state.order||null;
		const planner=new AITurnPlanner(ai,unit,goal,{...ai.tacticalPlannerOptions,profile,order});
		const result=planner.plan();
		return{unit,state,goal,profile,result,planner};
	},

	formatPlan(plan)
	{
		if(plan.error)return'AI TEST: '+plan.error;
		const destination=AIOrder.goal(plan.state.order),completed=AIOrder.is(plan.state.order,'move_to')&&destination&&plan.unit.mapX===destination[0]&&plan.unit.mapY===destination[1];
		const labels=completed?'MOVE_TO COMPLETE':plan.result.actions&&plan.result.actions.length?plan.result.actions.map(a=>a.label||a.type).join(' -> '):'HOLD';
		const goal=plan.goal?' goal='+plan.goal[0]+','+plan.goal[1]:'';
		const assignment=(AIOrder.is(plan.state.order,'guard')||AIOrder.is(plan.state.order,'hold'))?AIOrder.state(plan.state.order).assignment:null;
		let slot='';
		if(assignment)
		{
			slot=' slot='+assignment.x+','+assignment.y+' score='+Number(assignment.score||0).toFixed(2)+' epoch='+assignment.epoch+' turn='+String(assignment.turnStamp??'?');
			const c=assignment.components;
			if(AIOrder.is(plan.state.order,'hold'))
			{
				const focus=AIOrder.state(plan.state.order).focusTarget;
				slot+=' HOLD_MODE='+(focus?'ENGAGEMENT':'FORMATION')+' focus='+String(focus?.config?.name||'-');
				slot+=' tacticalGoal='+String(plan.goal?.join(',')||'-');
			}
			if(c&&AIOrder.is(plan.state.order,'guard'))slot+=' guardParts[p='+Number(c.proximity||0).toFixed(2)+' i='+Number(c.intercept||0).toFixed(2)+' f='+Number(c.fireShield||0).toFixed(2)+' j='+Number(c.jumpShield||0).toFixed(2)+' c='+Number(c.congestion||0).toFixed(2)+' q='+Number(c.pressure||0).toFixed(2)+' r='+Number(c.idealRadius||0).toFixed(2)+']';
		}
		const f=plan.unit.features||{};
		const resources=' pos='+plan.unit.mapX+','+plan.unit.mapY+' M='+Number(f.move||0)+' AP='+Number(f.abilityPoints||0)+' Atk='+Number(f.attackPoints||0);
		let nav='';
		if(AIOrder.is(plan.state.order,'move_to'))
		{
			const route=AIOrder.state(plan.state.order).navigation;
			if(route)nav=' navigation[WP='+route.waypoints.map((p,i)=>(i===route.index?'*':'')+(i+1)+':'+p.x+','+p.y).join(' > ')+']';
		}
		if(AIOrder.is(plan.state.order,'move_to')&&plan.result.actions?.[0]?.type==='move')
		{
			const target=plan.result.actions[0].to,route=plan.unit.player.aiControl.findMacroMovePath(plan.unit,target);
			nav+=' macroMove['+(route?'steps='+route.length+' '+route.map(c=>c.join(',')).join('>'):'NO EXECUTABLE ROUTE')+']';
		}
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
		return plan.unit.config.name+' '+(AIOrder.type(plan.state.order)||'none')+(AIOrder.is(plan.state.order,'engage')?'('+String(AIOrder.reason(plan.state.order)||'attack')+')':'')+' ['+plan.profile+']'+resources+goal+slot+nav+'\n'+labels+'\nscore='+plan.result.score.toFixed(2);
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
