import {columnLabel} from '../../shared/reconstruct.mjs';
import {INVENTORY_SHEET,MAPPING_SHEET,INVENTORY_HEADERS,MAPPING_HEADERS,TARGET_TITLE} from '../config.mjs';
import {coreText} from '../../shared/text.mjs';
import {stableHash} from '../core/files.mjs';
import {AppError} from '../core/errors.mjs';
const quote=title=>`'${title.replaceAll("'","''")}'`;
export const trimMatrix=values=>{
  const rows=(values||[]).map(row=>{const out=(row||[]).map(coreText);while(out.length&&!out.at(-1))out.pop();return out;});
  while(rows.length&&!rows.at(-1).length)rows.pop();return rows;
};
export async function readWorkbook(client,spreadsheetId){
  const metadata=await client.metadata(spreadsheetId);if(metadata.spreadsheetId!==spreadsheetId||metadata.properties?.title!==TARGET_TITLE)throw new AppError(`目标表格不是“${TARGET_TITLE}”`,{stage:'读取Google数据',code:'WRONG_SPREADSHEET'});
  const one=title=>{const found=metadata.sheets.filter(s=>s.properties?.title===title);if(found.length!==1)throw new AppError(`${title}不存在或名称重复`,{stage:'读取Google数据',code:'MANAGED_SHEET_INVALID'});return found[0];};
  const inventorySheet=one(INVENTORY_SHEET),mappingSheet=one(MAPPING_SHEET);for(const sheet of [inventorySheet,mappingSheet])if(sheet.properties.sheetType!=='GRID')throw new Error(`${sheet.properties.title}不是普通工作表`);
  const end=columnLabel(Math.max(6,inventorySheet.properties.gridProperties.columnCount));
  const ranges=[`${quote(INVENTORY_SHEET)}!A1:${end}${inventorySheet.properties.gridProperties.rowCount}`,`${quote(MAPPING_SHEET)}!A1:E${mappingSheet.properties.gridProperties.rowCount}`];
  const values=await client.batchGet(spreadsheetId,ranges),inventory=trimMatrix(values[0]?.values||[]),mapping=trimMatrix(values[1]?.values||[]);
  return {metadata,inventorySheet,mappingSheet,inventory,mapping,fingerprint:workbookFingerprint(metadata,inventory,mapping)};
}
export function workbookFingerprint(metadata,inventory,mapping){return stableHash({sheets:metadata.sheets.map(s=>s.properties),inventory:trimMatrix(inventory),mapping:trimMatrix(mapping)});}
export function ensureHeaders(workbook){
  if(INVENTORY_HEADERS.some((h,i)=>coreText(workbook.inventory[0]?.[i])!==h))throw new AppError('库存情况表头不一致',{stage:'读取Google数据',code:'INVENTORY_HEADER_INVALID'});
  if(MAPPING_HEADERS.some((h,i)=>coreText(workbook.mapping[0]?.[i])!==h))throw new AppError('商品映射表头不一致',{stage:'读取Google数据',code:'MAPPING_HEADER_INVALID'});return workbook;
}
export function sameManagedValues(workbook,inventory,mapping){return JSON.stringify(trimMatrix(workbook.inventory))===JSON.stringify(trimMatrix(inventory))&&JSON.stringify(trimMatrix(workbook.mapping))===JSON.stringify(trimMatrix(mapping));}
