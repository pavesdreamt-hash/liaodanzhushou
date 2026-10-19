import {stableHash} from '../core/files.mjs';
import {sameSourceIdentity} from '../sync/source-changes.mjs';
import {normalizedSourceName} from './source-key.mjs';
import {mappingValues} from './mapping.mjs';
const group=row=>stableHash({name:normalizedSourceName(row.sourceName),businessId:row.businessId||'',key:String(row.sourceKey||'').split('|REMOVED:')[0]});
export function archiveSourceRelation(document,row,{at,reason='来源已移除',successor=null}={}){
 const records=document.sourceRelationHistory??=[],key=group(row),old=records.find(r=>r.group===key&&!r.reappearedAt);
 if(old){if(successor){old.successor=successor;old.reason=reason;}return old;}
 const record={id:stableHash({key,at}),group:key,at,sourceAt:document.latestCollection?.capturedAt,row:{...row,status:'来源已移除'},reason,successor,cleared:false};records.push(record);return record;
}
export function retireMissingSourceRelations(document,pending,at){
 const snapshot=document.latestCollection;if(snapshot?.quality?.passed!==true||pending?.source?.capturedAt!==snapshot.capturedAt)return;
 const present=row=>(snapshot.products||[]).some(p=>sameSourceIdentity(p,row));
 for(const record of document.sourceRelationHistory||[])if(!record.reappearedAt&&present(record.row))record.reappearedAt=at;
 for(const row of pending.mappingState?.rows||[])if(row.status==='来源已移除'&&!present(row))archiveSourceRelation(document,row,{at});
 const saved=document.mappingRows||[];let changed=false;
 for(const row of saved)if(['正常','来源已移除'].includes(row.status)&&!present(row)){
  archiveSourceRelation(document,row,{at});if(row.status!=='来源已移除'){row.status='来源已移除';changed=true;}
 }
 if(changed){document.mapping=mappingValues(saved);if(document.current)document.current.mappingRows=saved;}
}
export function retiredSourceView(document){return (document.sourceRelationHistory||[]).filter(r=>!r.reappearedAt).map(r=>({...r,row:{...r.row},inactive:true}));}
