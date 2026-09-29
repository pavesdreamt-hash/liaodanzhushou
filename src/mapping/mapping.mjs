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
  // A waiting suggestion is not a relationship. It may legitimately point to
  // the same website product as another waiting suggestion, and it must not
  // reserve that product before a person confirms it.
  const ids=rows.filter(r=>r.status==='正常'&&r.businessId).map(r=>r.businessId),keys=rows.map(r=>r.sourceKey);
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
  const byKey=new Map((answers||[]).map(answer=>[answer.sourceKey,{businessId:coreText(answer.businessId),action:coreText(answer.action)}])),used=new Set();
  const rows=wizard.rows.map(row=>{let businessId=row.businessId,status=row.status,note=row.note;
    // Every mapping change is explicitly keyed to the source row.  This also
    // permits a previously saved relationship to be corrected or cancelled;
    // saving another row never changes it incidentally.
    if(byKey.has(row.sourceKey)){
      const answer=byKey.get(row.sourceKey),nextBusinessId=answer.businessId;
      if(answer.action==='ignore'){
        businessId='';status='本机已忽略';
        note=`${note}${note?'；':''}本机标记为重复项并忽略`;
      }else if(answer.action==='restore'){
        businessId='';status='待编号';
        note=`${note}${note?'；':''}已恢复为待人工核对`;
      }else if(nextBusinessId){
        const wasConfirmed=status==='正常',corrected=wasConfirmed&&nextBusinessId!==businessId;
        businessId=nextBusinessId;status='正常';
        if(corrected)note=`${note}${note?'；':''}本机确认关系已更正`;
        else if(!wasConfirmed)note=`${note}${note?'；':''}${wizard.firstRun?'首次同步已确认':'商品编号已确认'}`;
      }else if(status==='待确认'||status==='待编号'||status==='正常'){
        businessId='';status='待编号';
        note=`${note}${note?'；':''}${row.status==='正常'?'已取消本机确认，等待选择其他网站商品':'候选已标记不对应，等待选择其他网站商品'}`;
      }
    }
    if(businessId&&!/^[A-Za-z0-9_-]{1,30}$/.test(businessId))throw new AppError(`商品编号格式无效：${businessId}`,{stage:'首次映射',code:'BUSINESS_ID_INVALID'});
    if(status==='正常'&&businessId&&used.has(businessId))throw new AppError(`商品编号重复：${businessId}`,{stage:'首次映射',code:'DUPLICATE_BUSINESS_ID'});if(status==='正常'&&businessId)used.add(businessId);
    return {...row,businessId,status,note};});
  const unresolved=rows.filter(r=>['待确认','待编号'].includes(r.status)||!r.businessId);return {...wizard,rows,review:unresolved,automatic:rows.length-unresolved.length,
    needsConfirmation:unresolved.filter(r=>r.status==='待确认').length,pendingNumber:unresolved.filter(r=>r.status==='待编号').length,
    ignored:rows.filter(r=>r.status==='本机已忽略').length};
}
export function reconcileMappings(sourceProducts,existing){
  if(!existing.length)return buildFirstMappingWizard(sourceProducts);
  const current=assignSourceKeys(sourceProducts.filter(r=>coreText(r.sourceName))),byKey=new Map(existing.map(r=>[r.sourceKey,r])),matchedOld=new Set();
  const continuityName=value=>normalizedSourceName(value).replace(/\([^)]*[a-z]{1,8}\d[a-z0-9-]*[^)]*\)/gi,'').replace(/\s+/g,' ').trim();
  const fallbackGroups=Map.groupBy(existing,r=>continuityName(r.sourceName)),matches=new Map();
  for(const record of current){const exact=byKey.get(record.sourceKey);if(exact&&!matchedOld.has(exact.sourceKey)){matches.set(record.sourceKey,exact);matchedOld.add(exact.sourceKey);}}
  // A new snapshot may consolidate several old row-level entries into one
  // named source product. Never let their former order choose a website product
  // silently. We only carry a single already-confirmed relationship forward;
  // all other legacy suggestions become one explicit manual-choice row.
  const collapsedNotes=new Map();
  for(const record of current){
    if(matches.has(record.sourceKey)||Number(record.sourceRowCount||1)<=1)continue;
    const candidates=(fallbackGroups.get(continuityName(record.sourceName))||[]).filter(candidate=>!matchedOld.has(candidate.sourceKey));
    if(candidates.length<=1)continue;
    const confirmed=candidates.filter(candidate=>candidate.status==='正常'&&candidate.businessId);
    if(confirmed.length===1){matches.set(record.sourceKey,confirmed[0]);for(const candidate of candidates)matchedOld.add(candidate.sourceKey);continue;}
    for(const candidate of candidates)matchedOld.add(candidate.sourceKey);
    collapsedNotes.set(record.sourceKey,'同名来源资料已合并；历史候选不会自动继承，请重新选择网站商品');
  }
  // sourceKey may legitimately change when KDocs removes a displayed model or
  // stops painting an image. Preserve confirmed business IDs by normalized
  // name and previous relative order; changing D/E/F/G never affects identity.
  for(const record of current){if(matches.has(record.sourceKey))continue;const name=continuityName(record.sourceName),old=(fallbackGroups.get(name)||[]).find(candidate=>!matchedOld.has(candidate.sourceKey));
    if(old){matches.set(record.sourceKey,old);matchedOld.add(old.sourceKey);}}
  const rows=current.map(record=>{
    const old=matches.get(record.sourceKey);
    if(!old)return {businessId:'',sourceKey:record.sourceKey,sourceName:record.sourceName,status:'待编号',note:collapsedNotes.get(record.sourceKey)||'新来源商品，等待业务编号',sourceRow:record.sourceRow};
    const renamed=coreText(old.sourceName)!==coreText(record.sourceName),keyChanged=old.sourceKey!==record.sourceKey,status=old.status==='本机已忽略'?'本机已忽略':old.businessId?'正常':'待编号',businessId=status==='本机已忽略'?'':old.businessId;return {...old,businessId,sourceKey:record.sourceKey,sourceName:record.sourceName,status,
      note:renamed||keyChanged?`${old.note?old.note+'；':''}来源标识已自动连续匹配`:old.note,sourceRow:record.sourceRow,nameChanged:renamed};
  });
  for(const old of existing)if(!matchedOld.has(old.sourceKey))rows.push({...old,status:'来源已移除',note:`${old.note?old.note+'；':''}本次来源未出现`});
  const used=new Map();for(const row of rows)if(row.status==='正常'&&row.businessId){if(used.has(row.businessId)&&used.get(row.businessId)!==row.sourceKey)throw new AppError(`业务编号${row.businessId}映射到多个来源`,{stage:'商品映射',code:'DUPLICATE_BUSINESS_ID'});used.set(row.businessId,row.sourceKey);}
  return {firstRun:false,total:current.length,automatic:rows.filter(r=>r.status==='正常').length,needsConfirmation:rows.filter(r=>r.status==='待确认').length,
    pendingNumber:rows.filter(r=>r.status==='待编号').length,ignored:rows.filter(r=>r.status==='本机已忽略').length,removed:rows.filter(r=>r.status==='来源已移除').length,rows,review:rows.filter(r=>['待编号','待确认'].includes(r.status))};
}
export function mappingValues(rows){return [MAPPING_HEADERS,...[...rows].sort((a,b)=>a.sourceRow-b.sourceRow)
  .map(r=>[r.businessId,r.sourceKey,r.sourceName,r.status||(r.businessId?'正常':'待编号'),r.note||''])];}
