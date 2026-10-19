import {sourceRenameOptions,applySourceRename} from '../mapping/source-rename.mjs';
import {retireMissingSourceRelations,retiredSourceView} from '../mapping/retired-source.mjs';
import {priceTaskContext,checkPriceProof,priceResult,priceAcknowledgementFingerprint,priceAcknowledgementSource} from './price-task-verification.mjs';
import {randomUUID} from 'node:crypto';
import {stableHash} from '../core/files.mjs';
import {WEBSITE_PRICE_RULE_ID} from '../../shared/website-price-rule.mjs';
import {sourceSnapshotStatistics,sourceDirectionalCounts} from '../sync/source-statistics.mjs';
import path from 'node:path';
import {unlink} from 'node:fs/promises';
import {readJSON,writeJSON,listJSON} from '../core/files.mjs';
import {INVENTORY_HEADERS,MAPPING_HEADERS} from '../config.mjs';
import {parseInventory} from '../sync/history.mjs';
import {buildSourceChangeReport,taskSeeds,evaluateSourceTasks,sameSourceIdentity,changeCounts} from '../sync/source-changes.mjs';
import {parseMappingRows} from '../mapping/mapping.mjs';
import {mergeSourceSeeds,confirmedSourceOrder,migratePriceTasks,captureWebsitePrices,applyTaskReviews,catalogReviewItems,reviewFingerprint,restoreNewProductTasks} from '../sync/source-review.mjs';

export const LOCAL_HISTORY_MAX_VERSIONS=100;
export const LOCAL_HISTORY_MAX_AGE_DAYS=180;
const nowIso=()=>new Date().toISOString();
const ageLimit=()=>Date.now()-LOCAL_HISTORY_MAX_AGE_DAYS*24*60*60*1000;
const reminderAcknowledgementFingerprint=task=>stableHash({id:task.id,kind:task.kind,identity:reviewFingerprint(task),before:task.before,after:task.after,current:task.current,fields:task.fields});
const blankDocument=()=>({schemaVersion:1,updatedAt:null,latestCollection:null,current:null,inventory:[INVENTORY_HEADERS],mapping:[MAPPING_HEADERS],history:[]});
const compactInventory=values=>{
  const rows=Array.isArray(values)?values:[],sourceHeader=rows[0]||INVENTORY_HEADERS,historyHeader=sourceHeader.slice(6).filter(Boolean).slice(0,4);
  const header=[...INVENTORY_HEADERS,...historyHeader];
  return [header,...rows.slice(1).filter(row=>row?.some(Boolean)).map(row=>[...row.slice(0,6),...row.slice(6,10)])];
};
const currentProducts=(inventoryValues,mappingRows=[])=>{const sourceRows=new Map((mappingRows||[]).filter(row=>row?.businessId).map(row=>[row.businessId,row.sourceRow||null]));return parseInventory(inventoryValues).rows.map(row=>({businessId:row.businessId||'',sourceName:row.sourceName||'',cost:row.latest?.cost||'',suggestedPrice:row.latest?.suggestedPrice||'',stock:row.latest?.stock||'',additionalInfo:row.latest?.additionalInfo||'',sourceRow:sourceRows.get(row.businessId)||null,removed:row.latest?.stock==='来源已移除'}));};

