type Response<T>={ok:boolean;data?:T;error?:{message?:string}};
type OrderRow={id:string;orderNo:string;sequence:number;source:string;workflowStatus:string;trackingStatus:string;customerName:string;phone:string;createdAt:string;updatedAt:string;amountFils:number|null;products:{code:string;quantity:number}[];itemCount:number;needsReview:boolean};
type PreviewItem={sourceRow:number;businessCode:string|null;productName:string;quantity:number;costFils:number|null;needsReview:boolean};
type PreviewOrder={orderNo:string|null;phoneMasked:string;items:PreviewItem[];canImport:boolean;alreadyExists:boolean;needsReview:boolean;reviewConfirmed:boolean;warnings:{code:string}[];blockingErrors:{code:string}[];amountCheck?:{amountMismatch?:boolean;discountNeedsConfirmation?:boolean}};
type ImportPreview={token:string;filename:string;alreadyImportedFile:boolean;summary:{validOrders:number;directImportOrders:number;reviewOrders:number;blockedOrders:number;existingOrders:number;blockingErrors:number};orders:PreviewOrder[]};
type DraftItem={sku:string;quantity:number;price_fils:number|null;discount_fils:number|null};
type Detail={id:string;orderNo:string|null;sequence:number;source:string;entryState:string;draftRevision:number;trackingStatus:string;orderStatus:string;amounts:{orderTotal:number|null;customerShippingFee:number|null};customer:{fullName:string|null;firstName:string|null;lastName:string|null;phone:string|null;email:string|null;country:string|null;province:string|null;city:string|null;street:string|null;residence:string|null};draft?:{fields:Record<string,string|null>;items:DraftItem[]}|null;items:{businessCode:string;productName:string;quantity:number;unitActualPriceFils:number|null;costFils:number|null;lineRevenueFils:number|null}[];packages:{seriesCode:string;status:string;shippingFeeFils:number|null}[]};

const money=(fils:number|null|undefined)=>fils===null||fils===undefined?'待核对':`AED ${(fils/100).toFixed(2)}`;
const plain=(value:unknown)=>String(value??'').trim()||'—';
const input=(doc:Document,label:string,value='')=>{const wrap=doc.createElement('label');wrap.className='ob-field';const name=doc.createElement('span');name.textContent=label;const box=doc.createElement('input');box.value=value;wrap.append(name,box);return {wrap,box};};
const button=(doc:Document,label:string,className='btn')=>{const element=doc.createElement('button');element.type='button';element.className=className;element.textContent=label;return element;};
const note=(doc:Document,message:string)=>{const item=doc.createElement('p');item.className='ob-note';item.textContent=message;return item;};
const section=(doc:Document,title:string)=>{const item=doc.createElement('section');item.className='od-card ob-card';const head=doc.createElement('h2');head.className='od-card-title';head.textContent=title;item.append(head);return item;};
function workbenchStatus(row:OrderRow){
  if(row.workflowStatus==='draft')return {label:'草稿',className:'cw-info',icon:'file-pen-line'};
  if(row.workflowStatus==='pending')return {label:'待确认',className:'cw-confirm',icon:'clipboard-check'};
  const states:Record<string,{label:string;className:string;icon:string}>={
    unshipped:{label:'待发货',className:'cw-confirm',icon:'package'},
    awaiting_report:{label:'待报单',className:'cw-info',icon:'clipboard-list'},
    outbound_processing:{label:'出库中',className:'cw-confirm',icon:'package-check'},
    shipped_pending:{label:'运输中',className:'cw-follow',icon:'truck'},
    signed:{label:'已签收',className:'cw-follow',icon:'badge-check'},
    refused:{label:'已拒收',className:'cw-info',icon:'circle-alert'},
    unreachable:{label:'联系不上',className:'cw-info',icon:'phone-off'},
    cancelled_before_outbound:{label:'已取消',className:'cw-info',icon:'circle-x'},
    cancelled_after_outbound:{label:'已取消',className:'cw-info',icon:'circle-x'}
  };
  return states[row.trackingStatus]||{label:'状态待核对',className:'cw-info',icon:'circle-help'};
}
async function call<T>(name:string,...args:unknown[]):Promise<T>{
  const method=window.inventoryApp?.orders?.[name];if(!method)throw new Error('订单服务尚未就绪，请从桌面 App 重新打开');
  const result=await method(...args) as Response<T>;
  if(!result.ok)throw new Error(result.error?.message||'订单操作失败');
  return result.data as T;
}

