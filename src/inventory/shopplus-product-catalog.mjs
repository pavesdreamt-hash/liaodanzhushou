import {createHash} from 'node:crypto';
import {mkdir,readFile,rename,unlink,writeFile} from 'node:fs/promises';
import path from 'node:path';

// This is deliberately an independent local catalog. It must not reuse the
// KDocs inventory snapshot or product_profiles before a person has checked a
// collected record. Legacy batch collection remains bounded for compatibility;
// the explicit active-catalog operation below is the only full-directory path.
export const SHOPPLUS_PRODUCT_COLLECTION_DEFAULT=2;
export const SHOPPLUS_PRODUCT_COLLECTION_LIMIT=100;
// A full page carries product variants and descriptions.  Keep it well below
// the API's technical maximum so a normal real catalogue read does not exhaust
// the single-request timeout; this is a page size, never a catalogue cap.
export const SHOPPLUS_PRODUCT_ACTIVE_CATALOG_PAGE_SIZE=50;
export const SHOPPLUS_PRODUCT_IMAGE_MAX_BYTES=500*1024;

const SHOPPLUS_PRODUCT_LOCAL_RECORD_LIMIT=5000;
const SHOPPLUS_PRODUCT_ARCHIVE_LIMIT=5000;
const initial=()=>({version:3,products:[],archivedProducts:[],mappingCatalog:[],mappingCatalogRun:null,lastRun:null,refreshRun:null,mediaRun:null,sourcePricingRun:null,listingHistory:[],lastSuccessfulReadAt:null,batch:{status:'ready',captured:0}});
const text=(value,max=1000)=>typeof value==='string'?value.trim().slice(0,max):value===null||value===undefined?'':String(value).trim().slice(0,max);
const number=value=>{const parsed=typeof value==='number'?value:Number(String(value??'').trim());return Number.isFinite(parsed)?parsed:null;};
const aedAmount=value=>{
  const source=typeof value==='number'?String(value):text(value,80);
  if(!source)return null;
  const parsed=Number(source.replace(/[\s,]/gu,'').replace(/[^0-9.-]/gu,''));
  return Number.isFinite(parsed)&&parsed>=0&&parsed<=10_000_000?Math.round(parsed*100)/100:null;
};
const normalizedIdentifier=value=>text(value,160).normalize('NFKC').toLocaleUpperCase('en-US').replace(/[\s_-]+/gu,'');
const normalizedName=value=>text(value,240).normalize('NFKC').replace(/\s+/gu,' ').toLocaleLowerCase('en-US');
const decodeEntities=value=>String(value).replace(/&(#x[0-9a-f]+|#\d+|nbsp|amp|lt|gt|quot|apos);/giu,(match,token)=>{
  const key=String(token).toLowerCase(),named={nbsp:' ',amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};
  if(Object.hasOwn(named,key))return named[key];
  const code=key.startsWith('#x')?Number.parseInt(key.slice(2),16):Number.parseInt(key.slice(1),10);
  return Number.isInteger(code)&&code>=0&&code<=0x10ffff?String.fromCodePoint(code):match;
});
// ShopPlus descriptions are often HTML fragments.  Keep the original source
// fields for audit, while presenting only their readable text in the App.
const readableDescription=(value,max=60000)=>decodeEntities(text(value,max)
  .replace(/<!--[\s\S]*?-->/gu,' ')
  .replace(/<(script|style|noscript|template|svg|iframe|object)\b[^>]*>[\s\S]*?<\/\1\s*>/giu,' ')
  .replace(/<\s*br\s*\/?\s*>/giu,'\n')
  .replace(/<\s*\/\s*(?:p|div|section|article|header|footer|h[1-6]|li|tr|blockquote|pre)\s*>/giu,'\n')
  .replace(/<\s*li\b[^>]*>/giu,'• ')
  .replace(/<[^>]*>/gu,' ')
  .replace(/\r\n?/gu,'\n')
  .replace(/[ \t]+\n/gu,'\n')
  .replace(/\n[ \t]+/gu,'\n')
  .replace(/[ \t]{2,}/gu,' ')
  .replace(/\n{3,}/gu,'\n\n')
  .trim())
  .replace(/[ \t]{2,}/gu,' ')
  .replace(/[ \t]+\n/gu,'\n')
  .replace(/\n[ \t]+/gu,'\n')
  .trim().slice(0,max);
const hash=value=>createHash('sha256').update(String(value)).digest('hex');
const safeFile=value=>typeof value==='string'&&/^shopplus-[a-f0-9]{16}\.(?:jpg|png|webp|gif)$/u.test(value);
const safeUrl=value=>{try{const url=new URL(String(value||''));return ['http:','https:'].includes(url.protocol)?url.href:null;}catch{return null;}};
const mimeForExtension={jpg:'image/jpeg',png:'image/png',webp:'image/webp',gif:'image/gif'};
const extensionForMime={'image/jpeg':'jpg','image/jpg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif'};
const extensionForUrl=value=>{try{const pathname=new URL(value).pathname.toLowerCase(),match=pathname.match(/\.([a-z0-9]{2,5})$/u);return match&&['jpg','jpeg','png','webp','gif'].includes(match[1])?(match[1]==='jpeg'?'jpg':match[1]):null;}catch{return null;}};
const copied=value=>JSON.parse(JSON.stringify(value));
const same=(left,right)=>JSON.stringify(left??null)===JSON.stringify(right??null);
const sourceStock=value=>['有货','无货'].includes(text(value,40))?text(value,40):null;
const sourceKey=value=>text(value?.sourceKey??value?.businessId??value?.sourceName,300).normalize('NFKC').toLocaleUpperCase('en-US').replace(/\s+/gu,' ');
const websiteFields=product=>({websitePriceAed:product?.websitePriceAed??null,stockKnown:Boolean(product?.stockKnown),stockQuantity:product?.stockKnown?Number(product?.stockQuantity??0):null,publishStatus:[0,1].includes(product?.publishStatus)?product.publishStatus:null,variants:Array.isArray(product?.variants)?product.variants:[]});
const sourceFields=row=>({businessId:text(row?.businessId,160)||null,sourceName:text(row?.sourceName,240)||null,costPriceAed:aedAmount(row?.cost),suggestedPriceAed:aedAmount(row?.suggestedPrice),sourceStock:sourceStock(row?.stock),removed:Boolean(row?.removed)||text(row?.stock,40)==='来源已移除'});

