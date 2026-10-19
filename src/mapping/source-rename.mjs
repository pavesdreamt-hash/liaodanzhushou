import path from 'node:path';
import {readJSON,stableHash} from '../core/files.mjs';
import {assignSourceKeys,normalizedSourceName,sourceModel,visibleBusinessPrefix} from './source-key.mjs';
import {mappingValues,parseMappingRows} from './mapping.mjs';
import {sameSourceIdentity,sourceRows,changeCounts} from '../sync/source-changes.mjs';
import {confirmedSourceOrder} from '../sync/source-review.mjs';
import {archiveSourceRelation} from './retired-source.mjs';
import {toPriceFils} from '../../shared/website-price-rule.mjs';
const norm=v=>String(v||'').normalize('NFKC').toUpperCase().replace(/[\s_-]+/g,'');
const core=v=>normalizedSourceName(v).replace(/\([^()]*\)/g,'').replace(/\s+/g,'').trim();
export function possibleSourceRename(a,b){
 const amodel=sourceModel(a.sourceName),bmodel=sourceModel(b.sourceName);
 const aprefix=visibleBusinessPrefix(a.sourceName),bprefix=visibleBusinessPrefix(b.sourceName);if(aprefix!==null&&bprefix!==null&&aprefix!==bprefix)return false;
 if(!sameSourceIdentity(a,b)&&amodel&&amodel===bmodel)return true;
 if(sameSourceIdentity(a,b)||!core(a.sourceName)||core(a.sourceName)!==core(b.sourceName))return false;
 const am=sourceModel(a.sourceName),bm=sourceModel(b.sourceName),ap=visibleBusinessPrefix(a.sourceName),bp=visibleBusinessPrefix(b.sourceName);
 if(am&&bm&&am!==bm)return false;
 return ap!==null&&bp!==null&&ap===bp||Boolean(am&&bm&&am===bm);
}
// Recover an acknowledged local relationship from an older pending plan. A
// later explicit mapping edit has a newer plan and is never overwritten.
export function effectivePendingMappings(pending,document){
 let rows=pending?.mappingState?.rows||[];
 for(const receipt of document.sourceRenameHistory||[]){
  if(receipt.sourceAt!==pending?.source?.capturedAt||Date.parse(receipt.at)<Date.parse(pending?.plan?.createdAt||0))continue;
  const target=rows.find(r=>r.sourceKey===receipt.after.sourceKey);
  if(!target||target.status==='本机已忽略'||target.status==='正常'&&target.businessId&&norm(target.businessId)!==norm(receipt.businessId))continue;
  rows=rows.filter(r=>r===target||!sameSourceIdentity(r,receipt.before)&&!(r.sourceKey===receipt.before.sourceKey&&receipt.before.sourceKey!==receipt.after.sourceKey)).map(r=>r===target?{...r,businessId:receipt.businessId,status:'正常',note:`${r.note||''}；已确认名称变化，沿用原对应关系`}:r);
 }
 return rows;
}
// A later full sync may read a workbook that predates this local identity
// decision. Carry only a still-confirmed local alias into that baseline.
export function renamedMappingBaseline(existing,document,products){
 const local=document.mappingRows||parseMappingRows(document.mapping),receipts=document.sourceRenameHistory||[];
 return existing.map(row=>{let target=row;for(const receipt of receipts)if(target.sourceKey===receipt.before.sourceKey&&norm(target.businessId)===norm(receipt.businessId))target={...target,sourceKey:receipt.after.sourceKey,sourceName:receipt.after.sourceName};
  if(target===row)return row;const active=local.filter(r=>r.status==='正常'&&r.sourceKey===target.sourceKey&&norm(r.businessId)===norm(target.businessId));
  if(active.length!==1||products.filter(p=>sameSourceIdentity(p,target)).length!==1||products.some(p=>sameSourceIdentity(p,row))||existing.some(r=>r!==row&&r.sourceKey===target.sourceKey))return row;
  return {...target,note:active[0].note};
 });
}
export function sourceRenameOptions(document,pending,websiteRecords){
 const snapshot=document.latestCollection;if(snapshot?.quality?.passed!==true)return [];
 const current=assignSourceKeys(snapshot.products||[]),saved=document.mappingRows||parseMappingRows(document.mapping),rows=pending?.source?.capturedAt===snapshot.capturedAt?effectivePendingMappings(pending,document):saved;
 const old=saved.filter(r=>r.businessId&&['正常','来源已移除'].includes(r.status)&&!current.some(p=>sameSourceIdentity(p,r))),options=[];
 for(const source of current){
  const active=rows.filter(r=>sameSourceIdentity(r,source)&&r.status==='正常'&&r.businessId),ignored=rows.some(r=>sameSourceIdentity(r,source)&&r.status==='本机已忽略');
  if(active.length||ignored||current.filter(p=>sameSourceIdentity(p,source)).length!==1)continue;
  const candidates=old.filter(r=>possibleSourceRename(r,source)&&!(document.sourceRelationHistory||[]).some(h=>h.cleared&&norm(h.row?.businessId)===norm(r.businessId)&&sameSourceIdentity(h.row,r))); if(candidates.length!==1)continue;const previous=candidates[0];
  if(current.filter(p=>possibleSourceRename(previous,p)).length!==1||saved.filter(r=>norm(r.businessId)===norm(previous.businessId)).length!==1||rows.some(r=>r.status==='正常'&&norm(r.businessId)===norm(previous.businessId)&&!sameSourceIdentity(r,previous)))continue;
  const matching=websiteRecords.filter(p=>norm(p.productNumber)===norm(previous.businessId)),ids=new Set(matching.map(p=>p.remoteProductId));if(ids.size!==1)continue;const website=matching[0];
  const model=sourceModel(source.sourceName),prior=(document.current?.products||[]).filter(p=>norm(p.businessId)===norm(previous.businessId)),explicitDecision=(document.sourceChanges?.history||[]).some(report=>(report.rows||[]).some(r=>r.decision&&r.before&&r.after&&sameSourceIdentity(r.before,previous)&&sameSourceIdentity(r.after,source)))||(document.sourceChanges?.tasks||[]).some(t=>t.kind==='review'&&t.resolved&&t.before&&t.after&&sameSourceIdentity(t.before,previous)&&sameSourceIdentity(t.after,source));
  const automatic=Boolean(model&&norm(source.sourceName)===norm(model)&&norm(previous.sourceName)!==norm(model)&&prior.length===1&&!explicitDecision&&toPriceFils(prior[0].cost)!==null&&toPriceFils(prior[0].suggestedPrice)!==null&&toPriceFils(prior[0].cost)===toPriceFils(source.cost)&&toPriceFils(prior[0].suggestedPrice)===toPriceFils(source.suggestedPrice)&&prior[0].stock===source.stock&&String(prior[0].imageFingerprint||'')===String(source.imageFingerprint||'')&&String(prior[0].additionalInfo||'')===String(source.additionalInfo||''));
  const proposal={sourceAt:snapshot.capturedAt,before:{sourceKey:previous.sourceKey,sourceName:previous.sourceName,businessId:previous.businessId},after:{...source,sourceRows:sourceRows(source)},businessId:previous.businessId,remoteProductId:website.remoteProductId,website:{name:website.name||website.sourceName,publishStatus:website.publishStatus,stockKnown:website.stockKnown,stockQuantity:website.stockQuantity,websitePriceAed:website.websitePriceAed},automatic,reason:automatic?'唯一已确认型号及网站对应保留，来源名称仅缩为型号，业务资料未变且无人工替换决定':'名称或型号存在连续线索；请人工核对是否为同一商品，真换款请选择其它网站商品'};
  proposal.id=stableHash({...proposal,previous});options.push(proposal);
 }
 return options;
}
export function applySourceRename(document,proposal,at,pending=null){
 const {before,after,businessId,remoteProductId,website}=proposal,previousSource=(document.current?.products||[]).find(p=>norm(p.businessId)===norm(proposal.businessId)),automatic=proposal.automatic===true,receipt={id:proposal.id,at,sourceAt:proposal.sourceAt,before,after,businessId,remoteProductId,automatic},saved=document.mappingRows||parseMappingRows(document.mapping),target={...saved.find(r=>r.sourceKey===before.sourceKey),sourceKey:after.sourceKey,sourceName:after.sourceName,sourceRow:after.sourceRow,businessId,status:'正常',note:`${saved.find(r=>r.sourceKey===before.sourceKey)?.note||''}；已${automatic?'自动连续识别':'人工确认'}名称变化：${before.sourceName} → ${after.sourceName}，沿用原对应关系`};
 archiveSourceRelation(document,{...before,status:'来源已移除'},{at,reason:automatic?'名称缩短已自动沿用原对应':'已人工沿用对应',successor:{sourceName:after.sourceName,sourceKey:after.sourceKey,businessId,remoteProductId}});
 document.mappingRows=saved.flatMap(r=>r.sourceKey===before.sourceKey?[target]:r.sourceKey===after.sourceKey?[]:[r]);document.mapping=mappingValues(document.mappingRows);document.sourceRenameHistory=[...(document.sourceRenameHistory||[]),receipt];
 if(document.current){document.current.mappingRows=document.mappingRows;document.current.products=(document.current.products||[]).map(p=>norm(p.businessId)===norm(businessId)?{...p,sourceKey:after.sourceKey,sourceName:after.sourceName,sourceRow:after.sourceRow}:p);}
 const changes=document.sourceChanges;if(!changes)return receipt;
 const affected=changes.tasks.filter(t=>!t.resolved&&[t.current,t.after,t.before].some(p=>p&&(sameSourceIdentity(p,before)||sameSourceIdentity(p,after))));
 const priceFields=previousSource?['cost','suggestedPrice'].filter(field=>toPriceFils(previousSource[field])!==toPriceFils(after[field])).map(field=>({field,before:previousSource[field],after:after[field]})):[];
 if(priceFields.length&&!affected.some(t=>t.kind==='price')){const price={id:`rename:${receipt.id}:price`,changeId:`rename:${receipt.id}`,kind:'price',before:{...previousSource,sourceName:before.sourceName},after:{...after,businessId},fields:priceFields,createdAt:proposal.sourceAt,sheet:changes.report.sheet,resolved:false};changes.tasks.push(price);affected.push(price);}
 const prices=affected.filter(t=>t.kind==='price'),stocks=affected.filter(t=>t.kind!=='price'&&t.kind!=='review'),primaryPrice=prices.find(t=>sameSourceIdentity(t.after||t.current,after))||prices[0],primaryStock=stocks.find(t=>sameSourceIdentity(t.after||t.current,after))||stocks[0];
 for(const task of affected){
  if(task.kind==='review'){task.resolved=true;task.renameReceiptId=receipt.id;task.reason=`已${automatic?'自动连续识别':'人工确认'}名称变化，身份核对已完成；未执行网站操作。`;task.completion={type:'rename',at,identityConfirmed:true,automatic,reason:task.reason};changes.reviewHistory=[structuredClone(task),...(changes.reviewHistory||[])].slice(0,300);continue;}
  const primary=task.kind==='price'?primaryPrice:primaryStock;
  if(task!==primary){task.resolved=true;task.completion={type:'rename',at,reason:'已人工确认改名；关联待办合并保留',mergedInto:primary.id};task.reason=task.completion.reason;changes.reviewHistory=[structuredClone(task),...(changes.reviewHistory||[])].slice(0,300);continue;}
  if(task.kind==='price'){
   const ordered=[...prices].sort((a,b)=>Date.parse(a.createdAt)-Date.parse(b.createdAt)),fields=new Map();for(const item of ordered)for(const f of item.fields||[]){const existing=fields.get(f.field);if(!existing)fields.set(f.field,{...f});else existing.after=f.after;}if(ordered.length>1&&ordered[0].before)task.before=structuredClone(ordered[0].before);
   for(const f of fields.values())if(['cost','suggestedPrice'].includes(f.field))f.after=after[f.field];task.fields=[...fields.values()];
  }else{task.kind='modified';delete task.originKind;delete task.newProductPending;delete task.newProductMatch;task.action='verify';}
  task.identityBeforeRename??=task.before;task.after={...after,businessId};task.current={...after,businessId};task.businessId=businessId;task.remoteProductId=remoteProductId;task.website={...website};task.renameReceiptId=receipt.id;task.reason=task.kind==='price'?'已确认名称变化并沿用原对应关系；价格变化保留，可核验后关闭或知晓后人工关闭。':'已确认名称变化并沿用原对应关系；库存状态仍需按原规则回读核对。';
  delete task.priceVerification;delete task.priceCloseReceipt;delete task.reviewed;delete task.reminder;
 }
 // Original report rows stay as historical facts. Record the explicit identity
 // decision separately and refresh only task references, never snapshots.
 const renameRow={id:`rename:${receipt.id}`,kind:'renamed',before,after:{...after,businessId},fields:[{field:'sourceName',before:before.sourceName,after:after.sourceName}],tasks:changes.tasks.filter(t=>t.changeId===`rename:${receipt.id}`),moved:false};changes.report.rows.push(renameRow);
 const update=r=>({...r,rows:r.rows.map(row=>({...row,tasks:(row.tasks||[]).map(t=>changes.tasks.find(p=>p.id===t.id)||t)}))});changes.report=update(changes.report);changes.report.summary=changeCounts(changes.report.rows);changes.history=(changes.history||[]).map(r=>r.id===changes.report.id?changes.report:update(r));changes.sourceOrder=confirmedSourceOrder(document.latestCollection,pending?.source?.capturedAt===document.latestCollection.capturedAt?effectivePendingMappings(pending,document):document.mappingRows);changes.catalogPending=(changes.catalogPending||[]).filter(t=>t.remoteProductId!==remoteProductId);return receipt;
}
export class SourceRenameService{
 constructor({store,catalog,afterSaved=()=>{}}){Object.assign(this,{store,catalog,afterSaved});}
 async options({taskId}={}){const [document,pending,records]=await Promise.all([this.store.read(),readJSON(path.join(this.store.paths.state,'pending-sync.json'),null),this.catalog.identityRecords()]);let options=sourceRenameOptions(document,pending,records);if(taskId){const task=document.sourceChanges?.tasks?.find(t=>t.id===taskId&&!t.resolved);options=task?options.filter(p=>[task.current,task.after,task.before].some(r=>r&&(sameSourceIdentity(r,p.before)||sameSourceIdentity(r,p.after)))):[];}return options;}
 async confirm({proposalId,confirmed=false}={}){
  if(confirmed!==true)throw Error('请确认改名前后为同一商品，才可沿用原对应关系');
  const records=await this.catalog.identityRecords(),result=await this.store.confirmSourceRename({proposalId,records});this.afterSaved();
  try{await this.catalog.rebindSourceIdentity({remoteProductId:result.receipt.remoteProductId,source:result.receipt.after});}catch(error){result.warning=`对应关系已保存；本机网站资料标记更新失败，请重试同步商品细节资料：${error.message}`;}
  return result;
 }
 async reconcile(){
  const records=await this.catalog.identityRecords(),result=await this.store.reconcileSourceRelations({records});if(result.changed)this.afterSaved();result.warnings=[];
  for(const receipt of result.receipts)try{await this.catalog.rebindSourceIdentity({remoteProductId:receipt.remoteProductId,source:receipt.after});}catch{result.warnings.push('对应关系已保存，本机商品标记更新暂未完成，可重试同步商品细节资料');}
  return result;
 }
}
