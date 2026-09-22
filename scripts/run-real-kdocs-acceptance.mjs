import path from 'node:path';
import os from 'node:os';
import {ensureDirectories,writeJSON,stableHash} from '../src/core/files.mjs';
import {collectKdocs} from '../src/source/collector.mjs';
import {assignSourceKeys} from '../src/mapping/source-key.mjs';
const base=path.join(os.homedir(),'Library','Application Support','KDocs Order Assistant'),paths=await ensureDirectories(base),runs=[];
let previous=null;
for(let index=1;index<=2;index++){
  const started=Date.now();console.log(`[真实KDocs ${index}/2] 开始`);
  const value=await collectKdocs({profile:paths.profile,paths,previous,onProgress:event=>console.log(`[${event.stage}] ${event.message}`),keepEvidence:true});
  const products=assignSourceKeys(value.snapshot.products.filter(x=>x.sourceName));
  runs.push({index,startedAt:new Date(started).toISOString(),finishedAt:new Date().toISOString(),durationMs:Date.now()-started,file:value.file,
    endpoint:value.snapshot.quality.endpoint,namedProducts:value.snapshot.quality.namedProducts,inStock:value.snapshot.quality.inStock,outOfStock:value.snapshot.quality.outOfStock,
    empty:value.snapshot.quality.empty,warnings:value.snapshot.quality.warnings,coreHash:stableHash(products.map(x=>[x.sourceKey,x.sourceName,x.cost,x.suggestedPrice,x.stock])),
    samples:products.filter((_,i)=>i%Math.max(1,Math.floor(products.length/20))===0).slice(0,20).map(x=>({sourceRow:x.sourceRow,sourceKey:x.sourceKey,A:x.sourceName,D:x.cost,E:x.suggestedPrice,F:x.stock})),
    wolves:products.filter(x=>x.sourceName==='狼牙套').map(x=>({sourceKey:x.sourceKey,sourceRow:x.sourceRow,cost:x.cost,suggestedPrice:x.suggestedPrice,stock:x.stock}))});
  previous=value.snapshot;
}
const report={schemaVersion:1,passed:runs.every(x=>x.namedProducts>=140&&x.endpoint)&&runs[0].coreHash===runs[1].coreHash,createdAt:new Date().toISOString(),sameCoreData:runs[0].coreHash===runs[1].coreHash,runs};
const file=path.join(paths.state,'kdocs-real-acceptance.json');await writeJSON(file,report);console.log(JSON.stringify({file,passed:report.passed,sameCoreData:report.sameCoreData,runs:runs.map(x=>({products:x.namedProducts,endpoint:x.endpoint,inStock:x.inStock,outOfStock:x.outOfStock,empty:x.empty,wolves:x.wolves}))},null,2));
if(!report.passed)process.exitCode=1;
