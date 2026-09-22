import test from 'node:test';
import assert from 'node:assert/strict';
import {_electron as electron} from 'playwright-core';
import electronPath from 'electron';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import os from 'node:os';
import path from 'node:path';
import packageInfo from '../package.json' with {type:'json'};
const {version}=packageInfo;

async function assertPageStyles(frame,{chat=false,product=false,orders=false,workbench=false,restored=false}={}){
 const modules=await frame.locator('style[data-ui-module]').evaluateAll(styles=>styles.map(style=>style.dataset.uiModule));
 assert.deepEqual(modules,['shared-layout',...(chat?['chat-layout']:[]),...(chat||product?['media-dialog']:[]),...(chat?['chat-replies']:[]),...(product?['product-media']:[]),...(orders?['order-business']:[]),...(workbench?['workbench-orders']:[]),'empty-workspace',...(restored?['restored-pages']:[])]);
}

test('fresh workspace shows no fictional records and exposes bounded WhatsApp connection',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'liaodan-empty-'));let application;
 try{
  const executable=process.env.KDOCS_TEST_EXECUTABLE||electronPath;
  application=await electron.launch({executablePath:executable,args:[...(process.env.KDOCS_TEST_EXECUTABLE?[]:['.']),`--orders-test-user-data=${directory}`],cwd:path.resolve('.'),env:{...process.env,NODE_ENV:'test'}});
  const page=await application.firstWindow(),frame=page.frameLocator('iframe.confirmed-frame');
  await frame.locator('#chat-workbench-aligned').waitFor();
  await assertPageStyles(frame,{chat:true,workbench:true});
  assert.equal(await frame.locator('.cw-task-row').count(),0);
  assert.equal(await frame.locator('.cw-message').count(),0);
  assert.deepEqual(await frame.locator('.cw-stat-value').allTextContents(),['0','0','0']);
  assert.match(await frame.locator('.cw-connection').innerText(),/待核对连接/);
  assert.equal(await frame.getByRole('button',{name:'导入订单'}).isEnabled(),true);
  assert.equal(await frame.getByRole('button',{name:'新建订单'}).isEnabled(),true);
  assert.doesNotMatch(await frame.locator('body').innerText(),/Avery Example|KY02|WhatsApp 已连接|演示聊天/);
  if(process.env.KDOCS_TEST_EXECUTABLE){const output=path.resolve(`artifacts/empty-${version}`);await mkdir(output,{recursive:true});await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1280,820));await page.screenshot({path:path.join(output,'workbench-1280x820.png')});}
  await frame.getByRole('button',{name:'关联真实聊天'}).click();
  assert.equal(await frame.getByRole('button',{name:'连接 WhatsApp'}).isEnabled(),true);
  assert.equal(await frame.getByRole('button',{name:'确认关联并读取最近 24 小时'}).isDisabled(),true);
  await frame.getByRole('button',{name:'关闭',exact:true}).last().click();
  await frame.getByRole('button',{name:'订单详情',exact:true}).first().click();
  await frame.locator('#ui008-order-detail').waitFor();
  await assertPageStyles(frame,{chat:true,orders:true});
  assert.equal(await frame.locator('.od-content').getByText('暂无真实订单').count(),1);
  assert.equal(await frame.locator('.od-message').count(),0);
  assert.doesNotMatch(await frame.locator('body').innerText(),/Avery Example|KY02|M202609180024|演示聊天/);
  if(process.env.KDOCS_TEST_EXECUTABLE){const output=path.resolve(`artifacts/empty-${version}`);await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1440,1000));await page.screenshot({path:path.join(output,'order-1440x1000.png')});}
  await frame.locator('aside').getByRole('button',{name:'订单管理',exact:true}).first().click();
  await frame.locator('.ob-orders').waitFor();
  await assertPageStyles(frame,{orders:true});
  assert.match(await frame.locator('.ob-rows').innerText(),/暂无真实订单/);
  assert.equal(await frame.locator('#u40-new').isEnabled(),true);
  assert.equal(await frame.locator('#u40-import').isEnabled(),true);
  await frame.locator('#u40-new').click();
  await frame.locator('.ob-draft').waitFor();
  assert.match(await frame.locator('.od-heading-copy h1').innerText(),/草稿/);
  assert.doesNotMatch(await frame.locator('body').innerText(),/Avery Example|KY02|M202609180024|演示聊天/);
  if(process.env.UI_CAPTURE_DIR){await mkdir(process.env.UI_CAPTURE_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.UI_CAPTURE_DIR,'blank-draft-1280x820.png')});}
  await frame.getByRole('button',{name:'保存草稿'}).click();
  await frame.locator('.ob-draft').waitFor();
  await frame.locator('.od-back').click();
  await frame.locator('.ob-rows tr[data-order-id]').first().waitFor();
  assert.equal(await frame.locator('.ob-rows tr[data-order-id]').count(),1);
  await frame.locator('aside').getByRole('button',{name:'聊单工作台',exact:true}).first().click();
  await frame.locator('.cw-task-row').first().waitFor();
  assert.equal(await frame.locator('.cw-stat[data-filter="info"] .cw-stat-value').innerText(),'1');
  const card=frame.locator('.cw-task-row').first();
  assert.match(await card.locator('.cw-status-pill').getAttribute('class'),/cw-info/);
  assert.equal(await card.evaluate(element=>getComputedStyle(element).borderTopStyle),'solid');
  assert.equal(await frame.locator('.cw-tab[data-filter="attention"] .cw-attention-count').count(),1);
  await card.locator('.cw-row-main').click();
  assert.equal(await frame.locator('#chat-workbench-aligned').count(),1);
  assert.equal(await card.getAttribute('data-selected'),'true');
  if(process.env.UI_CAPTURE_DIR){await mkdir(process.env.UI_CAPTURE_DIR,{recursive:true});for(const [width,height] of [[1280,820],[1440,1000]]){await application.evaluate(({BrowserWindow},size)=>BrowserWindow.getAllWindows()[0].setContentSize(size.width,size.height),{width,height});await page.screenshot({path:path.join(process.env.UI_CAPTURE_DIR,`workbench-order-card-${width}x${height}.png`)});}}
  await card.getByRole('button',{name:'订单详情'}).click();
  await frame.locator('.ob-draft').waitFor();
  for(const [navigation,title] of [['商品库存','商品库存'],['利润核算','利润核算'],['助手配置','助手配置'],['连接与设置','连接与设置']]){
   await frame.locator('aside').getByRole('button',{name:navigation,exact:true}).first().click();
   await frame.locator('.main h1').getByText(title,{exact:true}).waitFor();
   await frame.locator('.live-page-status').waitFor();
   await assertPageStyles(frame,{product:navigation==='商品库存',restored:true});
   assert.doesNotMatch(await frame.locator('body').innerText(),/Avery Example|KY02|WhatsApp 已连接|AED 150/);
   if(navigation==='商品库存')assert.equal(await frame.locator('#ui011-total').innerText(),'0');
   if(navigation==='利润核算')assert.match(await frame.locator('#ui034 tbody').innerText(),/暂无真实每日利润/);
   if(navigation==='助手配置')assert.equal(await frame.locator('#u41-save').isDisabled(),true);
   if(navigation==='连接与设置'){
    assert.match(await frame.locator('#u36-ai-status').innerText(),/未设置密钥|已配置|不可用/);
    assert.equal(await frame.locator('#u36-key').inputValue(),'');
    await frame.locator('.tab[data-tab="data"]').click();
    assert.match(await frame.locator('[data-panel="data"]').innerText(),/尚未进行手动备份|无法读取/);
    assert.doesNotMatch(await frame.locator('[data-panel="data"]').innerText(),/今天 10:00|45 天|90 天/);
   }
  }
  for(const [route,title] of [['product','产品详情'],['profit-detail','每日利润详情']]){
   const address=new URL(page.url());address.searchParams.set('page',route);await page.goto(address.href);
   await frame.locator('.live-page-status').waitFor();
   await frame.locator('.main h1').getByText(route==='product'?'尚未选择商品':title,{exact:true}).waitFor();
   await assertPageStyles(frame,{product:route==='product',restored:true});
   assert.doesNotMatch(await frame.locator('body').innerText(),/Avery Example|KY02|WhatsApp 已连接|AED 150/);
   if(route==='product'){
    assert.equal(await frame.locator('#u32-details').count(),1);
    assert.equal(await frame.locator('#u32-edit').isDisabled(),true);
    assert.equal(await frame.locator('#ui032 .product-images-button').isDisabled(),true);
    assert.match(await frame.locator('.availability-main').innerText(),/库存尚未核实/);
   }
   if(route==='profit-detail'){
    assert.match(await frame.locator('#ui035 tbody').innerText(),/该日期没有真实订单/);
    assert.doesNotMatch(await frame.locator('#ui035 .main').innerText(),/¥2,380|¥2,053|¥327|13\.7%|¥1,846|8 个订单/);
   }
  }
  const db=new DatabaseSync(path.join(directory,'orders','orders.sqlite'),{readOnly:true});
  try{assert.equal(db.prepare("SELECT COUNT(*) AS count FROM order_events WHERE event_type='draft_manually_saved'").get().count,1);}finally{db.close();}
 }finally{await application?.close().catch(()=>{});await rm(directory,{recursive:true,force:true});}
});

