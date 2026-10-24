import path from 'node:path';
import {lstat} from 'node:fs/promises';
import {stableHash} from '../core/files.mjs';
import {sameSourceIdentity,sourceRows} from '../sync/source-changes.mjs';
import {sourceModel} from '../mapping/source-key.mjs';
import {sourcePrice} from '../../shared/source-price.mjs';
import {localMaster,checkLocalPrice} from './product-master.mjs';
import {readMasterRecovery} from './master-sync-recovery.mjs';

const amount=v=>v===null||v===undefined||String(v).trim()===''?null:Number.isFinite(Number(v))?Number(v):null;
const availability=v=>['有货','无货'].includes(v)?v:null;
export const inventoryCode=(source,local,website)=>{
  const name=String(source?.sourceName||local?.name||website?.sourceName||'').trim();
  return local?.displayCode||name.match(/^(\d{1,3})(?=\D|$)/u)?.[1]||sourceModel(name)||name||'待填写编号';
};
const sourceKey=s=>'source:'+stableHash({name:s.sourceName,key:s.sourceKey||null});
const exists=async(base,file)=>{if(!base||!file||path.basename(file)!==file)return false;try{return (await lstat(path.join(base,file))).isFile();}catch(e){if(e.code==='ENOENT')return false;throw e;}};

