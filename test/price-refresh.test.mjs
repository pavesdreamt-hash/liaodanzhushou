import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {ShopPlusConnection} from '../src/orders/shopplus-api.mjs';
import {InventoryBatchEdit} from '../src/inventory/batch-edit.mjs';
import {ShopPlusProductCatalog} from '../src/inventory/shopplus-product-catalog.mjs';
import {batchFixture,selection} from './fixtures/inventory-batch.mjs';
import {writeJSON,readJSON} from '../src/core/files.mjs';

async function fixture(t,{ack='product',failReadback=false,apply=true}={}){
  const f=await batchFixture();t.after(f.cleanup);
  const requests=[];
  const connection=new ShopPlusConnection({userDataPath:f.dir,safeStorage:{},promptCredential:async()=>null,fetchImpl:async(_url,options)=>{
    const envelope=JSON.parse(options.body),name=envelope.name,data=JSON.parse(decodeURIComponent(envelope.data));requests.push({name,data});
    const product=f.web.get(String(data.productId??data.id));
    if(name==='products.skus.addOrUpdate'){
      if(apply)for(const v of data.updateProductVariants)product.productVariantDTOs.find(s=>s.id===String(v.id)).salePrice=v.salePrice;
      f.calls.writes.push(data);
      return {ok:true,json:async()=>({code:'0',data:ack==='product'?structuredClone(product):ack==='empty'?{}:ack==='wrong-id'?{...structuredClone(product),id:'9999'}:{result:false}})};
    }
    if(name==='products.detail'){
      if(failReadback&&f.calls.writes.length)throw Error('虚构写后回读超时');
      return {ok:true,json:async()=>({code:'0',data:structuredClone(product)})};
    }
    throw Error('本例禁止其它请求');
  }});
  connection.state={appKey:'fictional-app-key',secret:'fictional-secret'};
  const service=new InventoryBatchEdit({store:f.store,catalog:f.catalog,connection});
  return {...f,service,connection,requests,allowReadback:()=>{failReadback=false;}};
}
const priceRequest=row=>({kind:'price',items:[selection(row,'price',310)],confirmed:true,requestId:randomUUID()});

test('官方code=0商品资料响应继续单品回读，达标保存且保留人工价格提醒',async t=>{
  const f=await fixture(t),row=(await f.service.view()).rows.find(r=>r.id==='1002');
  const result=await f.service.execute(priceRequest(row)),after=result.rows.find(r=>r.id==='1002');
  assert.equal(result.results[0].status,'success');assert.equal(after.guard.status,'ok');assert.equal(after.websitePriceAed,310);assert.ok(after.readAt);assert.equal(after.priceChanged,true);
  assert.deepEqual(f.requests.map(c=>c.name),['products.detail','products.skus.addOrUpdate','products.detail']);
  assert.deepEqual(f.requests[1].data,{productId:1002,updateProductVariants:[{id:10020,salePrice:310}]});
  assert.deepEqual(f.web.get('1002').productVariantDTOs.map(v=>v.salePrice),[310,400]);
  assert.deepEqual(f.web.get('1002').productVariantDTOs.map(v=>v.productVariantInventoryDTO.availableStockQuantity),[0,3]);
  const catalog=new ShopPlusProductCatalog({directory:f.catalog.directory});
  // A new service/catalog must read the persisted price rather than an old list.
  const reopened=new InventoryBatchEdit({store:f.store,catalog,connection:f.connection});
  assert.equal((await reopened.view()).rows.find(r=>r.id==='1002').guard.status,'ok');
});

test('调价成功但回读断线仍待核对，稍后刷新恢复达标且重复请求不重写',async t=>{
  const f=await fixture(t,{failReadback:true}),row=(await f.service.view()).rows.find(r=>r.id==='1002'),req=priceRequest(row);
  const result=await f.service.execute(req);assert.equal(result.results[0].status,'uncertain');assert.equal(result.rows.find(r=>r.id==='1002').websitePriceAed,300);
  f.allowReadback();const refreshed=await f.service.refresh({ids:['1002']});assert.equal(refreshed.results[0].status,'read');assert.equal(refreshed.rows.find(r=>r.id==='1002').guard.status,'ok');
  assert.equal((await f.service.execute(req)).duplicate,true);assert.equal(f.calls.writes.length,1);
});

test('成功空响应也须实读，网站尚未改变不能误记达标',async t=>{
  const f=await fixture(t,{ack:'empty',apply:false}),row=(await f.service.view()).rows.find(r=>r.id==='1002');
  const result=await f.service.execute(priceRequest(row));assert.equal(result.results[0].status,'uncertain');assert.equal(result.rows.find(r=>r.id==='1002').guard.status,'low');assert.equal(f.requests.at(-1).name,'products.detail');
});

test('明确失败或异商品响应不保存成成功',async t=>{
  for(const ack of ['false','wrong-id']){const f=await fixture(t,{ack}),row=(await f.service.view()).rows.find(r=>r.id==='1002');const result=await f.service.execute(priceRequest(row));assert.equal(result.results[0].status,'uncertain');assert.equal(result.rows.find(r=>r.id==='1002').guard.status,'low');assert.equal(f.requests.length,2);}
});

