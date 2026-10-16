import test from 'node:test';
import assert from 'node:assert/strict';
import {_electron as electron} from 'playwright-core';
import electronPath from 'electron';
import {mkdtemp,rm,mkdir,writeFile,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('native safety notices display centered with no human sender, media, actions or translation; normal messages keep their layout',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'security-notice-ui-')),executable=process.env.KDOCS_TEST_EXECUTABLE,output=process.env.SECURITY_NOTICE_OUTPUT||'artifacts/whatsapp-system-notices-3.6.3/ui';let app;
 try{
  app=await electron.launch({executablePath:executable||electronPath,args:[...(executable?[]:['.']),`--orders-test-user-data=${directory}`,`--isolated-user-data=${directory}`],cwd:path.resolve('.'),env:{...process.env,NODE_ENV:'test'}});
  const page=await app.firstWindow();page.setDefaultTimeout(15000);await mkdir(output,{recursive:true});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const runtime=await app.evaluate(({app},directory)=>({packaged:app.isPackaged,version:app.getVersion(),isolated:app.getPath('userData')===directory,arch:process.arch}),directory);
  assert.equal(runtime.version,JSON.parse(await readFile('package.json','utf8')).version);assert.equal(runtime.isolated,true);if(executable){assert.equal(runtime.packaged,true);assert.equal(runtime.arch,'x64');}
  await app.evaluate(({ipcMain})=>{
   const rows=[
    {id:'normal-customer',direction:'customer',text:'Ky42 how much',sentAt:'2026-08-27T02:18:00.000Z',metadata:{messageType:'chat',media:[]}},
    {id:'normal-merchant',direction:'merchant',text:'The regular price is AED 440.',sentAt:'2026-08-27T10:02:00.000Z',metadata:{messageType:'chat',deliveryAck:3,media:[]}},
    {id:'hosted-merchant',direction:'merchant',text:'WhatsApp 商业账号类型已变更。',sentAt:'2026-08-31T01:50:57.000Z',metadata:{messageType:'notification_template',notificationSubtype:'biz_account_type_changed_to_hosted',deliveryAck:3,media:[{type:'image',status:'unavailable'}]}},
    {id:'hosted-customer',direction:'customer',text:'WhatsApp 商业账号类型已变更。',sentAt:'2026-09-21T11:40:04.000Z',metadata:{messageType:'notification_template',notificationSubtype:'biz_account_type_changed_to_hosted',media:[]}},
    {id:'encryption-now',direction:'customer',text:'WhatsApp 加密通知。',sentAt:'2026-10-16T07:12:30.000Z',metadata:{messageType:'e2e_notification',notificationSubtype:'encrypt_now',media:[{type:'e2e_notification',status:'unavailable'}]}},
    {id:'hosted-legacy',direction:'merchant',text:'WhatsApp 商业账号类型已变更。',sentAt:'2026-10-16T07:13:30.000Z',metadata:{messageType:'notification_template',media:[]}},
    {id:'unknown-security',direction:'customer',text:'[未知类型消息]',sentAt:'2026-10-16T07:14:30.000Z',metadata:{messageType:'e2e_notification',notificationSubtype:'future_security',media:[]}},
    {id:'long-notice',direction:'customer',text:'原始系统通知内容（保留正文）：'+('请核对当前聊天中的安全提示。'.repeat(24)),sentAt:'2026-10-16T07:15:30.000Z',metadata:{messageType:'notification_template',notificationSubtype:'future_notice',media:[]}}
   ];
   globalThis.__securityNoticeCalls={media:[],translation:[],send:0};
   ipcMain.removeHandler('manual-chat');ipcMain.handle('manual-chat',async(_e,{action,payload={}})=>{
    if(action==='status')return {ok:true,data:{status:'online'}};
    if(action==='inbox')return {ok:true,data:{items:[{phone:'971500000002',chatId:'wa-phone:971500000002',name:'Security Notice Fixture',updatedAt:'2026-10-16T07:12:30.000Z',preview:'WhatsApp 安全通知',direction:'merchant',lastValidDirection:'merchant',unreadCount:0}],total:1,hasMore:false}};
    if(action==='openInbox'||action==='recent')return {ok:true,data:{token:'security-fixture',accountId:'wa-phone:971500000001',chatId:'wa-phone:971500000002',phone:'971500000002',identityVerified:true,messages:rows,hasMore:false}};
    if(action==='media')globalThis.__securityNoticeCalls.media.push(payload.messageId);
    if(action==='send')globalThis.__securityNoticeCalls.send++;
    if(action==='markSeen')return {ok:true,data:{seen:true}};
    return {ok:true,data:null};
   });
   ipcMain.removeHandler('manual-reply-translation');ipcMain.handle('manual-reply-translation',async(_e,{payload={}})=>{globalThis.__securityNoticeCalls.translation.push(...(payload.messages||[]).map(x=>x.id));return {ok:true,data:{translations:(payload.messages||[]).map(x=>({id:x.id,text:'虚构译文'}))}};});
  });
  const frame=page.frameLocator('iframe.confirmed-frame');await frame.locator('.cwb-refresh').click();await frame.locator('.cwb-conversation').click();
  const expected=[['hosted-merchant','此商家正使用 Meta 提供的安全服务来管理此聊天。'],['hosted-customer','此商家正使用 Meta 提供的安全服务来管理此聊天。'],['encryption-now','消息和通话现已进行端到端加密。只有此聊天中的成员可以查看、收听或分享。'],['hosted-legacy','此商家正使用 Meta 提供的安全服务来管理此聊天。'],['unknown-security','WhatsApp 安全通知。']];
  const layouts=[];
  for(const [width,height] of [[1280,820],[1440,1000],[820,640]]){
   await app.evaluate(({BrowserWindow},size)=>BrowserWindow.getAllWindows()[0].setSize(...size),[width,height]);
   for(const [id,copy] of expected){
    const row=frame.locator(`[data-message-id="${id}"]`);await row.evaluate(el=>el.scrollIntoView({block:'center'}));
    assert.equal(await row.getAttribute('role'),'note');assert.equal(await row.locator('.cwb-message-text').textContent(),copy);
    assert.equal(await row.locator('.cwb-message-avatar, .cwb-message-meta, .cwb-message-actions, .cwb-translation-line, .cwb-message-delivery, .cwb-message-media-status, .cwb-message-image').count(),0);
    assert.equal(await row.locator('time').getAttribute('datetime'),id==='hosted-merchant'?'2026-08-31T01:50:57.000Z':id==='hosted-customer'?'2026-09-21T11:40:04.000Z':id==='encryption-now'?'2026-10-16T07:12:30.000Z':id==='hosted-legacy'?'2026-10-16T07:13:30.000Z':'2026-10-16T07:14:30.000Z');
    const geometry=await frame.locator('#cwb-messages').evaluate((parent,id)=>{const r=parent.querySelector(`[data-message-id="${id}"]`).getBoundingClientRect(),p=parent.getBoundingClientRect();return{left:r.left,right:r.right,center:(r.left+r.right)/2,parentCenter:(p.left+p.right)/2};},id);
    assert.ok(geometry.left>=0&&geometry.right<=width);assert.ok(Math.abs(geometry.center-geometry.parentCenter)<=9);
   }
   const long=frame.locator('[data-message-id="long-notice"]');await long.evaluate(el=>el.scrollIntoView({block:'center'}));assert.equal(await long.evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
   const protectedRows=[];for(const id of ['normal-customer','normal-merchant']){const row=frame.locator(`[data-message-id="${id}"]`);assert.equal(await row.locator('.cwb-bubble').count(),1);assert.equal(await row.locator('.cwb-message-meta').count(),1);protectedRows.push(await row.locator('.cwb-bubble').evaluate(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return{width:r.width,height:r.height,font:s.font,fontSize:s.fontSize,color:s.color,background:s.backgroundColor,borderRadius:s.borderRadius};}));}
   assert.equal(await frame.locator('[data-message-id="normal-merchant"] .cwb-message-delivery.is-read').count(),1);
   const target=frame.locator('[data-message-id="encryption-now"]');await target.evaluate(el=>el.scrollIntoView({block:'center'}));
   layouts.push({...(await page.evaluate(()=>({width:innerWidth,height:innerHeight}))),protectedRows});await page.screenshot({path:path.join(output,`security-notices-${width}.png`)});
  }
  const normal=frame.locator('[data-message-id="normal-customer"]');await normal.evaluate(el=>el.scrollIntoView({block:'center'}));await normal.locator('.cwb-translation-line').filter({hasText:'虚构译文'}).waitFor();
  const calls=await app.evaluate(()=>globalThis.__securityNoticeCalls);assert.deepEqual(calls.media,[]);assert.equal(calls.send,0);assert.ok(calls.translation.includes('normal-customer'));assert.ok(calls.translation.every(id=>id==='normal-customer'||id==='normal-merchant'));assert.deepEqual(errors,[]);
  assert.equal(await frame.locator('.cwb-filters [data-filter="unreplied"] b').isVisible(),false);
  await writeFile(path.join(output,'result.json'),JSON.stringify({runtime,layouts,calls,errors,expected},null,2));
 }finally{try{app?.process().kill('SIGKILL');}catch{}await rm(directory,{recursive:true,force:true});}
});
