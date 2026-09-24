import {StrictMode,createElement,useEffect,useMemo,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {renderToStaticMarkup} from 'react-dom/server';
import {CircleHelp,icons} from 'lucide-react';
import workbenchHtml from './confirmed/workbench.html?raw';
import desktopWorkbenchHtml from './chat-workbench-desktop.html?raw';
import ordersHtml from './confirmed/orders.html?raw';
import inventoryHtml from './confirmed/inventory.html?raw';
import profitHtml from './confirmed/profit.html?raw';
import assistantHtml from './confirmed/assistant.html?raw';
import settingsHtml from './confirmed/settings.html?raw';
import productHtml from './confirmed/product.html?raw';
import orderHtml from './confirmed/order.html?raw';
import profitDetailHtml from './confirmed/profit-detail.html?raw';
import './styles.css';
import './window-chrome.css';
import orderLayoutCss from './order-layout.css?raw';
import {installOrderLayout,type OrderLayoutDesktop} from './order-layout';
import unifiedCss from './unified-layout.css?raw';
import replyCss from './reply-tools.css?raw';
import mediaDialogCss from './media-dialog.css?raw';
import productMediaCss from './product-media.css?raw';
import {aliasWorkbench,installUnifiedLayout} from './unified-layout';
import {installProductPictures} from './reply-tools';
import {installEmptyWorkspace} from './empty-workspace';
import {installDesktopChatWorkbench} from './chat-workbench-desktop';
import {installRestoredPage} from './restored-pages';
import {installOrdersPage,installOrderDetail,installWorkbenchOrders} from './order-business';
import orderBusinessCss from './order-business.css?raw';
import workbenchOrdersCss from './workbench-orders.css?raw';
import emptyCss from './empty-workspace.css?raw';
import desktopWorkbenchCss from './chat-workbench-desktop.css?raw';
import restoredCss from './restored-pages.css?raw';
import hoverHintsCss from './hover-hints.css?raw';
import {installHoverHints} from './hover-hints';
import {version} from '../../package.json';

const UI_BUILD_MARKER='liaodan-assistant-next-ui';
document.documentElement.dataset.build=UI_BUILD_MARKER;

type Page='workbench'|'orders'|'inventory'|'profit'|'assistant'|'settings'|'product'|'order'|'profit-detail';
type DragRect={left:number;top:number;width:number;height:number};
type DragArea={right:number;blocked:boolean;workbenchRects:DragRect[]};
const chatPages=new Set<Page>(['order','workbench']);
const productPages=new Set<Page>(['inventory','product']);
const restoredPages=new Set<Page>(['inventory','profit','assistant','settings','product','profit-detail']);
const moduleStyle=(name:string,css:string)=>`<style data-ui-module="${name}">${css}</style>`;
const pages:Record<Page,string>={
  workbench:desktopWorkbenchHtml,orders:ordersHtml,inventory:inventoryHtml,profit:profitHtml,
  assistant:assistantHtml,settings:settingsHtml,product:productHtml,order:orderHtml,
  'profit-detail':profitDetailHtml
};

const routeByLabel:Record<string,Page>={
  '聊单工作台':'workbench','订单管理':'orders','订单与客户':'orders','商品库存':'inventory',
  '利润核算':'profit','利润':'profit','助手配置':'assistant','助手设置':'assistant','连接与设置':'settings'
};

const sameDragRects=(first:DragRect[],second:DragRect[])=>first.length===second.length&&first.every((rect,index)=>{
  const next=second[index];return rect.left===next.left&&rect.top===next.top&&rect.width===next.width&&rect.height===next.height;
});

function iconName(value:string){return value.split('-').map(x=>x?x[0].toUpperCase()+x.slice(1):'').join('')}

function ConfirmedApp(){
  const requested=new URLSearchParams(location.search).get('page') as Page|null;
  const [page,setPage]=useState<Page>(requested&&requested in pages?requested:'workbench');
  const [selectedOrderId,setSelectedOrderId]=useState<string|null>(null);
  const [selectedProductId,setSelectedProductId]=useState<string|null>(null);
  const [selectedProfitDay,setSelectedProfitDay]=useState<string|null>(null);
  const pendingOrderAction=useRef<'import'|'new'|undefined>(undefined);
  const frame=useRef<HTMLIFrameElement>(null);
  const desktop=(window as Window&{orderLayoutDesktop?:OrderLayoutDesktop}).orderLayoutDesktop;
  const merged=Boolean(desktop?.mergedTitlebar);
  const [dragArea,setDragArea]=useState<DragArea>({right:600,blocked:false,workbenchRects:[]});
  const cleanup=useRef<(()=>void)|undefined>(undefined);
  useEffect(()=>()=>cleanup.current?.(),[]);
  useEffect(()=>{if(merged)void desktop?.setOrderChrome?.(true);},[page,merged,desktop]);
  const html=useMemo(()=>{
    const chat=chatPages.has(page),product=productPages.has(page);
    return (restoredPages.has(page)?pages[page].replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''):pages[page]).replaceAll('__APP_VERSION__',version).replace(/>1\.0</g,`>${version}<`)
      +moduleStyle('shared-layout',unifiedCss)
      +(chat?moduleStyle('chat-layout',orderLayoutCss.replaceAll('#ui008-order-detail',':is(#ui008-order-detail,#chat-workbench-aligned)')):'')
      +(chat||product?moduleStyle('media-dialog',mediaDialogCss):'')
      +(chat?moduleStyle('chat-replies',replyCss):'')
      +(product?moduleStyle('product-media',productMediaCss):'')
      +(['orders','order'].includes(page)?moduleStyle('order-business',orderBusinessCss):'')
      +(page==='workbench'?moduleStyle('workbench-orders',workbenchOrdersCss):'')
      +(page==='workbench'?moduleStyle('desktop-workbench',desktopWorkbenchCss):'')
      +moduleStyle('empty-workspace',emptyCss)
      +(restoredPages.has(page)?moduleStyle('restored-pages',restoredCss):'')
      +moduleStyle('hover-hints',hoverHintsCss);
  },[page]);
  const setup=()=>{
    cleanup.current?.();cleanup.current=undefined;
    const current=frame.current;const doc=current?.contentDocument;const win=current?.contentWindow as (Window&{lucide?:{createIcons:(options?:{nodes?:Array<Document|Element>;attrs?:Record<string,string|number>})=>void}})|null;
    if(!current||!doc||!win)return;
    const navButtons=Array.from(doc.querySelectorAll('aside button,nav button'));
    for(const button of navButtons){
      const text=(button.textContent||'').replace(/\s+/g,'').trim();
      if(text==='订单与客户')button.querySelector('span') ? button.querySelector('span')!.textContent='订单管理' : button.append('订单管理');
      if(text==='利润')button.querySelector('span') ? button.querySelector('span')!.textContent='利润核算' : button.append('利润核算');
      if(text==='助手设置')button.querySelector('span') ? button.querySelector('span')!.textContent='助手配置' : button.append('助手配置');
    }
    const normalized=Array.from(doc.querySelectorAll('aside button,nav button'));
    if(!normalized.some(button=>(button.textContent||'').includes('利润'))){
      const inventory=normalized.find(button=>(button.textContent||'').includes('商品库存'));
      if(inventory){
        const profitButton=inventory.cloneNode(true) as HTMLButtonElement;
        profitButton.className=profitButton.className.replace(/\b(on|active)\b/g,'').trim();
        profitButton.removeAttribute('aria-current');
        profitButton.innerHTML='<i data-lucide="chart-no-axes-combined"></i><span>利润核算</span>';
        inventory.after(profitButton);
      }
    }
    const navIcons:Record<string,string>={'聊单工作台':'messages-square','订单管理':'archive','商品库存':'boxes','利润核算':'chart-no-axes-combined','助手配置':'bot','连接与设置':'settings'};
    for(const button of doc.querySelectorAll<HTMLButtonElement>('aside button')){
      const icon=navIcons[(button.textContent||'').replace(/\s+/g,'').trim()],placeholder=button.querySelector<HTMLElement>('[data-lucide]');
      if(icon&&placeholder)placeholder.dataset.lucide=icon;
    }
    const createIcons=(options?:{nodes?:Array<Document|Element>;attrs?:Record<string,string|number>})=>{
      const roots=options?.nodes?.length?options.nodes:[doc];
      for(const root of roots){
        const candidates:Array<Element>=[];
        if(root instanceof Element&&root.matches('[data-lucide]'))candidates.push(root);
        candidates.push(...Array.from(root.querySelectorAll('[data-lucide]')));
        for(const placeholder of candidates){
          const raw=placeholder.getAttribute('data-lucide')||'';
          const Icon=(icons as Record<string,typeof CircleHelp>)[iconName(raw)]||CircleHelp;
          const size=Number(options?.attrs?.width||placeholder.getAttribute('width')||16);
          const markup=renderToStaticMarkup(createElement(Icon,{width:size,height:Number(options?.attrs?.height||size),'aria-hidden':'true'}));
          placeholder.outerHTML=markup;
        }
      }
    };
    win.lucide={createIcons};createIcons({nodes:[doc]});
    const disposers:Array<()=>void>=[];
    const chrome=(right:number,blocked:boolean)=>setDragArea(previous=>{
      const next={right,blocked,workbenchRects:page==='workbench'?previous.workbenchRects:[]};
      return previous.right===next.right&&previous.blocked===next.blocked&&sameDragRects(previous.workbenchRects,next.workbenchRects)?previous:next;
    });
    if(page==='order'){
      disposers.push(installOrderLayout(doc,win,desktop,chrome,{removeChatWorkspace:true}));
    }else if(page!=='workbench')disposers.push(installUnifiedLayout(doc,win,desktop,chrome));
    if(page==='order')installEmptyWorkspace(doc,page);
    if(restoredPages.has(page)){
      disposers.push(installRestoredPage(doc,win,page as 'inventory'|'profit'|'assistant'|'settings'|'product'|'profit-detail',{
        productId:selectedProductId||undefined,day:selectedProfitDay||undefined,
        openProduct:id=>{setSelectedProductId(id);setPage('product');},
        openDay:day=>{setSelectedProfitDay(day);setPage('profit-detail');},
        openOrder:id=>{setSelectedOrderId(id);setPage('order');}
      }));
      if(productPages.has(page))disposers.push(installProductPictures(doc,page));
    }
    if(page==='orders'){
      disposers.push(installOrdersPage(doc,{openOrder:id=>{setSelectedOrderId(id);setPage('order');},initialAction:pendingOrderAction.current}));
      pendingOrderAction.current=undefined;
    }
    if(page==='order'&&selectedOrderId)disposers.push(installOrderDetail(doc,selectedOrderId));
    if(page==='workbench'){
      disposers.push(installDesktopChatWorkbench(doc));
      // The iframe cannot provide a reliable native macOS drag hit region. Build the shared
      // 56px strip in the parent document, while physically leaving holes above its controls.
      const workbench=doc.querySelector<HTMLElement>('#chat-workbench-desktop')!;
      let chromeFrame=0;
      const updateWorkbenchChrome=()=>{
        const blocked=Boolean(doc.querySelector('dialog[open],.overlay:not([hidden])')),
          frameBounds=current.getBoundingClientRect(),strip={left:Math.ceil(frameBounds.left+96),top:Math.ceil(frameBounds.top),right:Math.floor(frameBounds.right),bottom:Math.floor(frameBounds.top+56)},padding=4,
          controls=Array.from(doc.querySelectorAll<HTMLElement>('#cwb-connection-status,.cwb-top-modes')),
          holes=controls.map(control=>{
            const bounds=control.getBoundingClientRect(),left=Math.max(strip.left,Math.floor(frameBounds.left+bounds.left-padding)),top=Math.max(strip.top,Math.floor(frameBounds.top+bounds.top-padding)),right=Math.min(strip.right,Math.ceil(frameBounds.left+bounds.right+padding)),bottom=Math.min(strip.bottom,Math.ceil(frameBounds.top+bounds.bottom+padding));
            return {left,top,right,bottom};
          }).filter(hole=>hole.right>hole.left&&hole.bottom>hole.top),
          xStops=Array.from(new Set([strip.left,strip.right,...holes.flatMap(hole=>[hole.left,hole.right])])).sort((first,second)=>first-second),
          yStops=Array.from(new Set([strip.top,strip.bottom,...holes.flatMap(hole=>[hole.top,hole.bottom])])).sort((first,second)=>first-second),nextRects:DragRect[]=[];
        if(holes.length)for(let y=0;y<yStops.length-1;y++)for(let x=0;x<xStops.length-1;x++){
          const left=xStops[x],top=yStops[y],right=xStops[x+1],bottom=yStops[y+1],centerX=(left+right)/2,centerY=(top+bottom)/2;
          if(right>left&&bottom>top&&!holes.some(hole=>centerX>=hole.left&&centerX<=hole.right&&centerY>=hole.top&&centerY<=hole.bottom))nextRects.push({left,top,width:right-left,height:bottom-top});
        }
        setDragArea(previous=>previous.right===0&&previous.blocked===blocked&&sameDragRects(previous.workbenchRects,nextRects)?previous:{right:0,blocked,workbenchRects:nextRects});
      };
      const scheduleWorkbenchChrome=()=>{win.cancelAnimationFrame(chromeFrame);chromeFrame=win.requestAnimationFrame(updateWorkbenchChrome);};
      updateWorkbenchChrome();
      const chromeObserver=new MutationObserver(scheduleWorkbenchChrome);
      chromeObserver.observe(doc.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['open','hidden','class','style']});
      win.addEventListener('resize',scheduleWorkbenchChrome);
      disposers.push(()=>{win.cancelAnimationFrame(chromeFrame);chromeObserver.disconnect();win.removeEventListener('resize',scheduleWorkbenchChrome);});
    }
    disposers.push(installHoverHints(doc));
    createIcons({nodes:[doc]});
    cleanup.current=()=>disposers.reverse().forEach(dispose=>dispose());
    doc.addEventListener('click',event=>{
      const button=(event.target as Element|null)?.closest('button');if(!button)return;
      if(button.matches('[data-open-orders-import]')){event.preventDefault();event.stopImmediatePropagation();pendingOrderAction.current='import';setPage('orders');return;}
      if(button.dataset.openSettings==='true'){event.preventDefault();event.stopImmediatePropagation();setPage('settings');return;}
      const orderId=button.matches('[data-open-order-detail]')?button.closest<HTMLElement>('[data-order-id]')?.dataset.orderId:undefined;
      if(orderId){event.preventDefault();event.stopImmediatePropagation();setSelectedOrderId(orderId);setPage('order');return;}
      const label=(button.textContent||'').replace(/\s+/g,'').trim();
      const navPage=Object.entries(routeByLabel).find(([name])=>label===name)?.[1];
      if(navPage&&button.closest('aside,nav')){event.preventDefault();event.stopImmediatePropagation();setPage(navPage);return;}
      if(button.dataset.restoredAction==='true')return;
      let next:Page|undefined;
      if(button.matches('[data-detail]')||label==='订单详情'||label==='进入订单详情')next='order';
      if(label.includes('进入产品详情页'))next='product';
      if(page==='profit'&&label.includes('查看详情'))next='profit-detail';
      if(button.id==='u32-back'||label.includes('返回库存'))next='inventory';
      if(button.classList.contains('od-back')||label==='返回订单管理')next='orders';
      if(page==='profit-detail'&&(label.includes('返回核算')||label.includes('返回利润核算')))next='profit';
      if(next){event.preventDefault();event.stopImmediatePropagation();setPage(next);}
    },true);
  };
  const iframe=<iframe key={`${page}:${page==='order'?selectedOrderId||'':page==='product'?selectedProductId||'':page==='profit-detail'?selectedProfitDay||'':''}`} ref={frame} className="confirmed-frame" title="聊单助手" srcDoc={html} onLoad={setup}/>;
  if(!merged)return iframe;
  const dragLayers=!dragArea.blocked&&(page==='workbench'?dragArea.workbenchRects.map((rect,index)=><div key={`${rect.left}:${rect.top}:${rect.width}:${rect.height}:${index}`} className="order-window-drag" aria-hidden="true" style={{left:rect.left,top:rect.top,width:rect.width,height:rect.height,right:'auto'}}/>):<div className="order-window-drag" aria-hidden="true" style={{right:dragArea.right,height:56}}/>);
  return <div className="desktop-shell">{iframe}{dragLayers}</div>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><ConfirmedApp/></StrictMode>);
