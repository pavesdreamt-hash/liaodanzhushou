import {StrictMode, useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {
  AlertTriangle, Archive, ArrowLeft, Ban, Bot, Box, CalendarDays, CalendarPlus, CalendarRange,
  ChartNoAxesCombined, Check, CheckCircle2, ChevronDown, CircleCheckBig, CircleHelp,
  ClipboardCheck, Clock3, Download, ExternalLink, FileDown, FilePenLine, FileSpreadsheet,
  Database, FileText, Hand, History, Home, Image, Images, LayoutDashboard, Link2, MapPin, MapPinned, MessageCircle,
  MessageCircleX, MessagesSquare, MoreHorizontal, Package, PackageOpen, Pencil, Plus, QrCode, RefreshCw, RotateCcw,
  Save, Search, Send, Settings, ShieldCheck, ShoppingBag, SlidersHorizontal, Sparkles,
  Trash2, Truck, Upload, UserRound, Users, WalletCards, X, XCircle
} from 'lucide-react';
import {demoOrders, demoProducts, demoTasks, profitRows, type OrderRow, type ProductRow} from './data';
import './styles.css';
const UI_BUILD_MARKER='liaodan-assistant-next-ui';
document.documentElement.dataset.build=UI_BUILD_MARKER;

type Page = 'workbench'|'orders'|'inventory'|'profit'|'assistant'|'settings'|'product'|'order'|'profit-detail';
const DEMO=new URLSearchParams(location.search).get('live')!=='1';
const notify=(message:string)=>window.dispatchEvent(new CustomEvent('liaodan-toast',{detail:message}));

function orderStatus(value:string):OrderRow['status']{
  if(value==='draft')return '草稿';
  if(['shipped_pending','outbound_processing'].includes(value))return '运输中';
  if(['signed','completed'].includes(value))return '已签收';
  if(['void','recycle'].includes(value))return '已作废';
  return '待确认';
}
function useOrders(){
  const [rows,setRows]=useState<OrderRow[]>(DEMO?demoOrders:[]);
  useEffect(()=>{if(DEMO)return;void window.inventoryApp?.orders?.list?.({}).then((result:any)=>{
    if(!result?.ok||!Array.isArray(result.data))return;
    setRows(result.data.map((row:any)=>{const created=String(row.createdAt||'').replace('T',' '),updated=String(row.updatedAt||'').replace('T',' '),products=Array.isArray(row.products)&&row.products.length?row.products.map((x:any)=>`${x.code} × ${x.quantity}`).join('、'):'尚未选择';return {id:String(row.id),date:created.slice(0,10)||'—',time:created.slice(11,16)||'',orderNo:String(row.orderNo||`订单 #${row.sequence||''}`),phone:String(row.phone||''),name:String(row.customerName||'姓名未确认'),product:products,amount:row.amountFils==null?'—':`AED ${(Number(row.amountFils)/100).toFixed(0)}`,source:row.source==='draft'?'聊单创建':row.source==='manual'?'手动新增':'文件导入',status:orderStatus(row.lifecycleState!=='active'?row.lifecycleState:row.workflowStatus||row.trackingStatus),updated:updated.slice(0,16)||'—'} as OrderRow;}));
  });},[]);
  return rows;
}
function useProducts(){
  const [rows,setRows]=useState<ProductRow[]>(DEMO?demoProducts:[]);
  useEffect(()=>{if(DEMO)return;void window.inventoryApp?.orders?.productProfiles?.().then((result:any)=>{
    if(!result?.ok||!Array.isArray(result.data))return;
    const colors=['#f1e8ff','#e4f6f1','#fff0e2','#e6ebff','#fff4d8','#f9e6f0'];
    setRows(result.data.map((row:any,index:number)=>({id:String(row.businessId),name:String(row.displayName||row.businessId),price:Number(row.actualPriceFils||0)/100,cost:Number.parseFloat(row.sourceCost||'0')||0,suggested:Number.parseFloat(row.suggestedPrice||'0')||0,inStock:row.inventoryStatus!=='无货',color:colors[index%colors.length]})));
  });},[]);
  return rows;
}
type ProfitView={rows:typeof profitRows;summary:{received:string;ad:string;cost:string;profit:string}};
const cny=(fen:number)=>`¥${Math.round(Number(fen||0)/100).toLocaleString('en-US')}`;
function useProfit(){
  const [value,setValue]=useState<ProfitView>(DEMO?{rows:profitRows,summary:{received:'¥16,420',ad:'$1,660',cost:'¥13,669',profit:'¥2,751'}}:{rows:[],summary:{received:'¥0',ad:'$0',cost:'¥0',profit:'¥0'}});
  useEffect(()=>{if(DEMO)return;void window.inventoryApp?.orders?.profitDashboard?.({range:'7'}).then((result:any)=>{
    if(!result?.ok||!result.data)return;const data=result.data,rows=(Array.isArray(data.rows)?data.rows:[]).map((row:any)=>({day:String(row.day||'').slice(5),received:cny(row.remittanceCnyFen),ad:`$${(Number(row.adUsdCents||0)/100).toLocaleString('en-US')}`,adCny:`≈ ${cny(row.adCostCnyFen)}`,account:cny(row.accountCostCnyFen),shipping:`AED ${(Number(row.shippingAedFils||0)/100).toLocaleString('en-US')}`,shippingCny:`≈ ${cny(row.shippingCnyFen)}`,cost:cny(Number(row.adCostCnyFen||0)+Number(row.accountCostCnyFen||0)+Number(row.shippingCnyFen||0)),profit:cny(row.realProfitCnyFen),value:Number(row.realProfitCnyFen||0)/100}));const summary=data.summary||{},adCents=(Array.isArray(data.rows)?data.rows:[]).reduce((sum:number,row:any)=>sum+Number(row.adUsdCents||0),0);setValue({rows,summary:{received:cny(summary.remittanceCnyFen),ad:`$${(adCents/100).toLocaleString('en-US')}`,cost:cny(Number(summary.sharedCostCnyFen||0)+Number(summary.shippingCnyFen||0)),profit:cny(summary.realProfitCnyFen)}});
  });},[]);
  return value;
}

const nav = [
  {page:'workbench' as Page,label:'聊单工作台',icon:LayoutDashboard},
  {page:'orders' as Page,label:'订单管理',icon:Users},
  {page:'inventory' as Page,label:'商品库存',icon:Package},
  {page:'profit' as Page,label:'利润核算',icon:ChartNoAxesCombined}
];
const manage = [
  {page:'assistant' as Page,label:'助手配置',icon:Bot},
  {page:'settings' as Page,label:'连接与设置',icon:SlidersHorizontal}
];

function Button({children,primary=false,quiet=false,onClick,className=''}:{children:React.ReactNode;primary?:boolean;quiet?:boolean;onClick?:()=>void;className?:string}){
  return <button className={`button ${primary?'primary':''} ${quiet?'quiet':''} ${className}`} onClick={onClick||(()=>notify('演示控件已响应'))}>{children}</button>;
}

function HelpButton({text,label='查看说明'}:{text:string;label?:string}){
  const [open,setOpen]=useState(false);
  return <span className="help-wrap"><button className="help-button" aria-label={label} onClick={()=>setOpen(!open)}>?</button>{open&&<span className="help-popover">{text}</span>}</span>;
}

function Toast(){const [message,setMessage]=useState('');useEffect(()=>{let timer=0;const onToast=(event:Event)=>{setMessage(String((event as CustomEvent).detail||''));window.clearTimeout(timer);timer=window.setTimeout(()=>setMessage(''),2100)};window.addEventListener('liaodan-toast',onToast);return()=>{window.removeEventListener('liaodan-toast',onToast);window.clearTimeout(timer)}},[]);return message?<div className="toast" role="status"><CheckCircle2 size={16}/>{message}</div>:null}

function Shell(){
  const [page,setPage]=useState<Page>('workbench');
  const go=(next:Page)=>setPage(next);
  const title=page==='order'?'订单详情':page==='product'?'产品详情':page==='profit-detail'?'利润详情':'';
  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><span className="brand-mark"><MessagesSquare size={19}/></span><b>聊单助手</b><span className="version">1.0.1</span></div>
      <div className="top-meta"><span className="demo-badge">演示数据</span><span>{title||'统一工作台'}</span><button className="top-icon" aria-label="帮助" onClick={()=>notify('演示模式：所有数据仅用于界面与交互核对')}><CircleHelp size={17}/></button><span className="avatar">我</span></div>
    </header>
    <div className="body-shell">
      <aside className="sidebar">
        <div className="nav-label">我的工作台</div>
        {nav.map(item=><Nav key={item.page} {...item} active={page===item.page||(['order'].includes(page)&&item.page==='orders')||(['product'].includes(page)&&item.page==='inventory')||(['profit-detail'].includes(page)&&item.page==='profit')} onClick={()=>go(item.page)}/>)}
        <div className="nav-label second">助手管理</div>
        {manage.map(item=><Nav key={item.page} {...item} active={page===item.page} onClick={()=>go(item.page)}/>)}
        <div className="connection"><span></span><div><b>WhatsApp 已连接</b><small>本地同步在线</small></div></div>
      </aside>
      <main className="main-area">
        {page==='workbench'&&<Workbench go={go}/>} {page==='orders'&&<Orders go={go}/>} {page==='inventory'&&<Inventory go={go}/>} {page==='profit'&&<Profit go={go}/>} {page==='assistant'&&<Assistant/>} {page==='settings'&&<SettingsPage/>} {page==='product'&&<ProductDetail go={go}/>} {page==='order'&&<OrderDetail go={go}/>} {page==='profit-detail'&&<ProfitDetail go={go}/>} 
      </main>
    </div>
    <Toast/>
  </div>;
}

function Nav({label,icon:Icon,active,onClick}:{label:string;icon:React.ComponentType<{size?:number}>;active:boolean;onClick:()=>void}){
  return <button className={`nav ${active?'active':''}`} onClick={onClick}><Icon size={16}/><span>{label}</span></button>;
}

function PageHead({title,subtitle,eyebrow,children}:{title:string;subtitle:string;eyebrow?:string;children?:React.ReactNode}){
  return <div className={`page-head ${eyebrow?'with-eyebrow':''}`}><div>{eyebrow&&<span className="eyebrow">{eyebrow}</span>}<h1>{title}</h1><p>{subtitle}</p></div><div className="head-actions">{children}</div></div>;
}

function Workbench({go}:{go:(p:Page)=>void}){
  const [selected,setSelected]=useState(0); const [mode,setMode]=useState<'人工'|'AI辅助'|'AI自动'>('人工'); const [taskTab,setTaskTab]=useState('全部'); const liveOrders=useOrders();
  const tasks=DEMO?demoTasks:liveOrders.slice(0,6).map(row=>[row.name==='姓名未确认'?'?':row.name.slice(0,1).toUpperCase(),row.phone,`${row.name} · ${row.status}`,row.product==='尚未选择'?'资料尚未完整':row.product,row.status==='待确认'?'待确认商品与价格':row.status] as string[]);
  return <div className="page workbench-page">
    <PageHead title="聊单工作台" subtitle="先处理需要你关注的聊天和订单。"><Button onClick={()=>notify('演示：已打开订单文件选择')}><Upload size={14}/>导入订单</Button><Button primary onClick={()=>{notify('已建立演示订单草稿');go('order')}}><Plus size={14}/>新建订单</Button></PageHead>
    <div className="work-grid">
      <section className="work-left">
        <div className="stats"><Stat label="待回复" value="12" note="新消息需要处理"/><Stat label="待补资料" value="7" note="客户资料尚未完整"/><Stat label="待确认" value="5" note="商品、价格或配送待确认"/></div>
        <div className="panel task-panel">
          <div className="panel-head"><div><b>需要处理</b><div className="tabs small-tabs">{['全部','待回访','需注意 3'].map(x=><button key={x} className={taskTab===x?'active':''} onClick={()=>setTaskTab(x)}>{x}</button>)}</div></div><span className="muted">{tasks.length} 项</span></div>
          <div className="task-list">{tasks.length===0?<div className="empty">当前没有需要处理的订单或聊天。</div>:tasks.map((t,i)=><button className={`task ${i===selected?'selected':''}`} key={`${t[1]}-${i}`} onClick={()=>setSelected(i)}>
            <span className="person-ball">{t[0]}</span><span className="task-contact"><b>{t[1]}</b><small>{i%2?'M202609180024':'草稿 #1028'}</small></span><span className="task-copy"><b>{t[2]}</b><small>{t[3]}</small><em>{i%2?'API 读取':'手动新建'}</em></span><TaskPill index={i} label={t[4]}/><span className="task-time">{i===0?'2 分钟前':i<3?'36 分钟前':i===5?'今天 16:00':'2 小时前'}</span><Button quiet onClick={()=>go('order')}>订单详情</Button>
          </button>)}</div>
        </div>
      </section>
      <aside className="phone-column">
        <div className="phone-title"><b>客户聊天</b><button onClick={()=>go('order')}>订单详情</button></div>
        <div className="mode-tabs">{(['人工','AI辅助','AI自动'] as const).map((x,i)=><button className={mode===x?'active':''} key={x} onClick={()=>setMode(x)}>{i===0?<UserRound size={16}/>:i===1?<Sparkles size={16}/>:<Bot size={16}/>} {x}</button>)}</div>
        <div className="mode-note"><span className="mode-state"><Hand size={12}/>由你接待 · 自动回复已暂停</span><button onClick={()=>notify('聊天预览保持固定，演示中不关闭')}>关闭 ×</button></div>
        {tasks.length?<Phone selected={Math.min(selected,tasks.length-1)} tasks={tasks}/>:<div className="phone phone-empty"><MessageCircle size={32}/><b>选择客户后显示聊天</b></div>}
      </aside>
    </div>
  </div>;
}

function Phone({selected=0,tasks=demoTasks}:{selected?:number;tasks?:string[][]}){
  const task=tasks[selected]||demoTasks[0];
  return <div className="phone"><div className="notch"></div><div className="phone-head"><small>14:32</small><div><span className="wa-avatar">{task[0]}</span><b>{task[1]}</b><small>{task[2].split(' · ')[0]} · 当前订单</small></div></div><div className="translate"><span>☑ 显示中文译文</span><span>译</span></div><div className="chat"><div className="day">今天 · 当前订单</div>{DEMO?<><Bubble>Hi, I would like two pieces of KY02. How much are they?<i>你好，我想买两件KY02。多少钱？</i></Bubble><Bubble out>KY02 is AED 75 each. Two pieces would be AED 150.<i>KY02每件75迪拉姆，两件共150迪拉姆。</i></Bubble><Bubble>Okay, please deliver them to Dubai.<i>好的，请送到迪拜。</i></Bubble></>:<div className="chat-empty">聊天记录会在 WhatsApp 连接并关联当前订单后显示。</div>}</div><div className="draft">{DEMO?'好的，可以的。KY02每件75迪拉姆，两件共150迪拉姆。确认后我再为你核对配送信息。':'在这里编写中文回复，确认后翻译并发送。'}</div><div className="composer">输入中文，翻译后预览… <span><Send size={16}/></span></div></div>;
}
function Bubble({children,out=false}:{children:React.ReactNode;out?:boolean}){return <div className={`bubble ${out?'out':''}`}>{children}</div>}
function Stat({label,value,note}:{label:string;value:string;note:string}){return <div className="stat"><span>{label}</span><b>{value}</b><small>{note}</small></div>}
function TaskPill({index,label}:{index:number;label:string}){const Icon=index%4===0?Clock3:index%4===1?AlertTriangle:index%4===2?ClipboardCheck:History;return <span className={`pill p${index%4}`}><Icon size={11}/>{label}</span>}

function Orders({go}:{go:(p:Page)=>void}){
  const [filter,setFilter]=useState(''); const [tab,setTab]=useState<'订单'|'聊单用户档案'|'回收站'>('订单'); const allRows=useOrders(); const rows=allRows.filter(x=>(x.phone+x.orderNo+x.name).includes(filter));
  return <div className="page"><PageHead title="订单管理" subtitle="导入、查找和管理订单，以及维护聊单用户档案。"><Button onClick={()=>{notify('已建立演示订单草稿');go('order')}}><Plus size={14}/>新增订单</Button><Button primary onClick={()=>notify('演示：订单文件已读取，等待人工核对')}><Upload size={14}/>导入订单</Button></PageHead>
    <div className="panel page-tabs">{(['订单','聊单用户档案','回收站'] as const).map((name,i)=><button key={name} className={tab===name?'active':''} onClick={()=>setTab(name)}>{name} <i>{[24,31,2][i]}</i></button>)}</div>
    {tab!=='订单'?<DemoArchive tab={tab} go={go}/>:<>
    <div className="panel orders-panel"><div className="toolbar"><label className="search"><Search size={15}/><input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="搜索订单编号或客户电话"/></label><Button>2026-09-01 至 2026-09-20</Button><Button>全部状态 <ChevronDown size={14}/></Button><Button>全部来源 <ChevronDown size={14}/></Button><span className="spacer"></span><span className="muted">共 {rows.length} 个订单</span><Button><Download size={14}/>导出</Button></div>
      <div className="table-scroll"><table className="orders-table"><thead><tr><th>下单日期</th><th>订单编号</th><th>客户</th><th>商品</th><th>金额</th><th>来源</th><th>状态</th><th>更新时间</th><th>操作</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td><b>{r.date}</b><small>{r.time}</small></td><td><b>{r.orderNo}</b></td><td><b>{r.phone}</b><small>{r.name}</small></td><td><b>{r.product}</b><small>{r.product==='尚未选择'?'资料不完整':'已选择商品'}</small></td><td><b>{r.amount}</b></td><td>{r.source}</td><td><Status value={r.status}/></td><td><b>{r.updated.split(' ')[0]}</b><small>{r.updated.split(' ')[1]||''}</small></td><td><button className="text-link" onClick={()=>go('order')}>{r.status==='草稿'?'继续填写':r.status==='已作废'?'查看记录':'订单详情'}</button><button className="more" onClick={()=>notify("更多操作已展开")}><MoreHorizontal size={15}/></button></td></tr>)}</tbody></table>{rows.length===0&&<div className="empty">还没有订单。可从右上角新增或导入。</div>}</div>
    </div></>}
  </div>;
}

