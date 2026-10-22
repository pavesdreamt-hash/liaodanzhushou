import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {mappingFixture} from './fixtures/source-mapping.mjs';
import {readMappingWorkspace} from '../src/mapping/workspace.mjs';
import {SourceRenameService} from '../src/mapping/source-rename.mjs';
test('完整本机对应工作区包含所有状态、SKU和网站候选，不读取图片/概览/变更报告或外部服务',async t=>{
 const f=await mappingFixture();t.after(f.cleanup);const before=await readFile(f.store.file,'utf8');
 f.catalog.getView=()=>{throw Error('禁止完整商品视图');};f.catalog.cachedImageData=()=>{throw Error('禁止图片');};f.orchestrator.sourceChanges=()=>{throw Error('禁止整表提醒');};f.service.view=()=>{throw Error('禁止库存概览');};
 const renameService=new SourceRenameService({store:f.store,catalog:f.catalog}),result=await readMappingWorkspace({orchestrator:f.orchestrator,store:f.store,catalog:f.catalog,renameService,localOnly:true});
 assert.equal(result.mapping.mapping.rows.length,30);assert.ok(result.mapping.mapping.rows.some(r=>r.status==='正常'));assert.ok(result.mapping.mapping.rows.some(r=>r.status==='待编号'));assert.equal(result.catalog.mappingCatalog.length,5);assert.ok(result.catalog.mappingCatalog.every(r=>r.remoteProductId&&r.productNumber&&r.variants.length));assert.ok(result.mapping.sourceAt&&result.mapping.mappingFingerprint);assert.deepEqual(f.external,{oauth:0,google:0});assert.equal(await readFile(f.store.file,'utf8'),before);assert.equal(f.calls.writes.length,0);
});
test('对应元数据保留网站商品/全部规格与状态，剔除图片、描述；需要时保留原来源核对报告',async t=>{
 const f=await mappingFixture();t.after(f.cleanup);await f.catalog.load();const p=f.catalog.state.mappingCatalog[0];p.images=[{dataUrl:'should-not-load'}];p.localDescription='not-needed';f.catalog.state.reconciliation={id:'existing-report',rows:[]};
 const result=await f.catalog.getMappingView();assert.equal(result.mappingCatalog[0].images,undefined);assert.equal(result.mappingCatalog[0].localDescription,undefined);assert.deepEqual(result.mappingCatalog[0].variants.map(v=>v.id),p.variants.map(v=>v.id));assert.equal(result.mappingCatalog[0].publishStatus,p.publishStatus);assert.equal(result.reconciliation,null);assert.equal((await f.catalog.getMappingView({includeReconciliation:true})).reconciliation.id,'existing-report');
 f.catalog.state.mappingCatalog=[];const fallback=await f.catalog.getMappingView();assert.ok(fallback.products.length+fallback.archivedProducts.length>0);assert.ok([...fallback.products,...fallback.archivedProducts].every(r=>!('images'in r)));
});
