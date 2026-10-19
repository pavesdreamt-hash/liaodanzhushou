import {confirmReminder} from './verified-reminder-helper.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {LocalInventoryStore} from '../src/inventory/local-store.mjs';
import {writeJSON} from '../src/core/files.mjs';
import {assignSourceKeys} from '../src/mapping/source-key.mjs';
import {Orchestrator} from '../src/services/orchestrator.mjs';
const old={sourceName:'原商品（虚构）',sourceRow:2,cost:'30',suggestedPrice:'90',stock:'有货'};
const six={sourceName:'006 雅洛琳（虚构）',sourceRow:21,cost:'95',suggestedPrice:'230',stock:'无货'};
const seven={sourceName:'007 双头5代（虚构）',sourceRow:22,cost:'95',suggestedPrice:'230',stock:'有货'};
const snapshot=(products,n=0)=>({capturedAt:`2026-10-09T01:00:${String(n).padStart(2,'0')}Z`,sheet:'Sheet1',quality:{passed:true},products});
const web=(number='OLD',publishStatus=1,stockQuantity=5)=>({remoteProductId:`web-${number}`,productNumber:number,name:`网站${number}（虚构）`,publishStatus,stockKnown:true,stockQuantity,websitePriceAed:300});
const relation=(source,number)=>({...assignSourceKeys([source])[0],businessId:number,status:'正常'});
const catalog=(products=[web(),web('006',0,10),web('007',1,9)])=>({mappingCatalog:products,mappingCatalogRun:{at:'2026-10-09T01:01:00Z'},dailyPending:[]});
const fresh=(store,data=catalog())=>store.refreshSourceChanges({catalog:data,websiteCheck:'verified'});
const close=(store,id)=>confirmReminder(store,{taskId:id,operation:'close',confirmed:true});
async function fixture(run,next=[old,six,seven]){const directory=await mkdtemp(path.join(os.tmpdir(),'reminder-controls-')),paths={state:path.join(directory,'state'),snapshots:path.join(directory,'snapshots')};await mkdir(paths.snapshots);const store=new LocalInventoryStore(paths);try{await store.recordCollection(snapshot([old]));let doc=await store.read();doc.mappingRows=[relation(old,'OLD')];await writeJSON(store.file,doc);await fresh(store);await store.recordCollection(snapshot(next,1));await fresh(store);await run(store,paths);}finally{await rm(directory,{recursive:true,force:true});}}
test('006/007已有网站但关系未确认：查看与持续提醒独立，人工确认关闭才由本机刷新移走',async()=>fixture(async store=>{
 let view=await fresh(store),task=view.pending.find(row=>row.current.sourceName===seven.sourceName);assert.equal(task.newProductPending,true);
 await store.reviewSourceTask({taskId:task.id,operation:'view'});view=await store.refreshReviewedReminders();assert.equal(view.pending.length,2);assert.ok(view.pending.find(row=>row.id===task.id).reviewed);assert.equal(view.pending.find(row=>row.id===task.id).reminder,undefined);
 await store.reviewSourceTask({taskId:task.id,operation:'continue'});await store.reviewSourceTask({taskId:task.id,operation:'exit'});await assert.rejects(store.reviewSourceTask({taskId:task.id,operation:'close'}),/人工确认/);
 await close(store,task.id);view=await fresh(store);assert.equal(view.pending.length,2);assert.equal(view.pending.find(row=>row.id===task.id).reminder.mode,'close-pending');
 const before=await store.read();view=await store.refreshReviewedReminders();assert.equal(view.pending.length,1);assert.equal(view.pending[0].current.sourceName,six.sourceName);assert.equal(view.reviewHistory.find(row=>row.id===task.id).completion.notificationOnly,true);assert.deepEqual((await store.read()).mappingRows,before.mappingRows);assert.deepEqual((await store.read()).current,before.current);assert.deepEqual((await store.read()).latestCollection,before.latestCollection);
}));
test('否或恢复持续提醒保留已查看记录，跨刷新和重启保留，重复同步不恢复已人工关闭项',async()=>fixture(async(store,paths)=>{
 let task=(await fresh(store)).pending[0];await store.reviewSourceTask({taskId:task.id,operation:'view'});await store.reviewSourceTask({taskId:task.id,operation:'continue'});await store.reviewSourceTask({taskId:task.id,operation:'exit'});await store.reviewSourceTask({taskId:task.id,operation:'continue'});
 let view=await new LocalInventoryStore(paths).refreshReviewedReminders();assert.equal(view.pending.find(row=>row.id===task.id).reminder.mode,'continue');assert.ok(view.pending.find(row=>row.id===task.id).reviewed);
 await close(store,task.id);await store.reviewSourceTask({taskId:task.id,operation:'continue'});view=await store.refreshReviewedReminders();assert.equal(view.localRefresh.closed,0);
 await close(store,task.id);await store.refreshReviewedReminders();await store.recordCollection(snapshot([old,six,seven],2));view=await fresh(new LocalInventoryStore(paths));assert.equal(view.report.summary.added,0);assert.equal(view.pending.filter(row=>row.id===task.id).length,0);assert.equal(view.reviewHistory.filter(row=>row.id===task.id).length,1);
}));
test('明确持续提醒覆盖库存自动完成；默认库存仍按原完整回读规则自动完成',async()=>fixture(async store=>{
 let doc=await store.read();doc.mappingRows=[relation(old,'OLD'),relation(six,'SIX'),relation(seven,'SEVEN')];await writeJSON(store.file,doc);
 let view=await fresh(store,catalog([web(),web('SIX',1,10),web('SEVEN',0,9)])),pinned=view.pending.find(row=>row.current.sourceName===six.sourceName);await store.reviewSourceTask({taskId:pinned.id,operation:'continue'});
 view=await fresh(store,catalog([web(),web('SIX',0,10),web('SEVEN',1,9)]));assert.equal(view.pending.length,1);assert.equal(view.pending[0].id,pinned.id);assert.equal(view.pending[0].reminder.mode,'continue');assert.ok(view.reviewHistory.some(row=>row.current.sourceName===seven.sourceName&&row.completion.type==='system'));
 await close(store,pinned.id);assert.equal((await store.refreshReviewedReminders()).pending.length,0);
}));
test('已关闭商品仅移行不重新提醒；新库存与价格变化产生新的待查看提醒',async()=>fixture(async store=>{
 let view=await fresh(store);for(const task of view.pending)await close(store,task.id);await store.refreshReviewedReminders();
 await store.recordCollection(snapshot([old,{...six,sourceRow:51},{...seven,sourceRow:52}],2));view=await fresh(store);assert.equal(view.pending.length,0);assert.equal(view.report.summary.moved,2);
 await store.recordCollection(snapshot([old,{...six,sourceRow:51},{...seven,sourceRow:52,stock:'无货',suggestedPrice:'250'}],3));view=await fresh(store);assert.deepEqual(view.pending.map(row=>row.kind).sort(),['modified','price']);assert.ok(view.pending.every(row=>!row.reviewed&&!row.reminder));assert.equal(view.pending.filter(row=>row.newProductPending).length,0);
}));
test('新变化清除持续提醒选择与旧已查看；旧关闭确认指纹不能关闭新状态',async()=>fixture(async store=>{
 let task=(await fresh(store)).pending.find(row=>row.current.sourceName===seven.sourceName);await store.reviewSourceTask({taskId:task.id,operation:'view'});await store.reviewSourceTask({taskId:task.id,operation:'continue'});const stale=(await store.reviewSourceTask({taskId:task.id,operation:'exit'})).pending.find(row=>row.id===task.id).reminder.fingerprint;
 await store.recordCollection(snapshot([old,six,{...seven,stock:'无货'}],2));let view=await fresh(store);task=view.pending.find(row=>row.id===task.id);await assert.rejects(store.reviewSourceTask({taskId:task.id,operation:'close',confirmed:true,fingerprint:stale}),/新的变化/);assert.equal(task.reviewed,undefined);assert.equal(task.reminder,undefined);
 await close(store,task.id);let doc=await store.read();doc.sourceChanges.tasks.find(row=>row.id===task.id).reminder.fingerprint='另一状态';await writeJSON(store.file,doc);view=await store.refreshReviewedReminders();assert.equal(view.localRefresh.closed,0);assert.equal(view.pending.find(row=>row.id===task.id).reminder,undefined);
}));
test('旧已查看记录仅表示看过，价格始终须人工关闭，库存一致不自动关闭价格',async()=>fixture(async store=>{
 let view=await fresh(store),price=view.pending.find(row=>row.kind==='price');await store.reviewSourceTask({taskId:price.id,confirmed:true});view=await store.refreshReviewedReminders();assert.equal(view.pending.length,1);assert.ok(view.pending[0].reviewed);assert.equal(view.pending[0].reminder,undefined);
 await close(store,price.id);view=await store.refreshReviewedReminders();assert.equal(view.pending.length,0);assert.match(view.reviewHistory[0].completion.reason,/人工核对价格/);
},[{...old,cost:'40'}]));
test('网站目录持续提醒、取消关闭及人工关闭跨重启保留，新网站库存状态重新提醒',async()=>fixture(async(store,paths)=>{
 const product={...web('CAT',0,0),sourcePricing:{status:'matched',sourceName:'目录商品（虚构）',sourceStock:'有货',sourceRow:30},kind:'replenish',reason:'补库存'};const data={...catalog(),dailyPending:[product]};let view=await fresh(store,data),task=view.pending[0];await store.reviewSourceTask({taskId:task.id,operation:'view'});await store.reviewSourceTask({taskId:task.id,operation:'continue'});view=await new LocalInventoryStore(paths).refreshReviewedReminders();assert.equal(view.pending[0].reminder.mode,'continue');assert.ok(view.pending[0].reviewed);
 await close(store,task.id);await store.refreshReviewedReminders();assert.equal((await fresh(new LocalInventoryStore(paths),data)).pending.length,0);
 view=await fresh(store,{...data,dailyPending:[{...product,stockQuantity:3,kind:'publish'}]});assert.equal(view.pending.length,1);assert.equal(view.pending[0].reviewed,undefined);assert.equal(view.pending[0].reminder,undefined);assert.equal(view.reviewHistory.filter(row=>row.id===task.id).length,1);
},[old]));
test('人工关闭身份提醒只关闭通知，不把疑似替换变成身份确认或可自动下架的旧商品',async()=>fixture(async store=>{
 let doc=await store.read();const task={id:'identity-fictional',kind:'review',before:old,after:{...old,sourceName:'身份不确定新品（虚构）'},current:{...old,sourceName:'身份不确定新品（虚构）'},reason:'身份待核对',resolved:false};doc.sourceChanges.tasks.push(task);await writeJSON(store.file,doc);await close(store,task.id);await store.refreshReviewedReminders();
 const fake={loadPending:async()=>({source:doc.latestCollection,mappingState:{rows:[{...relation(old,'OLD'),status:'来源已移除'}]}}),localStore:store};const products=await Orchestrator.prototype.confirmedSourceProducts.call(fake);assert.equal(products[0].identityUncertain,true);assert.equal(products[0].removed,false);const saved=(await store.read()).sourceChanges.tasks.find(row=>row.id===task.id);assert.equal(saved.completion.notificationOnly,true);assert.equal(saved.decision,undefined);
}));
