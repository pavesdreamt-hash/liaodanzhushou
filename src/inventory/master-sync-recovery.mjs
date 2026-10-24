import path from 'node:path';
import {readJSON,writeJSON,stableHash} from '../core/files.mjs';

const file=(directory,id)=>path.join(directory,'sync-recovery',stableHash(String(id))+'.json');
export async function readMasterRecovery(directory,id){
 if(!id)return null;
 const state=await readJSON(file(directory,id));
 if(state&&(state.remoteProductId!==String(id)||typeof state.pending!=='boolean'))throw Error('同步核对记录无效，请保留原文件并检查');
 return state;
}
export async function writeMasterRecovery(directory,id,state){
 await writeJSON(file(directory,id),{...state,remoteProductId:String(id),updatedAt:new Date().toISOString()});
}
export const masterRecoveryReason='上次网站同步尚未核对，请先点击“刷新读取”，核对最新资料后重新选择字段。';
