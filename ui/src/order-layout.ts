import {STORAGE_KEY,PHONE_RATIO,defaults,sanitize,geometry,resizePhone,type LayoutPreferences,type DisplayProfile} from './order-layout-model';
import {NAV_COLLAPSED_KEY} from './unified-layout';
import {version} from '../../package.json';

export type OrderLayoutDesktop = {
  mergedTitlebar?:boolean;
  setOrderChrome?:(enabled:boolean)=>Promise<boolean>;
  getDisplay:()=>Promise<DisplayProfile|null>;
  onDisplayChanged:(callback:(display:DisplayProfile)=>void)=>()=>void;
};

// Mounted only inside the order-detail iframe. Moving existing nodes preserves its business listeners.
export function installOrderLayout(doc:Document,win:Window,desktop?:OrderLayoutDesktop,onTitlebar?:(right:number,blocked:boolean)=>void,{removeChatWorkspace=false}:{removeChatWorkspace?:boolean}={}){
  const root=doc.querySelector<HTMLElement>('#ui008-order-detail,#chat-workbench-aligned')!;
  const layout=root.querySelector<HTMLElement>('.od-layout')!;
  const phone=root.querySelector<HTMLElement>('.od-phone')!;
  const content=root.querySelector<HTMLElement>('.od-content')!;
  const sidebar=root.querySelector<HTMLElement>('.od-sidebar')!;
  const navScroll=doc.createElement('div');navScroll.className='ol-nav-scroll';sidebar.prepend(navScroll);
  sidebar.querySelectorAll('.od-nav-group').forEach(group=>navScroll.append(group));
  sidebar.querySelectorAll<HTMLButtonElement>('.od-nav-item').forEach(item=>item.setAttribute('aria-label',item.textContent!.trim()));
  root.querySelector('.od-connection')?.remove();
  const navHeading=sidebar.querySelector<HTMLElement>('.od-nav-label')!,navTitle=doc.createElement('span'),navToggle=doc.createElement('button');
  navTitle.textContent=navHeading.textContent?.trim()||'我的工作台';navToggle.type='button';navToggle.className='ol-nav-toggle';navHeading.replaceChildren(navTitle,navToggle);navHeading.classList.add('ol-nav-heading');
  const navFooter=doc.createElement('div');navFooter.className='ol-version';navFooter.textContent=`v${version}`;sidebar.append(navFooter);
  let navCollapsed=false;try{navCollapsed=win.localStorage.getItem(NAV_COLLAPSED_KEY)==='true';}catch{}
  const renderNavToggle=()=>{navToggle.innerHTML=`<i data-lucide="${navCollapsed?'panel-left-open':'panel-left-close'}"></i>`;const label=navCollapsed?'展开导航栏':'折叠导航栏';navToggle.setAttribute('aria-label',label);navToggle.title=label;(win as Window&{lucide?:{createIcons:(options:{nodes:Element[]})=>void}}).lucide?.createIcons({nodes:[navToggle]});};
  const chat=root.querySelector<HTMLElement>('.od-chat-column')!;
  const chatScroll=doc.createElement('div');chatScroll.className='ol-chat-scroll';chatScroll.setAttribute('role','region');chatScroll.setAttribute('aria-label','手机区域，可上下滚动');chat.before(chatScroll);chatScroll.append(chat);
  const workspace=doc.createElement('div');workspace.className='reply-chat-workspace';chatScroll.before(workspace);const rail=root.querySelector('.reply-rail');if(rail)workspace.append(rail);workspace.append(chatScroll);
  const railWidth=()=>removeChatWorkspace?0:root.classList.contains('reply-rail-collapsed')||root.classList.contains('reply-floating')?40:prefs.replyWidth+8;
  const box=doc.createElement('div');box.className='ol-phone-box';phone.before(box);box.append(phone);
  content.id='ol-content';box.id='ol-phone';sidebar.id='ol-sidebar';
  const composer=root.querySelector<HTMLElement>('.od-composer')!;
  const messages=root.querySelector<HTMLElement>('.od-messages')!;
  composer.id='ol-composer';messages.id='ol-messages';
  root.classList.toggle('ol-merged-titlebar',Boolean(desktop?.mergedTitlebar));
  const button=doc.createElement('button');button.type='button';button.className='od-button ol-layout-button';button.textContent='布局设置';
  root.querySelector('.od-top-actions')!.prepend(button);
  const dialog=doc.createElement('dialog');dialog.className='ol-dialog';dialog.setAttribute('aria-labelledby','ol-title');
  dialog.innerHTML=`<h2 id="ol-title">聊天页面布局</h2><p class="ol-display"></p>
    <div class="ol-settings-section"><label class="ol-settings-row">导航宽度（px）<input data-setting="navWidth" type="number" min="144" max="340" step="1"></label>
    <label class="ol-settings-row">中间内容宽度（px）<input data-setting="contentWidth" type="number" min="300" step="1"></label>
    <label class="ol-settings-row">手机宽度（px）<input data-setting="phoneWidth" type="number" min="280" max="650" step="1"></label>
    <label class="ol-settings-row">手机高度（px）<input data-setting="phoneHeight" type="number" min="560" max="1500" step="1"></label>
    <label class="ol-settings-row">左侧回复区宽度（px）<input data-setting="replyWidth" type="number" min="280" max="420" step="1"></label>
    <label class="ol-settings-row">锁定手机竖向比例（1∶2.1）<input data-setting="locked" type="checkbox"></label></div>
    <div class="ol-settings-section"><label class="ol-settings-row">导航字号（px）<input data-setting="navFont" type="number" min="13" max="22" step="1"></label>
    <label class="ol-settings-row">内容字号（px）<input data-setting="contentFont" type="number" min="13" max="22" step="1"></label>
    <label class="ol-settings-row">聊天字号（px）<input data-setting="chatFont" type="number" min="12" max="20" step="1"></label></div>
    <p>拖动栏间分隔线或手机边缘、四角调整尺寸。回复区右边的竖线可拖动调宽。手机过高时，仅右侧栏滚动。</p>
    <output class="ol-save-state" aria-live="polite"></output><div class="ol-dialog-actions"><button type="button" class="od-button" data-reset>恢复本屏幕默认</button><button type="button" class="od-button od-button-primary" data-close>完成</button></div>`;
  root.append(dialog);
  const inputs=Object.fromEntries(Array.from(dialog.querySelectorAll<HTMLInputElement>('[data-setting]')).map(input=>[input.dataset.setting!,input]));
  if(removeChatWorkspace){dialog.querySelector('h2')!.textContent='订单详情布局';for(const key of ['contentWidth','phoneWidth','phoneHeight','replyWidth','locked','chatFont'])inputs[key].closest('label')!.hidden=true;dialog.querySelectorAll('p')[1]!.textContent='导航宽度和页面字号会按当前显示器保存。';}
  const status=dialog.querySelector<HTMLOutputElement>('output')!;
  let disposed=false,ready=!desktop,display:DisplayProfile={id:`browser-${win.screen.width}x${win.screen.height}-${win.devicePixelRatio}`,label:'当前屏幕'};
  let prefs=defaults(win.innerWidth,win.innerHeight),saved=false;
  let drag:{element:HTMLElement;id:number;x:number;y:number;start:LayoutPreferences;kind:string}|null=null;
  const read=()=>{
    const fallback=defaults(win.innerWidth,win.innerHeight);
    try{const records=JSON.parse(window.localStorage.getItem(STORAGE_KEY)||'{}');saved=Boolean(records?.[display.id]);prefs=sanitize(records?.[display.id],fallback);status.textContent=saved?'已恢复本屏幕设置':'默认布局 · 调整后自动保存';}
    catch{prefs=fallback;saved=false;status.textContent='无法读取保存设置，已使用默认布局';}
  };
  const persist=()=>{
    try{let records:Record<string,unknown>={};try{const parsed=JSON.parse(window.localStorage.getItem(STORAGE_KEY)||'{}');if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))records=parsed;}catch{/* A malformed layout record has no user order data. */}
      records[display.id]=prefs;window.localStorage.setItem(STORAGE_KEY,JSON.stringify(records));saved=true;status.textContent='已自动保存到本屏幕';
    }catch{status.textContent='本次调整已生效，但无法保存；重新打开后将恢复默认';}
  };
  function paint(){
    if(disposed)return;
    const g=geometry(prefs,win.innerWidth,railWidth());
    root.classList.toggle('ol-compact',g.compact);
    root.classList.toggle('ol-nav-collapsed',navCollapsed);
    const variables={'--reply-panel-width':prefs.replyWidth,'--ol-rail':railWidth(),'--ol-nav':g.compact||navCollapsed?64:g.nav,'--ol-phone-width':g.phoneWidth,'--ol-phone-height':g.phoneHeight,'--ol-nav-font':prefs.navFont,'--ol-content-delta':prefs.contentFont-15,'--ol-chat-delta':prefs.chatFont-13};
    for(const [key,value] of Object.entries(variables))root.style.setProperty(key,`${value}px`);
    const values={...prefs,navWidth:g.nav,phoneWidth:g.phoneWidth,phoneHeight:g.phoneHeight,contentWidth:Math.round(content.getBoundingClientRect().width)};
    for(const [key,input] of Object.entries(inputs)){if(input.type==='checkbox')input.checked=prefs.locked;else input.value=String(values[key as keyof typeof values]);}
    inputs.navWidth.disabled=g.compact;
    inputs.navWidth.max=String(Math.min(340,win.innerWidth-720));
    inputs.contentWidth.min=String(g.contentMin);
    inputs.contentWidth.max=String(Math.floor(layout.clientWidth-48-railWidth()-280));
    inputs.phoneWidth.max=String(Math.floor(Math.min(650,layout.clientWidth-48-railWidth()-g.contentMin)));
    inputs.phoneHeight.min=String(prefs.locked?Math.round(280*prefs.ratio):560);
    inputs.phoneHeight.max=String(prefs.locked?Math.round(Number(inputs.phoneWidth.max)*prefs.ratio):1500);
    navDivider.setAttribute('aria-valuenow',String(g.nav));columnDivider.setAttribute('aria-valuenow',String(values.contentWidth));
    dialog.querySelector('.ol-display')!.textContent=`${display.label} · 导航和内容字号在各页共用`;
    root.dataset.layoutReady=String(ready);
    onTitlebar?.(win.innerWidth-root.querySelector('.od-top-actions')!.getBoundingClientRect().left+10,Boolean(doc.querySelector('dialog[open],.od-overlay:not([hidden])')));
  }
  const effective=()=>{const g=geometry(prefs,win.innerWidth,railWidth());return {...prefs,navWidth:g.nav,phoneWidth:g.phoneWidth,phoneHeight:g.phoneHeight};};
  const fit=(value:LayoutPreferences)=>{const g=geometry(value,win.innerWidth,railWidth());return {...value,navWidth:g.compact?value.navWidth:g.nav,phoneWidth:g.phoneWidth,phoneHeight:g.phoneHeight};};
  const update=(kind:string,dx:number,dy:number,start:LayoutPreferences)=>{
    if(kind==='nav')prefs={...start,navWidth:start.navWidth+dx};
    else if(kind==='column')prefs=resizePhone(start,start.phoneWidth-dx,start.phoneHeight,'width');
    else if(kind==='reply-width')prefs=sanitize({...start,replyWidth:start.replyWidth+dx},start);
    else{
      const horizontal=/[ew]/.test(kind),vertical=/[ns]/.test(kind);
      const w=start.phoneWidth+(kind.includes('w')?-dx:dx),h=start.phoneHeight+(kind.includes('n')?-dy:dy);
      const axis=horizontal&&vertical?(start.locked&&Math.abs(dy/start.ratio)>Math.abs(dx)?'height':'both'):horizontal?'width':'height';
      prefs=resizePhone(start,horizontal?w:start.phoneWidth,vertical?h:start.phoneHeight,axis);
    }
    prefs=fit(prefs);paint();
  };
  const endDrag=(cancel=false)=>{
    if(!drag)return;const previous=drag;drag=null;
    if(cancel){prefs=previous.start;paint();}else persist();
    root.classList.remove('ol-dragging');
    if(previous.element.hasPointerCapture(previous.id))previous.element.releasePointerCapture(previous.id);
  };
  function handle(element:HTMLButtonElement,kind:string){
    element.addEventListener('pointerdown',event=>{if(event.button!==0||!ready)return;event.preventDefault();element.focus();drag={element,id:event.pointerId,x:event.clientX,y:event.clientY,start:effective(),kind};element.setPointerCapture(event.pointerId);root.classList.add('ol-dragging');});
    element.addEventListener('pointermove',event=>{if(drag?.element===element&&drag.id===event.pointerId)update(kind,event.clientX-drag.x,event.clientY-drag.y,drag.start);});
    element.addEventListener('pointerup',()=>endDrag());element.addEventListener('pointercancel',()=>endDrag(true));element.addEventListener('lostpointercapture',()=>endDrag(true));
    element.addEventListener('keydown',event=>{if(event.key==='Escape'){endDrag(true);return;}if(!ready||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();const step=event.shiftKey?24:8;update(kind,event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0,event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0,effective());persist();});
  }
  const divider=(className:string,label:string,target:string,kind:string)=>{
    const el=doc.createElement('button');el.type='button';el.className=`ol-divider ${className}`;el.setAttribute('role','separator');el.setAttribute('aria-orientation','vertical');el.setAttribute('aria-label',label);el.setAttribute('aria-controls',target);el.title=label+'：拖动或使用方向键';handle(el,kind);return el;
  };
  const navDivider=divider('ol-nav-divider','调整导航宽度','ol-sidebar','nav');sidebar.append(navDivider);
  const columnDivider=divider('ol-column-divider','调整中间内容宽度','ol-content','column');layout.append(columnDivider);
  const replyDivider=divider('reply-width-divider','调整回复区宽度','ol-composer','reply-width');rail?.append(replyDivider);replyDivider.ondblclick=()=>{prefs={...prefs,replyWidth:300};paint();persist();};
  navToggle.onclick=()=>{navCollapsed=!navCollapsed;try{win.localStorage.setItem(NAV_COLLAPSED_KEY,String(navCollapsed));}catch{}renderNavToggle();paint();};
  for(const [direction,label] of Object.entries({n:'上边',s:'下边',w:'左边',e:'右边',nw:'左上角',ne:'右上角',sw:'左下角',se:'右下角'})){
    const el=doc.createElement('button');el.type='button';el.className=`ol-resize ol-resize-${direction}`;el.setAttribute('aria-label',`调整手机${label}`);el.title=`拖动调整手机${label}；也可使用方向键`;handle(el,direction);box.append(el);
  }
  button.onclick=()=>{dialog.showModal();paint();};dialog.addEventListener('close',()=>paint());dialog.querySelector<HTMLButtonElement>('[data-close]')!.onclick=()=>dialog.close();
  for(const [key,input] of Object.entries(inputs))input.addEventListener('change',()=>{
    if(!ready){paint();return;}const value=input.valueAsNumber;if(input.type!=='checkbox'&&!Number.isFinite(value)){paint();return;}
    const current=effective();
    if(key==='locked')prefs={...current,locked:input.checked,ratio:PHONE_RATIO};
    else if(key==='phoneWidth'||key==='contentWidth')prefs=resizePhone(current,key==='contentWidth'?layout.clientWidth-48-railWidth()-value:value,current.phoneHeight,'width');
    else if(key==='phoneHeight')prefs=resizePhone(current,current.phoneWidth,value,'height');
    else prefs=sanitize({...current,[key]:value},current);
    prefs=fit(prefs);paint();persist();
  });
  dialog.querySelector<HTMLButtonElement>('[data-reset]')!.onclick=()=>{if(!ready)return;prefs=defaults(win.innerWidth,win.innerHeight);saved=false;paint();
    try{const records=JSON.parse(window.localStorage.getItem(STORAGE_KEY)||'{}');delete records[display.id];window.localStorage.setItem(STORAGE_KEY,JSON.stringify(records));status.textContent='已恢复本屏幕默认布局';}catch{status.textContent='已恢复默认，但无法清除保存设置';}
  };
  const changeDisplay=(next:DisplayProfile)=>{if(disposed||!next||typeof next.id!=='string')return;endDrag(true);display=next;ready=true;read();paint();};
  const onResize=()=>{endDrag(true);if(!saved)prefs=defaults(win.innerWidth,win.innerHeight);paint();};
  win.addEventListener('resize',onResize);root.addEventListener('reply-rail-change',paint);
  const dialogs=new MutationObserver(()=>paint());dialogs.observe(doc.body,{subtree:true,attributes:true,attributeFilter:['open','hidden']});
  const visibility=new MutationObserver(()=>{box.hidden=phone.hidden;});visibility.observe(phone,{attributes:true,attributeFilter:['hidden']});
  const measurements=new ResizeObserver(()=>paint());measurements.observe(root.querySelector('.od-top-actions')!);measurements.observe(root.querySelector('.od-phone-top')!);measurements.observe(root.querySelector('.od-phone-toolbar')!);
  if(removeChatWorkspace){root.classList.add('ol-details-only');workspace.remove();columnDivider.remove();}
  let unsubscribe:(()=>void)|undefined;
  if(desktop){unsubscribe=desktop.onDisplayChanged(changeDisplay);desktop.getDisplay().then(next=>{if(next)changeDisplay(next);else{ready=true;read();paint();}}).catch(()=>{ready=true;read();paint();});}
  else read();
  renderNavToggle();
  paint();
  return ()=>{disposed=true;endDrag(true);win.removeEventListener('resize',onResize);root.removeEventListener('reply-rail-change',paint);dialogs.disconnect();visibility.disconnect();measurements.disconnect();unsubscribe?.();};
}