function DemoArchive({tab,go}:{tab:'聊单用户档案'|'回收站';go:(p:Page)=>void}){const users=demoOrders.slice(0,4);return <div className="panel orders-panel"><div className="toolbar"><label className="search"><Search size={15}/><input placeholder={tab==='回收站'?'搜索已删除或作废订单':'搜索客户电话或姓名'}/></label><span className="spacer"></span><span className="muted">{tab==='回收站'?'自动清理前可恢复':'按最近沟通时间排序'}</span></div><div className="archive-list">{users.map((row,i)=><div className="archive-row" key={row.id}><span className="person-ball">{row.name.slice(0,1)}</span><span><b>{row.phone}</b><small>{row.name} · {i+1} 个关联订单</small></span><span>{tab==='回收站'?row.orderNo:row.updated}</span><Button onClick={()=>go(tab==='回收站'?'orders':'workbench')}>{tab==='回收站'?'恢复':'定位到工作台'}</Button><button className="more" onClick={()=>notify("更多操作已展开")}><MoreHorizontal size={15}/></button></div>)}</div></div>}

function Status({value}:{value:OrderRow['status']}){const Icon=value==='待确认'?Clock3:value==='运输中'?Truck:value==='已签收'?CircleCheckBig:value==='草稿'?FilePenLine:Ban;return <span className={`status s-${value}`}><Icon size={12}/>{value}</span>}

