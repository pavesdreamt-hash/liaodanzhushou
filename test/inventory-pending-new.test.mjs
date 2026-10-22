import test from 'node:test';import assert from 'node:assert/strict';
import {pendingNewFixture} from './fixtures/pending-new.mjs';
import {InventoryBatchEdit} from '../src/inventory/batch-edit.mjs';
import {ShopPlusProductCatalog} from '../src/inventory/shopplus-product-catalog.mjs';
import {writeJSON} from '../src/core/files.mjs';
const fixture=async t=>{const f=await pendingNewFixture({count:5});t.after(f.cleanup);return f;};
const names=v=>v.pendingNew.map(p=>p.sourceName);

test('待上新只取当前有货未对应：排除无货/未知与已对应下架，非新增历史仍需处理；读取不修改原资料',async t=>{
 const f=await fixture(t),doc=await f.store.read();
 doc.latestCollection.products.find(p=>p.sourceName==='VIP16').stock='无货';doc.latestCollection.products.find(p=>p.sourceName==='VIP17').stock='待核对';
 doc.sourceChanges.tasks=doc.sourceChanges.tasks.filter(t=>!['VIP18','VIP19'].includes(t.current?.sourceName));await writeJSON(f.store.file,doc);
 const before=await f.store.read(),view=await f.service.view();assert.deepEqual(names(view),['N99 待上新商品','VIP18','VIP19','VIP20']);
 assert.ok(view.rows.some(r=>r.id==='1004'&&r.listingTarget===1&&r.publishStatus===0));assert.ok(!view.pendingNew.some(p=>p.remoteProductId==='1004'));
 assert.deepEqual(await f.store.read(),before);assert.deepEqual(f.calls.writes,[]);assert.equal(f.calls.lists.length,0);
});

test('无货恢复有货仍未对应会再次待上新；关闭历史、刷新、重启不屏蔽，TXT与当前列表一致',async t=>{
 const f=await fixture(t),doc=await f.store.read(),source=doc.latestCollection.products.find(p=>p.sourceName==='VIP16');source.stock='无货';
 const task=doc.sourceChanges.tasks.find(t=>t.current?.sourceName==='VIP16');task.resolved=true;task.reviewed={at:'2026-10-22T00:00:00Z'};await writeJSON(f.store.file,doc);
 let view=await f.service.refreshPendingNew();assert.ok(!names(view).includes('VIP16'));assert.deepEqual((await f.service.exportPendingNew()).content.trim().split('\r\n'),names(view));
 source.stock='有货';await writeJSON(f.store.file,doc);view=await f.service.view();assert.ok(names(view).includes('VIP16'));assert.equal((await f.service.state()).pendingNewRefresh.at,view.pendingNewCheckedAt);
 const restart=new InventoryBatchEdit({store:f.store,catalog:new ShopPlusProductCatalog({directory:f.catalog.directory}),connection:f.connection});assert.deepEqual(names(await restart.view()),names(view));
 source.stock='无货';await writeJSON(f.store.file,doc);assert.ok(!names(await restart.view()).includes('VIP16'));assert.ok(!(await restart.exportPendingNew()).content.split('\r\n').includes('VIP16'));assert.deepEqual(f.calls.writes,[]);
});

test('同名/型号候选无论上架与否均须人工对应；确认后退出待上新，已对应未上架留上架页',async t=>{
 const f=await fixture(t);f.addWebsite('9001','VIP16',{publishStatus:0});f.addWebsite('9002','其它网站名称',{spuCode:'VIP17'});f.addWebsite('9003','VIP18',{publishStatus:null});
 const before=await f.store.read(),refreshed=await f.service.refreshPendingNew();for(const name of ['VIP16','VIP17','VIP18']){assert.ok(names(refreshed).includes(name));assert.match(refreshed.pendingNew.find(p=>p.sourceName===name).reason,/人工确认/);}
 assert.equal(refreshed.refreshSummary.removed,0);assert.deepEqual(await f.store.read(),before);
 const doc=await f.store.read(),website=await f.catalog.pendingWebsiteSnapshot();for(const [name,id]of [['VIP16','9001'],['VIP17','9002']]){const s=doc.latestCollection.products.find(p=>p.sourceName===name),p=website.records.find(p=>p.remoteProductId===id);doc.mappingRows.push({...s,businessId:p.productNumber,status:'正常'});}await writeJSON(f.store.file,doc);
 const view=await f.service.view();assert.ok(!names(view).includes('VIP16'));assert.ok(!names(view).includes('VIP17'));assert.ok(names(view).includes('VIP18'));assert.ok(view.rows.some(r=>r.id==='9001'&&!r.blocked&&r.publishStatus===0&&r.listingTarget===1));assert.deepEqual((await f.service.exportPendingNew()).content.trim().split('\r\n'),names(view));assert.deepEqual(f.calls.writes,[]);
});
