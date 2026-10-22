import test from 'node:test';
import assert from 'node:assert/strict';
import {mappingFixture} from './fixtures/source-mapping.mjs';
test('本机对应读取/单条保存不登录、不读写Google，保存后待上新即时采用对应',async t=>{
  const f=await mappingFixture();t.after(f.cleanup);const state=await f.orchestrator.mappingStatus({localOnly:true}),source=f.added[0];
  assert.ok(state.sourceAt&&state.mappingFingerprint);const product=(await f.catalog.getView()).mappingCatalog.find(p=>p.remoteProductId==='1004');
  const before=await f.orchestrator.loadPending();before.mappingState.rows.find(r=>r.businessId===product.productNumber).status='待确认';
  const fresh=await f.orchestrator.mappingStatus({localOnly:true});
  await f.orchestrator.submitMapping([{sourceKey:source.sourceKey,businessId:product.productNumber,action:'confirm'}],{localOnly:true,confirmFirstSync:true,sourceAt:fresh.sourceAt,mappingFingerprint:fresh.mappingFingerprint});
  const after=await f.orchestrator.mappingStatus({localOnly:true});assert.equal(after.mapping.rows.find(r=>r.sourceKey===source.sourceKey).status,'正常');assert.notEqual(after.mappingFingerprint,fresh.mappingFingerprint);
  assert.deepEqual(f.external,{oauth:0,google:0});assert.equal(f.calls.writes.length,0);
});
test('本机新建对应计划强制使用本机快照；已连接Google也不访问',async t=>{
  const f=await mappingFixture();t.after(f.cleanup);f.orchestrator.pending=null;const {unlink}=await import('node:fs/promises');await unlink(f.orchestrator.pendingFile);
  const state=await f.orchestrator.mappingStatus({localOnly:true});assert.ok(state.mapping.rows.length);assert.equal((await f.orchestrator.loadPending()).storage,'local');assert.deepEqual(f.external,{oauth:0,google:0});
});
test('陈旧来源代次/对应指纹和外部表格计划拒绝，原计划不变',async t=>{
  const f=await mappingFixture();t.after(f.cleanup);const state=await f.orchestrator.mappingStatus({localOnly:true}),options={localOnly:true,sourceAt:state.sourceAt,mappingFingerprint:state.mappingFingerprint};
  const {readFile}=await import('node:fs/promises');const before=await readFile(f.orchestrator.pendingFile,'utf8');
  for(const delta of [{sourceAt:'old'},{mappingFingerprint:'old'}])await assert.rejects(()=>f.orchestrator.submitMapping([],{...options,...delta}),e=>e.code==='MAPPING_CHANGED');
  f.orchestrator.running=true;await assert.rejects(()=>f.orchestrator.submitMapping([],options),e=>e.code==='BUSY');f.orchestrator.running=false;
  f.orchestrator.pending.storage='google';await assert.rejects(()=>f.orchestrator.submitMapping([],options),e=>e.code==='LOCAL_MAPPING_ONLY');
  assert.equal(await readFile(f.orchestrator.pendingFile,'utf8'),before);assert.deepEqual(f.external,{oauth:0,google:0});
});
test('最后一条本机对应完成时只提交本机计划，重新读取仍保持；新来源拒绝旧弹窗保存',async t=>{
  const f=await mappingFixture();t.after(f.cleanup);let state=await f.orchestrator.mappingStatus({localOnly:true});
  const answers=state.mapping.rows.filter(r=>r.status!=='正常').map(r=>({sourceKey:r.sourceKey,businessId:'',action:'ignore'}));
  const result=await f.orchestrator.submitMapping(answers,{localOnly:true,confirmFirstSync:true,sourceAt:state.sourceAt,mappingFingerprint:state.mappingFingerprint});
  assert.equal(result.action,'complete');assert.equal(result.result.transaction.skippedGoogle,true);assert.deepEqual(f.external,{oauth:0,google:0});
  state=await f.orchestrator.mappingStatus({localOnly:true});assert.ok(state.mapping.rows.some(r=>r.status==='本机已忽略'));
  const doc=await f.store.read();doc.latestCollection.capturedAt='2026-10-21T10:00:00.000Z';const {writeJSON}=await import('../src/core/files.mjs');await writeJSON(f.store.file,doc);
  await assert.rejects(()=>f.orchestrator.submitMapping([],{localOnly:true,sourceAt:state.sourceAt,mappingFingerprint:state.mappingFingerprint}),e=>e.code==='MAPPING_CHANGED');
});