function Inventory({go}:{go:(p:Page)=>void}){
  const products=useProducts(); const [selected,setSelected]=useState(0); const p=products[selected]||products[0];
  return <div className="page inventory-page"><PageHead eyebrow="商品与库存" title="商品库存" subtitle="库存状态来自表格，用于聊单选品和订单发货判断。"><div className="button connected"><FileSpreadsheet size={16}/>库存表已连接 <span className="badge">2项</span><HelpButton text="库存表只读取成本价、建议售价和库存状态。"/></div><Button onClick={()=>notify('演示模式不会打开真实金山文档')}><ExternalLink size={15}/>打开来源库存表</Button><Button primary onClick={()=>notify('演示库存同步完成：2 项变化待查看')}><RefreshCw size={16}/>立即同步</Button></PageHead>
    <div className="stats inventory-stats"><Stat label="全部商品" value={String(products.length)} note="当前商品档案"/><Stat label="有货" value={String(products.filter(x=>x.inStock).length)} note="聊单时可以推荐"/><Stat label="无货" value={String(products.filter(x=>!x.inStock).length)} note="订单暂不能发货"/></div>
    <div className="inventory-grid"><div className="panel products"><div className="toolbar"><label className="search"><Search size={16}/><input placeholder="搜索商品名称"/></label><Button>全部状态 <ChevronDown size={14}/></Button></div><div className="list-note">共 {products.length} 个商品 · 库存来自表格</div><div className="product-head"><span>商品</span><span>售价</span><span>库存状态</span></div><div className="product-list">{products.map((x,i)=><button className={i===selected?'selected':''} key={x.id} onClick={()=>setSelected(i)}><span className="product-main"><i style={{background:x.color}}></i><b>{x.name}</b>{i===0||i===2?<small>● 刚更新</small>:null}</span><b>{x.price?`AED ${x.price.toFixed(2)}`:'待设置'}</b><Stock value={x.inStock}/></button>)}{products.length===0&&<div className="empty">同步库存表后显示商品。</div>}</div></div>
      {p?<aside className="panel overview"><div className="panel-head"><b>商品概览 <HelpButton text="概览信息可人工维护；库存来源保持只读。"/></b><Button className="overview-edit" onClick={()=>notify('已进入商品概览编辑状态')}><Pencil size={14}/>编辑</Button></div><div className="product-photo" style={{background:p.color}}><Image size={34}/></div><h2>{p.name}</h2><Stock value={p.inStock}/><div className="overview-values"><Info label="成本价（AED）" value={p.cost.toFixed(2)}/><Info label="建议售价（AED）" value={p.suggested.toFixed(2)}/><Info label="售价（AED）" value={p.price.toFixed(2)}/><Info label="库存" value={p.inStock?'有货':'无货'}/></div>{!p.inStock&&<div className="warning"><XCircle size={20}/><div><b>无货 · 暂不能发货</b><small>聊单不主动推荐，相关订单会显示缺货提示。</small></div></div>}<Button primary className="full" onClick={()=>go('product')}>进入产品详情页 <ExternalLink size={15}/></Button></aside>:<aside className="panel overview empty">同步库存表后，在这里查看商品概览。</aside>}
    </div>
  </div>;
}
function Stock({value}:{value:boolean}){return <span className={`stock ${value?'yes':'no'}`}>{value?<CircleCheckBig size={14}/>:<XCircle size={14}/>} {value?'有货':'无货'}</span>}
function Info({label,value}:{label:string;value:string}){return <div className="info"><small>{label}</small><b>{value}</b></div>}

