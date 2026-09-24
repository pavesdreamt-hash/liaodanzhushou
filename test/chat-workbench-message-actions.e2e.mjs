import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {_electron as electron} from 'playwright-core';
import electronPath from 'electron';

const appVersion=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')).version;
const imageData='data:image/png;base64,'+readFileSync(new URL('../assets/app-icon-1024.png',import.meta.url)).toString('base64');

test('message hover actions stay beside the bubble and operate on the selected message',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'workbench-message-actions-'));let application;
 try{
  application=await electron.launch({executablePath:process.env.KDOCS_TEST_EXECUTABLE||electronPath,args:[...(process.env.KDOCS_TEST_EXECUTABLE?[]:['.']),`--orders-test-user-data=${directory}`],cwd:path.resolve('.'),env:{...process.env,NODE_ENV:'test'}});
  const page=await application.firstWindow();
  await application.evaluate(({ipcMain},imageData)=>{
   globalThis.__messageActionRows=[
    {id:'false_971500000002@c.us_fixture-text',direction:'customer',text:'Please confirm order KY40.',sentAt:'2026-09-24T08:00:00.000Z',metadata:{messageType:'chat',media:[]}},
    {id:'true_971500000002@c.us_fixture-image',direction:'merchant',text:'[图片]',sentAt:'2026-09-24T08:01:00.000Z',metadata:{messageType:'image',media:[{type:'image',status:'cached',mimetype:'image/png',dataUrl:imageData}]}}
   ];globalThis.__messageActionSends=[];globalThis.__messageActionTranslations=[];globalThis.__messageActionOcr=[];
   ipcMain.removeHandler('manual-chat');ipcMain.handle('manual-chat',async(_event,{action,payload={}})=>{
    if(action==='status')return {ok:true,data:{status:'online'}};
    if(action==='inbox')return {ok:true,data:{items:[{phone:'971500000002',chatId:'wa-phone:971500000002',name:'Fictional Hover Customer',updatedAt:'2026-09-24T08:01:00.000Z',preview:'[图片]',direction:'merchant',unreadCount:0}],total:1,offset:0,hasMore:false}};
    if(action==='openInbox'||action==='recent')return {ok:true,data:{token:'message-actions-binding',accountId:'wa-phone:971500000001',chatId:'wa-phone:971500000002',phone:'971500000002',identityVerified:true,messages:globalThis.__messageActionRows,hasMore:false}};
    if(action==='send'){globalThis.__messageActionSends.push(payload);return {ok:true,data:{status:'sent'}};}
    return {ok:true,data:null};
   });
   ipcMain.removeHandler('manual-reply-translation');ipcMain.handle('manual-reply-translation',async(_event,{action,payload={}})=>{
    if(action==='chat-cache')return {ok:true,data:{translations:[]}};
    if(action==='chat-translate'){globalThis.__messageActionTranslations.push(payload.messages.map(row=>row.id));return {ok:true,data:{translations:payload.messages.map(row=>({id:row.id,text:'请确认订单 KY40。'}))}};}
    if(action==='image-text'){globalThis.__messageActionOcr.push(payload.messageId);return {ok:true,data:{text:'ORDER KY40\nAED 250.00'}};}
    if(action==='translate')return {ok:true,data:{text:'Thank you for your support.',chinese:'感谢你的支持。'}};
    return {ok:false,error:'unexpected action'};
   });
  },imageData);
  const frame=page.frameLocator('iframe.confirmed-frame');await frame.locator('.cwb-refresh').click();assert.equal(await frame.locator('.cwb-top-version').textContent(),appVersion);
  await frame.locator('.cwb-translation').click();const auto=frame.locator('#cwb-auto-read-translation');if(await auto.isChecked())await auto.uncheck();await frame.locator('.cwb-translation').click();
  await frame.locator('.cwb-conversation').click();
  const incoming=frame.locator('[data-message-id*="fixture-text"]'),incomingBubble=incoming.locator('.cwb-bubble'),incomingActions=incoming.locator('.cwb-message-actions');await incoming.hover();await incomingActions.waitFor();
  assert.deepEqual(await incomingActions.locator('button span').allTextContents(),['翻译','话术','识图','回复']);
  const incomingBox=await incomingBubble.boundingBox(),incomingActionBox=await incomingActions.boundingBox();assert.ok(incomingBox&&incomingActionBox&&incomingActionBox.x>=incomingBox.x+incomingBox.width-1,'收到消息的按钮应在气泡右侧');assert.ok(Math.abs((incomingActionBox.y+incomingActionBox.height/2)-(incomingBox.y+incomingBox.height/2))<3,'按钮组应与气泡横向同排');
  await incoming.getByTitle('翻译这条消息').click();await incoming.locator('.cwb-translation-line').filter({hasText:'请确认订单 KY40。'}).waitFor();assert.deepEqual(await application.evaluate(()=>globalThis.__messageActionTranslations.flat()),['false_971500000002@c.us_fixture-text']);
  await incoming.hover();await incoming.getByTitle('选择快捷话术').click();assert.equal(await frame.locator('.cwb-quick-popover').isVisible(),true);await frame.locator('.cwb-popover-close').click();
  await incoming.hover();await incoming.getByTitle('回复这条消息').click();const replyContext=frame.locator('.cwb-reply-context');assert.equal(await replyContext.isVisible(),true);assert.match(await replyContext.textContent(),/Please confirm order KY40/);
  await frame.locator('[data-editor="en"]').click();await frame.locator('#cwb-editor').fill('Confirmed reply for fictional test.');await frame.locator('.cwb-send').click();await page.waitForTimeout(100);const sent=await application.evaluate(()=>globalThis.__messageActionSends.at(-1));assert.equal(sent.replyToMessageId,'false_971500000002@c.us_fixture-text');assert.equal(sent.text,'Confirmed reply for fictional test.');assert.equal(await replyContext.isVisible(),false);
  const outgoing=frame.locator('[data-message-id*="fixture-image"]'),outgoingBubble=outgoing.locator('.cwb-bubble'),outgoingActions=outgoing.locator('.cwb-message-actions');await outgoing.hover();const outgoingBox=await outgoingBubble.boundingBox(),outgoingActionBox=await outgoingActions.boundingBox(),messagePaneBox=await frame.locator('#cwb-messages').boundingBox();assert.ok(outgoingBox&&outgoingActionBox&&outgoingActionBox.x+outgoingActionBox.width<=outgoingBox.x+1,'发出消息的按钮应在气泡左侧');assert.ok(messagePaneBox&&outgoingActionBox&&outgoingActionBox.x>=messagePaneBox.x,'按钮组不能被聊天窗口左边界裁切');
  await outgoing.getByTitle('识别图片文字').click();await outgoing.locator('.cwb-image-text-result').filter({hasText:'ORDER KY40'}).waitFor();assert.deepEqual(await application.evaluate(()=>globalThis.__messageActionOcr),['true_971500000002@c.us_fixture-image']);
  await outgoing.hover();await outgoingActions.hover();await page.waitForTimeout(150);await mkdir(path.resolve('artifacts/message-actions-1.8.6'),{recursive:true});await page.screenshot({path:path.resolve('artifacts/message-actions-1.8.6/hover-actions.png')});
 }finally{try{application?.process().kill('SIGKILL');}catch{}await rm(directory,{recursive:true,force:true});}
});
