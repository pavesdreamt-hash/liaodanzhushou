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
   ipcMain.removeHandler('manual-chat');ipcMain.handle('manual-chat',async(_event,{action})=>({ok:true,data:action==='status'?{status:'online'}:action==='inbox'?{items:[{phone:'10002',chatId:'wa-phone:10002',name:'',avatarUrl:'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==',updatedAt:'2026-09-22T08:01:00.000Z',preview:'New source',direction:'customer',unreadCount:0}],total:1,offset:0,hasMore:false}:action==='openInbox'?{token:'workbench-binding',accountId:'merchant',chatId:'customer-chat',phone:'10002',messages:globalThis.__workbenchRows,hasMore:true}:action==='recent'?{messages:globalThis.__workbenchRows,hasMore:false}:null}));
   globalThis.__workbenchRows=[{id:'cached',direction:'customer',text:'Cached source',sentAt:'2026-09-22T08:00:00.000Z'},{id:'new',direction:'merchant',sender:'人工发送',text:'New source',sentAt:'2026-09-22T08:01:00.000Z'}];
   ipcMain.removeHandler('manual-reply-translation');ipcMain.handle('manual-reply-translation',async(_event,{action,payload})=>{if(action==='chat-cache')return {ok:true,data:{translations:payload.messages.filter(row=>row.id==='cached').map(row=>({id:row.id,text:'缓存译文'}))}};if(action==='chat-translate'){globalThis.__workbenchTranslationCalls.push(payload.messages.map(row=>row.id));return {ok:true,data:{translations:payload.messages.map(row=>({id:row.id,text:`自动译文 ${row.text}`}))}};}return {ok:false,error:'unexpected action'};});
  });
  const frame=page.frameLocator('iframe.confirmed-frame');await frame.locator('.cwb-refresh').click();
  await frame.getByText('聊单助手',{exact:true}).waitFor();
  assert.equal(await frame.locator('.cwb-top-version').textContent(),'1.3.5');
  assert.match(await frame.locator('button[title="订单管理"] svg').getAttribute('class')||'',/lucide-archive/);
  const topbar=await frame.locator('.cwb-topbar').boundingBox(),nav=await frame.locator('.cwb-nav').boundingBox(),conversations=await frame.locator('.cwb-conversations').boundingBox();
  assert.equal(Math.round(topbar?.height||0),56);
  assert.ok(nav&&conversations&&Math.abs(nav.x+nav.width-conversations.x)<=1,'导航与客户聊天列保持相邻分界');
  assert.equal(await frame.locator('.cwb-nav').evaluate(element=>getComputedStyle(element).borderRightWidth),'1px');
  assert.equal(await frame.locator('.cwb-nav').evaluate(element=>getComputedStyle(element).paddingTop),'22px');
  assert.equal(await frame.locator('.cwb-nav-label').first().evaluate(element=>getComputedStyle(element).marginBottom),'9px');
  await frame.locator('#chat-workbench-desktop').evaluate(root=>{root.style.setProperty('--cwb-list-width','240px');root.ownerDocument.defaultView?.dispatchEvent(new Event('resize'));});
  assert.equal(await frame.locator('#chat-workbench-desktop').evaluate(root=>root.style.getPropertyValue('--cwb-list-width')),'');
  const shell=await frame.locator('#chat-workbench-desktop').boundingBox(),defaultChat=await frame.locator('.cwb-chat').boundingBox();
  assert.ok(shell&&defaultChat&&Math.abs(defaultChat.x-shell.x-Math.max(shell.width/3,456))<=1,'放大或拉伸窗口后，导航和客户聊天栏整体恢复为三分之一宽度');
  await frame.locator('#cwb-phone').getByText('10002',{exact:true}).waitFor();
  await frame.getByText('缓存译文',{exact:true}).waitFor();await frame.getByText('自动译文 New source',{exact:true}).waitFor();
  assert.equal(await frame.getByText('缓存译文',{exact:true}).evaluate(element=>getComputedStyle(element).color),'rgb(76, 29, 149)');
  assert.equal(await frame.locator('#cwb-auto-read-translation').isChecked(),true);
  assert.equal(await frame.locator('.cwb-translate-visible').count(),1);
  await frame.locator('.cwb-avatar img').waitFor();
  assert.equal(await frame.locator('.cwb-avatar img').evaluate(image=>getComputedStyle(image).objectFit),'cover');
  assert.equal(await frame.locator('.cwb-conversation-state.is-customer').textContent(),'待接待');
  assert.match(await frame.locator('.cwb-conversation-state.is-customer').getAttribute('title')||'',/最后消息来自客户/);
  const chatBefore=await frame.locator('.cwb-chat').boundingBox();
  await frame.locator('.cwb-nav-toggle').click();
  const chatAfter=await frame.locator('.cwb-chat').boundingBox();
  assert.ok(chatBefore&&chatAfter&&Math.abs(chatBefore.x-chatAfter.x)<=1,'折叠导航后聊天内容列起点保持不动');
  await frame.locator('.cwb-nav-toggle').click();
  const history=frame.locator('#cwb-history-state');
  assert.match(await history.textContent()||'',/已显示最新 20 条消息/);
  await frame.locator('#cwb-messages').evaluate(element=>element.dispatchEvent(new Event('scroll')));
  await frame.getByText('已读取更早消息。',{exact:true}).waitFor();
  await page.waitForTimeout(3200);
  assert.equal(await history.evaluate(element=>element.classList.contains('is-auto-hidden')),true);
  await frame.locator('.cwb-conversation').click();
  await history.waitFor();
  assert.equal(await history.evaluate(element=>element.classList.contains('is-auto-hidden')),false);
  assert.deepEqual(await application.evaluate(()=>globalThis.__workbenchTranslationCalls),[['new'],['new']]);
 }finally{await application?.close().catch(()=>{});await rm(directory,{recursive:true,force:true});}
});
