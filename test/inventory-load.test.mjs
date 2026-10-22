import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {ShopPlusProductCatalog} from '../src/inventory/shopplus-product-catalog.mjs';import {inventoryPageView} from '../src/inventory/page-view.mjs';

test('库存元数据不读取图片；指定商品主图只读取一张，详情仍有完整画廊，更新图片使版本失效',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'inventory-media-')),catalog=new ShopPlusProductCatalog({directory:dir,fetchImpl:()=>{throw Error('禁止外部图片请求');}});
 try{
  await catalog.load();await mkdir(catalog.mediaDirectory,{recursive:true});const image=n=>({status:'cached',file:`shopplus-${String(n).padStart(16,'0')}.png`,mimeType:'image/png',cachedAt:'2026-10-21T08:00:00Z'});
  catalog.state.products=[{remoteProductId:'A',sourceName:'商品A',images:[image(1),image(2)]},{remoteProductId:'B',sourceName:'商品B',images:[image(3)]}];catalog.state.archivedProducts=[{remoteProductId:'C',sourceName:'归档C',images:[image(4)]}];await catalog.persist();
  for(let n=1;n<=4;n++)await writeFile(path.join(catalog.mediaDirectory,image(n).file),Buffer.from(`fictional-image-${n}`));const before=await readFile(catalog.file),reads=[],original=catalog.cachedImageData.bind(catalog);catalog.cachedImageData=async image=>{reads.push(image.file);return original(image);};
  const light=await catalog.getView({includeImages:false});assert.equal(reads.length,0);assert.equal(light.products[0].images.length,2);assert.equal(light.products[0].image.dataUrl,null);assert.equal(light.archivedProducts[0].image.dataUrl,null);
  const primary=await catalog.getLocalMedia({remoteProductId:'B',primaryOnly:true});assert.equal(reads.length,1);assert.equal(primary.images.length,1);assert.match(primary.image.dataUrl,/^data:image\/png;base64,/);assert.equal(primary.mediaRevision,light.products[1].mediaRevision);
  await assert.rejects(catalog.getLocalMedia({remoteProductId:'../../secret'}),/本机没有/);assert.equal(reads.length,1);
  const full=await catalog.getView();assert.equal(reads.length,5);assert.equal(full.products[0].images.filter(i=>i.dataUrl).length,2);assert.ok(full.archivedProducts[0].image.dataUrl);
  catalog.state.products[0].images[0].cachedAt='2026-10-21T09:00:00Z';assert.notEqual((await catalog.getView({includeImages:false})).products[0].mediaRevision,light.products[0].mediaRevision);
  catalog.state.products[1].images=[{...image(3),file:'../../secret'}];assert.equal((await catalog.getLocalMedia({remoteProductId:'B',primaryOnly:true})).image.dataUrl,null);assert.deepEqual(await readFile(catalog.file),before,'本机读取不写资料');
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('首屏只读列表与已保存顺序，不等待或触发批量/提醒核算；后续核算保留原回读完成参数',async()=>{
 const seen=[],catalog={getView:async options=>{seen.push(options);return {products:[{remoteProductId:'A'}]};}},store={read:async()=>({sourceChanges:{sourceOrder:{A:8}}})},batch={view:async()=>{throw Error('首屏不能计算批量');}},sourceChanges=async()=>{throw Error('首屏不能核算提醒');},deps={catalog,store,batch,sourceChanges,workflow:{view:async()=>({})},connection:{status:async()=>({})}};
 const first=await inventoryPageView(deps,{inventory:true,phase:'list'});assert.equal(first.inventorySummaryPending,true);assert.deepEqual(first.sourceOrder,{A:8});assert.deepEqual(seen,[{includeImages:false}]);
 deps.batch.view=async()=>({verifiedReads:{A:'read'},priceCompletions:{A:'confirmed'}});deps.sourceChanges=async(view,check,options)=>{assert.deepEqual(options,{verifiedReads:{A:'read'},priceCompletions:{A:'confirmed'}});return {pending:[]};};
 assert.equal((await inventoryPageView(deps,{inventory:true})).inventorySummaryPending,false);assert.deepEqual(seen[1],{includeImages:false});await inventoryPageView(deps);assert.deepEqual(seen[2],{},'详情旧入口保留完整图片');
});
