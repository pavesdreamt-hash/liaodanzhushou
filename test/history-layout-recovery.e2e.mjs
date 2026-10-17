import test from 'node:test';
import assert from 'node:assert/strict';
import {_electron as electron} from 'playwright-core';
import electronPath from 'electron';
import {mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {openOrderDatabase} from '../src/orders/database.mjs';
import {OrderRepository} from '../src/orders/order-repository.mjs';
import {OrderService} from '../src/orders/order-service.mjs';
const out=path.resolve(process.env.KDOCS_TEST_ARTIFACT_DIRECTORY||'artifacts/history-layout-3.6.6');
const launch=async directory=>{const executable=process.env.KDOCS_TEST_EXECUTABLE;return electron.launch({executablePath:executable||electronPath,args:[...(executable?[]:['.']),`--orders-test-user-data=${directory}`],cwd:path.resolve('.'),env:{...process.env,NODE_ENV:'test'}});};
const save=async(name,data)=>{await mkdir(out,{recursive:true});await writeFile(path.join(out,name+'.json'),JSON.stringify(data,null,2));};
test('旧消息：顶部真实滚轮、部分返回可重试、忙碌防重、失败和切换会话',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'history-retry-'));let app;
 try{
  await mkdir(out,{recursive:true});app=await launch(directory);const page=await app.firstWindow();page.setDefaultTimeout(12000);
  await app.evaluate(({ipcMain})=>{
   const row=n=>({id:`retry-${n}`,direction:'customer',text:`Fictional historical message ${n}`,sentAt:new Date(Date.UTC(2026,9,17,8,n)).toISOString(),metadata:{messageType:'chat',media:[]}});
   globalThis.__retryFixture={mode:'empty',calls:[],long:false,row};
   ipcMain.removeHandler('manual-chat');ipcMain.handle('manual-chat',async(_e,{action,payload={}})=>{
    const f=globalThis.__retryFixture;
    if(action==='status')return {ok:true,data:{status:'online'}};
    if(action==='inbox')return {ok:true,data:{items:[1,2].map(n=>({phone:`97150000000${n}`,chatId:`wa-phone:97150000000${n}`,name:`Fictional ${n}`,updatedAt:'2026-10-17T08:10:00Z',preview:'Fictional',direction:'customer',unreadCount:0})),total:2,offset:0,hasMore:false}};
    if(action==='openInbox')return {ok:true,data:{token:payload.chatId,accountId:'wa-phone:971500000099',chatId:payload.chatId,phone:payload.chatId.slice(9),messages:payload.chatId.endsWith('2')?[{...row(20),id:'other-chat'}]:f.long?Array.from({length:20},(_,i)=>row(i+9)):[row(9),row(10)],hasMore:f.long&&!payload.chatId.endsWith('2'),historyPartial:!f.long||payload.chatId.endsWith('2'),sourceCount:2}};
    if(action==='recent'){
     f.calls.push(payload);if(!payload.before)return {ok:true,data:{messages:[row(10)],hasMore:false,historyPartial:true,sourceCount:1}};
     const mode=f.mode;if(mode==='delayed')await new Promise(r=>setTimeout(r,900));
     if(mode==='failure')return {ok:false,error:'虚构读取失败，请重试'};
     return {ok:true,data:{messages:mode==='empty'?[]:Array.from({length:8},(_,i)=>row(i+1)),hasMore:false,historyPartial:mode==='empty',sourceCount:mode==='empty'?0:8}};
    }
    return {ok:true,data:null};
   });
   ipcMain.removeHandler('manual-reply-translation');ipcMain.handle('manual-reply-translation',async()=>({ok:true,data:{translations:[]}}));
  });
  const frame=page.frameLocator('iframe.confirmed-frame'),messages=frame.locator('#cwb-messages'),notice=frame.locator('#cwb-history-state'),retry=frame.locator('.cwb-history-retry');
  await frame.locator('.cwb-refresh').click();await frame.locator('.cwb-conversation').first().click();await frame.locator('[data-message-id="retry-9"]').waitFor();
  await messages.hover();await page.mouse.wheel(0,-350);await page.waitForTimeout(450);
  const initial=await app.evaluate(()=>globalThis.__retryFixture.calls.filter(c=>c.before));await save('history-initial',{requests:initial.length,notice:await notice.innerText(),retryCount:await retry.count()});await page.screenshot({path:path.join(out,'history-initial.png')});
  assert.equal(initial.length,1,'短消息无需实际位移，顶部向上滚轮也须发起历史读取；hasMore=false且historyPartial=true仍可重试');
  assert.equal(await retry.isVisible(),true,'提示旁有真实重试入口');assert.match(await notice.innerText(),/未返回|未核实/);
  const before=await messages.evaluate(e=>({scroll:e.scrollTop,anchor:e.querySelector('[data-message-id="retry-9"]').getBoundingClientRect().top-e.getBoundingClientRect().top}));await app.evaluate(()=>{globalThis.__retryFixture.mode='delayed';});await retry.click();assert.equal(await retry.isDisabled(),true);await messages.hover();await page.mouse.wheel(0,-500);await frame.locator('[data-message-id="retry-1"]').waitFor();
  assert.equal(await app.evaluate(()=>globalThis.__retryFixture.calls.filter(c=>c.before).length),2,'请求进行中不重复读取');assert.equal(await frame.locator('article.cwb-message').count(),10);assert.equal(await frame.locator('[data-message-id="retry-9"]').count(),1);await page.waitForTimeout(350);const after=await messages.evaluate(e=>({scroll:e.scrollTop,max:e.scrollHeight-e.clientHeight,anchor:e.querySelector('[data-message-id="retry-9"]').getBoundingClientRect().top-e.getBoundingClientRect().top}));await save('history-short-anchor',{before,after});// A two-message view cannot keep its former top anchor once the older page fills the viewport. Exact anchor continuity is checked below with a scrollable conversation.
  // A later partial latest page must preserve older rows and expose retry again.
  await frame.locator('.cwb-refresh').click();assert.equal(await frame.locator('article.cwb-message').count(),10);await app.evaluate(()=>{globalThis.__retryFixture.mode='failure';});await retry.click();await notice.getByText(/读取更早消息失败/).waitFor();assert.equal(await retry.isEnabled(),true);assert.equal(await frame.locator('article.cwb-message').count(),10);
  await app.evaluate(()=>{globalThis.__retryFixture.mode='delayed';});await retry.click();await frame.locator('.cwb-conversation').nth(1).click();await frame.locator('[data-message-id="other-chat"]').waitFor();await page.waitForTimeout(1100);assert.equal(await frame.locator('[data-message-id="retry-1"]').count(),0,'迟到历史响应不能串入另一客户');assert.equal(await retry.isEnabled(),true);
  await app.evaluate(()=>{globalThis.__retryFixture.long=true;globalThis.__retryFixture.mode='delayed';});await frame.locator('.cwb-conversation').first().click();await frame.locator('[data-message-id="retry-28"]').waitFor();await page.waitForTimeout(150);await messages.evaluate(e=>{e.scrollTop=0;});await messages.hover();await page.mouse.wheel(0,-500);const longBefore=await messages.evaluate(e=>e.querySelector('[data-message-id="retry-9"]').getBoundingClientRect().top-e.getBoundingClientRect().top);await frame.locator('[data-message-id="retry-1"]').waitFor();await page.waitForTimeout(350);const longAfter=await messages.evaluate(e=>e.querySelector('[data-message-id="retry-9"]').getBoundingClientRect().top-e.getBoundingClientRect().top);await save('history-long-anchor',{before:longBefore,after:longAfter});assert.ok(Math.abs(longBefore-longAfter)<=1,'可滚动长会话补入历史后，可见消息位置保持在1px内');await frame.locator('.cwb-conversation').nth(1).click();await frame.locator('[data-message-id="other-chat"]').waitFor();
  for(const [width,height]of [[1280,820],[820,640]]){await app.evaluate(({BrowserWindow},{width,height})=>BrowserWindow.getAllWindows()[0].setSize(width,height),{width,height});await page.waitForTimeout(250);const geometry=await notice.evaluate(e=>{const b=e.querySelector('button'),r=e.getBoundingClientRect(),br=b.getBoundingClientRect();return {width:r.width,scroll:e.scrollWidth,buttonLeft:br.left,buttonRight:br.right,left:r.left,right:r.right,height:r.height};});assert.ok(geometry.scroll<=geometry.width+1&&geometry.buttonLeft>=geometry.left&&geometry.buttonRight<=geometry.right,'提示及按钮在聊天列内完整可见');await save('history-'+width,geometry);await page.screenshot({path:path.join(out,`history-${width}.png`)});}
 }finally{await app?.close();await rm(directory,{recursive:true,force:true});}
});
test('订单表格：操作单元格和可见按钮随一二三商品整行对齐',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'action-cell-'));let app,database;
 try{
  await mkdir(out,{recursive:true});database=await openOrderDatabase({userDataPath:directory});const service=new OrderService(new OrderRepository(database));
  for(let n=1;n<=3;n++)service.createOrder({source:'manual',shopplus_order_no:`ALIGN-${n}`,shopplus_created_at:'2026-10-17T08:00:00Z',currency:'AED',customer_full_name:'Fictional Person',customer_phone:'+000000000',country:'Fictional',city:'Fictional',street:'Fictional',items:Array.from({length:n},(_,i)=>({sku_code:`SKU${i}`,product_name_snapshot:'Fictional',quantity:1,unit_list_price:'50',unit_actual_price:'50',unit_cost_snapshot:'20',cost_source:'fictional'}))});
  database.close();database=null;app=await launch(directory);const page=await app.firstWindow();page.setDefaultTimeout(10000);const frame=page.frameLocator('iframe.confirmed-frame');await frame.getByRole('button',{name:'订单管理',exact:true}).click();await frame.locator('.ob-rows tr[data-order-id]').first().waitFor();
  for(const [width,height,collapsed]of [[1280,820,false],[1440,900,false],[820,640,false],[1280,820,true],[820,640,true]]){
   const isCollapsed=await frame.locator('#ui040').evaluate(e=>e.classList.contains('up-nav-collapsed'));if(isCollapsed!==collapsed)await frame.getByRole('button',{name:collapsed?'折叠导航栏':'展开导航栏',exact:true}).click();
   await app.evaluate(({BrowserWindow},{width,height})=>BrowserWindow.getAllWindows()[0].setSize(width,height),{width,height});await page.waitForTimeout(250);
   await frame.locator('.ob-orders .table-wrap').evaluate(e=>{e.scrollLeft=e.scrollWidth;});
   const metrics=await frame.locator('.ob-orders table').evaluate(table=>{
    const textRect=e=>{const range=document.createRange();range.selectNodeContents(e);return range.getBoundingClientRect();};const h=textRect(table.querySelector('th:last-child'));
    return [...table.querySelectorAll('tbody tr')].map(tr=>{const r=tr.getBoundingClientRect(),td=tr.lastElementChild,c=td.getBoundingClientRect(),btn=td.querySelector('button'),b=textRect(btn);return {name:tr.children[2].textContent,display:getComputedStyle(td).display,rowHeight:r.height,cellHeight:c.height,topGap:c.top-r.top,bottomGap:c.bottom-r.bottom,textCenterDelta:(b.top+b.bottom-r.top-r.bottom)/2,headerTextDelta:(b.left+b.right-h.left-h.right)/2};});
   });await save('orders-'+width+(collapsed?'-collapsed':''),metrics);await page.screenshot({path:path.join(out,`orders-${width}${collapsed?'-collapsed':''}.png`)});
   for(const m of metrics){assert.equal(m.display,'table-cell');assert.ok(Math.abs(m.topGap)<=1&&Math.abs(m.bottomGap)<=1,`操作列分隔线和整行对齐 ${JSON.stringify(m)}`);assert.ok(Math.abs(m.textCenterDelta)<=1,`按钮可见文字垂直居中 ${JSON.stringify(m)}`);assert.ok(Math.abs(m.headerTextDelta)<=1,`操作表头与按钮可见文字对齐 ${JSON.stringify(m)}`);}
   const byName=Object.fromEntries(metrics.map(m=>[m.name,m.rowHeight]));assert.ok(byName['ALIGN-1']>=62&&byName['ALIGN-1']<=64&&Math.abs(byName['ALIGN-2']-88)<=1&&Math.abs(byName['ALIGN-3']-114)<=1,'保持既有62px起点/26px增量公式及单商品双行日期的原有最小内容高度');
  }
  await frame.locator('.ob-rows tr').filter({hasText:'ALIGN-2'}).getByRole('button',{name:'订单详情',exact:true}).click();await frame.locator('#ui008-order-detail').waitFor();assert.ok(await frame.locator('#ui008-order-detail').innerText().then(t=>t.includes('ALIGN-2')),'详情仍打开本行订单');
 }finally{database?.close();await app?.close();await rm(directory,{recursive:true,force:true});}
});
