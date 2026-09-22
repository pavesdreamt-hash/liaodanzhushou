import {INVENTORY_HEADERS,TIMEZONE} from '../config.mjs';
import {coreText} from '../../shared/text.mjs';
import {AppError} from '../core/errors.mjs';
const cell=(row,index)=>coreText(row?.[index]);
export function parseInventory(values){
  if(!values?.length)return {rows:[],historyHeaders:[],raw:[]};
  if(INVENTORY_HEADERS.some((h,i)=>cell(values[0],i)!==h))throw new AppError('库存情况A-F表头不一致',{stage:'同步计划',code:'INVENTORY_HEADER_INVALID'});
  const historyHeaders=(values[0]||[]).slice(6).map(coreText),usedHistory=historyHeaders.findLastIndex(Boolean)+1;
  if(usedHistory%4!==0)throw new AppError('库存情况历史列不是完整的4列版本',{stage:'同步计划',code:'HISTORY_COLUMNS_INVALID'});
  const seen=new Set(),rows=[];
  for(let i=1;i<values.length;i++){
    const row=values[i]||[],businessId=cell(row,0);if(!row.some(x=>coreText(x)))continue;
    if(!businessId||seen.has(businessId))throw new AppError(`库存情况第${i+1}行业务编号为空或重复`,{stage:'同步计划',code:'INVENTORY_ID_INVALID'});seen.add(businessId);
    rows.push({businessId,sourceName:cell(row,1),costChange:cell(row,2),priceChange:cell(row,3),stockChange:cell(row,4),additionalInfoChange:cell(row,5),
      latest:usedHistory?{cost:cell(row,6),suggestedPrice:cell(row,7),stock:cell(row,8),additionalInfo:cell(row,9)}:null,raw:row.map(coreText)});
  }
  return {rows,historyHeaders:historyHeaders.slice(0,usedHistory),raw:values.map(r=>r.map(coreText)),historyColumnCount:usedHistory};
}
function dateParts(date,timeZone=TIMEZONE){const p=new Intl.DateTimeFormat('zh-CN',{timeZone,month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(date),get=t=>p.find(x=>x.type===t)?.value;return {date:`${Number(get('month'))}.${Number(get('day'))}`,time:`${get('hour')}:${get('minute')}`};}
export function historyHeaders(date,existingHeaders,timeZone=TIMEZONE){
  const p=dateParts(date,timeZone),sameDay=existingHeaders.some((h,i)=>i%4===0&&h.startsWith(p.date));const prefix=sameDay?`${p.date} ${p.time}`:p.date;
  return [`${prefix}成本`,`${prefix}建议售价`,`${prefix}库存`,`${prefix}附加信息`];
}
