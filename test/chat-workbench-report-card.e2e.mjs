import test from 'node:test';
import assert from 'node:assert/strict';
import {_electron as electron} from 'playwright-core';
import electronPath from 'electron';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('报单卡展示只读内容并打开可核对资料的订单确认弹窗',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'workbench-report-card-'));let application;
 try{
  application=await electron.launch({executablePath:process.env.KDOCS_TEST_EXECUTABLE||electronPath,args:[...(process.env.KDOCS_TEST_EXECUTABLE?[]:['.']),`--orders-test-user-data=${directory}`],cwd:path.resolve('.'),env:{...process.env,NODE_ENV:'test'}});
  const page=await application.firstWindow();
  await application.evaluate(({ipcMain})=>{
   ipcMain.removeHandler('manual-chat');ipcMain.handle('manual-chat',async(_event,{action})=>({ok:true,data:action==='status'?{status:'online'}:action==='inbox'?{items:[{phone:'971500000077',chatId:'report-fixture',name:'Report Fixture',updatedAt:'2026-09-23T08:00:00.000Z',preview:'Report check',direction:'customer',unreadCount:0}],total:1,offset:0,hasMore:false}:action==='openInbox'||action==='recent'?{token:'report-fixture',accountId:'merchant',chatId:'report-fixture',phone:'971500000077',messages:[],hasMore:false}:null}));
   ipcMain.removeHandler('manual-reply-translation');ipcMain.handle('manual-reply-translation',async()=>({ok:true,data:{translations:[]}}));
  });
  await page.evaluate(async()=>{const created=await window.inventoryApp.orders.createDraft({requestId:'report-card-fixture'});if(!created.ok)throw Error(created.error?.message||'无法创建虚构订单');const saved=await window.inventoryApp.orders.saveDraft({orderId:created.data.id,revision:created.data.draftRevision,fields:{fullName:'Fictional Report Customer',phone:'971500000077',country:'United Arab Emirates',province:'Fictional Emirate',city:'Fictional City',street:'Fictional Street',residence:'Fictional Villa'}});if(!saved.ok)throw Error(saved.error?.message||'无法保存虚构订单');});
  const frame=page.frameLocator('iframe.confirmed-frame');await frame.locator('.cwb-refresh').click();await frame.locator('.cwb-conversation').click();
  const report=frame.locator('.cwb-order-section').filter({hasText:'报单 TXT'}).first();
  await report.locator('.cwb-report-content').waitFor();assert.equal(await report.locator('.cwb-report-content').evaluate(element=>element.tagName),'PRE');
  assert.match(await report.locator('.cwb-report-content').innerText(),/报单内容暂不能生成|Report No:/);
  assert.equal(await report.getByRole('button',{name:'核对订单',exact:true}).count(),1);
  assert.equal(await report.getByRole('button',{name:'下载报单 TXT',exact:true}).count(),1);
  await report.getByRole('button',{name:'核对订单',exact:true}).click();
  const dialog=frame.locator('dialog.cwb-report-review-dialog');await dialog.getByRole('heading',{name:'核对订单',exact:true}).waitFor();
  assert.equal(await dialog.locator('[data-report-field]').count(),8);
  assert.equal(await dialog.getByText('商品明细',{exact:true}).count(),1);
  assert.equal(await dialog.getByRole('button',{name:'编辑商品明细',exact:true}).count(),1);
  assert.equal(await dialog.getByRole('button',{name:'订单确认',exact:true}).count(),1);
  await dialog.getByRole('button',{name:'订单确认',exact:true}).click();
  await report.getByRole('button',{name:'已核对 ✓',exact:true}).waitFor();
  assert.equal(await report.getByRole('button',{name:'已核对 ✓',exact:true}).isDisabled(),true);
 }finally{await application?.close();await rm(directory,{recursive:true,force:true});}
});
