import test from 'node:test';
import assert from 'node:assert/strict';
import {_electron as electron} from 'playwright-core';
import electronPath from 'electron';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('real-phone rendering keeps sender identity and Chinese outside each bubble through refresh and toggle',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'phone-ui-'));let application;
 const expectedVersion=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8')).version;
 try{
  application=await electron.launch({executablePath:process.env.KDOCS_TEST_EXECUTABLE||electronPath,args:[...(process.env.KDOCS_TEST_EXECUTABLE?[]:['.']),`--orders-test-user-data=${directory}`],cwd:path.resolve('.'),env:{...process.env,NODE_ENV:'test'}});
  const page=await application.firstWindow();
  await application.evaluate(({ipcMain})=>{
   const rows=[
    {id:'customer-1',direction:'customer',text:'Hello',sentAt:'2026-09-21T08:26:00Z'},
    {id:'human-1',direction:'merchant',sender:'人工发送',text:'Thank you',sentAt:'2026-09-21T08:28:00Z'},
    {id:'ai-1',direction:'merchant',sender:'AI自动发送',text:'Please confirm',sentAt:'2026-09-21T08:31:00Z'},
    {id:'picture-1',direction:'customer',text:'[图片]',sentAt:'2026-09-21T08:34:00Z'}
   ];
   ipcMain.removeHandler('manual-chat');ipcMain.handle('manual-chat',async(_event,{action})=>({ok:true,data:action==='status'?{status:'online',message:'已连接'}:action==='inspect'?{token:'candidate',accountId:'merchant',chatId:'customer-chat',accountPhone:'10001',targetPhone:'10002'}:action==='bind'?{token:'binding',accountId:'merchant',chatId:'customer-chat',phone:'10002',messages:rows}:action==='history'?rows:null}));
   ipcMain.removeHandler('manual-reply-translation');ipcMain.handle('manual-reply-translation',async(_event,{action,payload})=>({ok:true,data:{translations:action==='chat-translate'?payload.messages.map(row=>({id:row.id,text:`中文 ${row.text}`})):[]}}));
  });
  const frame=page.frameLocator('iframe.confirmed-frame');
  await frame.getByRole('button',{name:'关联真实聊天'}).click();
  await frame.getByPlaceholder('包含国家区号，例如 +971…').fill('+10002');
  await frame.getByRole('button',{name:'核对号码'}).click();
  await frame.getByRole('button',{name:'确认关联并读取最近 24 小时'}).click();
  const messages=frame.locator('.manual-message');await messages.first().waitFor();assert.equal(await messages.count(),4);
  assert.deepEqual(await messages.locator('.manual-message-meta > span:first-child').allTextContents(),['客户','人工发送','AI自动发送','客户']);
  assert.equal(await messages.locator('.manual-message-meta svg').count(),4);
  assert.equal(await messages.locator('.manual-translation').count(),3);
  await frame.getByRole('button',{name:'翻译未译消息'}).click();
  await frame.locator('.manual-translation').first().getByText('中文 Hello').waitFor();
  const placement=await messages.first().evaluate(row=>{const bubble=row.querySelector('.manual-bubble').getBoundingClientRect(),translation=row.querySelector('.manual-translation').getBoundingClientRect();return {below:translation.top>=bubble.bottom,inside:row.querySelector('.manual-bubble .manual-translation')!==null};});
  assert.equal(placement.below,true);assert.equal(placement.inside,false);
  const toggle=frame.locator('.message-translation-toolbar input');await toggle.uncheck();assert.equal(await messages.first().locator('.manual-translation').evaluate(el=>getComputedStyle(el).display),'none');await toggle.check();assert.notEqual(await messages.first().locator('.manual-translation').evaluate(el=>getComputedStyle(el).display),'none');
  await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1440,1000));
  assert.equal(await messages.first().evaluate(row=>row.querySelector('.manual-translation').getBoundingClientRect().top>=row.querySelector('.manual-bubble').getBoundingClientRect().bottom),true);
  await frame.getByRole('button',{name:'刷新消息'}).click();assert.equal(await messages.count(),4);await messages.first().locator('.manual-translation').getByText('中文 Hello').waitFor();
  await frame.getByRole('button',{name:'订单详情',exact:true}).first().click();
  await frame.locator('#ui008-order-detail').waitFor();
  assert.equal(await frame.locator('.od-version').textContent(),expectedVersion);
  assert.equal(await frame.locator('#ui008-order-detail .od-message').count(),0);
  assert.equal(await frame.locator('.od-content').getByText('暂无真实订单').count(),1);
  await frame.getByRole('button',{name:'关联真实聊天'}).click();
  await frame.getByPlaceholder('包含国家区号，例如 +971…').fill('+10002');
  await frame.getByRole('button',{name:'核对号码'}).click();
  await frame.getByRole('button',{name:'确认关联并读取最近 24 小时'}).click();
  const orderMessages=frame.locator('#ui008-order-detail .manual-message');await orderMessages.first().waitFor();assert.equal(await orderMessages.count(),4);
  assert.equal(await orderMessages.locator('.manual-message-meta svg').count(),4);
  assert.equal(await orderMessages.first().evaluate(row=>row.querySelector('.manual-translation').getBoundingClientRect().top>=row.querySelector('.manual-bubble').getBoundingClientRect().bottom),true);
 }finally{await application?.close().catch(()=>{});await rm(directory,{recursive:true,force:true});}
});
