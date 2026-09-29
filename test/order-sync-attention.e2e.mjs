import test from 'node:test';
import assert from 'node:assert/strict';
import {_electron as electron} from 'playwright-core';
import electronPath from 'electron';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('订单管理显示新订单会话／沟通核对提醒，并且定时更新必须明确启用',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'order-sync-attention-'));let application;
  try{
    application=await electron.launch({executablePath:process.env.KDOCS_TEST_EXECUTABLE||electronPath,args:[...(process.env.KDOCS_TEST_EXECUTABLE?[]:['.']),`--orders-test-user-data=${directory}`],cwd:path.resolve('.'),env:{...process.env,NODE_ENV:'test'}});
    const page=await application.firstWindow({timeout:30000});page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await application.evaluate(({ipcMain})=>{
      globalThis.__fictionalOrderSyncSchedule={enabled:false,intervalMinutes:30};globalThis.__fictionalOrderSyncAttention=[
        {id:'fictional-order-a',orderNo:'FICTIONAL-ORDER-A',phone:'',createdAt:'2026-09-25T12:00:00.000Z',contactStatus:'phone_missing',messageCount:0},
        {id:'fictional-order-b',orderNo:'FICTIONAL-ORDER-B',phone:'+971 500 000 001',createdAt:'2026-09-25T12:01:00.000Z',contactStatus:'chat_not_bound',messageCount:0},
        {id:'fictional-order-c',orderNo:'FICTIONAL-ORDER-C',phone:'+971 500 000 002',createdAt:'2026-09-25T12:02:00.000Z',contactStatus:'chat_bound_no_messages',messageCount:0},
        {id:'fictional-order-d',orderNo:'FICTIONAL-ORDER-D',phone:'+971 500 000 003',createdAt:'2026-09-25T12:03:00.000Z',contactStatus:'communicated',messageCount:4}
      ];globalThis.__fictionalShopPlusCalls=0;
      const status=()=>({configured:true,test:{status:'verified',at:'2026-09-25T12:00:00.000Z',message:'已通过虚构订单读取验证'},sync:{lastSuccessfulAt:null,lastFetchedAt:null,lastImported:0,lastExisting:0,lastBlocked:0,truncated:false},schedule:globalThis.__fictionalOrderSyncSchedule});
      ipcMain.removeHandler('orders:shopplus-status');ipcMain.handle('orders:shopplus-status',async()=>({ok:true,data:status()}));
      ipcMain.removeHandler('orders:shopplus-sync-attention');ipcMain.handle('orders:shopplus-sync-attention',async()=>({ok:true,data:{orders:globalThis.__fictionalOrderSyncAttention}}));
      ipcMain.removeHandler('orders:acknowledge-shopplus-sync-attention');ipcMain.handle('orders:acknowledge-shopplus-sync-attention',async()=>{globalThis.__fictionalOrderSyncAttention=[];return {ok:true,data:{orders:[]}};});
      ipcMain.removeHandler('orders:configure-order-sync-schedule');ipcMain.handle('orders:configure-order-sync-schedule',async(_event,payload)=>{globalThis.__fictionalOrderSyncSchedule={enabled:payload.enabled===true,intervalMinutes:Number(payload.intervalMinutes)||30};return {ok:true,data:globalThis.__fictionalOrderSyncSchedule};});
    });
    const frame=page.frameLocator('iframe.confirmed-frame');await frame.getByRole('button',{name:'订单管理',exact:true}).click();await frame.locator('#ui040').waitFor();
    await frame.getByText('发现 4 个新订单待处理',{exact:true}).waitFor();
    assert.equal(await frame.getByText(/电话待核对，暂不能关联 WhatsApp 会话/).count(),1);
    assert.equal(await frame.getByText(/未发现已核对 WhatsApp 会话/).count(),1);
    assert.equal(await frame.getByText(/已关联会话，尚未保存本单沟通记录/).count(),1);
    assert.equal(await frame.getByText(/已保存 4 条本单沟通记录/).count(),1);
    assert.equal(await frame.getByText(/是否加好友.*没有可验证字段/).count(),1,'不把不可验证的好友关系伪造成事实');
    assert.equal(await frame.getByRole('button',{name:'设置订单定时更新',exact:true}).textContent(),'定时更新：关闭');
    await frame.getByRole('button',{name:'设置订单定时更新',exact:true}).click();const dialog=frame.getByRole('dialog');await dialog.getByRole('heading',{name:'同步 ShopPlus 订单',exact:true}).waitFor();
    await dialog.getByLabel('订单定时更新间隔').selectOption('15');await dialog.getByRole('button',{name:'保存定时更新',exact:true}).click();await dialog.getByText('已启用每 15 分钟定时更新。',{exact:true}).waitFor();
    await dialog.getByRole('button',{name:'关闭',exact:true}).click();assert.equal(await frame.getByRole('button',{name:'设置订单定时更新',exact:true}).textContent(),'定时更新：每 15 分钟');
    await frame.getByRole('button',{name:'已查看这些新订单',exact:true}).click();await frame.locator('.ob-sync-attention').evaluate(element=>element.hidden===true);assert.equal(await application.evaluate(()=>globalThis.__fictionalOrderSyncAttention.length),0);
    await application.evaluate(()=>{globalThis.__fictionalOrderSyncAttention=[{id:'fictional-order-e',orderNo:'FICTIONAL-ORDER-E',phone:'+971 500 000 004',createdAt:'2026-09-25T12:04:00.000Z',contactStatus:'chat_not_bound',messageCount:0}];});await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.send('app:orders-synced',{automatic:true,result:{imported:1}}));await frame.getByText('发现 1 个新订单待处理',{exact:true}).waitFor();await frame.getByText('定时更新发现 1 个新订单，请核对会话与沟通记录。',{exact:true}).waitFor();
    assert.deepEqual(errors,[]);assert.equal(await application.evaluate(()=>globalThis.__fictionalShopPlusCalls),0,'全程只用虚构 IPC，不读取真实 ShopPlus');
  }finally{
    if(application){const process=application.process();await Promise.race([application.close().catch(()=>{}),new Promise(resolve=>setTimeout(resolve,3000))]);if(process.exitCode===null)process.kill('SIGKILL');}
    await rm(directory,{recursive:true,force:true,maxRetries:3,retryDelay:150}).catch(()=>{});
  }
});
