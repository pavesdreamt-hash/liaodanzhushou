import {stableHash} from '../core/files.mjs';
import {sameSourceIdentity,sourceRows,taskSeeds} from './source-changes.mjs';
import {normalizedSourceName} from '../mapping/source-key.mjs';

const id=value=>String(value||'').normalize('NFKC').toUpperCase().replace(/[\s_-]+/g,'');
export const unmatchedNewProduct=task=>(task.originKind==='added'||task.kind==='added')&&task.newProductPending!==false;
export function restoreNewProductTasks(changes,snapshot,mappings=[]){
  const origins=new Set((changes.history||[]).flatMap(report=>(report.rows||[]).filter(row=>['added','replacement'].includes(row.kind)).map(row=>row.id+':current')));
  for(const task of changes.tasks||[]){
    if(task.renameReceiptId)continue;
    if(task.kind!=='added'&&task.originKind!=='added'&&!origins.has(task.id))continue;
    task.originKind='added';
    const current=(snapshot?.products||[]).filter(row=>sameSourceIdentity(row,task.after||task.current||task.before));
    const confirmed=current.length===1&&mappings.filter(row=>row.status==='正常'&&row.businessId&&sameSourceIdentity(row,current[0]));
    const hasWebsite=confirmed&&confirmed.length===1&&id(confirmed[0].businessId)===id(task.businessId)&&task.remoteProductId&&task.website;
    if(task.newProductPending===undefined)task.newProductPending=!hasWebsite;
    // A recorded human closure is authoritative for this notification. It does
    // not establish a website relation and must not be reopened on upgrade.
  }
}
export const reviewFingerprint=task=>stableHash({kind:task.kind==='price'?'price':task.kind==='review'?'review':'stock',identity:normalizedSourceName((task.current||task.after||task.before)?.sourceName),businessId:task.businessId,remoteProductId:task.remoteProductId,stock:(task.current||task.after||task.before)?.stock,fields:task.kind==='price'?task.fields:[],website:task.kind==='price'?null:task.website?{publishStatus:task.website.publishStatus,stockKnown:task.website.stockKnown,stockQuantity:task.website.stockQuantity}:null});
export function mergeSourceSeeds(tasks,seeds,at){
  for(const seed of seeds){
    if(tasks.some(task=>task.id===seed.id))continue;
    const group=task=>task.kind==='price'?'price':task.kind==='removed'?'removed':task.kind==='review'?'review':'stock';
    const pending=tasks.find(task=>!task.resolved&&group(task)===group(seed)&&group(task)!=='review'&&sameSourceIdentity(task.after||task.before,seed.after||seed.before));
    if(!pending){tasks.push(seed);continue;}
    pending.after=seed.after;pending.before=pending.before||seed.before;pending.lastSeenAt=at;
    if(seed.kind==='price')for(const field of seed.fields){const previous=pending.fields.find(item=>item.field===field.field);if(previous)previous.after=field.after;else pending.fields.push(field);}
    else if(seed.kind==='modified'&&pending.kind!=='added'&&pending.originKind!=='added')pending.kind=seed.kind;
    delete pending.reviewed;delete pending.reminder; // A new event requires a new decision.
    if(seed.kind==='price'){delete pending.priceVerification;delete pending.priceCloseReceipt;}
  }
  return tasks;
}
export function confirmedSourceOrder(snapshot,mappings){
  return (snapshot?.products||[]).flatMap(product=>{
    const relations=mappings.filter(row=>row.status==='正常'&&row.businessId&&sameSourceIdentity(row,product));
    if(relations.length!==1||mappings.filter(row=>row.status==='正常'&&id(row.businessId)===id(relations[0].businessId)).length!==1||(snapshot.products||[]).filter(row=>sameSourceIdentity(row,product)).length!==1)return [];
    return [{businessId:relations[0].businessId,sourceName:product.sourceName,sourceRow:sourceRows(product)[0]||null,sourceRows:sourceRows(product)}];
  }).sort((a,b)=>(a.sourceRow??Infinity)-(b.sourceRow??Infinity));
}
export function migratePriceTasks(changes){
  if(changes.priceTasksVersion===1)return;
  for(const report of [...changes.history].reverse())mergeSourceSeeds(changes.tasks,taskSeeds(report).filter(task=>task.kind==='price'),report.at);
  changes.priceTasksVersion=1;
}
export function captureWebsitePrices(changes,catalog,snapshot,mappings){
  const products=catalog.mappingCatalog||[],at=catalog.mappingCatalogRun?.at||catalog.lastSuccessfulReadAt;
  if(!at||changes.websitePriceReadAt===at)return;
  const baseline=changes.websitePrices||{},rows=[];
  for(const product of products){
    const key=String(product.remoteProductId||''),price=product.websitePriceAed;
    if(!key||price===null||price===undefined||price===''||!Number.isFinite(Number(price)))continue;
    const prior=baseline[key],reconciliation=(catalog.reconciliation?.rows||[]).find(row=>String(row.remoteProductId)===key),before=prior?.price??reconciliation?.before?.website?.websitePriceAed;
    const candidates=mappings.filter(row=>row.status==='正常'&&id(row.businessId)===id(product.productNumber));
    const source=candidates.length===1?(snapshot?.products||[]).find(row=>sameSourceIdentity(row,candidates[0])):null;
    const reference=source?{...source,businessId:candidates[0].businessId,sourceRows:sourceRows(source)}:{sourceName:product.name||product.sourceName||'网站商品',businessId:product.productNumber,sourceRow:null,sourceRows:[],stock:''};
    if(before!==null&&before!==undefined&&before!==''&&Number.isFinite(Number(before))&&Number(before)!==Number(price)){
      const rowId=`${at}:website-price:${key}`;
      rows.push({id:rowId,kind:'modified',before:reference,after:reference,fields:[{field:'websitePriceAed',before,after:price}],moved:false});
      mergeSourceSeeds(changes.tasks,taskSeeds({at,sheet:changes.report.sheet,rows:[rows.at(-1)]}).map(task=>({...task,remoteProductId:key})),at);
    }
    baseline[key]={price,at};
  }
  if(rows.length){changes.report.rows.push(...rows);}
  changes.websitePrices=baseline;changes.websitePriceReadAt=at;
}
export function catalogReviewItems(changes,catalog,{applyReviewed=false}={}){
  const records=changes.catalogReviews||{},covered=new Set(changes.tasks.filter(task=>!task.resolved&&task.kind!=='price').map(task=>task.remoteProductId).filter(Boolean)),pending=[];
  for(const product of catalog.dailyPending||[]){
    if(covered.has(product.remoteProductId))continue;
    const source=product.sourcePricing||{},task={id:`catalog:${product.remoteProductId}`,kind:'catalog',remoteProductId:product.remoteProductId,businessId:product.productNumber,current:{sourceName:source.sourceName||product.name,sourceRow:source.sourceRow,sourceRows:source.sourceRows,stock:source.sourceStock},website:{name:product.name,publishStatus:product.publishStatus,stockKnown:product.stockKnown,stockQuantity:product.stockQuantity,websitePriceAed:product.websitePriceAed,priceComplete:product.priceEvidence?.complete},action:product.kind,reason:product.reason};
    const fingerprint=reviewFingerprint(task),old=records[task.id];
    if(changes.tasks.some(saved=>saved.resolved&&saved.kind!=='price'&&saved.completion?.type==='manual'&&reviewFingerprint(saved)===fingerprint))continue;
    let record=old?.fingerprint===fingerprint?old:{fingerprint};
    // Preserve only a read of the same saved website state; a later status or price is not this read's result.
    if(record.task?.recordRead&&record.task.website?.websitePriceAed===task.website.websitePriceAed){task.recordRead=record.task.recordRead;task.websiteReadAt=record.task.websiteReadAt;}
    const [updated]=applyTaskReviews([{...task,reviewed:record.reviewed,reminder:record.reminder}],{applyReviewed});
    record={...record,reviewed:updated.reviewed,reminder:updated.reminder};
    if(updated.resolved&&updated.completion&&!record.completion){record.completion=updated.completion;changes.reviewHistory=[updated,...(changes.reviewHistory||[])].slice(0,300);}
    records[task.id]={...record,task};
    if(!record.completion)pending.push({...task,reviewed:record.reviewed,reminder:record.reminder});
  }
  changes.catalogReviews=records;changes.catalogPending=pending;
}
export function applyTaskReviews(tasks,{applyReviewed=false}={}){
  return tasks.map(task=>{
    if(task.resolved&&['batch-price','price-aligned'].includes(task.completion?.type)&&task.reminder?.mode!=='continue')return task;
    const fingerprint=reviewFingerprint(task),reviewed=task.reviewed?.fingerprint===fingerprint?task.reviewed:undefined;
    const reminder=task.reminder?.mode==='close-pending'&&task.reminder.fingerprint!==fingerprint?undefined:task.reminder;
    if(reminder?.mode==='close-pending'){
      if(applyReviewed)return {...task,reviewed,reminder,resolved:true,reason:'已人工确认关闭本次提醒。',completion:{type:'manual',notificationOnly:true,at:new Date().toISOString(),reviewedAt:reviewed?.at,reason:task.kind==='price'?(task.priceCloseReceipt?.type==='acknowledged'?'已知晓价格提示，人工关闭本次提醒；不代表网站价格达标，不修改网站价格。':'已人工核对价格并关闭本次提醒；不修改网站价格。'):'人工关闭提醒；不代表系统对齐或商品身份/对应关系已确认。'}};
      return {...task,reviewed,reminder,resolved:false,completion:undefined};
    }
    if(['continue','close-ready'].includes(reminder?.mode))return {...task,reviewed,reminder,resolved:false,completion:undefined,reason:task.resolved?`${task.reason}已选择持续提醒，可人工关闭本次提醒。`:task.reason};
    return {...task,reviewed,reminder};
  });
}
