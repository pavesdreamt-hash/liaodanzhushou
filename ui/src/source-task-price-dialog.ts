import {dialog,trapDialogFocus} from './live-dialog';
import {sourceTaskWebsiteRow} from '../../shared/source-task-actions.mjs';
import {toPriceFils} from '../../shared/website-price-rule.mjs';
export async function taskBatchCall(method:'batchView'|'batchRefresh'|'batchExecute',payload?:any){
  const api=window.inventoryApp?.[method];if(!api)throw Error('网站商品服务尚未就绪');
  const reply=await api(payload);if(!reply?.ok)throw Error(reply?.error?.message||'网站商品操作未完成');return reply.data;
}
type Options={doc:Document;task:any;onChanged:(data:any)=>void};
export function openTaskPriceDialog(o:Options){
  const d=o.doc,{box,result}=dialog(d,'修改网站售价'),copy=d.createElement('p'),table=d.createElement('table'),body=d.createElement('tbody'),label=d.createElement('label'),input=d.createElement('input'),hint=d.createElement('p'),footer=d.createElement('footer'),refresh=d.createElement('button'),cancel=d.createElement('button'),save=d.createElement('button');
  box.classList.add('source-price-editor');table.className='source-task-table';table.append(body);copy.textContent=(o.task.current||o.task.after||o.task.before)?.sourceName||'商品';label.textContent='本次目标售价（AED）';input.type='number';input.min='0';input.max='10000000';input.step='0.01';input.setAttribute('aria-label','本次目标售价（AED）');label.className='source-price-input';label.append(input);hint.className='source-task-notice';hint.textContent='在系统内提交网站售价。只上调低于目标的规格，已有更高售价保持；参考价仅提示，可确认更低目标或保留现价。';refresh.type=cancel.type=save.type='button';refresh.textContent='读取这款商品最新状态';cancel.textContent='返回商品详情';save.textContent='确认修改售价';save.className='primary';footer.append(refresh,cancel,save);box.append(copy,table,label,hint,footer);trapDialogFocus(box);
  let row:any=null,busy=false,needsRefresh=false,loaded=false;
  const controls=()=>{input.disabled=busy||!row?.validVariants||!row?.priceReady;save.disabled=busy||needsRefresh||!row?.validVariants||!row?.priceReady;refresh.disabled=busy||!row;cancel.disabled=busy;box.setAttribute('aria-busy',String(busy));};
  const paint=()=>{body.replaceChildren();for(const [title,value]of [['网站当前最低规格价',row?.websitePriceAed==null?'待核对':`${Number(row.websitePriceAed).toFixed(2)} AED`],['参考售价',row?.guard.minimumFils==null?'资料待核对':`${(row.guard.minimumFils/100).toFixed(2)} AED`],['网站规格',row?.variants?.map((v:any)=>`${v.name||v.id}：${v.salePrice==null?'待核对':Number(v.salePrice).toFixed(2)} AED`).join('；')||'尚未读取']]){const tr=d.createElement('tr'),th=d.createElement('th'),td=d.createElement('td');th.textContent=title;td.textContent=value;tr.append(th,td);body.append(tr);}controls();};
  const accept=(data:any)=>{row=sourceTaskWebsiteRow(o.task,data.rows);if(!row)throw Error('尚无唯一已确认的网站对应，请先选择网站对应商品');if(!loaded){input.value=row.acceptedPriceAed==null?(row.guard.minimumFils==null?'':String(row.guard.minimumFils/100)):String(row.acceptedPriceAed);loaded=true;}paint();};
  const load=async(readWebsite=false)=>{if(busy)return;busy=true;controls();result.textContent=readWebsite?'正在读取这款商品的最新网站状态…':'正在读取本机商品与对应资料…';try{const data=await taskBatchCall(readWebsite?'batchRefresh':'batchView',readWebsite?{ids:[row.id]}:undefined);accept(data);if(readWebsite){o.onChanged(data);const item=data.results?.find((r:any)=>r.id===row.id);if(item?.status==='failed')throw Error(item.reason||'网站读取失败');needsRefresh=false;}result.textContent=row.priceReady?'请填写目标价，再确认本次修改。':'网站规格或售价不完整，请读取这款商品最新状态后重试。';}catch(error){result.textContent=(error as Error).message;}finally{busy=false;controls();}};
  refresh.onclick=()=>{void load(true);};cancel.onclick=()=>box.close();
  save.onclick=()=>{
    if(busy||needsRefresh||!row)return;const targetFils=toPriceFils(input.value);
    if(targetFils===null||targetFils>1000000000){result.textContent='请填写0～10000000之间、最多两位小数的有效售价。';input.focus();return;}
    const target=targetFils/100,below=row.guard.minimumFils===null||targetFils<row.guard.minimumFils,confirmation=dialog(d,below?'确认使用所填价格？':'确认修改网站售价？'),text=d.createElement('p'),bar=d.createElement('footer'),no=d.createElement('button'),yes=d.createElement('button');
    text.textContent=`${row.name}\n网站现价：${Number(row.websitePriceAed).toFixed(2)} AED；参考售价：${row.guard.minimumFils===null?'待核对':(row.guard.minimumFils/100).toFixed(2)+' AED'}\n本次目标：${target.toFixed(2)} AED。${below?'低于参考或参考未知，本次确认将保存你的人工认可。':''}\n仅处理这一款商品；已有更高规格价、库存和上下架保持。回读符合目标后同步完成对应价格提醒。`;text.style.whiteSpace='pre-line';no.textContent='取消';yes.textContent=below?'确认使用所填价格':'确认执行';yes.className='primary';no.onclick=()=>confirmation.box.close();bar.append(no,yes);confirmation.box.append(text,bar);trapDialogFocus(confirmation.box);confirmation.box.showModal();
    yes.onclick=async()=>{
      if(busy)return;confirmation.box.close();busy=true;controls();result.textContent='正在核对最新资料、提交售价并回读…';
      try{
        const data=await taskBatchCall('batchExecute',{kind:'price',items:[{id:row.id,target,sourceFingerprint:row.sourceFingerprint,expected:{prices:row.variants.map((v:any)=>[v.id,Math.round(v.salePrice*100)])},priceTasks:row.priceTasks||[]}],confirmed:true,requestId:crypto.randomUUID(),allowBelowReference:below});
        o.onChanged(data);const outcome=data.results?.find((r:any)=>r.id===row.id);accept(data);
        if(!outcome||!['success','unchanged'].includes(outcome.status)){needsRefresh=true;result.textContent=`${outcome?.status==='uncertain'?'已提交，尚未回读确认':'未完成'}：${outcome?.reason||'请先读取最新状态，再决定是否重试'}。请勿重复提交。`;}
        else result.textContent=`已处理并回读确认，网站最低规格价 ${Number(row.websitePriceAed).toFixed(2)} AED；对应价格提醒已同步，无需再次关闭。`;
      }catch(error){needsRefresh=true;result.textContent=`${(error as Error).message}；请先读取最新状态，再决定是否重试。`;}finally{busy=false;controls();}
    };
  };
  box.addEventListener('cancel',event=>{if(busy)event.preventDefault();});controls();box.showModal();void load();
}
