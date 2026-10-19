import {PriceTaskVerification} from '../src/inventory/price-task-verification.mjs';
import {websitePriceEvidence,websitePriceGuard} from '../shared/website-price-rule.mjs';
// Unit fixtures still exercise the real proof and manual-confirm services. Only
// the website transport is replaced; stock reminders keep their existing path.
export async function confirmReminder(store,payload){
 const document=await store.read(),task=document.sourceChanges.tasks.find(t=>t.id===payload.taskId&&!t.resolved);
 if(task?.kind!=='price')return store.reviewSourceTask(payload);
 const source=document.latestCollection.products.find(p=>p.sourceName===(task.current||task.after).sourceName),check=websitePriceGuard({costPriceAed:source.cost,suggestedPriceAed:source.suggestedPrice,websitePriceAed:0}),price=task.website?.websitePriceAed??check.minimumFils/100;
 const service=new PriceTaskVerification({store,catalog:{readOne:async()=>({remoteProductId:task.remoteProductId,name:task.website?.name,websitePriceAed:price,priceEvidence:websitePriceEvidence({price}),publishStatus:task.website?.publishStatus,stockKnown:task.website?.stockKnown,stockQuantity:task.website?.stockQuantity})},readProduct:async()=>{throw Error('transport supplied by fictional single product');}}),read=await service.read({taskId:task.id});
 if(!read.verified)throw Error(read.reason);
 const result=await service.confirm({...payload,verificationId:read.task.priceVerification.id});if(!result.closed)throw Error(result.reason);return result.changes;
}
