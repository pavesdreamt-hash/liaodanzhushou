import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {readJSON,stableHash} from '../core/files.mjs';
import {parseMappingRows} from '../mapping/mapping.mjs';
import {effectivePendingMappings} from '../mapping/source-rename.mjs';
import {sameSourceIdentity,sourceRows} from '../sync/source-changes.mjs';
import {reviewFingerprint} from '../sync/source-review.mjs';
import {listingStatus} from '../../shared/listing-status.mjs';
const norm=value=>String(value||'').normalize('NFKC').toUpperCase().replace(/[\s_-]+/g,'');
export function readbackTask(document,taskId){
  const changes=document.sourceChanges;
  return changes?.tasks?.find(t=>t.id===taskId&&!t.resolved)||changes?.catalogPending?.find(t=>t.id===taskId&&!changes.catalogReviews?.[taskId]?.completion);
}
export async function sourceReadContext(store,document,taskId,records){
  const task=readbackTask(document,taskId);
  if(!task)throw Error('提醒已处理或不存在，请刷新');
  if(task.kind==='price')throw Error('请使用价格提醒的单品核验入口');
  const snapshot=document.latestCollection;
  if(snapshot?.quality?.passed!==true)throw Error('来源资料尚未完整同步，请先完成商品库存表同步');
  const sources=(snapshot.products||[]).filter(p=>sameSourceIdentity(p,task.current||task.after||task.before));
  if(sources.length!==1)throw Error('来源商品身份不唯一或已经移除，请先核对对应关系');
  const pending=await readJSON(path.join(store.paths.state,'pending-sync.json'),null),mappings=pending?.source?.capturedAt===snapshot.capturedAt?effectivePendingMappings(pending,document):document.mappingRows||parseMappingRows(document.mapping),relations=mappings.filter(m=>m.status==='正常'&&m.businessId&&sameSourceIdentity(m,sources[0]));
  if(relations.length!==1||mappings.filter(m=>m.status==='正常'&&norm(m.businessId)===norm(relations[0].businessId)).length!==1)throw Error('网站对应关系尚未唯一确认，请先核对对应关系后重试');
  const websites=records.filter(p=>norm(p.productNumber)===norm(relations[0].businessId));
  if(new Set(websites.map(p=>p.remoteProductId)).size!==1)throw Error('没有唯一的网站商品记录，请先核对网站商品对应关系');
  const remoteProductId=websites[0].remoteProductId,source={...sources[0],businessId:relations[0].businessId,sourceRows:sourceRows(sources[0])};
  return {task,source,remoteProductId,fingerprint:stableHash({at:snapshot.capturedAt,source,remoteProductId,task:reviewFingerprint(task),fields:task.fields})};
}
export class SourceTaskReadback{
  constructor({store,catalog,readProduct,now=()=>new Date()}){Object.assign(this,{store,catalog,readProduct,now});this.active=new Set();}
  async read({taskId}={}){
    if(this.active.has(taskId))throw Error('这条记录正在读取，请稍候');
    this.active.add(taskId);const attemptId=randomUUID();
    try{
      const records=await this.catalog.identityRecords(),context=await this.store.beginSourceRead({taskId,attemptId,records,at:this.now().toISOString()});
      const validate=async()=>{const next=await sourceReadContext(this.store,await this.store.read(),taskId,records);if(next.fingerprint!==context.fingerprint)throw Error('读取期间来源或对应关系已变化，请重新读取本条记录');};
      const product=await this.catalog.readOne({remoteProductId:context.remoteProductId,expectedProductNumber:context.source.businessId,readProduct:this.readProduct,validateBeforeSave:validate});
      const result=await this.store.finishSourceRead({taskId,attemptId,records,expectedFingerprint:context.fingerprint,product,at:this.now().toISOString()});
      return {...result,read:true,listing:listingStatus(result.task.current.stock,product.publishStatus),productPatch:{remoteProductId:product.remoteProductId,name:product.name,websitePriceAed:product.websitePriceAed,publishStatus:product.publishStatus,stockKnown:product.stockKnown,stockQuantity:product.stockQuantity}};
    }catch(error){const reason=String(error?.message||error),task=await this.store.failSourceRead({taskId,attemptId,reason,at:this.now().toISOString()});return {task,read:false,reason};}
    finally{this.active.delete(taskId);}
  }
}
