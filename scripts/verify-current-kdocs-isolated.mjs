import os from 'node:os';
import path from 'node:path';
import {cp,mkdtemp,rm} from 'node:fs/promises';
import {ensureDirectories,listJSON,readJSON} from '../src/core/files.mjs';
import {collectKdocs} from '../src/source/collector.mjs';
import {closeKdocsWorkspace,loginKdocs,kdocsWorkspaceStatus} from '../src/source/browser.mjs';
import {SOURCE_URL} from '../src/config.mjs';

const formal=await ensureDirectories(path.join(os.homedir(),'Library','Application Support','Liaodan Assistant Live'));
const temporary=await mkdtemp(path.join(os.tmpdir(),'kdocs-isolated-read-'));
try{
  const isolated=await ensureDirectories(temporary);
  await rm(isolated.profile,{recursive:true,force:true});
  await cp(formal.profile,isolated.profile,{recursive:true,force:true});
  let previous=null;
  for(const file of (await listJSON(formal.snapshots,'source_')).reverse()){
    const candidate=await readJSON(path.join(formal.snapshots,file));
    if(candidate?.quality?.passed){previous=candidate;break;}
  }
  await loginKdocs(isolated.profile,SOURCE_URL);
  let ready=false;
  for(let attempt=0;attempt<40;attempt++){
    if((await kdocsWorkspaceStatus()).state==='ready'){ready=true;break;}
    await new Promise(resolve=>setTimeout(resolve,500));
  }
  if(!ready)throw new Error('隔离浏览器尚未显示来源库存表；请先在正式应用完成 KDocs 登录');
  const value=await collectKdocs({profile:isolated.profile,paths:isolated,previous,
    onProgress:event=>console.log(`[${event.stage}] ${event.message}`)});
  console.log(JSON.stringify({passed:value.snapshot.quality.passed,endpoint:value.snapshot.quality.endpoint,
    rawNamedRows:value.snapshot.quality.rawNamedRows,products:value.snapshot.quality.namedProducts,
    conflictChecks:value.collection.manifest.conflictChecks},null,2));
}finally{
  await closeKdocsWorkspace();
  await rm(temporary,{recursive:true,force:true});
}
