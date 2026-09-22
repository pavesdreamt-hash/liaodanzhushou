import path from 'node:path';
import {randomInt} from 'node:crypto';
import {writeJSON,timestampName} from '../core/files.mjs';
import {readWorkbook,ensureHeaders,sameManagedValues,trimMatrix} from './workbook.mjs';
import {validateSyncPlan} from '../sync/plan.mjs';
import {INVENTORY_HEADERS,MAPPING_STATUSES,TARGET_TITLE} from '../config.mjs';
import {AppError,appError} from '../core/errors.mjs';
const cell=value=>value===''?{}:{userEnteredValue:{stringValue:String(value)}};
function updateMatrix(sheetId,values,rowCount,columnCount){
  const rows=[];for(let r=0;r<rowCount;r++)rows.push({values:Array.from({length:columnCount},(_,c)=>cell(values[r]?.[c]||''))});
  return {updateCells:{start:{sheetId,rowIndex:0,columnIndex:0},rows,fields:'userEnteredValue'}};
}
function formatting(sheetId,historyStart,historyEnd){
  const requests=[
    {updateSheetProperties:{properties:{sheetId,gridProperties:{frozenRowCount:1}},fields:'gridProperties.frozenRowCount'}},
    {setBasicFilter:{filter:{range:{sheetId,startRowIndex:0,startColumnIndex:0,endColumnIndex:Math.max(6,historyEnd)}}}},
    {repeatCell:{range:{sheetId,startRowIndex:0,endRowIndex:1},cell:{userEnteredFormat:{textFormat:{bold:true}}},fields:'userEnteredFormat.textFormat.bold'}}
  ];
  for(const [startIndex,pixelSize] of [[0,100],[1,300],[2,100],[3,120],[4,120],[5,180]])requests.push({updateDimensionProperties:{range:{sheetId,dimension:'COLUMNS',startIndex,endIndex:startIndex+1},properties:{pixelSize},fields:'pixelSize'}});
  for(let start=historyStart;start<historyEnd;start+=4)for(const [offset,pixelSize] of [[0,100],[1,120],[2,100],[3,180]])requests.push({updateDimensionProperties:{range:{sheetId,dimension:'COLUMNS',startIndex:start+offset,endIndex:start+offset+1},properties:{pixelSize},fields:'pixelSize'}});
  return requests;
}
export function buildWriteRequests(plan,workbook){
  validateSyncPlan(plan);const inventoryId=workbook.inventorySheet.properties.sheetId,mappingId=workbook.mappingSheet.properties.sheetId,requests=[];
  if(plan.formalChanged){const columns=workbook.inventorySheet.properties.gridProperties.columnCount||0;
    if(columns<=6)requests.push({appendDimension:{sheetId:inventoryId,dimension:'COLUMNS',length:Math.max(4,10-columns)}});
    else requests.push({insertDimension:{range:{sheetId:inventoryId,dimension:'COLUMNS',startIndex:6,endIndex:10},inheritFromBefore:false}});}
  if(plan.formalChanged){const rows=Math.max(plan.inventoryBefore.length,plan.inventoryAfter.length),cols=Math.max(10,...plan.inventoryAfter.map(r=>r.length));requests.push(updateMatrix(inventoryId,plan.inventoryAfter,rows,cols),...formatting(inventoryId,6,10));}
  if(plan.mappingChanged){const rows=Math.max(plan.mappingBefore.length,plan.mappingAfter.length),cols=5;requests.push(updateMatrix(mappingId,plan.mappingAfter,rows,cols),
    {updateSheetProperties:{properties:{sheetId:mappingId,gridProperties:{frozenRowCount:1}},fields:'gridProperties.frozenRowCount'}},
    {setBasicFilter:{filter:{range:{sheetId:mappingId,startRowIndex:0,startColumnIndex:0,endColumnIndex:5}}}},
    {setDataValidation:{range:{sheetId:mappingId,startRowIndex:1,startColumnIndex:3,endColumnIndex:4},rule:{condition:{type:'ONE_OF_LIST',values:MAPPING_STATUSES.map(userEnteredValue=>({userEnteredValue}))},strict:true,showCustomUi:true}}});
  }
  validateRequests(requests,new Set([inventoryId,mappingId]));return requests;
}
export function validateRequests(requests,allowedSheetIds){
  const allowed=new Set(['appendDimension','insertDimension','updateCells','updateSheetProperties','setBasicFilter','repeatCell','updateDimensionProperties','setDataValidation','deleteDimension']);
  for(const request of requests){const keys=Object.keys(request);if(keys.length!==1||!allowed.has(keys[0]))throw new Error('Google写入计划含未允许操作');
    const text=JSON.stringify(request);const ids=[...text.matchAll(/"sheetId":(\d+)/g)].map(m=>Number(m[1]));if(!ids.length||ids.some(id=>!allowedSheetIds.has(id)))throw new Error('Google写入计划越过管理工作表');}
  return requests;
}
export async function executeTransaction({client,spreadsheetId,paths,plan,onProgress=()=>{}}){
  validateSyncPlan(plan);onProgress({stage:'Google写入',message:'正在重新读取并校验Google Sheet...'});
  const before=ensureHeaders(await readWorkbook(client,spreadsheetId));if(before.fingerprint!==plan.fingerprint)throw new AppError('Google Sheet在计划生成后发生变化，请重新同步',{stage:'Google写入',code:'GOOGLE_PREFLIGHT_CHANGED'});
  if(!plan.formalChanged&&!plan.mappingChanged)return {written:false,verified:true,backup:null};
  const backupFile=path.join(paths.backups,timestampName('google_before'));await writeJSON(backupFile,{schemaVersion:1,capturedAt:new Date().toISOString(),spreadsheetId,
    title:before.metadata.properties.title,sheets:before.metadata.sheets.map(s=>s.properties),inventory:before.inventory,mapping:before.mapping,fingerprint:before.fingerprint});
  const requests=buildWriteRequests(plan,before);onProgress({stage:'Google写入',message:'正在批量写入Google Sheets...'});let writeError;
  try{await client.batchUpdate(spreadsheetId,requests);}catch(error){writeError=error;}
  onProgress({stage:'Google回读验证',message:'正在回读并逐项验证...'});let after;
  try{after=ensureHeaders(await readWorkbook(client,spreadsheetId));
    if(!sameManagedValues(after,plan.inventoryAfter,plan.mappingAfter))throw new AppError('Google回读结果与同步计划不一致',{stage:'Google回读验证',code:'GOOGLE_VERIFY_MISMATCH'});
    const beforeOther=before.metadata.sheets.filter(s=>![before.inventorySheet.properties.sheetId,before.mappingSheet.properties.sheetId].includes(s.properties.sheetId)).map(s=>s.properties);
    const afterOther=after.metadata.sheets.filter(s=>![after.inventorySheet.properties.sheetId,after.mappingSheet.properties.sheetId].includes(s.properties.sheetId)).map(s=>s.properties);
    if(JSON.stringify(beforeOther)!==JSON.stringify(afterOther))throw new AppError('非管理工作表结构发生变化',{stage:'Google回读验证',code:'OTHER_SHEET_CHANGED'});
    return {written:true,verified:true,backup:backupFile,requestCount:requests.length,recoveredFromLostResponse:Boolean(writeError)};
  }catch(verifyError){
    // spreadsheets.batchUpdate is atomic. If the result is neither the exact
    // before-state nor our exact plan, another editor may have changed data.
    // Never overwrite that external change with an automatic rollback.
    after||=await readWorkbook(client,spreadsheetId).then(ensureHeaders).catch(()=>null);
    if(after&&sameManagedValues(after,before.inventory,before.mapping))throw appError(writeError||verifyError,writeError?.stage||verifyError.stage||'Google写入','GOOGLE_TRANSACTION_FAILED');
    if(after)throw new AppError(`Google回读结果不确定，已停止自动恢复以保护他人修改。写入前备份：${backupFile}`,{stage:'Google回读验证',code:'GOOGLE_EXTERNAL_CHANGE_GUARD'});
    throw appError(writeError||verifyError,writeError?.stage||verifyError.stage||'Google写入','GOOGLE_TRANSACTION_FAILED');
  }
}
export async function runWriteProbe({client,spreadsheetId,paths,onProgress=()=>{}}){
  const before=await client.metadata(spreadsheetId);if(before.properties?.title!==TARGET_TITLE)throw new Error('目标Spreadsheet标题不正确');
  const original=before.sheets.map(s=>[s.properties.sheetId,s.properties.title]),title=`__KDOCS_WRITE_TEST__${Date.now()}`,used=new Set(original.map(x=>x[0]));let sheetId=randomInt(10_000_000,2_000_000_000);while(used.has(sheetId))sheetId=randomInt(10_000_000,2_000_000_000);
  let created=false;try{
    onProgress({stage:'Google测试',message:'正在创建临时测试Sheet...'});await client.batchUpdate(spreadsheetId,[{addSheet:{properties:{sheetId,title,gridProperties:{rowCount:5,columnCount:3}}}}]);created=true;
    const values=[['KDocs Inventory Sync','WRITE_TEST_OK'],['创建',new Date().toISOString()]];await client.valuesUpdate(spreadsheetId,`'${title}'!A1:B2`,values);
    if(JSON.stringify(await client.valuesGet(spreadsheetId,`'${title}'!A1:B2`))!==JSON.stringify(values))throw new Error('临时Sheet首次回读不一致');
    values[1][0]='更新';await client.valuesUpdate(spreadsheetId,`'${title}'!A1:B2`,values);
    if(JSON.stringify(await client.valuesGet(spreadsheetId,`'${title}'!A1:B2`))!==JSON.stringify(values))throw new Error('临时Sheet更新回读不一致');
    await client.batchUpdate(spreadsheetId,[{deleteSheet:{sheetId}}]);created=false;const after=await client.metadata(spreadsheetId),current=after.sheets.map(s=>[s.properties.sheetId,s.properties.title]);
    if(JSON.stringify(current)!==JSON.stringify(original))throw new Error('临时Sheet删除后原工作表列表不一致');
    const result={schemaVersion:1,spreadsheetId,passed:true,verifiedAt:new Date().toISOString(),checks:['create','write','readback','update','readback','delete','metadata']};
    await writeJSON(path.join(paths.state,'google-write-probe.json'),result);return result;
  }finally{if(created)await client.batchUpdate(spreadsheetId,[{deleteSheet:{sheetId}}]).catch(()=>{});}
}
