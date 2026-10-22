import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {batchFixture,selection} from './fixtures/inventory-batch.mjs';import {pendingNewFixture} from './fixtures/pending-new.mjs';
import {InventoryBatchEdit} from '../src/inventory/batch-edit.mjs';import {ShopPlusProductCatalog} from '../src/inventory/shopplus-product-catalog.mjs';import {readJSON,writeJSON} from '../src/core/files.mjs';
const request=(kind,items,listingMode)=>({kind,items,listingMode,confirmed:true,requestId:randomUUID()});
const fixture=async(t,options)=>{const f=await pendingNewFixture(options);t.after(f.cleanup);return f;};

test('上下架方向独立：混合方向/方向与页签不符在所有读取和写入前拒绝',async t=>{
 const f=await batchFixture();t.after(f.cleanup);const view=await f.service.view(),down=selection(view.rows.find(r=>r.id==='1001'),'listing',0),up=selection(view.rows.find(r=>r.id==='1003'),'listing',1);
 await assert.rejects(f.service.execute(request('listing',[down,up])),/分别/);await assert.rejects(f.service.execute(request('listing',[up],'unpublish')),/分别/);assert.equal(f.calls.reads.length,0);assert.equal(f.calls.writes.length,0);
 assert.equal((await f.service.execute(request('listing',[down],'unpublish'))).results[0].status,'success');assert.equal((await f.service.execute(request('listing',[up],'publish'))).results[0].status,'success');assert.deepEqual(f.calls.writes.map(w=>w.publishStatus),[0,1]);
});

test('来源无货/未知不参与库存修改，有货在读取时变无货也拒绝；不自动清零',async t=>{
 const f=await batchFixture();t.after(f.cleanup);let view=await f.service.view();const down=view.rows.find(r=>r.id==='1001');await assert.rejects(f.service.execute(request('stock',[selection(down,'stock',0,'10010')])),/来源无货/);assert.deepEqual(f.calls.reads,[]);assert.deepEqual(f.calls.writes,[]);
 let doc=await f.store.read();doc.latestCollection.products[1].stock='待核对';await writeJSON(f.store.file,doc);view=await f.service.view();await assert.rejects(f.service.execute(request('stock',[selection(view.rows.find(r=>r.id==='1002'),'stock',6,'10020')])),/状态未知/);
 doc.latestCollection.products[1].stock='有货';await writeJSON(f.store.file,doc);view=await f.service.view();f.faults.hook=async()=>{f.faults.hook=null;const next=await f.store.read();next.latestCollection.products[1].stock='无货';await writeJSON(f.store.file,next);};const result=await f.service.execute(request('stock',[selection(view.rows.find(r=>r.id==='1002'),'stock',6,'10020')]));assert.equal(result.results[0].status,'failed');assert.deepEqual(f.calls.writes,[]);assert.equal(f.web.get('1001').productVariantDTOs[0].productVariantInventoryDTO.availableStockQuantity,10);
});

test('待上新完整目录刷新：已对应与候选分开；准确名称和型号仅供人工确认，重启保留',async t=>{
 const f=await fixture(t),before=await f.store.read(),activeBefore=structuredClone(f.catalog.state.products);f.web.get('1004').publishStatus=1;f.addWebsite('9001','VIP16');f.addWebsite('9002','另一种网站名称',{spuCode:'VIP17'});f.addWebsite('9003','VIP18',{publishStatus:0});f.addWebsite('9004','VIP190');
 const refreshed=await f.service.refreshPendingNew();assert.equal(refreshed.refreshSummary.removed,0);assert.ok(!refreshed.pendingNew.some(p=>p.sourceName==='YB02 新款'));for(const name of ['VIP16','VIP17'])assert.ok(refreshed.pendingNew.some(p=>p.sourceName===name&&/人工确认/.test(p.reason)));assert.ok(refreshed.pendingNew.some(p=>p.sourceName==='VIP18'&&/人工确认/.test(p.reason)));assert.ok(refreshed.pendingNew.some(p=>p.sourceName==='VIP19'));assert.equal(refreshed.rows.find(r=>r.id==='1004').publishStatus,1);assert.deepEqual(await f.store.read(),before);assert.deepEqual(f.catalog.state.products,activeBefore);assert.deepEqual(f.calls.reads,[]);assert.deepEqual(f.calls.writes,[]);assert.ok(f.calls.lists.length>0);
 const restart=new InventoryBatchEdit({store:f.store,catalog:new ShopPlusProductCatalog({directory:f.catalog.directory}),connection:f.connection});assert.deepEqual((await restart.view()).pendingNew.map(p=>p.sourceName),refreshed.pendingNew.map(p=>p.sourceName));f.web.get('9001').publishStatus=0;assert.ok((await f.service.refreshPendingNew()).pendingNew.some(p=>p.sourceName==='VIP16'));
});

