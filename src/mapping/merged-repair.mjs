import {coreText} from '../../shared/text.mjs';
import {MAPPING_HEADERS} from '../config.mjs';
import {AppError} from '../core/errors.mjs';
import {parseMappingRows} from './mapping.mjs';
import {assignSourceKeys} from './source-key.mjs';

// One-time migration from the legacy name-only mapping to row-complete,
// image-aware identities. sourceRow is used only to carry an already confirmed
// business ID across this migration; all future matching uses the new sourceKey.
export function buildMergedNameRepair({currentValues,previousProducts,currentProducts}){
  const current=parseMappingRows(currentValues),previous=assignSourceKeys(previousProducts.filter(r=>coreText(r.sourceName))),next=assignSourceKeys(currentProducts.filter(r=>coreText(r.sourceName))).sort((a,b)=>a.sourceRow-b.sourceRow);
  const previousByKey=new Map(previous.map(r=>[r.sourceKey,r])),currentByRow=new Map(),unmatched=[];
  for(const row of current){const old=previousByKey.get(row.sourceKey);if(!old){unmatched.push(row);continue;}if(currentByRow.has(old.sourceRow))throw new AppError(`旧映射有多条记录对应来源第${old.sourceRow}行`,{stage:'商品映射修复',code:'LEGACY_ROW_COLLISION'});currentByRow.set(old.sourceRow,row);}
  if(unmatched.length)throw new AppError(`有${unmatched.length}条现有映射无法对应旧来源，已停止以保护人工编号`,{stage:'商品映射修复',code:'LEGACY_MAPPING_UNMATCHED',details:unmatched.map(r=>({businessId:r.businessId,sourceKey:r.sourceKey}))});
  const sourceRows=new Set();for(const record of next){if(sourceRows.has(record.sourceRow))throw new AppError(`来源第${record.sourceRow}行重复`,{stage:'商品映射修复',code:'SOURCE_ROW_DUPLICATE'});sourceRows.add(record.sourceRow);}
  const rows=next.map(record=>{const old=currentByRow.get(record.sourceRow),businessId=coreText(old?.businessId);return {businessId,sourceKey:record.sourceKey,sourceName:record.sourceName,status:businessId?'正常':'待编号',note:'',sourceRow:record.sourceRow,imageFingerprint:record.imageFingerprint||'',inserted:!old};});
  const numberedBefore=current.filter(r=>r.businessId),numberedAfter=rows.filter(r=>r.businessId),afterByRow=new Map(rows.map(r=>[r.sourceRow,r]));
  for(const old of numberedBefore){const sourceRow=previousByKey.get(old.sourceKey)?.sourceRow,after=afterByRow.get(sourceRow);if(!after||after.businessId!==old.businessId)throw new AppError(`人工编号${old.businessId}未被原样保留`,{stage:'商品映射修复',code:'MANUAL_ID_NOT_PRESERVED'});}
  if(numberedAfter.length!==numberedBefore.length||new Set(numberedAfter.map(r=>r.businessId)).size!==numberedAfter.length)throw new AppError('人工编号数量变化或出现重复，已停止写入',{stage:'商品映射修复',code:'MANUAL_ID_INTEGRITY_FAILED'});
  const values=[MAPPING_HEADERS,...rows.map(r=>[r.businessId,r.sourceKey,r.sourceName,r.status,''])];
  return {rows,values,stats:{before:current.length,after:rows.length,missing:rows.length-current.length,numberedBefore:numberedBefore.length,numberedAfter:numberedAfter.length,
    pendingAfter:rows.filter(r=>!r.businessId).length,insertedPending:rows.filter(r=>r.inserted&&!r.businessId).length}};
}
