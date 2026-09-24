import test from 'node:test';
import assert from 'node:assert/strict';
import {_electron as electron} from 'playwright-core';
import electronPath from 'electron';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('工作台保持文字表情网址原文并发送图片和文件附件',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'workbench-send-')),textFile=path.join(directory,'acceptance.txt');let application;
 await writeFile(textFile,'Liaodan 1.8.5 fictional attachment acceptance.');
 try{
  application=await electron.launch({executablePath:electronPath,args:['.',`--orders-test-user-data=${directory}`],cwd:path.resolve('.'),env:{...process.env,NODE_ENV:'test'}});
  const page=await application.firstWindow();
  await application.evaluate(({ipcMain})=>{
   globalThis.__sendPayloads=[];
   const message={id:'fixture-1',direction:'customer',text:'Ready',sentAt:'2026-09-24T00:00:00.000Z',metadata:{messageType:'chat',media:[]}};
   ipcMain.removeHandler('manual-chat');ipcMain.handle('manual-chat',async(_event,{action,payload={}})=>{
    if(action==='status')return {ok:true,data:{status:'online'}};
    if(action==='inbox')return {ok:true,data:{items:[{phone:'971500000301',chatId:'wa-phone:971500000301',name:'Send Fixture',updatedAt:message.sentAt,preview:'Ready',direction:'customer',unreadCount:0}],total:1,offset:0,hasMore:false}};
    if(action==='openInbox'||action==='recent')return {ok:true,data:{token:'send-binding',accountId:'wa-phone:971500000300',chatId:'wa-phone:971500000301',phone:'971500000301',messages:[message],hasMore:false}};
    if(action==='send'){globalThis.__sendPayloads.push(payload);return {ok:true,data:{status:'sent',parts:[{kind:'text',status:'sent',id:'sent-1'},{kind:'image',status:'sent',id:'sent-2'},{kind:'file',status:'sent',id:'sent-3'}]}};}
    return {ok:true,data:null};
   });
   ipcMain.removeHandler('manual-reply-translation');ipcMain.handle('manual-reply-translation',async()=>({ok:true,data:{translations:[]}}));
  });
  const frame=page.frameLocator('iframe.confirmed-frame');await frame.locator('.cwb-refresh').click();await frame.locator('.cwb-conversation').click();
  await frame.getByRole('button',{name:'英文翻译'}).click();const outgoing='Liaodan 1.8.5 send acceptance 😊 https://example.com/liaodan-send';await frame.getByLabel('英文翻译').fill(outgoing);
  await frame.locator('.cwb-attachment-input').setInputFiles([path.resolve('assets/app-icon-1024.png'),textFile]);
  const imageChip=frame.locator('.cwb-attachment-chip').filter({hasText:'app-icon-1024.png'});await imageChip.waitFor();await frame.locator('.cwb-attachment-chip').filter({hasText:'acceptance.txt'}).waitFor();assert.match(await imageChip.locator('img').getAttribute('src'),/^data:image\/png;base64,/);
  await frame.getByRole('button',{name:'发送确认'}).click();await frame.getByText('已真实发送并取得 WhatsApp 回执',{exact:true}).waitFor();
  const [payload]=await application.evaluate(()=>globalThis.__sendPayloads);assert.equal(payload.text,outgoing);assert.equal(payload.attachments.length,2);assert.deepEqual(payload.attachments.map(value=>[value.name,value.mimetype]),[['app-icon-1024.png','image/png'],['acceptance.txt','text/plain']]);assert.match(payload.attachments[0].dataUrl,/^data:image\/png;base64,/);assert.match(payload.attachments[1].dataUrl,/^data:text\/plain;base64,/);assert.equal(await frame.locator('.cwb-attachment-chip').count(),0);assert.equal(await frame.getByLabel('中文输入').inputValue(),'');
 }finally{try{application?.process().kill('SIGKILL');}catch{}await rm(directory,{recursive:true,force:true});}
});
