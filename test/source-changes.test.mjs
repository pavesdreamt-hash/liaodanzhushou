import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {buildSourceChangeReport,evaluateSourceTasks,taskSeeds} from '../src/sync/source-changes.mjs';
import {LocalInventoryStore} from '../src/inventory/local-store.mjs';
import {reconcileMappings} from '../src/mapping/mapping.mjs';
import {assignSourceKeys} from '../src/mapping/source-key.mjs';
import {runDailyInventorySync} from '../src/inventory/daily-sync.mjs';
import {validateCollection} from '../src/source/quality.mjs';
import {SOURCE_URL,SOURCE_SHEET,SOURCE_RULES} from '../src/config.mjs';
const item=(sourceName,sourceRow,stock='有货')=>({sourceName,sourceRow,stock,cost:'30',suggestedPrice:'90'});
const snap=(products,n=0)=>({capturedAt:`2026-10-07T01:00:0${n}.000Z`,sheet:'Sheet1',quality:{passed:true,rawNamedRows:products.length},products});
const mappings=products=>assignSourceKeys(products).map((row,index)=>({...row,status:'正常',businessId:`SP-${index}`}));
const site=(productNumber,publishStatus=1,stockQuantity=5)=>({remoteProductId:productNumber,productNumber,name:'虚构网站商品',publishStatus,stockKnown:true,stockQuantity,updatedAt:'2026-10-07T02:00:00Z'});
test('完整来源从199变214或180行通过；漏格、采集中变化和错误库存仍被拒绝',()=>{
  const collection=count=>({manifest:{sourceUrl:SOURCE_URL,sheet:SOURCE_SHEET,reachedEnd:true,endpointVerified:true,initialEnd:`S${count+1}`,finalEnd:`S${count+1}`,sampleChecks:Array.from({length:20},(_,i)=>({row:i+2,passed:true}))},result:{coverage:{endpoint:`S${count+1}`,endRow:count+1,endColumn:19,recognizedRows:count+1,missing:[],conflicts:[],clipped:[],dropped:0},rows:[{row:1,cells:{A:'名称',D:'成本AED',E:'建议售价AED',F:'库存'}},...Array.from({length:count},(_,i)=>({row:i+2,cells:{A:`虚构商品${i}`,D:'30',E:'90',F:'有货',G:''}}))]}});
  for(const count of [214,180]){const c=collection(count),result=validateCollection(c,{quality:{rawNamedRows:199},products:Array.from({length:199},(_,i)=>item(`虚构商品${i}`,i+2))},{...SOURCE_RULES,rejectConflictingDuplicateNames:true});assert.equal(result.passed,true);assert.equal(result.rawNamedRows,count);assert.match(result.warnings.join('；'),/199→/);}
  const missing=collection(214);missing.result.coverage.missing=['F80'];assert.throws(()=>validateCollection(missing),/关键单元格/);
  const changed=collection(214);changed.manifest.finalEnd='S217';assert.throws(()=>validateCollection(changed),/末端不一致/);
  const wrong=collection(214);wrong.result.rows.slice(1).forEach(row=>row.cells.F='unknown');assert.throws(()=>validateCollection(wrong),/库存列/);
});
test('整表移行与新插入不造成旧商品删除／替换，保留全部来源行号',()=>{
  const old=[{...item('甲',2),sourceRows:[{sourceRow:2},{sourceRow:3}]},item('乙',4)],next=[item('新品',2),{...item('甲',10),sourceRows:[{sourceRow:10},{sourceRow:11}]},item('乙',12)];
  const report=buildSourceChangeReport({previous:snap(old),snapshot:snap(next,1),mappings:mappings(old)});
  assert.equal(report.summary.added,1);assert.equal(report.summary.removed,0);assert.equal(report.summary.suspected,0);assert.equal(report.summary.moved,2);
  assert.deepEqual(report.rows.find(row=>row.before?.sourceName==='甲').before.sourceRows,[2,3]);
  assert.equal(taskSeeds(report).length,1);
  const state=reconcileMappings(next,mappings(old));assert.equal(state.rows.find(row=>row.sourceName==='甲').businessId,'SP-0');assert.equal(state.rows.find(row=>row.sourceName==='甲').sourceRow,10);
});
test('同一型号改为不同商品名称时必须待核对，不能继承旧网站编号',()=>{
  const old=[item('甲礼盒（TY17）',2)],next=[item('乙礼盒（TY17）',2)],report=buildSourceChangeReport({previous:snap(old),snapshot:snap(next,1),mappings:mappings(old)}),state=reconcileMappings(next,mappings(old));
  assert.equal(report.rows[0].kind,'suspected');assert.equal(report.rows[0].before.businessId,'SP-0');assert.equal(state.rows[0].businessId,'');assert.equal(state.rows[1].status,'来源已移除');assert.notEqual(state.rows[0].sourceKey,state.rows[1].sourceKey);
});
test('删除、缺货、恢复有货与未知库存根据网站事实分别生成待办',()=>{
  const old=[item('删除',2),item('缺货',3),item('恢复',4,'无货'),item('未知',5)],next=[item('缺货',3,'无货'),item('恢复',4),item('未知',5,'待确认')],map=mappings(old),report=buildSourceChangeReport({previous:snap(old),snapshot:snap(next,1),mappings:map});
  const tasks=evaluateSourceTasks({tasks:taskSeeds(report),snapshot:snap(next,1),mappings:map,catalog:{mappingCatalog:[site('SP-0'),site('SP-1'),site('SP-2',0),site('SP-3')]},websiteCheck:'verified'});
  assert.equal(tasks.find(task=>task.before.sourceName==='删除').action,'unpublish');assert.equal(tasks.find(task=>task.after?.sourceName==='缺货').action,'unpublish');assert.equal(tasks.find(task=>task.after?.sourceName==='恢复').action,'publish');assert.equal(tasks.find(task=>task.after?.sourceName==='未知').action,'review');
  const zero=evaluateSourceTasks({tasks:tasks.filter(task=>task.after?.sourceName==='恢复'),snapshot:snap(next,1),mappings:map,catalog:{mappingCatalog:[site('SP-2',0,0)]},websiteCheck:'verified'});assert.equal(zero[0].action,'replenish');
});
test('未核对、网站未返回和重复编号不能冒充下架完成；仅来源有货不会猜库存数量',()=>{
  const old=[item('甲',2)],report=buildSourceChangeReport({previous:snap(old),snapshot:snap([],1),mappings:mappings(old)}),tasks=taskSeeds(report);
  for(const [catalog,websiteCheck] of [[{mappingCatalog:[site('SP-0',0)]},'failed'],[{mappingCatalog:[]},'verified'],[{mappingCatalog:[site('SP-0'),{...site('SP-0',0),remoteProductId:'other'}]},'verified']]){const result=evaluateSourceTasks({tasks,snapshot:snap([],1),catalog,websiteCheck});assert.equal(result[0].resolved,false);assert.equal(result[0].action,'verify');}
});
test('未处理新品跨重复同步和重启保存，匹配上架回读后消失，历史仍可查看',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'source-changes-'));
  try{
    const paths={state:path.join(directory,'state'),snapshots:path.join(directory,'snapshots')};await mkdir(paths.snapshots);const old=[item('甲',2)],next=[...old,item('新品',3)];let store=new LocalInventoryStore(paths);
    await store.recordCollection(snap(next,1),{previous:snap(old)});let view=await store.refreshSourceChanges({mappings:mappings(old),catalog:{mappingCatalog:[site('SP-0')]},websiteCheck:'verified'});assert.equal(view.pending.length,1);assert.equal(view.pending[0].action,'create');
    await store.recordCollection(snap(next,2));store=new LocalInventoryStore(paths);view=await store.refreshSourceChanges({mappings:mappings(old),catalog:{mappingCatalog:[site('SP-0')]},websiteCheck:'verified'});assert.equal(view.report.summary.added,0);assert.equal(view.pending.length,1);assert.equal(view.history[1].summary.added,1);
    view=await store.refreshSourceChanges({mappings:mappings(next),catalog:{mappingCatalog:[site('SP-0'),site('SP-1')]},websiteCheck:'verified'});assert.equal(view.pending.length,0);assert.equal(view.history[1].rows[0].tasks[0].resolved,true);
  }finally{await rm(directory,{recursive:true,force:true});}
});
test('人工确认替换或分别删除新增产生独立待办，不写来源／网站',async()=>{
  for(const decision of ['replacement','separate']){
    const directory=await mkdtemp(path.join(os.tmpdir(),'source-replacement-'));
    try{const paths={state:path.join(directory,'state'),snapshots:path.join(directory,'snapshots')};await mkdir(paths.snapshots);const store=new LocalInventoryStore(paths),old=[item('旧甲',2)],next=[item('新乙',2)];await store.recordCollection(snap(old));const document=await store.read();document.mappingRows=mappings(old);await import('../src/core/files.mjs').then(({writeJSON})=>writeJSON(store.file,document));await store.recordCollection(snap(next,1));let view=await store.refreshSourceChanges({catalog:{mappingCatalog:[site('SP-0')]},websiteCheck:'verified'});const id=view.report.rows[0].id;assert.equal(view.pending.find(task=>task.changeId===id).action,'review');await store.decideReplacement({changeId:id,decision});view=await store.refreshSourceChanges({catalog:{mappingCatalog:[site('SP-0')]},websiteCheck:'verified'});assert.ok(view.pending.some(task=>task.action==='unpublish'));assert.ok(view.pending.some(task=>task.action==='create'));assert.equal(view.report.websiteCheck,'verified');assert.equal(view.report.summary.suspected,0);assert.equal(view.report.summary.replaced,decision==='replacement'?1:0);assert.equal(view.report.summary.added,decision==='separate'?1:0);}finally{await rm(directory,{recursive:true,force:true});}
  }
});
test('新品未匹配仍核对旧商品；网站读取失败保留来源变化并明确失败状态',async()=>{
  let reconciled=0,applied=0,verified=0,failed=false,check;
  const orchestrator={syncSourceLocal:async()=>({action:'mapping-input',mapping:{pendingNumber:1}}),confirmedSourceProducts:async()=>[{businessId:'SP-0'}],localInventory:async()=>({latestCollection:snap([item('甲',2),item('新品',3)])}),sourceChanges:async(_catalog,status)=>{check=status;return {pending:[{}]};}};
  const catalog={syncMappingCatalog:async()=>{if(failed)throw new Error('虚构网络中断');return {mappingCatalog:[site('SP-0')],mappingCatalogRun:{captured:1}};},reconcileSourceAndWebsite:async()=>{reconciled++;},applyReconciliation:async()=>{applied++;return {products:[],dailyPending:[{kind:'unpublish'}]};},getView:async()=>({products:[]})},connection={listProductsPage:async()=>{},markProductVerified:async()=>{verified++;},status:async()=>({})};
  let result=await runDailyInventorySync({orchestrator,catalog,connection});assert.equal(result.outcome,'complete');assert.equal(result.pendingNumber,1);assert.equal(reconciled,1);assert.equal(applied,1);assert.equal(check,'verified');assert.equal(verified,1);
  failed=true;result=await runDailyInventorySync({orchestrator,catalog,connection});assert.equal(result.outcome,'website_failed');assert.equal(check,'failed');assert.equal(result.reason,'虚构网络中断');assert.equal(verified,1);
});