function Profit({go}:{go:(p:Page)=>void}){
  const profit=useProfit();
  return <div className="page profit-page"><PageHead title="利润核算" subtitle="人民币作为最终核算币种；美元投流按日期汇率折算，AED 支出统一按固定汇率 1.80 折算。"><Button onClick={()=>notify('已保持近 7 天范围')}>近 7 天 <ChevronDown size={14}/></Button><Button onClick={()=>notify('演示：利润核算表已准备导出')}><Download size={14}/>导出</Button></PageHead>
    <div className="profit-stats"><Money label="人民币实际回款" value={profit.summary.received} note="以实际收到的人民币为准"/><Money label="美元投流消耗" value={profit.summary.ad} note="按每天保存的汇率折算"/><Money label="真实成本合计" value={profit.summary.cost} note="含投流、账号购买和运费"/><Money label="人民币真实收益" value={profit.summary.profit} note="订单与汇率变化后自动重算" green/></div>
    <div className="profit-top"><div className="panel chart-card"><div className="panel-head"><b><ChartNoAxesCombined size={16}/>近 7 天真实收益</b><span className="muted">单位：人民币</span></div><div className="chart">{[74,48,58,31,72,52,48].map((v,i)=><div key={i}><i style={{height:`${v}px`}}></i><small>09-{14+i}</small></div>)}</div><div className="chart-notes"><Info label="本期运费支出" value="AED 701"/><Info label="账号购买" value="¥620"/><Info label="已回款订单" value="34 单"/><Info label="拒收 / 待回款" value="6 / 4 单"/></div></div>
      <div className="panel cost-card"><div className="panel-head"><b><CalendarPlus size={16}/>每日成本与汇率</b><HelpButton text="人民币是最终核算币种；美元按所选日期汇率折算，AED 运费固定按 1.80 折算。"/></div><div className="form-grid"><Field label="日期" value="09/20/2026"/><Field label="有效订单数" value="8"/><Field label="投流消耗（USD）" value="260"/><Field label="USD → CNY" value="7.10"/><Field label="账号购买（CNY）" value="0"/><Field label="AED → CNY（固定）" value="1.80"/></div><div className="cost-result"><span>当天公共成本<small>平均公共成本 / 有效单</small></span><b>¥1,846.00<small>¥230.75</small></b></div><Button primary className="full" onClick={()=>notify('当天成本与美元汇率已保存，收益已重新计算')}><Save size={14}/>保存当天成本与美元汇率</Button></div>
    </div>
    <div className="panel profit-table"><div className="panel-head"><b><CalendarRange size={16}/>每日核算明细</b><span className="auto">● 订单回款后自动重算</span><Button>全部日期 <ChevronDown size={13}/></Button></div><table><thead><tr><th>日期</th><th>实际回款（CNY）</th><th>投流消耗（USD）</th><th>账号购买（CNY）</th><th>运费支出 <HelpButton text="同一订单的签收运输支出与拒收运费损失二选一。"/></th><th>真实成本（CNY）</th><th>真实收益（CNY）</th><th>操作</th></tr></thead><tbody>{profit.rows.map(r=><tr key={r.day}><td>{r.day}</td><td><b>{r.received}</b></td><td><b>{r.ad}</b><small>{r.adCny}</small></td><td><b>{r.account}</b></td><td><b>{r.shipping}</b><small>{r.shippingCny}</small></td><td><b>{r.cost}</b></td><td className="green"><b>{r.profit}</b></td><td><button className="text-link" onClick={()=>go('profit-detail')}>查看详情</button></td></tr>)}</tbody></table>{profit.rows.length===0&&<div className="empty">保存每日成本并登记回款后显示核算明细。</div>}</div>
  </div>;
}
function Money({label,value,note,green=false}:{label:string;value:string;note:string;green?:boolean}){return <div className="money"><span>{label}</span><b className={green?'green':''}>{value}</b><small>{note}</small></div>}
function Field({label,value}:{label:string;value:string}){return <label className="field"><span>{label}</span><input value={value} readOnly/></label>}

