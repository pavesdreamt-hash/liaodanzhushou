import test from 'node:test';
import assert from 'node:assert/strict';
import {_electron as electron} from 'playwright-core';
import electronPath from 'electron';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('聊天工作台默认先读取当前页缓存，再自动翻译未译消息，且保留人工入口',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'workbench-auto-translation-'));let application;
 try{
  application=await electron.launch({executablePath:process.env.KDOCS_TEST_EXECUTABLE||electronPath,args:[...(process.env.KDOCS_TEST_EXECUTABLE?[]:['.']),`--orders-test-user-data=${directory}`],cwd:path.resolve('.'),env:{...process.env,NODE_ENV:'test'}});
  const page=await application.firstWindow();
  await application.evaluate(({ipcMain})=>{
   globalThis.__workbenchTranslationCalls=[];
   ipcMain.removeHandler('manual-chat');ipcMain.handle('manual-chat',async(_event,{action})=>({ok:true,data:action==='status'?{status:'online'}:action==='inbox'?{items:[{phone:'10002',chatId:'wa-phone:10002',name:'',updatedAt:'2026-09-22T08:01:00.000Z',preview:'New source',direction:'merchant',unreadCount:0}],total:1,offset:0,hasMore:false}:action==='openInbox'?{token:'workbench-binding',accountId:'merchant',chatId:'customer-chat',phone:'10002',messages:globalThis.__workbenchRows,hasMore:false}:action==='recent'?{messages:globalThis.__workbenchRows,hasMore:false}:null}));
   globalThis.__workbenchRows=[{id:'cached',direction:'customer',text:'Cached source',sentAt:'2026-09-22T08:00:00.000Z'},{id:'new',direction:'merchant',sender:'人工发送',text:'New source',sentAt:'2026-09-22T08:01:00.000Z'}];
   ipcMain.removeHandler('manual-reply-translation');ipcMain.handle('manual-reply-translation',async(_event,{action,payload})=>{if(action==='chat-cache')return {ok:true,data:{translations:payload.messages.filter(row=>row.id==='cached').map(row=>({id:row.id,text:'缓存译文'}))}};if(action==='chat-translate'){globalThis.__workbenchTranslationCalls.push(payload.messages.map(row=>row.id));return {ok:true,data:{translations:payload.messages.map(row=>({id:row.id,text:`自动译文 ${row.text}`}))}};}return {ok:false,error:'unexpected action'};});
  });
  const frame=page.frameLocator('iframe.confirmed-frame');await frame.locator('.cwb-refresh').click();
  await frame.locator('#cwb-phone').getByText('10002',{exact:true}).waitFor();
  await frame.getByText('缓存译文',{exact:true}).waitFor();await frame.getByText('自动译文 New source',{exact:true}).waitFor();
  assert.equal(await frame.locator('#cwb-auto-read-translation').isChecked(),true);
  assert.equal(await frame.locator('.cwb-translate-visible').count(),1);
  assert.deepEqual(await application.evaluate(()=>globalThis.__workbenchTranslationCalls),[['new']]);
 }finally{await application?.close().catch(()=>{});await rm(directory,{recursive:true,force:true});}
});
