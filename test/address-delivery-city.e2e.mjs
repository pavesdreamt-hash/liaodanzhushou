import test from 'node:test';
import assert from 'node:assert/strict';
import {_electron as electron} from 'playwright-core';
import electronPath from 'electron';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('人工配送确认只更新本机城市库或禁配名单',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'delivery-city-'));let application;
 try{
  application=await electron.launch({executablePath:process.env.KDOCS_TEST_EXECUTABLE||electronPath,args:[...(process.env.KDOCS_TEST_EXECUTABLE?[]:['.']),`--orders-test-user-data=${directory}`],cwd:path.resolve('.'),env:{...process.env,NODE_ENV:'test'}});
  const page=await application.firstWindow();
  await application.evaluate(({ipcMain})=>{
   ipcMain.removeHandler('manual-chat');ipcMain.handle('manual-chat',async(_event,{action})=>({ok:true,data:action==='status'?{status:'online'}:action==='inbox'?{items:[{phone:'971500000000',chatId:'wa-phone:971500000000',name:'Delivery Fixture',updatedAt:'2026-09-23T08:00:00.000Z',preview:'Delivery check',direction:'customer',unreadCount:0}],total:1,offset:0,hasMore:false}:action==='openInbox'||action==='recent'?{token:'delivery-fixture',accountId:'merchant',chatId:'wa-phone:971500000000',phone:'971500000000',messages:[],hasMore:false}:null}));
   ipcMain.removeHandler('manual-reply-translation');ipcMain.handle('manual-reply-translation',async()=>({ok:true,data:{translations:[]}}));
  });
  const detail=await page.evaluate(async()=>{
   const created=await window.inventoryApp.orders.createDraft({requestId:'delivery-city-fixture'});
   if(!created.ok)throw Error(created.error?.message||'无法创建隔离订单');
   const saved=await window.inventoryApp.orders.saveDraft({orderId:created.data.id,revision:created.data.draftRevision,fields:{fullName:'Fictional Delivery Customer',phone:'971500000000',country:'United Arab Emirates',province:'Fictional Emirate',city:'Example Delivery City',street:'Fictional Street',residence:'Fictional Villa'}});
   if(!saved.ok)throw Error(saved.error?.message||'无法保存隔离订单');
   const map=await window.inventoryApp.orders.openGoogleMaps(saved.data.id);
   if(!map.ok||!map.data.opened)throw Error('Google 地图操作未成功');
   const deliverable=await window.inventoryApp.orders.decideDeliveryCity({orderId:saved.data.id,decision:'deliverable',note:'人工地图核对：在配送范围内'});
   if(!deliverable.ok)throw Error(deliverable.error?.message||'无法确认可配送');
   return {id:saved.data.id,status:deliverable.data.addressVerification.status};
  });
  assert.equal(detail.status,'deliverable');
  const frame=page.frameLocator('iframe.confirmed-frame');await frame.locator('.cwb-refresh').click();await frame.locator('.cwb-conversation').click();
  const addressSection=frame.locator('.cwb-order-section').filter({hasText:'地址核对'}).first();
  for(const name of ['编辑地址','配送设置'])assert.equal(await addressSection.getByRole('button',{name,exact:true}).count(),1,`地址核对卡显示 ${name}`);
  for(const name of ['打开 Google 地图','确认可配送','标记不可配送','客户确认'])assert.equal(await addressSection.getByRole('button',{name,exact:true}).count(),0,`地址核对卡不直接显示 ${name}`);
  assert.equal(await addressSection.locator('.cwb-field').filter({hasText:'说明'}).count(),0,'地址卡不重复显示说明字段');
  for(const label of ['街道 / 门牌','楼栋 / 单元'])assert.equal(await addressSection.locator('.cwb-field').filter({hasText:label}).count(),1,`地址卡显示 ${label}`);
  await addressSection.getByRole('button',{name:'编辑地址',exact:true}).click();
  const addressDialog=frame.locator('dialog.cwb-order-edit-dialog');
  await assert.equal(await addressDialog.getByRole('heading',{name:'地址信息校正',exact:true}).count(),1,'地址编辑弹窗已打开');
  for(const label of ['街道 / 门牌','楼栋 / 单元'])assert.equal(await addressDialog.getByText(label,{exact:true}).count(),1,`编辑弹窗显示 ${label}`);
  assert.equal(await addressDialog.getByRole('button',{name:'在 Google 地图查看当前完整地址',exact:true}).count(),1,'地图入口在编辑弹窗内');
  await addressDialog.getByRole('button',{name:'关闭',exact:true}).click();
  await addressSection.getByRole('button',{name:'配送设置',exact:true}).click();
  const deliveryDialog=frame.locator('dialog.cwb-delivery-settings-dialog');
  await assert.equal(await deliveryDialog.getByRole('heading',{name:'配送设置',exact:true}).count(),1,'配送设置弹窗已打开');
  for(const name of ['设为可配送','设为不可配送'])assert.equal(await deliveryDialog.getByRole('button',{name,exact:true}).count(),1,`配送选择弹窗显示 ${name}`);
  assert.equal(await deliveryDialog.getByLabel('地图核对依据',{exact:true}).count(),1,'配送选择要求人工填写核对依据');
  await deliveryDialog.getByRole('button',{name:'取消',exact:true}).click();
  const rangeFile=path.join(directory,'orders','delivery-zones.json');
  let range=JSON.parse(await readFile(rangeFile,'utf8'));
  assert.deepEqual(range.cities,['example delivery city']);
  assert.deepEqual(range.blockedCities,[]);
  const blocked=await page.evaluate(async orderId=>{
   const result=await window.inventoryApp.orders.decideDeliveryCity({orderId,decision:'out_of_range',note:'人工地图核对：不在配送范围内'});
   if(!result.ok)throw Error(result.error?.message||'无法标记不可配送');
   return result.data.addressVerification.status;
  },detail.id);
  assert.equal(blocked,'out_of_range');
  range=JSON.parse(await readFile(rangeFile,'utf8'));
  assert.deepEqual(range.cities,[]);
  assert.deepEqual(range.blockedCities,['example delivery city']);
 }finally{await application?.close();await rm(directory,{recursive:true,force:true});}
});
