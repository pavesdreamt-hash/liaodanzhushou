import test from 'node:test';
import assert from 'node:assert/strict';
import {_electron as electron} from 'playwright-core';
import electronPath from 'electron';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('客户聊天将待处理会话、WhatsApp 未读消息和待回复会话分别统计',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'workbench-filter-badges-'));let application;
 try{
  application=await electron.launch({executablePath:process.env.KDOCS_TEST_EXECUTABLE||electronPath,args:[...(process.env.KDOCS_TEST_EXECUTABLE?[]:['.']),`--orders-test-user-data=${directory}`],cwd:path.resolve('.'),env:{...process.env,NODE_ENV:'test'}});
  const page=await application.firstWindow();
  await application.evaluate(({ipcMain})=>{
   globalThis.__chatCounterRows=[
    {phone:'971500000001',chatId:'counter-customer-unread',name:'',updatedAt:'2026-09-23T08:00:00.000Z',preview:'Customer unread',direction:'customer',lastValidDirection:'customer',unreadCount:3},
    {phone:'971500000002',chatId:'counter-merchant-unread',name:'',updatedAt:'2026-09-23T08:01:00.000Z',preview:'Merchant unread',direction:'merchant',lastValidDirection:'merchant',unreadCount:2},
    {phone:'971500000003',chatId:'counter-customer-read',name:'',updatedAt:'2026-09-23T08:02:00.000Z',preview:'Customer read',direction:'customer',lastValidDirection:'customer',unreadCount:0},
    // A system notice without a verified preceding message must not be guessed as unreplied.
    {phone:'971500000004',chatId:'counter-system',name:'',updatedAt:'2026-09-23T08:03:00.000Z',preview:'WhatsApp 系统通知。',direction:'customer',lastValidDirection:null,unreadCount:0}
   ];
   ipcMain.removeHandler('manual-chat');ipcMain.handle('manual-chat',async(_event,{action})=>({ok:true,data:action==='status'?{status:'online'}:action==='inbox'?{items:globalThis.__chatCounterRows,total:globalThis.__chatCounterRows.length,offset:0,hasMore:false}:null}));
   ipcMain.removeHandler('manual-reply-translation');ipcMain.handle('manual-reply-translation',async()=>({ok:true,data:{translations:[]}}));
  });
  const frame=page.frameLocator('iframe.confirmed-frame');await frame.locator('.cwb-refresh').click();
  assert.ok((await frame.locator('.cwb-list-title h1').textContent())?.startsWith('客户聊天'));
  assert.equal(await frame.locator('#cwb-count').count(),0);
  const expected={all:['需要处理的会话','3'],unread:['WhatsApp 未读消息','5'],unreplied:['待回复会话','2']};
  for(const [filter,[title,value]] of Object.entries(expected)){
   const button=frame.locator(`[data-filter="${filter}"]`),badge=button.locator('b');
   await badge.getByText(value,{exact:true}).waitFor();
   assert.equal(await button.getAttribute('title'),title);
   const style=await badge.evaluate(element=>{const range=element.ownerDocument.createRange();range.selectNodeContents(element);const outer=element.getBoundingClientRect(),inner=range.getBoundingClientRect();return {display:getComputedStyle(element).display,alignItems:getComputedStyle(element).alignItems,justifyContent:getComputedStyle(element).justifyContent,width:outer.width,height:outer.height,centerX:Math.abs(outer.left+outer.width/2-inner.left-inner.width/2),centerY:Math.abs(outer.top+outer.height/2-inner.top-inner.height/2),background:getComputedStyle(element).backgroundColor};});
   assert.equal(style.display,'flex');assert.equal(style.alignItems,'center');assert.equal(style.justifyContent,'center');assert.equal(style.width,18);assert.equal(style.height,18);assert.ok(style.centerX<=1&&style.centerY<=1,`${filter} 徽标中的 ${value} 必须居中：${JSON.stringify(style)}`);
   assert.equal(style.background,filter==='all'?'rgb(109, 76, 200)':'rgb(229, 72, 77)');
  }
  const rows=frame.locator('.cwb-conversation');
  assert.equal(await rows.count(),4);
  assert.equal(await rows.nth(0).locator('.cwb-conversation-unread').textContent(),'3');
  assert.equal(await rows.nth(1).locator('.cwb-conversation-unread').textContent(),'2');
  assert.equal(await rows.nth(2).locator('.cwb-conversation-unread').count(),0);
  assert.equal(await rows.nth(3).getByText('待核对',{exact:true}).count(),1);
  await frame.locator('[data-filter="unread"]').click();assert.equal(await rows.count(),2);
  await frame.locator('[data-filter="unreplied"]').click();assert.equal(await rows.count(),2);
  await frame.locator('[data-filter="all"]').click();assert.equal(await rows.count(),4);
  // Reading in another WhatsApp client does not reconnect this client. The
  // normal online poll must therefore reload native inbox metadata itself.
  await application.evaluate(()=>{globalThis.__chatCounterRows=[{phone:'971500000001',chatId:'counter-customer-unread',name:'',updatedAt:'2026-09-23T08:05:00.000Z',preview:'Read elsewhere',direction:'customer',lastValidDirection:'customer',unreadCount:0}];});
  await page.waitForTimeout(10_300);
  assert.equal(await rows.count(),1,'在线轮询应替换旧会话快照');
  assert.equal(await rows.nth(0).locator('.cwb-conversation-unread').count(),0,'平台已读后不应保留旧红圈');
  assert.equal(await frame.locator('[data-filter="unread"] b').isHidden(),true,'平台已读后顶部未读数应隐藏');
  assert.equal(await frame.locator('[data-filter="all"] b').textContent(),'1','最后有效客户消息仍是待处理会话');
  assert.equal(await frame.locator('[data-filter="unreplied"] b').textContent(),'1','已读不应误清除待回复状态');
  await application.evaluate(()=>{globalThis.__chatCounterRows=[{phone:'971500000005',chatId:'counter-empty',name:'',updatedAt:'2026-09-23T08:04:00.000Z',preview:'Handled',direction:'merchant',lastValidDirection:'merchant',unreadCount:0}];});
  await frame.locator('.cwb-refresh').click();
  for(const filter of ['all','unread','unreplied'])assert.equal(await frame.locator(`[data-filter="${filter}"] b`).isHidden(),true,`${filter} 为零时不应显示数字`);
  await mkdir('artifacts/chat-counters-2.0.10',{recursive:true});await page.screenshot({path:'artifacts/chat-counters-2.0.10/conversation-counters.png'});
 }finally{try{application?.process().kill('SIGKILL');}catch{}await rm(directory,{recursive:true,force:true});}
});