export function installWorkbenchOrders(doc:Document,{selectOrder,selectedOrderId}:{selectOrder:(id:string)=>void;selectedOrderId?:string|null}):()=>void{
  const root=doc.querySelector<HTMLElement>('#chat-workbench-aligned')!,list=root.querySelector<HTMLElement>('#cw-task-list')!,count=root.querySelector<HTMLElement>('#cw-result-count')!;
  const title=root.querySelector<HTMLElement>('#cw-queue-title');if(title)title.textContent='近期订单';
  let closed=false,filter='all',rows:OrderRow[]=[],selectedId=selectedOrderId||'';
  const render=()=>{
    if(closed)return;
    for(const [kind,predicate,label] of [
      ['info',(row:OrderRow)=>row.workflowStatus==='draft','待补资料'],
      ['confirm',(row:OrderRow)=>row.workflowStatus==='pending','待确认']
    ] as const){const stat=root.querySelector<HTMLElement>(`.cw-stat[data-filter="${kind}"]`);if(!stat)continue;const amount=rows.filter(predicate).length;stat.querySelector<HTMLElement>('.cw-stat-value')!.textContent=String(amount);stat.querySelector<HTMLElement>('.cw-stat-note')!.textContent=amount?`${amount} 个真实订单`:`暂无${label}订单`;}
    const attention=root.querySelector<HTMLElement>('.cw-tab[data-filter="attention"]');if(attention){const label=doc.createElement('span'),badge=doc.createElement('span');label.textContent='需注意';badge.className='cw-attention-count';badge.textContent=String(rows.filter(row=>row.needsReview).length);attention.replaceChildren(label,badge);}
    const visible=rows.filter(row=>filter==='all'||filter==='info'&&row.workflowStatus==='draft'||filter==='confirm'&&row.workflowStatus==='pending'||filter==='attention'&&row.needsReview||filter==='follow'&&row.trackingStatus==='shipped_pending');
    count.textContent=`${visible.length} 项`;list.replaceChildren();
    if(!visible.length){const empty=doc.createElement('div');empty.className='cw-empty';empty.textContent=rows.length?'当前筛选没有订单':'暂无真实订单。可以导入 ShopPlus 文件，或新建空白订单。';list.append(empty);return;}
    for(const row of visible){const article=doc.createElement('article');article.className='cw-task-row';article.dataset.orderId=row.id;article.dataset.selected=String(row.id===selectedId);
      const main=button(doc,'','cw-row-main cursor-interaction');main.setAttribute('aria-label',`选择${row.orderNo}订单`);main.setAttribute('aria-pressed',String(row.id===selectedId));main.onclick=()=>{selectedId=row.id;selectOrder(row.id);for(const card of list.querySelectorAll<HTMLElement>('.cw-task-row')){const selected=card.dataset.orderId===row.id;card.dataset.selected=String(selected);card.querySelector<HTMLButtonElement>('.cw-row-main')?.setAttribute('aria-pressed',String(selected));}};
      const person=doc.createElement('span');person.className='cw-row-person';const avatar=doc.createElement('span');avatar.className='cw-avatar';avatar.textContent=row.customerName?.[0]||'?';const copy=doc.createElement('span');copy.className='cw-person-copy';const phoneLine=doc.createElement('span');phoneLine.className='cw-phone-line';const phone=doc.createElement('span');phone.className='cw-phone-number';phone.textContent=plain(row.phone);phoneLine.append(phone);const ref=doc.createElement('span');ref.className='cw-order-ref';ref.textContent=row.orderNo;copy.append(phoneLine,ref);person.append(avatar,copy);
      const message=doc.createElement('span');message.className='cw-row-message';const heading=doc.createElement('span');heading.className='cw-message-title';heading.textContent=row.customerName||'客户资料待补';const body=doc.createElement('span');body.className='cw-message-preview';body.textContent=row.products.length?row.products.map(p=>`${p.code} × ${p.quantity}`).join('，'):'商品待补';const source=doc.createElement('span'),sourceIcon=doc.createElement('i');source.className='cw-source';sourceIcon.dataset.lucide=row.source==='manual'?'pen-line':'file-up';source.append(sourceIcon,doc.createTextNode(row.source==='manual'?'手动新建':'ShopPlus 导入'));message.append(heading,body,source);
      const state=doc.createElement('span');state.className='cw-row-status';const status=workbenchStatus(row),badge=doc.createElement('span'),badgeIcon=doc.createElement('i');badge.className=`cw-status-pill ${status.className}`;badgeIcon.dataset.lucide=status.icon;badge.append(badgeIcon,doc.createTextNode(status.label));const time=doc.createElement('span');time.className='cw-status-time';time.textContent=plain(row.updatedAt).slice(0,16);state.append(badge,time);main.append(person,message,state);
      const actions=doc.createElement('span');actions.className='cw-row-actions';const detail=button(doc,'订单详情','cw-open cw-detail cursor-interaction');detail.dataset.openOrderDetail='';actions.append(detail);article.append(main,actions);list.append(article);
    }
    (doc.defaultView as (Window&{lucide?:{createIcons:(options:{nodes:Element[]})=>void}})|null)?.lucide?.createIcons({nodes:[list]});
  };
  const choose=(event:Event)=>{const target=(event.target as Element).closest<HTMLElement>('[data-filter]');if(!target||!root.contains(target))return;event.preventDefault();event.stopImmediatePropagation();filter=target.dataset.filter||'all';for(const tab of root.querySelectorAll<HTMLElement>('.cw-tab'))tab.setAttribute('aria-selected',String(tab.dataset.filter===filter));for(const stat of root.querySelectorAll<HTMLElement>('.cw-stat'))stat.setAttribute('aria-pressed',String(stat.dataset.filter===filter));render();};
  root.addEventListener('click',choose,true);
  void call<OrderRow[]>('list',{sort:'newest'}).then(value=>{rows=value;render();}).catch(error=>{if(!closed){list.replaceChildren(note(doc,(error as Error).message));count.textContent='读取失败';}});
  return ()=>{closed=true;root.removeEventListener('click',choose,true);};
}

