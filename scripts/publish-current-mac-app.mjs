import {access,lstat,rename,rm} from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const run=promisify(execFile);
const root=path.resolve('.');
const source=path.join(root,'dist','mac','聊单助手.app');
const target=path.join(root,'dist','聊单助手.app');
const backup=target+'.previous';

await access(source);
await rm(backup,{recursive:true,force:true});
let hadPrevious=false;
try{hadPrevious=(await lstat(target)).isDirectory();}catch(error){if(error.code!=='ENOENT')throw error;}
if(hadPrevious)await rename(target,backup);
try{
  // ditto preserves the macOS framework links and the packaged code signature.
  await run('/usr/bin/ditto',[source,target]);
  await rm(backup,{recursive:true,force:true});
}catch(error){
  await rm(target,{recursive:true,force:true});
  if(hadPrevious)await rename(backup,target);
  throw error;
}
console.log(JSON.stringify({published:true,source,target}));
