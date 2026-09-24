import test from 'node:test';
import assert from 'node:assert/strict';
import {_electron as electron} from 'playwright-core';
import electronPath from 'electron';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('newest chat is not opened automatically; an identity conflict is blocked while the correct chat remains usable',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'chat-identity-ui-'));let app;
 try{
  app=await electron.launch({executablePath:electronPath,args:['.',`--orders-test-user-data=${directory}`],cwd:path.resolve('.'),env:{...process.env,NODE_ENV:'test'}});
  const page=await app.firstWindow();
  page.setDefaultTimeout(5000);
  await app.evaluate(({ipcMain})=>{
   globalThis.__identityCalls=[];
   const accountId='wa-phone:971500000001',wrong='971500000003',correct='971500000002';
   ipcMain.removeHandler('manual-chat');
   ipcMain.handle('manual-chat',async(_event,{action,payload={}})=>{
    if(action==='status')return {ok:true,data:{status:'online'}};
    if(action==='inbox')return {ok:true,data:{items:[
     {phone:wrong,chatId:`wa-phone:${wrong}`,name:'Recent Fixture',updatedAt:'2026-09-23T10:00:00.000Z',preview:'WhatsApp 通知',direction:'customer',unreadCount:0},
     {phone:correct,chatId:`wa-phone:${correct}`,name:'Target Fixture',updatedAt:'2026-09-23T09:00:00.000Z',preview:'Hello',direction:'customer',unreadCount:0}
    ],total:2,offset:0,hasMore:false}};
    if(action==='openInbox'){
     globalThis.__identityCalls.push(payload.chatId);
     const target=correct;
     return {ok:true,data:{token:'fictional-identity',accountId,chatId:`wa-phone:${target}`,phone:target,identityVerified:true,messages:[{id:'fixture-hello',direction:'customer',text:'Hello',sentAt:'2026-09-23T09:00:00.000Z',metadata:{messageType:'chat',media:[]}}],hasMore:false}};
    }
    return {ok:true,data:null};
   });
  });
  const frame=page.frameLocator('iframe.confirmed-frame');
  await frame.locator('.cwb-refresh').click();
  assert.equal(await frame.locator('.cwb-top-version').textContent(),'1.8.3');
  await frame.locator('.cwb-conversation').first().waitFor();
  assert.equal(await frame.locator('#cwb-phone').textContent(),'请选择客户');
  assert.deepEqual(await app.evaluate(()=>globalThis.__identityCalls),[]);
  await frame.locator('.cwb-conversation').first().click();
  await frame.locator('#cwb-connection-note').getByText(/身份与列表号码不一致/).waitFor();
  assert.equal(await frame.locator('.cwb-message').count(),0);
  await frame.locator('.cwb-conversation').nth(1).click();
  await frame.locator('.cwb-message-text').getByText('Hello').waitFor();
  assert.equal(await frame.locator('#cwb-phone').textContent(),'971500000002');
 }finally{app?.process().kill('SIGKILL');await rm(directory,{recursive:true,force:true});}
});
