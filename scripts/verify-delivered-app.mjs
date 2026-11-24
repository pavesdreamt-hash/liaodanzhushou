import os from 'node:os';
import path from 'node:path';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import pkg from '../package.json' with {type:'json'};

const root=path.resolve('.');
const app=path.join(root,'交付',`聊单助手${pkg.version}`,'聊单助手.app');
const executable=path.join(app,'Contents','MacOS','聊单助手');
const temporary=await mkdtemp(path.join(os.tmpdir(),'liaodan-packaged-startup-'));
const reportFile=path.join(temporary,'result.json');
try{
  const child=spawn(executable,[`--isolated-user-data=${path.join(temporary,'user-data')}`,`--verify-packaged-startup=${reportFile}`],
    {env:{...process.env,NODE_ENV:'test'},stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>output+=chunk);
  const timer=setTimeout(()=>child.kill('SIGTERM'),45000);
  const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve)});
  clearTimeout(timer);
  if(code!==0)throw new Error(`交付 App 未正常启动：${output.slice(-1600)}`);
  const report=JSON.parse(await readFile(reportFile,'utf8'));
  if(!report.ok||!report.packaged||report.version!==pkg.version||report.arch!=='x64')throw new Error(`交付 App 启动核验未通过：${JSON.stringify(report)}`);
  console.log(JSON.stringify({app,report}));
}finally{await rm(temporary,{recursive:true,force:true});}