test('restored inventory and profit pages use saved local records and route to the selected item',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'liaodan-restored-'));let application;
 try{
  application=await electron.launch({executablePath:electronPath,args:['.',`--orders-test-user-data=${directory}`],cwd:path.resolve('.'),env:{...process.env,NODE_ENV:'test'}});
  const page=await application.firstWindow(),frame=page.frameLocator('iframe.confirmed-frame');
  await frame.locator('#chat-workbench-aligned').waitFor();
  const day=new Date(Date.now()-86400000).toISOString().slice(0,10);
  const saved=await page.evaluate(async value=>({profile:await window.inventoryApp.orders.saveProductProfile({businessId:'QA-001',displayName:'验收用商品',actualPrice:'25.00',category:'验收'}),cost:await window.inventoryApp.orders.saveDailyCosts({day:value,adUsd:'10',usdCnyRate:'7',accountCostCny:'5'})}),day);
  assert.equal(saved.profile.ok,true);assert.equal(saved.cost.ok,true);
  await frame.locator('aside').getByRole('button',{name:'商品库存',exact:true}).click();
  await frame.locator('#ui011-rows').getByText('验收用商品').waitFor();
  await frame.locator('#ui011-full-details').click();
  await frame.locator('#ui032 .page-head h1').getByText('验收用商品').waitFor();
  assert.equal(await frame.locator('#u32-details .form-grid input').first().inputValue(),'验收用商品');
  assert.match(await frame.locator('.left-info').innerText(),/QA-001/);
  await frame.locator('#ui032 .product-images-button').click();
  assert.match(await frame.locator('dialog[open] h2').innerText(),/QA-001 · 商品图片/);
  await frame.locator('dialog[open]').getByRole('button',{name:'关闭'}).click();
  await frame.locator('aside').getByRole('button',{name:'利润核算',exact:true}).click();
  await frame.locator('#ui034 tbody tr').filter({hasText:day}).waitFor();
  const row=frame.locator('#ui034 tbody tr').filter({hasText:day});assert.match(await row.innerText(),/\$10\.00|¥75\.00/);
  await row.getByRole('button',{name:'查看详情'}).click();
  await frame.locator('#ui035').waitFor();
  assert.equal(await frame.locator('#u35-date').innerText(),day);
  assert.match(await frame.locator('#ui035 .tiles').first().innerText(),/\$10\.00/);
  assert.match(await frame.locator('#ui035 .tiles').last().innerText(),/¥75\.00/);
 }finally{await application?.close().catch(()=>{});await rm(directory,{recursive:true,force:true});}
});

