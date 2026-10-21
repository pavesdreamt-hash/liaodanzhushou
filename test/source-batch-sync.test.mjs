import test from 'node:test';
import assert from 'node:assert/strict';
import {batchFixture,selection} from './fixtures/inventory-batch.mjs';
import {writeJSON} from '../src/core/files.mjs';
import {InventoryBatchEdit} from '../src/inventory/batch-edit.mjs';

const reconcile=async(f,batch)=>f.store.refreshSourceChanges({catalog:await f.catalog.getView(),verifiedReads:batch?.verifiedReads});
async function execute(f,id,target,requestId='source-sync-request-0001'){
 const row=(await f.service.view()).rows.find(r=>r.id===id);
 return f.service.execute({kind:'listing',listingMode:target===1?'publish':'unpublish',items:[selection(row,'listing',target)],confirmed:true,requestId});
}
async function addPrice(f){const d=await f.store.read(),stock=d.sourceChanges.tasks[0];d.sourceChanges.tasks.push({...stock,id:'independent-price',kind:'price',fields:[{field:'cost',before:'125',after:'145'}]});await writeJSON(f.store.file,d);}

test('仅上下架回读证据同步来源待办，不代替价格核对，重启/重复请求不重写',async()=>{
 const f=await batchFixture();try{
  await addPrice(f);const result=await execute(f,'1001',0);assert.equal(result.results[0].status,'success');
  // Reproduces the old path: catalog already aligned, but no read proof passed.
  const old=await reconcile(f);assert.ok(old.pending.some(t=>t.id==='batch-task-0'));
  const updated=await reconcile(f,result);assert.ok(!updated.pending.some(t=>t.id==='batch-task-0'));assert.ok(updated.pending.some(t=>t.id==='batch-task-2'));assert.ok(updated.pending.some(t=>t.id==='independent-price'));
  const completed=updated.reviewHistory.filter(t=>t.id==='batch-task-0');assert.equal(completed.length,1);assert.equal(completed[0].completion.verification,'product-read');
  f.service=new InventoryBatchEdit({store:f.store,catalog:f.catalog,connection:f.connection});
  const duplicate=await execute(f,'1001',0);assert.equal(duplicate.duplicate,true);assert.equal(f.calls.writes.length,1);
  const reopened=await reconcile(f,await f.service.view());assert.equal(reopened.reviewHistory.filter(t=>t.id==='batch-task-0').length,1);assert.ok(reopened.pending.some(t=>t.id==='independent-price'));
 }finally{await f.cleanup();}
});

test('上架回读只完成对应来源待办，不把整个网站目录当作已核验',async()=>{
 const f=await batchFixture();try{const result=await execute(f,'1003',1),updated=await reconcile(f,result);assert.equal(result.results[0].status,'success');assert.ok(!updated.pending.some(t=>t.id==='batch-task-2'));assert.ok(updated.pending.some(t=>t.id==='batch-task-0'));assert.equal(updated.report.websiteCheck,'pending');}finally{await f.cleanup();}
});

test('网站人工修改后读取单品可移走已完成上下架，未读取商品仍保留',async()=>{
 const f=await batchFixture();try{f.web.get('1001').publishStatus=0;const refreshed=await f.service.refresh({ids:['1001']}),updated=await reconcile(f,refreshed);assert.ok(!updated.pending.some(t=>t.id==='batch-task-0'));assert.ok(updated.pending.some(t=>t.id==='batch-task-2'));assert.equal(f.calls.writes.length,0);}finally{await f.cleanup();}
});

for(const mutation of ['generation','source-price','website','mapping','quality'])test(`来源/网站已变化的回读凭据不能关闭待办：${mutation}`,async()=>{
 const f=await batchFixture();try{
  const result=await execute(f,'1001',0),d=await f.store.read();
  if(mutation==='generation')d.latestCollection.capturedAt='2026-10-21T09:00:00.000Z';
  if(mutation==='source-price')d.latestCollection.products[0].cost='146';
  if(mutation==='mapping')d.mappingRows.push({...d.mappingRows[0],sourceName:'另一个来源'});
  if(mutation==='quality')d.latestCollection.quality.passed=false;
  await writeJSON(f.store.file,d);
  const catalog=await f.catalog.getView();if(mutation==='website')for(const key of ['products','archivedProducts','mappingCatalog'])for(const p of catalog[key]||[])if(p.remoteProductId==='1001')p.stockQuantity=99;
  const updated=await f.store.refreshSourceChanges({catalog,verifiedReads:result.verifiedReads});assert.ok(updated.pending.some(t=>t.id==='batch-task-0'));
 }finally{await f.cleanup();}
});

for(const mode of ['read-failed','uncertain'])test(`失败或回读不确定不关闭来源待办：${mode}`,async()=>{
 const f=await batchFixture();try{
  if(mode==='read-failed')f.faults.read='1001';else f.faults.writeAfter=true;
  const result=await execute(f,'1001',0);assert.equal(result.results[0].status,mode==='read-failed'?'failed':'uncertain');
  assert.ok(!result.verifiedReads.some(r=>r.remoteProductId==='1001'));const updated=await reconcile(f,result);assert.ok(updated.pending.some(t=>t.id==='batch-task-0'));
 }finally{await f.cleanup();}
});

test('明确选择持续提醒的通知保持选择，回读凭据不会覆盖人工决定',async()=>{
 const f=await batchFixture();try{const d=await f.store.read();d.sourceChanges.tasks[0].reminder={mode:'continue'};await writeJSON(f.store.file,d);const result=await execute(f,'1001',0),updated=await reconcile(f,result),task=updated.pending.find(t=>t.id==='batch-task-0');assert.equal(task.reminder.mode,'continue');assert.match(task.reason,/持续提醒/);}finally{await f.cleanup();}
});

test('同批部分成功只同步成功项，失败项与价格提醒保留',async()=>{
 const f=await batchFixture();try{
  const d=await f.store.read(),source=d.latestCollection.products[1];source.stock='无货';d.sourceChanges.tasks.push({id:'partial-stock',kind:'modified',before:{...source,stock:'有货'},after:source,fields:[]});await writeJSON(f.store.file,d);
  const view=await f.service.view();f.faults.read='1002';const result=await f.service.execute({kind:'listing',listingMode:'unpublish',confirmed:true,requestId:'source-sync-partial-0001',items:['1001','1002'].map(id=>selection(view.rows.find(r=>r.id===id),'listing',0))});
  assert.deepEqual(result.results.map(r=>r.status),['success','failed']);const updated=await reconcile(f,result);assert.ok(!updated.pending.some(t=>t.id==='batch-task-0'));assert.ok(updated.pending.some(t=>t.id==='partial-stock'));assert.ok(updated.pending.some(t=>t.id==='batch-task-1'));
 }finally{await f.cleanup();}
});
