// The chat composer may read a deliberately small projection of the local
// ShopPlus catalogue.  It must never turn a product search into a remote
// ShopPlus request or expose source URLs / cache file paths to the renderer.
const MAX_QUERY_LENGTH=160;
const MAX_RESULTS=60;
const MAX_TEXT_LENGTH=240;
const SAFE_IMAGE_DATA_URL=/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/iu;
const SAFE_IMAGE_TYPES=new Set(['image/jpeg','image/png','image/webp']);
const IMAGE_STATUS=new Set(['cached','unavailable','manual_review','none']);
const SOURCE_STOCK=new Set(['有货','无货']);

const cleanText=(value,max=MAX_TEXT_LENGTH)=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/gu,' ').replace(/\s+/gu,' ').trim().slice(0,max):'';
const nullableText=(value,max=MAX_TEXT_LENGTH)=>cleanText(value,max)||null;
const normalized=value=>cleanText(value,MAX_QUERY_LENGTH).normalize('NFKC').toLocaleLowerCase('en-US').replace(/[\s_-]+/gu,'');
const amount=value=>{
  const parsed=typeof value==='number'?value:Number(value);
  return Number.isFinite(parsed)&&parsed>=0&&parsed<=10_000_000?Math.round(parsed*100)/100:null;
};
const quantity=value=>{
  const parsed=typeof value==='number'?value:Number(value);
  return Number.isFinite(parsed)&&parsed>=0&&parsed<=10_000_000?Math.floor(parsed):null;
};
const timestamp=value=>{
  if(typeof value!=='string'||!value.trim())return null;
  const parsed=Date.parse(value);
  return Number.isFinite(parsed)?new Date(parsed).toISOString():null;
};
const imageFilename=(value,mimeType)=>{
  const base=cleanText(value,160).replace(/[\\/:*?"<>|]/gu,'_').replace(/^\.+/u,'').slice(0,150)||'商品图片';
  if(/\.(?:jpe?g|png|webp|gif)$/iu.test(base))return base;
  const extension={"image/jpeg":'jpg','image/png':'png','image/webp':'webp'}[mimeType]||'jpg';
  return `${base}.${extension}`;
};

function imageProjection(product,{includeImage=false}={}){
  const image=product?.image&&typeof product.image==='object'?product.image:null;
  let status=IMAGE_STATUS.has(image?.status)?image.status:'none';
  const projected={status};
  if(!includeImage||status!=='cached')return projected;
  const match=typeof image?.dataUrl==='string'?image.dataUrl.match(SAFE_IMAGE_DATA_URL):null;
  if(!match){projected.status='unavailable';return projected;}
  const mimetype=match[1].toLocaleLowerCase('en-US');
  if(!SAFE_IMAGE_TYPES.has(mimetype)){projected.status='unavailable';return projected;}
  projected.dataUrl=image.dataUrl;
  projected.mimetype=mimetype;
  projected.filename=imageFilename(image.sourceName||product.productNumber||product.name,mimetype);
  return projected;
}

function projectProduct(product,{includeImage=false}={}){
  const stockKnown=product?.stockKnown===true;
  return {
    remoteProductId:cleanText(product?.remoteProductId,160),
    name:cleanText(product?.name||product?.localName||product?.sourceName,MAX_TEXT_LENGTH),
    productNumber:nullableText(product?.productNumber,160),
    sourceSpu:nullableText(product?.sourceSpu,160),
    stockKnown,
    stockQuantity:stockKnown?quantity(product?.stockQuantity):null,
    sourceStock:SOURCE_STOCK.has(product?.sourcePricing?.sourceStock)?product.sourcePricing.sourceStock:null,
    websitePriceAed:amount(product?.websitePriceAed),
    costPriceAed:amount(product?.costPriceAed),
    suggestedPriceAed:amount(product?.suggestedPriceAed),
    floorPriceAed:amount(product?.floorPriceAed),
    image:imageProjection(product,{includeImage})
  };
}

function matchesQuery(product,query){
  if(!query)return true;
  return [product?.name,product?.localName,product?.sourceName,product?.productNumber,product?.sourceSpu]
    .some(value=>normalized(value).includes(query));
}

function selectionId(payload){
  if(!payload||typeof payload!=='object'||!Object.hasOwn(payload,'remoteProductId')||payload.remoteProductId===undefined||payload.remoteProductId===null)return null;
  if(typeof payload.remoteProductId!=='string')throw Object.assign(new Error('商品选择无效，请重新从本机目录选择'),{code:'CHAT_PRODUCT_SELECTION_INVALID'});
  const value=cleanText(payload.remoteProductId,160);
  if(!value||value!==payload.remoteProductId.trim()||payload.remoteProductId.length>160)throw Object.assign(new Error('商品选择无效，请重新从本机目录选择'),{code:'CHAT_PRODUCT_SELECTION_INVALID'});
  return value;
}

/**
 * Build a read-only, renderer-safe chat product projection from an already
 * loaded ShopPlusProductCatalog view.  The caller owns all I/O; this helper
 * never reads a URL, cache file, database, or remote service.
 */
export function projectChatProductCatalog(view,payload={}){
  const selectedId=selectionId(payload);
  if(payload?.includeImage===true&&!selectedId)throw Object.assign(new Error('选择商品后才能调取已缓存图片'),{code:'CHAT_PRODUCT_IMAGE_SELECTION_REQUIRED'});
  const query=typeof payload?.query==='string'?normalized(payload.query.slice(0,MAX_QUERY_LENGTH)):'';
  const products=Array.isArray(view?.products)?view.products:[];
  const candidates=products.filter(product=>{
    if(!product||typeof product!=='object'||product.publishStatus===0)return false;
    const id=cleanText(product.remoteProductId,160);
    return Boolean(id)&&(selectedId?id===selectedId:matchesQuery(product,query));
  });
  return {
    products:candidates.slice(0,selectedId?1:MAX_RESULTS).map(product=>projectProduct(product,{includeImage:Boolean(selectedId&&payload?.includeImage===true)})),
    lastSuccessfulReadAt:timestamp(view?.lastSuccessfulReadAt)
  };
}
