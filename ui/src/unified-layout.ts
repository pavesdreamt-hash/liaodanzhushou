import {defaults,sanitize,STORAGE_KEY,type DisplayProfile} from './order-layout-model';
import type {OrderLayoutDesktop} from './order-layout';
import {version} from '../../package.json';

export const NAV_COLLAPSED_KEY='liaodan-unified-nav-collapsed';
export const FIXED_EXPANDED_NAV_WIDTH=208;

export type UnifiedNavigationMetrics={compact:boolean;collapsed:boolean;width:number};

/**
 * The order-management layout is the single source for navigation defaults.
 * Specialized pages call this instead of carrying their own expanded widths.
 */
export function unifiedNavigationMetrics(win:Window,collapsed:boolean,display?:DisplayProfile):UnifiedNavigationMetrics{
  const compact=win.innerWidth<980;
  // D-190: navigation is a fixed shared shell, not a per-display resize target.
  void display;
  return {compact,collapsed,width:compact||collapsed?64:FIXED_EXPANDED_NAV_WIDTH};
}

export async function resolveUnifiedNavigationMetrics(win:Window,collapsed:boolean,desktop?:OrderLayoutDesktop):Promise<UnifiedNavigationMetrics>{
  try{return unifiedNavigationMetrics(win,collapsed,(await desktop?.getDisplay())||undefined);}catch{return unifiedNavigationMetrics(win,collapsed);}
}

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

/**
 * The source-library view predates the shared application shell.  Keep its
 * business document intact, but host it in the same neutral chrome used by
 * order management before the regular unified-layout installer runs.
 */