function Assistant(){
  const [tab,setTab]=useState<'回复能力'|'暂停规则'|'资料与记录'>('回复能力');
  const pauseRules=[['价格缺失或冲突','网站实际售价无法读取，或与订单价格不一致。'],['库存未知','库存同步失败、状态缺失或无法确定有货。'],['地址无法配送','地址不完整、异常或无法判断配送范围。'],['优惠与特殊条件','客户要求优惠、改价、批发价或其他特殊条款。'],['售后或拒绝交易','投诉、取消、退款、拒收等需要人工判断。'],['电话号码不一致','客户提供的号码与当前 WhatsApp 会话号码不同。'],['客户要求人工','客户明确提出需要人工客服或人工确认。']];
  return <div className="page"><PageHead title="助手配置" subtitle="查看 AI 可以处理的内容、暂停条件与资料安全规则。"><span className="service-ok"><CheckCircle2 size={13}/>AI 服务连接正常</span></PageHead>
    <div className="panel page-tabs">{(['回复能力','暂停规则','资料与记录'] as const).map(x=><button key={x} className={tab===x?'active':''} onClick={()=>setTab(x)}>{x}</button>)}</div>
    {tab==='回复能力'&&<><div className="panel assistant-block"><div className="panel-head"><div><b><MessagesSquare size={16}/>工作台回复模式</b><small>每个客户会话可单独选择，不设置统一默认模式</small></div></div><div className="mode-cards"><div><UserRound/><b>人工</b><small>由你编写并发送消息，AI 不参与回复。</small></div><div><Sparkles/><b>AI 辅助</b><small>AI 提供翻译和回复建议，由你确认发送。</small></div><div className="active"><Bot/><b>AI 自动</b><small>只在已确认范围内自动回复，出现风险立即暂停。</small></div></div></div><div className="panel assistant-block"><div className="panel-head"><div><b><ShieldCheck size={16}/>AI 自动回复范围</b><small>AI 只能执行左侧能力，右侧内容必须转人工</small></div></div><div className="rule-columns"><div className="allow"><b>允许自动处理</b><p>客户表达购买意向并明确商品后，根据网站实际售价主动报价。</p><p>向客户收集姓名、电话号码和详细配送地址。</p><p>客户询问库存时，只回答“有货”或“无货”，不透露数量。</p><p>确认无货时明确说明暂时无法发货，并暂停后续自动处理。</p></div><div className="deny"><b>必须转人工</b><p>优惠、批发价、改价或继续议价。</p><p>商品推荐、替代商品和最终订单确认。</p><p>向客户发送发货、签收或回款状态。</p><p>未设置规则的任何自动化操作。</p></div></div></div><div className="two-panels"><RuleCard title="报价规则" rows={['价格来源｜只使用网站实际售价，不使用建议售价','主动报价｜商品明确后可报价；数量明确时同时报总价','自动优惠｜具体规则尚未设计，当前全部转人工']}/><RuleCard title="库存回复规则" rows={['客户未询问库存｜不主动提库存，按有货正常沟通','客户询问库存｜只回答有货或无货，不发送库存数量','库存数据异常｜停止自动回复并加入需要处理']}/></div></>}
    {tab==='暂停规则'&&<><div className="panel pause-card"><div className="panel-head"><div><b><Ban size={16}/>触发后立即暂停 AI</b><small>暂停后不再自动回复，当前会话加入“需要处理”</small></div><HelpButton text="每条规则独立判断；人工处理完成后，才可重新开启 AI。"/></div><div className="pause-grid">{pauseRules.map((x,i)=><div key={x[0]}><span>{i+1}</span><b>{x[0]}</b><small>{x[1]}</small></div>)}</div></div><div className="panel flow-card"><div className="panel-head"><b><History size={16}/>暂停后的处理流程</b></div><div className="pause-flow"><FlowStep icon={Ban} title="暂停发送" text="不再自动回复客户"/><i>→</i><FlowStep icon={UserRound} title="切换人工" text="当前会话进入人工模式"/><i>→</i><FlowStep icon={Archive} title="加入需要处理" text="显示原因并发送内部提醒"/><i>→</i><FlowStep icon={CheckCircle2} title="人工恢复" text="处理完成后手动开启 AI"/></div></div></>}
    {tab==='资料与记录'&&<div className="two-panels record-panels"><RuleCard title="AI 可以读取" rows={['聊天上下文｜用于翻译、提取资料和生成回复建议','商品与库存｜只读取已确认商品信息和有货 / 无货状态','订单状态｜仅供内部判断，禁止主动发送给客户']}/><RuleCard title="保留与清理" rows={['聊天摘要｜随聊单用户档案保存，手动删除','AI 详细记录｜保留 90 天后自动清理','媒体缓存｜保留 45 天；订单正式附件不自动清理']}/></div>}
  </div>
}
function FlowStep({icon:Icon,title,text}:{icon:React.ComponentType<{size?:number}>;title:string;text:string}){return <div><Icon size={17}/><b>{title}</b><small>{text}</small></div>}
function RuleCard({title,rows}:{title:string;rows:string[]}){return <div className="panel rule-card"><div className="panel-head"><b>{title}</b></div>{rows.map((x,i)=>{const [a,b]=x.split('｜');return <div className="rule" key={a}><div><b>{a}</b><small>{b}</small></div><span>{i===2?'未启用':'固定规则'}</span></div>})}</div>}