function catalogError(message,code='SHOPPLUS_PRODUCT_CATALOG'){
  return Object.assign(new Error(message),{code,stage:'商品库存试采集'});
}

function productImages(raw){
  const images=Array.isArray(raw?.productImgDTOs)?raw.productImgDTOs:Array.isArray(raw?.images)?raw.images:[];
  const found=[],seen=new Set();
  for(const image of images){const url=safeUrl(image?.imgUrl||image?.url||image?.imageUrl||image?.src);if(url&&!seen.has(url)){seen.add(url);found.push(url);}}
  return found;
}

function productStock(raw){
  const variants=Array.isArray(raw?.productVariantDTOs)?raw.productVariantDTOs:Array.isArray(raw?.variants)?raw.variants:[];
  let found=false,total=0,price=null;
  for(const variant of variants){
    const quantity=number(variant?.productVariantInventoryDTO?.availableStockQuantity??variant?.availableStockQuantity??variant?.inventory?.availableStockQuantity);
    if(quantity===null)continue;
    found=true;total+=Math.max(0,Math.floor(quantity));
    if(price===null){const sale=number(variant?.salePrice??variant?.price);if(sale!==null&&sale>=0)price=sale;}
  }
  if(price===null){const sale=number(raw?.salePrice??raw?.price);if(sale!==null&&sale>=0)price=sale;}
  return {known:found,quantity:total,price};
}

function productVariants(raw){
  const variants=Array.isArray(raw?.productVariantDTOs)?raw.productVariantDTOs:Array.isArray(raw?.variants)?raw.variants:[];
  return variants.map(variant=>{
    const quantity=number(variant?.productVariantInventoryDTO?.availableStockQuantity??variant?.availableStockQuantity??variant?.inventory?.availableStockQuantity);
    const id=text(variant?.id??variant?.variantId,160);
    return {id:id||null,skuCode:text(variant?.skuCode,160)||null,optionValueNames:text(variant?.optionValueNames,240)||null,stockQuantity:quantity===null?null:Math.max(0,Math.floor(quantity)),isTrackInventory:number(variant?.isTrackInventory??variant?.productVariantInventoryDTO?.isTrackInventory),inventoryPolicy:text(variant?.productVariantInventoryDTO?.inventoryPolicy??variant?.inventoryPolicy,40)||null};
  }).filter(variant=>variant.id||variant.stockQuantity!==null);
}

function candidate(raw){
  const remoteProductId=text(raw?.id??raw?.productId,160),stock=productStock(raw);
  if(!remoteProductId)return null;
  const sourceSpu=text(raw?.spuCode??raw?.spu??'',160),base=(sourceSpu||remoteProductId).replace(/[^A-Za-z0-9_-]/gu,'').slice(0,48)||'PRODUCT';
  const publish=number(raw?.publishStatus);
  return {
    remoteProductId,
    productNumber:`SP-${base.toUpperCase()}-${hash(remoteProductId).slice(0,6).toUpperCase()}`,
    sourceSpu:sourceSpu||null,
    sourceUpdatedAt:text(raw?.updatedAt??raw?.updateTime??'',80)||null,
    sourceUrl:safeUrl(raw?.productUrl??raw?.url??raw?.websiteUrl),
    sourceName:text(raw?.title??raw?.name??raw?.productName,240)||remoteProductId,
    sourceShortDescription:text(raw?.productShortDesc??raw?.shortDescription,12000)||null,
    sourceLongDescription:text(raw?.productLongDesc??raw?.longDescription??raw?.description,60000)||null,
    websitePriceAed:stock.price,
    stockQuantity:stock.quantity,
    stockKnown:stock.known,
    publishStatus:[0,1].includes(publish)?publish:null,
    variants:productVariants(raw),
    imageUrls:productImages(raw)
  };
}

function imageRecords(product){
  const images=Array.isArray(product?.images)?product.images.filter(image=>image&&typeof image==='object'):[];
  if(images.length)return images;
  return product?.image&&typeof product.image==='object'?[product.image]:[];
}

function primaryImage(product){return imageRecords(product)[0]||null;}

function uniqueIndex(rows,key){
  const index=new Map();
  for(const row of rows){
    const value=key(row);
    if(!value)continue;
    const values=index.get(value)||[];
    values.push(row);index.set(value,values);
  }
  return index;
}

function uniqueValue(index,key){
  const candidates=index.get(key)||[];
  return candidates.length===1?candidates[0]:null;
}

function matchSourceProduct(product,sourceById,sourceByName){
  for(const candidate of [product?.productNumber,product?.sourceSpu,product?.remoteProductId]){
    const found=uniqueValue(sourceById,normalizedIdentifier(candidate));
    if(found)return {row:found,method:'商品编号精确匹配'};
  }
  const found=uniqueValue(sourceByName,normalizedName(product?.sourceName));
  return found?{row:found,method:'商品名称唯一精确匹配'}:null;
}

function retainedProduct(next,previous,now){
  return {
    remoteProductId:next.remoteProductId,
    productNumber:previous?.productNumber||next.productNumber,
    sourceSpu:next.sourceSpu,
    sourceUpdatedAt:next.sourceUpdatedAt,
    sourceUrl:next.sourceUrl,
    sourceName:next.sourceName,
    localName:previous?.localName||null,
    sourceShortDescription:next.sourceShortDescription,
    sourceLongDescription:next.sourceLongDescription,
    localDescription:previous?.localDescription||null,
    websitePriceAed:next.websitePriceAed,
    stockQuantity:next.stockQuantity,
    stockKnown:next.stockKnown,
    publishStatus:next.publishStatus,
    variants:next.variants,
    costPriceAed:previous?.costPriceAed??null,
    suggestedPriceAed:previous?.suggestedPriceAed??null,
    sourcePricing:previous?.sourcePricing||null,
    listingControl:previous?.listingControl||{manualLock:false},
    floorPriceAed:previous?.floorPriceAed??null,
    image:primaryImage(previous),
    images:imageRecords(previous),
    sourceImageCount:next.imageUrls.length,
    capturedAt:now,
    updatedAt:now
  };
}

function collectionTarget(value){
  const target=value==='all'?SHOPPLUS_PRODUCT_COLLECTION_LIMIT:Number(value??SHOPPLUS_PRODUCT_COLLECTION_DEFAULT);
  if(!Number.isSafeInteger(target)||![2,5,10,SHOPPLUS_PRODUCT_COLLECTION_LIMIT].includes(target))throw catalogError('请选择 2、5、10 或全部在售（首批最多 100）','SHOPPLUS_PRODUCT_TARGET_INVALID');
  return target;
}