export function installOrdersPage(doc:Document,{openOrder,initialAction}:{openOrder:(id:string)=>void;initialAction?:'import'|'new'}):()=>void{
  const root=doc.querySelector<HTMLElement>('#ui040')!,main=root.querySelector<HTMLElement>('.main')!,head=main.querySelector<HTMLElement>('.head')!;
  const connection=root.querySelector<HTMLElement>('.wa');if(connection){connection.textContent='○ WhatsApp · 订单聊天待核对';connection.style.color='#747080';}
  main.replaceChildren(head);
  root.querySelector('#u40-import-dialog')?.remove();root.querySelector('#u40-row-menu')?.remove();root.querySelector('#u40-popover')?.remove();
  const originalNew=head.querySelector<HTMLButtonElement>('#u40-new')!,originalImport=head.querySelector<HTMLButtonElement>('#u40-import')!;
  const create=originalNew.cloneNode(true) as HTMLButtonElement,importButton=originalImport.cloneNode(true) as HTMLButtonElement;
  originalNew.replaceWith(create);originalImport.replaceWith(importButton);
  const workspace=doc.createElement('section');workspace.className='ob-orders';
  workspace.innerHTML='<div class="ob-toolbar"><label>查找订单 <input class="ob-search" type="search" placeholder="订单编号、客户电话或商品编号"></label><label>订单状态 <select class="ob-status"><option value="all">全部</option><option value="draft">草稿</option><option value="unshipped">待发货</option><option value="shipped_pending">运输中</option><option value="signed">已签收</option></select></label><span class="ob-count" role="status">正在读取订单…</span></div><div class="table-wrap"><table><thead><tr><th>下单日期</th><th>订单编号</th><th>客户</th><th>商品</th><th>金额</th><th>来源</th><th>状态</th><th>操作</th></tr></thead><tbody class="ob-rows"></tbody></table></div><p class="ob-feedback" role="status" aria-live="polite"></p>';
  main.append(workspace);
  const search=workspace.querySelector<HTMLInputElement>('.ob-search')!,status=workspace.querySelector<HTMLSelectElement>('.ob-status')!,rows=workspace.querySelector<HTMLElement>('.ob-rows')!,count=workspace.querySelector<HTMLElement>('.ob-count')!,feedback=workspace.querySelector<HTMLElement>('.ob-feedback')!;
  let all:OrderRow[]=[],closed=false,preview:ImportPreview|undefined;
  const show=(message:string)=>{feedback.textContent=message;};
  const render=()=>{
    const query=search.value.trim().toLowerCase(),filtered=all.filter(row=>(status.value==='all'||status.value==='draft'&&row.workflowStatus==='draft'||status.value!=='draft'&&row.trackingStatus===status.value)&&(!query||[row.orderNo,row.phone,row.customerName,...row.products.map(p=>p.code)].some(value=>String(value||'').toLowerCase().includes(query))));
    count.textContent=`共 ${filtered.length} 个订单`;rows.replaceChildren();
    if(!filtered.length){const tr=doc.createElement('tr'),td=doc.createElement('td');td.colSpan=8;td.className='ob-empty';td.textContent=all.length?'没有符合条件的订单':'暂无真实订单。请导入你从 ShopPlus 导出的文件，或新建空白订单。';tr.append(td);rows.append(tr);return;}
    for(const row of filtered){const tr=doc.createElement('tr');tr.dataset.orderId=row.id;
      const values=[plain(row.createdAt).slice(0,16),row.orderNo,`${plain(row.phone)}\n${row.customerName||''}`,row.products.length?row.products.map(p=>`${p.code} × ${p.quantity}`).join('，'):'待补商品',money(row.amountFils),row.source==='manual'?'手动新建':'文件导入',row.workflowStatus==='draft'?'草稿':plain(row.trackingStatus)];
      for(const value of values){const td=doc.createElement('td');td.textContent=value;tr.append(td);}
      const action=doc.createElement('td'),open=button(doc,'订单详情','detail');open.dataset.openOrderDetail='';open.onclick=()=>openOrder(row.id);action.append(open);tr.append(action);rows.append(tr);
    }
  };
  const refresh=async()=>{try{all=await call<OrderRow[]>('list',{sort:'newest'});if(!closed)render();}catch(error){if(!closed)show((error as Error).message);}};
  search.oninput=render;status.onchange=render;
  create.onclick=async()=>{create.disabled=true;show('正在新建空白订单…');try{const result=await call<Detail>('createDraft',{requestId:crypto.randomUUID()});openOrder(result.id);}catch(error){show((error as Error).message);}finally{create.disabled=false;}};

  const dialog=doc.createElement('dialog');dialog.className='shared-dialog ob-import';root.append(dialog);
  const renderPreview=()=>{
    if(!preview)return;
    dialog.replaceChildren();const title=doc.createElement('h2');title.textContent=`导入预览 · ${preview.filename}`;dialog.append(title);
    dialog.append(note(doc,`识别 ${preview.summary.validOrders} 单；可直接导入 ${preview.summary.directImportOrders} 单；需人工核对 ${preview.summary.reviewOrders} 单；重复 ${preview.summary.existingOrders} 单；阻断 ${preview.summary.blockedOrders} 单。`));
    if(preview.alreadyImportedFile)dialog.append(note(doc,'这个文件此前已导入。已有订单会自动跳过，请核对后再决定是否提交。'));
    const list=doc.createElement('div');list.className='ob-preview-list';
    for(const order of preview.orders){const card=doc.createElement('section');card.className='ob-preview-order';
      const h=doc.createElement('h3');h.textContent=`${plain(order.orderNo)} · ${plain(order.phoneMasked)}`;card.append(h);
      card.append(note(doc,order.alreadyExists?'已存在，将跳过':!order.canImport?`不能导入：${order.blockingErrors.map(e=>e.code).join('、')}`:order.reviewConfirmed?'已人工核对':order.needsReview?'需要人工核对商品、状态或金额':'可直接导入'));
      if(order.canImport&&order.needsReview){const itemInputs:{sourceRow:number;code:HTMLInputElement;cost:HTMLInputElement}[]=[];
        for(const item of order.items){const row=doc.createElement('div');row.className='ob-review-row';const label=doc.createElement('span');label.textContent=`第 ${item.sourceRow} 行 · ${plain(item.productName)} × ${item.quantity}`;const code=input(doc,'商品编号',item.businessCode||'');const cost=input(doc,'成本 AED',item.costFils===null?'':(item.costFils/100).toFixed(2));row.append(label,code.wrap,cost.wrap);card.append(row);itemInputs.push({sourceRow:item.sourceRow,code:code.box,cost:cost.box});}
        const missing=doc.createElement('label'),missingCheck=doc.createElement('input');missingCheck.type='checkbox';missing.append(missingCheck,' 允许暂缺成本，利润保持待核对');card.append(missing);
        const discount=doc.createElement('label'),discountCheck=doc.createElement('input');discountCheck.type='checkbox';discount.append(discountCheck,' 已核对优惠与订单金额');card.append(discount);
        const confirm=button(doc,order.reviewConfirmed?'重新核对本单':'确认本单资料','btn');confirm.onclick=async()=>{confirm.disabled=true;try{preview=await call<ImportPreview>('reviewImport',{token:preview!.token,orderNo:order.orderNo,items:itemInputs.map(item=>({sourceRow:item.sourceRow,...(item.code.value.trim()?{businessCode:item.code.value.trim()}:{}),...(item.cost.value.trim()?{costAed:item.cost.value.trim()}:{} )})),confirmed:true,missingCostConfirmed:missingCheck.checked,discountConfirmed:discountCheck.checked});renderPreview();}catch(error){const output=card.querySelector<HTMLElement>('.ob-review-error')||doc.createElement('p');output.className='ob-review-error';output.textContent=(error as Error).message;card.append(output);confirm.disabled=false;}};card.append(confirm);
      }
      list.append(card);
    }
    dialog.append(list);const footer=doc.createElement('footer');const cancel=button(doc,'取消','btn'),commit=button(doc,'确认导入','btn primary');
    cancel.onclick=()=>dialog.close();commit.disabled=preview.summary.blockingErrors>0||preview.orders.every(o=>!o.canImport)||preview.orders.some(o=>o.canImport&&!o.alreadyExists&&o.needsReview&&!o.reviewConfirmed);
    commit.onclick=async()=>{commit.disabled=true;try{const result=await call<{imported:number;skipped:number}>('commitImport',preview!.token);dialog.close();show(`已导入 ${result.imported} 单，跳过 ${result.skipped} 单。`);preview=undefined;await refresh();}catch(error){dialog.append(note(doc,(error as Error).message));commit.disabled=false;}};
    footer.append(cancel,commit);dialog.append(footer);
  };
  importButton.onclick=async()=>{importButton.disabled=true;show('正在选择文件…');try{const selection=await call<{canceled:boolean;token:string;filename:string}>('selectExcel');if(selection.canceled){show('已取消选择文件');return;}preview=await call<ImportPreview>('previewImport',selection.token);renderPreview();dialog.showModal();show('文件已预览，尚未写入订单。');}catch(error){show((error as Error).message);}finally{importButton.disabled=false;}};
  void refresh();if(initialAction)queueMicrotask(()=>{if(!closed)(initialAction==='import'?importButton:create).click();});
  return ()=>{closed=true;dialog.remove();};
}

