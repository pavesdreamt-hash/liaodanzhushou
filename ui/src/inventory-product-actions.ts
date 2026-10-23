import {dialog,trapDialogFocus} from './live-dialog';
import {openTaskPriceDialog,taskBatchCall} from './source-task-price-dialog';
import {openTaskOperationDialog} from './source-task-operation-dialog';
import {sourceTaskOperationReason} from '../../shared/source-task-actions.mjs';
export type ProductAction='publish'|'unpublish'|'price'|'stock';
export const productActions=[['publish','arrow-up-from-line','产品上架'],['unpublish','arrow-down-to-line','产品下架'],['price','badge-dollar-sign','修改售价'],['stock','boxes','修改库存']] as const;
export async function localProductCall(action:string,payload:any={}){const r=await window.localProducts?.request({action,...payload});if(!r?.ok)throw Error(r?.error?.message||'本机商品服务不可用');return r.data;}
export const productTask=(row:any)=>({current:row.source||{sourceName:row.sourceName||row.code},remoteProductId:row.remoteProductId});
export function productActionReason(row:any,kind:ProductAction,batchRows:any[]=[]){
  if(!row.remoteProductId)return kind==='publish'||kind==='unpublish'?'尚未同步网站，请先确认网站对应商品':'';
  const website=batchRows.find(r=>r.id===row.remoteProductId);
  return sourceTaskOperationReason(website||null,kind);
}
export function openInventoryProductAction(doc:Document,row:any,kind:ProductAction,onChanged:()=>void){
  if(row.remoteProductId){const task=productTask(row),changed=()=>onChanged();if(kind==='price')openTaskPriceDialog({doc,task,onChanged:changed});else openTaskOperationDialog({doc,task,kind,onChanged:changed});return;}
  if(kind==='publish'||kind==='unpublish')return;
  const label=kind==='price'?'修改本机售价':'修改本机库存',{box,result}=dialog(doc,label),copy=doc.createElement('p'),field=doc.createElement('label'),input=doc.createElement('input'),bar=doc.createElement('footer'),cancel=doc.createElement('button'),save=doc.createElement('button'),trigger=doc.activeElement as HTMLElement;
  box.classList.add('inventory-local-action');copy.textContent=`${row.code} · 尚未同步网站`;field.textContent=kind==='price'?'本次目标售价（AED）':'本机库存（件）';input.type='number';input.min='0';input.step=kind==='price'?'0.01':'1';input.value=String((kind==='price'?row.priceAed:row.stockQuantity)??'');input.required=true;input.setAttribute('aria-label',field.textContent);field.append(input);cancel.textContent='取消';save.textContent='确认保存';save.className='primary';let busy=false;cancel.onclick=()=>box.close();save.onclick=async()=>{if(busy||!input.reportValidity())return;busy=true;save.disabled=cancel.disabled=true;try{await localProductCall('inventory-save',{key:row.key,expectedSource:row.sourceFingerprint,expectedLocalUpdatedAt:row.local?.updatedAt,changes:{[kind==='price'?'salePriceAed':'stockQuantity']:input.value}});box.close();onChanged();}catch(e){result.textContent=(e as Error).message;}finally{busy=false;save.disabled=cancel.disabled=false;}};bar.append(cancel,save);box.append(copy,field,bar);box.addEventListener('cancel',e=>{if(busy)e.preventDefault();});box.addEventListener('close',()=>trigger?.isConnected&&trigger.focus({preventScroll:true}),{once:true});trapDialogFocus(box);box.showModal();input.focus();
}
export async function readInventoryProduct(row:any){if(!row.remoteProductId)throw Error('尚未同步网站，当前显示本机商品记录');const data=await taskBatchCall('batchRefresh',{ids:[row.remoteProductId]});const item=data.results?.find((r:any)=>r.id===row.remoteProductId);if(item?.status==='failed')throw Error(item.reason||'网站读取失败');return data;}
