import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readdir,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {ShopPlusProductCatalog,SHOPPLUS_PRODUCT_ACTIVE_CATALOG_PAGE_SIZE,SHOPPLUS_PRODUCT_COLLECTION_DEFAULT,SHOPPLUS_PRODUCT_COLLECTION_LIMIT,SHOPPLUS_PRODUCT_IMAGE_MAX_BYTES} from '../src/inventory/shopplus-product-catalog.mjs';

const product=({id,title,stock,price=300,publishStatus=1,imageUrl,imageUrls,description=`Fictional description for ${title}`})=>({id,title,spuCode:`SPU-${id}`,publishStatus,productLongDesc:description,productImgDTOs:(imageUrls|| (imageUrl?[imageUrl]:[])).map(imgUrl=>({imgUrl})),productVariantDTOs:[{salePrice:String(price),productVariantInventoryDTO:{availableStockQuantity:stock}}]});
const headers=values=>({get:key=>values[String(key).toLowerCase()]??null});

test('ShopPlus 商品试采集只保存两款有库存商品，超过 3 MB 的图片不保存原图',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'shopplus-product-catalog-'));
  let imageReads=0,bigBodyRead=false,requested=[];
  const fetchImpl=async url=>{
    imageReads++;
    if(url.endsWith('small.jpg'))return new Response(Buffer.alloc(SHOPPLUS_PRODUCT_IMAGE_MAX_BYTES-1,7),{status:200,headers:{'content-type':'image/jpeg','content-length':String(SHOPPLUS_PRODUCT_IMAGE_MAX_BYTES-1)}});
    if(url.endsWith('large.jpg'))return {ok:true,status:200,headers:headers({'content-type':'image/jpeg','content-length':String(SHOPPLUS_PRODUCT_IMAGE_MAX_BYTES)}),body:{getReader:()=>{bigBodyRead=true;throw new Error('large body must not be read');}}};
    throw new Error(`unexpected fictional image ${url}`);
  };
  try{
    const catalog=new ShopPlusProductCatalog({directory,fetchImpl,now:()=>new Date('2026-09-25T10:00:00.000Z')});
    const listPage=async payload=>{requested.push(payload);return {products:[product({id:'fictional-small',title:'Fictional Small',stock:20,imageUrl:'https://images.example.invalid/small.jpg'}),product({id:'fictional-large',title:'Fictional Large',stock:8,imageUrl:'https://images.example.invalid/large.jpg'}),product({id:'fictional-third',title:'Must Not Be Collected',stock:99,imageUrl:'https://images.example.invalid/third.jpg'})]};};
    const first=await catalog.collect({listPage});
    assert.deepEqual(requested,[{pageNum:1,pageSize:SHOPPLUS_PRODUCT_COLLECTION_DEFAULT}]);
    assert.equal(first.products.length,2);
    assert.deepEqual(first.products.map(item=>item.name),['Fictional Small','Fictional Large']);
    assert.equal(first.products.some(item=>item.name==='Must Not Be Collected'),false);
    assert.equal(first.products[0].stockQuantity,20);
    assert.match(first.products[0].productNumber,/^SP-SPU-FICTIONAL-SMALL-[A-F0-9]{6}$/);
    assert.equal(first.products[0].image.status,'cached');
    assert.equal(first.products[0].image.byteLength,SHOPPLUS_PRODUCT_IMAGE_MAX_BYTES-1);
    assert.match(first.products[0].image.dataUrl,/^data:image\/jpeg;base64,/);
    assert.equal(first.products[1].image.status,'manual_review');
    assert.equal(first.products[1].image.byteLength,SHOPPLUS_PRODUCT_IMAGE_MAX_BYTES);
    assert.match(first.products[1].image.reviewReason,/3 MB/);
    assert.equal(bigBodyRead,false,'Content-Length 达到上限时不得读取图片正文');
    assert.equal((await readdir(path.join(directory,'media'))).length,1,'仅缓存小于 3 MB 的一张图片');
    assert.equal(imageReads,2);
    await catalog.update({remoteProductId:'fictional-small',name:'Fictional Small Edited',floorPrice:'180',description:'Local fictional description'});
    const second=await catalog.collect({listPage});
    assert.equal(imageReads,2,'目标已满足时不得重新下载图片');
    assert.equal(second.products[0].name,'Fictional Small Edited');
    assert.equal(second.products[0].floorPriceAed,180);
    assert.equal(second.products[0].description,'Local fictional description');
    assert.equal(second.products[0].productNumber,first.products[0].productNumber,'内部商品编号必须稳定');
    assert.equal((await catalog.collect({listPage})).products.length,2,'较小目标不删除已有商品');
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('无库存或库存未知商品不会进入本机商品试采集记录',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'shopplus-product-out-of-stock-'));
  try{
    const catalog=new ShopPlusProductCatalog({directory,fetchImpl:async()=>{throw new Error('out of stock product image must not be requested');},now:()=>new Date('2026-09-25T11:00:00.000Z')});
    const result=await catalog.collect({listPage:async()=>({products:[product({id:'fictional-out',title:'Out Of Stock',stock:0,imageUrl:'https://images.example.invalid/out.jpg'}),{id:'fictional-unknown',title:'Unknown Stock',publishStatus:1,productImgDTOs:[{imgUrl:'https://images.example.invalid/unknown.jpg'}],productVariantDTOs:[]} ]})});
    assert.equal(result.products.length,0);
    assert.equal(result.lastRun.skippedOutOfStock,2);
    assert.equal(result.batch.status,'ready');
    assert.equal(result.canCollect,true,'没有采集到商品时允许在之后人工重新尝试');
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('用户明确选择后可补充至五款，并可只读更新已采集商品且保留本机资料',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'shopplus-product-batches-'));
  const initial=[
    product({id:'fictional-batch-1',title:'Website One',stock:8,price:300,description:'Website description one'}),
    product({id:'fictional-batch-2',title:'Website Two',stock:7,price:310}),
    product({id:'fictional-batch-3',title:'Website Three',stock:6,price:320}),
    product({id:'fictional-batch-4',title:'Website Four',stock:5,price:330}),
    product({id:'fictional-batch-5',title:'Website Five',stock:4,price:340})
  ];
  const pageFrom=rows=>async({pageNum,pageSize})=>({products:rows.slice((pageNum-1)*pageSize,pageNum*pageSize),totalCount:rows.length,pageNum,pageSize});
  try{
    const catalog=new ShopPlusProductCatalog({directory,now:()=>new Date('2026-09-26T11:00:00.000Z')});
    const first=await catalog.collect({target:2,listPage:pageFrom(initial)});
    assert.equal(first.products.length,2);
    await catalog.update({remoteProductId:'fictional-batch-1',name:'Local Name One',floorPrice:'180',description:'Local introduction one'});
    await catalog.integrateSourcePricing({sourceProducts:[{businessId:first.products[0].productNumber,sourceName:'Website One',cost:'100',suggestedPrice:'200'}]});
    const requests=[];
    const expanded=await catalog.collect({target:5,listPage:async payload=>{requests.push(payload);return pageFrom(initial)(payload);}});
    assert.deepEqual(requests,[{pageNum:1,pageSize:5}]);
    assert.equal(expanded.products.length,5,'明确选择五款后只补充三款，不删除原有两款');
    assert.equal(expanded.lastRun.added,3);
    assert.equal(expanded.products[0].name,'Local Name One');
    assert.equal(expanded.products[0].floorPriceAed,180);
    assert.equal(expanded.products[0].description,'Local introduction one');
    assert.equal(expanded.products[0].costPriceAed,100);
    assert.equal(expanded.products[0].suggestedPriceAed,200);

    const refreshedRows=[
      product({id:'fictional-batch-1',title:'Website One Updated',stock:0,price:399,description:'Website changed description'}),
      product({id:'fictional-batch-2',title:'Website Two Updated',stock:2,price:311}),
      product({id:'fictional-batch-3',title:'Website Three Updated',stock:3,price:322}),
      product({id:'fictional-batch-4',title:'Website Four Updated',stock:4,price:333})
    ];
    const refreshed=await catalog.refresh({listPage:pageFrom(refreshedRows)}),one=refreshed.products.find(item=>item.remoteProductId==='fictional-batch-1'),missing=refreshed.products.find(item=>item.remoteProductId==='fictional-batch-5');
    assert.equal(one.websitePriceAed,399);
    assert.equal(one.stockQuantity,0,'资料更新可以显示既有商品已经缺货，但不会删除本机记录');
    assert.equal(one.name,'Local Name One','网站更新不覆盖人工名称');
    assert.equal(one.description,'Local introduction one','网站更新不覆盖人工介绍');
    assert.equal(one.floorPriceAed,180);
    assert.equal(one.costPriceAed,100);
    assert.equal(missing.refresh.status,'not_returned');
    assert.equal(missing.name,'Website Five','网站未返回时保留原本机资料');
    assert.deepEqual(refreshed.refreshRun,{at:'2026-09-26T11:00:00.000Z',received:4,pages:1,totalCount:4,requestedProducts:5,refreshed:4,missing:1});
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('指定数量遇到缺货时按页继续只读读取，直到达到目标或网站结果结束',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'shopplus-product-page-through-'));
  const firstPage=[
    product({id:'fictional-page-one',title:'Page One',stock:1}),
    product({id:'fictional-page-two',title:'Page Two',stock:2}),
    product({id:'fictional-page-out-one',title:'Out One',stock:0}),
    product({id:'fictional-page-out-two',title:'Out Two',stock:0}),
    product({id:'fictional-page-out-three',title:'Out Three',stock:0})
  ],secondPage=[product({id:'fictional-page-three',title:'Page Three',stock:3}),product({id:'fictional-page-four',title:'Page Four',stock:4}),product({id:'fictional-page-five',title:'Page Five',stock:5})],requests=[];
  try{
    const catalog=new ShopPlusProductCatalog({directory,now:()=>new Date('2026-09-26T11:30:00.000Z')});
    const result=await catalog.collect({target:5,listPage:async payload=>{requests.push(payload);return {products:payload.pageNum===1?firstPage:secondPage,totalCount:8};}});
    assert.deepEqual(requests,[{pageNum:1,pageSize:5},{pageNum:2,pageSize:5}]);
    assert.deepEqual(result.products.map(item=>item.sourceName),['Page One','Page Two','Page Three','Page Four','Page Five']);
    assert.equal(result.lastRun.skippedOutOfStock,3);
    assert.equal(result.lastRun.pages,2);
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('全部在售首批最多保存一百款，且拒绝未确认的采集目标',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'shopplus-product-max-'));
  const products=Array.from({length:105},(_,index)=>product({id:`fictional-max-${index+1}`,title:`Fictional ${index+1}`,stock:1,price:100+index}));
  try{
    const catalog=new ShopPlusProductCatalog({directory,now:()=>new Date('2026-09-26T12:00:00.000Z')});
    const result=await catalog.collect({target:100,listPage:async({pageNum,pageSize})=>({products:products.slice((pageNum-1)*pageSize,pageNum*pageSize),totalCount:products.length})});
    assert.equal(result.products.length,SHOPPLUS_PRODUCT_COLLECTION_LIMIT);
    assert.equal(result.lastRun.captured,100);
    await assert.rejects(()=>catalog.collect({target:3,listPage:async()=>({products:[]})}),/请选择 2、5、10 或全部在售/);
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('全量目录分页读取时只保存已上架且有库存商品，超过旧的一百款也不截断且不读取图片',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'shopplus-product-active-catalog-'));
  const active=Array.from({length:205},(_,index)=>product({id:`fictional-active-${index+1}`,title:`Active ${index+1}`,stock:index%3+1}));
  const rows=[
    ...active.slice(0,101),
    product({id:'fictional-unpublished',title:'Unpublished',stock:99,publishStatus:0,imageUrl:'https://images.example.invalid/unpublished.jpg'}),
    product({id:'fictional-out',title:'Out Of Stock',stock:0,imageUrl:'https://images.example.invalid/out.jpg'}),
    {id:'fictional-unknown',title:'Unknown Stock',publishStatus:1,productImgDTOs:[{imgUrl:'https://images.example.invalid/unknown.jpg'}],productVariantDTOs:[]},
    ...active.slice(101)
  ],requests=[];
  try{
    const catalog=new ShopPlusProductCatalog({directory,fetchImpl:async()=>{throw new Error('full active catalog must not read images');},now:()=>new Date('2026-09-26T14:00:00.000Z')});
    const legacy=await catalog.collect({target:2,listPage:async()=>({products:[product({id:'legacy-inactive',title:'Legacy inactive',stock:2,publishStatus:1})]})});
    await catalog.update({remoteProductId:legacy.products[0].remoteProductId,name:'Keep local name',floorPrice:'195',description:'Keep local description'});
    const result=await catalog.collectPublishedInStock({listPage:async({pageNum,pageSize})=>{requests.push({pageNum,pageSize});return {products:rows.slice((pageNum-1)*pageSize,pageNum*pageSize),totalCount:rows.length};}});
    assert.deepEqual(requests,Array.from({length:Math.ceil(rows.length/SHOPPLUS_PRODUCT_ACTIVE_CATALOG_PAGE_SIZE)},(_,index)=>({pageNum:index+1,pageSize:SHOPPLUS_PRODUCT_ACTIVE_CATALOG_PAGE_SIZE})));
    assert.equal(result.products.length,205,'不再沿用旧的一百款截断');
    assert.equal(result.products.every(item=>item.publishStatus===1&&item.stockKnown&&item.stockQuantity>0),true);
    assert.equal(result.products.some(item=>item.remoteProductId==='fictional-unpublished'),false);
    assert.equal(result.products.some(item=>item.remoteProductId==='fictional-out'),false);
    assert.equal(result.products.some(item=>item.remoteProductId==='fictional-unknown'),false);
    assert.equal(result.products.some(item=>item.image?.dataUrl),false,'新目录采集不得下载图片');
    assert.equal(result.lastRun.scope,'published-in-stock');
    assert.equal(result.lastRun.skippedUnpublished,1);
    assert.equal(result.lastRun.skippedOutOfStock,2);
    assert.equal(result.lastRun.archived,1);
    assert.equal(result.archivedCount,1,'旧商品不静默删除，而是保留本机归档');
    const stored=JSON.parse(await readFile(path.join(directory,'shopplus-product-pilot.json'),'utf8'));
    assert.equal(stored.version,3);
    assert.equal(stored.archivedProducts[0].localName,'Keep local name');
    assert.equal(stored.archivedProducts[0].floorPriceAed,195);
    assert.equal(stored.archivedProducts[0].localDescription,'Keep local description');
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('人工映射网站快照保留上架、下架、有货和无货商品，且不读取图片或改动当前目录',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'shopplus-product-mapping-catalog-'));
  const rows=[product({id:'fictional-listed',title:'Listed',stock:6,publishStatus:1,imageUrl:'https://images.example.invalid/listed.jpg'}),product({id:'fictional-unlisted',title:'Unlisted',stock:0,publishStatus:0,imageUrl:'https://images.example.invalid/unlisted.jpg'})];
  try{
    const catalog=new ShopPlusProductCatalog({directory,fetchImpl:async()=>{throw new Error('mapping snapshot must not read images');},now:()=>new Date('2026-09-28T08:00:00.000Z')});
    await catalog.collect({target:2,listPage:async()=>({products:[rows[0],product({id:'fictional-second',title:'Second',stock:4})],totalCount:2})});
    const result=await catalog.syncMappingCatalog({listPage:async({pageNum,pageSize})=>({products:rows.slice((pageNum-1)*pageSize,pageNum*pageSize),totalCount:rows.length})});
    assert.equal(result.products.length,2,'既有当前商品目录保持不变');
    assert.equal(result.mappingCatalog.length,2);
    assert.deepEqual(result.mappingCatalog.map(item=>item.remoteProductId),['fictional-listed','fictional-unlisted']);
    assert.equal(result.mappingCatalog.find(item=>item.remoteProductId==='fictional-unlisted')?.publishStatus,0);
    assert.equal(result.mappingCatalog.find(item=>item.remoteProductId==='fictional-unlisted')?.stockQuantity,0);
    assert.equal(result.mappingCatalog.every(item=>!item.image&&!item.images.length),true,'映射快照不保存或读取图片');
    assert.deepEqual(result.mappingCatalogRun&&{captured:result.mappingCatalogRun.captured,listed:result.mappingCatalogRun.listed,unlisted:result.mappingCatalogRun.unlisted,outOfStock:result.mappingCatalogRun.outOfStock},{captured:2,listed:1,unlisted:1,outOfStock:1});
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('ShopPlus 格式化介绍保留原始资料，并以可阅读的段落和列表显示',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'shopplus-product-description-'));
  const source='<h2>KY40 产品介绍</h2><p>轻便&nbsp;<strong>耐用</strong></p><ul><li>适合日常使用</li><li>库存以网站为准</li></ul><script>不得显示</script>';
  try{
    const catalog=new ShopPlusProductCatalog({directory,now:()=>new Date('2026-09-25T13:00:00.000Z')});
    const result=await catalog.collect({listPage:async()=>({products:[product({id:'fictional-description',title:'KY40',stock:1,description:source})]})});
    assert.equal(result.products[0].sourceLongDescription,source,'原始网站资料继续留存供后续核对');
    assert.equal(result.products[0].description,'KY40 产品介绍\n轻便 耐用\n• 适合日常使用\n• 库存以网站为准');
    assert.doesNotMatch(result.products[0].description,/<|不得显示/,'产品详情不再把格式标签或脚本内容当正文显示');
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('没有 Content-Length 的图片达到 3 MB 时中止读取且不落盘',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'shopplus-product-stream-limit-'));
  try{
    const catalog=new ShopPlusProductCatalog({directory,fetchImpl:async()=>new Response(Buffer.alloc(SHOPPLUS_PRODUCT_IMAGE_MAX_BYTES),{status:200,headers:{'content-type':'image/png'}}),now:()=>new Date('2026-09-25T12:00:00.000Z')});
    const result=await catalog.collect({listPage:async()=>({products:[product({id:'fictional-stream',title:'Stream Limit',stock:1,imageUrl:'https://images.example.invalid/stream.png'})]})});
    assert.equal(result.products[0].image.status,'manual_review');
    assert.equal(result.products[0].image.file,null);
    assert.deepEqual(await readdir(path.join(directory,'media')),[],'达到上限的流式图片不得落盘');
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('补采图片只读取已保存的两款商品，保留主图并逐张执行 3 MB 限制',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'shopplus-product-media-'));
  const main='https://images.example.invalid/main.jpg',second='https://images.example.invalid/second.jpg',oversize='https://images.example.invalid/oversize.jpg';let reads=0,requests=[];
  const fetchImpl=async url=>{
    reads++;
    if(url===main||url===second)return new Response(Buffer.alloc(1024,6),{status:200,headers:{'content-type':'image/jpeg','content-length':'1024'}});
    if(url===oversize)return {ok:true,status:200,headers:headers({'content-type':'image/jpeg','content-length':String(SHOPPLUS_PRODUCT_IMAGE_MAX_BYTES)}),body:{getReader:()=>{throw new Error('oversize image body must never be read');}}};
    throw new Error(`unexpected fictional image ${url}`);
  };
  try{
    const catalog=new ShopPlusProductCatalog({directory,fetchImpl,now:()=>new Date('2026-09-25T14:00:00.000Z')});
    const listPage=async payload=>{requests.push(payload);return {products:[product({id:'fictional-one',title:'Fictional One',stock:2,imageUrls:[main,second,oversize]}),product({id:'fictional-two',title:'Fictional Two',stock:3,imageUrls:[main,second]})]};};
    const initial=await catalog.collect({listPage});
    assert.equal(initial.products.length,2);
    assert.equal(initial.products[0].images.length,1,'首批采集仍只处理主图');
    assert.equal(reads,2,'两款首批主图各只读取一次');
    const result=await catalog.collectMedia({listPage});
    assert.deepEqual(requests,[{pageNum:1,pageSize:2},{pageNum:1,pageSize:2}], '补采仍只请求同一页两款商品');
    assert.equal(result.products.length,2,'补采不能新增第三款商品');
    assert.equal(result.products[0].images.length,3);
    assert.equal(result.products[0].images[0].status,'cached');
    assert.equal(result.products[0].images[1].status,'cached');
    assert.equal(result.products[0].images[2].status,'manual_review');
    assert.equal(result.products[1].images.length,2);
    assert.equal(result.products[0].image.sourceUrl,main,'第一张继续是库存页只读主图');
    assert.equal(result.mediaRun.sourceImages,5);
    assert.equal(result.mediaRun.cachedImages,4);
    assert.equal(result.mediaRun.manualReviewImages,1);
    assert.equal(reads,5,'已缓存主图不重复下载；仅补读新图片并检查一张超限图片的响应头');
    assert.equal((await readdir(path.join(directory,'media'))).length,4,'只缓存四张严格小于 3 MB 的虚构图片');
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('来源库存资料只按唯一精确编号或唯一同名商品融入本机成本和建议售价',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'shopplus-product-source-pricing-'));
  try{
    const catalog=new ShopPlusProductCatalog({directory,now:()=>new Date('2026-09-26T10:00:00.000Z')});
    const collected=await catalog.collect({listPage:async()=>({products:[product({id:'fictional-priced-id',title:'Fictional Exact ID',stock:4}),product({id:'fictional-priced-name',title:'Fictional Unique Name',stock:7})]})});
    const [idMatched,nameMatched]=collected.products;
    const integrated=await catalog.integrateSourcePricing({sourceUpdatedAt:'2026-09-26T09:30:00.000Z',sourceProducts:[
      {businessId:` ${idMatched.productNumber.toLowerCase().replace(/-/gu,'_')} `,sourceName:'Unrelated source name',cost:'AED 100.50',suggestedPrice:'200.75'},
      {businessId:'SOURCE-NAME-ONLY',sourceName:'  fictional unique name  ',cost:'120',suggestedPrice:'AED 240'}
    ]});
    assert.equal(integrated.products[0].costPriceAed,100.5);
    assert.equal(integrated.products[0].suggestedPriceAed,200.75);
    assert.equal(integrated.products[0].sourcePricing.method,'商品编号精确匹配');
    assert.equal(integrated.products[1].costPriceAed,120);
    assert.equal(integrated.products[1].suggestedPriceAed,240);
    assert.equal(integrated.products[1].sourcePricing.method,'商品名称唯一精确匹配');
    assert.deepEqual(integrated.sourcePricingRun,{at:'2026-09-26T10:00:00.000Z',sourceUpdatedAt:'2026-09-26T09:30:00.000Z',sourceCount:2,matched:2,updated:2,unmatched:0,blank:0});

    const guarded=await catalog.integrateSourcePricing({sourceProducts:[
      {businessId:idMatched.productNumber,sourceName:'Fictional Exact ID',cost:'101',suggestedPrice:'202'},
      {businessId:'DUPLICATE-A',sourceName:nameMatched.sourceName,cost:'1',suggestedPrice:'2'},
      {businessId:'DUPLICATE-B',sourceName:nameMatched.sourceName,cost:'3',suggestedPrice:'4'}
    ]});
    assert.equal(guarded.products[0].costPriceAed,101,'唯一编号仍可更新');
    assert.equal(guarded.products[1].sourcePricing.status,'unmatched','重复名称不得猜测匹配');
    assert.equal(guarded.products[1].costPriceAed,120,'未匹配时保留原有本机价格，不能写入错误来源资料');
    assert.equal(guarded.products[1].suggestedPriceAed,240);
    assert.equal(guarded.sourcePricingRun.unmatched,1);
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('来源状态待处理只留给人工操作，网站回读后会重新归入正常库存',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'shopplus-listing-review-'));
  try{
    const catalog=new ShopPlusProductCatalog({directory,now:()=>new Date('2026-09-26T12:30:00.000Z')});
    const raw={id:'101',title:'Fictional Listing Product',spuCode:'LIST-101',publishStatus:1,productVariantDTOs:[{id:'202',salePrice:'300',productVariantInventoryDTO:{availableStockQuantity:1}}]};
    const first=await catalog.collect({listPage:async()=>({products:[raw]})}),item=first.products[0];
    await catalog.integrateSourcePricing({sourceProducts:[{businessId:item.productNumber,sourceName:item.sourceName,cost:'10',suggestedPrice:'20',stock:'无货'}]});
    let view=await catalog.getView();assert.equal(view.dailyPending[0].kind,'unpublish');assert.equal(view.dailyPending[0].remoteProductId,'101');
    const after={...raw,publishStatus:0};await catalog.recordWebsiteUpdate({remoteProductId:'101',raw:after,manualLock:false,action:{type:'unpublish',beforePublishStatus:1,targetPublishStatus:0}});
    view=await catalog.getView();assert.equal(view.dailyPending.length,0);assert.equal(view.archivedProducts.find(product=>product.remoteProductId==='101')?.publishStatus,0);
    await catalog.integrateSourcePricing({sourceProducts:[{businessId:item.productNumber,sourceName:item.sourceName,cost:'10',suggestedPrice:'20',stock:'有货'}]});
    const replenished={...raw,publishStatus:1};await catalog.recordWebsiteUpdate({remoteProductId:'101',raw:replenished,action:{type:'publish',targetPublishStatus:1}});
    view=await catalog.getView();assert.equal(view.products.find(product=>product.remoteProductId==='101')?.publishStatus,1,'人工上架且库存仍存在后立即回到正常库存');
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('来源与网站变化先形成待确认差异，确认后才更新本机平台资料',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'shopplus-source-reconciliation-'));
  try{
    const catalog=new ShopPlusProductCatalog({directory,now:()=>new Date('2026-09-27T10:00:00.000Z')});
    const initial=await catalog.collect({listPage:async()=>({products:[product({id:'fictional-reconcile-one',title:'Reconcile One',stock:5,price:300}),product({id:'fictional-reconcile-two',title:'Reconcile Two',stock:7,price:320})]})}),[one,two]=initial.products;
    await catalog.integrateSourcePricing({sourceUpdatedAt:'2026-09-26T10:00:00.000Z',sourceProducts:[{businessId:one.productNumber,sourceName:one.sourceName,cost:'100',suggestedPrice:'200',stock:'有货'},{businessId:two.productNumber,sourceName:two.sourceName,cost:'120',suggestedPrice:'240',stock:'有货'}]});
    const latestSource=[{businessId:one.productNumber,sourceName:one.sourceName,cost:'110',suggestedPrice:'220',stock:'无货'},{businessId:two.productNumber,sourceName:two.sourceName,stock:'来源已移除',removed:true}],snapshot=[{sourceKey:'MODEL:ONE'},{sourceKey:'MODEL:TWO'}];
    const changed=product({id:'fictional-reconcile-one',title:'Reconcile One',stock:0,price:333,publishStatus:0}),pending=await catalog.reconcileSourceAndWebsite({sourceProducts:latestSource,sourceSnapshotProducts:snapshot,sourceUpdatedAt:'2026-09-27T09:00:00.000Z',listPage:async()=>({products:[changed],totalCount:1})});
    assert.equal(pending.reconciliation.status,'pending');
    assert.deepEqual(pending.reconciliation.summary,{mapped:2,changed:2,sourceChanged:1,websiteChanged:1,conflicts:0,sourceMissing:1,websiteMissing:1,newSource:0,removedSource:0,firstBaseline:true});
    assert.equal(pending.products.find(item=>item.remoteProductId===one.remoteProductId).websitePriceAed,300,'生成差异时不得覆盖已应用的网站售价');
    const applied=await catalog.applyReconciliation(),appliedOne=applied.archivedProducts.find(item=>item.remoteProductId===one.remoteProductId),appliedTwo=applied.products.find(item=>item.remoteProductId===two.remoteProductId);
    assert.equal(applied.reconciliation.status,'applied');
    assert.equal(appliedOne.costPriceAed,110);assert.equal(appliedOne.suggestedPriceAed,220);assert.equal(appliedOne.sourcePricing.sourceStock,'无货');assert.equal(appliedOne.websitePriceAed,333);assert.equal(appliedOne.stockQuantity,0);assert.equal(appliedOne.publishStatus,0);
    assert.equal(appliedTwo.websitePriceAed,320,'网站未返回时保留已应用的网站资料');assert.equal(appliedTwo.sourcePricing.status,'source_removed','来源消失时保留旧来源值并标记提醒');
    const next=await catalog.reconcileSourceAndWebsite({sourceProducts:latestSource,sourceSnapshotProducts:[{sourceKey:'MODEL:ONE'},{sourceKey:'MODEL:NEW'}],listPage:async()=>({products:[changed],totalCount:1})});
    assert.equal(next.reconciliation.summary.newSource,1);assert.equal(next.reconciliation.summary.removedSource,1,'首次应用后的后续核对才提示来源新增／消失');
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('本机导入图片只追加到指定商品，不改变网站资料',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'shopplus-local-media-'));
  try{
    const catalog=new ShopPlusProductCatalog({directory,now:()=>new Date('2026-09-30T09:00:00.000Z')}),raw={id:'fictional-local-media',title:'Local Media Product',spuCode:'LOCAL-MEDIA',publishStatus:1,productVariantDTOs:[{id:'variant-local-media',salePrice:'120',productVariantInventoryDTO:{availableStockQuantity:2}}]};
    const initial=await catalog.collect({listPage:async()=>({products:[raw]})}),product=initial.products[0],imported=await catalog.importLocalMedia({remoteProductId:product.remoteProductId,images:[{sourceName:'manual.png',originalByteLength:4,thumbnail:false,data:Buffer.from('test').toString('base64')}]});
    const after=imported.products[0];assert.equal(after.images.at(-1).origin,'local');assert.equal(after.images.at(-1).sourceName,'manual.png');assert.equal(after.websitePriceAed,120);assert.equal(await readdir(path.join(directory,'media')).then(files=>files.length),1,'本机导入只写入受限的图片缓存目录');
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('超过 3 MB 的网站图片只保存缩略图，不保存原图',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'shopplus-thumbnail-media-'));
  try{
    let originalRead=false;const catalog=new ShopPlusProductCatalog({directory,now:()=>new Date('2026-09-30T10:00:00.000Z'),thumbnailEncoder:async({bytes})=>{originalRead=bytes.length===SHOPPLUS_PRODUCT_IMAGE_MAX_BYTES;return {bytes:Buffer.alloc(1200,7)};},fetchImpl:async()=>new Response(Buffer.alloc(SHOPPLUS_PRODUCT_IMAGE_MAX_BYTES),{status:200,headers:{'content-type':'image/jpeg','content-length':String(SHOPPLUS_PRODUCT_IMAGE_MAX_BYTES)}})}),raw=product({id:'fictional-thumbnail',title:'Thumbnail Product',stock:3,imageUrl:'https://images.example.invalid/thumbnail.jpg'});
    const result=await catalog.collect({listPage:async()=>({products:[raw]})}),image=result.products[0].image;assert.equal(originalRead,true);assert.equal(image.status,'cached');assert.equal(image.thumbnail,true);assert.equal(image.originalByteLength,SHOPPLUS_PRODUCT_IMAGE_MAX_BYTES);assert.equal(image.byteLength,1200);assert.equal((await readdir(path.join(directory,'media'))).length,1);
  }finally{await rm(directory,{recursive:true,force:true});}
});
