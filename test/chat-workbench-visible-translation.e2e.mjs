import test from 'node:test';
import {readFileSync} from 'node:fs';
const appVersion=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')).version;
import assert from 'node:assert/strict';
import {_electron as electron} from 'playwright-core';
import electronPath from 'electron';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const row=index=>({id:`translation-${index}`,direction:index%2?'merchant':'customer',text:`Source ${index}: the customer message is intentionally long enough to take several lines in the chat viewport, so the visible translation queue can be measured without using real customer data.`,sentAt:`2026-09-23T10:${String(index).padStart(2,'0')}:00.000Z`});
const visibleIds=root=>{const bounds=root.getBoundingClientRect();return Array.from(root.querySelectorAll('article.cwb-message')).filter(item=>{const rect=item.getBoundingClientRect();return rect.bottom>bounds.top&&rect.top<bounds.bottom;}).map(item=>item.dataset.messageId);};

test('自动翻译只处理当前视口，并在译文插入后保持阅读位置',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'workbench-visible-translation-'));let application;
 try{
  application=await electron.launch({executablePath:process.env.KDOCS_TEST_EXECUTABLE||electronPath,args:[...(process.env.KDOCS_TEST_EXECUTABLE?[]:['.']),`--orders-test-user-data=${directory}`],cwd:path.resolve('.'),env:{...process.env,NODE_ENV:'test'}});
  const page=await application.firstWindow();
  await application.evaluate(({ipcMain})=>{
   globalThis.__translationRows=Array.from({length:40},(_value,index)=>({id:`translation-${index}`,direction:index%2?'merchant':'customer',text:`Source ${index}: the customer message is intentionally long enough to take several lines in the chat viewport, so the visible translation queue can be measured without using real customer data.`,sentAt:`2026-09-23T10:${String(index).padStart(2,'0')}:00.000Z`}));
   globalThis.__translationCalls=[];
   ipcMain.removeHandler('manual-chat');ipcMain.handle('manual-chat',async(_event,{action})=>({ok:true,data:action==='status'?{status:'online'}:action==='inbox'?{items:[{phone:'971500000002',chatId:'wa-phone:971500000002',name:'Translation Fixture',updatedAt:'2026-09-23T10:39:00.000Z',preview:'Source',direction:'customer',unreadCount:0}],total:1,offset:0,hasMore:false}:action==='openInbox'||action==='recent'?{token:'translation-binding',accountId:'wa-phone:971500000001',chatId:'wa-phone:971500000002',phone:'971500000002',messages:globalThis.__translationRows,hasMore:false}:null}));
   ipcMain.removeHandler('manual-reply-translation');ipcMain.handle('manual-reply-translation',async(_event,{action,payload})=>{if(action==='chat-cache')return {ok:true,data:{translations:[]}};if(action==='chat-translate'){globalThis.__translationCalls.push(payload.messages.map(message=>message.id));await new Promise(resolve=>setTimeout(resolve,120));return {ok:true,data:{translations:payload.messages.map(message=>({id:message.id,text:`译文 ${message.id}`}))}};}return {ok:false,error:'unexpected action'};});
  });
  const frame=page.frameLocator('iframe.confirmed-frame');await frame.locator('.cwb-refresh').click();assert.equal(await frame.locator('.cwb-top-version').textContent(),appVersion);await frame.locator('.cwb-conversation').click();
  const messagePane=frame.locator('#cwb-messages');const initialVisible=await messagePane.evaluate(visibleIds);await page.waitForTimeout(400);
  const initialCalls=await application.evaluate(()=>globalThis.__translationCalls.flat());assert.ok(initialCalls.length>0,'当前视口应开始翻译');assert.ok(initialCalls.every(id=>initialVisible.includes(id)),'屏幕外消息不能进入初始自动翻译请求');assert.ok(initialCalls.length<40,'不得一次翻译全部历史消息');
  await frame.locator('[data-message-id="translation-0"]').scrollIntoViewIfNeeded();
  const anchor=await messagePane.evaluate(root=>{const bounds=root.getBoundingClientRect(),item=Array.from(root.querySelectorAll('article.cwb-message')).find(value=>{const rect=value.getBoundingClientRect();return rect.bottom>bounds.top&&rect.top<bounds.bottom;});return {id:item?.dataset.messageId||'',top:item?.getBoundingClientRect().top||0};});
  await frame.getByText('译文 translation-0',{exact:true}).waitFor();
  const after=await frame.locator(`[data-message-id="${anchor.id}"]`).boundingBox();assert.ok(after&&Math.abs(after.y-anchor.top)<=1,`译文写入后当前锚点应稳定，偏移为 ${after?after.y-anchor.top:'missing'} px`);
  const allCalls=await application.evaluate(()=>globalThis.__translationCalls.flat());assert.ok(allCalls.includes('translation-0'),'滚动到新位置后才翻译新视口中的消息');
 }finally{try{application?.process().kill('SIGKILL');}catch{}await rm(directory,{recursive:true,force:true});}
});
