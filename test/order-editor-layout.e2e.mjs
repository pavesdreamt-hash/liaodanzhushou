import test from 'node:test';
import assert from 'node:assert/strict';
import {_electron as electron} from 'playwright-core';
import electronPath from 'electron';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('订单编辑说明收纳，商品明细以六列紧凑控件展示',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'order-editor-layout-'));let application;
 try{
  application=await electron.launch({executablePath:process.env.KDOCS_TEST_EXECUTABLE||electronPath,args:[...(process.env.KDOCS_TEST_EXECUTABLE?[]:['.']),`--orders-test-user-data=${directory}`],cwd:path.resolve('.'),env:{...process.env,NODE_ENV:'test'}});
  const page=await application.firstWindow();
  await application.evaluate(({ipcMain})=>{
   ipcMain.removeHandler('manual-chat');ipcMain.handle('manual-chat',async(_event,{action})=>({ok:true,data:action==='status'?{status:'online'}:action==='inbox'?{items:[{phone:'971500000091',chatId:'order-editor-fixture',name:'Order Editor Fixture',updatedAt:'2026-09-23T08:00:00.000Z',preview:'Order edit check',direction:'customer',unreadCount:0}],total:1,offset:0,hasMore:false}:action==='openInbox'||action==='recent'?{token:'order-editor-fixture',accountId:'merchant',chatId:'order-editor-fixture',phone:'971500000091',messages:[],hasMore:false}:null}));
   ipcMain.removeHandler('manual-reply-translation');ipcMain.handle('manual-reply-translation',async()=>({ok:true,data:{translations:[]}}));
  });
  await page.evaluate(async()=>{const created=await window.inventoryApp.orders.createDraft({requestId:'order-editor-layout'});if(!created.ok)throw Error(created.error?.message||'无法创建虚构订单');const saved=await window.inventoryApp.orders.saveDraft({orderId:created.data.id,revision:created.data.draftRevision,fields:{fullName:'Fictional Order Editor',phone:'971500000091'}});if(!saved.ok)throw Error(saved.error?.message||'无法保存虚构订单');});
  const frame=page.frameLocator('iframe.confirmed-frame');await frame.locator('.cwb-refresh').click();await frame.locator('.cwb-conversation').click();
  const order=frame.locator('.cwb-order-section').filter({hasText:'订单信息'}).first();await order.getByRole('button',{name:'编辑&确认',exact:true}).click();
  const dialog=frame.locator('dialog.cwb-items-editor-dialog');await dialog.getByRole('heading',{name:'编辑订单信息',exact:true}).waitFor();
  assert.equal(await dialog.getByRole('button',{name:'订单编辑说明',exact:true}).count(),1,'订单标题有圆形问号说明');
  assert.equal(await dialog.getByText('可在本机订单中调整商品、数量、单价和履约状态；不会修改 ShopPlus 后台。保存后会重新计算本机订单金额，已有报单会要求重新核对。',{exact:true}).isHidden(),true,'订单说明默认收纳');
  await dialog.getByRole('button',{name:'订单编辑说明',exact:true}).click();await dialog.getByText('可在本机订单中调整商品、数量、单价和履约状态；不会修改 ShopPlus 后台。保存后会重新计算本机订单金额，已有报单会要求重新核对。',{exact:true}).waitFor();
  assert.equal(await dialog.getByRole('button',{name:'商品金额说明',exact:true}).count(),1,'商品标题有圆形问号说明');
  assert.deepEqual(await dialog.locator('.cwb-order-item-column-heads span').allTextContents(),['序号','编号','商品','商品数量','包裹数量','单价']);
  assert.equal(await dialog.locator('.cwb-order-item-column-heads span').first().evaluate(element=>getComputedStyle(element).fontSize),'12px','表头字号增加到 12 px');
  const add=dialog.getByRole('button',{name:'+ 添加产品',exact:true}),heading=dialog.locator('.cwb-order-items-heading');const addBox=await add.boundingBox(),headingBox=await heading.boundingBox();assert.ok(addBox&&headingBox&&addBox.x+addBox.width>headingBox.x+headingBox.width-4,'添加产品位于商品明细标题行右侧');
  await add.click();const row=dialog.locator('.cwb-order-item-edit-row').last();assert.equal(await row.locator('.cwb-quantity-stepper').count(),1,'商品数量使用紧凑加减控件');assert.equal(await row.getByRole('button',{name:'减少商品数量',exact:true}).count(),1);assert.equal(await row.getByRole('button',{name:'增加商品数量',exact:true}).count(),1);assert.equal(await row.locator('[data-product-name]').count(),1,'新增商品仍可填写商品名称');assert.equal(await row.locator('[data-business-code]').count(),1,'新增商品仍可填写商品编号');assert.equal(await row.locator('[data-price]').count(),1,'商品单价保持可编辑');
 }finally{await application?.close();await rm(directory,{recursive:true,force:true});}
});
