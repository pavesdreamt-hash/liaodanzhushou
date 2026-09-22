import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {canonicalField,canonicalGroup,normalizeHeader,sourceDate} from './shopplus-fields.mjs';
import {shopPlusExtension} from './shopplus-file.mjs';

export const DEFAULT_EXCEL_LIMITS=Object.freeze({maxFileBytes:50*1024*1024,maxRows:100000,maxColumns:300,maxSheets:20});
const DISPLAY_TEXT_FIELDS=new Set(['order.orderNo','order.orderSequence','order.subOrderId','product.skuId','product.spuId','product.spuCode','product.productSku']);

async function sha256(filePath){return await new Promise((resolve,reject)=>{const hash=createHash('sha256'),stream=createReadStream(filePath);stream.on('error',reject);stream.on('data',chunk=>hash.update(chunk));stream.on('end',()=>resolve(hash.digest('hex')));});}
function displayed(cell){
  const value=cell?.value;if(value===null||value===undefined)return '';
  if(typeof value==='object'&&'formula' in value)return value.result??'';
  if(typeof value==='object'&&Array.isArray(value.richText))return value.richText.map(part=>part.text||'').join('');
  if(typeof value==='object'&&value.text!==undefined)return value.text;
  return cell.text??String(value);
}
function sourceValue(cell,warnings,row,column){
  const value=cell?.value;if(value&&typeof value==='object'&&'formula' in value){warnings.push({code:'FORMULA_CACHED_VALUE',row,column});return value.result??null;}
  if(value&&typeof value==='object'&&Array.isArray(value.richText))return value.richText.map(part=>part.text||'').join('');
  if(value&&typeof value==='object'&&value.text!==undefined)return value.text;
  if(value instanceof Date||typeof value==='number')return value;
  return displayed(cell);
}
function textValue(cell,warnings,row,column){const value=sourceValue(cell,warnings,row,column);if(value===null||value===undefined)return '';if(value instanceof Date)return value;return typeof value==='number'?(cell.text||String(value)):String(value);}

async function sheetJsWorkbook(filePath,extension){
  let source;
  try{source=XLSX.read(await readFile(filePath),{type:'buffer',cellDates:true,cellFormula:true,cellNF:true,cellText:true,dense:false});}
  catch(error){const label=extension.slice(1).toUpperCase();throw Object.assign(new Error(`ShopPlus ${label}无法读取：${error.message}`),{code:extension==='.xls'?'SHOPPLUS_XLS_INVALID':'SHOPPLUS_CSV_INVALID'});}
  const worksheets=source.SheetNames.map(name=>{const sheet=source.Sheets[name],range=sheet?.['!ref']?XLSX.utils.decode_range(sheet['!ref']):{s:{r:0,c:0},e:{r:-1,c:-1}},rowCount=Math.max(0,range.e.r+1),columnCount=Math.max(0,range.e.c+1);return {
    name,rowCount,actualRowCount:rowCount,columnCount,
    getRow:()=>({cellCount:columnCount}),
    getCell:(row,column)=>{const cell=sheet?.[XLSX.utils.encode_cell({r:row-1,c:column-1})];if(!cell)return {value:null,text:''};const raw=cell.f?{formula:cell.f,result:cell.v??null}:cell.v??null,text=cell.w??(cell.v instanceof Date?cell.v.toISOString():String(cell.v??''));return {value:raw,text:String(text)};}
  };});
  return {worksheets,properties:{date1904:Boolean(source.Workbook?.WBProps?.date1904)}};
}

function twoRowHeadersFor(worksheet){
  const columnCount=Math.max(worksheet.columnCount,worksheet.getRow(1).cellCount,worksheet.getRow(2).cellCount),headers=[];let lastGroup=null;
  for(let column=1;column<=columnCount;column++){
    const groupCell=worksheet.getCell(1,column),fieldCell=worksheet.getCell(2,column),fieldLabel=displayed(fieldCell),explicitGroup=canonicalGroup(displayed(groupCell)),inheritedGroup=explicitGroup||lastGroup,group=!inheritedGroup&&normalizeHeader(fieldLabel)==='站点id'?'order':inheritedGroup;if(explicitGroup)lastGroup=group;
    const field=canonicalField(group,fieldLabel);if(group&&field)headers.push({column,group,field,label:fieldLabel});
  }
  return {headers,columnCount,dataStartRow:3};
}
function hasRequiredHeaders(headers){const set=new Set(headers.map(value=>`${value.group}.${value.field}`));return set.has('order.orderNo')&&set.has('product.productName')&&set.has('product.quantity');}
function flatHeadersFor(worksheet){
  const groups=['order','shipping','product','logistics','billing'],columnCount=Math.max(worksheet.columnCount,worksheet.getRow(1).cellCount),headers=[];let currentGroup=null,seenShipping=false;
  for(let column=1;column<=columnCount;column++){
    const label=displayed(worksheet.getCell(1,column));if(!normalizeHeader(label))continue;
    const explicitGroup=canonicalGroup(label),unprefixed=String(label).replace(/^(?:订单信息基础信息|订单基础信息|订单信息|收货信息|配送信息|商品信息|物流信息|账单信息)[\s:：|/\\>_-]*/,'');
    let match=explicitGroup?[{group:explicitGroup,field:canonicalField(explicitGroup,unprefixed)}].filter(value=>value.field):[];
    if(!match.length)match=groups.map(group=>({group,field:canonicalField(group,label)})).filter(value=>value.field);
    if(match.length>1&&match.every(value=>value.group==='shipping'||value.group==='billing')){
      const group=seenShipping&&currentGroup!=='shipping'?'billing':'shipping';match=[match.find(value=>value.group===group)];
    }
    if(match.length!==1)continue;const [{group,field}]=match;headers.push({column,group,field,label});currentGroup=group;if(group==='shipping')seenShipping=true;
  }
  return {headers,columnCount,dataStartRow:2};
}
function headersFor(worksheet){const layered=twoRowHeadersFor(worksheet);return hasRequiredHeaders(layered.headers)?layered:flatHeadersFor(worksheet);}

