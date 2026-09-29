import test from 'node:test';
import assert from 'node:assert/strict';
import {_electron as electron} from 'playwright-core';
import electronPath from 'electron';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('ShopPlus 只在连接与设置集中配置，订单与商品读取复用并分别验证',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'shopplus-settings-central-')),artifacts=path.resolve('artifacts/shopplus-settings-centralization');let application;
  try{
    await mkdir(artifacts,{recursive:true});
    application=await electron.launch({executablePath:process.env.KDOCS_TEST_EXECUTABLE||electronPath,args:[...(process.env.KDOCS_TEST_EXECUTABLE?[]:['.']),`--orders-test-user-data=${directory}`],cwd:path.resolve('.'),env:{...process.env,NODE_ENV:'test'}});
    const page=await application.firstWindow({timeout:30000});page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await application.evaluate(({ipcMain})=>{
      globalThis.__shopPlusCentralState={configured:false,test:null,productTest:null,sync:{lastSuccessfulAt:null,lastFetchedAt:null,lastImported:0,lastExisting:0,lastBlocked:0,truncated:false}};
      globalThis.__shopPlusCentralConfigCalls=0;globalThis.__shopPlusCentralProductCalls=0;globalThis.__shopPlusCentralRealCalls=0;
      const catalog=()=>({products:[],limit:100,defaultTarget:2,imageMaxBytes:500*1024,canCollect:true,lastRun:null,batch:{status:'ready',captured:0}});
      ipcMain.removeHandler('orders:shopplus-status');ipcMain.handle('orders:shopplus-status',async()=>({ok:true,data:globalThis.__shopPlusCentralState}));
      ipcMain.removeHandler('orders:configure-shopplus');ipcMain.handle('orders:configure-shopplus',async()=>{globalThis.__shopPlusCentralConfigCalls++;globalThis.__shopPlusCentralState={...globalThis.__shopPlusCentralState,configured:true,test:{status:'verified',at:'2026-09-25T12:00:00.000Z',message:'已通过虚构 ShopPlus 订单读取验证'}};return {ok:true,data:{canceled:false,state:globalThis.__shopPlusCentralState}};});
      ipcMain.removeHandler('orders:shopplus-product-catalog');ipcMain.handle('orders:shopplus-product-catalog',async()=>({ok:true,data:{catalog:catalog(),status:globalThis.__shopPlusCentralState}}));
      ipcMain.removeHandler('orders:sync-shopplus-products');ipcMain.handle('orders:sync-shopplus-products',async()=>{globalThis.__shopPlusCentralProductCalls++;globalThis.__shopPlusCentralState={...globalThis.__shopPlusCentralState,productTest:{status:'verified',at:'2026-09-25T12:00:00.000Z',message:'已通过虚构 ShopPlus 商品读取验证'}};return {ok:true,data:{catalog:catalog(),status:globalThis.__shopPlusCentralState,collected:true}};});
    });
    const frame=page.frameLocator('iframe.confirmed-frame');
    await frame.getByRole('button',{name:'订单管理',exact:true}).click();await frame.locator('#ui040').waitFor();
    await frame.getByRole('button',{name:'同步最新订单',exact:true}).click();const sync=frame.getByRole('dialog');await sync.getByRole('heading',{name:'同步 ShopPlus 订单',exact:true}).waitFor();
    assert.equal(await sync.getByText('ShopPlus 尚未在连接与设置配置',{exact:true}).count(),1);
    assert.equal(await sync.getByRole('button',{name:'配置 ShopPlus API',exact:true}).count(),0);
    await sync.getByRole('button',{name:'前往连接与设置',exact:true}).click();await frame.locator('#ui036').waitFor();
    const card=frame.locator('#u36-shopplus-card');await card.waitFor();
    assert.equal(await frame.locator('#u36-shopplus-status').textContent(),'未配置');
    assert.equal(await frame.locator('#u36-shopplus-app-key').inputValue(),'');assert.equal(await frame.locator('#u36-shopplus-secret').inputValue(),'');
    assert.equal((await card.innerText()).includes('fictional-secret'),false,'凭据原文不能出现在设置页');
    await frame.getByRole('button',{name:'配置／更换 ShopPlus API',exact:true}).click();await frame.getByText('订单读取已验证',{exact:true}).waitFor();
    assert.equal(await application.evaluate(()=>globalThis.__shopPlusCentralConfigCalls),1,'只从设置页触发一次虚构安全配置');
    assert.equal(await frame.locator('#u36-shopplus-app-key').inputValue(),'App Key 已安全保存');assert.equal(await frame.locator('#u36-shopplus-secret').inputValue(),'API Secret 已安全保存');
    await frame.getByRole('button',{name:'订单管理',exact:true}).click();await frame.locator('#ui040').waitFor();await frame.getByRole('button',{name:'同步最新订单',exact:true}).click();await sync.getByText('ShopPlus 已连接',{exact:true}).waitFor();
    assert.equal(await sync.getByRole('button',{name:'配置 ShopPlus API',exact:true}).count(),0);assert.equal(await sync.getByRole('button',{name:'前往连接与设置',exact:true}).count(),0);assert.equal(await sync.getByRole('button',{name:'同步最新订单',exact:true}).isDisabled(),false);
    await sync.getByRole('button',{name:'关闭',exact:true}).click();
    await frame.getByRole('button',{name:'商品库存',exact:true}).click();await frame.locator('#ui011-inventory').waitFor();assert.equal(await frame.locator('#ui011-connection-label').textContent(),'ShopPlus 商品读取待验证');
    await frame.locator('#ui011-product-manager').click();const productManager=frame.locator('dialog.shared-dialog').filter({hasText:'商品管理'});await productManager.locator('#ui011-manager-target').selectOption('2');await productManager.locator('#ui011-manager-collect').click();await frame.getByText('ShopPlus 商品读取已验证',{exact:true}).waitFor();assert.equal(await application.evaluate(()=>globalThis.__shopPlusCentralProductCalls),1,'商品权限只在明确采集时单独验证');await productManager.locator('#ui011-manager-close').click();
    await frame.getByRole('button',{name:'连接与设置',exact:true}).click();await frame.locator('#ui036').waitFor();
    await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1280,820));await page.waitForTimeout(180);await page.screenshot({path:path.join(artifacts,'shopplus-settings-1280x820.png')});
    await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(820,640));await page.waitForTimeout(180);const narrow=await card.evaluate(element=>({clientWidth:element.clientWidth,scrollWidth:element.scrollWidth}));assert.ok(narrow.scrollWidth<=narrow.clientWidth,'窄窗口内 ShopPlus 配置卡不横向溢出');await page.screenshot({path:path.join(artifacts,'shopplus-settings-820x640.png')});
    await application.evaluate(({ipcMain})=>{ipcMain.removeHandler('orders:shopplus-status');ipcMain.handle('orders:shopplus-status',async()=>({ok:false,error:{message:'虚构安全存储暂不可读取'}}));});
    await frame.getByRole('button',{name:'重新读取状态',exact:true}).click();await frame.getByText('配置状态暂不可读取',{exact:true}).waitFor();assert.equal(await frame.getByText('未配置',{exact:true}).count(),0,'状态读取失败不能被错误标记为未配置');
    assert.deepEqual(errors,[]);assert.deepEqual(await application.evaluate(()=>({realShopPlusCalls:globalThis.__shopPlusCentralRealCalls,configurationCalls:globalThis.__shopPlusCentralConfigCalls,productCalls:globalThis.__shopPlusCentralProductCalls})),{realShopPlusCalls:0,configurationCalls:1,productCalls:1});
  }finally{
    if(application){const process=application.process();await Promise.race([application.close().catch(()=>{}),new Promise(resolve=>setTimeout(resolve,3000))]);if(process.exitCode===null)process.kill('SIGKILL');}
    await rm(directory,{recursive:true,force:true,maxRetries:3,retryDelay:150}).catch(()=>{});
  }
});
