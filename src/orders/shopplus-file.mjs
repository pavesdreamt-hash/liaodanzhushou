import path from 'node:path';

export const SHOPPLUS_EXTENSIONS=Object.freeze(['.xlsx','.xls','.csv']);
export const SHOPPLUS_FILE_FILTER_EXTENSIONS=Object.freeze(SHOPPLUS_EXTENSIONS.map(value=>value.slice(1)));

function invalid(message,code='SHOPPLUS_FILE_TYPE_UNSUPPORTED'){
  return Object.assign(new Error(message),{code,stage:'订单导入'});
}

export function shopPlusExtension(filename){
  const extension=path.extname(String(filename??'')).toLowerCase();
  if(!SHOPPLUS_EXTENSIONS.includes(extension))throw invalid('只允许选择 .xlsx、.xls 或 .csv 文件');
  return extension;
}

function startsWith(content,signature){
  return content.length>=signature.length&&signature.every((value,index)=>content[index]===value);
}

export function validateShopPlusUpload(filename,content){
  const extension=shopPlusExtension(filename);
  if(!Buffer.isBuffer(content)||content.length===0)throw invalid('ShopPlus订单文件为空或无法读取','SHOPPLUS_FILE_INVALID');
  if(extension==='.xlsx'&&!startsWith(content,[0x50,0x4b]))throw invalid('ShopPlus .xlsx 文件格式无效','SHOPPLUS_XLSX_INVALID');
  if(extension==='.xls'){
    const compound=startsWith(content,[0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1]);
    const biff=content[0]===0x09&&[0x00,0x02,0x04,0x08].includes(content[1]);
    const prefix=content.subarray(0,1024).toString('utf8').replace(/^\uFEFF/,'').trimStart();
    const xmlSpreadsheet=prefix.startsWith('<?xml')&&/Workbook/i.test(prefix);
    if(!compound&&!biff&&!xmlSpreadsheet)throw invalid('ShopPlus .xls 文件格式无效','SHOPPLUS_XLS_INVALID');
  }
  if(extension==='.csv'){
    const sample=content.subarray(0,4096),utf16=startsWith(sample,[0xff,0xfe])||startsWith(sample,[0xfe,0xff]);
    if(!utf16&&sample.includes(0))throw invalid('ShopPlus .csv 必须是文本格式','SHOPPLUS_CSV_INVALID');
  }
  return extension;
}