test('待上新歧义保护：重复网站名称、来源型号或占用关系及未知上架状态仍须人工确认',async t=>{
 const f=await fixture(t);f.addWebsite('9001','VIP16');f.addWebsite('9002','VIP16');f.addWebsite('9003','VIP17',{publishStatus:null});f.web.get('1001').title='VIP18';f.web.get('1001').spuCode='VIP18';f.addWebsite('9004','VIP19');const doc=await f.store.read();doc.latestCollection.products.push({...f.added[3],sourceKey:'MODEL:VIP19|OCC:2',sourceName:'VIP19 蓝色'});await writeJSON(f.store.file,doc);
 const view=await f.service.refreshPendingNew();const by=name=>view.pendingNew.find(p=>p.sourceName===name);assert.match(by('VIP16').reason,/多个/);assert.match(by('VIP17').reason,/人工确认/);assert.match(by('VIP18').reason,/其它来源/);assert.match(by('VIP19').reason,/不唯一/);assert.deepEqual(f.calls.writes,[]);
});

test('刷新失败/不完整分页不丢上次目录，刷新期间来源变化不采用陈旧结果，可重试',async t=>{
 const f=await fixture(t),before=await f.service.view(),snapshot=await f.catalog.pendingWebsiteSnapshot();f.faults.list=true;await assert.rejects(f.service.refreshPendingNew(),/虚构网站/);assert.deepEqual((await f.service.view()).pendingNew,before.pendingNew);assert.deepEqual(await f.catalog.pendingWebsiteSnapshot(),snapshot);
 f.faults.list=false;const list=f.connection.listProductsPage;f.connection.listProductsPage=async()=>({products:[f.web.get('1001')],totalCount:5});await assert.rejects(f.service.refreshPendingNew(),/重复|完整/);assert.deepEqual(await f.catalog.pendingWebsiteSnapshot(),snapshot);
 f.connection.listProductsPage=list;f.faults.listHook=async()=>{f.faults.listHook=null;const doc=await f.store.read();const oldName=doc.latestCollection.products.at(-1).sourceName,changed={...doc.latestCollection.products.at(-1),sourceName:'VIP999 新款',sourceKey:'MODEL:VIP999'};doc.latestCollection.products[doc.latestCollection.products.length-1]=changed;for(const task of doc.sourceChanges.tasks)if(task.current?.sourceName===oldName){task.current=changed;task.after=changed;}await writeJSON(f.store.file,doc);};await assert.rejects(f.service.refreshPendingNew(),/来源商品已变化/);assert.equal(f.service.busy,false);assert.ok(!(await f.service.state()).pendingNewRefresh);const view=await f.service.refreshPendingNew();assert.ok(view.pendingNewCheckedAt);assert.ok(view.pendingNew.some(p=>p.sourceName==='VIP999 新款'));
});

test('目录分页完整性：声明总数时继续短页，未声明总数时读取到空页，失败不采用部分新增',async t=>{
 const f=await fixture(t),rows=[...f.web.values()].slice(0,2),pages=[];
 f.connection.listProductsPage=async p=>{pages.push(p.pageNum);return{products:rows[p.pageNum-1]?[rows[p.pageNum-1]]:[],totalCount:2};};assert.equal((await f.service.refreshPendingNew()).refreshSummary.websiteCount,2);assert.deepEqual(pages,[1,2]);
 pages.length=0;f.connection.listProductsPage=async p=>{pages.push(p.pageNum);return{products:rows[p.pageNum-1]?[rows[p.pageNum-1]]:[],totalCount:null};};await f.service.refreshPendingNew();assert.deepEqual(pages,[1,2,3]);const saved=await f.catalog.pendingWebsiteSnapshot();
 f.addWebsite('9001','VIP16');f.connection.listProductsPage=async p=>{if(p.pageNum===1)return{products:[f.web.get('9001')],totalCount:2};throw Error('虚构第二页失败');};await assert.rejects(f.service.refreshPendingNew(),/第二页失败/);assert.deepEqual(await f.catalog.pendingWebsiteSnapshot(),saved);assert.ok((await f.service.view()).pendingNew.some(p=>p.sourceName==='VIP16'));
});

test('全量TXT：跨页按来源顺序仅名称，换行/中文安全、上海日期、刷新候选不自动确认，空列表不导出',async t=>{
 const f=await fixture(t,{count:31});f.service.now=()=>new Date('2026-10-21T17:30:00Z');let view=await f.service.view();assert.equal(view.pendingNew.length,32);const output=await f.service.exportPendingNew();assert.equal(output.count,32);assert.equal(output.filename,'待上新商品名称-2026-10-22.txt');assert.deepEqual(output.content.trim().split('\r\n'),view.pendingNew.map(p=>p.sourceName));assert.ok(!output.content.includes('250 AED'));assert.equal(f.calls.lists.length,0);
 f.addWebsite('9001','VIP16');await f.service.refreshPendingNew();assert.ok((await f.service.exportPendingNew()).content.split('\r\n').includes('VIP16'));const doc=await f.store.read(),last=doc.latestCollection.products.at(-1),previousName=last.sourceName;last.sourceName=previousName+'\n中文\t名称';for(const task of doc.sourceChanges.tasks)if(task.current?.sourceName===previousName){task.current={...last};task.after={...last};}await writeJSON(f.store.file,doc);const multiline=await f.service.exportPendingNew();assert.equal(multiline.content.trim().split('\r\n').length,32);assert.ok(multiline.content.includes(previousName+' 中文 名称'));for(const source of doc.latestCollection.products)source.stock='无货';await writeJSON(f.store.file,doc);await assert.rejects(f.service.exportPendingNew(),/暂无待上新/);assert.deepEqual(f.calls.writes,[]);
});
