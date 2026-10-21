import {batchFixture} from './inventory-batch.mjs';
import {assignSourceKeys} from '../../src/mapping/source-key.mjs';
import {writeJSON} from '../../src/core/files.mjs';

export async function pendingNewFixture({count=24,directory}={}){
  const f=await batchFixture({directory}),doc=await f.store.read();
  const added=assignSourceKeys(Array.from({length:count},(_,i)=>({sourceName:`VIP${16+i}`,sourceRow:230+i,cost:String(40+i),suggestedPrice:'250',stock:'有货'})));
  doc.latestCollection.products.push(...added);
  doc.sourceChanges.tasks.push(...added.map((s,i)=>({id:`pending-vip-${i}`,changeId:`pending-vip-change-${i}`,kind:'added',originKind:'added',current:s,after:s,before:null,resolved:false})));
  await writeJSON(f.store.file,doc);f.calls.lists=[];f.faults.list=false;
  f.connection.listProductsPage=async p=>{f.calls.lists.push(p);if(f.faults.list)throw Error('虚构网站目录读取失败');if(f.faults.listHook)await f.faults.listHook(p);const rows=[...f.web.values()];return{products:structuredClone(rows.slice((p.pageNum-1)*p.pageSize,p.pageNum*p.pageSize)),totalCount:rows.length};};
  let clock=Date.parse('2026-10-21T09:00:00Z');f.catalog.now=()=>new Date(clock+=1000);
  return {...f,added,addWebsite:(id,title,{spuCode,publishStatus=1}={})=>{f.web.set(String(id),{id:String(id),title,spuCode,publishStatus,productVariantDTOs:[{id:String(Number(id)*10),salePrice:350,productVariantInventoryDTO:{availableStockQuantity:10}}]});}};
}
