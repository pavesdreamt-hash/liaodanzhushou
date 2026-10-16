import test from 'node:test';
import assert from 'node:assert/strict';
import {_electron as electron} from 'playwright-core';
import electronPath from 'electron';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('call notices recover old placeholders, skip media and translation, and keep genuine unknown/image behavior',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'call-notice-ui-')),executable=process.env.KDOCS_TEST_EXECUTABLE;let app;
 const output=process.env.CALL_NOTICE_OUTPUT||'artifacts/whatsapp-call-notices-3.6.2/ui';
 try{
  app=await electron.launch({executablePath:executable||electronPath,args:[...(executable?[]:['.']),`--orders-test-user-data=${directory}`,`--isolated-user-data=${directory}`],cwd:path.resolve('.'),env:{...process.env,NODE_ENV:'test'}});
  const page=await app.firstWindow();await mkdir(output,{recursive:true});
  await app.evaluate(({ipcMain})=>{
   const rows=[
    {id:'legacy-call',text:'[未知类型消息]',metadata:{messageType:'call_log',media:[{type:'call_log',status:'unavailable'}],note:'未知类型消息内容请在 WhatsApp 查看。'}},
    {id:'observed-missed-call',text:'[未知类型消息]',metadata:{messageType:'call_log',callLog:{outcome:'Missed',isVideo:false},media:[{type:'image',status:'unavailable'}]}},
    {id:'deleted-call-body',text:'通话记录已删除',metadata:{messageType:'call_log',media:[]}},
    {id:'missed-video',text:'[未知类型消息]',metadata:{messageType:'call_log',callLog:{outcome:'Missed',isVideo:true},media:[]}},
    {id:'future-unknown',text:'[未知类型消息]',metadata:{messageType:'future_kind',media:[{type:'future_kind',status:'unavailable'}]}},
    {id:'genuine-image',text:'[图片]',metadata:{messageType:'image',media:[{type:'image',status:'unavailable'}]}},
    {id:'real-text',text:'Hello',metadata:{messageType:'chat',media:[]}}
   ].map((row,i)=>({...row,direction:'customer',sentAt:`2026-09-30T07:${26+i}:00.000Z`}));
   globalThis.__callNoticeRequests={media:[],translation:[]};
   ipcMain.removeHandler('manual-chat');ipcMain.handle('manual-chat',async(_e,{action,payload={}})=>{
    if(action==='status')return {ok:true,data:{status:'online'}};
    if(action==='inbox')return {ok:true,data:{items:[{phone:'971500000002',chatId:'wa-phone:971500000002',name:'Call Notice Fixture',updatedAt:'2026-09-30T07:32:00.000Z',preview:'Hello',direction:'customer',lastValidDirection:'customer',unreadCount:0}],total:1,hasMore:false}};
    if(action==='openInbox'||action==='recent')return {ok:true,data:{token:'call-fixture',accountId:'wa-phone:971500000001',chatId:'wa-phone:971500000002',phone:'971500000002',identityVerified:true,messages:rows,hasMore:false}};
    if(action==='media'){globalThis.__callNoticeRequests.media.push(payload.messageId);return {ok:true,data:{...rows.find(row=>row.id==='genuine-image'),metadata:{messageType:'image',media:[{type:'image',status:'cached',dataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9JkXQAAAAASUVORK5CYII='}]}}};}
    return {ok:true,data:null};
   });
   ipcMain.removeHandler('manual-reply-translation');ipcMain.handle('manual-reply-translation',async(_e,{payload={}})=>{globalThis.__callNoticeRequests.translation.push(...(payload.messages||[]).map(row=>row.id));return {ok:true,data:{translations:(payload.messages||[]).map(row=>({id:row.id,text:'测试译文'}))}};});
  });
  const frame=page.frameLocator('iframe.confirmed-frame');await frame.locator('.cwb-refresh').click();await frame.locator('.cwb-conversation').click();
  const expected=[['legacy-call','通话记录。'],['observed-missed-call','未接语音通话。'],['deleted-call-body','通话记录已删除'],['missed-video','未接视频通话。']];
  const layouts=[];
  for(const [width,height] of [[1280,820],[1440,1000],[820,640]]){
   await app.evaluate(({BrowserWindow},size)=>BrowserWindow.getAllWindows()[0].setSize(...size),[width,height]);
   for(const [id,copy] of expected){
    const row=frame.locator(`[data-message-id="${id}"]`);await row.evaluate(el=>el.scrollIntoView({block:'center'}));
    assert.equal(await row.locator('.cwb-message-text').textContent(),copy);
    assert.equal(await row.locator('.cwb-message-media-status, .cwb-message-image, .cwb-translation-line button').count(),0);
    assert.equal(await row.locator('.cwb-translation-line').textContent(),'');
    assert.equal(await row.locator('[aria-label="翻译这条消息"]').isDisabled(),true);
    const bounds=await row.locator('.cwb-bubble').boundingBox();assert.ok(bounds&&bounds.width>50&&bounds.x>=0&&bounds.x+bounds.width<=width);
   }
   const target=frame.locator('[data-message-id="observed-missed-call"]');await target.evaluate(el=>el.scrollIntoView({block:'center'}));
   layouts.push(await page.evaluate(()=>({width:innerWidth,height:innerHeight})));
   await page.screenshot({path:path.join(output,`call-notices-${width}.png`)});
  }
  const unknown=frame.locator('[data-message-id="future-unknown"]');assert.match(await unknown.innerText(),/未知类型消息/);assert.equal(await unknown.locator('[data-system-notice]').count(),0);
  const image=frame.locator('[data-message-id="genuine-image"]');await image.evaluate(el=>el.scrollIntoView({block:'center'}));await image.locator('.cwb-message-image').waitFor();
  const text=frame.locator('[data-message-id="real-text"]');await text.evaluate(el=>el.scrollIntoView({block:'center'}));await text.locator('.cwb-translation-line').filter({hasText:'测试译文'}).waitFor();
  const calls=await app.evaluate(()=>globalThis.__callNoticeRequests);
  assert.ok(calls.media.includes('genuine-image'));assert.ok(calls.media.every(id=>id==='genuine-image'));assert.ok(calls.translation.includes('real-text'));assert.ok(calls.translation.every(id=>!expected.some(([notice])=>notice===id)));
  await writeFile(path.join(output,'result.json'),JSON.stringify({layouts,calls,notices:expected},null,2));
 }finally{try{app?.process().kill('SIGKILL');}catch{}await rm(directory,{recursive:true,force:true});}
});
