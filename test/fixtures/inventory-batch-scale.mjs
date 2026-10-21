import {batchFixture} from './inventory-batch.mjs';
import {writeJSON} from '../../src/core/files.mjs';
import {assignSourceKeys} from '../../src/mapping/source-key.mjs';
import {ShopPlusConnection} from '../../src/orders/shopplus-api.mjs';

// Real local stores and production API methods, with isolated transport and configurable latency.
export async function batchScaleFixture({count=200,latencyMs=100}={}){
  const f=await batchFixture();f.web.clear();
  const sources=assignSourceKeys(Array.from({length:count},(_,i)=>({sourceName:`T${String(i+1).padStart(3,'0')} 测试商品`,cost:'100',suggestedPrice:'250',stock:'无货',sourceRow:i+2})));
  for(let i=0;i<count;i++){const id=String(2000+i);f.web.set(id,{id,title:sources[i].sourceName,publishStatus:1,productVariantDTOs:[{id:String(Number(id)*10),salePrice:320,productVariantInventoryDTO:{availableStockQuantity:10}}]});}
  const cv=await f.catalog.syncMappingCatalog({listPage:async()=>({products:[...f.web.values()],totalCount:count})});
  const mappings=sources.map((s,i)=>({...s,status:'正常',businessId:cv.mappingCatalog.find(p=>p.remoteProductId===String(2000+i)).productNumber}));
  const doc=await f.store.read();doc.latestCollection.products=sources;doc.mappingRows=mappings;doc.current.products=sources;doc.current.mappingRows=mappings;
  const tasks=sources.map((s,i)=>({id:`scale-${i}`,changeId:`scale-change-${i}`,kind:'modified',before:{...s,stock:'有货'},after:s,current:s,fields:[{field:'stock',before:'有货',after:'无货'}],action:'unpublish',resolved:false}));
  const report={id:doc.latestCollection.capturedAt,at:doc.latestCollection.capturedAt,sheet:'Sheet1',websiteCheck:'pending',rows:tasks.map(t=>({id:t.changeId,kind:t.kind,before:t.before,after:t.after,fields:t.fields,tasks:[t]})),summary:{}};
  doc.sourceChanges={...doc.sourceChanges,tasks,report,history:[report],catalogPending:[]};await writeJSON(f.store.file,doc);
  await f.catalog.collectPublishedInStock({listPage:async()=>({products:[...f.web.values()],totalCount:count})});
  const connection=new ShopPlusConnection({userDataPath:f.dir,safeStorage:{},promptCredential:async()=>null}),stats={calls:[],active:0,maxActive:0};
  connection.request=async(name,data)=>{stats.active++;stats.maxActive=Math.max(stats.maxActive,stats.active);stats.calls.push({name,id:String(data.id??data.productId)});try{if(latencyMs)await new Promise(r=>setTimeout(r,latencyMs));const id=String(data.id??data.productId),raw=f.web.get(id);if(name==='products.detail')return structuredClone(raw);if(name==='products.updateSpuSelective'){raw.publishStatus=data.publishStatus;return{result:true};}throw Error('Unexpected fixture API '+name);}finally{stats.active--;}};
  return {...f,connection,stats};
}