export function installOrderDetail(doc:Document,orderId:string):()=>void{
  const root=doc.querySelector<HTMLElement>('#ui008-order-detail')!,content=root.querySelector<HTMLElement>('.od-content')!,heading=root.querySelector<HTMLElement>('.od-heading-copy h1')!,status=root.querySelector<HTMLElement>('.od-status-actions')!;
  let closed=false,detail:Detail|undefined;
  const render=(value:Detail)=>{
    detail=value;heading.textContent=value.orderNo||`草稿 #${value.sequence}`;
    const name=value.customer.fullName||[value.customer.lastName,value.customer.firstName].filter(Boolean).join(' '),phone=value.customer.phone;
    root.querySelector<HTMLElement>('.od-contact strong')!.textContent=phone||'未关联客户';root.querySelector<HTMLElement>('.od-contact small')!.textContent=`${name||'客户资料待补'} · ${heading.textContent}`;root.querySelector<HTMLElement>('.od-avatar')!.textContent=name?.[0]||'?';
    status.replaceChildren();status.hidden=false;const state=button(doc,value.entryState==='draft'?'草稿':plain(value.trackingStatus),'od-status-button');state.disabled=true;status.append(state);
    content.replaceChildren();const summary=section(doc,'订单概览');summary.append(note(doc,`来源：${value.source==='manual'?'手动新建':'ShopPlus 文件导入'} · 金额：${money(value.amounts.orderTotal)} · 当前状态：${value.entryState==='draft'?'草稿':plain(value.trackingStatus)}`));content.append(summary);
    if(value.entryState==='draft'){const form=doc.createElement('form');form.className='ob-draft';const customer=section(doc,'客户与收货资料'),grid=doc.createElement('div');grid.className='ob-field-grid';const fields:Record<string,HTMLInputElement>={};
      for(const [key,label] of Object.entries({fullName:'客户姓名',phone:'联系电话',email:'邮箱',country:'国家／地区',province:'省／州',city:'城市',street:'街道和门牌',residence:'楼栋／房号'})){const field=input(doc,label,value.draft?.fields[key]||'');field.box.name=key;fields[key]=field.box;grid.append(field.wrap);}customer.append(grid);form.append(customer);
      const products=section(doc,'商品与金额'),itemList=doc.createElement('div');itemList.className='ob-draft-items';const itemRows:{sku:HTMLInputElement;quantity:HTMLInputElement;price:HTMLInputElement;discount:HTMLInputElement;row:HTMLElement}[]=[];
      const addItem=(item?:DraftItem)=>{const row=doc.createElement('div');row.className='ob-draft-item';const sku=input(doc,'商品编号',item?.sku||''),quantity=input(doc,'数量',item?String(item.quantity):'1'),price=input(doc,'成交单价 AED',item?.price_fils===null||item===undefined?'':(item.price_fils/100).toFixed(2)),discount=input(doc,'单件优惠 AED',item?.discount_fils===null||item===undefined?'':(item.discount_fils/100).toFixed(2));quantity.box.type='number';quantity.box.min='1';quantity.box.step='1';const remove=button(doc,'移除','btn');remove.onclick=()=>{row.remove();const at=itemRows.findIndex(value=>value.row===row);if(at>=0)itemRows.splice(at,1);};row.append(sku.wrap,quantity.wrap,price.wrap,discount.wrap,remove);itemList.append(row);itemRows.push({sku:sku.box,quantity:quantity.box,price:price.box,discount:discount.box,row});};
      for(const item of value.draft?.items||[])addItem(item);products.append(itemList);const add=button(doc,'添加商品','btn');add.onclick=()=>addItem();products.append(add);form.append(products);
      const actions=doc.createElement('div');actions.className='ob-actions';const save=button(doc,'保存草稿','btn primary'),result=doc.createElement('output');save.type='submit';result.className='ob-feedback';result.setAttribute('aria-live','polite');actions.append(save,result);form.append(actions);content.append(form);
      form.onsubmit=async event=>{event.preventDefault();save.disabled=true;result.textContent='正在保存…';try{const fieldsPayload=Object.fromEntries(Object.entries(fields).map(([key,element])=>[key,element.value.trim()]));const items=itemRows.map(row=>({sku:row.sku.value.trim(),quantity:Number(row.quantity.value),price:row.price.value.trim(),discount:row.discount.value.trim()}));const updated=await call<Detail>('saveDraft',{orderId:value.id,revision:value.draftRevision,fields:fieldsPayload,items});if(!closed)render(updated);}catch(error){result.textContent=(error as Error).message;save.disabled=false;}};
    }else{
      const customer=section(doc,'客户信息'),grid=doc.createElement('div');grid.className='ob-read-grid';for(const [label,data] of [['客户姓名',name],['联系电话',phone],['邮箱',value.customer.email],['国家／地区',value.customer.country],['省／州',value.customer.province],['城市',value.customer.city],['详细收货地址',[value.customer.street,value.customer.residence].filter(Boolean).join(' · ')]]){const field=doc.createElement('div');field.className='ob-read-field';const key=doc.createElement('span'),text=doc.createElement('strong');key.textContent=label;text.textContent=plain(data);field.append(key,text);grid.append(field);}customer.append(grid);
      const editPhone=button(doc,'核对／更正联系电话','od-text-button');editPhone.onclick=()=>{const dialog=doc.createElement('dialog');dialog.className='shared-dialog ob-phone-dialog';const title=doc.createElement('h2');title.textContent='更正订单联系电话';const phoneInput=input(doc,'完整电话（含国家区号）',phone||'');const reason=input(doc,'修改依据或备注');const output=doc.createElement('output');output.className='ob-feedback';const actions=doc.createElement('footer'),cancel=button(doc,'取消','btn'),save=button(doc,'保存更正','btn primary');cancel.onclick=()=>dialog.close();save.onclick=async()=>{save.disabled=true;try{const updated=await call<Detail>('updateRecipient',{orderId:value.id,field:'phone',value:phoneInput.box.value.trim(),reason:reason.box.value.trim()});dialog.close();if(!closed)render(updated);}catch(error){output.textContent=(error as Error).message;save.disabled=false;}};actions.append(cancel,save);dialog.append(title,note(doc,'仅在核对真实资料后更正。原始导入记录仍保留。'),phoneInput.wrap,reason.wrap,output,actions);root.append(dialog);dialog.onclose=()=>dialog.remove();dialog.showModal();};customer.append(editPhone);content.append(customer);
      const products=section(doc,'商品与金额');if(!value.items.length)products.append(note(doc,'该订单没有商品明细。'));for(const item of value.items){const row=doc.createElement('div');row.className='od-product';const title=doc.createElement('div');title.className='od-product-name';title.textContent=`${plain(item.businessCode)} · ${plain(item.productName)}`;const detail=doc.createElement('span');detail.className='od-product-meta';detail.textContent=`数量 ${item.quantity} · 单价 ${money(item.unitActualPriceFils)} · 成本 ${money(item.costFils)}`;row.append(title,detail);products.append(row);}products.append(note(doc,`商品合计：${money(value.amounts.orderTotal)} · 客户运费：${money(value.amounts.customerShippingFee)}`));content.append(products);
      const delivery=section(doc,'配送与包裹');if(!value.packages.length)delivery.append(note(doc,'暂无包裹记录。'));for(const parcel of value.packages)delivery.append(note(doc,`${plain(parcel.seriesCode)} · ${plain(parcel.status)} · 运费 ${money(parcel.shippingFeeFils)}`));content.append(delivery);
    }
  };
  void call<Detail|null>('detail',orderId).then(value=>{if(closed)return;if(!value){content.replaceChildren(note(doc,'找不到所选订单，请返回订单管理重新选择。'));return;}render(value);}).catch(error=>{if(!closed)content.replaceChildren(note(doc,(error as Error).message));});
  return ()=>{closed=true;};
}
