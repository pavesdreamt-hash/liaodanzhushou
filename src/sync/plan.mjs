import {assignSourceKeys} from '../mapping/source-key.mjs';
import {mappingValues} from '../mapping/mapping.mjs';
import {parseInventory,historyHeaders} from './history.mjs';
import {compareBusiness} from './diff.mjs';
import {INVENTORY_HEADERS,MAPPING_SHEET,INVENTORY_SHEET} from '../config.mjs';
import {coreText} from '../../shared/text.mjs';
import {stableHash} from '../core/files.mjs';
import {AppError} from '../core/errors.mjs';
import {trimMatrix} from '../google/workbook.mjs';
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function buildSyncPlan({sourceSnapshot,mappingState,inventoryValues,mappingValuesBefore,metadata,now=new Date()}){
  const inventory=parseInventory(inventoryValues),previous=new Map(inventory.rows.map(r=>[r.businessId,{sourceName:r.sourceName,cost:r.latest?.cost||'',suggestedPrice:r.latest?.suggestedPrice||'',stock:r.latest?.stock||'',additionalInfo:r.latest?.additionalInfo||''}]));
  const sourceByKey=new Map(assignSourceKeys(sourceSnapshot.products.filter(r=>coreText(r.sourceName))).map(r=>[r.sourceKey,r]));
  const inventoryIds=new Set(inventory.rows.map(r=>r.businessId)),mappingIds=new Set(mappingState.rows.filter(r=>r.businessId).map(r=>r.businessId));
  const orphan=[...inventoryIds].filter(id=>!mappingIds.has(id));if(orphan.length)throw new AppError(`库存情况存在未纳入商品映射的编号：${orphan.slice(0,10).join('、')}`,{stage:'同步计划',code:'ORPHAN_INVENTORY_ROWS'});
  const products=[],detail=[],counts={total:sourceSnapshot.quality.namedProducts,matched:0,pendingNumber:0,ambiguous:0,added:0,removed:0,
    costChanged:0,priceChanged:0,stockChanged:0,additionalInfoChanged:0,nameChanged:0,modified:0};
  for(const row of mappingState.rows){
    if(row.status==='待编号'){counts.pendingNumber++;continue;}if(row.status==='待确认'){counts.ambiguous++;continue;}if(!row.businessId)continue;
    const source=sourceByKey.get(row.sourceKey),old=previous.get(row.businessId);let current;
    // A user may number a mapping after the last inventory baseline and the
    // source may disappear before its first inventory write. Do not create a
    // ghost "added" row whose only value is 来源已移除.
    if(row.status==='来源已移除'&&!old)continue;
    if(row.status==='来源已移除'||!source)current={businessId:row.businessId,sourceName:row.sourceName,cost:old?.cost||'',suggestedPrice:old?.suggestedPrice||'',stock:'来源已移除',additionalInfo:old?.additionalInfo||'',removed:true};
    else{counts.matched++;current={businessId:row.businessId,sourceName:source.sourceName,cost:source.cost,suggestedPrice:source.suggestedPrice,stock:source.stock,additionalInfo:source.additionalInfo||'',sourceRow:source.sourceRow,removed:false};}
    const change=compareBusiness(old,current);if(change.kind==='added')counts.added++;if(change.kind==='removed')counts.removed++;
    counts.costChanged+=change.fields.cost;counts.priceChanged+=change.fields.suggestedPrice;counts.stockChanged+=change.fields.stock;counts.additionalInfoChanged+=change.fields.additionalInfo;counts.nameChanged+=change.fields.name;if(change.changed&&change.kind==='modified')counts.modified++;
    products.push({...current,change});if(change.changed)detail.push({businessId:row.businessId,sourceName:current.sourceName,kind:change.kind,changes:change.details});
  }
  const formalChanged=products.some(p=>p.change.changed),newHistoryHeaders=formalChanged?historyHeaders(now,inventory.historyHeaders):[];
  const oldById=new Map(inventory.rows.map(r=>[r.businessId,r.raw])),header=formalChanged?[...INVENTORY_HEADERS,...newHistoryHeaders,...inventory.historyHeaders]:inventory.raw[0]||INVENTORY_HEADERS;
  const inventoryAfter=formalChanged?[header,...products.map(p=>{
    const old=oldById.get(p.businessId)||[];return [p.businessId,p.sourceName,p.change.costChange,p.change.priceChange,p.change.stockChange,p.change.additionalInfoChange,
      p.cost,p.suggestedPrice,p.stock,p.additionalInfo,...old.slice(6)];})]:inventory.raw;
  const mappingAfter=mappingValues(mappingState.rows),mappingChanged=!equal(mappingAfter,(mappingValuesBefore||[]).map(r=>r.map(coreText)));
  const requiresInput=counts.ambiguous>0;
  const fingerprint=stableHash({sheets:metadata.sheets.map(s=>s.properties),inventory:trimMatrix(inventory.raw),mapping:trimMatrix(mappingValuesBefore||[])});
  return {schemaVersion:1,createdAt:now.toISOString(),sourceSnapshot:sourceSnapshot.capturedAt,counts,formalChanged,mappingChanged,requiresInput,firstSync:inventory.historyHeaders.length===0,
    historyHeaders:newHistoryHeaders,detail,inventoryBefore:inventory.raw,mappingBefore:(mappingValuesBefore||[]).map(r=>r.map(coreText)),inventoryAfter,mappingAfter,fingerprint,
    summary:{total:counts.total,cost:counts.costChanged,price:counts.priceChanged,stock:counts.stockChanged,additionalInfo:counts.additionalInfoChanged,newProducts:counts.pendingNumber+counts.added,removed:counts.removed,ambiguous:counts.ambiguous}};
}
export function validateSyncPlan(plan){
  if(plan.schemaVersion!==1||!plan.sourceSnapshot||!plan.fingerprint)throw new AppError('同步计划结构无效',{stage:'同步计划',code:'PLAN_INVALID'});
  if(plan.requiresInput)throw new AppError('仍有待确认商品，不能执行正式写入；未编号商品会安全跳过',{stage:'商品映射',code:'MAPPING_INPUT_REQUIRED'});
  if(plan.formalChanged){
    if(plan.inventoryAfter[0].slice(0,6).join('\0')!==INVENTORY_HEADERS.join('\0'))throw new Error('A-F表头被修改');
    if(plan.historyHeaders.length!==4||plan.inventoryAfter.some(r=>r.length>plan.inventoryAfter[0].length))throw new Error('历史版本列计划无效');
  }
  return plan;
}
export function planFileView(plan){const {inventoryBefore,mappingBefore,inventoryAfter,mappingAfter,...safe}=plan;return {...safe,
  beforeHash:stableHash({inventoryBefore,mappingBefore}),afterHash:stableHash({inventoryAfter,mappingAfter})};}
