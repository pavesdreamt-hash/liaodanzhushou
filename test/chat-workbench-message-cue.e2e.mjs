import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {_electron as electron} from 'playwright-core';
import electronPath from 'electron';
import {mkdtemp,rm,mkdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const evidence=path.resolve('artifacts/message-cue-1.5.4');
const appVersion=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')).version;
test('提示点实际隐藏：向上滚轮、迟到响应、连续轮询、失败提示与恢复', {timeout:110000},async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'workbench-message-cue-'));let app;
 try{
  await mkdir(evidence,{recursive:true});
  app=await electron.launch({executablePath:electronPath,args:['.',`--orders-test-user-data=${directory}`],cwd:path.resolve('.'),env:{...process.env,NODE_ENV:'test'}});
  const page=await app.firstWindow();
  await app.evaluate(({ipcMain})=>{
   globalThis.cueFixture={mode:'success',calls:0,rows:Array.from({length:35},(_,i)=>({id:`fictional-${i}`,direction:'customer',text:`Fictional message ${i}: scrolling verification only.`,sentAt:new Date(Date.UTC(2026,8,22,8,i)).toISOString()}))};
   ipcMain.removeHandler('manual-chat');
   ipcMain.handle('manual-chat',async(_event,{action})=>{
    const f=globalThis.cueFixture;
    if(action==='status')return {ok:true,data:{status:'online'}};
    if(action==='inbox')return {ok:true,data:{items:[{phone:'971500000001',chatId:'fictional-cue-chat',name:'Fictional test',updatedAt:'2026-09-22T08:00:00Z',preview:'Fictional message',direction:'customer',unreadCount:0}],offset:0,total:1,hasMore:false}};
    if(action==='openInbox')return {ok:true,data:{token:'fictional-cue-token',phone:'971500000001',accountId:'fictional',chatId:'fictional-cue-chat',messages:f.rows,hasMore:false}};
    if(action==='recent'){
     f.calls++;const mode=f.mode;
     if(mode==='delayed')await new Promise(resolve=>setTimeout(resolve,1800));
     if(mode==='fail')return {ok:false,error:'Fictional read failure'};
     return {ok:true,data:{messages:f.rows,hasMore:false}};
    }
    return {ok:true,data:null};
   });
   ipcMain.removeHandler('manual-reply-translation');
   ipcMain.handle('manual-reply-translation',async(_event,{payload})=>({ok:true,data:{translations:(payload?.messages||[]).map(row=>({id:row.id,text:'虚构测试译文'}))}}));
  });
  const frame=page.frameLocator('iframe.confirmed-frame'),cue=frame.locator('#cwb-new-message'),messages=frame.locator('#cwb-messages'),refresh=frame.locator('.cwb-refresh');
  await refresh.click();
  await frame.locator('.cwb-conversation').click();
  await frame.locator('.cwb-message').last().waitFor();
  assert.equal(await frame.locator('.cwb-top-version').textContent(),appVersion);
  const assertHidden=async label=>{
   const state=await cue.evaluate(e=>({hidden:e.hidden,display:getComputedStyle(e).display,rects:e.getClientRects().length,animations:e.getAnimations({subtree:true}).filter(a=>a.playState==='running').length}));
   assert.deepEqual(state,{hidden:true,display:'none',rects:0,animations:0},`${label}: ${JSON.stringify(state)}`);
   assert.equal(await cue.isVisible(),false,label);
  };
  await assertHidden('首次完整消息加载后，实际不可见且无运行动画');
  await page.screenshot({path:path.join(evidence,'loaded-hidden.png')});
  // Style-only check. Lifecycle checks below use actual IPC responses and wheel input.
  await cue.evaluate(e=>{e.hidden=false;});
  assert.equal(await cue.isVisible(),true);
  assert.equal(await cue.locator('span').first().evaluate(e=>getComputedStyle(e).width),'7px');
  assert.equal(await cue.locator('span').first().evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(124, 58, 237)');
  await page.screenshot({path:path.join(evidence,'purple-dots-visible.png')});
  const dots=await cue.locator('span').first().boundingBox(),composer=await frame.locator('.cwb-composer').boundingBox();
  assert.ok(dots&&composer&&dots.y+dots.height<=composer.y,`三个点完整露在输入区上方: ${JSON.stringify({dots,composer})}`);
  const box=await messages.boundingBox();assert.ok(box);
  const before=await messages.evaluate(e=>e.scrollTop);
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
  await page.mouse.wheel(0,-350);
  await page.waitForTimeout(150);
  assert.ok(await messages.evaluate(e=>e.scrollTop)<before,'真实向上滚轮确实移动消息');
  await assertHidden('真实向上滚轮立即取消提示');
  await page.screenshot({path:path.join(evidence,'wheel-up-hidden.png')});

  // Return to latest; start a slow request, then scroll up before its response.
  await page.mouse.wheel(0,100000);
  await page.waitForTimeout(200);
  await app.evaluate(()=>{globalThis.cueFixture.mode='delayed';globalThis.cueFixture.rows.push({id:'delayed-new',direction:'customer',text:'Delayed fictional response',sentAt:'2026-09-22T09:00:00Z'});});
  await refresh.click();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
  await page.mouse.wheel(0,-350);
  await page.waitForTimeout(200);
  await assertHidden('等待响应时向上阅读');
  await frame.getByText('Delayed fictional response',{exact:true}).waitFor({state:'attached'});
  await assertHidden('迟到响应不得重新显示点');
  await app.evaluate(()=>{globalThis.cueFixture.mode='success';});
  const calls=await app.evaluate(()=>globalThis.cueFixture.calls);
  // Observe more than two real 10-second polling periods without synthesizing timers.
  for(let i=0;i<44;i++){await page.waitForTimeout(500);await assertHidden('阅读历史期间连续后台轮询');}
  assert.ok(await app.evaluate(()=>globalThis.cueFixture.calls)>=calls+2,'至少发生两次真实后台轮询');

  await page.mouse.wheel(0,100000);
  await page.waitForTimeout(200);
  await app.evaluate(()=>{globalThis.cueFixture.mode='fail';});
  await refresh.click();
  await cue.waitFor({state:'visible',timeout:7000});
  assert.equal(await cue.evaluate(e=>e.classList.contains('is-unavailable')),true);
  assert.match(await cue.evaluate(e=>getComputedStyle(e,'::after').content),/信息暂时无法获取/);
  assert.equal(await cue.locator('span').first().isVisible(),false,'失败时停止显示跳动点');
  await page.screenshot({path:path.join(evidence,'failure-visible.png')});
  await cue.waitFor({state:'hidden',timeout:3500});
  await assertHidden('失败提示停留后实际消失');
  for(let i=0;i<40;i++){await page.waitForTimeout(500);await assertHidden('同一次持续失败不重复弹出');}
  await page.screenshot({path:path.join(evidence,'failure-hidden.png')});
  await app.evaluate(()=>{globalThis.cueFixture.mode='success';});
  await refresh.click();
  await assertHidden('读取恢复后保持隐藏');
  console.log('Verified rendered display:none, zero rectangles/animations, real upward wheel, delayed IPC response, two polling cycles, failure visible then hidden, no repeated failure prompt, 7px purple dots.');
 }finally{try{app?.process().kill('SIGKILL');}catch{}await rm(directory,{recursive:true,force:true});}
});
