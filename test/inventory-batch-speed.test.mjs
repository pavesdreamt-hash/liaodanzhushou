import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {batchScaleFixture} from './fixtures/inventory-batch-scale.mjs';
import {batchFixture,selection} from './fixtures/inventory-batch.mjs';
import {InventoryBatchEdit} from '../src/inventory/batch-edit.mjs';
import {readJSON,writeJSON} from '../src/core/files.mjs';
const request=(kind,items)=>({kind,items,confirmed:true,requestId:randomUUID()});

test('200件中选10件：最多3个商品请求并行，仍逐件写前读取/修改/回读，进度不加载目录',async t=>{
  const f=await batchScaleFixture({count:200,latencyMs:35});t.after(f.cleanup);
  let release;const firstReads=new Set(),gate=new Promise(r=>{release=r;}),transport=f.connection.request.bind(f.connection);
  f.connection.request=async(name,data)=>{if(name==='products.detail'&&!firstReads.has(data.id)&&firstReads.size<3){firstReads.add(data.id);if(firstReads.size===3)release();await gate;}return transport(name,data);};
  const service=new InventoryBatchEdit(f),view=await service.view(),req=request('listing',view.rows.slice(0,10).map(r=>selection(r,'listing',0)));
  let contexts=0;const context=service.context.bind(service);service.context=(...args)=>{contexts++;return context(...args);};
  const running=service.execute(req);let progress;
  for(let i=0;i<100;i++){progress=await service.progress({requestId:req.requestId});if(progress?.active.length===3)break;await new Promise(r=>setTimeout(r,10));}
  assert.equal(progress.active.length,3);assert.equal(progress.total,10);assert.ok(progress.elapsedMs>=0);
  const count=contexts;for(let i=0;i<20;i++)await service.progress({requestId:req.requestId});assert.equal(contexts,count);
  const result=await running;assert.ok(contexts<500,'逐件核验不能再计算整个目录的上下文');
  assert.deepEqual(result.results.map(r=>r.status),Array(10).fill('success'));assert.ok(f.stats.maxActive>1&&f.stats.maxActive<=3);assert.equal(f.stats.calls.length,30);
  for(const row of view.rows.slice(0,10))assert.deepEqual(f.stats.calls.filter(c=>c.id===row.id).map(c=>c.name),['products.detail','products.updateSpuSelective','products.detail']);
  assert.ok([...f.web.values()].slice(10).every(p=>p.publishStatus===1));
  const state=await readJSON(service.file),receipt=state.history[0];assert.equal(receipt.results.length,10);assert.equal(receipt.status,'finished');assert.equal(Object.keys(state.reads).length,10);assert.ok(receipt.results.every(r=>r.elapsedMs>=0));
  const done=await service.progress({requestId:req.requestId});assert.equal(done.completed,10);assert.deepEqual(done.active,[]);
  const restart=new InventoryBatchEdit(f);assert.equal((await restart.execute(req)).duplicate,true);assert.equal(f.stats.calls.length,30);assert.equal((await restart.progress({requestId:req.requestId})).completed,10);
});

test('同商品多个SKU保持顺序，其它商品并行；慢项目失败不丢失其它结果和读取记录',async t=>{
  const f=await batchFixture();t.after(f.cleanup);const rows=(await f.service.view()).rows,by=id=>rows.find(r=>r.id===id),items=[selection(by('1002'),'stock',10,'10020'),selection(by('1004'),'stock',7,'10040'),selection(by('1002'),'stock',8,'10021'),selection(by('1003'),'stock',6,'10030')];
  const active=new Map(),max=new Map(),firstReads=new Set();let simultaneous=0,peak=0,release;const gate=new Promise(r=>{release=r;});
  for(const method of ['productDetail','updateVariantInventory']){const original=f.connection[method];f.connection[method]=async value=>{const id=typeof value==='string'?value:value.productId;active.set(id,(active.get(id)||0)+1);max.set(id,Math.max(max.get(id)||0,active.get(id)));peak=Math.max(peak,++simultaneous);try{if(method==='productDetail'&&!firstReads.has(id)){firstReads.add(id);if(firstReads.size===3)release();await gate;}await new Promise(r=>setTimeout(r,id==='1003'?70:25));return await original(value);}finally{active.set(id,active.get(id)-1);simultaneous--;}};}
  f.faults.read='1003';const req=request('stock',items),result=await f.service.execute(req);
  assert.deepEqual(result.results.map(r=>r.status),['success','success','success','failed']);assert.ok(peak>1&&peak<=3);assert.ok([...max.values()].every(n=>n===1));
  assert.deepEqual(f.web.get('1002').productVariantDTOs.map(v=>v.productVariantInventoryDTO.availableStockQuantity),[10,8]);
  const saved=await readJSON(f.service.file);assert.deepEqual(saved.history[0].results.map(r=>r.status),result.results.map(r=>r.status));assert.deepEqual(Object.keys(saved.reads).sort(),['1002','1004']);assert.equal((await f.service.execute(req)).duplicate,true);assert.equal(f.calls.writes.length,3);
});

test('并行读取期间来源变化仍拒绝陈旧写入，重复业务号或来源身份仍阻止提交',async t=>{
  const f=await batchFixture();t.after(f.cleanup);const view=await f.service.view(),down=view.rows.find(r=>r.id==='1003'),up=view.rows.find(r=>r.id==='1004');
  let changed=false;f.faults.hook=async id=>{if(id==='1003'&&!changed){changed=true;const doc=await f.store.read();doc.latestCollection.products[2].cost='999';await writeJSON(f.store.file,doc);}};
  const result=await f.service.execute(request('listing',[selection(down,'listing',1),selection(up,'listing',1)]));assert.equal(result.results[0].status,'failed');assert.equal(result.results[1].status,'success');assert.deepEqual(f.calls.writes.map(c=>c.id),['1004']);
  const doc=await f.store.read();doc.mappingRows.push({...doc.mappingRows[2],sourceName:'另一件商品'});await writeJSON(f.store.file,doc);let next=await f.service.view();assert.match(next.rows.find(r=>r.id==='1003').blocked,/不唯一/);
  doc.mappingRows.pop();doc.latestCollection.products.push({...doc.latestCollection.products[2]});await writeJSON(f.store.file,doc);next=await f.service.view();assert.match(next.rows.find(r=>r.id==='1003').blocked,/不唯一/);
});