test('手工改价刷新逐SKU取最低价，低价/资料不全保留，全部达标才完成',async t=>{
  const f=await fixture(t);const prices=[310,400];f.web.get('1002').productVariantDTOs.forEach((v,i)=>v.salePrice=prices[i]);
  let view=await f.service.refresh({ids:['1002']});assert.equal(view.rows.find(r=>r.id==='1002').guard.status,'ok');
  f.web.get('1002').productVariantDTOs[1].salePrice=305;view=await f.service.refresh({ids:['1002']});assert.equal(view.rows.find(r=>r.id==='1002').websitePriceAed,305);assert.equal(view.rows.find(r=>r.id==='1002').guard.status,'low');
  f.web.get('1002').productVariantDTOs[1].salePrice=null;view=await f.service.refresh({ids:['1002']});assert.equal(view.rows.find(r=>r.id==='1002').guard.status,'unknown');assert.equal(f.calls.writes.length,0);
});

test('低于参考价须明确确认，回读后保存人工认可并跨刷新重启保留',async t=>{
  const f=await fixture(t),row=(await f.service.view()).rows.find(r=>r.id==='1002'),req=priceRequest(row);req.items[0].target=305;
  await assert.rejects(f.service.execute(req),/参考售价/);assert.equal(f.calls.writes.length,0);
  const result=await f.service.execute({...req,allowBelowReference:true}),after=result.rows.find(r=>r.id==='1002');
  assert.equal(result.results[0].status,'success');assert.equal(after.guard.status,'low');assert.equal(after.priceAccepted,true);assert.equal(after.priceReviewRequired,false);assert.equal(after.priceChanged,true);assert.deepEqual(after.variants.map(v=>v.salePrice),[305,400]);assert.equal(after.acceptedPriceAed,305);
  await f.service.refresh({ids:['1002']});const reopened=new InventoryBatchEdit({store:f.store,catalog:new ShopPlusProductCatalog({directory:f.catalog.directory}),connection:f.connection});assert.equal((await reopened.view()).rows.find(r=>r.id==='1002').priceReviewRequired,false);assert.equal(f.calls.writes.length,1);
});

test('TY01类成本10建议19.90网站30，可确认保留30，无需抬高到210或写网站',async t=>{
  const f=await fixture(t),doc=await f.store.read(),source=doc.latestCollection.products[1];source.cost='10';source.suggestedPrice='19.90';await writeJSON(f.store.file,doc);
  f.web.get('1002').productVariantDTOs.forEach((v,i)=>v.salePrice=i?40:30);
  let view=await f.service.refresh({ids:['1002']}),row=view.rows.find(r=>r.id==='1002');assert.equal(row.guard.minimumFils,21000);
  const req=priceRequest(row);req.items[0].target=30;view=await f.service.execute({...req,allowBelowReference:true});assert.equal(view.results[0].status,'unchanged');assert.equal(view.rows.find(r=>r.id==='1002').priceAccepted,true);assert.equal(f.calls.writes.length,0);
  let changed=await f.store.read();changed.latestCollection.capturedAt='2026-10-22T08:00:00Z';changed.latestCollection.products[1].stock='无货';await writeJSON(f.store.file,changed);view=await f.service.view();assert.equal(view.rows.find(r=>r.id==='1002').priceReviewRequired,false);
  changed=await f.store.read();changed.latestCollection.products[1].suggestedPrice='20';await writeJSON(f.store.file,changed);view=await f.service.view();assert.equal(view.rows.find(r=>r.id==='1002').priceReviewRequired,true);
});

test('网站跌破人工目标或换SKU后重新提醒，不自动抬价',async t=>{
  const f=await fixture(t),row=(await f.service.view()).rows.find(r=>r.id==='1002'),req=priceRequest(row);req.items[0].target=305;await f.service.execute({...req,allowBelowReference:true});
  f.web.get('1002').productVariantDTOs[0].salePrice=300;let view=await f.service.refresh({ids:['1002']});assert.equal(view.rows.find(r=>r.id==='1002').priceReviewRequired,true);
  f.web.get('1002').productVariantDTOs[0].salePrice=305;f.web.get('1002').productVariantDTOs[0].id='10029';view=await f.service.refresh({ids:['1002']});assert.equal(view.rows.find(r=>r.id==='1002').priceReviewRequired,true);assert.equal(f.calls.writes.length,1);
});

test('低价写后回读失败不保存人工认可，不确定状态仍显示待处理',async t=>{
  const f=await fixture(t,{failReadback:true}),row=(await f.service.view()).rows.find(r=>r.id==='1002'),req=priceRequest(row);req.items[0].target=305;
  const result=await f.service.execute({...req,allowBelowReference:true});assert.equal(result.results[0].status,'uncertain');assert.equal(result.rows.find(r=>r.id==='1002').priceReviewRequired,true);assert.equal((await readJSON(f.service.file)).priceDecisions?.['1002'],undefined);
});
