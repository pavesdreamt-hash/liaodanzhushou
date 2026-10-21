import test from 'node:test';import assert from 'node:assert/strict';
import {batchFixture,selection} from './fixtures/inventory-batch.mjs';
import {writeJSON} from '../src/core/files.mjs';import {InventoryBatchEdit} from '../src/inventory/batch-edit.mjs';
const sync=async(f,result)=>f.store.refreshSourceChanges({catalog:await f.catalog.getView(),verifiedReads:result.verifiedReads,priceCompletions:result.priceCompletions});
async function price(f,target=310){const view=await f.service.view(),row=view.rows.find(r=>r.id==='1002');return f.service.execute({kind:'price',items:[selection(row,'price',target)],confirmed:true,requestId:'price-reminder-sync-0001',allowBelowReference:row.guard.minimumFils===null||target*100<row.guard.minimumFils});}
const hasPrice=changes=>changes.pending.some(t=>t.id==='batch-task-1');
async function legacy(f){await f.service.mutateState(state=>{for(const r of state.history[0].results){delete r.priceTasks;delete r.sourceAt;delete r.sourceFingerprint;}});return f.service.view();}

test('确认调价并回读后同步完成价格提醒，非价格待办保留，完成记录绑定人工目标',async()=>{
 const f=await batchFixture();try{const result=await price(f),updated=await sync(f,result);assert.equal(result.results[0].status,'success');assert.equal(hasPrice(updated),false);assert.ok(updated.pending.some(t=>t.id==='batch-task-0'));assert.ok(updated.pending.some(t=>t.id==='batch-task-2'));const completed=updated.reviewHistory.find(t=>t.id==='batch-task-1');assert.equal(completed.completion.type,'batch-price');assert.equal(completed.completion.targetFils,31000);assert.equal(completed.completion.requestId,'price-reminder-sync-0001');assert.equal(completed.priceVerification?.status,undefined);}finally{await f.cleanup();}
});

test('人工确认保留低于参考的现价，无需写网站，价格提醒同步完成；刷新重启保持',async()=>{
 const f=await batchFixture();try{const result=await price(f,300),updated=await sync(f,result);assert.equal(result.results[0].status,'unchanged');assert.equal(f.calls.writes.length,0);assert.equal(hasPrice(updated),false);f.service=new InventoryBatchEdit({store:f.store,catalog:f.catalog,connection:f.connection});const read=await f.service.refresh({ids:['1002']}),again=await sync(f,read);assert.equal(hasPrice(again),false);assert.equal(again.reviewHistory.filter(t=>t.id==='batch-task-1').length,1);}finally{await f.cleanup();}
});

test('参考区间未知也可按已确认人工目标完成提醒，不伪造参考达标',async()=>{
 const f=await batchFixture();try{const d=await f.store.read();d.latestCollection.products[1].suggestedPrice='260-280';await writeJSON(f.store.file,d);const result=await price(f,300),updated=await sync(f,result);assert.equal(hasPrice(updated),false);assert.equal(result.results[0].belowReference,true);assert.equal(result.rows.find(r=>r.id==='1002').guard.status,'unknown');}finally{await f.cleanup();}
});

test('仅刷新或未确认修改不会关闭价格提醒',async()=>{
 const f=await batchFixture();try{let result=await f.service.refresh({ids:['1002']});assert.equal(hasPrice(await sync(f,result)),true);const row=result.rows.find(r=>r.id==='1002');await assert.rejects(f.service.execute({kind:'price',items:[selection(row,'price',310)],confirmed:false,requestId:'price-reminder-sync-no'}),/明确确认/);assert.equal(hasPrice(await sync(f,await f.service.view())),true);assert.equal(f.calls.writes.length,0);}finally{await f.cleanup();}
});

test('价格已确认完成不受独立库存未知事项阻挡',async()=>{
 const f=await batchFixture();try{f.web.get('1002').productVariantDTOs.forEach(v=>v.productVariantInventoryDTO.availableStockQuantity=null);await f.service.refresh({ids:['1002']});const result=await price(f),updated=await sync(f,result);assert.equal(result.results[0].status,'success');assert.equal(hasPrice(updated),false);assert.ok(updated.pending.some(t=>t.remoteProductId==='1002'&&t.kind!=='price'));}finally{await f.cleanup();}
});

for(const failure of ['read','uncertain'])test(`调价失败/回读不确定不关闭：${failure}`,async()=>{
 const f=await batchFixture();try{if(failure==='read')f.faults.read='1002';else f.faults.writeAfter=true;const result=await price(f),updated=await sync(f,result);assert.equal(result.results[0].status,failure==='read'?'failed':'uncertain');assert.equal(hasPrice(updated),true);assert.equal(result.priceCompletions.filter(p=>p.remoteProductId==='1002').length,0);}finally{await f.cleanup();}
});

