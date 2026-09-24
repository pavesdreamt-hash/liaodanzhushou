import test from 'node:test';
import assert from 'node:assert/strict';
import {_electron as electron} from 'playwright-core';
import electronPath from 'electron';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('客户聊天筛选徽标居中且三个筛选说明正确',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'workbench-filter-badges-'));let application;
 try{
  application=await electron.launch({executablePath:process.env.KDOCS_TEST_EXECUTABLE||electronPath,args:[...(process.env.KDOCS_TEST_EXECUTABLE?[]:['.']),`--orders-test-user-data=${directory}`],cwd:path.resolve('.'),env:{...process.env,NODE_ENV:'test'}});
  const page=await application.firstWindow();
  await application.evaluate(({ipcMain})=>{
   const rows=Array.from({length:20},(_,index)=>({phone:`97150000${String(index).padStart(4,'0')}`,chatId:`filter-${index}`,name:'',updatedAt:'2026-09-23T08:00:00.000Z',preview:'Fixture',direction:index<2?'customer':'merchant',unreadCount:index===0?3:index===1?120:0}));
   ipcMain.removeHandler('manual-chat');ipcMain.handle('manual-chat',async(_event,{action})=>({ok:true,data:action==='status'?{status:'online'}:action==='inbox'?{items:rows,total:rows.length,offset:0,hasMore:false}:null}));
   ipcMain.removeHandler('manual-reply-translation');ipcMain.handle('manual-reply-translation',async()=>({ok:true,data:{translations:[]}}));
  });
  const frame=page.frameLocator('iframe.confirmed-frame');await frame.locator('.cwb-refresh').click();
  const expected={all:['全部对话','20'],unread:['客户信息未读','2'],unreplied:['未回客户信息','2']};
  for(const [filter,[title,value]] of Object.entries(expected)){
   const button=frame.locator(`[data-filter="${filter}"]`),badge=button.locator('b');
   await badge.getByText(value,{exact:true}).waitFor();
   assert.equal(await button.getAttribute('title'),title);
   const style=await badge.evaluate(element=>{const range=element.ownerDocument.createRange();range.selectNodeContents(element);const outer=element.getBoundingClientRect(),inner=range.getBoundingClientRect();return {display:getComputedStyle(element).display,alignItems:getComputedStyle(element).alignItems,justifyContent:getComputedStyle(element).justifyContent,width:outer.width,height:outer.height,centerX:Math.abs(outer.left+outer.width/2-inner.left-inner.width/2),centerY:Math.abs(outer.top+outer.height/2-inner.top-inner.height/2)};});
   assert.equal(style.display,'flex');assert.equal(style.alignItems,'center');assert.equal(style.justifyContent,'center');assert.equal(style.width,18);assert.equal(style.height,18);assert.ok(style.centerX<=1&&style.centerY<=1,`${filter} 徽标中的 ${value} 必须居中：${JSON.stringify(style)}`);
  }
  const rows=frame.locator('.cwb-conversation');
  assert.equal(await rows.nth(0).locator('.cwb-conversation-unread').textContent(),'3');
  assert.equal(await rows.nth(0).locator('.cwb-conversation-unread').getAttribute('aria-label'),'3 条新消息');
  assert.equal(await rows.nth(1).locator('.cwb-conversation-unread').textContent(),'99+');
  assert.equal(await rows.nth(2).locator('.cwb-conversation-unread').count(),0);
  await mkdir('artifacts/send-1.8.5',{recursive:true});await page.screenshot({path:'artifacts/send-1.8.5/conversation-unread-badges.png'});
 }finally{try{application?.process().kill('SIGKILL');}catch{}await rm(directory,{recursive:true,force:true});}
});
