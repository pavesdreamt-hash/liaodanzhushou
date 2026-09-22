import path from 'node:path';
import {copyFile,mkdir,readFile} from 'node:fs/promises';
import {buildFirstInventoryBaseline} from '../src/sync/baseline.mjs';
import {stableHash,writeJSON} from '../src/core/files.mjs';

const args=process.argv.slice(2),skipMissingMappings=args.includes('--skip-missing'),files=args.filter(value=>value!=='--skip-missing');
const [mappingFile,sourceFile,previousSourceFile,applicationSupportRoot]=files;
if(!mappingFile||!sourceFile||!applicationSupportRoot)throw new Error('usage: mapping source [previous-source] application-support-root');

const read=async file=>JSON.parse(await readFile(file,'utf8'));
const mapping=await read(mappingFile),sourceSnapshot=await read(sourceFile),previousSourceSnapshot=previousSourceFile?await read(previousSourceFile):null;
const baseline=buildFirstInventoryBaseline({mappingValues:mapping.values,sourceSnapshot,previousSourceSnapshot,now:new Date(),skipMissingMappings});
const stateDir=path.join(applicationSupportRoot,'state'),backupDir=path.join(applicationSupportRoot,'backups'),stateFile=path.join(stateDir,'baseline.json');
await Promise.all([mkdir(stateDir,{recursive:true}),mkdir(backupDir,{recursive:true})]);

const compactTimestamp=baseline.createdAt.replace(/[-:]/g,'').replace('T','_').replace(/\..+$/,'');
const backupFile=path.join(backupDir,`baseline_state_before_reset_${compactTimestamp}.json`);
try{await copyFile(stateFile,backupFile);}catch(error){if(error.code!=='ENOENT')throw error;}

const saved={
  schemaVersion:2,
  status:'baseline',
  createdAt:baseline.createdAt,
  updatedAt:baseline.createdAt,
  versionAt:baseline.createdAt,
  sourceSnapshot:baseline.sourceSnapshot,
  mappingHash:stableHash(mapping.values),
  historyHeaders:baseline.historyHeaders,
  counts:baseline.counts,
  ignoredMissingMappings:baseline.ignoredMissingMappings,
  records:baseline.products,
  products:baseline.values
};
await writeJSON(stateFile,saved);
process.stdout.write(JSON.stringify({stateFile,backupFile,counts:baseline.counts,historyHeaders:baseline.historyHeaders,rows:baseline.values.length-1}));
