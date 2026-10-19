import {effectivePendingMappings} from '../mapping/source-rename.mjs';
import {randomUUID} from 'node:crypto';
import {stableHash,readJSON} from '../core/files.mjs';
import {parseMappingRows} from '../mapping/mapping.mjs';
import {sameSourceIdentity,sourceRows} from '../sync/source-changes.mjs';
import {reviewFingerprint} from '../sync/source-review.mjs';
import {websitePriceGuard,WEBSITE_PRICE_RULE_ID,toPriceFils} from '../../shared/website-price-rule.mjs';
import path from 'node:path';
export const PRICE_PROOF_MAX_AGE_MS=5*60*1000;
const norm=value=>String(value||'').normalize('NFKC').toUpperCase().replace(/[\s_-]+/g,'');
export const priceAcknowledgementFingerprint=task=>stableHash({task:reviewFingerprint(task),cost:toPriceFils((task.current||task.after||task.before)?.cost),suggestedPrice:toPriceFils((task.current||task.after||task.before)?.suggestedPrice),websitePrice:toPriceFils(task.website?.websitePriceAed)});
export const priceAcknowledgementSource=(document,task)=>stableHash((document.latestCollection?.products||[]).filter(p=>sameSourceIdentity(p,task.current||task.after||task.before)).map(p=>({name:p.sourceName,cost:toPriceFils(p.cost),suggestedPrice:toPriceFils(p.suggestedPrice)})));
export async function priceTaskContext(store,document,taskId){
  const changes=document.sourceChanges,task=changes?.tasks?.find(t=>t.id===taskId&&!t.resolved&&t.kind==='price');
  if(!task)throw Error('价格提醒已处理或不存在，请刷新');
  const snapshot=document.latestCollection;if(snapshot?.quality?.passed!==true)throw Error('来源资料尚未完整同步，无法核验价格');
  const sources=(snapshot.products||[]).filter(p=>sameSourceIdentity(p,task.current||task.after||task.before));
  if(sources.length!==1)throw Error('来源商品身份不唯一或已经消失，请先核对对应关系');
  const pending=await readJSON(path.join(store.paths.state,'pending-sync.json'),null),mappings=pending?.source?.capturedAt===snapshot.capturedAt?effectivePendingMappings(pending,document):document.mappingRows||parseMappingRows(document.mapping),relations=mappings.filter(m=>m.status==='正常'&&m.businessId&&sameSourceIdentity(m,sources[0]));
  if(relations.length!==1||mappings.filter(m=>m.status==='正常'&&norm(m.businessId)===norm(relations[0].businessId)).length!==1||!task.remoteProductId||norm(task.businessId||relations[0].businessId)!==norm(relations[0].businessId))throw Error('网站对应关系尚未唯一确认，请先核对对应关系');
  const source={...sources[0],businessId:relations[0].businessId,sourceRows:sourceRows(sources[0])},fingerprint=stableHash({rule:WEBSITE_PRICE_RULE_ID,at:snapshot.capturedAt,sourceName:source.sourceName,businessId:source.businessId,cost:source.cost,suggestedPrice:source.suggestedPrice,remoteProductId:task.remoteProductId,fields:task.fields});
  return {task,source,sourceAt:snapshot.capturedAt,fingerprint,taskFingerprint:reviewFingerprint(task)};
}
export function checkPriceProof(context,verificationId,now=Date.now()){
  const proof=context.task.priceVerification;
  if(!proof||proof.status!=='passed'||proof.id!==verificationId||proof.ruleId!==WEBSITE_PRICE_RULE_ID||proof.sourceFingerprint!==context.fingerprint||proof.taskFingerprint!==reviewFingerprint(context.task)||!Number.isFinite(Date.parse(proof.at))||now-Date.parse(proof.at)>PRICE_PROOF_MAX_AGE_MS||Date.parse(proof.at)>now+1000)throw Error('需要重新读取这款商品，并核验价格达标后才能关闭提醒');
  return proof;
}
export class PriceTaskVerification{
  constructor({store,catalog,readProduct,now=()=>new Date()}){Object.assign(this,{store,catalog,readProduct,now});}
  async read({taskId}){
    const attemptId=randomUUID(),context=await this.store.beginPriceRead({taskId,attemptId,at:this.now().toISOString()});
    try{const product=await this.catalog.readOne({remoteProductId:context.task.remoteProductId,expectedProductNumber:context.source.businessId,readProduct:this.readProduct}),result=await this.store.finishPriceRead({taskId,attemptId,expectedFingerprint:context.fingerprint,product,at:this.now().toISOString()});if(this.catalog.applySingleSourcePrices)await this.catalog.applySingleSourcePrices({remoteProductId:product.remoteProductId,source:result.task.current});return {...result,productPatch:{remoteProductId:product.remoteProductId,name:product.name,websitePriceAed:product.websitePriceAed,publishStatus:product.publishStatus,stockKnown:product.stockKnown,stockQuantity:product.stockQuantity,costPriceAed:toPriceFils(result.task.current.cost)===null?null:toPriceFils(result.task.current.cost)/100,suggestedPriceAed:toPriceFils(result.task.current.suggestedPrice)===null?null:toPriceFils(result.task.current.suggestedPrice)/100}};}
    catch(error){const task=await this.store.failPriceRead({taskId,attemptId,reason:String(error?.message||error),at:this.now().toISOString()});return {task,verified:false,reason:String(error?.message||error)};}
  }
  async confirm({taskId,verificationId,confirmed=false}){
    if(confirmed!==true)throw Error('请明确确认处理并关闭价格提醒');
    const context=await priceTaskContext(this.store,await this.store.read(),taskId),prior=checkPriceProof(context,verificationId,this.now().getTime());
    // Confirm the displayed result with one fresh read of this same product.
    const result=await this.read({taskId});if(!result.verified)return {...result,closed:false};
    const proof=result.task.priceVerification;
    if(prior.sourceFingerprint!==proof.sourceFingerprint||prior.websiteFingerprint!==proof.websiteFingerprint)return {...result,closed:false,reason:'网站价格或来源资料已有变化，请查看最新结果后再确认关闭'};
    const changes=await this.store.reviewSourceTask({taskId,operation:'close',confirmed:true,fingerprint:reviewFingerprint(result.task),verificationId:proof.id});return {...result,closed:true,changes};
  }
}
export function priceResult(source,product){return websitePriceGuard({costPriceAed:source.cost,suggestedPriceAed:source.suggestedPrice,websitePriceAed:product.websitePriceAed,priceComplete:product.priceEvidence?.complete});}