export class LocalInventoryStore{
  constructor(paths){this.paths=paths;this.file=path.join(paths.state,'local-inventory.json');this.queue=Promise.resolve();this.statisticsCache=new Map();}
  serial(operation){const next=this.queue.then(operation,operation);this.queue=next.catch(()=>{});return next;}
  async read(){const value=await readJSON(this.file,null);return value?.schemaVersion===1?{...blankDocument(),...value}:blankDocument();}
  async workbook(){
    const document=await this.read();
    return {metadata:{spreadsheetId:'local-inventory',properties:{title:'本地商品库存'},sheets:[
      {properties:{sheetId:1,title:'库存情况',sheetType:'GRID',gridProperties:{rowCount:Math.max(100,document.inventory.length),columnCount:Math.max(10,document.inventory[0]?.length||10)}}},
      {properties:{sheetId:2,title:'商品映射',sheetType:'GRID',gridProperties:{rowCount:Math.max(100,document.mapping.length),columnCount:5}}}
    ]},inventory:document.inventory,mapping:document.mapping,fingerprint:'local'};
  }
  async recordCollection(snapshot,{previous=null}={}){return this.serial(async()=>{
    const document=await this.read(),old=document.latestCollection||previous,mappings=document.mappingRows||parseMappingRows(document.mapping);
    if(document.latestCollection?.capturedAt!==snapshot.capturedAt){
      const report=buildSourceChangeReport({previous:old,snapshot,mappings}),tasks=[...(document.sourceChanges?.tasks||[])];
      if(document.sourceChanges)restoreNewProductTasks(document.sourceChanges,old,mappings);
      mergeSourceSeeds(tasks,taskSeeds(report),report.at);
      document.sourceChanges={...document.sourceChanges,schemaVersion:1,report,tasks,history:[report,...(document.sourceChanges?.history||[])].slice(0,100)};
    }
    document.updatedAt=nowIso();document.latestCollection={capturedAt:snapshot.capturedAt,sourceUrl:snapshot.sourceUrl,sheet:snapshot.sheet,range:snapshot.range,quality:snapshot.quality,products:snapshot.products||[]};await writeJSON(this.file,document);await this.pruneSourceSnapshots();return this.view(document);
  });}
  async refreshSourceChanges({catalog={},mappings=null,websiteCheck=null,applyReviewed=false}={}){return this.serial(async()=>{
    const document=await this.read(),changes=document.sourceChanges;if(!changes)return null;
    const check=websiteCheck||changes.report.websiteCheck||'pending',relations=mappings||document.mappingRows||parseMappingRows(document.mapping);
    restoreNewProductTasks(changes,document.latestCollection,relations);
    migratePriceTasks(changes);
    await this.validatePriceClosures(document);
    if(websiteCheck==='verified')captureWebsitePrices(changes,catalog,document.latestCollection,relations);
    const tasks=applyTaskReviews(evaluateSourceTasks({tasks:changes.tasks.filter(task=>!task.resolved),snapshot:document.latestCollection,mappings:relations,catalog,websiteCheck:check,allowAutoResolve:websiteCheck==='verified'}));
    for(const task of tasks.filter(item=>item.resolved&&item.completion))changes.reviewHistory=[task,...(changes.reviewHistory||[])].slice(0,300);
    const byId=new Map(tasks.map(task=>[task.id,task]));changes.tasks=changes.tasks.map(task=>byId.get(task.id)||task);
    if(websiteCheck)changes.report.websiteCheck=check;
    if(check==='verified')changes.report.websiteCheckedAt=catalog.mappingCatalogRun?.at||catalog.lastSuccessfulReadAt||changes.report.websiteCheckedAt;
    changes.sourceOrder=confirmedSourceOrder(document.latestCollection,relations);
    catalogReviewItems(changes,catalog);
    changes.report.summary=changeCounts(changes.report.rows);
    const update=report=>({...report,rows:report.rows.map(row=>({...row,tasks:changes.tasks.filter(task=>task.changeId===row.id||!task.resolved&&sameSourceIdentity(task.after||task.before,row.after||row.before))}))});
    changes.report=update(changes.report);changes.history=changes.history.map(report=>report.id===changes.report.id?changes.report:update(report));
    await writeJSON(this.file,document);const view=this.changesView(changes);await this.hydrateReportStatistics(view,document.latestCollection);return view;
  });}
  async hydrateReportStatistics(changes,latest){
    const reports=[changes.report,...(changes.history||[])],needed=new Set(reports.filter(r=>!r.statistics).flatMap(r=>[r.at,r.previousAt]).filter(Boolean));
    for(const report of reports)report.directional=sourceDirectionalCounts(report);
    if(!needed.size)return;
    if(latest?.capturedAt)this.statisticsCache.set(latest.capturedAt,sourceSnapshotStatistics(latest));
    const missing=new Set([...needed].filter(at=>!this.statisticsCache.has(at)));
    if(missing.size)for(const file of await listJSON(this.paths.snapshots,'source_')){if(!missing.size)break;const value=await readJSON(path.join(this.paths.snapshots,file),null);if(missing.has(value?.capturedAt)){this.statisticsCache.set(value.capturedAt,sourceSnapshotStatistics(value));missing.delete(value.capturedAt);}}
    for(const at of missing)this.statisticsCache.set(at,null);
    for(const report of reports)if(!report.statistics)report.statistics={previous:this.statisticsCache.get(report.previousAt)||null,current:this.statisticsCache.get(report.at)||null};
  }
  changesView(changes){return changes?{...changes,pending:[...changes.tasks.filter(task=>!task.resolved),...(changes.catalogPending||[])],tasks:undefined}:null;}
  async refreshReviewedReminders(){return this.serial(async()=>{
    const document=await this.read(),changes=document.sourceChanges;if(!changes)return null;
    // This operation has no catalog, source reader, login or external adapter.
    // It only closes notifications explicitly confirmed by the user.
    restoreNewProductTasks(changes,document.latestCollection,document.mappingRows||parseMappingRows(document.mapping));
    await this.validatePriceClosures(document);
    const updates=applyTaskReviews(changes.tasks.filter(task=>!task.resolved),{applyReviewed:true}),byId=new Map(updates.map(task=>[task.id,task])),completed=updates.filter(task=>task.resolved&&task.completion);
    changes.tasks=changes.tasks.map(task=>byId.get(task.id)||task);
    for(const item of changes.catalogPending||[]){
      const record=changes.catalogReviews?.[item.id];if(!record||record.completion||record.reminder?.mode!=='close-pending')continue;
      const [task]=applyTaskReviews([{...record.task,reviewed:record.reviewed,reminder:record.reminder}],{applyReviewed:true});
      if(task.resolved&&task.completion){record.completion=task.completion;completed.push(task);}
    }
    changes.catalogPending=(changes.catalogPending||[]).filter(task=>!changes.catalogReviews?.[task.id]?.completion);
    changes.reviewHistory=[...completed,...(changes.reviewHistory||[])].slice(0,300);
    const update=report=>({...report,rows:report.rows.map(row=>({...row,tasks:changes.tasks.filter(task=>task.changeId===row.id||!task.resolved&&sameSourceIdentity(task.after||task.before,row.after||row.before))}))});
    changes.report=update(changes.report);changes.history=changes.history.map(report=>report.id===changes.report.id?changes.report:update(report));
    await writeJSON(this.file,document);const view=this.changesView(changes);await this.hydrateReportStatistics(view,document.latestCollection);return {...view,localRefresh:{at:nowIso(),closed:completed.length}};
  });}
  async validatePriceClosures(document){
    for(const task of document.sourceChanges?.tasks||[]){
      if(task.resolved||task.kind!=='price'||task.reminder?.mode!=='close-pending')continue;
      let valid=false;try{const receipt=task.priceCloseReceipt;if(receipt?.type==='acknowledged')valid=receipt.ruleId===WEBSITE_PRICE_RULE_ID&&receipt.acknowledgementFingerprint===priceAcknowledgementFingerprint(task)&&receipt.sourceState===priceAcknowledgementSource(document,task);else{const context=await priceTaskContext(this,document,task.id),proof=task.priceVerification;valid=Boolean(receipt&&receipt.ruleId===WEBSITE_PRICE_RULE_ID&&receipt.sourceFingerprint===context.fingerprint&&proof?.status==='passed'&&receipt.verificationId===proof.id&&receipt.websiteFingerprint===proof.websiteFingerprint);}}catch{}
      if(!valid){task.reminder={mode:'close-ready',at:nowIso(),fingerprint:reviewFingerprint(task)};delete task.priceCloseReceipt;}
    }
  }
  syncTaskRows(changes,task){
    const update=report=>({...report,rows:report.rows.map(row=>({...row,tasks:row.id===task.changeId?[...(row.tasks||[]).filter(t=>t.id!==task.id),task]:(row.tasks||[]).map(t=>t.id===task.id?task:t)}))});
    changes.report=update(changes.report);changes.history=(changes.history||[]).map(r=>r.id===changes.report.id?changes.report:update(r));
  }
  async confirmSourceRename({proposalId,records}){return this.serial(async()=>{
    const document=await this.read(),pending=await readJSON(path.join(this.paths.state,'pending-sync.json'),null),proposal=sourceRenameOptions(document,pending,records).find(p=>p.id===proposalId);
    if(!proposal)throw Error('来源、对应关系或网站记录已变化，请重新查看改名候选');
    const receipt=applySourceRename(document,proposal,nowIso(),pending);document.updatedAt=nowIso();await writeJSON(this.file,document);const changes=this.changesView(document.sourceChanges);if(changes)await this.hydrateReportStatistics(changes,document.latestCollection);return {receipt,changes};
  });}
  async reconcileSourceRelations({records}={}){return this.serial(async()=>{
    const document=await this.read(),before=JSON.stringify(document),pending=await readJSON(path.join(this.paths.state,'pending-sync.json'),null),receipts=[],at=nowIso();
    if(document.latestCollection?.quality?.passed===true&&pending?.source?.capturedAt===document.latestCollection.capturedAt){
      for(const proposal of sourceRenameOptions(document,pending,records||[]).filter(p=>p.automatic))receipts.push(applySourceRename(document,proposal,at,pending));
      retireMissingSourceRelations(document,pending,at);
    }
    const changed=JSON.stringify(document)!==before;if(changed){document.updatedAt=at;await writeJSON(this.file,document);}
    return {changed,receipts,retired:retiredSourceView(document)};
  });}
  async changeRetiredSource({recordId,operation,confirmed=false}={}){return this.serial(async()=>{
    if(confirmed!==true||!['clear','restore'].includes(operation))throw Error('请明确确认本机旧记录操作');
    const document=await this.read(),record=document.sourceRelationHistory?.find(r=>r.id===recordId&&!r.reappearedAt);
    if(!record)throw Error('旧来源记录已经变化，请重新读取对应关系');
    if(document.latestCollection?.quality?.passed!==true||(document.latestCollection.products||[]).some(p=>sameSourceIdentity(p,record.row)))throw Error('来源不完整或该商品已重新出现，不能清理旧记录');
    record.cleared=operation==='clear';record[operation==='clear'?'clearedAt':'restoredAt']=nowIso();document.updatedAt=nowIso();await writeJSON(this.file,document);
    return {retired:retiredSourceView(document)};
  });}
  async beginPriceRead({taskId,attemptId,at}){return this.serial(async()=>{
    const document=await this.read(),context=await priceTaskContext(this,document,taskId);context.task.priceVerification={id:attemptId,status:'reading',at,ruleId:WEBSITE_PRICE_RULE_ID};if(context.task.priceCloseReceipt?.type!=='acknowledged')delete context.task.priceCloseReceipt;this.syncTaskRows(document.sourceChanges,context.task);await writeJSON(this.file,document);return structuredClone(context);
  });}
  async finishPriceRead({taskId,attemptId,expectedFingerprint,product,at}){return this.serial(async()=>{
    const document=await this.read(),context=await priceTaskContext(this,document,taskId),{task,source}=context,changes=document.sourceChanges;
    if(task.priceVerification?.id!==attemptId||context.fingerprint!==expectedFingerprint||String(product.remoteProductId)!==String(task.remoteProductId))throw Error('核验期间来源、商品或对应关系已变化，请重新读取这款商品');
    const oldPrice=changes.websitePrices?.[task.remoteProductId]?.price??task.website?.websitePriceAed,newPrice=product.websitePriceAed;
    task.current=source;task.businessId=source.businessId;
    task.website={name:product.sourceName||product.name,publishStatus:product.publishStatus,stockKnown:product.stockKnown,stockQuantity:product.stockQuantity,websitePriceAed:newPrice,priceComplete:product.priceEvidence?.complete};task.websiteReadAt=at;
    if(newPrice!==null&&newPrice!==undefined){
      if(oldPrice!==null&&oldPrice!==undefined&&Number(oldPrice)!==Number(newPrice)){
        const field=(task.fields||[]).find(f=>f.field==='websitePriceAed');if(field){if(Number(field.before)===Number(newPrice))task.fields=task.fields.filter(f=>f!==field);else field.after=newPrice;}else(task.fields??=[]).push({field:'websitePriceAed',before:oldPrice,after:newPrice});
        const ref={...source};changes.report.rows.push({id:`${at}:single-price:${task.id}`,kind:'modified',before:ref,after:ref,fields:[{field:'websitePriceAed',before:oldPrice,after:newPrice}],tasks:[task],moved:false});delete task.reviewed;delete task.reminder;delete task.priceCloseReceipt;
      }
      (changes.websitePrices??={})[task.remoteProductId]={price:newPrice,at};
    }
    const updated=await priceTaskContext(this,document,taskId),check=priceResult(source,product),proof={id:randomUUID(),status:check.status==='ok'?'passed':'failed',ruleId:WEBSITE_PRICE_RULE_ID,at,sourceAt:updated.sourceAt,sourceFingerprint:updated.fingerprint,taskFingerprint:reviewFingerprint(task),websiteFingerprint:stableHash({remoteProductId:product.remoteProductId,evidence:product.priceEvidence,price:newPrice}),check};
    task.priceVerification=proof;changes.report.summary=changeCounts(changes.report.rows);this.syncTaskRows(changes,task);await writeJSON(this.file,document);return {task:structuredClone(task),verified:proof.status==='passed',reason:check.message};
  });}
  async failPriceRead({taskId,attemptId,reason,at}){return this.serial(async()=>{
    const document=await this.read(),changes=document.sourceChanges,task=changes?.tasks?.find(t=>t.id===taskId&&!t.resolved);
    if(!task)return {id:taskId,kind:'price',priceVerification:{status:'failed',at,message:reason}};
    if(task.priceVerification?.id===attemptId){task.priceVerification={id:attemptId,status:'failed',at,message:reason,ruleId:WEBSITE_PRICE_RULE_ID};if(task.priceCloseReceipt?.type!=='acknowledged')delete task.priceCloseReceipt;this.syncTaskRows(changes,task);await writeJSON(this.file,document);}return structuredClone(task);
  });}
  async reviewSourceTask({taskId,operation='view',confirmed=false,fingerprint:expectedFingerprint,verificationId,expectedTask}={}){return this.serial(async()=>{
    if(!['view','continue','exit','close','acknowledge-price','acknowledge-reminder'].includes(operation))throw new Error('提醒操作无效');
    const closing=['close','acknowledge-price','acknowledge-reminder'].includes(operation);
    if(closing&&confirmed!==true)throw new Error('请明确人工确认关闭这条提醒');
    const document=await this.read(),changes=document.sourceChanges,task=changes?.tasks?.find(item=>item.id===taskId&&!item.resolved),record=changes?.catalogReviews?.[taskId];
    if(!task&&(!record||record.completion))throw new Error('提醒已处理或不存在，请刷新');
    const target=task||record,fingerprint=task?reviewFingerprint(task):record.fingerprint;
    if(operation==='acknowledge-reminder'){
      const current=task||record?.task;
      if(!current||current.kind==='price'||expectedTask?.kind!==current.kind)throw new Error('请使用当前提醒详情中的关闭入口');
      if(reminderAcknowledgementFingerprint(expectedTask)!==reminderAcknowledgementFingerprint(current))throw new Error('商品资料已发生新的变化，请重新查看并确认关闭');
      target.reviewed={at:nowIso(),fingerprint};
    }
    if(operation==='acknowledge-price'){
      if(task?.kind!=='price'||expectedTask?.kind!=='price')throw new Error('知晓后关闭仅适用于价格提醒');
      if(expectedTask.id!==task.id||priceAcknowledgementFingerprint(expectedTask)!==priceAcknowledgementFingerprint(task))throw new Error('商品价格资料已变化，请重新查看并确认关闭');
      target.priceCloseReceipt={type:'acknowledged',confirmedAt:nowIso(),ruleId:WEBSITE_PRICE_RULE_ID,acknowledgementFingerprint:priceAcknowledgementFingerprint(task),sourceState:priceAcknowledgementSource(document,task)};
      target.reviewed={at:nowIso(),fingerprint};
    }
    if(operation==='close'&&expectedFingerprint&&expectedFingerprint!==fingerprint)throw new Error('商品已发生新的变化，请重新查看并确认关闭');
    if(operation==='close'&&task?.kind==='price'){const context=await priceTaskContext(this,document,taskId),proof=checkPriceProof(context,verificationId);target.priceCloseReceipt={verificationId:proof.id,sourceFingerprint:context.fingerprint,websiteFingerprint:proof.websiteFingerprint,confirmedAt:nowIso(),ruleId:WEBSITE_PRICE_RULE_ID};}
    if(operation==='view')target.reviewed={at:nowIso(),fingerprint};
    else target.reminder={mode:operation==='continue'?'continue':operation==='exit'?'close-ready':'close-pending',at:nowIso(),fingerprint,...(closing?{confirmed:true}:{})};
    if(task)this.syncTaskRows(changes,task);
    if(record){changes.catalogPending=(changes.catalogPending||[]).map(item=>item.id===taskId?{...item,reviewed:record.reviewed,reminder:record.reminder}:item);}
    await writeJSON(this.file,document);const view=this.changesView(changes);await this.hydrateReportStatistics(view,document.latestCollection);return view;
  });}
  async decideReplacement({changeId,decision}){return this.serial(async()=>{
    if(!['replacement','separate'].includes(decision))throw new Error('替换核对决定无效');
    const document=await this.read(),changes=document.sourceChanges,report=changes?.history?.find(item=>item.rows.some(row=>row.id===changeId)),row=report?.rows.find(item=>item.id===changeId);
    if(!row||row.kind!=='suspected')throw new Error('该疑似替换已核对或不存在，请刷新变化明细');
    changes.tasks=changes.tasks.map(task=>task.changeId===changeId?{...task,resolved:true,reason:decision==='replacement'?'已人工确认替换。':'已人工确认分别删除和新增。'}:task);
    if(decision==='replacement'){row.kind='replacement';row.decision='replacement';}
    else{const index=report.rows.indexOf(row);report.rows.splice(index,1,{...row,id:row.id+':removed',kind:'removed',after:null,decision:'separate'},{...row,id:row.id+':added',kind:'added',before:null,decision:'separate'});}
    report.summary=changeCounts(report.rows);
    for(const seed of taskSeeds({...report,rows:report.rows.filter(item=>[changeId,changeId+':removed',changeId+':added'].includes(item.id))}))if(!changes.tasks.some(task=>task.id===seed.id))changes.tasks.push(seed);
    if(changes.report.id===report.id)changes.report=report;
    await writeJSON(this.file,document);return this.changesView(changes);
  });}
  async commit({source,mappingState,plan}){return this.serial(async()=>{
    const document=await this.read(),savedAt=nowIso();
    const entry=plan.formalChanged?{versionId:`${savedAt}_${source.capturedAt}`,capturedAt:source.capturedAt,savedAt,productCount:source.quality?.namedProducts||source.products?.length||0,summary:plan.summary,detail:plan.detail||[]}:null;
    const history=entry?[entry,...(document.history||[])]:document.history||[];
    const current={capturedAt:source.capturedAt,savedAt,products:currentProducts(plan.inventoryAfter,mappingState?.rows),mappingRows:(mappingState?.rows||[]).map(row=>({...row}))};
    const next={...document,schemaVersion:1,updatedAt:savedAt,current,inventory:compactInventory(plan.inventoryAfter),mapping:plan.mappingAfter||document.mapping,mappingRows:current.mappingRows,history:this.trimHistory(history)};
    await writeJSON(this.file,next);await this.pruneSourceSnapshots();return this.view(next);
  });}
  trimHistory(history){const cutoff=ageLimit();return (history||[]).filter(entry=>Date.parse(entry.savedAt||entry.capturedAt||0)>=cutoff).slice(0,LOCAL_HISTORY_MAX_VERSIONS);}
  async pruneSourceSnapshots(){const names=await listJSON(this.paths.snapshots,'source_'),keep=[];for(const name of names){const value=await readJSON(path.join(this.paths.snapshots,name),null);const captured=Date.parse(value?.capturedAt||0);if(captured>=ageLimit())keep.push(name);}const byNewest=new Set(keep.slice(-LOCAL_HISTORY_MAX_VERSIONS));for(const name of names)if(!byNewest.has(name))await unlink(path.join(this.paths.snapshots,name)).catch(()=>{});}
  view(document){const value=document||{};return {schemaVersion:1,updatedAt:value.updatedAt,latestCollection:value.latestCollection,current:value.current,history:value.history||[],retention:{maxVersions:LOCAL_HISTORY_MAX_VERSIONS,maxAgeDays:LOCAL_HISTORY_MAX_AGE_DAYS,historyCount:(value.history||[]).length}};}
  async getView(){return this.view(await this.read());}
}
