import {stableHash} from '../core/files.mjs';
import {batchWebsite} from './batch-edit.mjs';
import {plainText,sellingText,checkLocalPrice} from './product-master.mjs';
import {writeMasterRecovery,masterRecoveryReason} from './master-sync-recovery.mjs';
const raw=r=>r?.productVO||r?.product||r;
const html=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])).replace(/\n/g,'<br>');
const fields=['name','salePriceAed','availability','sellingPoints','description'];
const webValues=r=>{const w=batchWebsite(r),p=raw(r);return {id:w.remoteProductId,name:String(p.title??p.name??''),sellingPoints:sellingText(p.productShortDesc),description:plainText(p.productLongDesc),publishStatus:w.publishStatus,variants:w.variants.map(v=>({id:v.id,salePrice:v.salePrice,stockQuantity:v.stockQuantity})).sort((a,b)=>a.id.localeCompare(b.id))};};
const savedValues=row=>({id:row.remoteProductId,name:row.website.sourceName,sellingPoints:sellingText(row.website.sourceShortDescription),description:plainText(row.website.sourceLongDescription),publishStatus:row.publishStatus,variants:row.website.variants.map(v=>({id:v.id,salePrice:v.salePrice,stockQuantity:v.stockQuantity})).sort((a,b)=>a.id.localeCompare(b.id))});
export class ProductMasterSync{
 constructor(bridge){this.b=bridge;}
 async save(p){return this.b.serial(async()=>{const row=await this.b.checked(p);return this.b.unified.saveMaster({key:row.key,expectedSource:row.sourceFingerprint,expectedLocalUpdatedAt:row.local?.updatedAt,changes:p.changes,priceApproval:p.priceApproval});});}
 async read(p){return this.b.serial(async()=>{
  let row=await this.b.unified.detail(p.key);
  if(!row.local){await this.b.unified.saveMaster({key:row.key,expectedSource:row.sourceFingerprint,changes:{}});row=await this.b.unified.detail(p.key);}
  if(row.remoteProductId){
   const info=await this.b.info({key:p.key});await this.b.read({key:p.key,fingerprint:info.fingerprint});
   const current=await this.b.unified.detail(p.key);
   if(current.remoteProductId!==row.remoteProductId)throw Error('网站对应已变化，请重新读取核对');
   if(row.syncRecovery?.pending){
    const state=row.syncRecovery,actual=savedValues(current),hash=stableHash(actual);
    const outcome=hash===stableHash(state.target)?'applied':hash===stableHash(state.before)?'unchanged':'changed';
    await writeMasterRecovery(this.b.localProducts.directory,row.remoteProductId,{...state,pending:false,outcome});
   }
  }
  return this.b.info({key:p.key});
 });}
 async sync(p){return this.b.serial(async()=>{
  if(p.confirmed!==true)throw Error('请确认同步方向和所选字段');
  if(!['to-website','to-local'].includes(p.direction)||!Array.isArray(p.fields)||!p.fields.length||p.fields.some(f=>!fields.includes(f))||new Set(p.fields).size!==p.fields.length)throw Error('请选择有效的同步字段');
  const row=await this.b.checked(p);if(!row.remoteProductId)throw Error('请先关联网站商品');
  if(row.syncRecovery?.pending)throw Error(masterRecoveryReason);
  const before=raw(await this.b.connection.productDetail(row.remoteProductId)),actual=webValues(before),saved=savedValues(row);await this.b.checked(p);
  if(stableHash(actual)!==stableHash(saved))throw Error('网站资料已变化，请刷新读取后重新核对同步');
  const variant=actual.variants.find(v=>v.id===p.variantId),numeric=p.fields.some(f=>['salePriceAed','availability'].includes(f));if(numeric&&!variant)throw Error('请选择明确的网站规格');
  if(p.direction==='to-local'){
   const changes={};for(const f of p.fields)changes[f]=f==='salePriceAed'?variant.salePrice:f==='availability'?p.availability:actual[f];
   if(Object.hasOwn(changes,'availability')&&!['有货','无货','待核对'].includes(changes.availability))throw Error('请明确选择本机库存状态');
   if(Object.hasOwn(changes,'salePriceAed'))checkLocalPrice(changes.salePriceAed,changes.salePriceAed===row.master.salePriceAed?null:row.costPriceAed,p.priceApproval);
   for(const f of Object.keys(changes))if(changes[f]===row.master[f])delete changes[f];
   if(!Object.keys(changes).length)return {saved:false,unchanged:true,fields:[]};
   await this.b.unified.saveMaster({key:row.key,expectedSource:row.sourceFingerprint,expectedLocalUpdatedAt:row.local?.updatedAt,changes,priceApproval:p.priceApproval});return {saved:true,fields:p.fields};
  }
  const wanted=structuredClone(actual),content={};
  if(p.fields.includes('name')){const name=String(p.websiteName??row.master.name).trim();if(!name||name.length>240)throw Error('请填写有效的网站商品名称');wanted.name=name;if(name!==actual.name)content.title=name;}
  if(p.fields.includes('sellingPoints')){wanted.sellingPoints=row.master.sellingPoints;if(wanted.sellingPoints!==actual.sellingPoints)content.productShortDesc=JSON.stringify(wanted.sellingPoints.split('\n').filter(Boolean).map(value=>({key:'',value})));}
  if(p.fields.includes('description')){wanted.description=plainText(row.master.description);if(wanted.description!==actual.description)content.productLongDesc=html(row.master.description);}
  const target=wanted.variants.find(v=>v.id===p.variantId),patch={id:p.variantId};
  if(p.fields.includes('salePriceAed')){const price=checkLocalPrice(row.master.salePriceAed,row.master.salePriceAed===variant.salePrice?null:row.costPriceAed,p.priceApproval);target.salePrice=price;if(price!==variant.salePrice)patch.salePrice=price;}
  if(p.fields.includes('availability')){const n=Number(p.stockQuantity);if(String(p.stockQuantity??'').trim()===''||!Number.isSafeInteger(n)||n<0||n>1000000)throw Error('请确认网站库存件数');target.stockQuantity=n;if(n!==variant.stockQuantity)patch.availableStockQuantity=n;}
  if(!Object.keys(content).length&&Object.keys(patch).length===1)return {saved:false,unchanged:true,fields:[]};
  // Freeze the local master before the first explicit website update.
  if(!row.local)await this.b.unified.saveMaster({key:row.key,expectedSource:row.sourceFingerprint,changes:{}});
  const sourceContext=row.source?this.b.unified.batch.context(await this.b.unified.batch.snapshot(),row.source):null;
  const state={pending:true,startedAt:new Date().toISOString(),key:row.key,fields:p.fields,before:actual,target:wanted};
  // Persist before sending anything: a timeout or process exit must never permit a blind retry.
  await writeMasterRecovery(this.b.localProducts.directory,row.remoteProductId,state);
  const completed=[];
  try{
   if(Object.keys(content).length){await this.b.connection.updateProductContent({productId:row.remoteProductId,changes:content});completed.push('名称/文案');}
   if(Object.keys(patch).length>1){await this.b.connection.updateProductFields({productId:row.remoteProductId,variants:[patch]});completed.push('售价/库存');}
   const after=raw(await this.b.connection.productDetail(row.remoteProductId));if(stableHash(webValues(after))!==stableHash(wanted))throw Error('网站回读未符合所选目标，或其它字段发生变化');
   await this.b.catalog.recordWebsiteUpdate({remoteProductId:row.remoteProductId,raw:after,manualLock:true});
   if(sourceContext){await this.b.unified.batch.currentContext(row.remoteProductId,sourceContext.fingerprint);await this.b.unified.batch.saveRead(row.remoteProductId,sourceContext.fingerprint,batchWebsite(after));}
   await writeMasterRecovery(this.b.localProducts.directory,row.remoteProductId,{...state,pending:false,outcome:'verified'});
   return {saved:true,fields:p.fields};
  }catch(e){throw Error(`同步尚未完成核对${completed.length?'（已提交'+completed.join('、')+'）':''}：${e.message}。请刷新读取后核对再重试。`);}
 });}
}