test('确认前或执行中价格提醒有新变化时不关闭新提醒',async()=>{
 const f=await batchFixture();try{const row=(await f.service.view()).rows.find(r=>r.id==='1002'),d=await f.store.read();d.sourceChanges.tasks[1].fields.push({field:'websitePriceAed',before:290,after:300});await writeJSON(f.store.file,d);await assert.rejects(f.service.execute({kind:'price',items:[selection(row,'price',310)],confirmed:true,requestId:'price-reminder-sync-stale'}),/价格提醒已有新变化/);assert.equal(f.calls.writes.length,0);
  let changed=false;f.faults.hook=async()=>{if(changed)return;changed=true;const document=await f.store.read();document.latestCollection.products[1].cost='111';document.sourceChanges.tasks[1].fields.push({field:'cost',before:'110',after:'111'});await writeJSON(f.store.file,document);};const result=await price(f);assert.equal(result.results[0].status,'failed');assert.equal(hasPrice(await sync(f,result)),true);
 }finally{await f.cleanup();}
});

test('旧版成功记录与原保存回读仍匹配时直接同步，无需重做网站修改',async()=>{
 const f=await batchFixture();try{await price(f,300);const view=await legacy(f);assert.equal(view.priceCompletions.filter(p=>p.remoteProductId==='1002'&&p.mode!=='current-state').length,1);const updated=await sync(f,view);assert.equal(hasPrice(updated),false);assert.equal(f.calls.writes.length,0);}finally{await f.cleanup();}
});

for(const change of ['later-notification','later-read','source-generation','website-prices'])test(`旧批次不作为后续证据，当前目标已满足仍同步：${change}`,async()=>{
 const f=await batchFixture();try{const result=await price(f,300);await legacy(f);if(change==='later-notification'){const d=await f.store.read();d.sourceChanges.tasks[1].lastSeenAt=new Date(Date.parse(result.results[0].at)+1000).toISOString();await writeJSON(f.store.file,d);}if(change==='later-read')await f.service.refresh({ids:['1002']});if(change==='source-generation'){const d=await f.store.read();d.latestCollection.capturedAt=new Date(Date.parse(result.results[0].at)+1000).toISOString();await writeJSON(f.store.file,d);}if(change==='website-prices'){f.web.get('1002').productVariantDTOs[0].salePrice=299;await f.service.refresh({ids:['1002']});}assert.equal(hasPrice(await sync(f,await f.service.view())),change==='website-prices');}finally{await f.cleanup();}
});

test('明确选择持续提醒的价格通知保持选择',async()=>{
 const f=await batchFixture();try{const d=await f.store.read();d.sourceChanges.tasks[1].reminder={mode:'continue'};await writeJSON(f.store.file,d);assert.equal(hasPrice(await sync(f,await price(f))),true);}finally{await f.cleanup();}
});

test('旧批次未冻结提醒快照，后来核验仍符合有效人工目标则同步',async()=>{
 const f=await batchFixture();try{const result=await price(f,300);await legacy(f);const d=await f.store.read();d.sourceChanges.tasks[1].websiteReadAt=new Date(Date.parse(result.results[0].at)+1000).toISOString();await writeJSON(f.store.file,d);const updated=await sync(f,await f.service.view());assert.equal(hasPrice(updated),false);assert.equal(updated.reviewHistory.find(t=>t.id==='batch-task-1').completion.type,'price-aligned');}finally{await f.cleanup();}
});

test('同步后完整网站读取不重复生成本次调价通知，真正新价格仍提醒',async()=>{
 const f=await batchFixture();try{const result=await price(f);assert.equal(hasPrice(await sync(f,result)),false);let catalog=await f.catalog.syncMappingCatalog({listPage:async()=>({products:[...f.web.values()],totalCount:f.web.size})});let updated=await f.store.refreshSourceChanges({catalog,websiteCheck:'verified'});assert.ok(!updated.pending.some(t=>t.kind==='price'&&t.remoteProductId==='1002'));await new Promise(r=>setTimeout(r,5));f.web.get('1002').productVariantDTOs[0].salePrice=305;catalog=await f.catalog.syncMappingCatalog({listPage:async()=>({products:[...f.web.values()],totalCount:f.web.size})});updated=await f.store.refreshSourceChanges({catalog,websiteCheck:'verified'});assert.ok(updated.pending.some(t=>t.kind==='price'&&t.remoteProductId==='1002'));}finally{await f.cleanup();}
});

test('独立价格回读凭据不能顺便完成上下架待办',async()=>{
 const f=await batchFixture();try{const d=await f.store.read(),task=d.sourceChanges.tasks[0];d.sourceChanges.tasks.push({...task,id:'price-only-proof',kind:'price',fields:[{field:'cost',before:'125',after:'145'}]});await writeJSON(f.store.file,d);f.web.get('1001').publishStatus=0;f.web.get('1001').productVariantDTOs[0].productVariantInventoryDTO.availableStockQuantity=null;const row=(await f.service.view()).rows.find(r=>r.id==='1001');const result=await f.service.execute({kind:'price',items:[selection(row,'price',345)],confirmed:true,requestId:'independent-price-read-0001'});assert.equal(result.verifiedReads.find(r=>r.remoteProductId==='1001').kind,'price');const updated=await sync(f,result);assert.ok(!updated.pending.some(t=>t.id==='price-only-proof'));assert.ok(updated.pending.some(t=>t.id==='batch-task-0'));}finally{await f.cleanup();}
});
