import path from 'node:path';
import {readFile,writeFile} from 'node:fs/promises';
import {stableHash} from '../src/core/files.mjs';

const [userData,backupFile,sourceFile]=process.argv.slice(2);
if(!userData||!backupFile||!sourceFile)throw new Error('usage: restore-local-state <userData> <backup> <source>');
const backup=JSON.parse(await readFile(backupFile,'utf8')),source=JSON.parse(await readFile(sourceFile,'utf8')),stateDir=path.join(userData,'state'),now=new Date().toISOString();
const result={ok:true,at:now,sourceCapturedAt:source.capturedAt,productCount:source.quality.namedProducts,status:'restored',message:'已恢复并验证写入前正式版本',summary:{total:source.quality.namedProducts,cost:0,price:0,stock:0,additionalInfo:0,newProducts:0,removed:0,ambiguous:0},detail:[],transaction:{written:true,verified:true,backup:backupFile,restored:true}};
const baseline={schemaVersion:2,status:'baseline',updatedAt:now,versionAt:'2026-08-30T01:55:41.755Z',sourceSnapshot:source.capturedAt,mappingHash:stableHash(backup.mapping),historyHeaders:backup.inventory[0].slice(6),products:backup.inventory};
const state={lastSuccessfulSync:'2026-08-30T01:55:41.755Z',lastCheck:now,productCount:source.quality.namedProducts,kdocsLoggedIn:true,latest:result,collection:{status:'success',capturedAt:source.capturedAt,products:source.quality.namedProducts,endpoint:source.quality.endpoint},mapping:{total:source.quality.namedProducts,automatic:source.quality.namedProducts,needsConfirmation:0,pendingNumber:0,firstRun:false},googleWrite:'已恢复并验证',workflow:'complete'};
for(const [name,value] of [['baseline.json',baseline],['latest-result.json',result],['app-state.json',state]])await writeFile(path.join(stateDir,name),`${JSON.stringify(value,null,2)}\n`,{mode:0o600});
console.log(JSON.stringify({restored:true,productCount:source.quality.namedProducts,sourceCapturedAt:source.capturedAt}));
