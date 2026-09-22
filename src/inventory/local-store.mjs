import path from 'node:path';
import {unlink} from 'node:fs/promises';
import {readJSON,writeJSON,listJSON} from '../core/files.mjs';
import {INVENTORY_HEADERS,MAPPING_HEADERS} from '../config.mjs';
import {parseInventory} from '../sync/history.mjs';

export const LOCAL_HISTORY_MAX_VERSIONS=100;
export const LOCAL_HISTORY_MAX_AGE_DAYS=180;
const nowIso=()=>new Date().toISOString();
const ageLimit=()=>Date.now()-LOCAL_HISTORY_MAX_AGE_DAYS*24*60*60*1000;
const blankDocument=()=>({schemaVersion:1,updatedAt:null,latestCollection:null,current:null,inventory:[INVENTORY_HEADERS],mapping:[MAPPING_HEADERS],history:[]});
const compactInventory=values=>{
  const rows=Array.isArray(values)?values:[],sourceHeader=rows[0]||INVENTORY_HEADERS,historyHeader=sourceHeader.slice(6).filter(Boolean).slice(0,4);
  const header=[...INVENTORY_HEADERS,...historyHeader];
  return [header,...rows.slice(1).filter(row=>row?.some(Boolean)).map(row=>[...row.slice(0,6),...row.slice(6,10)])];
};
const currentProducts=(inventoryValues,mappingRows=[])=>{const sourceRows=new Map((mappingRows||[]).filter(row=>row?.businessId).map(row=>[row.businessId,row.sourceRow||null]));return parseInventory(inventoryValues).rows.map(row=>({businessId:row.businessId||'',sourceName:row.sourceName||'',cost:row.latest?.cost||'',suggestedPrice:row.latest?.suggestedPrice||'',stock:row.latest?.stock||'',additionalInfo:row.latest?.additionalInfo||'',sourceRow:sourceRows.get(row.businessId)||null,removed:row.latest?.stock==='来源已移除'}));};

export class LocalInventoryStore{
  constructor(paths){this.paths=paths;this.file=path.join(paths.state,'local-inventory.json');}
  async read(){const value=await readJSON(this.file,null);return value?.schemaVersion===1?{...blankDocument(),...value}:blankDocument();}
  async workbook(){
    const document=await this.read();
    return {metadata:{spreadsheetId:'local-inventory',properties:{title:'本地商品库存'},sheets:[
      {properties:{sheetId:1,title:'库存情况',sheetType:'GRID',gridProperties:{rowCount:Math.max(100,document.inventory.length),columnCount:Math.max(10,document.inventory[0]?.length||10)}}},
      {properties:{sheetId:2,title:'商品映射',sheetType:'GRID',gridProperties:{rowCount:Math.max(100,document.mapping.length),columnCount:5}}}
    ]},inventory:document.inventory,mapping:document.mapping,fingerprint:'local'};
  }
  async recordCollection(snapshot){
    const document=await this.read();document.updatedAt=nowIso();document.latestCollection={capturedAt:snapshot.capturedAt,sourceUrl:snapshot.sourceUrl,sheet:snapshot.sheet,range:snapshot.range,quality:snapshot.quality,products:snapshot.products||[]};await writeJSON(this.file,document);await this.pruneSourceSnapshots();return this.view(document);
  }
  async commit({source,mappingState,plan}){
    const document=await this.read(),savedAt=nowIso();
    const entry=plan.formalChanged?{versionId:`${savedAt}_${source.capturedAt}`,capturedAt:source.capturedAt,savedAt,productCount:source.quality?.namedProducts||source.products?.length||0,summary:plan.summary,detail:plan.detail||[]}:null;
    const history=entry?[entry,...(document.history||[])]:document.history||[];
    const current={capturedAt:source.capturedAt,savedAt,products:currentProducts(plan.inventoryAfter,mappingState?.rows),mappingRows:(mappingState?.rows||[]).map(row=>({...row}))};
    const next={...document,schemaVersion:1,updatedAt:savedAt,current,inventory:compactInventory(plan.inventoryAfter),mapping:plan.mappingAfter||document.mapping,mappingRows:current.mappingRows,history:this.trimHistory(history)};
    await writeJSON(this.file,next);await this.pruneSourceSnapshots();return this.view(next);
  }
  trimHistory(history){const cutoff=ageLimit();return (history||[]).filter(entry=>Date.parse(entry.savedAt||entry.capturedAt||0)>=cutoff).slice(0,LOCAL_HISTORY_MAX_VERSIONS);}
  async pruneSourceSnapshots(){const names=await listJSON(this.paths.snapshots,'source_'),keep=[];for(const name of names){const value=await readJSON(path.join(this.paths.snapshots,name),null);const captured=Date.parse(value?.capturedAt||0);if(captured>=ageLimit())keep.push(name);}const byNewest=new Set(keep.slice(-LOCAL_HISTORY_MAX_VERSIONS));for(const name of names)if(!byNewest.has(name))await unlink(path.join(this.paths.snapshots,name)).catch(()=>{});}
  view(document){const value=document||{};return {schemaVersion:1,updatedAt:value.updatedAt,latestCollection:value.latestCollection,current:value.current,history:value.history||[],retention:{maxVersions:LOCAL_HISTORY_MAX_VERSIONS,maxAgeDays:LOCAL_HISTORY_MAX_AGE_DAYS,historyCount:(value.history||[]).length}};}
  async getView(){return this.view(await this.read());}
}
