import path from 'node:path';
import os from 'node:os';
import {ensureDirectories,listJSON,readJSON} from '../src/core/files.mjs';
import {collectKdocs} from '../src/source/collector.mjs';

const base=path.join(os.homedir(),'Library','Application Support','KDocs Order Assistant');
const paths=await ensureDirectories(base);
const existing=(await listJSON(paths.snapshots,'source_')).reverse();
let previous=null;
for(const name of existing){
  const candidate=await readJSON(path.join(paths.snapshots,name));
  if(candidate?.quality?.passed){previous=candidate;break;}
}
const result=await collectKdocs({profile:paths.profile,paths,previous,onProgress:event=>console.log(`[${event.stage}] ${event.message}`)});
console.log(JSON.stringify({file:result.file,capturedAt:result.snapshot.capturedAt,products:result.snapshot.quality.namedProducts,endpoint:result.snapshot.quality.endpoint,passed:result.snapshot.quality.passed}));
