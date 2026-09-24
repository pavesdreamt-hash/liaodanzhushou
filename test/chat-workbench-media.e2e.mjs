import test from 'node:test';
import {readFileSync} from 'node:fs';
const appVersion=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')).version;
import assert from 'node:assert/strict';
import {_electron as electron} from 'playwright-core';
import electronPath from 'electron';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const imageData='data:image/png;base64,'+readFileSync(new URL('../assets/app-icon-1024.png',import.meta.url)).toString('base64');
const imageRow=index=>({id:`media-${index}`,direction:index%2?'merchant':'customer',text:'[图片]',sentAt:`2026-09-23T08:${String(index).padStart(2,'0')}:00.000Z`,metadata:{messageType:index===0?'unknown':'image',note:'图片正在读取；暂时不能显示时请在 WhatsApp 查看。',media:[{type:index===0?'unknown':'image',status:'unavailable'}]}});

test('聊天窗口只读取进入当前视口的图片，滚动到图片后才读取该条',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'workbench-media-'));let application;
 try{
  application=await electron.launch({executablePath:process.env.KDOCS_TEST_EXECUTABLE||electronPath,args:[...(process.env.KDOCS_TEST_EXECUTABLE?[]:['.']),`--orders-test-user-data=${directory}`],cwd:path.resolve('.'),env:{...process.env,NODE_ENV:'test'}});
  const page=await application.firstWindow();
  await application.evaluate(({ipcMain},imageData)=>{
   globalThis.__mediaRows=Array.from({length:40},(_value,index)=>({id:`media-${index}`,direction:index%2?'merchant':'customer',text:'[图片]',sentAt:`2026-09-23T08:${String(index).padStart(2,'0')}:00.000Z`,metadata:{messageType:index===0?'unknown':'image',note:'图片正在读取；暂时不能显示时请在 WhatsApp 查看。',media:[{type:index===0?'unknown':'image',status:'unavailable'}]}}));
   globalThis.__mediaCalls=[];globalThis.__mediaForced=[];globalThis.__mediaActive=0;globalThis.__mediaMaximum=0;globalThis.__mediaFailureOnce=true;
   ipcMain.removeHandler('manual-chat');ipcMain.handle('manual-chat',async(_event,{action,payload={}})=>{
    if(action==='status')return {ok:true,data:{status:'online'}};
    if(action==='inbox')return {ok:true,data:{items:[{phone:'971500000002',chatId:'wa-phone:971500000002',name:'Media Fixture',updatedAt:'2026-09-23T08:39:00.000Z',preview:'[图片]',direction:'customer',unreadCount:0},{phone:'971500000003',chatId:'wa-phone:971500000003',name:'Other Fixture',updatedAt:'2026-09-22T08:39:00.000Z',preview:'Second chat',direction:'customer',unreadCount:0}],total:2,offset:0,hasMore:false}};
    if((action==='openInbox'&&payload.chatId==='wa-phone:971500000003')||(action==='recent'&&payload.token==='other-binding'))return {ok:true,data:{token:'other-binding',accountId:'wa-phone:971500000001',chatId:'wa-phone:971500000003',phone:'971500000003',messages:[{id:'other-1',direction:'customer',text:'Second chat',sentAt:'2026-09-22T08:39:00.000Z',metadata:{messageType:'chat',media:[]}}],hasMore:false}};
    if(action==='openInbox'||action==='recent')return {ok:true,data:{token:'media-binding',accountId:'wa-phone:971500000001',chatId:'wa-phone:971500000002',phone:'971500000002',messages:globalThis.__mediaRows,hasMore:false}};
    if(action==='media'){globalThis.__mediaCalls.push(payload.messageId);if(payload.force)globalThis.__mediaForced.push(payload.messageId);globalThis.__mediaActive++;globalThis.__mediaMaximum=Math.max(globalThis.__mediaMaximum,globalThis.__mediaActive);await new Promise(resolve=>setTimeout(resolve,90));globalThis.__mediaActive--;if(payload.messageId==='media-39'&&globalThis.__mediaFailureOnce){globalThis.__mediaFailureOnce=false;return {ok:false,error:'临时读取失败'};}const row=globalThis.__mediaRows.find(value=>value.id===payload.messageId),dataUrl=payload.messageId==='media-0'&&!payload.force?'data:image/png;base64,YmFk':imageData;return {ok:true,data:row?{...row,metadata:{...row.metadata,note:null,media:[{type:'image',status:'cached',dataUrl}]}}:null};}
    return {ok:true,data:null};
   });
   ipcMain.removeHandler('manual-reply-translation');ipcMain.handle('manual-reply-translation',async()=>({ok:true,data:{translations:[]}}));
  },imageData);
  const frame=page.frameLocator('iframe.confirmed-frame');await frame.locator('.cwb-refresh').click();assert.equal(await frame.locator('.cwb-top-version').textContent(),appVersion);await frame.locator('.cwb-conversation').first().click();
  await frame.locator('.cwb-message-image').first().waitFor();
  assert.deepEqual(await frame.locator('.cwb-message-image').first().evaluate(image=>({complete:image.complete,width:image.naturalWidth,height:image.naturalHeight})),{complete:true,width:1024,height:1024});
  await frame.locator('.cwb-image-open').first().click();
  const lightbox=frame.locator('dialog.cwb-image-lightbox');await lightbox.waitFor();
  assert.equal(await lightbox.evaluate(dialog=>dialog.open),true);
  assert.deepEqual(await lightbox.locator('img').evaluate(image=>({complete:image.complete,width:image.naturalWidth,height:image.naturalHeight})),{complete:true,width:1024,height:1024});
  await page.screenshot({path:path.resolve('artifacts/media-step3/image-zoom-fixture.png')});
  await lightbox.locator('img').click();assert.equal(await lightbox.locator('img').evaluate(image=>image.classList.contains('is-full-size')),true);
  await lightbox.locator('.cwb-image-lightbox-close').click();assert.equal(await frame.locator('dialog.cwb-image-lightbox').count(),0);
  const initialCalls=await application.evaluate(()=>globalThis.__mediaCalls.slice());
  assert.ok(await application.evaluate(()=>globalThis.__mediaMaximum)<=2,'最多两张图片并行读取');
  for(const id of [36,37,38])await frame.locator(`[data-message-id="media-${id}"] .cwb-message-image`).waitFor();
  await frame.locator('[data-message-id="media-38"] .cwb-message-image').evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await frame.locator('[data-message-id="media-39"]').scrollIntoViewIfNeeded();
  const retry=frame.locator('[data-message-id="media-39"] .cwb-media-retry');await retry.waitFor();await retry.scrollIntoViewIfNeeded();
  const anchorBefore=await frame.locator('.cwb-messages').evaluate(container=>{const bounds=container.getBoundingClientRect(),row=[...container.querySelectorAll('article.cwb-message')].find(el=>{const rect=el.getBoundingClientRect();return rect.bottom>bounds.top&&rect.top<bounds.bottom;});return {id:row?.dataset.messageId,top:row?.getBoundingClientRect().top,scroll:container.scrollTop,height:container.scrollHeight,client:container.clientHeight};});
  await retry.click();await frame.locator('[data-message-id="media-39"] .cwb-message-image').waitFor();
  await frame.locator('[data-message-id="media-39"] .cwb-message-image').evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const anchorAfter=await frame.locator(`[data-message-id="${anchorBefore.id}"]`).evaluate(el=>el.getBoundingClientRect().top);
  assert.ok(Math.abs(anchorAfter-anchorBefore.top)<12,`图片重试后阅读位置应保持稳定：${JSON.stringify({anchorBefore,anchorAfter})}`);
  assert.ok(initialCalls.length>0,'当前视口至少读取一张图片');assert.ok(initialCalls.length<40,'当前视口外的历史图片不应一并读取');assert.ok(initialCalls.every(id=>Number(id.replace('media-',''))>=28),'初始只读取底部当前可见图片');
  await frame.locator('[data-message-id="media-0"]').evaluate(el=>el.scrollIntoView({block:'nearest'}));
  const decodeRetry=frame.locator('[data-message-id="media-0"] .cwb-media-retry');await decodeRetry.waitFor();await decodeRetry.click();
  await frame.locator('[data-message-id="media-0"] .cwb-message-image').waitFor();
  assert.deepEqual(await frame.locator('[data-message-id="media-0"] .cwb-message-image').evaluate(image=>({complete:image.complete,width:image.naturalWidth,height:image.naturalHeight})),{complete:true,width:1024,height:1024});
  assert.deepEqual(await application.evaluate(()=>globalThis.__mediaForced.slice()),['media-0'],'坏图重试应绕过旧缓存');
  const afterScroll=await application.evaluate(()=>globalThis.__mediaCalls.slice());
  assert.ok(afterScroll.includes('media-0'),'未知类型但有附件的图片进入视口后应实际读取并显示');
  await frame.locator('.cwb-conversation').nth(1).click();await frame.locator('.cwb-message-text').filter({hasText:'Second chat'}).waitFor();
  assert.equal(await frame.locator('.cwb-message-image').count(),0,'切换会话后旧图片不能留在新聊天');
  assert.equal(await frame.locator('dialog.cwb-image-lightbox').count(),0);
 }finally{try{application?.process().kill('SIGKILL');}catch{}await rm(directory,{recursive:true,force:true});}
});
