import test from 'node:test';
import assert from 'node:assert/strict';
import {_electron as electron} from 'playwright-core';
import electronPath from 'electron';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const version=JSON.parse(await readFile('package.json','utf8')).version;

test('客户资料弹窗逐项确认后才保存对应资料',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'customer-field-confirmation-'));let application;
 try{
  application=await electron.launch({executablePath:process.env.KDOCS_TEST_EXECUTABLE||electronPath,args:[...(process.env.KDOCS_TEST_EXECUTABLE?[]:['.']),`--orders-test-user-data=${directory}`],cwd:path.resolve('.'),env:{...process.env,NODE_ENV:'test'}});
  const page=await application.firstWindow();
  await application.evaluate(({ipcMain})=>{
   ipcMain.removeHandler('manual-chat');ipcMain.handle('manual-chat',async(_event,{action})=>({ok:true,data:action==='status'?{status:'online'}:action==='inbox'?{items:[{phone:'971500000088',chatId:'customer-field-fixture',name:'Customer Field Fixture',updatedAt:'2026-09-23T08:00:00.000Z',preview:'Customer field check',direction:'customer',unreadCount:0}],total:1,offset:0,hasMore:false}:action==='openInbox'||action==='recent'?{token:'customer-field-fixture',accountId:'merchant',chatId:'customer-field-fixture',phone:'971500000088',messages:[],hasMore:false}:null}));
   ipcMain.removeHandler('manual-reply-translation');ipcMain.handle('manual-reply-translation',async()=>({ok:true,data:{translations:[]}}));
  });
  await page.evaluate(async()=>{const created=await window.inventoryApp.orders.createDraft({requestId:'customer-field-confirmation'});if(!created.ok)throw Error(created.error?.message||'无法创建虚构订单');const saved=await window.inventoryApp.orders.saveDraft({orderId:created.data.id,revision:created.data.draftRevision,fields:{fullName:'Fictional Original Customer',phone:'971500000088',country:'United Arab Emirates',province:'Fictional Emirate',city:'Fictional City',street:'Fictional Street',residence:'Fictional Villa'}});if(!saved.ok)throw Error(saved.error?.message||'无法保存虚构订单');});
  const frame=page.frameLocator('iframe.confirmed-frame');await frame.locator('.cwb-refresh').click();assert.equal(await frame.locator('.cwb-top-version').textContent(),version,'工作台显示当前版本');await frame.locator('.cwb-conversation').click();
  const customer=frame.locator('.cwb-order-section').filter({hasText:'客户信息'}).first();await customer.getByRole('button',{name:'编辑&确认',exact:true}).click();
  const dialog=frame.locator('dialog.cwb-customer-edit-dialog');await dialog.getByRole('heading',{name:'客户信息校正',exact:true}).waitFor();
  assert.equal(await dialog.locator('.cwb-edit-field-row').count(),7,'每项客户资料均有独立确认行');
  assert.equal(await dialog.getByRole('button',{name:'确认',exact:true}).count(),7,'每项客户资料都有确认按钮');
  const dialogBox=await dialog.boundingBox(),inputBox=await dialog.locator('.cwb-edit-fields input').first().boundingBox();
  assert.ok(dialogBox&&inputBox&&inputBox.x<dialogBox.x+190,'客户资料输入框相对旧布局向左移动');
  const name=dialog.locator('input[data-field="firstName"]'),phone=dialog.locator('input[data-field="phone"]');
  await name.fill('Fictional Confirmed Customer');await phone.fill('971500000099');
  const nameRow=name.locator('xpath=..');await nameRow.getByRole('button',{name:'确认',exact:true}).click();
  await nameRow.getByRole('button',{name:'已确认 ✓',exact:true}).waitFor();
  await name.fill('Fictional Edited Again');assert.equal(await nameRow.getByRole('button',{name:'确认',exact:true}).count(),1,'修改内容会撤销该项确认');
  await nameRow.getByRole('button',{name:'确认',exact:true}).click();await dialog.getByRole('button',{name:'编辑&确认',exact:true}).click();
  await customer.getByText('Fictional Edited Again',{exact:true}).waitFor();
  assert.equal(await customer.getByText('971500000088',{exact:true}).count(),1,'未确认的电话不会被写入');
 }finally{await application?.close();await rm(directory,{recursive:true,force:true});}
});
