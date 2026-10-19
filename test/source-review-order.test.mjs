import {confirmReminder} from './verified-reminder-helper.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,readdir,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {LocalInventoryStore} from '../src/inventory/local-store.mjs';
import {writeJSON} from '../src/core/files.mjs';
import {assignSourceKeys} from '../src/mapping/source-key.mjs';
import {sortSourceProducts,productSourceRow,sortSourceEntries} from '../ui/src/source-order.ts';
const item=(sourceName,sourceRow,stock='有货',cost='30')=>({sourceName,sourceRow,stock,cost,suggestedPrice:'90'});
const snap=(products,n=0)=>({capturedAt:`2026-10-07T01:00:${String(n).padStart(2,'0')}Z`,sheet:'Sheet1',quality:{passed:true,rawNamedRows:products.length},products});
const mapping=products=>assignSourceKeys(products).map((row,index)=>({...row,status:'正常',businessId:`SP${index}`}));
const site=(publishStatus=1,stockQuantity=5)=>({remoteProductId:'web0',productNumber:'SP0',name:'网站甲',websitePriceAed:300,publishStatus,stockKnown:true,stockQuantity,updatedAt:'2026-10-07T01:01:00Z'});
async function fixture(old,next,run){const directory=await mkdtemp(path.join(os.tmpdir(),'source-review-')),paths={state:path.join(directory,'state'),snapshots:path.join(directory,'snapshots')};await mkdir(paths.snapshots);const store=new LocalInventoryStore(paths);try{await store.recordCollection(snap(old));const doc=await store.read();doc.mappingRows=mapping(old);await writeJSON(store.file,doc);await store.refreshSourceChanges({catalog:{mappingCatalog:mapping(old).map((row,index)=>({...site(row.stock==='无货'?0:1),remoteProductId:`web${index}`,productNumber:row.businessId}))},websiteCheck:'verified'});await store.recordCollection(snap(next,1));await run(store,paths);}finally{await rm(directory,{recursive:true,force:true});}}
const catalog=(website=site(),at='2026-10-07T01:01:00Z')=>({mappingCatalog:[website],mappingCatalogRun:{at},products:[],dailyPending:[]});
const fresh=(store,data=catalog(),extra={})=>store.refreshSourceChanges({catalog:data,websiteCheck:'verified',...extra});
test('默认来源顺序使用真实映射行号，忽略网站名称数字，未知与歧义排末尾，分页前全表排序',()=>{
  const products=[{productNumber:'B',name:'001 任意名'},{productNumber:'A',name:'999 任意名'},{productNumber:'U'},{productNumber:'D'}],order=[{businessId:'A',sourceRows:[20,2]},{businessId:'B',sourceRow:12},{businessId:'D',sourceRow:3},{businessId:'D',sourceRow:5}];
  assert.deepEqual(sortSourceProducts(products,order).map(row=>row.productNumber),['A','B','U','D']);assert.equal(productSourceRow(products[3],order),null);
  assert.deepEqual(sortSourceEntries([{after:{sourceRow:30}},{before:{sourceRows:[2,4]}},{current:{sourceRow:10}}]).map(row=>row.current?.sourceRow||row.after?.sourceRow||row.before.sourceRows[0]),[2,10,30]);
});
test('价格与库存生成独立待办，库存一致不能自动关闭价格，价格确认不能关闭库存',async()=>fixture([item('甲',2)],[item('甲',2,'无货','40')],async store=>{
  let view=await fresh(store,catalog(site(1)));assert.deepEqual(view.pending.map(task=>task.kind).sort(),['modified','price']);const price=view.pending.find(task=>task.kind==='price');
  await assert.rejects(store.reviewSourceTask({taskId:price.id,operation:'close'}),/明确人工确认/);await store.reviewSourceTask({taskId:price.id,operation:'view'});await confirmReminder(store,{taskId:price.id,operation:'close',confirmed:true});
  view=await store.refreshSourceChanges({catalog:catalog(site(1))});assert.equal(view.pending.length,2);assert.ok(view.pending.find(task=>task.kind==='price').reviewed);
  view=await store.refreshReviewedReminders();assert.equal(view.pending.length,1);assert.equal(view.pending[0].kind,'modified');assert.equal(view.reviewHistory.find(task=>task.kind==='price').completion.type,'manual');
}));
test('已查看跨重启保留，刷新后明确人工关闭，完成记录跨重启保留',async()=>fixture([item('甲',2)],[item('甲',2,'无货')],async(store,paths)=>{
  let view=await fresh(store,catalog(site(1)));const id=view.pending[0].id;await store.reviewSourceTask({taskId:id,operation:'view'});await confirmReminder(store,{taskId:id,operation:'close',confirmed:true});store=new LocalInventoryStore(paths);
  view=await store.refreshSourceChanges({catalog:catalog(site(1))});assert.ok(view.pending[0].reviewed);assert.equal(view.pending.length,1);
  view=await store.refreshReviewedReminders();assert.equal(view.pending.length,0);assert.equal(view.reviewHistory[0].completion.type,'manual');
  view=await new LocalInventoryStore(paths).refreshSourceChanges({catalog:catalog(site(1))});assert.equal(view.reviewHistory[0].completion.type,'manual');
}));
test('库存无需点已查看，完整读取一致后记录系统完成；缓存一致不代表已完成',async()=>fixture([item('甲',2)],[item('甲',2,'无货')],async store=>{
  await fresh(store,catalog(site(1)));let view=await store.refreshSourceChanges({catalog:catalog(site(0))});assert.equal(view.pending.length,1);
  view=await fresh(store,catalog(site(0)));assert.equal(view.pending.length,0);assert.equal(view.reviewHistory[0].completion.type,'system');
}));
test('读取失败、未返回、未知数量、未知上架、重复编号及无完整来源均不能自动关闭',async()=>{
  const invalid=[{catalog:{mappingCatalog:[]},websiteCheck:'verified'},{catalog:catalog(site(0)),websiteCheck:'failed'},{catalog:catalog({...site(),stockQuantity:undefined}),websiteCheck:'verified'},{catalog:catalog({...site(),stockKnown:false}),websiteCheck:'verified'},{catalog:catalog({...site(),publishStatus:null}),websiteCheck:'verified'},{catalog:{mappingCatalog:[site(),{...site(),remoteProductId:'web1'}]},websiteCheck:'verified'}];
  for(const options of invalid)await fixture([item('甲',2,'无货')],[item('甲',2)],async store=>{const view=await store.refreshSourceChanges(options);assert.equal(view.pending.length,1,JSON.stringify(options));});
  await fixture([item('甲',2)],[item('甲',2,'无货')],async store=>{const doc=await store.read();doc.latestCollection.quality.passed=false;await writeJSON(store.file,doc);assert.equal((await fresh(store,catalog(site(0)))).pending.length,1);});
});
test('明确人工确认可以关闭网站读取失败时的提醒，但不伪装系统核验；未经确认仍保留',async()=>fixture([item('甲',2)],[item('甲',2,'无货')],async store=>{
  let view=await fresh(store,catalog(site(1)));await confirmReminder(store,{taskId:view.pending[0].id,operation:'close',confirmed:true});
  await store.refreshSourceChanges({catalog:catalog(site(1)),websiteCheck:'failed',applyReviewed:true});view=await store.refreshReviewedReminders();assert.equal(view.pending.length,0);assert.equal(view.report.websiteCheck,'failed');assert.equal(view.reviewHistory[0].completion.type,'manual');
}));
test('恢复持续提醒、再次价格变化和再次库存变化均保留或重新打开提醒',async()=>fixture([item('甲',2)],[item('甲',2,'无货','40')],async store=>{
  let view=await fresh(store,catalog(site(1))),price=view.pending.find(task=>task.kind==='price');await confirmReminder(store,{taskId:price.id,operation:'close',confirmed:true});await store.reviewSourceTask({taskId:price.id,operation:'continue'});
  view=await fresh(store,catalog(site(1)),{applyReviewed:true});assert.equal(view.pending.length,2);
  await confirmReminder(store,{taskId:price.id,operation:'close',confirmed:true});await store.recordCollection(snap([item('甲',10,'无货','50')],2));view=await fresh(store,catalog(site(1)),{applyReviewed:true});price=view.pending.find(task=>task.kind==='price');assert.equal(price.reviewed,undefined);assert.deepEqual(price.fields,[{field:'cost',before:'30',after:'50'}]);
  for(const task of view.pending)await confirmReminder(store,{taskId:task.id,operation:'close',confirmed:true});await store.refreshReviewedReminders();
  await store.recordCollection(snap([item('甲',10,'有货','60')],3));view=await fresh(store,catalog(site(0)),{applyReviewed:true});assert.equal(view.pending.length,2);assert.ok(view.pending.every(task=>!task.reviewed));
}));
test('网站售价变化单独提醒，重复读取不重复生成；网站与来源相等仍需人工',async()=>fixture([item('甲',2)],[item('甲',2)],async store=>{
  assert.equal((await fresh(store)).pending.length,0);
  const changed=catalog({...site(),websitePriceAed:310,updatedAt:'2026-10-07T02:00:00Z'},'2026-10-07T02:00:00Z');let view=await fresh(store,changed);assert.equal(view.pending.length,1);assert.deepEqual(view.pending[0].fields,[{field:'websitePriceAed',before:300,after:310}]);
  view=await fresh(store,changed);assert.equal(view.pending.length,1);await confirmReminder(store,{taskId:view.pending[0].id,operation:'close',confirmed:true});view=await store.refreshReviewedReminders();assert.equal(view.pending.length,0);
}));
test('升级3.4保存的价格变化记录补建人工提醒一次，已确认后不重复迁移',async()=>fixture([item('甲',2)],[item('甲',2,'有货','40')],async store=>{
  const doc=await store.read();doc.sourceChanges.tasks=[];delete doc.sourceChanges.priceTasksVersion;await writeJSON(store.file,doc);let view=await fresh(store);assert.equal(view.pending.length,1);await confirmReminder(store,{taskId:view.pending[0].id,operation:'close',confirmed:true});view=await store.refreshReviewedReminders();assert.equal(view.pending.length,0);assert.equal((await fresh(store)).pending.length,0);
}));
test('网站目录库存待办也可人工确认；重复状态隐藏，新状态重新提醒且保留旧记录',async()=>fixture([item('甲',2)],[item('甲',2)],async store=>{
  const product={...site(0),sourcePricing:{status:'matched',sourceName:'甲',sourceStock:'有货',sourceRow:2},kind:'publish',reason:'需要上架'};
  let data={...catalog(site(0)),dailyPending:[product]},view=await fresh(store,data);assert.equal(view.pending.length,1);assert.equal(view.pending[0].kind,'catalog');await confirmReminder(store,{taskId:view.pending[0].id,operation:'close',confirmed:true});
  view=await store.refreshReviewedReminders();assert.equal(view.pending.length,0);assert.equal(view.reviewHistory[0].completion.type,'manual');assert.equal((await fresh(store,data)).pending.length,0);
  data={...data,dailyPending:[{...product,stockQuantity:0,kind:'replenish'}]};view=await fresh(store,data);assert.equal(view.pending.length,1);assert.equal(view.pending[0].reviewed,undefined);assert.equal(view.reviewHistory.filter(task=>task.kind==='catalog').length,1);
}));
test('来源移行更新默认顺序而不重新提醒；重复网站对应关系不能给出排序或系统完成',async()=>fixture([item('甲',2),item('乙',3)],[item('甲',20),item('乙',2)],async store=>{
  let view=await fresh(store);assert.deepEqual(view.sourceOrder.map(row=>row.sourceRow),[2,20]);assert.equal(view.pending.length,0);
  const duplicate=mapping([item('甲',20),item('乙',2)]).map(row=>({...row,businessId:'SP0'}));view=await store.refreshSourceChanges({mappings:duplicate,catalog:catalog(),websiteCheck:'verified'});assert.equal(view.sourceOrder.length,0);
}));
test('本机刷新只移走人工关闭的价格，保留未查看库存，不改来源快照或核对时间；完成记录重启保留',async()=>fixture([item('甲',2)],[item('甲',2,'无货','40')],async(store,paths)=>{
  let view=await store.refreshSourceChanges({catalog:catalog(site(1)),websiteCheck:'failed'});
  const price=view.pending.find(task=>task.kind==='price');await confirmReminder(store,{taskId:price.id,operation:'close',confirmed:true});
  const before=await store.read(),files=await readdir(paths.snapshots),snapshots=await Promise.all(files.map(file=>readFile(path.join(paths.snapshots,file),'utf8')));
  view=await store.refreshReviewedReminders();assert.deepEqual(view.pending.map(task=>task.kind),['modified']);assert.equal(view.localRefresh.closed,1);assert.equal(view.report.id,before.sourceChanges.report.id);assert.equal(view.report.websiteCheck,'failed');
  const after=await store.read();assert.deepEqual(after.latestCollection,before.latestCollection);assert.deepEqual(after.current,before.current);assert.deepEqual(after.mappingRows,before.mappingRows);assert.deepEqual(after.sourceChanges.websitePriceBaseline,before.sourceChanges.websitePriceBaseline);
  assert.deepEqual(await readdir(paths.snapshots),files);assert.deepEqual(await Promise.all(files.map(file=>readFile(path.join(paths.snapshots,file),'utf8'))),snapshots);
  const completion=view.reviewHistory.find(task=>task.id===price.id);assert.equal(completion.completion.type,'manual');
  view=await new LocalInventoryStore(paths).refreshReviewedReminders();assert.equal(view.localRefresh.closed,0);assert.equal(view.reviewHistory.filter(task=>task.id===price.id).length,1);assert.equal(view.pending.length,1);
}));
test('本机刷新不自动核对未查看库存，取消或过期的关闭确认不能关闭提醒',async()=>fixture([item('甲',2)],[item('甲',2,'无货')],async store=>{
  let view=await fresh(store,catalog(site(1)));const id=view.pending[0].id;
  view=await store.refreshReviewedReminders();assert.equal(view.pending.length,1);assert.equal(view.localRefresh.closed,0);
  await confirmReminder(store,{taskId:id,operation:'close',confirmed:true});await store.reviewSourceTask({taskId:id,operation:'continue'});view=await store.refreshReviewedReminders();assert.equal(view.pending.length,1);
  await confirmReminder(store,{taskId:id,operation:'close',confirmed:true});const doc=await store.read();doc.sourceChanges.tasks.find(task=>task.id===id).reminder.fingerprint='已过期的虚构确认';await writeJSON(store.file,doc);
  view=await store.refreshReviewedReminders();assert.equal(view.pending.length,1);assert.equal(view.pending[0].reviewed,undefined);assert.equal(view.localRefresh.closed,0);
  await confirmReminder(store,{taskId:id,operation:'close',confirmed:true});view=await store.refreshReviewedReminders();assert.equal(view.pending.length,0);assert.equal(view.reviewHistory[0].completion.type,'manual');
}));
test('本机刷新仅关闭人工确认的网站目录待办，相同状态不复现，新变化仍重新提醒',async()=>fixture([item('甲',2)],[item('甲',2)],async(store,paths)=>{
  const product={...site(0),sourcePricing:{status:'matched',sourceName:'甲',sourceStock:'有货',sourceRow:2},kind:'publish',reason:'需要上架'},other={...product,remoteProductId:'web-other',productNumber:'OTHER',sourcePricing:{status:'unmatched',sourceName:'乙'},reason:'乙需要人工处理'};
  const data={...catalog(site(0)),dailyPending:[product,other]};let view=await fresh(store,data);const selected=view.pending.find(task=>task.businessId==='SP0');await confirmReminder(store,{taskId:selected.id,operation:'close',confirmed:true});
  view=await store.refreshReviewedReminders();assert.equal(view.localRefresh.closed,1);assert.equal(view.pending.length,1);assert.equal(view.pending[0].businessId,'OTHER');assert.equal(view.reviewHistory.find(task=>task.id===selected.id).completion.type,'manual');
  view=await new LocalInventoryStore(paths).refreshSourceChanges({catalog:data});assert.equal(view.pending.length,1);
  view=await fresh(store,{...data,dailyPending:[{...product,stockQuantity:0,kind:'replenish'},other]});assert.equal(view.pending.length,2);assert.ok(view.pending.every(task=>!task.reviewed));
}));
