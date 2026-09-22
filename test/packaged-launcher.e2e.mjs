import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

test('ZIP 不含 command 启动器且包内 App 可直接启动',async()=>{
  const packaged=process.env.KDOCS_PACKAGED_APP,folder=process.env.KDOCS_PACKAGED_FOLDER;
  assert.ok(packaged,'KDOCS_PACKAGED_APP 未提供');assert.ok(folder,'KDOCS_PACKAGED_FOLDER 未提供');
  const pkg=JSON.parse(await readFile(path.resolve('package.json'),'utf8'));
  assert.equal((await readdir(folder)).some(name=>name.endsWith('.command')),false);
  assert.equal(path.basename(packaged),`聊单助手 ${pkg.version}.app`);
  const executable=path.join(packaged,'Contents','MacOS',path.basename(packaged,'.app'));
  const directUserData=process.env.KDOCS_DIRECT_USER_DATA;
  const temporaryHome=directUserData?null:await mkdtemp(path.join(os.tmpdir(),'kdocs-launcher-home-'));
  const userData=directUserData||path.join(temporaryHome,'Library/Application Support/KDocs Order Assistant');
  const environment=directUserData?{...process.env,NODE_ENV:'production'}:{...process.env,HOME:temporaryHome,NODE_ENV:'production'};
  const launchStartedAt=Date.now()-1000;
  const child=spawn(executable,[],{env:environment,stdio:'ignore'});
  try{
    let entries=[];
    for(let i=0;i<150;i++){
      await new Promise(resolve=>setTimeout(resolve,100));
      const files=await readdir(path.join(userData,'logs')).catch(()=>[]);
      entries=[];
      for(const file of files.filter(name=>name.startsWith('startup-'))){
        for(const line of (await readFile(path.join(userData,'logs',file),'utf8')).split('\n').filter(Boolean)){
          try{entries.push(JSON.parse(line));}catch{}
        }
      }
      entries=entries.filter(entry=>Date.parse(entry.timestamp)>=launchStartedAt);
      if(entries.some(entry=>entry.message==='已在默认浏览器打开管理页面'))break;
      assert.equal(child.exitCode,null,'启动器在管理页面就绪前退出');
    }
    assert.ok(entries.some(entry=>entry.message==='应用启动完成'));
    assert.equal(entries.find(entry=>entry.message==='启动日志已启用')?.metrics.version,pkg.version);
    assert.equal(entries.find(entry=>entry.message==='启动日志已启用')?.metrics.userData,userData);
    const started=entries.find(entry=>entry.message==='本地管理页面已启动');
    if(directUserData)assert.equal(started.metrics.port,43875);
    const token=(await readFile(path.join(userData,'local-web-token'),'utf8')).trim();
    const response=await fetch(`http://127.0.0.1:${started.metrics.port}/?token=${token}`);
    assert.equal(response.status,200);
    assert.match(await response.text(),new RegExp(`本地业务助手 ${pkg.version.split('.').slice(0,2).join('\\.')}`));
  }finally{
    if(child.exitCode===null){const exited=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGTERM');await Promise.race([exited,new Promise(resolve=>setTimeout(resolve,5000))]);if(child.exitCode===null){const forced=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGKILL');await forced;}}
    if(temporaryHome)await rm(temporaryHome,{recursive:true,force:true});
  }
});