export function prepareSourceUnifiedShell(doc:Document){
  const root=doc.querySelector<HTMLElement>('#ui-source-library');
  const main=root?.querySelector<HTMLElement>(':scope > .main');
  if(!root||!main||root.querySelector(':scope > .app'))return;
  const app=doc.createElement('div');app.className='app source-unified-app';
  const top=doc.createElement('header');top.className='topbar';
  const brand=doc.createElement('div');brand.className='brand';
  const logo=doc.createElement('span');logo.className='logo';logo.innerHTML='<i data-lucide="messages-square"></i>';
  const name=doc.createElement('strong');name.className='brand-name';name.textContent='聊单助手';
  const release=doc.createElement('span');release.className='version';release.textContent=version;
  brand.append(logo,name,release);
  const actions=doc.createElement('div');actions.className='top-actions';
  const status=doc.createElement('span');status.className='preview';status.textContent='来源资料';actions.append(status);top.append(brand,actions);
  const shell=doc.createElement('div');shell.className='shell';
  const sidebar=doc.createElement('aside');sidebar.className='sidebar';
  const heading=doc.createElement('p');heading.className='nav-label';heading.textContent='我的工作台';
  const primary=doc.createElement('nav');primary.className='nav-group';
  primary.append(heading);
  const labels:[string,string][]=[['messages-square','聊单工作台'],['scan-search','FB 聊天'],['archive','订单管理'],['boxes','商品库存'],['chart-no-axes-combined','利润核算']];
  for(const [icon,label] of labels){const button=doc.createElement('button');button.type='button';button.className='nav-item';button.innerHTML=`<i data-lucide="${icon}"></i><span>${label}</span>`;primary.append(button);}
  const management=doc.createElement('nav');management.className='nav-group';
  for(const [icon,label] of [['bot','助手配置'],['settings','连接与设置']]){const button=doc.createElement('button');button.type='button';button.className='nav-item';button.innerHTML=`<i data-lucide="${icon}"></i><span>${label}</span>`;management.append(button);}
  sidebar.append(primary,management);shell.append(sidebar,main);app.append(top,shell);root.append(app);
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
  root.querySelector('.connection,.wa')?.remove();
  const footer=doc.createElement('div');footer.className='up-version';footer.textContent=`v${version}`;side.append(footer);
  const heading=side.querySelector<HTMLElement>('.nav-label'),navTitle=doc.createElement('span');
  navTitle.textContent=heading?.textContent?.trim()||'我的工作台';
  const navToggle=doc.createElement('button');navToggle.type='button';navToggle.className='up-nav-toggle';
  heading?.replaceChildren(navTitle,navToggle);heading?.classList.add('up-nav-heading');
  let collapsed=false;try{collapsed=win.localStorage.getItem(NAV_COLLAPSED_KEY)==='true';}catch{}
  const renderToggle=()=>{
    navToggle.innerHTML=`<i data-lucide="${collapsed?'panel-left-open':'panel-left-close'}"></i>`;
    navToggle.setAttribute('aria-label',collapsed?'展开导航栏':'折叠导航栏');navToggle.title=collapsed?'展开导航栏':'折叠导航栏';
    (win as Window&{lucide?:{createIcons:(options:{nodes:Element[]})=>void}}).lucide?.createIcons({nodes:[navToggle]});
  };
  if(desktop?.mergedTitlebar)top.style.paddingLeft='104px';
  const button=doc.createElement('button');button.type='button';button.className='up-settings';button.textContent='布局设置';actions.prepend(button);
  const dialog=doc.createElement('dialog');dialog.className='shared-dialog';dialog.innerHTML='<h2>页面布局</h2><p>侧栏宽度已统一固定；导航和内容字号按屏幕保存。</p><label>导航字号（px）<input data-setting="navFont" type="number" min="13" max="22"></label><label>内容字号（px）<input data-setting="contentFont" type="number" min="13" max="22"></label><output aria-live="polite"></output><footer><button data-reset>恢复本屏幕默认</button><button data-close>完成</button></footer>';root.append(dialog);
  let display:DisplayProfile={id:`browser-${win.screen.width}x${win.screen.height}-${win.devicePixelRatio}`,label:'当前屏幕'},prefs=defaults(win.innerWidth,win.innerHeight),disposed=false;
  const state=dialog.querySelector('output')!;
  const paint=()=>{
    if(disposed)return;
    const metrics=unifiedNavigationMetrics(win,collapsed,display);
    root.classList.toggle('up-compact',metrics.compact);root.classList.toggle('up-nav-collapsed',collapsed);
    root.style.setProperty('--up-nav',`${metrics.width}px`);
    root.style.setProperty('--up-nav-font',`${prefs.navFont}px`);root.style.setProperty('--up-content-font',`${prefs.contentFont}px`);
    dialog.querySelectorAll<HTMLInputElement>('[data-setting]').forEach(el=>{el.value=String(prefs[el.dataset.setting as 'navFont']);});
    onTitlebar(win.innerWidth-actions.getBoundingClientRect().left+10,Boolean(doc.querySelector('dialog[open],.overlay:not([hidden])')));
    root.dataset.layoutReady='true';
  };
  const read=()=>{try{prefs=sanitize(JSON.parse(window.localStorage.getItem(STORAGE_KEY)||'{}')[display.id],defaults(win.innerWidth,win.innerHeight));}catch{prefs=defaults(win.innerWidth,win.innerHeight);}renderToggle();paint();};
  const save=()=>{try{const records=JSON.parse(window.localStorage.getItem(STORAGE_KEY)||'{}');records[display.id]=prefs;window.localStorage.setItem(STORAGE_KEY,JSON.stringify(records));state.textContent='已保存到本屏幕';}catch{state.textContent='调整已生效，但本机存储不可用';}};
  navToggle.onclick=()=>{collapsed=!collapsed;try{win.localStorage.setItem(NAV_COLLAPSED_KEY,String(collapsed));}catch{}renderToggle();paint();};
  button.onclick=()=>dialog.showModal();dialog.querySelector<HTMLButtonElement>('[data-close]')!.onclick=()=>dialog.close();
  dialog.querySelector<HTMLButtonElement>('[data-reset]')!.onclick=()=>{prefs=defaults(win.innerWidth,win.innerHeight);save();paint();};
  dialog.querySelectorAll<HTMLInputElement>('input').forEach(el=>el.onchange=()=>{if(Number.isFinite(el.valueAsNumber))prefs=sanitize({...prefs,[el.dataset.setting!]:el.valueAsNumber},prefs);save();paint();});
  const observer=new MutationObserver(paint);observer.observe(doc.body,{subtree:true,attributes:true,attributeFilter:['open','hidden']});
  const measurements=new ResizeObserver(paint);measurements.observe(actions);win.addEventListener('resize',paint);
  const change=(d:DisplayProfile)=>{if(!disposed){display=d;read();}};
  const unsubscribe=desktop?.onDisplayChanged(change);desktop?.getDisplay().then(d=>d?change(d):read()).catch(read);if(!desktop)read();
  return ()=>{disposed=true;observer.disconnect();measurements.disconnect();win.removeEventListener('resize',paint);unsubscribe?.();};
}
