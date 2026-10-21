import path from 'node:path';
import {readJSON,writeJSON,stableHash} from '../core/files.mjs';
import {effectivePendingMappings} from '../mapping/source-rename.mjs';
import {parseMappingRows} from '../mapping/mapping.mjs';
import {sameSourceIdentity,sourceRows,sourceIdentityName} from '../sync/source-changes.mjs';
import {sourceModel} from '../mapping/source-key.mjs';
import {websitePriceGuard,toPriceFils,WEBSITE_PRICE_RULE_ID} from '../../shared/website-price-rule.mjs';

const norm=v=>String(v||'').normalize('NFKC').toUpperCase().replace(/[\s_-]+/g,'');
const rawProduct=v=>v?.productVO||v?.product||v;
const strictNumber=v=>v===null||v===undefined||typeof v==='boolean'||String(v).trim()===''?null:Number(v);
const quantity=v=>{const n=strictNumber(v);return Number.isSafeInteger(n)&&n>=0&&n<=10_000_000?n:null;};
const status=v=>v===0||v==='0'?0:v===1||v==='1'?1:null;
export function batchWebsite(raw){
  raw=rawProduct(raw);
  const variants=(Array.isArray(raw?.productVariantDTOs)?raw.productVariantDTOs:Array.isArray(raw?.variants)?raw.variants:[]).map(v=>({id:String(v.id??v.variantId??''),name:String(v.optionValueNames||v.skuCode||'单一规格'),stockQuantity:quantity(v.productVariantInventoryDTO?.availableStockQuantity??v.availableStockQuantity??v.stockQuantity),salePrice:toPriceFils(v.salePrice??v.price)===null?null:Number(v.salePrice??v.price)}));
  return {remoteProductId:String(raw?.id??raw?.productId??''),publishStatus:status(raw?.publishStatus),variants};
}
const webFingerprint=w=>stableHash({publishStatus:w.publishStatus,variants:w.variants});
const unique=values=>[...new Set(values)];
const grouped=(items,key)=>{const map=new Map();for(const item of items){const k=key(item);if(!map.has(k))map.set(k,[]);map.get(k).push(item);}return map;};
const emptyState=()=>({version:1,reads:{},history:[]});
// A manual price decision survives reads and stock changes, but never a new
// source price, product identity, or SKU set. It is not a price-verification pass.
const priceDecisionSource=row=>stableHash({id:row.id,business:row.businessId,name:row.name,cost:toPriceFils(row.source.cost),suggested:toPriceFils(row.source.suggestedPrice),rule:WEBSITE_PRICE_RULE_ID});
const priceVariantSet=variants=>stableHash(variants.map(v=>String(v.id)).sort());
const fullName=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/\s+/gu,'').trim();
const pendingIdentity=(source,origin)=>stableHash({name:source.sourceName,key:source.sourceKey,origin:origin?.id||null});
function pendingIdentities(data){
  const tasks=grouped([...(data.document.sourceChanges?.tasks||[]),...(data.document.sourceChanges?.catalogPending||[])].filter(t=>t.originKind==='added'||t.kind==='added'),t=>sourceIdentityName(t.current||t.after||t.before));
  return Object.fromEntries((data.snapshot?.products||[]).map(source=>[source.sourceKey||source.sourceName,pendingIdentity(source,(tasks.get(sourceIdentityName(source))||[]).find(t=>sameSourceIdentity(t.current||t.after||t.before,source)))]));
}
const sourceSignature=data=>stableHash({at:data.snapshot?.capturedAt,products:pendingIdentities(data)});
function pendingWebsiteMatch(data,source,ctx,website,related){
  if(ctx.blocked&&ctx.blocked!=='网站对应关系未确认')return {published:false,reason:ctx.blocked};
  if(ctx.product){const product=Date.parse(ctx.product.updatedAt)>Date.parse(website.at)?ctx.product:website.records.find(p=>p.remoteProductId===ctx.product.remoteProductId);return {product,published:product?.publishStatus===1,reason:!product?'网站目录未返回已对应商品，请核对':product.publishStatus===0?'网站商品尚未上架':'网站上架状态待核对'};}
  if(related.some(t=>!t.resolved&&t.kind==='review')||data.mappings.some(m=>m.status==='本机已忽略'&&sameSourceIdentity(m,source)))return {published:false,reason:'商品身份仍需人工核对'};
  const model=sourceModel(source.sourceName),peers=(data.index.sources.get(sourceIdentityName(source))||[]).filter(p=>sameSourceIdentity(p,source));
  if(peers.length!==1||model&&data.index.models.get(model)?.length!==1)return {published:false,reason:'来源名称或型号不唯一，请核对对应'};
  // Exact full title or an exact seller model/SKU identifier, never fuzzy/substring matching.
  const matches=[...new Map([...(website.names.get(fullName(source.sourceName))||[]),...(model?website.models.get(model)||[]:[])].map(p=>[p.remoteProductId,p])).values()];
  if(matches.length>1)return {published:false,reason:'网站名称或型号存在多个商品，请核对对应'};
  const product=matches[0];if(!product)return {published:false,reason:'网站尚未找到准确对应的商品，可先准备图片'};
  const businessIds=new Set([product.productNumber,...data.records.filter(p=>p.remoteProductId===product.remoteProductId).map(p=>p.productNumber)].map(norm));
  if(data.mappings.some(m=>m.status==='正常'&&businessIds.has(norm(m.businessId))&&!sameSourceIdentity(m,source)))return {published:false,reason:'网站商品已由其它来源确认对应，请人工核对'};
  return {product,published:product.publishStatus===1,reason:product.publishStatus===0?'网站商品已创建，尚未上架':'网站上架状态待核对'};
}
// Different products may wait on the network together. SKUs of one product remain ordered.
async function forProducts(items,run,limit=3){
  const groups=new Map();for(const item of items){const id=item.row?.id||item.id;if(!groups.has(id))groups.set(id,[]);groups.get(id).push(item);}
  const queue=[...groups.values()];let cursor=0,failure;
  const workers=Array.from({length:Math.min(limit,queue.length)},async()=>{while(cursor<queue.length&&!failure){const group=queue[cursor++];try{for(const item of group){if(failure)break;await run(item);}}catch(error){failure=error;}}});
  await Promise.all(workers);if(failure)throw failure;
}