// A read model only: source, drafts and website records retain their own stores.
// Row position is never used to infer identity or overwrite a relationship.
export class UnifiedInventory{
  constructor({batch,catalog,localProducts,localMediaUrl=()=>null}){Object.assign(this,{batch,catalog,localProducts,localMediaUrl});}
  async view({catalog:provided}={}){
    const catalog=provided||await this.catalog.getView({includeImages:false});
    const [data,localView]=await Promise.all([this.batch.snapshot(),this.localProducts.view()]);
    const sources=data.snapshot?.products||[],locals=localView.products,usedLocal=new Set(),usedWeb=new Set();
    const gallery=new Map([...(catalog.mappingCatalog||[]),...(catalog.archivedProducts||[]),...(catalog.products||[])].map(p=>[p.remoteProductId,p]));
    const make=async(source,local,website,key,blocked=null)=>{
      const web=website?{...gallery.get(website.remoteProductId),...website,images:gallery.get(website.remoteProductId)?.images||[]}:null;
      const images=[];const seen=new Set();
      for(const l of local||[])for(const image of l.images||[]){if(await exists(path.join(this.localProducts.mediaDirectory,l.id),image.file)){const hash=image.sha256||image.hash||image.file;if(seen.has(hash))continue;seen.add(hash);images.push({...image,kind:'local',localId:l.id,url:this.localMediaUrl(l.id,image.file)});}}
      for(const image of web?.images||[])if(image.status==='cached'&&await exists(this.catalog.mediaDirectory,image.file)){const hash=image.sha256||image.hash||image.file;if(seen.has(hash))continue;seen.add(hash);images.push({...image,kind:'website-cache',remoteProductId:web.remoteProductId});}
      const videos=[];for(const l of local||[])for(const video of l.videos||[])if(await exists(path.join(this.localProducts.mediaDirectory,l.id),video.file))videos.push({...video,localId:l.id,url:this.localMediaUrl(l.id,video.file)});
      const draft=local?.[0]||null,cost=source?sourcePrice(source.cost,'cost').value:amount(draft?.costPriceAed),suggested=source?sourcePrice(source.suggestedPrice).value:amount(draft?.suggestedPriceAed),stock=web?web.stockKnown===false?null:amount(web.stockQuantity):draft?.stockQuantity??10;
      return {key,code:inventoryCode(source,draft,web),source:source||null,sourceFingerprint:source?stableHash(source):null,sourceRow:source?sourceRows(source)[0]||null:null,sourceStock:availability(source?.stock),sourceName:source?.sourceName||null,remoteProductId:web?.remoteProductId||null,websiteName:web?.sourceName||web?.name||null,website:web,localId:draft?.id||null,localIds:(local||[]).map(p=>p.id),local:draft,blocked,costPriceAed:cost,suggestedPriceAed:suggested,priceAed:web?amount(web.websitePriceAed):draft?amount(draft.salePriceAed):cost===null?null:Math.round((cost+220)*100)/100,stockQuantity:stock,publishStatus:web?.publishStatus??null,images,videos,imageCount:images.length,videoCount:videos.length,primary:images[0]||null,imageReview:Boolean((local||[]).some(p=>p.mediaErrors?.length)||(web?.images||[]).some(i=>i.status==='manual_review')),description:draft?.description||source?.additionalInfo||web?.description||''};
    };
    const jobs=[];
    for(const source of sources){
      const ctx=this.batch.context(data,source);let website=ctx.blocked?null:ctx.product;
      const peers=sources.filter(s=>sameSourceIdentity(s,source));
      const local=peers.length===1?locals.filter(p=>!usedLocal.has(p.id)&&p.source?.status==='matched'&&p.source?.row&&sameSourceIdentity(p.source.row,source)&&locals.filter(l=>l.id===p.id).length===1):[];
      for(const l of local)usedLocal.add(l.id);if(website)usedWeb.add(website.remoteProductId);
      jobs.push(make(source,local,website,sourceKey(source),website?null:ctx.blocked));
    }
    for(const local of locals)if(!usedLocal.has(local.id)){const web=local.remoteProductId?data.records.find(w=>w.remoteProductId===local.remoteProductId):null;if(web)usedWeb.add(web.remoteProductId);jobs.push(make(null,[local],web,local.masterKey||'local:'+local.id,web?null:'来源资料待核对'));};
    const savedWeb=new Set([...(catalog.products||[]),...(catalog.archivedProducts||[])].map(p=>p.remoteProductId));
    for(const web of data.records)if(savedWeb.has(web.remoteProductId)&&!usedWeb.has(web.remoteProductId))jobs.push(make(null,[],web,'website:'+web.remoteProductId,'来源与网站对应待核对'));
    const rows=await Promise.all(jobs);
    for(const row of rows)row.master=localMaster(row);
    rows.sort((a,b)=>(a.sourceRow??Infinity)-(b.sourceRow??Infinity));
    return {rows,sourceCount:sources.length,localCount:locals.length,sourceCapturedAt:data.snapshot?.capturedAt||null,sourceQuality:data.snapshot?.quality?.passed===true,stats:{total:rows.length,available:rows.filter(r=>r.sourceStock==='有货').length,synced:rows.filter(r=>r.sourceStock==='有货'&&r.remoteProductId).length,low:rows.filter(r=>r.sourceStock==='有货'&&r.remoteProductId&&r.stockQuantity!==null&&r.stockQuantity<2).length}};
  }
  async detail(key){const row=(await this.view()).rows.find(r=>r.key===key);if(!row)throw Error('商品资料已变化，请返回库存页刷新');row.syncRecovery=await readMasterRecovery(this.localProducts.directory,row.remoteProductId);return row;}
  async saveMaster({key,expectedLocalUpdatedAt,expectedSource,changes={},priceApproval}={}){
    const row=await this.detail(key),p=row.local,m=row.master;
    if(row.sourceFingerprint!==expectedSource||(p?.updatedAt??null)!==(expectedLocalUpdatedAt??null))throw Error('本机或来源资料已变化，请刷新详情后保存');
    const allowed=['name','salePriceAed','availability','sellingPoints','description'];if(Object.keys(changes).some(k=>!allowed.includes(k)))throw Error('不支持的本机资料字段');
    if(Object.hasOwn(changes,'availability')&&!['有货','无货','待核对'].includes(changes.availability))throw Error('请明确选择本机库存状态');
    if(Object.hasOwn(changes,'salePriceAed'))checkLocalPrice(changes.salePriceAed,row.costPriceAed,priceApproval);
    const product=await this.localProducts.save({...p,...m,id:p?.id,expectedUpdatedAt:p?.updatedAt,displayCode:row.code,masterKey:row.key,costPriceAed:row.costPriceAed,stockQuantity:p?.stockQuantity??row.stockQuantity??10,...changes,...(p?{}:{sourceRow:row.sourceRow??''})},{initialRemoteProductId:!p&&!row.source?row.remoteProductId:null});
    return product;
  }
  async save({key,expectedLocalUpdatedAt,expectedSource,changes,priceApproval}={}){
    const row=await this.detail(key);if(row.remoteProductId)throw Error('已同步网站的商品请使用网站售价/库存操作');
    if(row.source&&stableHash(row.source)!==expectedSource)throw Error('来源资料已变化，请重新打开商品后保存');
    if(row.local&&row.local.updatedAt!==expectedLocalUpdatedAt)throw Error('商品已更新，请重新打开后保存');
    const allowed=['name','costPriceAed','salePriceAed','stockQuantity','description'];if(!changes||Object.keys(changes).some(k=>!allowed.includes(k)))throw Error('不支持的商品修改字段');
    if(Object.hasOwn(changes,'salePriceAed'))checkLocalPrice(changes.salePriceAed,row.costPriceAed,priceApproval);
    const p=row.local,product={id:p?.id,expectedUpdatedAt:p?.updatedAt,name:p?.name||row.sourceName||row.code,costPriceAed:row.costPriceAed,salePriceAed:row.priceAed,stockQuantity:row.stockQuantity??10,description:row.description,...changes,...(p?{}:{sourceRow:row.sourceRow??''})};
    return this.localProducts.save(product);
  }
}
