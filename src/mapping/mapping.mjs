import {coreText} from '../../shared/text.mjs';
import {assignSourceKeys,normalizedSourceName} from './source-key.mjs';
import {MAPPING_HEADERS,MAPPING_STATUSES} from '../config.mjs';
import {AppError} from '../core/errors.mjs';
export function parseMappingRows(values){
  if(!values?.length)return [];
  if(MAPPING_HEADERS.some((h,i)=>coreText(values[0]?.[i])!==h))throw new AppError('商品映射表头不一致',{stage:'商品映射',code:'MAPPING_HEADER_INVALID'});
  const rows=[];for(let i=1;i<values.length;i++){
    const row=values[i]||[],businessId=coreText(row[0]),sourceKey=coreText(row[1]),sourceName=coreText(row[2]),status=coreText(row[3]),note=coreText(row[4]);
    if(![businessId,sourceKey,sourceName,status,note].some(Boolean))continue;
    if(!sourceKey||!sourceName||!MAPPING_STATUSES.includes(status))throw new AppError(`商品映射第${i+1}行结构无效`,{stage:'商品映射',code:'MAPPING_ROW_INVALID'});
    rows.push({businessId,sourceKey,sourceName,status,note,sheetRow:i+1});
  }
  const ids=rows.filter(r=>r.businessId).map(r=>r.businessId),keys=rows.map(r=>r.sourceKey);
  if(new Set(ids).size!==ids.length)throw new AppError('商品映射存在重复商品编号',{stage:'商品映射',code:'DUPLICATE_BUSINESS_ID'});
  if(new Set(keys).size!==keys.length)throw new AppError('商品映射存在重复来源匹配标识',{stage:'商品映射',code:'DUPLICATE_SOURCE_KEY'});
  return rows;
}
export function buildFirstMappingWizard(sourceProducts){
  const records=assignSourceKeys(sourceProducts.filter(r=>coreText(r.sourceName))).sort((a,b)=>a.sourceRow-b.sourceRow),rows=records.map(record=>({
    businessId:'',sourceKey:record.sourceKey,sourceName:record.sourceName,status:'待编号',note:'',sourceRow:record.sourceRow,method:'人工填写商品编号'
  }));
  return {firstRun:true,total:rows.length,automatic:0,needsConfirmation:0,pendingNumber:rows.length,rows,review:rows};
}
export function applyWizardAnswers(wizard,answers){
  const byKey=new Map((answers||[]).map(x=>[x.sourceKey,coreText(x.businessId)])),used=new Set();
  const rows=wizard.rows.map(row=>{let businessId=row.businessId,status=row.status,note=row.note;
    if(status==='待确认'||status==='待编号'){
      businessId=byKey.get(row.sourceKey)||businessId||'';
      if(businessId){status='正常';note=`${note}${note?'；':''}${wizard.firstRun?'首次同步已确认':'商品编号已确认'}`;}
    }
    if(businessId&&!/^[A-Za-z0-9_-]{1,30}$/.test(businessId))throw new AppError(`商品编号格式无效：${businessId}`,{stage:'首次映射',code:'BUSINESS_ID_INVALID'});
    if(businessId&&used.has(businessId))throw new AppError(`商品编号重复：${businessId}`,{stage:'首次映射',code:'DUPLICATE_BUSINESS_ID'});if(businessId)used.add(businessId);
    return {...row,businessId,status,note};});
  const unresolved=rows.filter(r=>['待确认','待编号'].includes(r.status)||!r.businessId);return {...wizard,rows,review:unresolved,automatic:rows.length-unresolved.length,
    needsConfirmation:unresolved.filter(r=>r.status==='待确认').length,pendingNumber:unresolved.filter(r=>r.status==='待编号'||!r.businessId).length};
}
export function reconcileMappings(sourceProducts,existing){
  if(!existing.length)return buildFirstMappingWizard(sourceProducts);
  const current=assignSourceKeys(sourceProducts.filter(r=>coreText(r.sourceName))),byKey=new Map(existing.map(r=>[r.sourceKey,r])),matchedOld=new Set();
  const continuityName=value=>normalizedSourceName(value).replace(/\([^)]*[a-z]{1,8}\d[a-z0-9-]*[^)]*\)/gi,'').replace(/\s+/g,' ').trim();
  const fallbackGroups=Map.groupBy(existing,r=>continuityName(r.sourceName)),matches=new Map();
  for(const record of current){const exact=byKey.get(record.sourceKey);if(exact&&!matchedOld.has(exact.sourceKey)){matches.set(record.sourceKey,exact);matchedOld.add(exact.sourceKey);}}
  // sourceKey may legitimately change when KDocs removes a displayed model or
  // stops painting an image. Preserve confirmed business IDs by normalized
  // name and previous relative order; changing D/E/F/G never affects identity.
  for(const record of current){if(matches.has(record.sourceKey))continue;const name=continuityName(record.sourceName),old=(fallbackGroups.get(name)||[]).find(candidate=>!matchedOld.has(candidate.sourceKey));
    if(old){matches.set(record.sourceKey,old);matchedOld.add(old.sourceKey);}}
  const rows=current.map(record=>{
    const old=matches.get(record.sourceKey);
    if(!old)return {businessId:'',sourceKey:record.sourceKey,sourceName:record.sourceName,status:'待编号',note:'新来源商品，等待业务编号',sourceRow:record.sourceRow};
    const renamed=coreText(old.sourceName)!==coreText(record.sourceName),keyChanged=old.sourceKey!==record.sourceKey;return {...old,sourceKey:record.sourceKey,sourceName:record.sourceName,status:old.businessId?'正常':'待编号',
      note:renamed||keyChanged?`${old.note?old.note+'；':''}来源标识已自动连续匹配`:old.note,sourceRow:record.sourceRow,nameChanged:renamed};
  });
  for(const old of existing)if(!matchedOld.has(old.sourceKey))rows.push({...old,status:'来源已移除',note:`${old.note?old.note+'；':''}本次来源未出现`});
  const used=new Map();for(const row of rows)if(row.businessId){if(used.has(row.businessId)&&used.get(row.businessId)!==row.sourceKey)throw new AppError(`业务编号${row.businessId}映射到多个来源`,{stage:'商品映射',code:'DUPLICATE_BUSINESS_ID'});used.set(row.businessId,row.sourceKey);}
  return {firstRun:false,total:current.length,automatic:rows.filter(r=>r.status==='正常').length,needsConfirmation:rows.filter(r=>r.status==='待确认').length,
    pendingNumber:rows.filter(r=>r.status==='待编号').length,removed:rows.filter(r=>r.status==='来源已移除').length,rows,review:rows.filter(r=>['待编号','待确认'].includes(r.status))};
}
export function mappingValues(rows){return [MAPPING_HEADERS,...[...rows].sort((a,b)=>a.sourceRow-b.sourceRow)
  .map(r=>[r.businessId,r.sourceKey,r.sourceName,r.status||(r.businessId?'正常':'待编号'),r.note||''])];}
