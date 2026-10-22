import {pendingNewFixture} from './pending-new.mjs';
import {Orchestrator} from '../../src/services/orchestrator.mjs';
import {mappingValues} from '../../src/mapping/mapping.mjs';
import {writeJSON} from '../../src/core/files.mjs';
import path from 'node:path';
export async function mappingFixture(){
  const f=await pendingNewFixture(),doc=await f.store.read();doc.mapping=mappingValues(doc.mappingRows);await writeJSON(f.store.file,doc);
  await writeJSON(path.join(f.paths.snapshots,'source_mapping.json'),doc.latestCollection);
  const calls={oauth:0,google:0};
  const orchestrator=new Orchestrator({paths:f.paths,oauth:{status:async()=>{calls.oauth++;return{connected:true};}},sheets:new Proxy({},{get:()=>()=>{calls.google++;throw Error('禁止Google访问');}})});
  await orchestrator.preparePending(doc.latestCollection,{useGoogle:false});
  return{...f,orchestrator,external:calls};
}