export class InventoryBatchEdit{
  constructor({store,catalog,connection,now=()=>new Date()}){Object.assign(this,{store,catalog,connection,now});this.file=path.join(store.paths.state,'inventory-batch.json');this.busy=false;this.stateQueue=Promise.resolve();this.run=null;}
  async state(){return await readJSON(this.file,null)||emptyState();}
  async mutateState(update){const job=this.stateQueue.then(async()=>{const state=await this.state();update(state);await writeJSON(this.file,state);});this.stateQueue=job.catch(()=>{});return job;}
  async progress({requestId}={}){
    if(!/^[\w-]{10,100}$/.test(requestId||''))throw Error('无效的批次编号');
    const run=this.run?.requestId===requestId?this.run:(await this.state()).history.find(h=>h.requestId===requestId);
    if(!run)return null;
    return {requestId,status:run.status,total:run.total||run.results.length,completed:run.results.filter(r=>!['running','queued'].includes(r.status)).length,elapsedMs:Math.max(0,Date.parse(run.finishedAt||this.now().toISOString())-Date.parse(run.at)),active:run.results.filter(r=>r.status==='running').map(r=>({id:r.id,name:r.name,stage:r.stage,startedAt:r.startedAt}))};
  }
  async snapshot(records=null){
    const document=await this.store.read(),snapshot=document.latestCollection,pending=await readJSON(path.join(this.store.paths.state,'pending-sync.json'),null);
    const mappings=pending?.source?.capturedAt===snapshot?.capturedAt?effectivePendingMappings(pending,document):document.mappingRows||parseMappingRows(document.mapping);
    records=records||await this.catalog.batchRecords();
    const active=mappings.filter(m=>m.status==='正常'&&m.businessId);
    return {document,snapshot,mappings,records,index:{sources:grouped(snapshot?.products||[],sourceIdentityName),models:grouped(snapshot?.products||[],p=>sourceModel(p.sourceName)),relations:grouped(active,sourceIdentityName),business:grouped(active,m=>norm(m.businessId)),sites:grouped(records,p=>norm(p.productNumber))}};
  }
  context(data,source){
    const key=sourceIdentityName(source),peers=(data.index.sources.get(key)||[]).filter(p=>sameSourceIdentity(p,source));
    const relations=(data.index.relations.get(key)||[]).filter(m=>sameSourceIdentity(m,source));
    const sites=relations.length===1?data.index.sites.get(norm(relations[0].businessId))||[]:[];
    const blocked=data.snapshot?.quality?.passed!==true?'来源快照未完整核对':peers.length!==1?'来源商品身份不唯一':relations.length!==1?'网站对应关系未确认':data.index.business.get(norm(relations[0].businessId))?.length!==1?'网站对应关系不唯一':sites.length!==1?'网站商品记录不唯一或缺失':null;
    return {blocked,product:sites[0]||null,fingerprint:stableHash({source:{name:source.sourceName,cost:source.cost,suggestedPrice:source.suggestedPrice,stock:source.stock},at:data.snapshot?.capturedAt,relation:relations.map(m=>m.businessId),remote:sites.map(s=>s.remoteProductId),blocked})};
  }
  async view(){
    const data=await this.snapshot(),state=await this.state(),rows=[],pendingNew=[];
    const website=await this.catalog.pendingWebsiteSnapshot(),checked=state.pendingNewRefresh;
    const directoryChecked=Boolean(checked&&checked.at===website.at),fresh=directoryChecked&&checked.sourceSignature===sourceSignature(data);
    if(directoryChecked){website.names=grouped(website.records,p=>fullName(p.sourceName));website.models=grouped(website.records,p=>String(p.sourceSpu||'').normalize('NFKC').trim().toUpperCase());}
    const tasks=[...(data.document.sourceChanges?.tasks||[]),...(data.document.sourceChanges?.catalogPending||[])];
    const taskIndex=grouped(tasks,t=>sourceIdentityName(t.current||t.after||t.before));
    for(const source of data.snapshot?.products||[]){
      const ctx=this.context(data,source);let p=ctx.product;
      const related=(taskIndex.get(sourceIdentityName(source))||[]).filter(t=>sameSourceIdentity(t.current||t.after||t.before,source));
      const old=related.find(t=>t.before)?.before||source;
      const origin=related.find(t=>t.originKind==='added'||t.kind==='added');
      if(origin){
        const sourceChecked=directoryChecked&&(checked.sources?checked.sources[source.sourceKey||source.sourceName]===pendingIdentity(source,origin):fresh);
        const match=sourceChecked?pendingWebsiteMatch(data,source,ctx,website,related):{published:Boolean(p?.publishStatus===1&&!ctx.blocked),reason:!p?'尚未建立网站商品对应，可先准备图片':'网站商品尚未上架'};
        if(!match.published)pendingNew.push({key:source.sourceKey||source.sourceName,sourceName:source.sourceName,sourceRow:sourceRows(source)[0],cost:source.cost,suggestedPrice:source.suggestedPrice,stock:source.stock,reason:match.reason,remoteProductId:p?.remoteProductId||null});
        if(p&&match.product&&(!p.updatedAt||Date.parse(p.updatedAt)<=Date.parse(website.at)))p={...p,...match.product,productNumber:p.productNumber};
      }
      if(!p)continue;
      const variants=(p.variants||[]).map(v=>({id:String(v.id||''),name:String(v.optionValueNames||v.skuCode||'单一规格'),stockQuantity:quantity(v.stockQuantity),salePrice:v.salePrice??null}));
      const validVariants=variants.length>0&&unique(variants.map(v=>v.id)).length===variants.length&&variants.every(v=>/^\d{1,15}$/.test(v.id));
      const guard=websitePriceGuard({costPriceAed:source.cost,suggestedPriceAed:source.suggestedPrice,websitePriceAed:p.websitePriceAed,priceComplete:p.priceEvidence?.complete});
      const sourceStock=['有货','无货'].includes(source.stock)?source.stock:null;
      const read=state.reads[p.remoteProductId],cachedFingerprint=stableHash({publishStatus:p.publishStatus,variants});
      const successfulRead=read?.status==='read'&&read.context===ctx.fingerprint&&read.website===cachedFingerprint;
      rows.push({id:p.remoteProductId,businessId:p.productNumber,name:source.sourceName,websiteName:p.name||p.sourceName,sourceRow:sourceRows(source)[0]||null,sourceStock,before:old,source:{cost:source.cost,suggestedPrice:source.suggestedPrice,stock:source.stock},publishStatus:p.publishStatus,stockKnown:p.stockKnown,stockQuantity:p.stockQuantity,websitePriceAed:p.websitePriceAed,variants,validVariants,priceReady:validVariants&&variants.every(v=>toPriceFils(v.salePrice)!==null),guard,sourceFingerprint:ctx.fingerprint,websiteFingerprint:cachedFingerprint,readAt:successfulRead?read.at:null,readError:read?.status==='failed'?read.reason:null,blocked:ctx.blocked,listingTarget:sourceStock==='有货'?1:sourceStock==='无货'?0:null,taskIds:related.filter(t=>!t.resolved).map(t=>t.id),priceChanged:related.some(t=>!t.resolved&&t.kind==='price')});
      const row=rows.at(-1),decision=state.priceDecisions?.[row.id];
      row.priceAccepted=Boolean(!ctx.blocked&&row.priceReady&&guard.minimumFils!==null&&Number.isSafeInteger(decision?.targetFils)&&decision.targetFils>=0&&decision.source===priceDecisionSource(row)&&decision.variants===priceVariantSet(variants)&&variants.every(v=>toPriceFils(v.salePrice)>=decision.targetFils));
      row.acceptedPriceAed=row.priceAccepted?decision.targetFils/100:null;
      row.priceReviewRequired=guard.status!=='ok'&&!row.priceAccepted;
    }
    rows.sort((a,b)=>(a.sourceRow??Infinity)-(b.sourceRow??Infinity));
    pendingNew.sort((a,b)=>(a.sourceRow??Infinity)-(b.sourceRow??Infinity));
    return {rows,pendingNew,pendingNewCheckedAt:fresh?checked.at:null,sourceAt:data.snapshot?.capturedAt||null,history:state.history.slice(0,100)};
  }
  async refreshPendingNew(){
    if(this.busy)throw Error('正在处理所选商品，请等待完成');
    this.busy=true;
    try{
      const before=await this.view(),snapshot=await this.snapshot(),signature=sourceSignature(snapshot);
      const website=await this.catalog.syncMappingCatalog({listPage:p=>this.connection.listProductsPage(p),metadataOnly:true,requireComplete:true});
      if(sourceSignature(await this.snapshot())!==signature)throw Error('刷新期间来源商品已变化，请重新刷新；原提醒已保留');
      await this.mutateState(state=>{state.pendingNewRefresh={at:website.at,sourceSignature:signature,sources:pendingIdentities(snapshot)};});
      const view=await this.view(),remaining=new Set(view.pendingNew.map(p=>p.key));
      return {...view,refreshSummary:{at:website.at,websiteCount:website.records.length,removed:before.pendingNew.filter(p=>!remaining.has(p.key)).length,remaining:view.pendingNew.length}};
    }finally{this.busy=false;}
  }
  async exportPendingNew(){
    const view=await this.view(),names=view.pendingNew.map(p=>String(p.sourceName||'').replace(/[\r\n\t\u2028\u2029\x00]+/g,' ').trim()).filter(Boolean);
    if(!names.length)throw Error('暂无待上新商品可导出');
    const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(this.now());
    return {filename:`待上新商品名称-${date}.txt`,content:names.join('\r\n')+'\r\n',count:names.length};
  }
  async currentContext(id,expected,records=null){
    // Validate only this product, using current identity records; do not calculate every row's context.
    const data=await this.snapshot(records||await this.catalog.identityRecords()),site=data.records.find(p=>p.remoteProductId===id);
    const relations=site?data.mappings.filter(m=>m.status==='正常'&&m.businessId&&norm(m.businessId)===norm(site.productNumber)):[];
    const sources=(data.snapshot?.products||[]).filter(s=>relations.some(m=>sameSourceIdentity(m,s)));
    if(sources.length!==1)throw Error('来源或网站对应关系不唯一，请重新核对');
    const source=sources[0],context=this.context(data,source);
    if(context.blocked||context.fingerprint!==expected)throw Error('来源或网站对应关系已变化，请刷新后重新勾选');
    return {...context,source};
  }
  async saveRead(id,context,website,reason=null){await this.mutateState(state=>{state.reads[id]=reason?{status:'failed',at:this.now().toISOString(),reason}:{status:'read',at:this.now().toISOString(),context,website:webFingerprint(website)};});}
  async refresh({ids}={}){
    if(this.busy)throw Error('正在处理所选商品，请等待完成');
    if(!Array.isArray(ids)||!ids.length||ids.length>500)throw Error('请选择 1 至 500 件网站商品');
    this.busy=true;const results=[];
    try{
      const view=await this.view();
      const ordered=unique(ids);await forProducts(ordered.map(id=>({id})),async({id})=>{
        const row=view.rows.find(r=>r.id===id);
        try{
          if(!row||row.blocked)throw Error(row?.blocked||'找不到所选商品');
          const context=await this.currentContext(id,row.sourceFingerprint);
          const raw=await this.connection.productDetail(id),website=batchWebsite(raw),validationRecords=await this.catalog.identityRecords();
          await this.catalog.readOne({remoteProductId:id,expectedProductNumber:row.businessId,readProduct:async()=>raw,validateBeforeSave:()=>this.currentContext(id,row.sourceFingerprint,validationRecords),reclassify:true,sourceForBatch:context.source});
          await this.saveRead(id,row.sourceFingerprint,website);results.push({id,status:'read'});
        }catch(error){const reason=String(error.message||error);await this.saveRead(id,null,null,reason);results.push({id,status:'failed',reason});}
      });
      return {...await this.view(),results:ordered.map(id=>results.find(r=>r.id===id))};
    }finally{this.busy=false;}
  }
  async execute({kind,items,confirmed=false,requestId,listingMode,allowBelowReference=false}={}){
    if(confirmed!==true)throw Error('请在确认窗口明确确认本次修改');
    if(!['listing','price','stock'].includes(kind)||!Array.isArray(items)||!items.length||items.length>500)throw Error('请选择有效的批量操作和项目');
    if(kind==='listing'&&(new Set(items.map(i=>i.target)).size!==1||listingMode!==undefined&&(!['publish','unpublish'].includes(listingMode)||items.some(i=>i.target!==(listingMode==='publish'?1:0)))))throw Error('上架和下架必须分别勾选执行，不能混在同一批次');
    if(!/^[\w-]{10,100}$/.test(requestId||''))throw Error('修改请求缺少有效编号，请重新确认');
    if(this.busy)throw Error('已有批量操作正在进行，请稍候');
    this.busy=true;
    try{
      let state=await this.state();
      const prior=state.history.find(h=>h.requestId===requestId);
      if(prior)return {...await this.view(),results:prior.results,duplicate:true};
      const view=await this.view(),keys=new Set(),planned=[];
      for(const item of items){
        const row=view.rows.find(r=>r.id===item.id),key=kind==='stock'?`${item.id}:${item.variantId}`:item.id;
        if(!row||row.blocked||keys.has(key)||item.sourceFingerprint!==row.sourceFingerprint)throw Error(row?.blocked||'勾选记录重复、失效或来源/对应关系已变化，请重新核对');
        keys.add(key);
        if(kind==='stock'&&row.sourceStock!=='有货')throw Error('来源无货或状态未知的商品不参与批量库存修改，未执行任何修改');
        if(kind==='stock'&&(quantity(item.target)===null||!row.validVariants||!row.variants.some(v=>v.id===item.variantId&&v.stockQuantity!==null)))throw Error('规格或目标库存无效，未执行任何修改');
        if(kind==='price'&&(toPriceFils(item.target)===null||Number(item.target)>10_000_000||row.guard.minimumFils===null||!row.validVariants||!row.priceReady))throw Error('目标售价、价格资料或规格无效，未执行任何修改');
        if(kind==='price'&&toPriceFils(item.target)<row.guard.minimumFils&&allowBelowReference!==true)throw Error('目标低于参考售价，请在修改清单中明确确认，未执行任何修改');
        if(kind==='listing'&&(![0,1].includes(item.target)||row.listingTarget!==item.target))throw Error('上下架目标与来源状态不一致，请重新核对');
        if(!item.expected||typeof item.expected!=='object')throw Error('缺少显示时的网站状态，请先读取');
        planned.push({item,row});
      }
      const receipt={requestId,kind,at:this.now().toISOString(),status:'running',total:planned.length,results:planned.map(({item,row})=>({id:row.id,variantId:item.variantId||null,name:row.name,target:item.target,status:'queued'}))};
      this.run=receipt;const saveReceipt=()=>this.mutateState(s=>{const copy=structuredClone(receipt);s.history=[copy,...s.history.filter(h=>h.requestId!==requestId)].slice(0,100);});
      await saveReceipt();
      const touched=new Set();
      await forProducts(planned.map((p,i)=>({...p,result:receipt.results[i]})),async({item,row,result})=>{
        result.status='running';result.stage='checking';result.startedAt=this.now().toISOString();await saveReceipt();
        let submitted=false;
        try{
          if(touched.has(row.id)&&kind!=='stock')throw Error('同一商品已处理，不能重复提交');
          const ctx=await this.currentContext(row.id,item.sourceFingerprint);
          result.stage='reading';
          const raw=rawProduct(await this.connection.productDetail(row.id)),before=batchWebsite(raw);
          if(before.remoteProductId!==row.id)throw Error('网站回读商品ID不符，未提交');
          await this.currentContext(row.id,item.sourceFingerprint);
          result.stage='writing-readback';
          let afterRaw;
          if(kind==='listing'){
            if(before.publishStatus!==item.expected.publishStatus)throw Error('网站上下架状态已变化，请重新读取');
            if(item.target===1&&(!before.variants.length||before.variants.some(v=>v.stockQuantity===null)||!before.variants.some(v=>v.stockQuantity>0)))throw Error('网站规格库存为零或未知，请先补库存');
            if(before.publishStatus===item.target){result.status='unchanged';result.reason='已是目标状态，无需写入';afterRaw=raw;}
            else{submitted=true;afterRaw=rawProduct(await this.connection.updateProductPublishStatus({productId:row.id,publishStatus:item.target}));}
            const after=batchWebsite(afterRaw);
            if(after.publishStatus!==item.target||stableHash(after.variants)!==stableHash(before.variants))throw Error('网站状态未确认或其它规格字段变化，请核对');
          }else if(kind==='stock'){
            const variant=before.variants.find(v=>v.id===item.variantId);
            if(!variant||variant.stockQuantity!==item.expected.stockQuantity)throw Error('网站规格库存已变化，请重新读取后确认');
            if(variant.stockQuantity===Number(item.target)){result.status='unchanged';result.reason='库存未变化，无需写入';afterRaw=raw;}
            else{submitted=true;afterRaw=rawProduct(await this.connection.updateVariantInventory({productId:row.id,variantId:item.variantId,stockQuantity:Number(item.target)}));}
            const after=batchWebsite(afterRaw),changed=after.variants.find(v=>v.id===item.variantId);
            if(changed?.stockQuantity!==Number(item.target)||after.publishStatus!==before.publishStatus||stableHash(after.variants.map(v=>({...v,stockQuantity:v.id===item.variantId?null:v.stockQuantity})))!==stableHash(before.variants.map(v=>({...v,stockQuantity:v.id===item.variantId?null:v.stockQuantity}))))throw Error('库存回读未确认或其它规格发生变化，请核对');
          }else{
            if(stableHash(before.variants.map(v=>[v.id,toPriceFils(v.salePrice)]))!==stableHash(item.expected.prices))throw Error('网站规格售价已变化，请重新读取');
            const guard=websitePriceGuard({costPriceAed:ctx.source.cost,suggestedPriceAed:ctx.source.suggestedPrice,websitePriceAed:before.variants[0]?.salePrice});
            if(guard.minimumFils===null||toPriceFils(item.target)<guard.minimumFils&&allowBelowReference!==true||before.variants.some(v=>toPriceFils(v.salePrice)===null))throw Error('当前价格资料不完整或低于参考价未经确认');
            const wanted=before.variants.filter(v=>toPriceFils(v.salePrice)<toPriceFils(item.target));
            if(!wanted.length){result.status='unchanged';result.reason='全部规格已达目标，不降低售价';afterRaw=raw;}
            else{submitted=true;afterRaw=rawProduct(await this.connection.updateVariantPrices({productId:row.id,variants:wanted.map(v=>({id:v.id,salePrice:Number(item.target)}))}));}
            const after=batchWebsite(afterRaw);
            if(after.publishStatus!==before.publishStatus||after.variants.length!==before.variants.length||before.variants.some(v=>{const next=after.variants.find(a=>a.id===v.id);return !next||next.stockQuantity!==v.stockQuantity||toPriceFils(next.salePrice)!==Math.max(toPriceFils(v.salePrice),toPriceFils(item.target));}))throw Error('售价回读未确认或库存/上下架变化，请核对');
          }
          result.stage='saving';
          const after=batchWebsite(afterRaw),validationRecords=await this.catalog.identityRecords();
          await this.catalog.readOne({remoteProductId:row.id,expectedProductNumber:row.businessId,readProduct:async()=>afterRaw,validateBeforeSave:()=>this.currentContext(row.id,item.sourceFingerprint,validationRecords),reclassify:true,sourceForBatch:ctx.source});
          await this.saveRead(row.id,item.sourceFingerprint,after);touched.add(row.id);
          if(kind==='price'){
            const below=toPriceFils(item.target)<row.guard.minimumFils;
            await this.mutateState(s=>{s.priceDecisions||={};if(below)s.priceDecisions[row.id]={targetFils:toPriceFils(item.target),referenceFils:row.guard.minimumFils,source:priceDecisionSource(row),variants:priceVariantSet(after.variants),at:this.now().toISOString()};else delete s.priceDecisions[row.id];});
            if(below){result.belowReference=true;result.reason=`已人工确认目标 ${Number(item.target)} AED（参考 ${row.guard.minimumFils/100} AED），回读符合所填目标；保留更高规格售价`;}
          }
          if(result.status==='running')result.status='success';result.at=this.now().toISOString();
        }catch(error){result.status=submitted?'uncertain':'failed';result.reason=(submitted?'请求已提交，需重新读取核对，勿直接重复执行。':'')+String(error.message||error);if(submitted)await this.saveRead(row.id,null,null,result.reason);}
        result.at=this.now().toISOString();result.elapsedMs=Math.max(0,Date.parse(result.at)-Date.parse(result.startedAt));delete result.stage;await saveReceipt();
      });
      receipt.status='finished';receipt.finishedAt=this.now().toISOString();await saveReceipt();
      return {...await this.view(),results:receipt.results};
    }finally{this.busy=false;}
  }
}
