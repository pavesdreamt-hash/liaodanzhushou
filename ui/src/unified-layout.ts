import {defaults,sanitize,STORAGE_KEY,type DisplayProfile} from './order-layout-model';
import type {OrderLayoutDesktop} from './order-layout';

export function aliasWorkbench(doc:Document){
  const root=doc.querySelector<HTMLElement>('#chat-workbench-aligned')!;
  const map:Record<string,string>={app:'app',topbar:'topbar','top-actions':'top-actions',shell:'shell',sidebar:'sidebar','nav-group':'nav-group','nav-item':'nav-item','nav-label':'nav-label',connection:'connection',main:'main','page-head':'page-head',workspace:'layout',center:'content','phone-column':'chat-column','phone-title':'chat-title','mode-switch':'mode-switch',mode:'mode','chat-status':'chat-status',phone:'phone','phone-top':'phone-top','chat-toolbar':'phone-toolbar',messages:'messages','phone-contact':'contact',bubble:'bubble',translation:'translation',version:'version'};
  for(const [from,to] of Object.entries(map))root.querySelectorAll(`.cw-${from}`).forEach(el=>el.classList.add(`od-${to}`));
  root.classList.add('workbench-layout');
  // Dynamic chat rows are replaced by the original workbench renderer.
  const observer=new MutationObserver(()=>{for(const name of ['bubble','translation'])root.querySelectorAll(`.cw-${name}:not(.od-${name})`).forEach(el=>el.classList.add(`od-${name}`));});
  observer.observe(root.querySelector('.cw-messages')!,{childList:true,subtree:true});
  return ()=>observer.disconnect();
}

export function installUnifiedLayout(doc:Document,win:Window,desktop:OrderLayoutDesktop|undefined,onTitlebar:(right:number,blocked:boolean)=>void){
  const app=doc.querySelector<HTMLElement>('.app')!,root=app.parentElement!;
  root.classList.add('unified-page');
  const alias=(selector:string,name:string)=>{const el=root.querySelector<HTMLElement>(selector)!;el.classList.add(`up-${name}`);return el;};
  app.classList.add('up-app');
  const top=alias('.topbar,.top','top'),actions=alias('.top-actions,.top-r','actions');
  alias('.shell','shell');const side=alias('.sidebar,.side','sidebar');alias('.main','main');
  const scroll=doc.createElement('div');scroll.className='up-nav-scroll';side.prepend(scroll);
  side.querySelectorAll('.nav-group').forEach(el=>scroll.append(el));
  side.querySelectorAll<HTMLButtonElement>('.nav-item,.nav').forEach(el=>{el.classList.add('up-nav');el.setAttribute('aria-label',el.textContent!.trim());});
  root.querySelector('.connection,.wa')?.classList.add('up-status');
  if(desktop?.mergedTitlebar)top.style.paddingLeft='104px';
  const button=doc.createElement('button');button.type='button';button.className='up-settings';button.textContent='布局设置';actions.prepend(button);
  const dialog=doc.createElement('dialog');dialog.className='shared-dialog';dialog.innerHTML='<h2>页面布局</h2><p>各页面共用导航和内容字号，按显示器保存。</p><label>导航宽度（px）<input data-setting="navWidth" type="number" min="144" max="340"></label><label>导航字号（px）<input data-setting="navFont" type="number" min="13" max="22"></label><label>内容字号（px）<input data-setting="contentFont" type="number" min="13" max="22"></label><output aria-live="polite"></output><footer><button data-reset>恢复本屏幕默认</button><button data-close>完成</button></footer>';root.append(dialog);
  let display:DisplayProfile={id:`browser-${win.screen.width}x${win.screen.height}-${win.devicePixelRatio}`,label:'当前屏幕'},prefs=defaults(win.innerWidth,win.innerHeight),disposed=false;
  const state=dialog.querySelector('output')!;
  const paint=()=>{
    if(disposed)return;
    const compact=win.innerWidth<980;root.classList.toggle('up-compact',compact);
    root.style.setProperty('--up-nav',`${compact?64:Math.max(144,Math.min(prefs.navWidth,340))}px`);
    root.style.setProperty('--up-nav-font',`${prefs.navFont}px`);root.style.setProperty('--up-content-font',`${prefs.contentFont}px`);
    dialog.querySelectorAll<HTMLInputElement>('[data-setting]').forEach(el=>{el.value=String(prefs[el.dataset.setting as 'navWidth']);el.disabled=el.dataset.setting==='navWidth'&&compact;});
    onTitlebar(win.innerWidth-actions.getBoundingClientRect().left+10,Boolean(doc.querySelector('dialog[open],.overlay:not([hidden])')));
    root.dataset.layoutReady='true';
  };
  const read=()=>{try{prefs=sanitize(JSON.parse(window.localStorage.getItem(STORAGE_KEY)||'{}')[display.id],defaults(win.innerWidth,win.innerHeight));}catch{prefs=defaults(win.innerWidth,win.innerHeight);}paint();};
  const save=()=>{try{const records=JSON.parse(window.localStorage.getItem(STORAGE_KEY)||'{}');records[display.id]=prefs;window.localStorage.setItem(STORAGE_KEY,JSON.stringify(records));state.textContent='已保存到本屏幕';}catch{state.textContent='调整已生效，但本机存储不可用';}};
  button.onclick=()=>dialog.showModal();dialog.querySelector<HTMLButtonElement>('[data-close]')!.onclick=()=>dialog.close();
  dialog.querySelector<HTMLButtonElement>('[data-reset]')!.onclick=()=>{prefs=defaults(win.innerWidth,win.innerHeight);save();paint();};
  dialog.querySelectorAll<HTMLInputElement>('input').forEach(el=>el.onchange=()=>{if(Number.isFinite(el.valueAsNumber))prefs=sanitize({...prefs,[el.dataset.setting!]:el.valueAsNumber},prefs);save();paint();});
  const separator=doc.createElement('button');separator.className='up-divider';separator.setAttribute('role','separator');separator.setAttribute('aria-label','调整导航宽度');separator.setAttribute('aria-orientation','vertical');side.append(separator);
  let drag:{x:number;width:number}|undefined;
  separator.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();drag={x:e.clientX,width:prefs.navWidth};separator.setPointerCapture(e.pointerId);};
  separator.onpointermove=e=>{if(drag){prefs=sanitize({...prefs,navWidth:drag.width+e.clientX-drag.x},prefs);paint();}};
  separator.onpointerup=()=>{drag=undefined;save();};separator.onpointercancel=()=>{drag=undefined;};
  separator.onkeydown=e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();prefs=sanitize({...prefs,navWidth:prefs.navWidth+(e.key==='ArrowLeft'?-8:8)},prefs);save();paint();}};
  const observer=new MutationObserver(paint);observer.observe(doc.body,{subtree:true,attributes:true,attributeFilter:['open','hidden']});
  const measurements=new ResizeObserver(paint);measurements.observe(actions);win.addEventListener('resize',paint);
  const change=(d:DisplayProfile)=>{if(!disposed){display=d;read();}};
  const unsubscribe=desktop?.onDisplayChanged(change);desktop?.getDisplay().then(d=>d?change(d):read()).catch(read);if(!desktop)read();
  return ()=>{disposed=true;observer.disconnect();measurements.disconnect();win.removeEventListener('resize',paint);unsubscribe?.();};
}
