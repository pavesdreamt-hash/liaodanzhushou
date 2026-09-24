import test from 'node:test';
import assert from 'node:assert/strict';
import {_electron as electron} from 'playwright-core';
import electronPath from 'electron';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const row=n=>({id:`history-${n}`,direction:n%2?'merchant':'customer',text:`History message ${n} `.repeat(16),sentAt:`2026-09-07T${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}:00.000Z`,metadata:{messageType:'chat',media:[]}});
test('a short refresh does not erase visible messages or already loaded older pages',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'history-retention-'));let app;
 try{
  app=await electron.launch({executablePath:electronPath,args:['.',`--orders-test-user-data=${directory}`],cwd:path.resolve('.'),env:{...process.env,NODE_ENV:'test'}});
  const page=await app.firstWindow();
  await app.evaluate(({ipcMain})=>{
   globalThis.__historyFixture={short:false,calls:[]};
   const row=n=>({id:`history-${n}`,direction:n%2?'merchant':'customer',text:`History message ${n} `.repeat(16),sentAt:`2026-09-07T${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}:00.000Z`,metadata:{messageType:'chat',media:[]}});
   ipcMain.removeHandler('manual-chat');ipcMain.handle('manual-chat',async(_e,{action,payload={}})=>{
    if(action==='status')return {ok:true,data:{status:'online'}};
    if(action==='inbox')return {ok:true,data:{items:[{phone:'971500000002',chatId:'wa-phone:971500000002',name:'History Fixture',updatedAt:'2026-09-07T00:25:00.000Z',preview:'History message',direction:'customer',unreadCount:0}],total:1,offset:0,hasMore:false}};
    if(action==='openInbox')return {ok:true,data:{token:'history-fixture',accountId:'wa-phone:971500000001',chatId:'wa-phone:971500000002',phone:'971500000002',messages:Array.from({length:20},(_,i)=>row(i+6)),hasMore:true}};
    if(action==='recent'){globalThis.__historyFixture.calls.push(payload);if(payload.before)return {ok:true,data:{messages:Array.from({length:5},(_,i)=>row(i+1)),hasMore:false}};return {ok:true,data:{messages:globalThis.__historyFixture.short?[row(25)]:Array.from({length:20},(_,i)=>row(i+6)),hasMore:!globalThis.__historyFixture.short,historyPartial:globalThis.__historyFixture.short,sourceCount:globalThis.__historyFixture.short?1:20}};}
    return {ok:true,data:null};
   });
   ipcMain.removeHandler('manual-reply-translation');ipcMain.handle('manual-reply-translation',async()=>({ok:true,data:{translations:[]}}));
  });
  const frame=page.frameLocator('iframe.confirmed-frame');await frame.locator('.cwb-refresh').click();await frame.locator('.cwb-conversation').click();
  await frame.locator('[data-message-id="history-25"]').waitFor();
  await frame.locator('#cwb-messages').evaluate(el=>{el.scrollTop=0;el.dispatchEvent(new Event('scroll'));});
  await frame.locator('[data-message-id="history-1"]').waitFor();
  assert.equal(await frame.locator('article.cwb-message').count(),25);
  await app.evaluate(()=>{globalThis.__historyFixture.short=true;});
  await frame.locator('.cwb-refresh').click();
  assert.equal(await frame.locator('article.cwb-message').count(),25);
  assert.equal(await frame.locator('[data-message-id="history-1"]').count(),1);
  assert.equal(await frame.locator('[data-message-id="history-25"]').count(),1);
  assert.match(await frame.locator('#cwb-history-state').textContent(),/WhatsApp 本次仅返回 1 条/);
 }finally{await app?.close();await rm(directory,{recursive:true,force:true});}
});
