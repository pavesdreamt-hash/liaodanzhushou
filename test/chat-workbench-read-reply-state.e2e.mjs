import test from 'node:test';
import assert from 'node:assert/strict';
import {_electron as electron} from 'playwright-core';
import electronPath from 'electron';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const sleep=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));
async function waitFor(check,message){for(let attempt=0;attempt<30;attempt++){if(await check())return;await sleep(100);}throw new Error(message);}

test('打开已核对会话只请求该会话已读，回执立即更新已接待而不伪造未读',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'workbench-read-reply-'));let application;
 try{
  const packagedExecutable=process.env.KDOCS_TEST_EXECUTABLE;
  const args=packagedExecutable?[`--isolated-user-data=${directory}`,`--orders-test-user-data=${directory}`]:['.',`--isolated-user-data=${directory}`,`--orders-test-user-data=${directory}`];
  application=await electron.launch({executablePath:packagedExecutable||electronPath,args,cwd:path.resolve('.'),env:{...process.env,NODE_ENV:'test'}});
  const page=await application.firstWindow();
  await application.evaluate(({ipcMain})=>{
   const messagesByChat={
    'read-confirmed':[{id:'confirmed-customer',direction:'customer',text:'Confirmed fictional unread',sentAt:'2020-01-01T00:00:00.000Z',metadata:{messageType:'chat',media:[]}}],
    'read-pending':[{id:'pending-customer',direction:'customer',text:'Pending fictional unread',sentAt:'2020-01-01T00:01:00.000Z',metadata:{messageType:'chat',media:[]}}],
    'read-unverified':[{id:'unverified-customer',direction:'customer',text:'Unverified fictional unread',sentAt:'2020-01-01T00:02:00.000Z',metadata:{messageType:'chat',media:[]}}]
   };
   globalThis.__readReplyRows=[
    {phone:'971500000501',chatId:'read-confirmed',name:'Confirmed fixture',updatedAt:'2020-01-01T00:00:00.000Z',preview:'Confirmed fictional unread',direction:'customer',lastValidDirection:'customer',unreadCount:10},
    {phone:'971500000502',chatId:'read-pending',name:'Pending fixture',updatedAt:'2020-01-01T00:01:00.000Z',preview:'Pending fictional unread',direction:'customer',lastValidDirection:'customer',unreadCount:7},
    {phone:'971500000503',chatId:'read-unverified',name:'Unverified fixture',updatedAt:'2020-01-01T00:02:00.000Z',preview:'Unverified fictional unread',direction:'customer',lastValidDirection:'customer',unreadCount:2}
   ];
   globalThis.__readReplyMarkSeen=[];globalThis.__readReplySend=[];
   ipcMain.removeHandler('manual-chat');ipcMain.handle('manual-chat',async(_event,{action,payload={}})=>{
    if(action==='status')return {ok:true,data:{status:'online'}};
    if(action==='inbox')return {ok:true,data:{items:globalThis.__readReplyRows,total:globalThis.__readReplyRows.length,offset:0,hasMore:false}};
    if(action==='openInbox'){const row=globalThis.__readReplyRows.find(value=>value.chatId===payload.chatId),identityVerified=row.chatId!=='read-unverified';return {ok:true,data:{token:`${row.chatId}-token`,accountId:'wa-phone:971500000500',chatId:row.chatId,phone:row.phone,identityVerified,messages:messagesByChat[row.chatId],hasMore:false}};}
    if(action==='recent'){const chatId=String(payload.token||'').replace(/-token$/,'');return {ok:true,data:{messages:messagesByChat[chatId]||[],hasMore:false}};}
    if(action==='markSeen'){const chatId=String(payload.token||'').replace(/-token$/,'');globalThis.__readReplyMarkSeen.push(chatId);if(chatId==='read-confirmed')globalThis.__readReplyRows.find(value=>value.chatId===chatId).unreadCount=0;return {ok:true,data:{seen:true}};}
    if(action==='send'){globalThis.__readReplySend.push(payload);return {ok:true,data:{status:'sent',parts:[{kind:'text',status:'sent',id:'fictional-receipt'}]}};}
    return {ok:false,error:`unexpected manual-chat action: ${action}`};
   });
   ipcMain.removeHandler('manual-reply-translation');ipcMain.handle('manual-reply-translation',async()=>({ok:true,data:{translations:[]}}));
  });
  const frame=page.frameLocator('iframe.confirmed-frame');await frame.locator('.cwb-refresh').click();
  const confirmed=frame.locator('.cwb-conversation[data-chat-id="read-confirmed"]');await confirmed.click();
  await waitFor(async()=>((await application.evaluate(()=>globalThis.__readReplyMarkSeen)).join(','))==='read-confirmed','打开已核对会话必须只请求该会话已读');
  await waitFor(async()=>await confirmed.locator('.cwb-conversation-unread').count()===0,'WhatsApp 回传 0 后应移除当前会话红圈');
  assert.equal(await frame.locator('[data-filter="unread"] b').textContent(),'9','顶部未读必须由 WhatsApp 原始数 7 + 2 计算');

  const pending=frame.locator('.cwb-conversation[data-chat-id="read-pending"]');await pending.click();
  await waitFor(async()=>((await application.evaluate(()=>globalThis.__readReplyMarkSeen)).join(','))==='read-confirmed,read-pending','只可为当前已核对会话请求已读');
  assert.equal(await pending.locator('.cwb-conversation-unread').textContent(),'7','WhatsApp 尚未回传 0 时不能本地清除未读红圈');
  await frame.getByRole('button',{name:'英文翻译'}).click();const outgoing='Fictional verified reply';await frame.getByLabel('英文翻译').fill(outgoing);await frame.getByRole('button',{name:'发送确认'}).click();await frame.getByText('已真实发送并取得 WhatsApp 回执',{exact:true}).waitFor();
  await pending.getByText('已接待',{exact:true}).waitFor();assert.equal(await pending.locator('.cwb-conversation-unread').textContent(),'7','已验证发送回执不得改写 WhatsApp 原始未读数');assert.equal(await frame.locator('[data-filter="unreplied"] b').textContent(),'2','发送回执应立即把当前会话移出未回统计');assert.deepEqual(await application.evaluate(()=>globalThis.__readReplySend.map(value=>value.text)),[outgoing]);

  const unverified=frame.locator('.cwb-conversation[data-chat-id="read-unverified"]');await unverified.click();await sleep(300);assert.deepEqual(await application.evaluate(()=>globalThis.__readReplyMarkSeen),['read-confirmed','read-pending'],'号码未核对会话不得请求标记已读');
 }finally{try{application?.process().kill('SIGKILL');}catch{}await rm(directory,{recursive:true,force:true});}
});
