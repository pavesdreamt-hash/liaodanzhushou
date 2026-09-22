import {readFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {moneyToFils} from './profit-calculation.mjs';

const text=value=>String(value??'').normalize('NFKC').replace(/\s+/g,' ').trim();
const code=value=>text(value).toUpperCase();
const safeFils=value=>{const amount=BigInt(value);if(amount<0n||amount>BigInt(Number.MAX_SAFE_INTEGER))throw new RangeError('成本超出安全范围');return Number(amount);};
export function parseInventoryCost(value){
  if(value===null||value===undefined||text(value)==='')return {status:'missing',costFils:null,rawText:value===null||value===undefined?'':String(value),note:null,annotated:false,notSoldSeparately:false};
  const rawText=String(value),match=rawText.trim().match(/^(\d+(?:\.\d{1,2})?)\s*(?:\(([^()]*)\)|（([^（）]*)）)?$/u);
  if(!match)return {status:'ambiguous',costFils:null,rawText,note:null,annotated:false,notSoldSeparately:false};
  const note=(match[2]??match[3]??'').trim()||null;
  try{return {status:note?'annotated':'valid',costFils:safeFils(moneyToFils(match[1])),rawText,note,annotated:Boolean(note),notSoldSeparately:Boolean(note?.includes('不单卖'))};}
  catch{return {status:'ambiguous',costFils:null,rawText,note:null,annotated:false,notSoldSeparately:false};}
}

export function createCostCatalog(entries=[]){
  const byCode=new Map(),byName=new Map(),conflicts=new Set(),warnings=[];
  for(const entry of entries){const businessId=code(entry.businessId),hasFils=entry.costFils!==undefined&&entry.costFils!==null;let parsed;if(hasFils){try{parsed={status:'valid',costFils:safeFils(entry.costFils),rawText:String(entry.costFils),note:null,annotated:false,notSoldSeparately:false};}catch{parsed={status:'ambiguous',costFils:null,rawText:String(entry.costFils),note:null,annotated:false,notSoldSeparately:false};}}else parsed=parseInventoryCost(entry.cost);const record={businessId:entry.businessId,sourceName:entry.sourceName||'',sourceKey:entry.sourceKey||'',costFils:parsed.costFils,costSource:entry.costSource||'inventory_baseline',costRawText:parsed.rawText,costNote:parsed.note,annotatedCost:parsed.annotated,notSoldSeparately:parsed.notSoldSeparately,costStatus:parsed.status};if(parsed.status==='annotated')warnings.push({code:'annotated_cost',businessCode:entry.businessId});else if(parsed.status==='ambiguous')warnings.push({code:'COST_FORMAT_AMBIGUOUS',businessCode:entry.businessId});if(businessId){if(byCode.has(businessId))conflicts.add(businessId);else byCode.set(businessId,record);}const name=text(entry.sourceName).toLocaleLowerCase('zh-CN');if(name){if(byName.has(name))byName.set(name,null);else byName.set(name,record);}}
  const result=found=>found.costFils===null?{status:'missing_cost',businessCode:found.businessId,costFils:null,costSource:found.costSource,costRawText:found.costRawText,costNote:found.costNote,annotatedCost:found.annotatedCost,notSoldSeparately:found.notSoldSeparately,costStatus:found.costStatus}:{status:'matched',businessCode:found.businessId,costFils:found.costFils,costSource:found.costSource,costRawText:found.costRawText,costNote:found.costNote,annotatedCost:found.annotatedCost,notSoldSeparately:found.notSoldSeparately,costStatus:found.costStatus};
  return {list:()=>[...byCode.values()].map(row=>({businessId:row.businessId,costFils:conflicts.has(code(row.businessId))?null:row.costFils})),resolve({candidates=[],productName=''}){for(const candidate of candidates){const key=code(candidate.value);if(conflicts.has(key))return {status:'conflict',businessCode:candidate.value,costFils:null,costSource:null,costRawText:null,costNote:null,annotatedCost:false,notSoldSeparately:false,costStatus:'conflict'};const found=byCode.get(key);if(found)return result(found);}
    const exact=byName.get(text(productName).toLocaleLowerCase('zh-CN'));if(exact)return result(exact);return {status:'not_found',businessCode:candidates[0]?.value||null,costFils:null,costSource:null,costRawText:null,costNote:null,annotatedCost:false,notSoldSeparately:false,costStatus:'not_found'};},conflicts:[...conflicts],warnings};
}

export async function loadLocalCostCatalog(userDataPath=path.join(os.homedir(),'Library','Application Support','KDocs Order Assistant')){
  const stateDir=path.join(userDataPath,'state'),baselinePath=path.join(stateDir,'baseline.json');let baseline=null;
  try{baseline=JSON.parse(await readFile(baselinePath,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
  if(baseline?.products?.length){const rows=baseline.products,header=rows[0]||[],idIndex=header.indexOf('商品编号'),nameIndex=header.indexOf('来源商品名称'),costIndex=header.findIndex(value=>String(value).includes('成本')&&value!=='成本变化');if(idIndex>=0&&costIndex>=0)return createCostCatalog(rows.slice(1).filter(row=>text(row[idIndex])).map(row=>({businessId:row[idIndex],sourceName:row[nameIndex],cost:row[costIndex],costSource:`baseline:${baseline.versionAt||baseline.updatedAt||'unknown'}`})));
  }
  // A source snapshot alone has no confirmed business IDs. Do not guess IDs.
  return createCostCatalog([]);
}
