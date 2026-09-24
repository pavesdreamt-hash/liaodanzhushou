import test from 'node:test';
import assert from 'node:assert/strict';
import {_electron as electron} from 'playwright-core';
import electronPath from 'electron';
import {mkdtemp,rm,mkdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('notifications including stale attachment metadata show no media or translation; genuine image still renders',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'notice-ui-'));let app;
 try{
  app=await electron.launch({executablePath:electronPath,args:['.',`--orders-test-user-data=${directory}`],cwd:path.resolve('.'),env:{...process.env,NODE_ENV:'test'}});
  const page=await app.firstWindow();
  await app.evaluate(({ipcMain})=>{
   const rows=[
    {id:'notice-real-shape',direction:'merchant',text:'WhatsApp 商业账号类型已变更。',metadata:{messageType:'notification_template',media:[]}},
    {id:'notice-old-cache',direction:'customer',text:'[未知类型消息]',metadata:{messageType:'notification_template',media:[{type:'image',status:'unavailable'}]}},
    {id:'revoked',direction:'customer',text:'[未知类型消息]',metadata:{messageType:'revoked',media:[{type:'revoked',status:'unavailable'}]}},
    {id:'encrypt-notice',direction:'customer',text:'[未知类型消息]',metadata:{messageType:'e2e_notification',media:[{type:'e2e_notification',status:'unavailable'}]}},
    {id:'actual-image-fixture',direction:'merchant',text:'[图片]',metadata:{messageType:'image',media:[{type:'image',status:'unavailable'}]}},
    {id:'text',direction:'customer',text:'Hello',metadata:{messageType:'chat',media:[]}}
   ].map((x,i)=>({...x,sentAt:`2026-09-23T08:0${i}:00.000Z`}));
   globalThis.__noticeCalls={media:[],translation:[]};
   ipcMain.removeHandler('manual-chat');ipcMain.handle('manual-chat',async(_e,{action,payload={}})=>{
    if(action==='status')return {ok:true,data:{status:'online'}};
    if(action==='inbox')return {ok:true,data:{items:[{phone:'971500000002',chatId:'wa-phone:971500000002',name:'Notice Fixture',updatedAt:'2026-09-23T08:04:00.000Z',preview:'Hello',direction:'customer',unreadCount:0}],total:1,hasMore:false}};
    if(action==='openInbox'||action==='recent')return {ok:true,data:{token:'notice-fixture',accountId:'wa-phone:971500000001',chatId:'wa-phone:971500000002',phone:'971500000002',messages:rows,hasMore:false}};
    if(action==='media'){globalThis.__noticeCalls.media.push(payload.messageId);return {ok:true,data:{...rows.find(row=>row.id==='actual-image-fixture'),metadata:{messageType:'image',media:[{type:'image',status:'cached',dataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9JkXQAAAAASUVORK5CYII='}]}}};}
    return {ok:true,data:null};
   });
   ipcMain.removeHandler('manual-reply-translation');ipcMain.handle('manual-reply-translation',async(_e,{payload={}})=>{globalThis.__noticeCalls.translation.push(...(payload.messages||[]).map(x=>x.id));return {ok:true,data:{translations:(payload.messages||[]).map(x=>({id:x.id,text:'测试译文'}))}};});
  });
  const frame=page.frameLocator('iframe.confirmed-frame');await frame.locator('.cwb-refresh').click();await frame.locator('.cwb-conversation').click();
  await frame.locator('.cwb-message-image').waitFor();
  for(const width of [1280,1440]){
   await app.evaluate(({BrowserWindow},width)=>BrowserWindow.getAllWindows()[0].setSize(width,width===1280?820:1000),width);
   for(const [id,copy] of [['notice-real-shape','WhatsApp 商业账号类型已变更。'],['notice-old-cache','WhatsApp 系统通知。'],['revoked','此消息已撤回。'],['encrypt-notice','WhatsApp 加密通知。']]){
    const row=frame.locator(`[data-message-id="${id}"]`);await row.evaluate(el=>el.scrollIntoView({block:"nearest"}));
    assert.equal(await row.locator('.cwb-message-text').textContent(),copy);
    assert.equal(await row.locator('.cwb-message-media-status, .cwb-message-image, .cwb-translation-line button').count(),0);
    assert.equal(await row.locator('.cwb-translation-line').textContent(),'');
   }
  }
  const calls=await app.evaluate(()=>globalThis.__noticeCalls);
  assert.ok(calls.media.length>0);assert.ok(calls.media.every(id=>id==='actual-image-fixture'));
  assert.ok(calls.translation.every(id=>!['notice-real-shape','notice-old-cache','revoked','encrypt-notice'].includes(id)));
  await mkdir('artifacts/media-step2',{recursive:true});await page.screenshot({path:'artifacts/media-step2/system-notices-fixture.png'});
 }finally{try{app?.process().kill('SIGKILL');}catch{}await rm(directory,{recursive:true,force:true});}
});