function SettingsPage(){
  const [tab,setTab]=useState<'连接服务'|'业务与同步'|'通知'|'数据与存储'>('连接服务'); const [qr,setQr]=useState(false);
  return <div className="page"><PageHead title="连接与设置" subtitle="管理本机使用的外部连接、业务规则和数据。"><span className="standalone"><ShieldCheck size={13}/>独立使用模式</span></PageHead>
    <div className="panel page-tabs">{(['连接服务','业务与同步','通知','数据与存储'] as const).map(x=><button key={x} className={tab===x?'active':''} onClick={()=>setTab(x)}>{x}</button>)}</div>
    {tab==='连接服务'&&<><div className="panel settings-card ai"><div className="panel-head"><div><b><Bot size={16}/>AI 模型服务</b><small>翻译、信息提取与辅助回复共用一个默认连接</small></div><span className="status connected"><CircleCheckBig size={12}/>{DEMO?'已连接':'本机配置'}</span></div><div className="settings-grid four"><Field label="服务商" value={DEMO?'OpenAI':'请读取本机设置'}/><Field label="API 地址" value={DEMO?'https://api.openai.com/v1':'在此设置服务地址'}/><Field label="API Key" value={DEMO?'••••••••••••••••••':'由系统安全存储'}/><Field label="模型" value={DEMO?'gpt-5-mini':'待设置'}/></div><p className="hint">API Key 保存在本机安全存储。连接异常时暂停 AI 操作，恢复后仍需手动重新开启。</p><div className="card-actions"><Button onClick={()=>notify('AI 模型连接测试成功')}>测试连接</Button><Button primary onClick={()=>notify('AI 设置已保存')}>保存 AI 设置</Button></div></div><div className="settings-pair"><div className="panel settings-card"><div className="panel-head"><div><b><MessageCircle size={16}/>WhatsApp</b><small>一套软件同时连接一个账号</small></div><span className="status connected"><CircleCheckBig size={12}/>{DEMO?'已连接':'等待检测'}</span></div><div className="whatsapp-user"><span>{DEMO?'A':'W'}</span><div><b>{DEMO?'+971 50 000 0002':'连接后显示账号'}</b><small>{DEMO?'Avery WhatsApp Business':'本机 WhatsApp 会话'}</small></div><em>● {DEMO?'当前在线':'等待连接'}</em></div><div className="settings-grid"><Info label="登录方式" value="手机扫码登录"/><Info label="最近在线" value={DEMO?'刚刚':'—'}/></div><div className="card-actions"><Button onClick={()=>notify('WhatsApp 连接正常')}>检测连接</Button><Button primary onClick={()=>setQr(true)}>管理登录</Button></div></div><div className="panel settings-card"><div className="panel-head"><div><b><FileSpreadsheet size={16}/>库存表</b><small>金山文档在线表格 · Sheet1</small></div><span className="status connected"><CircleCheckBig size={12}/>{DEMO?'已连接':'本机连接'}</span></div><div className="mapping"><Info label="D 列" value="成本价"/><Info label="E 列" value="建议售价"/><Info label="F 列" value="库存状态"/></div><p className="hint">商品名称、图片和网站实际售价不读取库存表；库存状态保持只读。</p><div className="card-actions"><Button onClick={()=>notify('库存表读取成功')}>测试读取</Button><Button onClick={()=>notify('演示模式不会更换真实表格')}>更换表格</Button></div></div></div></>}
    {tab==='业务与同步'&&<div className="settings-pair tab-content"><SettingList title="订单规则" icon={ShoppingBag} items={['新增订单必须人工确认后才进入待发货','删除订单先进入回收站，可手动恢复','签收、回款和物流状态目前由人工修改']}/><SettingList title="同步规则" icon={RefreshCw} items={['库存表只读，系统不可反向覆盖供应商文件','商品名称以本机商品档案为准','未来接入网站 API 后先校验，不自动覆盖人工资料']}/></div>}
    {tab==='通知'&&<div className="settings-pair tab-content"><SettingList title="内部通知" icon={AlertTriangle} items={['库存从有货变为无货时提醒','库存从无货恢复为有货时提醒','AI 暂停、连接异常和资料冲突时提醒']}/><SettingList title="客户消息边界" icon={ShieldCheck} items={['不主动发送已发货、已签收、已回款状态','库存只有客户询问时才回答','无货时明确说明暂时无法发货']}/></div>}
    {tab==='数据与存储'&&<div className="settings-pair lower tab-content"><div className="panel settings-card"><div className="panel-head"><div><b><Archive size={16}/>备份与恢复</b><small>每日自动备份，保留 30 天</small></div><span className="status connected">正常</span></div><div className="settings-grid"><Info label="最近备份" value={DEMO?'今天 10:00':'启动时检查'}/><Info label="备份位置" value={DEMO?'已选择本机文件夹':'本机资料目录'}/></div><p className="hint">不包含 API Key、WhatsApp 登录凭证和可重建媒体缓存。</p><div className="card-actions"><Button onClick={()=>notify('已打开演示恢复点')}>恢复备份</Button><Button primary onClick={()=>notify('本机数据已完成演示备份')}>立即备份</Button></div></div><div className="panel settings-card"><div className="panel-head"><div><b><Trash2 size={16}/>自动清理</b><small>到期后由系统自动执行</small></div><HelpButton text="高价值操作记录长期保留；保存到订单的图片和文件不会自动清理。"/></div><div className="mapping"><Info label="媒体缓存" value="45 天"/><Info label="AI 详细记录" value="90 天"/><Info label="技术错误日志" value="30 天"/></div><div className="card-actions"><Button onClick={()=>notify('可删除缓存已清理')}>清理可删除缓存</Button><Button onClick={()=>notify('演示数据已恢复到初始状态')}><RotateCcw size={14}/>重置演示数据</Button></div></div></div>}
    {qr&&<div className="modal-backdrop" onClick={()=>setQr(false)}><div className="qr-modal" onClick={e=>e.stopPropagation()}><button className="modal-close" onClick={()=>setQr(false)}><X size={17}/></button><QrCode size={120}/><h2>扫码登录 WhatsApp</h2><p>用手机 WhatsApp 扫描二维码。登录凭证仅保存在本机。</p><Button primary onClick={()=>{setQr(false);notify('演示账号已连接')}}>我已完成扫码</Button></div></div>}
  </div>
}
function SettingList({title,icon:Icon,items}:{title:string;icon:React.ComponentType<{size?:number}>;items:string[]}){return <div className="panel settings-card setting-list"><div className="panel-head"><b><Icon size={16}/>{title}</b><Button onClick={()=>notify(`${title}已保存`)}><Save size={13}/>保存</Button></div>{items.map(x=><label key={x}><span className="toggle on"></span><span>{x}</span><HelpButton text="该规则只影响本机独立使用模式，可随时人工调整。"/></label>)}</div>}

