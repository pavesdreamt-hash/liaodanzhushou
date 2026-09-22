import {readFile} from 'node:fs/promises';
import {sourceRecords,validateCollection,makeSourceSnapshot} from '../src/source/quality.mjs';
export const metadata=()=>({spreadsheetId:'1VMkplU-fcuF2-2BimrduNpmgCKJiUeNoMduGlqxHC4c',properties:{title:'商品库存'},sheets:[
  {properties:{sheetId:1,title:'工作表1',sheetType:'GRID',index:0,gridProperties:{rowCount:50,columnCount:10}}},
  {properties:{sheetId:2,title:'库存情况',sheetType:'GRID',index:1,gridProperties:{rowCount:300,columnCount:20}}},
  {properties:{sheetId:3,title:'商品映射',sheetType:'GRID',index:2,gridProperties:{rowCount:300,columnCount:5}}}
]});
export async function oldEvidence(){
  const file=new URL('./fixtures/inventory-collection.json',import.meta.url),value=JSON.parse(await readFile(file,'utf8'));
  value.manifest={...value.manifest,endpointVerified:true,scrollSteps:value.manifest.scrolls.length,sampleChecks:Array.from({length:20},(_,i)=>({row:2+Math.round(i*187/19),passed:true}))};
  const quality=validateCollection(value);return {collection:value,quality,snapshot:makeSourceSnapshot(value,quality,{capturedAt:'2026-08-27T10:29:54.794Z'}),records:sourceRecords(value.result)};
}
export const inventoryHeaders=['商品编号','来源商品名称','成本变化','建议售价变化','库存变化','附加信息变化'];
export const mappingHeaders=['商品编号','来源匹配标识','来源商品名称','状态','备注'];
