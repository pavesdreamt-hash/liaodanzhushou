import test from 'node:test';
import {readFileSync} from 'node:fs';
const appVersion=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')).version;
import assert from 'node:assert/strict';
import {_electron as electron} from 'playwright-core';
import electronPath from 'electron';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('three-dot menu hides and restores a fictional chat without touching its messages',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'hidden-chat-ui-'));let app;
 try{
  app=await electron.launch({executablePath:electronPath,args:['.',`--orders-test-user-data=${directory}`],cwd:path.resolve('.'),env:{...process.env,NODE_ENV:'test'}});
  const page=await app.firstWindow();page.setDefaultTimeout(7000);
  await app.evaluate(({ipcMain})=>{
   const ids=['wa-phone:971500000002','wa-phone:971500000003'];globalThis.__hiddenFixture=new Set();globalThis.__hiddenCalls=[];globalThis.__opened=[];
   ipcMain.removeHandler('manual-chat');ipcMain.handle('manual-chat',async(_event,{action,payload={}})=>{
    if(action==='status')return {ok:true,data:{status:'online'}};
    if(action==='inbox'){
     const items=ids.filter(id=>globalThis.__hiddenFixture.has(id)===Boolean(payload.hiddenOnly)).map((id,index)=>({phone:id.slice(9),chatId:id,name:'Fixture',updatedAt:`2026-09-24T10:0${index}:00.000Z`,preview:'Actual text',direction:'customer',unreadCount:0}));
     return {ok:true,data:{items:items.slice(payload.offset||0,(payload.offset||0)+(payload.limit||20)),total:items.length,offset:payload.offset||0,hasMore:false,hiddenChatCount:globalThis.__hiddenFixture.size}};
    }
    if(action==='setInboxHidden'){globalThis.__hiddenCalls.push(payload);if(payload.hidden)globalThis.__hiddenFixture.add(payload.chatId);else globalThis.__hiddenFixture.delete(payload.chatId);return {ok:true,data:payload};}
    if(action==='openInbox'){globalThis.__opened.push(payload.chatId);return {ok:true,data:{token:'fixture',accountId:'wa-phone:971500000001',chatId:payload.chatId,phone:payload.chatId.slice(9),identityVerified:true,messages:[{id:'kept',direction:'customer',text:'Actual text',sentAt:'2026-09-24T10:00:00.000Z',metadata:{messageType:'chat',media:[]}}],hasMore:false}};}
    return {ok:true,data:null};
   });
  });
  const frame=page.frameLocator('iframe.confirmed-frame');
  await frame.locator('.cwb-refresh').click();
  assert.equal(await frame.locator('.cwb-top-version').textContent(),appVersion);
  await frame.locator('.cwb-conversation').first().waitFor();
  await frame.locator('.cwb-conversation-wrap[data-chat-id="wa-phone:971500000002"] .cwb-conversation-more').click();
  assert.equal(await frame.locator('#app-hover-tip').isVisible(),false);
  if(process.env.CAPTURE_CHAT_MENU)await page.screenshot({path:process.env.CAPTURE_CHAT_MENU});
  await frame.getByRole('button',{name:'隐藏此会话'}).click();
  await frame.locator('.cwb-conversation-wrap[data-chat-id="wa-phone:971500000002"]').waitFor({state:'detached'});
  assert.equal(await frame.locator('.cwb-conversation').count(),1);
  assert.deepEqual(await app.evaluate(()=>globalThis.__opened),[]);
  await frame.locator('.cwb-hidden-toggle').click();
  await frame.locator('.cwb-conversation-wrap[data-chat-id="wa-phone:971500000002"]').waitFor();
  await frame.locator('.cwb-conversation-more').click();
  await frame.getByRole('button',{name:'恢复会话'}).click();
  await frame.locator('.cwb-conversation').first().waitFor({state:'detached'});
  await frame.locator('.cwb-hidden-toggle').click();
  await frame.locator('.cwb-conversation-wrap[data-chat-id="wa-phone:971500000002"] .cwb-conversation').click();
  await frame.locator('.cwb-message-text').getByText('Actual text').waitFor();
  assert.deepEqual(await app.evaluate(()=>globalThis.__hiddenCalls),[{chatId:'wa-phone:971500000002',hidden:true},{chatId:'wa-phone:971500000002',hidden:false}]);
 }finally{app?.process().kill('SIGKILL');await rm(directory,{recursive:true,force:true});}
});