function ProductDetail({go}:{go:(p:Page)=>void}){
  const [editing,setEditing]=useState(false);const [thumb,setThumb]=useState(0);
  return <div className="page detail-page product-detail-page"><div className="detail-crumb">商品库存 <span>›</span> 产品详情</div><PageHead title="KY02" subtitle="管理商品图片、价格与聊单展示信息"><Button onClick={()=>go('inventory')}><ArrowLeft size={14}/>返回库存</Button><Button primary onClick={()=>{setEditing(!editing);notify(editing?'商品资料已保存':'已进入编辑状态')}}>{editing?<Save size={14}/>:<Pencil size={14}/>} {editing?'保存资料':'编辑资料'}</Button></PageHead>
    <div className="product-detail-grid"><div className="product-left-stack"><section className="panel gallery"><div className="panel-head"><b><Images size={16}/>商品图片</b><span className="muted">主图 {thumb+1} / 3</span></div><div className="main-image"><PackageOpen size={52}/></div><div className="thumbs">{[PackageOpen,Box,Package].map((Icon,i)=><button key={i} aria-label={`查看第${i+1}张图片`} className={thumb===i?'active':''} onClick={()=>setThumb(i)}><Icon/></button>)}<button aria-label="添加图片" onClick={()=>notify('已打开演示图片选择器')}><Plus/></button></div><p className="gallery-note">正方形素材完整显示；第一张图片作为聊单主图。</p><Button onClick={()=>notify('已模拟导入 6 张图片，并完成手机尺寸压缩')}><Upload size={14}/>批量导入图片</Button></section><section className="panel product-meta"><p><span>商品编号</span><b>系统自动维护 · P-0001</b></p><p><span>最后修改</span><b>今天 10:26</b></p><p><span>数据模式</span><b>本机独立使用</b></p></section></div>
      <div className="product-right-stack"><section className="panel product-record"><div className="record-head"><div><h2>产品资料</h2><p>名称、图片和网站实际售价由系统资料维护</p></div><Stock value={false}/></div><div className="product-form-grid"><ProductField label="商品名称" source="系统资料" value="KY02" editing={editing}/><ProductField label="商品分类" source="系统资料" value="标准款" editing={editing}/><ProductField label="成本价（AED）" source="库存表 D 列" value="42.00"/><ProductField label="建议售价（AED）" source="库存表 E 列" value="78.00"/><ProductField label="实际售价（AED）" source="网站售价" value="75.00" editing={editing}/><ProductField label="库存状态" source="库存表 F 列" value="无货"/><label className="product-field wide"><span>聊单商品说明 <small>人工与 AI 均可查看</small></span><textarea readOnly={!editing} value="标准款产品。聊天中展示主图、实际售价和简要说明；库存无货时不主动推荐。" onChange={()=>{}}/></label></div></section>
        <section className="panel product-source"><div className="panel-head"><b><Database size={16}/>价格与库存来源</b><span className="muted">最近同步：今天 10:20</span></div><div className="source-grid"><SourceInfo label="成本价" value="AED 42.00" note="库存表 D 列 · 自动同步"/><SourceInfo label="建议售价" value="AED 78.00" note="库存表 E 列 · 自动同步"/><SourceInfo label="库存状态" value="无货" note="库存表 F 列 · 只读" danger/></div></section>
        <section className="panel product-availability"><div><MessageCircleX size={19}/><span><b>聊单中暂不可用</b><small>无货商品不主动推荐，关联订单暂不能完成配送核对或生成订单 TXT。</small></span></div><HelpButton text="库存状态来自供应商表格。无货时系统自动阻止发货，不能人工覆盖。"/></section>
      </div></div></div>
}
function ProductField({label,source,value,editing=false}:{label:string;source:string;value:string;editing?:boolean}){return <label className="product-field"><span>{label}<small>{source}</small></span><input value={value} readOnly={!editing} onChange={()=>{}}/></label>}
function SourceInfo({label,value,note,danger=false}:{label:string;value:string;note:string;danger?:boolean}){return <div className={`source-info ${danger?'danger':''}`}><span>{label}</span><b>{value}</b><small>{note}</small></div>}

