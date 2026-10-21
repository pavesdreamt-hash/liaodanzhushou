import test from 'node:test';import assert from 'node:assert/strict';
import {batchFixture,selection} from './fixtures/inventory-batch.mjs';import {writeJSON} from '../src/core/files.mjs';
const sync=async(f,view)=>{view||=await f.service.view();return f.store.refreshSourceChanges({catalog:await f.catalog.getView(),verifiedReads:view.verifiedReads,priceCompletions:view.priceCompletions});};
async function priceTask(f,index=0,id='aligned-price'){const d=await f.store.read(),source=d.latestCollection.products[index];d.sourceChanges.tasks.push({id,kind:'price',before:{...source},after:{...source},current:{...source},remoteProductId:String(1001+index),businessId:d.mappingRows[index].businessId,fields:[{field:'websitePriceAed',before:270,after:275}],createdAt:new Date().toISOString()});await writeJSON(f.store.file,d);}

test('003完整复现：旧提交待核对但网站已改好，后续来源/读取生成的新提醒自动完成',async()=>{
 const f=await batchFixture();try{
  let d=await f.store.read();Object.assign(d.latestCollection.products[0],{cost:'75',suggestedPrice:'200'});await writeJSON(f.store.file,d);const raw=f.web.get('1001');raw.publishStatus=0;raw.productVariantDTOs[0].salePrice=270;raw.productVariantDTOs[0].productVariantInventoryDTO.availableStockQuantity=3;
  await f.service.refresh({ids:['1001']});let row=(await f.service.view()).rows.find(r=>r.id==='1001');f.faults.writeAfter=true;const failed=await f.service.execute({kind:'price',items:[selection(row,'price',275)],confirmed:true,requestId:'003-old-uncertain-price'});assert.equal(failed.results[0].status,'uncertain');assert.equal(raw.productVariantDTOs[0].salePrice,275);f.faults.writeAfter=false;
  d=await f.store.read();d.latestCollection.capturedAt=new Date().toISOString();await writeJSON(f.store.file,d);await priceTask(f);await f.catalog.readOne({remoteProductId:'1001',readProduct:async()=>raw,expectedProductNumber:row.businessId});
  const before=await f.store.read();assert.ok(before.sourceChanges.tasks.some(t=>t.id==='aligned-price'&&!t.resolved));const updated=await sync(f);assert.ok(!updated.pending.some(t=>t.id==='aligned-price'));const completed=updated.reviewHistory.find(t=>t.id==='aligned-price');assert.equal(completed.completion.type,'price-aligned');assert.equal(completed.completion.targetFils,27500);assert.equal(completed.completion.manualTarget,false);assert.equal((await f.service.state()).history[0].results[0].status,'uncertain');assert.equal(f.calls.writes.length,1);
 }finally{await f.cleanup();}
});

test('没有成功批次也可根据当前已读取达标价格移走提醒，不请求网站或关闭其它上下架',async()=>{
 const f=await batchFixture();try{await priceTask(f);const updated=await sync(f);assert.ok(!updated.pending.some(t=>t.id==='aligned-price'));assert.ok(updated.pending.some(t=>t.id==='batch-task-0'));assert.equal(f.calls.reads.length,0);assert.equal(f.calls.writes.length,0);}finally{await f.cleanup();}
});

test('仅读取网站人工改好的新价格即可移走，低于参考时保留',async()=>{
 const f=await batchFixture();try{assert.ok((await sync(f)).pending.some(t=>t.id==='batch-task-1'));f.web.get('1002').productVariantDTOs[0].salePrice=310;const view=await f.service.refresh({ids:['1002']});assert.ok(!(await sync(f,view)).pending.some(t=>t.id==='batch-task-1'));assert.equal(f.calls.writes.length,0);}finally{await f.cleanup();}
});

test('人工认可较低目标不依赖旧批次时间，新的来源价格使认可失效',async()=>{
 const f=await batchFixture();try{let row=(await f.service.view()).rows.find(r=>r.id==='1002');await f.service.execute({kind:'price',items:[selection(row,'price',300)],allowBelowReference:true,confirmed:true,requestId:'manual-price-goal-aligned'});await f.service.mutateState(s=>s.history=[]);let d=await f.store.read();d.latestCollection.capturedAt=new Date().toISOString();await writeJSON(f.store.file,d);let updated=await sync(f);assert.ok(!updated.pending.some(t=>t.id==='batch-task-1'));assert.equal(updated.reviewHistory.find(t=>t.id==='batch-task-1').completion.manualTarget,true);assert.equal(f.calls.writes.length,0);
  d=await f.store.read();d.latestCollection.products[1].cost='111';d.sourceChanges.tasks.push({...d.sourceChanges.tasks.find(t=>t.id==='batch-task-1'),id:'new-source-cost',resolved:false,completion:undefined,fields:[{field:'cost',before:'110',after:'111'}]});await writeJSON(f.store.file,d);updated=await sync(f);assert.ok(updated.pending.some(t=>t.id==='new-source-cost'));
 }finally{await f.cleanup();}
});

