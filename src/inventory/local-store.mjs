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
const blankDocument=()=>({schemaVersion:1,updatedAt:null,latestCollection:null,current:null,inventory:[INVENTORY_HEADERS],mapping:[MAPPING_HEADERS],history:[]});
const compactInventory=values=>{
  const rows=Array.isArray(values)?values:[],sourceHeader=rows[0]||INVENTORY_HEADERS,historyHeader=sourceHeader.slice(6).filter(Boolean).slice(0,4);
  const header=[...INVENTORY_HEADERS,...historyHeader];
  return [header,...rows.slice(1).filter(row=>row?.some(Boolean)).map(row=>[...row.slice(0,6),...row.slice(6,10)])];
};
const currentProducts=(inventoryValues,mappingRows=[])=>{const sourceRows=new Map((mappingRows||[]).filter(row=>row?.businessId).map(row=>[row.businessId,row.sourceRow||null]));return parseInventory(inventoryValues).rows.map(row=>({businessId:row.businessId||'',sourceName:row.sourceName||'',cost:row.latest?.cost||'',suggestedPrice:row.latest?.suggestedPrice||'',stock:row.latest?.stock||'',additionalInfo:row.latest?.additionalInfo||'',sourceRow:sourceRows.get(row.businessId)||null,removed:row.latest?.stock==='来源已移除'}));};

export class LocalInventoryStore{
  constructor(paths){this.paths=paths;this.file=path.join(paths.state,'local-inventory.json');this.queue=Promise.resolve();}
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
    await writeJSON(this.file,document);return this.changesView(changes);
  });}
  changesView(changes){return changes?{...changes,pending:[...changes.tasks.filter(task=>!task.resolved),...(changes.catalogPending||[])],tasks:undefined}:null;}
  async refreshReviewedReminders(){return this.serial(async()=>{
    const document=await this.read(),changes=document.sourceChanges;if(!changes)return null;
    // This operation has no catalog, source reader, login or external adapter.
    // It only closes notifications explicitly confirmed by the user.
    restoreNewProductTasks(changes,document.latestCollection,document.mappingRows||parseMappingRows(document.mapping));
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
    await writeJSON(this.file,document);return {...this.changesView(changes),localRefresh:{at:nowIso(),closed:completed.length}};
  });}
  async reviewSourceTask({taskId,operation='view',confirmed=false,fingerprint:expectedFingerprint}={}){return this.serial(async()=>{
    if(!['view','continue','exit','close'].includes(operation))throw new Error('提醒操作无效');
    if(operation==='close'&&confirmed!==true)throw new Error('请明确人工确认关闭这条提醒');
    const document=await this.read(),changes=document.sourceChanges,task=changes?.tasks?.find(item=>item.id===taskId&&!item.resolved),record=changes?.catalogReviews?.[taskId];
    if(!task&&(!record||record.completion))throw new Error('提醒已处理或不存在，请刷新');
    const target=task||record,fingerprint=task?reviewFingerprint(task):record.fingerprint;
    if(operation==='close'&&expectedFingerprint&&expectedFingerprint!==fingerprint)throw new Error('商品已发生新的变化，请重新查看并确认关闭');
    if(operation==='view')target.reviewed={at:nowIso(),fingerprint};
    else target.reminder={mode:operation==='continue'?'continue':operation==='exit'?'close-ready':'close-pending',at:nowIso(),fingerprint,...(operation==='close'?{confirmed:true}:{})};
    if(record){changes.catalogPending=(changes.catalogPending||[]).map(item=>item.id===taskId?{...item,reviewed:record.reviewed,reminder:record.reminder}:item);}
    await writeJSON(this.file,document);return this.changesView(changes);
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
