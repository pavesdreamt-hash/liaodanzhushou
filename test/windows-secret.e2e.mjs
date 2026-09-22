import test from 'node:test';import assert from 'node:assert/strict';
import {_electron as electron} from 'playwright-core';import electronPath from 'electron';
import {mkdtemp,readFile,rm,mkdir,writeFile} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
test('Windows local password window: masked input, blank validation, save, cancel, close, denied foreign IPC',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'kdocs-secret-fictional-')),result=path.join(dir,'result.json');let application;
 const waitResult=async n=>{for(let i=0;i<100;i++){const data=await readFile(result,'utf8').then(JSON.parse).catch(()=>null);if(data?.request===n)return data;await new Promise(r=>setTimeout(r,50));}const state=await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().map(w=>({id:w.id,url:w.webContents.getURL(),visible:w.isVisible()})));throw Error('prompt result timeout '+JSON.stringify({n,state,result:await readFile(result,'utf8').catch(()=>null)}));};
 try{
  application=await electron.launch({executablePath:electronPath,args:[path.resolve('test/fixtures/native-secret-app.mjs'),'--data='+dir,'--result='+result],env:{...process.env,NODE_ENV:'test'}});
  const getWindow=async()=>{for(let i=0;i<100;i++){const page=application.windows().find(p=>p.url().endsWith('/native-secret.html'));if(page)return page;await new Promise(r=>setTimeout(r,50));}throw Error('prompt window missing');};
  let page=await getWindow();await page.locator('#secret').waitFor();assert.equal(await page.locator('#secret').getAttribute('type'),'password');await page.getByRole('button',{name:'保存',exact:true}).click();await page.getByRole('status').filter({hasText:'请输入密钥'}).waitFor();
  const forbidden=await application.evaluate(async({ipcMain,BrowserWindow})=>{const holder=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL()==='about:blank');return await ipcMain._invokeHandlers.get('native-secret:submit')({sender:holder.webContents,senderFrame:holder.webContents.mainFrame},{value:'foreign-key'});});assert.equal(forbidden.ok,false);
  const out=path.resolve(process.env.KDOCS_TEST_ARTIFACT_DIRECTORY||'artifacts/windows-8.23/source');await mkdir(out,{recursive:true});await page.screenshot({path:path.join(out,'windows-key-window.png')});await page.locator('#secret').fill('fictional-ui-key');await page.getByRole('button',{name:'保存',exact:true}).click();assert.equal((await waitResult(1)).matchesFictional,true);
  const start=()=>application.evaluate(({ipcMain})=>{void ipcMain._invokeHandlers.get('fixture:prompt')({});});await start();page=await getWindow();await page.getByRole('button',{name:'取消',exact:true}).click();assert.equal((await waitResult(2)).canceled,true);
  await start();page=await getWindow();await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/native-secret.html')).close());assert.equal((await waitResult(3)).canceled,true);
  await writeFile(path.join(out,'windows-key-window-result.json'),JSON.stringify({result:'PASS-MAC-HOST-WINDOWS-PROMPT-PATH',masked:true,blankValidation:true,save:true,cancel:true,close:true,foreignSenderDenied:true,realAIRequests:0,windowsRuntimeValidated:false},null,2));
 }finally{await application?.close();await rm(dir,{recursive:true,force:true});}
});
