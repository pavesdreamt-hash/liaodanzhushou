import test from 'node:test';
import assert from 'node:assert/strict';
import {_electron as electron} from 'playwright-core';
import electronPath from 'electron';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('聊天工作台 AI辅助只在明确点击后生成可编辑草稿，不自动发送',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'workbench-ai-assist-')),output=path.resolve('artifacts/ai-assist-1.9.1');let application,page;
 try{
  application=await electron.launch({executablePath:process.env.KDOCS_TEST_EXECUTABLE||electronPath,args:[...(process.env.KDOCS_TEST_EXECUTABLE?[]:['.']),`--orders-test-user-data=${directory}`],cwd:path.resolve('.'),env:{...process.env,NODE_ENV:'test'}});
  page=await application.firstWindow();page.setDefaultTimeout(20000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await application.evaluate(({ipcMain})=>{
   globalThis.__assistCalls=[];globalThis.__assistSends=[];globalThis.__assistConfigured=true;
   const message={id:'fictional-customer-1',direction:'customer',text:'Can you confirm the fictional delivery address?',sentAt:'2026-09-24T00:00:00.000Z'};
   ipcMain.removeHandler('manual-chat');ipcMain.handle('manual-chat',async(_event,{action,payload={}})=>{
    if(action==='status')return {ok:true,data:{status:'online'}};
    if(action==='inbox')return {ok:true,data:{items:[{phone:'971500000002',chatId:'wa-phone:971500000002',name:'Fictional AI Assist Customer',updatedAt:message.sentAt,preview:message.text,direction:'customer',unreadCount:0}],total:1,offset:0,hasMore:false}};
    if(action==='openInbox'||action==='recent')return {ok:true,data:{token:'fictional-assist-binding',accountId:'wa-phone:971500000001',chatId:'wa-phone:971500000002',phone:'971500000002',identityVerified:true,messages:[message],hasMore:false}};
    if(action==='send'){globalThis.__assistSends.push(payload);return {ok:true,data:{status:'sent'}};}
    return {ok:false,error:`unexpected manual-chat action: ${action}`};
   });
   ipcMain.removeHandler('manual-reply-translation');ipcMain.handle('manual-reply-translation',async(_event,{action,payload={}})=>{
    if(action==='settings')return {ok:true,data:globalThis.__assistConfigured?{activeProvider:'openai',providers:{openai:{model:'fictional-model',hasApiKey:true}}}:{activeProvider:'openai',providers:{openai:{model:'',hasApiKey:false}}}};
    if(action==='chat-cache'||action==='chat-translate')return {ok:true,data:{translations:[]}};
    if(action==='assist-draft'){globalThis.__assistCalls.push(payload);return {ok:true,data:{text:'Please confirm the fictional delivery address.',chinese:'请确认虚构收货地址。',referenceId:'fictional-customer-1'}};}
    return {ok:false,error:`unexpected translation action: ${action}`};
   });
  });
  const frame=page.frameLocator('iframe.confirmed-frame');await frame.locator('.cwb-refresh').click();await frame.locator('.cwb-conversation').click();await frame.locator('.cwb-message-text').getByText('Can you confirm the fictional delivery address?',{exact:true}).waitFor();
  const chinese=frame.getByLabel('中文输入'),assist=frame.locator('.cwb-top-modes [data-mode="assist"]'),manual=frame.locator('.cwb-top-modes [data-mode="manual"]'),auto=frame.locator('.cwb-top-modes [data-mode="auto"]');
  await chinese.fill('请礼貌确认虚构地址');await frame.locator('.cwb-attachment-input').setInputFiles({name:'fictional-ai-note.txt',mimeType:'text/plain',buffer:Buffer.from('fictional only')});await frame.locator('.cwb-attachment-chip').waitFor();
  assert.equal(await assist.isDisabled(),false);assert.equal((await assist.textContent())?.includes('待启用'),false);assert.equal(await application.evaluate(()=>globalThis.__assistCalls.length),0);
  await assist.click();await frame.getByRole('button',{name:'生成 AI 回复',exact:true}).waitFor();assert.equal(await manual.getAttribute('aria-pressed'),'false');assert.equal(await assist.getAttribute('aria-pressed'),'true');assert.equal(await chinese.inputValue(),'请礼貌确认虚构地址');assert.equal(await frame.locator('.cwb-attachment-chip').count(),1);assert.equal(await application.evaluate(()=>globalThis.__assistCalls.length),0);
  await frame.getByRole('button',{name:'生成 AI 回复',exact:true}).click();await frame.getByLabel('英文翻译').waitFor();assert.equal(await frame.getByLabel('英文翻译').inputValue(),'Please confirm the fictional delivery address.');await frame.getByText('AI 中文核对：请确认虚构收货地址。',{exact:true}).waitFor();
  assert.deepEqual(await application.evaluate(()=>globalThis.__assistCalls),[{token:'fictional-assist-binding',intent:'请礼貌确认虚构地址',referenceMessageId:null}]);assert.equal(await application.evaluate(()=>globalThis.__assistSends.length),0);
  await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(window=>window.isVisible())?.setContentSize(1280,820));await mkdir(output,{recursive:true});await page.screenshot({path:path.join(output,'ai-assist-1280x820.png')});
  await manual.click();assert.equal(await manual.getAttribute('aria-pressed'),'true');assert.equal(await frame.getByLabel('英文翻译').inputValue(),'Please confirm the fictional delivery address.');assert.equal(await frame.locator('.cwb-attachment-chip').count(),1);assert.equal(await auto.isDisabled(),true);assert.match(await auto.textContent()||'',/待启用/);
  await application.evaluate(()=>{globalThis.__assistConfigured=false;});await assist.click();await frame.getByText('AI辅助需要先在助手配置保存服务商、模型和 API 密钥。',{exact:true}).waitFor();assert.equal(await manual.getAttribute('aria-pressed'),'true');assert.equal(await application.evaluate(()=>globalThis.__assistCalls.length),1);assert.deepEqual(errors,[]);
 }finally{try{application?.process().kill('SIGKILL');}catch{}await rm(directory,{recursive:true,force:true,maxRetries:3,retryDelay:150}).catch(()=>{});}
});