test('invalid ShopPlus file is rejected before any order is written',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'liaodan-import-empty-'));let application;
 try{
  const file=path.join(directory,'empty.xlsx');await writeFile(file,Buffer.alloc(0));
  application=await electron.launch({executablePath:electronPath,args:['.',`--orders-test-user-data=${directory}`,`--orders-test-excel=${file}`],cwd:path.resolve('.'),env:{...process.env,NODE_ENV:'test'}});
  const page=await application.firstWindow(),frame=page.frameLocator('iframe.confirmed-frame');
  await frame.locator('#chat-workbench-aligned').waitFor();
  await frame.locator('aside').getByRole('button',{name:'订单管理',exact:true}).first().click();
  await frame.locator('#u40-import').click();
  await frame.locator('.ob-feedback').getByText(/为空|无法读取|格式无效/).waitFor();
  assert.equal(await frame.locator('.ob-rows tr[data-order-id]').count(),0);
  await application.close();application=null;
  const db=new DatabaseSync(path.join(directory,'orders','orders.sqlite'),{readOnly:true});
  try{assert.equal(db.prepare('SELECT COUNT(*) AS count FROM orders').get().count,0);}finally{db.close();}
 }finally{await application?.close().catch(()=>{});await rm(directory,{recursive:true,force:true});}
});