function pageSizeFor(target){return Math.max(2,Math.min(SHOPPLUS_PRODUCT_COLLECTION_LIMIT,target));}

export class ShopPlusProductCatalog {
  constructor({directory,fetchImpl=globalThis.fetch,now=()=>new Date()}={}){
    if(!directory)throw new TypeError('商品试采集目录不能为空');
    this.directory=directory;this.mediaDirectory=path.join(directory,'media');this.file=path.join(directory,'shopplus-product-pilot.json');this.fetchImpl=fetchImpl;this.now=now;this.state=null;this.queue=Promise.resolve();
  }
  serial(operation){const result=this.queue.then(operation);this.queue=result.catch(()=>{});return result;}
  async load(){
    if(this.state)return this.state;
    let parsed;
    try{parsed=JSON.parse(await readFile(this.file,'utf8'));}
    catch(error){if(error?.code==='ENOENT'){this.state=initial();return this.state;}throw catalogError('商品试采集记录无法读取；原有记录已保留','SHOPPLUS_PRODUCT_STORE_READ');}
    if(!parsed||![1,2,3].includes(parsed.version)||!Array.isArray(parsed.products)||parsed.products.length>SHOPPLUS_PRODUCT_LOCAL_RECORD_LIMIT)throw catalogError('商品本机目录记录格式无效；原有记录已保留','SHOPPLUS_PRODUCT_STORE_INVALID');
    const products=parsed.products.map(product=>{
      const images=imageRecords(product);
      return {...product,images,image:images[0]||null,sourceImageCount:Number.isSafeInteger(product?.sourceImageCount)?product.sourceImageCount:images.length};
    });
    const archivedProducts=(parsed.version===2&&Array.isArray(parsed.archivedProducts)?parsed.archivedProducts:[]).slice(0,SHOPPLUS_PRODUCT_ARCHIVE_LIMIT).map(product=>{
      const images=imageRecords(product);
      return {...product,images,image:images[0]||null,sourceImageCount:Number.isSafeInteger(product?.sourceImageCount)?product.sourceImageCount:images.length};
    });
    const mappingCatalog=(parsed.version===3&&Array.isArray(parsed.mappingCatalog)?parsed.mappingCatalog:[]).slice(0,SHOPPLUS_PRODUCT_LOCAL_RECORD_LIMIT).map(product=>({...product,image:null,images:[]}));
    this.state={...initial(),...parsed,version:3,listingHistory:Array.isArray(parsed.listingHistory)?parsed.listingHistory.slice(0,200):[],products,archivedProducts,mappingCatalog};return this.state;
  }
  async persist(){
    const next={...this.state,version:3,products:this.state.products.slice(0,SHOPPLUS_PRODUCT_LOCAL_RECORD_LIMIT),archivedProducts:(this.state.archivedProducts||[]).slice(0,SHOPPLUS_PRODUCT_ARCHIVE_LIMIT),mappingCatalog:(this.state.mappingCatalog||[]).slice(0,SHOPPLUS_PRODUCT_LOCAL_RECORD_LIMIT)},temporary=`${this.file}.${Date.now()}.pending`;
    try{await mkdir(this.mediaDirectory,{recursive:true,mode:0o700});await writeFile(temporary,JSON.stringify(next,null,2),{encoding:'utf8',mode:0o600,flag:'wx'});await rename(temporary,this.file);this.state=next;}
    catch(error){await unlink(temporary).catch(()=>{});throw catalogError(`商品试采集记录保存失败：${String(error?.message||error).slice(0,160)}`,'SHOPPLUS_PRODUCT_STORE_WRITE');}
  }
  async cachedImageData(image){
    if(!image||image.status!=='cached'||!safeFile(image.file))return null;
    try{const bytes=await readFile(path.join(this.mediaDirectory,image.file));if(bytes.length>=SHOPPLUS_PRODUCT_IMAGE_MAX_BYTES)return null;return `data:${image.mimeType||mimeForExtension[image.file.split('.').pop()]||'image/jpeg'};base64,${bytes.toString('base64')}`;}
    catch{return null;}
  }
  async view(){
    await this.load();const products=[];
    for(const product of this.state.products){
      const images=[];
      for(const stored of imageRecords(product)){
        const image={...stored};
        image.dataUrl=await this.cachedImageData(image);
        images.push(image);
      }
      const image=images[0]||null;
      const descriptionSource=product.localDescription??product.sourceLongDescription??product.sourceShortDescription??'';
      products.push({...copied(product),name:product.localName||product.sourceName,description:readableDescription(descriptionSource),image,images});
    }
    const archivedProducts=[];
    for(const product of this.state.archivedProducts||[]){const images=[];for(const stored of imageRecords(product)){const image={...stored};image.dataUrl=await this.cachedImageData(image);images.push(image);}const descriptionSource=product.localDescription??product.sourceLongDescription??product.sourceShortDescription??'';archivedProducts.push({...copied(product),name:product.localName||product.sourceName,description:readableDescription(descriptionSource),image:images[0]||null,images});}
    const lastRun=this.state.lastRun?copied(this.state.lastRun):null;
    const mappingCatalog=(this.state.mappingCatalog||[]).map(product=>({...copied(product),name:product.localName||product.sourceName,image:null,images:[]}));
    return {products,archivedProducts,mappingCatalog,mappingCatalogRun:this.state.mappingCatalogRun?copied(this.state.mappingCatalogRun):null,listingHistory:copied(this.state.listingHistory||[]),lastRun,refreshRun:this.state.refreshRun?copied(this.state.refreshRun):null,mediaRun:this.state.mediaRun?copied(this.state.mediaRun):null,sourcePricingRun:this.state.sourcePricingRun?copied(this.state.sourcePricingRun):null,reconciliation:this.state.reconciliation?copied(this.state.reconciliation):null,lastSuccessfulReadAt:this.state.lastSuccessfulReadAt||null,batch:copied(this.state.batch||initial().batch),limit:null,legacyLimit:SHOPPLUS_PRODUCT_COLLECTION_LIMIT,archivedCount:(this.state.archivedProducts||[]).length,defaultTarget:SHOPPLUS_PRODUCT_COLLECTION_DEFAULT,imageMaxBytes:SHOPPLUS_PRODUCT_IMAGE_MAX_BYTES,canCollect:true};
  }
  async getView(){return this.serial(()=>this.view());}
  async imageRecord({remoteProductId,sourceUrl,previous}){
    if(!sourceUrl)return {status:'none',sourceUrl:null,byteLength:null,reviewReason:null,file:null,mimeType:null};
    if(previous?.sourceUrl===sourceUrl&&['cached','manual_review'].includes(previous.status))return {...previous};
    if(typeof this.fetchImpl!=='function')return {status:'unavailable',sourceUrl,byteLength:null,reviewReason:'图片读取环境不可用',file:null,mimeType:null};
    let response;
    try{response=await this.fetchImpl(sourceUrl,{headers:{accept:'image/avif,image/webp,image/png,image/jpeg,image/gif,*/*;q=0.5'},signal:typeof AbortSignal?.timeout==='function'?AbortSignal.timeout(20000):undefined});}
    catch(error){return {status:'unavailable',sourceUrl,byteLength:null,reviewReason:`图片读取失败：${String(error?.message||error).slice(0,120)}`,file:null,mimeType:null};}
    if(!response?.ok)return {status:'unavailable',sourceUrl,byteLength:null,reviewReason:`图片读取返回 HTTP ${Number(response?.status)||'错误'}`,file:null,mimeType:null};
    const declared=number(response.headers?.get?.('content-length'));
    if(declared!==null&&declared>=SHOPPLUS_PRODUCT_IMAGE_MAX_BYTES)return {status:'manual_review',sourceUrl,byteLength:Math.floor(declared),reviewReason:'图片达到或超过 500 KiB，未缓存，待人工确认',file:null,mimeType:null};
    const sourceType=String(response.headers?.get?.('content-type')||'').split(';',1)[0].trim().toLowerCase(),urlExtension=extensionForUrl(sourceUrl),extension=extensionForMime[sourceType]||urlExtension,mimeType=extension?mimeForExtension[extension]:null;
    if(!mimeType)return {status:'unavailable',sourceUrl,byteLength:null,reviewReason:'图片格式不在允许的 JPEG、PNG、WebP 或 GIF 范围内',file:null,mimeType:null};
    let bytes;
    try{
      if(response.body?.getReader){
        const reader=response.body.getReader(),chunks=[];let size=0;
        while(true){const {done,value}=await reader.read();if(done)break;const chunk=Buffer.from(value);size+=chunk.length;if(size>=SHOPPLUS_PRODUCT_IMAGE_MAX_BYTES){await reader.cancel().catch(()=>{});return {status:'manual_review',sourceUrl,byteLength:size,reviewReason:'图片达到或超过 500 KiB，未缓存，待人工确认',file:null,mimeType:null};}chunks.push(chunk);}
        bytes=Buffer.concat(chunks,size);
      }else bytes=Buffer.from(await response.arrayBuffer());
    }catch(error){return {status:'unavailable',sourceUrl,byteLength:null,reviewReason:`图片读取失败：${String(error?.message||error).slice(0,120)}`,file:null,mimeType:null};}
    if(bytes.length>=SHOPPLUS_PRODUCT_IMAGE_MAX_BYTES)return {status:'manual_review',sourceUrl,byteLength:bytes.length,reviewReason:'图片达到或超过 500 KiB，未缓存，待人工确认',file:null,mimeType:null};
    const file=`shopplus-${hash(`${remoteProductId}:${sourceUrl}`).slice(0,16)}.${extension}`,target=path.join(this.mediaDirectory,file),temporary=`${target}.${Date.now()}.pending`;
    try{await mkdir(this.mediaDirectory,{recursive:true,mode:0o700});await writeFile(temporary,bytes,{mode:0o600,flag:'wx'});await rename(temporary,target);}
    catch(error){await unlink(temporary).catch(()=>{});return {status:'unavailable',sourceUrl,byteLength:bytes.length,reviewReason:`图片缓存失败：${String(error?.message||error).slice(0,120)}`,file:null,mimeType:null};}
    return {status:'cached',sourceUrl,byteLength:bytes.length,reviewReason:null,file,mimeType};
  }
  async collectImagesForProduct(product,urls,previousImages=[]){
    const byUrl=new Map(previousImages.filter(image=>image?.sourceUrl).map(image=>[image.sourceUrl,image]));
    const images=[];
    for(const sourceUrl of urls)images.push(await this.imageRecord({remoteProductId:product.remoteProductId,sourceUrl,previous:byUrl.get(sourceUrl)}));
    return images;
  }
  async readPages(listPage,{pageSize,until}={}){
    if(typeof listPage!=='function')throw catalogError('ShopPlus 商品读取接口暂不可用','SHOPPLUS_PRODUCT_LIST_UNAVAILABLE');
    const rows=[],seenPages=new Set();let pageNum=1,received=0,pages=0,totalCount=null,complete=false;
    while(pageNum<=100000){
      const response=await listPage({pageNum,pageSize}),current=Array.isArray(response?.products)?response.products:[];
      const pageSignature=current.map(raw=>text(raw?.id??raw?.productId??raw?.spuCode??'',160)).join('\u0001');
      if(pageSignature&&seenPages.has(pageSignature))break;
      if(pageSignature)seenPages.add(pageSignature);
      pages++;received+=current.length;
      const declared=Number(response?.totalCount);if(Number.isFinite(declared)&&declared>=0)totalCount=declared;
      for(const raw of current){rows.push(raw);if(until?.(rows)){complete=true;break;}}
      if(complete||!current.length||current.length<pageSize||(totalCount!==null&&received>=totalCount))break;
      pageNum++;
    }
    return {rows,received,pages,totalCount,complete};
  }
  async collect({listPage,target}={}){
    return this.serial(async()=>{
      await this.load();
      const requestedTarget=collectionTarget(target),existing=this.state.products.slice(),existingById=new Map(existing.map(product=>[product.remoteProductId,product]));
      if(existing.length>=requestedTarget||existing.length>=SHOPPLUS_PRODUCT_COLLECTION_LIMIT){
        const at=this.now().toISOString();this.state.lastRun={at,target:requestedTarget,received:0,pages:0,skippedUnpublished:0,skippedOutOfStock:0,added:0,captured:existing.length,imageManualReview:existing.flatMap(product=>imageRecords(product)).filter(image=>image.status==='manual_review').length,limit:SHOPPLUS_PRODUCT_COLLECTION_LIMIT,status:'target_already_met'};this.state.batch={status:'ready',captured:existing.length};await this.persist();return this.view();
      }
      const additions=[];let skippedUnpublished=0,skippedOutOfStock=0;
      const scan=await this.readPages(listPage,{pageSize:pageSizeFor(requestedTarget),until:rows=>{
        const item=candidate(rows.at(-1));if(!item)return false;
        if(item.publishStatus!==1){skippedUnpublished++;return false;}
        if(!item.stockKnown||item.stockQuantity<=0){skippedOutOfStock++;return false;}
        if(existingById.has(item.remoteProductId)||additions.some(product=>product.remoteProductId===item.remoteProductId))return false;
        additions.push(item);return existing.length+additions.length>=requestedTarget;
      }});
      const at=this.now().toISOString(),products=existing.slice();
      for(const item of additions.slice(0,Math.max(0,requestedTarget-existing.length))){
        const retained=retainedProduct(item,null,at),images=await this.collectImagesForProduct(item,item.imageUrls.slice(0,1),[]);
        retained.images=images;retained.image=images[0]||null;products.push(retained);
      }
      if(products.length>SHOPPLUS_PRODUCT_COLLECTION_LIMIT)throw catalogError('商品本机目录超过 100 款安全上限，未保存','SHOPPLUS_PRODUCT_LIMIT');
      this.state.products=products;
      const imageManualReview=products.flatMap(product=>imageRecords(product)).filter(image=>image.status==='manual_review').length;
      this.state.lastRun={at,target:requestedTarget,received:scan.received,pages:scan.pages,totalCount:scan.totalCount,skippedUnpublished,skippedOutOfStock,added:products.length-existing.length,captured:products.length,imageManualReview,limit:SHOPPLUS_PRODUCT_COLLECTION_LIMIT,status:products.length>=requestedTarget?'target_met':'source_exhausted'};
      this.state.lastSuccessfulReadAt=at;this.state.batch={status:'ready',captured:products.length};
      await this.persist();return this.view();
    });
  }
  async collectPublishedInStock({listPage}={}){
    return this.serial(async()=>{
      await this.load();
      const existing=this.state.products.slice(),existingById=new Map(existing.map(product=>[product.remoteProductId,product]));
      const archivedById=new Map((this.state.archivedProducts||[]).map(product=>[product.remoteProductId,product]));
      const scan=await this.readPages(listPage,{pageSize:SHOPPLUS_PRODUCT_ACTIVE_CATALOG_PAGE_SIZE});
      const at=this.now().toISOString(),products=[],activeIds=new Set();let skippedUnpublished=0,skippedOutOfStock=0,added=0,reinstated=0;
      for(const raw of scan.rows){
        const item=candidate(raw);if(!item)continue;
        if(item.publishStatus!==1){skippedUnpublished++;continue;}
        if(!item.stockKnown||item.stockQuantity<=0){skippedOutOfStock++;continue;}
        if(activeIds.has(item.remoteProductId))continue;
        activeIds.add(item.remoteProductId);
        const previous=existingById.get(item.remoteProductId)||archivedById.get(item.remoteProductId)||null;
        if(!previous)added++;else if(!existingById.has(item.remoteProductId))reinstated++;
        products.push(retainedProduct(item,previous,at));
      }
      if(products.length>SHOPPLUS_PRODUCT_LOCAL_RECORD_LIMIT)throw catalogError(`符合“已上架且有库存”条件的商品超过本机安全上限 ${SHOPPLUS_PRODUCT_LOCAL_RECORD_LIMIT} 款，未保存；请先核对网站目录范围`,'SHOPPLUS_PRODUCT_ACTIVE_CATALOG_LIMIT');
      const latestById=new Map((this.state.archivedProducts||[]).map(product=>[product.remoteProductId,product]));let archived=0;
      for(const product of existing){
        if(activeIds.has(product.remoteProductId)){latestById.delete(product.remoteProductId);continue;}
        const raw=scan.rows.find(row=>text(row?.id??row?.productId,160)===product.remoteProductId),item=candidate(raw);
        const reason=!item?'本次网站读取未返回该商品，已保留本机资料待人工核对':item.publishStatus!==1?'网站当前已下架，已移出当前目录':!item.stockKnown?'网站库存未确认，已移出当前目录':'网站库存为零，已移出当前目录';
        latestById.set(product.remoteProductId,{...product,archivedAt:at,archivedReason:reason});archived++;
      }
      for(const id of activeIds)latestById.delete(id);
      this.state.products=products;
      this.state.archivedProducts=[...latestById.values()].sort((left,right)=>String(right.archivedAt||'').localeCompare(String(left.archivedAt||''))).slice(0,SHOPPLUS_PRODUCT_ARCHIVE_LIMIT);
      this.state.lastRun={at,scope:'published-in-stock',received:scan.received,pages:scan.pages,totalCount:scan.totalCount,skippedUnpublished,skippedOutOfStock,added,reinstated,archived,captured:products.length,imageManualReview:products.flatMap(product=>imageRecords(product)).filter(image=>image.status==='manual_review').length,status:'completed'};
      this.state.lastSuccessfulReadAt=at;this.state.batch={status:'ready',captured:products.length};
      await this.persist();return this.view();
    });
  }
  async syncMappingCatalog({listPage}={}){
    return this.serial(async()=>{
      await this.load();
      const scan=await this.readPages(listPage,{pageSize:SHOPPLUS_PRODUCT_ACTIVE_CATALOG_PAGE_SIZE});
      const at=this.now().toISOString(),seen=new Set(),products=[];let listed=0,unlisted=0,inStock=0,outOfStock=0,unknownStock=0;
      for(const raw of scan.rows){
        const item=candidate(raw);if(!item||seen.has(item.remoteProductId))continue;
        seen.add(item.remoteProductId);
        if(item.publishStatus===1)listed++;else if(item.publishStatus===0)unlisted++;
        if(!item.stockKnown)unknownStock++;else if(item.stockQuantity>0)inStock++;else outOfStock++;
        // This dedicated matching snapshot deliberately has no image data and
        // does not alter the active inventory catalogue used by other pages.
        products.push({...item,image:null,images:[],capturedAt:at,updatedAt:at});
      }
      if(products.length>SHOPPLUS_PRODUCT_LOCAL_RECORD_LIMIT)throw catalogError(`网站商品目录超过本机安全上限 ${SHOPPLUS_PRODUCT_LOCAL_RECORD_LIMIT} 款，未保存；请先缩小网站目录范围`,'SHOPPLUS_PRODUCT_MAPPING_CATALOG_LIMIT');
      this.state.mappingCatalog=products;
      this.state.mappingCatalogRun={at,received:scan.received,pages:scan.pages,totalCount:scan.totalCount,captured:products.length,listed,unlisted,inStock,outOfStock,unknownStock};
      this.state.lastSuccessfulReadAt=at;
      await this.persist();return this.view();
    });
  }
  async refresh({listPage}={}){
    return this.serial(async()=>{
      await this.load();
      if(!this.state.products.length)throw catalogError('尚未保存可更新的 ShopPlus 商品','SHOPPLUS_PRODUCT_REFRESH_EMPTY');
      const savedById=new Map(this.state.products.map(product=>[product.remoteProductId,product])),sources=new Map();
      const scan=await this.readPages(listPage,{pageSize:pageSizeFor(this.state.products.length),until:rows=>{
        const item=candidate(rows.at(-1));if(item&&savedById.has(item.remoteProductId))sources.set(item.remoteProductId,item);
        return sources.size===savedById.size;
      }});
      const at=this.now().toISOString();let refreshed=0,missing=0;
      this.state.products=this.state.products.map(saved=>{
        const source=sources.get(saved.remoteProductId);
        if(!source){missing++;return {...saved,refresh:{status:'not_returned',at,reason:'本次网站读取未返回该商品，已保留本机资料，待人工核对'}};}
        refreshed++;return {...retainedProduct(source,saved,at),refresh:{status:'refreshed',at}};
      });
      this.state.refreshRun={at,received:scan.received,pages:scan.pages,totalCount:scan.totalCount,requestedProducts:savedById.size,refreshed,missing};
      this.state.lastSuccessfulReadAt=at;this.state.batch={status:'ready',captured:this.state.products.length};
      await this.persist();return this.view();
    });
  }
  async collectMedia({listPage}={}){
    return this.serial(async()=>{
      await this.load();
      if(!this.state.products.length)throw catalogError('尚未保存可补采图片的 ShopPlus 商品','SHOPPLUS_PRODUCT_MEDIA_EMPTY');
      const wanted=new Set(this.state.products.map(product=>product.remoteProductId)),sources=new Map();
      const scan=await this.readPages(listPage,{pageSize:pageSizeFor(this.state.products.length),until:rows=>{
        const item=candidate(rows.at(-1));if(item&&wanted.has(item.remoteProductId))sources.set(item.remoteProductId,item);
        return sources.size===wanted.size;
      }});
      const at=this.now().toISOString();let matched=0,skippedOutOfStock=0,sourceImages=0,cachedImages=0,manualReviewImages=0,unavailableImages=0;
      const products=[];
      for(const saved of this.state.products){
        const source=sources.get(saved.remoteProductId),previousImages=imageRecords(saved);
        if(!source){products.push({...saved,media:{status:'incomplete',at,reason:'本次 ShopPlus 读取未返回该商品',sourceImageCount:previousImages.length}});continue;}
        matched++;
        if(!source.stockKnown||source.stockQuantity<=0){skippedOutOfStock++;products.push({...saved,media:{status:'skipped_out_of_stock',at,reason:'网站当前库存未确认或为零，未补采图片',sourceImageCount:previousImages.length}});continue;}
        if(!source.imageUrls.length){products.push({...saved,media:{status:'incomplete',at,reason:'网站本次未返回可读取的图片列表',sourceImageCount:0}});continue;}
        const images=await this.collectImagesForProduct(source,source.imageUrls,previousImages);
        const summary={status:'completed',at,sourceImageCount:images.length,cachedImageCount:images.filter(image=>image.status==='cached').length,manualReviewImageCount:images.filter(image=>image.status==='manual_review').length,unavailableImageCount:images.filter(image=>image.status==='unavailable'||image.status==='none').length};
        sourceImages+=summary.sourceImageCount;cachedImages+=summary.cachedImageCount;manualReviewImages+=summary.manualReviewImageCount;unavailableImages+=summary.unavailableImageCount;
        products.push({...saved,images,image:images[0]||null,sourceImageCount:images.length,media:summary,updatedAt:at});
      }
      this.state.products=products;
      this.state.mediaRun={at,received:scan.received,pages:scan.pages,requestedProducts:products.length,matchedProducts:matched,skippedOutOfStock,sourceImages,cachedImages,manualReviewImages,unavailableImages};
      this.state.lastSuccessfulReadAt=at;
      await this.persist();return this.view();
    });
  }
  async integrateSourcePricing({sourceProducts,sourceUpdatedAt=null}={}){
    return this.serial(async()=>{
      await this.load();
      if(!this.state.products.length)throw catalogError('请先采集有库存 ShopPlus 商品','SHOPPLUS_PRODUCT_SOURCE_PRICING_EMPTY');
      const source=Array.isArray(sourceProducts)?sourceProducts.filter(row=>row&&typeof row==='object'&&row.removed!==true):[];
      if(!source.length)throw catalogError('本机尚无可用来源库存资料；请先完成来源库存同步','SHOPPLUS_PRODUCT_SOURCE_PRICING_SOURCE_EMPTY');
      const sourceById=uniqueIndex(source,row=>normalizedIdentifier(row.businessId));
      const sourceByName=uniqueIndex(source,row=>normalizedName(row.sourceName));
      const at=this.now().toISOString();let matched=0,updated=0,unmatched=0,blank=0;
      this.state.products=this.state.products.map(product=>{
        const found=matchSourceProduct(product,sourceById,sourceByName);
        if(!found){
          unmatched++;
          return {...product,sourcePricing:{status:'unmatched',at,reason:'来源库存表未找到唯一精确匹配项'}};
        }
        matched++;
        const costPriceAed=aedAmount(found.row.cost),suggestedPriceAed=aedAmount(found.row.suggestedPrice);
        if(costPriceAed===null&&suggestedPriceAed===null)blank++;else updated++;
        const sourceStock=text(found.row.stock,40);
        return {...product,costPriceAed,suggestedPriceAed,sourcePricing:{status:costPriceAed===null&&suggestedPriceAed===null?'matched_empty':'matched',at,method:found.method,sourceBusinessId:text(found.row.businessId,160)||null,sourceName:text(found.row.sourceName,240)||null,sourceStock:['有货','无货'].includes(sourceStock)?sourceStock:null,costPriceAed,suggestedPriceAed}};
      });
      this.state.sourcePricingRun={at,sourceUpdatedAt:sourceUpdatedAt||null,sourceCount:source.length,matched,updated,unmatched,blank};
      await this.persist();return this.view();
    });
  }
  async reconcileSourceAndWebsite({sourceProducts,sourceSnapshotProducts=[],sourceUpdatedAt=null,listPage}={}){
    return this.serial(async()=>{
      await this.load();
      const source=Array.isArray(sourceProducts)?sourceProducts.filter(row=>row&&typeof row==='object') : [];
      if(!source.length)throw catalogError('本机尚无已确认映射的来源资料；请先完成来源资料同步和映射确认','SHOPPLUS_RECONCILIATION_SOURCE_EMPTY');
      const all=[...this.state.products,...(this.state.archivedProducts||[])],byBusiness=new Map(all.map(product=>[normalizedIdentifier(product.productNumber),product])),scoped=source.map(row=>({row,product:byBusiness.get(normalizedIdentifier(row.businessId))||null})).filter(item=>item.product);
      if(!scoped.length)throw catalogError('没有找到可按已确认映射核对的网站商品','SHOPPLUS_RECONCILIATION_MAPPING_EMPTY');
      const wanted=new Set(scoped.map(item=>item.product.remoteProductId)),websiteById=new Map();
      const scan=await this.readPages(listPage,{pageSize:SHOPPLUS_PRODUCT_ACTIVE_CATALOG_PAGE_SIZE,until:rows=>{const item=candidate(rows.at(-1));if(item&&wanted.has(item.remoteProductId))websiteById.set(item.remoteProductId,item);return websiteById.size===wanted.size;}});
      const at=this.now().toISOString(),previousKeys=Array.isArray(this.state.reconciliation?.sourceKeys)?this.state.reconciliation.sourceKeys:[],currentKeys=[...new Set((Array.isArray(sourceSnapshotProducts)?sourceSnapshotProducts:[]).map(sourceKey).filter(Boolean))],firstBaseline=!previousKeys.length;
      const rows=[];let sourceChanged=0,websiteChanged=0,conflicts=0,sourceMissing=0,websiteMissing=0;
      for(const {row,product} of scoped){
        const nextSource=sourceFields(row),nextWebsite=websiteById.get(product.remoteProductId),website=nextWebsite?websiteFields(nextWebsite):null,beforeSource={costPriceAed:product.costPriceAed??null,suggestedPriceAed:product.suggestedPriceAed??null,sourceStock:sourceStock(product.sourcePricing?.sourceStock)},beforeWebsite=websiteFields(product),changes=[];
        if(nextSource.removed){changes.push('来源资料已消失；保留已应用的成本、建议售价和库存状态');sourceMissing++;}
        else {
          if(!product.sourcePricing||product.sourcePricing.status==='unmatched')changes.push('来源资料尚未融入本机平台');
          if(!same(beforeSource.costPriceAed,nextSource.costPriceAed))changes.push('来源成本发生变化');
          if(!same(beforeSource.suggestedPriceAed,nextSource.suggestedPriceAed))changes.push('来源建议售价发生变化');
          if(!same(beforeSource.sourceStock,nextSource.sourceStock))changes.push('来源有货／无货状态发生变化');
          if(changes.length)sourceChanged++;
        }
        if(!website){changes.push('网站未返回该已映射商品；保留已应用的网站资料');websiteMissing++;}
        else {
          const websiteStart=changes.length;
          if(!same(beforeWebsite.websitePriceAed,website.websitePriceAed))changes.push('网站售价发生变化');
          if(!same(beforeWebsite.stockKnown,website.stockKnown)||!same(beforeWebsite.stockQuantity,website.stockQuantity))changes.push('网站库存数量发生变化');
          if(!same(beforeWebsite.publishStatus,website.publishStatus))changes.push('网站上架状态发生变化');
          if(changes.length>websiteStart)websiteChanged++;
          if(nextSource.sourceStock==='无货'&&website.publishStatus===1&&website.stockKnown&&website.stockQuantity>0){changes.push('状态不一致：来源无货，但网站仍上架且有库存');conflicts++;}
          if(nextSource.sourceStock==='有货'&&website.publishStatus===0){changes.push('状态不一致：来源有货，但网站已下架');conflicts++;}
        }
        rows.push({businessId:product.productNumber,remoteProductId:product.remoteProductId,name:product.localName||product.sourceName,source:nextSource,website,before:{source:beforeSource,website:beforeWebsite},changes,changed:changes.length>0});
      }
      const newSource=firstBaseline?0:currentKeys.filter(key=>!previousKeys.includes(key)).length,removedSource=firstBaseline?0:previousKeys.filter(key=>!currentKeys.includes(key)).length;
      const summary={mapped:rows.length,changed:rows.filter(row=>row.changed).length,sourceChanged,websiteChanged,conflicts,sourceMissing,websiteMissing,newSource,removedSource,firstBaseline};
      this.state.reconciliation={schemaVersion:1,status:'pending',at,sourceUpdatedAt:sourceUpdatedAt||null,sourceKeys:currentKeys,summary,rows,scan:{received:scan.received,pages:scan.pages,totalCount:scan.totalCount,requestedProducts:wanted.size,returnedProducts:websiteById.size}};
      await this.persist();return this.view();
    });
  }
  async applyReconciliation(){
    return this.serial(async()=>{
      await this.load();const pending=this.state.reconciliation;
      if(!pending||pending.status!=='pending'||!Array.isArray(pending.rows))throw catalogError('请先读取网站最新资料并生成差异','SHOPPLUS_RECONCILIATION_NOT_READY');
      const byRemote=new Map(pending.rows.map(row=>[row.remoteProductId,row])),at=this.now().toISOString(),apply=(product=>{
        const row=byRemote.get(product.remoteProductId);if(!row)return product;const next={...product};
        if(row.source?.removed)next.sourcePricing={...(product.sourcePricing||{}),status:'source_removed',at,reason:'最新来源资料未出现；已保留上次应用的来源价格和库存状态'};
        else if(row.source){const costPriceAed=row.source.costPriceAed,suggestedPriceAed=row.source.suggestedPriceAed;next.costPriceAed=costPriceAed;next.suggestedPriceAed=suggestedPriceAed;next.sourcePricing={status:costPriceAed===null&&suggestedPriceAed===null?'matched_empty':'matched',at,method:'已确认来源商品映射',sourceBusinessId:row.source.businessId,sourceName:row.source.sourceName,sourceStock:row.source.sourceStock,costPriceAed,suggestedPriceAed};}
        if(row.website){next.websitePriceAed=row.website.websitePriceAed;next.stockKnown=row.website.stockKnown;next.stockQuantity=row.website.stockQuantity??0;next.publishStatus=row.website.publishStatus;next.variants=row.website.variants;next.refresh={status:'reconciled',at};}
        next.updatedAt=at;return next;
      });
      this.state.products=this.state.products.map(apply);this.state.archivedProducts=(this.state.archivedProducts||[]).map(apply);
      this.state.sourcePricingRun={at,sourceUpdatedAt:pending.sourceUpdatedAt||null,sourceCount:pending.rows.length,matched:pending.rows.filter(row=>!row.source?.removed).length,updated:pending.rows.filter(row=>!row.source?.removed).length,unmatched:0,blank:pending.rows.filter(row=>row.source&&!row.source.removed&&row.source.costPriceAed===null&&row.source.suggestedPriceAed===null).length,reconciliation:true};
      this.state.reconciliation={...pending,status:'applied',appliedAt:at};await this.persist();return this.view();
    });
  }
  async update({remoteProductId,name,floorPrice,description}={}){
    return this.serial(async()=>{
      await this.load();const id=text(remoteProductId,160),index=this.state.products.findIndex(product=>product.remoteProductId===id);if(index<0)throw catalogError('找不到待核对商品','SHOPPLUS_PRODUCT_NOT_FOUND');
      const product=this.state.products[index];
      if(name!==undefined){const next=text(name,240);if(!next)throw catalogError('商品名称不能为空','SHOPPLUS_PRODUCT_NAME_INVALID');product.localName=next;}
      if(floorPrice!==undefined){if(floorPrice===null||String(floorPrice).trim()==='')product.floorPriceAed=null;else{const value=number(floorPrice);if(value===null||value<0||value>10_000_000)throw catalogError('底价必须是有效的 AED 金额','SHOPPLUS_PRODUCT_FLOOR_INVALID');product.floorPriceAed=Math.round(value*100)/100;}}
      if(description!==undefined){const next=text(description,60000);product.localDescription=next||null;}
      product.updatedAt=this.now().toISOString();await this.persist();return this.view();
    });
  }
  async listingReview(){
    return this.serial(async()=>{
      await this.load();const at=this.now().toISOString(),operations=[];
      for(const product of this.state.products){
        const sourceStock=product?.sourcePricing?.sourceStock,current=product?.publishStatus,locked=product?.listingControl?.manualLock===true;
        let state='not_actionable',reason='来源资料尚未唯一匹配';let target=null;
        if(locked){state='locked';reason='此商品已被人工锁定；来源变化只作提示，不自动建议写网站';}
        else if(!['有货','无货'].includes(sourceStock)){state='source_unknown';reason='来源库存状态不是“有货”或“无货”';}
        else if(![0,1].includes(current)){state='website_unknown';reason='尚未读取到网站上架状态';}
        else{
          target=sourceStock==='有货'?1:0;
          if(current===target){state='aligned';reason=target===1?'来源有货，网站已上架':'来源无货，网站已下架';}
          else{state='suggested';reason=target===1?'来源有货但网站已下架，建议上架':'来源无货但网站已上架，建议下架';}
        }
        operations.push({remoteProductId:product.remoteProductId,productNumber:product.productNumber,name:product.localName||product.sourceName,sourceStock,publishStatus:[0,1].includes(current)?current:null,targetPublishStatus:target,state,reason});
      }
      return {at,operations,suggested:operations.filter(operation=>operation.state==='suggested').length,locked:operations.filter(operation=>operation.state==='locked').length};
    });
  }
  async recordWebsiteUpdate({remoteProductId,raw,action,manualLock}={}){
    return this.serial(async()=>{
      await this.load();const id=text(remoteProductId,160),index=this.state.products.findIndex(product=>product.remoteProductId===id),next=candidate(raw);
      if(index<0||!next||next.remoteProductId!==id)throw catalogError('网站回读商品与当前本机记录不一致','SHOPPLUS_PRODUCT_READBACK_MISMATCH');
      const previous=this.state.products[index],at=this.now().toISOString(),updated=retainedProduct(next,previous,at),target=action?.targetPublishStatus;
      updated.listingControl={...(previous.listingControl||{}),...(manualLock===undefined?{}:{manualLock:Boolean(manualLock)}),lastAction:action?{at,type:text(action.type,40)||'website_update',beforePublishStatus:[0,1].includes(action.beforePublishStatus)?action.beforePublishStatus:null,targetPublishStatus:[0,1].includes(target)?target:null,beforeStockQuantity:Number.isSafeInteger(action.beforeStockQuantity)?action.beforeStockQuantity:null,targetStockQuantity:Number.isSafeInteger(action.targetStockQuantity)?action.targetStockQuantity:null,note:text(action.note,240)||null}:previous.listingControl?.lastAction||null};
      this.state.products[index]=updated;
      if(action){const record={at,remoteProductId:id,productNumber:updated.productNumber,name:updated.localName||updated.sourceName,type:text(action.type,40)||'website_update',beforePublishStatus:[0,1].includes(action.beforePublishStatus)?action.beforePublishStatus:null,targetPublishStatus:[0,1].includes(target)?target:null,afterPublishStatus:[0,1].includes(updated.publishStatus)?updated.publishStatus:null,beforeStockQuantity:Number.isSafeInteger(action.beforeStockQuantity)?action.beforeStockQuantity:null,targetStockQuantity:Number.isSafeInteger(action.targetStockQuantity)?action.targetStockQuantity:null,afterStockQuantity:updated.stockKnown?updated.stockQuantity:null,note:text(action.note,240)||null,result:'verified'};this.state.listingHistory=[record,...(this.state.listingHistory||[])].slice(0,200);}
      await this.persist();return this.view();
    });
  }
  async setManualListingLock({remoteProductId,locked}={}){
    return this.serial(async()=>{
      await this.load();const id=text(remoteProductId,160),product=this.state.products.find(item=>item.remoteProductId===id);if(!product)throw catalogError('找不到待核对商品','SHOPPLUS_PRODUCT_NOT_FOUND');
      product.listingControl={...(product.listingControl||{}),manualLock:Boolean(locked),lockChangedAt:this.now().toISOString()};await this.persist();return this.view();
    });
  }
}