function OrderDetail({go}:{go:(p:Page)=>void}){const [allDone,setAllDone]=useState(false);const [status,setStatus]=useState('待确认');const statuses=['待确认','待报单','待收货','拒单','联系不上'];return <div className="page detail-page order-detail-page"><PageHead title="M202609200031" subtitle="订单详情 · 草稿 #1028"><Button onClick={()=>go('orders')}><ArrowLeft size={14}/>返回</Button><Button onClick={()=>notify('订单草稿已保存')}><Save size={14}/>保存草稿</Button></PageHead><div className="order-status-toolbar"><span>订单状态</span>{statuses.map(x=><button key={x} className={status===x?'active':''} onClick={()=>{setStatus(x);notify(`订单状态已改为${x}`)}}>{x}</button>)}<HelpButton text="订单状态只供内部管理，不会自动发送给客户。"/></div><div className="order-detail-grid"><div className="order-sections"><section className="panel order-stage"><div className="stage-head"><span>当前订单 <b>草稿 #1028</b></span><em>待客户确认</em></div><div className="stage-flow"><Stage done label="明确商品与数量"/><i>→</i><Stage done label="收齐收货资料"/><i>→</i><Stage current label="核对配送范围"/><i>→</i><Stage label="客户确认订单"/></div><p>当前目标：<b>核对地址是否可配送，再让客户确认商品、价格和收货信息。</b></p></section><Section title="客户信息" icon={UserRound} done forceClosed={allDone}><div className="record-grid three"><Info label="联系电话" value="+971 50 000 0002"/><Info label="客户姓名" value="Avery Example"/><Info label="国家 / 城市" value="阿联酋 · 迪拜"/></div></Section><Section title="商品与金额" icon={ShoppingBag} forceClosed={allDone}><div className="warning compact"><XCircle size={18}/><div><b>KY02 当前无货，暂不能发货</b><small>库存恢复前不可进入待发货。</small></div></div><div className="order-product"><div className="mini-photo"><Box/></div><b>KY02</b><span>数量 2</span><span>单价 AED 75</span><b>AED 150</b></div><div className="total"><span>订单总金额</span><b>AED 150.00</b></div><Button onClick={()=>notify('已打开演示选品列表')}><Plus size={14}/>增加商品</Button></Section><Section title="配送核对" icon={MapPinned} forceClosed={allDone}><div className="delivery"><div className="map"><MapPin size={28}/><b>配送范围内</b><small>Dubai, United Arab Emirates</small></div><div><Info label="中文地址" value="阿联酋 · 迪拜"/><Info label="详细地址" value="Villa 18, Al Barsha, Dubai"/><Button onClick={()=>notify('演示：将使用客户地址打开地图搜索结果')}>查看完整地址 <ExternalLink size={14}/></Button></div></div><div className="section-actions"><Button primary onClick={()=>notify('配送信息已核对')}>完成配送核对</Button></div></Section><Section title="签收与回款" icon={WalletCards} forceClosed={allDone}><div className="record-grid three"><Info label="物流状态" value="已签收"/><Info label="实际运输支出" value="AED 12.00"/><Info label="实际回款" value="¥270.00"/></div><div className="section-actions"><Button onClick={()=>notify('物流状态已修改')}>修改状态</Button><Button primary onClick={()=>notify('签收与回款信息已保存')}>保存记录</Button></div></Section><div className="order-finish"><Button primary onClick={()=>{setAllDone(true);notify('订单核对已完成，各卡片已自动折叠')}}><Check size={14}/>完成订单核对</Button></div></div><aside className="sticky-phone"><div className="phone-title"><b>客户聊天</b><HelpButton text="聊天窗口固定在右侧；滚动左侧订单卡片时保持可见。"/></div><div className="mode-tabs"><button className="active" onClick={()=>notify("已切换为人工模式")}><UserRound size={15}/>人工</button><button onClick={()=>notify("已切换为 AI 辅助模式")}><Sparkles size={15}/>AI辅助</button><button onClick={()=>notify("已切换为 AI 自动模式")}><Bot size={15}/>AI自动</button></div><div className="mode-note"><span className="mode-state"><Hand size={12}/>由你接待 · 自动回复已暂停</span></div><Phone/></aside></div></div>}
function Stage({label,done=false,current=false}:{label:string;done?:boolean;current?:boolean}){return <span className={`stage ${done?'done':''} ${current?'current':''}`}><i>{done?<Check size={11}/>:current?'3':'4'}</i>{label}</span>}
function Section({title,done=false,forceClosed=false,icon:Icon=Archive,children}:{title:string;done?:boolean;forceClosed?:boolean;icon?:React.ComponentType<{size?:number}>;children:React.ReactNode}){const [open,setOpen]=useState(!done);useEffect(()=>{if(forceClosed)setOpen(false)},[forceClosed]);return <section className={`panel order-section ${!open?'collapsed':''}`}><button className="section-toggle" onClick={()=>setOpen(!open)}><span>{done?<CheckCircle2 size={17}/>:<Icon size={17}/>}<b>{title}</b>{(done||forceClosed)&&<em>已完成</em>}</span><ChevronDown className={open?'open':''} size={17}/></button>{open&&<div className="section-body">{children}</div>}</section>}

function ProfitDetail({go}:{go:(p:Page)=>void}){const revenues=[300,0,480,600,0,520],freight=[12,20,18,22,15,16],contribution=[278,-36,448,560,-27,491];return <div className="page detail-page"><PageHead title="每日利润详情" subtitle="8 个订单 · 已回款 5 单 · 拒收 2 单 · 待回款 1 单"><Button><CalendarDays size={14}/>2026-09-20</Button><Button onClick={()=>go('profit')}>返回核算</Button><Button primary onClick={()=>notify('当天利润明细已准备导出')}><Download size={14}/>导出</Button></PageHead><div className="detail-summary"><Money label="人民币实际回款" value="¥2,380" note="已到账人民币"/><Money label="真实成本合计" value="¥2,053" note="公共成本与固定汇率运费"/><Money label="人民币真实收益" value="¥327" note="回款减真实成本" green/><Money label="真实收益率" value="13.7%" note="以实际回款计算"/></div><div className="two-panels detail-costs"><div className="panel"><div className="panel-head"><b>当天公共成本</b><span className="muted">按日期记录</span><HelpButton text="投流消耗按当天美元汇率折算；账号成本只记在购买当天。"/></div><div className="record-grid three"><Info label="投流消耗（USD）" value="$260　≈ ¥1,846"/><Info label="账号购买" value="¥0　当天没有购买"/><Info label="平均公共成本 / 有效单" value="¥230.75　仅作参考"/></div></div><div className="panel"><div className="panel-head"><b>当天收益核算</b><span className="muted">人民币核算</span><HelpButton text="同一订单的签收运输支出与拒收运费损失二选一，AED 固定按 1.80 折算。"/></div><div className="record-grid three"><Info label="实际回款" value="¥2,380"/><Info label="真实成本合计" value="¥2,053"/><Info label="当天真实收益" value="¥327"/></div></div></div><div className="panel profit-table order-profit"><div className="panel-head"><b>当天订单核算</b><span className="muted">全部订单状态　　全部回款状态</span></div><table><thead><tr><th>订单</th><th>客户</th><th>订单金额（AED）</th><th>订单状态</th><th>实际回款（CNY）</th><th>运费支出</th><th>订单收益贡献（CNY）</th><th>操作</th></tr></thead><tbody>{demoOrders.slice(0,6).map((r,i)=><tr key={r.id}><td><b>{r.orderNo}</b></td><td>{r.name}</td><td>AED {[150,120,240,300,90,260][i]}</td><td><span className={`status ${i===1||i===4?'s-已作废':'s-已签收'}`}>{i===1||i===4?'已拒收':'已签收'}</span></td><td><b>¥{revenues[i]}</b></td><td><b>AED {freight[i]}</b><small>≈ ¥{Math.round(freight[i]*1.8)}</small></td><td className={contribution[i]<0?'red':'green'}><b>{contribution[i]<0?'− ':''}¥{Math.abs(contribution[i])}</b></td><td><button className="text-link" onClick={()=>notify(`已打开 ${r.orderNo} 的订单详情`)}>订单详情</button></td></tr>)}</tbody></table></div></div>}

createRoot(document.getElementById('root')!).render(<StrictMode><Shell/></StrictMode>);