test('production local window can read the empty order database',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'liaodan-production-order-'));let application;
 try{
  application=await electron.launch({executablePath:electronPath,args:['.',`--isolated-user-data=${directory}`],cwd:path.resolve('.'),env:{...process.env,NODE_ENV:'production'}});
  const page=await application.firstWindow(),frame=page.frameLocator('iframe.confirmed-frame');
  await page.waitForURL(/^http:\/\/127\.0\.0\.1:/);
  await frame.locator('#chat-workbench-aligned').waitFor();
  await frame.locator('#cw-result-count').getByText('0 项').waitFor();
  assert.equal(await page.evaluate(async()=>{const response=await window.inventoryApp.orders.list({});return response.ok&&response.data.length===0;}),true);
  assert.doesNotMatch(await frame.locator('body').innerText(),/读取失败|拒绝未知页面请求/);
 }finally{await application?.close().catch(()=>{});await rm(directory,{recursive:true,force:true});}
});

test('extracted production App starts with its own empty profile and version', {skip:!process.env.KDOCS_TEST_EXECUTABLE},async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'liaodan-live-production-'));let application;
 try{
  application=await electron.launch({executablePath:process.env.KDOCS_TEST_EXECUTABLE,args:[`--isolated-user-data=${directory}`],env:{...process.env,NODE_ENV:'production'}});
  const page=await application.firstWindow(),frame=page.frameLocator('iframe.confirmed-frame');
  await frame.locator('#chat-workbench-aligned').waitFor();
  assert.equal(await frame.locator('.cw-task-row,.cw-message').count(),0);
  assert.equal(await frame.getByRole('button',{name:'关联真实聊天'}).isEnabled(),true);
  assert.equal(await page.evaluate(async()=>{const response=await window.inventoryApp.orders.list({});return response.ok&&response.data.length===0;}),true);
  const identity=await application.evaluate(({app})=>({version:app.getVersion(),name:app.getName(),userData:app.getPath('userData'),packaged:app.isPackaged}));
  assert.deepEqual(identity,{version,name:'Liaodan Assistant Live',userData:directory,packaged:true});
  await application.close();application=null;
  const db=new DatabaseSync(path.join(directory,'orders','orders.sqlite'),{readOnly:true});
  try{assert.equal(db.prepare('SELECT COUNT(*) AS count FROM orders').get().count,0);assert.equal(db.prepare('SELECT COUNT(*) AS count FROM order_chat_messages').get().count,0);}finally{db.close();}
 }finally{await application?.close().catch(()=>{});await rm(directory,{recursive:true,force:true});}
});