export async function readShopPlusWorkbook(filePath,{limits=DEFAULT_EXCEL_LIMITS}={}){
  const extension=shopPlusExtension(filePath),info=await stat(filePath);if(!info.isFile())throw Object.assign(new Error('路径不是文件'),{code:'SHOPPLUS_FILE_INVALID'});if(info.size>limits.maxFileBytes)throw Object.assign(new Error(`订单文件超过${limits.maxFileBytes}字节限制`),{code:'SHOPPLUS_FILE_TOO_LARGE'});
  let workbook;if(extension==='.xlsx'){workbook=new ExcelJS.Workbook();workbook.calcProperties.fullCalcOnLoad=false;workbook.calcProperties.forceFullCalc=false;try{await workbook.xlsx.readFile(filePath,{ignoreNodes:['dataValidations','extLst','picture','drawing','legacyDrawing','legacyDrawingHF','headerFooter']});}catch(error){throw Object.assign(new Error(`ShopPlus XLSX无法读取：${error.message}`),{code:'SHOPPLUS_XLSX_INVALID'});}}else workbook=await sheetJsWorkbook(filePath,extension);
  if(workbook.worksheets.length>limits.maxSheets)throw Object.assign(new Error('文件工作表数量超过限制'),{code:'SHOPPLUS_SHEET_LIMIT'});
  let selected=null,headerInfo=null;for(const worksheet of workbook.worksheets){const info=headersFor(worksheet);if(hasRequiredHeaders(info.headers)){selected=worksheet;headerInfo=info;break;}}
  if(!selected)throw Object.assign(new Error('未找到ShopPlus订单表头'),{code:'SHOPPLUS_HEADERS_NOT_FOUND'});if(headerInfo.columnCount>limits.maxColumns)throw Object.assign(new Error('文件列数超过限制'),{code:'SHOPPLUS_COLUMN_LIMIT'});
  const lastRow=selected.actualRowCount||selected.rowCount,dataRowCount=Math.max(0,lastRow-headerInfo.dataStartRow+1);if(dataRowCount>limits.maxRows)throw Object.assign(new Error('文件数据行数超过限制'),{code:'SHOPPLUS_ROW_LIMIT'});
  const warnings=[],rows=[];let previousOrderNo='';
  for(let rowNumber=headerInfo.dataStartRow;rowNumber<=lastRow;rowNumber++){
    const record={sourceRow:rowNumber,order:{},shipping:{},billing:{},product:{},logistics:{}};
    for(const header of headerInfo.headers){const cell=selected.getCell(rowNumber,header.column),displayText=header.group==='shipping'||header.group==='billing'||DISPLAY_TEXT_FIELDS.has(`${header.group}.${header.field}`),raw=displayText?textValue(cell,warnings,rowNumber,header.column):sourceValue(cell,warnings,rowNumber,header.column);record[header.group][header.field]=raw;}
    const productName=String(record.product.productName??'').trim(),subOrder=String(record.order.subOrderId??'').trim();let orderNo=String(record.order.orderNo??'').trim();
    if(!orderNo&&(productName||subOrder)&&previousOrderNo){orderNo=previousOrderNo;record.order.orderNo=orderNo;warnings.push({code:'ORDER_NUMBER_INHERITED',row:rowNumber});}
    if(orderNo)previousOrderNo=orderNo;if(!orderNo&&!productName&&!subOrder)continue;
    for(const field of ['createdAt','paidAt','shippedAt','cancelledAt']){const parsed=sourceDate(record.order[field],{date1904:Boolean(workbook.properties.date1904)});record.order[field]=parsed.value;if(parsed.warning)warnings.push({code:parsed.warning,row:rowNumber,field});}
    // Contact and address fields are always read as displayed text so leading
    // zeroes and plus signs survive when the workbook stores them as text.
    for(const group of ['shipping','billing'])for(const [field,value] of Object.entries(record[group]))record[group][field]=value instanceof Date?value.toISOString():textValue({value,text:String(value??'')},warnings,rowNumber,field);
    rows.push(record);
  }
  return {filePath,filename:path.basename(filePath),fileSha256:await sha256(filePath),sheetName:selected.name,totalRows:dataRowCount,rows,warnings,headers:headerInfo.headers.map(({group,field,column})=>({group,field,column}))};
}

export async function hashShopPlusFile(filePath){return await sha256(filePath);}