for(const fault of ['ambiguous','bad-source','missing-price','low-sku','unknown-reference'])test(`资料不足或真正需要处理仍提示：${fault}`,async()=>{
 const f=await batchFixture();try{await priceTask(f);const d=await f.store.read();if(fault==='ambiguous')d.mappingRows.push({...d.mappingRows[0]});if(fault==='bad-source')d.latestCollection.quality.passed=false;if(fault==='unknown-reference')d.latestCollection.products[0].suggestedPrice='260-280';await writeJSON(f.store.file,d);if(fault==='missing-price'||fault==='low-sku'){const raw=f.web.get('1001');raw.productVariantDTOs[0].salePrice=fault==='missing-price'?null:344;await f.catalog.readOne({remoteProductId:'1001',readProduct:async()=>raw});}assert.ok((await sync(f)).pending.some(t=>t.id==='aligned-price'));}finally{await f.cleanup();}
});

test('最近读取失败时不凭旧缓存关闭，后续成功目录读取可恢复核对',async()=>{
 const f=await batchFixture();try{await priceTask(f);f.faults.read='1001';await f.service.refresh({ids:['1001']});assert.ok((await sync(f)).pending.some(t=>t.id==='aligned-price'));await new Promise(r=>setTimeout(r,5));await f.catalog.readOne({remoteProductId:'1001',readProduct:async()=>f.web.get('1001')});assert.ok(!(await sync(f)).pending.some(t=>t.id==='aligned-price'));}finally{await f.cleanup();}
});

test('当前状态核对仍尊重明确持续提醒',async()=>{
 const f=await batchFixture();try{await priceTask(f);const d=await f.store.read();d.sourceChanges.tasks.find(t=>t.id==='aligned-price').reminder={mode:'continue'};await writeJSON(f.store.file,d);assert.equal((await sync(f)).pending.find(t=>t.id==='aligned-price').reminder.mode,'continue');}finally{await f.cleanup();}
});

test('读取期间来源或网站变化拒绝旧状态凭据',async()=>{
 const f=await batchFixture();try{await priceTask(f);const view=await f.service.view(),d=await f.store.read();d.latestCollection.products[0].cost='146';await writeJSON(f.store.file,d);assert.ok((await sync(f,view)).pending.some(t=>t.id==='aligned-price'));}finally{await f.cleanup();}
});

test('新目录优先于旧归档/在售记录；达标与不足按新SKU价格判断',async()=>{
 const f=await batchFixture();try{await priceTask(f,1);await new Promise(r=>setTimeout(r,5));f.web.get('1002').productVariantDTOs[0].salePrice=320;await f.catalog.syncMappingCatalog({listPage:async()=>({products:[...f.web.values()],totalCount:f.web.size})});let row=(await f.service.view()).rows.find(r=>r.id==='1002');assert.equal(row.variants[0].salePrice,320);assert.ok(!(await sync(f)).pending.some(t=>t.id==='aligned-price'));
  await priceTask(f,1,'later-low-price');await new Promise(r=>setTimeout(r,5));f.web.get('1002').productVariantDTOs[0].salePrice=305;await f.catalog.syncMappingCatalog({listPage:async()=>({products:[...f.web.values()],totalCount:f.web.size})});row=(await f.service.view()).rows.find(r=>r.id==='1002');assert.equal(row.variants[0].salePrice,305);assert.ok((await sync(f)).pending.some(t=>t.id==='later-low-price'));
 }finally{await f.cleanup();}
});

test('整表读取同次产生的已达标网站价格提醒当次完成，不再要求二次刷新',async()=>{
 const f=await batchFixture();try{const d=await f.store.read();d.sourceChanges.websitePrices={'1001':{price:340,at:'2026-10-20T08:00:00.000Z'}};await writeJSON(f.store.file,d);const batch=await f.service.view(),catalog=await f.catalog.getView(),updated=await f.store.refreshSourceChanges({catalog,websiteCheck:'verified',verifiedReads:batch.verifiedReads,priceCompletions:batch.priceCompletions});assert.ok(!updated.pending.some(t=>t.kind==='price'&&t.remoteProductId==='1001'));assert.ok(updated.reviewHistory.some(t=>t.kind==='price'&&t.remoteProductId==='1001'&&t.completion.type==='price-aligned'));}finally{await f.cleanup();}
});
