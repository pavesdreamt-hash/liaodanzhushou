import test from 'node:test';
import assert from 'node:assert/strict';
import {_electron as electron} from 'playwright-core';
import electronPath from 'electron';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('报单卡展示只读内容并打开只允许改报单编号的订单确认弹窗',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'workbench-report-card-'));let application;
 try{
  await mkdir(path.join(directory,'state'),{recursive:true});
  await writeFile(path.join(directory,'state','baseline.json'),JSON.stringify({versionAt:'fictional-report-card',products:[['商品编号','来源商品名称','成本'],['FIC-REPORT','Fictional Report Product','50']]}));
  application=await electron.launch({executablePath:process.env.KDOCS_TEST_EXECUTABLE||electronPath,args:[...(process.env.KDOCS_TEST_EXECUTABLE?[]:['.']),`--orders-test-user-data=${directory}`],cwd:path.resolve('.'),env:{...process.env,NODE_ENV:'test'}});
  const page=await application.firstWindow();
  if(process.env.KDOCS_TEST_EXECUTABLE){const identity=await application.evaluate(({app})=>({packaged:app.isPackaged,version:app.getVersion(),arch:process.arch}));assert.equal(identity.packaged,true);assert.equal(identity.arch,'x64');assert.equal(identity.version,'2.1.7');}
  await application.evaluate(({ipcMain})=>{
   ipcMain.removeHandler('manual-chat');ipcMain.handle('manual-chat',async(_event,{action})=>({ok:true,data:action==='status'?{status:'online'}:action==='inbox'?{items:[{phone:'971500000077',chatId:'report-fixture',name:'Report Fixture',updatedAt:'2026-09-23T08:00:00.000Z',preview:'Report check',direction:'customer',unreadCount:0}],total:1,offset:0,hasMore:false}:action==='openInbox'||action==='recent'?{token:'report-fixture',accountId:'merchant',chatId:'report-fixture',phone:'971500000077',messages:[],hasMore:false}:null}));
   ipcMain.removeHandler('manual-reply-translation');ipcMain.handle('manual-reply-translation',async()=>({ok:true,data:{translations:[]}}));
  });
  const original=await page.evaluate(async()=>{const created=await window.inventoryApp.orders.createDraft({requestId:'report-card-fixture'});if(!created.ok)throw Error(created.error?.message||'无法创建虚构订单');const saved=await window.inventoryApp.orders.saveDraft({orderId:created.data.id,revision:created.data.draftRevision,fields:{fullName:'Fictional Report Customer',phone:'971500000077',email:'fictional-report@example.invalid',country:'United Arab Emirates',province:'Fictional Emirate',city:'Fictional City',street:'Fictional Street',residence:'Fictional Villa'},items:[{sku:'FIC-REPORT',quantity:2,price:'125',discount:'0'}]});if(!saved.ok)throw Error(saved.error?.message||'无法保存虚构订单');const active=await window.inventoryApp.orders.confirmOrder({orderId:saved.data.id,note:'Fictional report-card confirmation only'});if(!active.ok)throw Error(active.error?.message||'无法激活虚构订单');return active.data;});
  const frame=page.frameLocator('iframe.confirmed-frame');await frame.locator('.cwb-refresh').click();await frame.locator('.cwb-conversation').click();
  const report=frame.locator('.cwb-order-section').filter({hasText:'报单 TXT'}).first();
  await report.locator('.cwb-report-content').waitFor();assert.equal(await report.locator('.cwb-report-content').evaluate(element=>element.tagName),'PRE');
  assert.match(await report.locator('.cwb-report-content').innerText(),/报单内容暂不能生成|Report No:/);
  assert.equal(await report.getByRole('button',{name:'核对订单',exact:true}).count(),1);
  assert.equal(await report.getByRole('button',{name:'下载报单 TXT',exact:true}).count(),1);
  await report.getByRole('button',{name:'核对订单',exact:true}).click();
  const dialog=frame.locator('dialog.cwb-report-review-dialog');await dialog.getByRole('heading',{name:'核对订单',exact:true}).waitFor();
  assert.equal(await dialog.locator('[data-report-field="reportNumber"]').count(),1);
  assert.equal(await dialog.locator('input[readonly]').count(),7);
  assert.equal(await dialog.locator('input:not([readonly])').count(),1);
  assert.equal(await dialog.getByText('Product Details',{exact:true}).count(),1);
  assert.equal(await dialog.getByText('Product Name',{exact:true}).count(),1);
  assert.equal(await dialog.getByText('Quantity',{exact:true}).count(),1);
  assert.equal(await dialog.getByText('Price',{exact:true}).count(),1);
  assert.equal(await dialog.getByText('FIC-REPORT',{exact:true}).count(),1);
  assert.equal(await dialog.getByText('2',{exact:true}).count(),1);
  assert.equal(await dialog.getByText('AED 125.00',{exact:true}).count(),1);
  assert.equal(await dialog.getByText('Review Note: Manual report review',{exact:true}).count(),1);
  assert.equal(await dialog.getByRole('button',{name:'编辑商品明细',exact:true}).count(),0);
  assert.match(await dialog.locator('.is-google-address a').textContent(),/^https:\/\/www\.google\.com\/maps\/search\/\?api=1/);
  assert.equal(await dialog.getByRole('button',{name:'订单确认',exact:true}).count(),1);
  const layout=await dialog.evaluate(element=>{
   const box=(selector)=>{const item=element.querySelector(selector);if(!item)throw Error(`缺少 ${selector}`);const rect=item.getBoundingClientRect();return {left:rect.left,right:rect.right};};
   const dialogRect=element.getBoundingClientRect();
   const headers=[...element.querySelectorAll('.cwb-report-review-item-row.is-header span')].map(item=>{const rect=item.getBoundingClientRect();return {left:rect.left,right:rect.right};});
   return {dialog:{left:dialogRect.left,right:dialogRect.right},report:box('[data-report-field="reportNumber"]'),customer:box('input[readonly]'),google:box('.is-google-address a'),headers,scrollWidth:element.scrollWidth,clientWidth:element.clientWidth};
  });
  assert.ok(Math.abs(layout.report.left-layout.customer.left)<=2,'报单编号应和资料值左对齐');
  assert.ok(layout.google.right<=layout.dialog.right+1,'Google 地址不能从弹窗右侧溢出');
  assert.equal(layout.headers.length,3);
  assert.ok(layout.headers[1].left>layout.headers[0].left+20,'Quantity 列应与 Product Name 分开');
  assert.ok(layout.headers[2].left>layout.headers[1].left+20,'Price 列应与 Quantity 分开');
  assert.ok(layout.scrollWidth<=layout.clientWidth+1,'报单弹窗不能出现横向溢出');
  if(process.env.KDOCS_REPORT_SCREENSHOT)await page.screenshot({path:process.env.KDOCS_REPORT_SCREENSHOT});
  await dialog.locator('[data-report-field="reportNumber"]').fill('9.22-5');
  await dialog.getByRole('button',{name:'订单确认',exact:true}).click();
  await report.getByRole('button',{name:'已核对 ✓',exact:true}).waitFor();
  assert.equal(await report.getByRole('button',{name:'已核对 ✓',exact:true}).isDisabled(),true);
  const confirmed=await page.evaluate(async orderId=>{const value=await window.inventoryApp.orders.detail(orderId);if(!value.ok)throw Error(value.error?.message||'无法读取虚构订单');return value.data;},original.id);
  assert.equal(confirmed.report.rawNumber,'9.22-5');
  assert.deepEqual(confirmed.customer,{...original.customer});
 }finally{await application?.close();await rm(directory,{recursive:true,force:true});}
});
