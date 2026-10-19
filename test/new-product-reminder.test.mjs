import {confirmReminder} from './verified-reminder-helper.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {LocalInventoryStore} from '../src/inventory/local-store.mjs';
import {writeJSON} from '../src/core/files.mjs';
import {assignSourceKeys} from '../src/mapping/source-key.mjs';
const old={sourceName:'原商品',sourceRow:2,cost:'30',suggestedPrice:'90',stock:'有货'};
const added={sourceName:'YB71（虚构）',sourceRow:119,cost:'45',suggestedPrice:'220',stock:'有货'};
const snap=(products,n)=>({capturedAt:`2026-10-08T01:00:${String(n).padStart(2,'0')}Z`,sheet:'Sheet1',quality:{passed:true},products});
const relation=(row,businessId)=>({...assignSourceKeys([row])[0],businessId,status:'正常'});
const web=(productNumber='OLD',publishStatus=1,stockQuantity=5)=>({remoteProductId:`web-${productNumber}`,productNumber,name:'虚构网站商品',publishStatus,stockKnown:true,stockQuantity});
const catalog=products=>({mappingCatalog:products,mappingCatalogRun:{at:'2026-10-08T01:01:00Z'}});
async function fixture(run){
  const directory=await mkdtemp(path.join(os.tmpdir(),'new-product-reminder-')),paths={state:path.join(directory,'state'),snapshots:path.join(directory,'snapshots')};await mkdir(paths.snapshots);const store=new LocalInventoryStore(paths);
  try{await store.recordCollection(snap([old],0));const doc=await store.read();doc.mappingRows=[relation(old,'OLD')];await writeJSON(store.file,doc);await store.refreshSourceChanges({catalog:catalog([web()]),websiteCheck:'verified'});await store.recordCollection(snap([old,added],1));await run(store,paths);}finally{await rm(directory,{recursive:true,force:true});}
}
const fresh=(store,products=[web()],extra={})=>store.refreshSourceChanges({catalog:catalog(products),websiteCheck:'verified',...extra});
test('重复同步本次新增0不覆盖首次新增待办；库存/价格变化及移行仍保留新增性质',async()=>fixture(async store=>{
  let view=await fresh(store),task=view.pending[0];assert.equal(task.kind,'added');assert.equal(task.newProductPending,true);const id=task.id;
  await store.recordCollection(snap([old,added],2));view=await fresh(store);assert.equal(view.report.summary.added,0);assert.equal(view.pending[0].id,id);assert.equal(view.pending[0].originKind,'added');
  await store.recordCollection(snap([old,{...added,sourceRow:121,stock:'无货',cost:'46'}],3));view=await fresh(store);task=view.pending.find(task=>task.originKind==='added');assert.equal(task.id,id);assert.equal(task.kind,'added');assert.equal(task.newProductPending,true);assert.equal(task.current.sourceRow,121);assert.equal(task.current.stock,'无货');assert.equal(view.pending.filter(task=>task.originKind==='added').length,1);assert.equal(view.pending.filter(task=>task.kind==='price').length,1);
}));
test('已查看、本机刷新与重启仍保留未对应新品，非新增价格提醒经单品核验人工确认后移走',async()=>fixture(async(store,paths)=>{
  let view=await fresh(store),task=view.pending[0];await store.reviewSourceTask({taskId:task.id,confirmed:true});const before=await store.read();
  view=await store.refreshReviewedReminders();assert.equal(view.pending.length,1);assert.equal(view.localRefresh.closed,0);assert.ok(view.pending[0].reviewed);assert.equal(view.pending[0].newProductPending,true);assert.deepEqual((await store.read()).latestCollection,before.latestCollection);
  view=await new LocalInventoryStore(paths).refreshReviewedReminders();assert.equal(view.pending[0].id,task.id);assert.equal(view.localRefresh.closed,0);
  await store.recordCollection(snap([{...old,cost:'40'},added],2));view=await fresh(store);const price=view.pending.find(task=>task.kind==='price');await confirmReminder(store,{taskId:price.id,operation:'close',confirmed:true});view=await store.refreshReviewedReminders();assert.equal(view.localRefresh.closed,1);assert.equal(view.pending.length,1);assert.equal(view.pending[0].originKind,'added');assert.equal(view.reviewHistory.find(task=>task.id===price.id).completion.type,'manual');
}));
test('网站实际存在且唯一对应成功回读后结束新增标记；后续补库存/上架仍按原规则',async()=>fixture(async store=>{
  await fresh(store);let doc=await store.read();doc.mappingRows.push(relation(added,'NEW'));await writeJSON(store.file,doc);
  let view=await fresh(store,[web(),web('NEW',0,0)]),task=view.pending[0];assert.equal(task.newProductPending,false);assert.equal(task.newProductMatch.remoteProductId,'web-NEW');assert.equal(task.action,'replenish');assert.equal(task.resolved,false);
  await confirmReminder(store,{taskId:task.id,operation:'close',confirmed:true});view=await store.refreshReviewedReminders();assert.equal(view.pending.length,0);assert.equal(view.localRefresh.closed,1);
}));
test('仅填编号、缓存/读取失败/未返回/歧义/不完整快照不能结束新增持续提醒',async()=>{
  for(const mode of ['missing','cached','failed','duplicate','quality','source-duplicate','incomplete-missing'])await fixture(async store=>{
    let doc=await store.read();doc.mappingRows.push(relation(added,'NEW'));if(mode==='quality'||mode==='incomplete-missing')doc.latestCollection.quality.passed=false;if(mode==='source-duplicate')doc.latestCollection.products.push({...added,sourceRow:120});if(mode==='incomplete-missing')doc.latestCollection.products=[old];await writeJSON(store.file,doc);
    const products=mode==='missing'?[web()]:mode==='duplicate'?[web(),web('NEW'),{...web('NEW'),remoteProductId:'web-other'}]:[web(),web('NEW')];
    const options={catalog:catalog(products),...(mode==='cached'?{}:{websiteCheck:mode==='failed'?'failed':'verified'})};
    let view=await store.refreshSourceChanges(options),task=view.pending[0];assert.equal(task.newProductPending,true,mode);assert.equal(task.resolved,false,mode);await store.reviewSourceTask({taskId:task.id,confirmed:true});view=await store.refreshReviewedReminders();assert.equal(view.pending.length,1,mode);assert.equal(view.localRefresh.closed,0,mode);
  });
});
test('旧版已人工关闭的新品保持关闭，保留原人工历史，不自动恢复',async()=>fixture(async(store,paths)=>{
  let view=await fresh(store),doc=await store.read(),task=doc.sourceChanges.tasks.find(task=>task.id===view.pending[0].id);task.kind='modified';delete task.originKind;delete task.newProductPending;task.resolved=true;task.completion={type:'manual',at:'2026-10-08T01:01:00Z'};doc.sourceChanges.reviewHistory=[structuredClone(task)];await writeJSON(store.file,doc);
  view=await new LocalInventoryStore(paths).refreshReviewedReminders();assert.equal(view.pending.length,0);assert.equal((await store.read()).sourceChanges.tasks.find(saved=>saved.id===task.id).originKind,'added');assert.equal(view.reviewHistory.length,1);assert.equal(view.reviewHistory[0].completion.type,'manual');assert.equal((await store.refreshReviewedReminders()).pending.length,0);
}));
test('真正来源删除取消原新品要求，已读或本机忽略不能代替网站对应确认',async()=>fixture(async store=>{
  let doc=await store.read();doc.mappingRows.push({...relation(added,''),status:'本机已忽略'});await writeJSON(store.file,doc);let view=await fresh(store);assert.equal(view.pending.length,1);assert.equal(view.pending[0].newProductPending,true);
  await store.recordCollection(snap([old],2));view=await fresh(store);assert.equal(view.pending.filter(task=>task.originKind==='added').length,0);assert.ok(view.pending.some(task=>task.kind==='removed'));
}));
