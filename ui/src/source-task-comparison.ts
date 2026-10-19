import {websitePriceGuard} from './website-price-guard';
const text=(value:unknown)=>value===null||value===undefined||value===''?'—':String(value);
const rowNumber=(product:any)=>product?(product.sourceRows?.length?product.sourceRows:[product.sourceRow]).map((r:any)=>typeof r==='object'?r.sourceRow:r).filter(Boolean).join('、')||'未知':'—';
const amount=(value:unknown)=>value===null||value===undefined||value===''?'—':Number.isFinite(Number(value))?Number(value).toFixed(2):String(value);
const fieldLabels:Record<string,string>={cost:'成本价',suggestedPrice:'建议售价',websitePriceAed:'网站售价',stock:'来源库存',sourceName:'商品名称',additionalInfo:'附加资料'};
export function sourceTaskComparison(doc:Document,task:any){
  const content=doc.createElement('section'),scroll=doc.createElement('div'),table=doc.createElement('table'),head=doc.createElement('thead'),heading=doc.createElement('tr'),body=doc.createElement('tbody');content.className='source-task-content';scroll.className='source-task-table-scroll';table.className='source-task-table';
  for(const label of ['对照项目','变化前','当前来源／核对目标','网站记录']){const th=doc.createElement('th');th.scope='col';th.textContent=label;heading.append(th);}head.append(heading);table.append(head,body);scroll.append(table);content.append(scroll);
  const before=task.before,current=task.current||task.after,web=task.website,delta=task.fields||[],guard=websitePriceGuard({websitePriceAed:web?.websitePriceAed,suggestedPriceAed:current?.suggestedPrice,costPriceAed:current?.cost,priceComplete:web?.priceComplete}),oldWebPrice=delta.find((f:any)=>f.field==='websitePriceAed')?.before;
  const entries=[
    ['sourceName','商品名称',before?.sourceName,current?.sourceName,web?.name],
    ['sourceRow','来源行号',rowNumber(before),rowNumber(current),'—'],
    ['businessId','本机商品编号',before?.businessId,current?.businessId||task.businessId,'—'],
    ['cost','成本价（AED）',amount(before?.cost),amount(current?.cost),'—'],
    ['suggestedPrice','建议售价（AED）',amount(before?.suggestedPrice),amount(current?.suggestedPrice),'—'],
    ['stock','来源库存／网站库存',before?.stock,current?.stock,web?(web.stockKnown?`${web.stockQuantity} 件`:'库存未知'):'—'],
    ['publishStatus','网站上下架','—',current?.stock==='有货'?'有货，核对是否已上架':current?.stock==='无货'?'无货，核对是否已下架':'待核对',web?.publishStatus===1?'已上架':web?.publishStatus===0?'已下架':'未知'],
    ['websitePriceAed','网站售价（AED）',amount(oldWebPrice),guard.minimumFils===null?'最低售价待核对':`最低 ${(guard.minimumFils/100).toFixed(2)}`,amount(web?.websitePriceAed)],
    ['remoteProductId','网站商品 ID','—','—',task.remoteProductId]
  ];
  for(const[key,label,oldValue,newValue,websiteValue]of entries){const tr=doc.createElement('tr');tr.dataset.field=String(key);const changed=delta.some((f:any)=>f.field===key)||Boolean(before&&current&&['sourceName','businessId','stock','cost','suggestedPrice','sourceRow'].includes(String(key))&&text(oldValue)!==text(newValue));tr.classList.toggle('is-changed',changed);const th=doc.createElement('th');th.scope='row';th.textContent=String(label);if(changed){const badge=doc.createElement('span');badge.className='source-task-change-badge';badge.textContent='有变化';th.append(badge);}tr.append(th);for(const value of[oldValue,newValue,websiteValue]){const td=doc.createElement('td');td.textContent=text(value);tr.append(td);}if(key==='websitePriceAed'&&guard.status==='low')tr.lastElementChild?.classList.add('is-price-low');body.append(tr);}
  if(before?.additionalInfo||current?.additionalInfo){const tr=doc.createElement('tr'),th=doc.createElement('th');th.scope='row';th.textContent='附加资料';tr.append(th);for(const value of[before?.additionalInfo,current?.additionalInfo,'—']){const td=doc.createElement('td');td.textContent=text(value);tr.append(td);}if(text(before?.additionalInfo)!==text(current?.additionalInfo))tr.className='is-changed';body.append(tr);}
  const notice=(title:string,copy:string,tone='')=>{const box=doc.createElement('section'),heading=doc.createElement('strong'),body=doc.createElement('p');box.className=`source-task-notice ${tone}`;heading.textContent=title;body.textContent=copy;box.append(heading,body);content.append(box);};
  notice('发生的变化',delta.length?delta.map((f:any)=>`${fieldLabels[f.field]||f.field}：${text(f.before)} → ${text(f.after)}`).join('；'):task.reason||'请按前后资料核对商品。',delta.length?'is-change':'');
  if(task.kind==='price'){notice('价格处理提醒',guard.message,'is-price');const proof=task.priceVerification;notice(proof?.status==='passed'?'核验通过 · 待人工确认':proof?.status==='failed'?'核验未通过':proof?.status==='reading'?'正在读取这款商品':'尚未进行单品核验',proof?.status==='passed'?`核验时间：${new Date(proof.at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})}。选择核验后关闭时会再次回读这一款商品；单品核验有效期为5分钟。`:proof?.message||proof?.check?.message||'可重新读取这款商品核对。未读取、读取失败或价格未达标时，也可选择“我已知晓，关闭本次提醒”。',proof?.status==='passed'?'is-passed':proof?.status==='failed'?'is-failed':'');}
  notice('处理要求',task.kind==='price'?'价格底线用于提醒注意，由你决定处理方式。可核验达标后关闭，也可知晓提示后人工关闭本次提醒；人工关闭不代表售价已达标。':'知晓以上资料后，可选择“我已知晓，关闭本次提醒”，无需强制先重新读取。只关闭本次通知，不代表商品身份或网站状态已核验通过，也不执行上下架。');
  notice('网站记录与提醒状态',`${task.websiteReadAt?'网站单品回读时间：'+new Date(task.websiteReadAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})+'。':'网站栏为最近保存的记录，尚未单品回读。'}“关闭”只记为已查看；“我已知晓，关闭本次提醒”经确认后标记关闭，再点列表“刷新”移走。价格提醒另可选择核验后关闭。`);
  return content;
}
