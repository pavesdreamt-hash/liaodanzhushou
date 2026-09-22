import path from 'node:path';
import {readJSON,writeJSON} from '../src/core/files.mjs';

const [applicationSupportRoot,sourceFile]=process.argv.slice(2);
if(!applicationSupportRoot||!sourceFile)throw new Error('usage: application-support-root source-snapshot');
const stateDir=path.join(applicationSupportRoot,'state'),baseline=await readJSON(path.join(stateDir,'baseline.json')),source=await readJSON(sourceFile);
if(baseline?.schemaVersion!==2||baseline?.counts?.numbered!==source?.quality?.namedProducts)throw new Error('verified baseline and source counts do not match');
const now=new Date().toISOString(),old=await readJSON(path.join(stateDir,'app-state.json'),{}),result={ok:true,at:now,sourceCapturedAt:source.capturedAt,
  productCount:baseline.counts.numbered,status:'baseline-completed',message:'库存情况已补全',summary:{total:baseline.counts.numbered,skipped:baseline.counts.skipped},detail:[]};
await writeJSON(path.join(stateDir,'latest-result.json'),result);
await writeJSON(path.join(stateDir,'app-state.json'),{...old,lastCheck:now,lastSuccessfulSync:now,productCount:baseline.counts.numbered,kdocsLoggedIn:true,
  collection:{status:'success',capturedAt:source.capturedAt,products:source.quality.namedProducts,endpoint:source.quality.endpoint},
  mapping:{total:baseline.counts.numbered,automatic:baseline.counts.numbered,needsConfirmation:0,pendingNumber:0,firstRun:false},googleWrite:'已完成',workflow:'complete',latest:result});
process.stdout.write(JSON.stringify({updated:true,productCount:baseline.counts.numbered,sourceCapturedAt:source.capturedAt}));
