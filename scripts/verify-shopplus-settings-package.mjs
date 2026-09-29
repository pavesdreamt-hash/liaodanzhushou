import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {_electron as electron} from 'playwright-core';

const version=JSON.parse(await readFile('package.json','utf8')).version;
const appPath=path.resolve(process.env.SHOPPLUS_SETTINGS_APP_PATH||path.join('dist',`聊单助手${version}-x64`,'mac',`聊单助手 ${version}.app`));
const output=path.resolve(`artifacts/shopplus-settings-${version}`),report={packaged:false,version,arch:null,appPath,fictionalData:true,realShopPlusCalls:0,realMessagesSent:0,checks:[],errors:[]};
const waitFor=async(check,{timeout=30000,interval=120}={})=>{const until=Date.now()+timeout;let value;while(Date.now()<until){try{value=await check();if(value)return value;}catch{}await new Promise(resolve=>setTimeout(resolve,interval));}throw new Error('Timed out waiting for fictional ShopPlus centralized configuration state');};

await mkdir(output,{recursive:true});
const temporary=await mkdtemp(path.join(os.tmpdir(),'liaodan-shopplus-settings-app-')),data=path.join(temporary,'data');let application;
try{
  application=await electron.launch({executablePath:path.join(appPath,'Contents','MacOS',`聊单助手 ${version}`),args:[`--isolated-user-data=${data}`,`--orders-test-user-data=${data}`],cwd:path.dirname(appPath),env:{...process.env,NODE_ENV:'test'}});
  const page=await application.firstWindow({timeout:60000});page.setDefaultTimeout(30000);const pageErrors=[];page.on('pageerror',error=>pageErrors.push(error.message));
  const identity=await application.evaluate(({app})=>({packaged:app.isPackaged,version:app.getVersion(),arch:process.arch,path:app.getAppPath()}));
  assert.equal(identity.packaged,true);assert.equal(identity.version,version);assert.equal(identity.arch,'x64');assert.equal(identity.path.startsWith(appPath),true);Object.assign(report,{packaged:true,arch:identity.arch,identity});report.checks.push('final-app-identity');
  await application.evaluate(({ipcMain})=>{
    globalThis.__shopPlusPackageState={configured:false,test:null,productTest:null,sync:{lastSuccessfulAt:null,lastFetchedAt:null,lastImported:0,lastExisting:0,lastBlocked:0,truncated:false}};
    globalThis.__shopPlusPackageConfigCalls=0;globalThis.__shopPlusPackageProductCalls=0;globalThis.__shopPlusPackageRealCalls=0;
    const catalog=()=>({products:[],limit:2,imageMaxBytes:500*1024,canCollect:true,lastRun:null,batch:{status:'ready',captured:0}});
    ipcMain.removeHandler('orders:shopplus-status');ipcMain.handle('orders:shopplus-status',async()=>({ok:true,data:globalThis.__shopPlusPackageState}));
    ipcMain.removeHandler('orders:configure-shopplus');ipcMain.handle('orders:configure-shopplus',async()=>{globalThis.__shopPlusPackageConfigCalls++;globalThis.__shopPlusPackageState={...globalThis.__shopPlusPackageState,configured:true,test:{status:'verified',at:'2026-09-25T12:00:00.000Z',message:'已通过虚构 ShopPlus 订单读取验证'}};return {ok:true,data:{canceled:false,state:globalThis.__shopPlusPackageState}};});
    ipcMain.removeHandler('orders:shopplus-product-catalog');ipcMain.handle('orders:shopplus-product-catalog',async()=>({ok:true,data:{catalog:catalog(),status:globalThis.__shopPlusPackageState}}));
    ipcMain.removeHandler('orders:sync-shopplus-products');ipcMain.handle('orders:sync-shopplus-products',async()=>{globalThis.__shopPlusPackageProductCalls++;globalThis.__shopPlusPackageState={...globalThis.__shopPlusPackageState,productTest:{status:'verified',at:'2026-09-25T12:00:00.000Z',message:'已通过虚构 ShopPlus 商品读取验证'}};return {ok:true,data:{catalog:catalog(),status:globalThis.__shopPlusPackageState,collected:true}};});
  });
  const frame=page.frameLocator('iframe.confirmed-frame');
  await frame.getByRole('button',{name:'订单管理',exact:true}).click();await frame.locator('#ui040').waitFor();await frame.getByRole('button',{name:'同步最新订单',exact:true}).click();
  const sync=frame.getByRole('dialog');await sync.getByRole('heading',{name:'同步 ShopPlus 订单',exact:true}).waitFor();assert.equal(await sync.getByText('ShopPlus 尚未在连接与设置配置',{exact:true}).count(),1);assert.equal(await sync.getByRole('button',{name:'配置 ShopPlus API',exact:true}).count(),0);await sync.getByRole('button',{name:'前往连接与设置',exact:true}).click();report.checks.push('unconfigured-order-dialog-links-to-settings-only');
  await frame.locator('#ui036').waitFor();const card=frame.locator('#u36-shopplus-card');await card.waitFor();assert.equal(await frame.locator('#u36-shopplus-status').textContent(),'未配置');assert.equal(await frame.locator('#u36-shopplus-app-key').inputValue(),'');assert.equal(await frame.locator('#u36-shopplus-secret').inputValue(),'');assert.equal((await card.innerText()).includes('fictional-secret'),false);await frame.getByRole('button',{name:'配置／更换 ShopPlus API',exact:true}).click();await frame.getByText('订单读取已验证',{exact:true}).waitFor();assert.equal(await frame.locator('#u36-shopplus-app-key').inputValue(),'App Key 已安全保存');assert.equal(await frame.locator('#u36-shopplus-secret').inputValue(),'API Secret 已安全保存');report.checks.push('settings-is-only-credential-entry-and-never-renders-secret');
  await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1280,820));await page.waitForTimeout(180);await page.screenshot({path:path.join(output,'shopplus-settings-1280x820.png')});
  await frame.getByRole('button',{name:'订单管理',exact:true}).click();await frame.locator('#ui040').waitFor();await frame.getByRole('button',{name:'同步最新订单',exact:true}).click();await sync.getByText('ShopPlus 已连接',{exact:true}).waitFor();assert.equal(await sync.getByRole('button',{name:'配置 ShopPlus API',exact:true}).count(),0);assert.equal(await sync.getByRole('button',{name:'同步最新订单',exact:true}).isDisabled(),false);await page.screenshot({path:path.join(output,'shopplus-order-sync-1280x820.png')});await sync.getByRole('button',{name:'关闭',exact:true}).click();report.checks.push('configured-order-sync-reuses-settings-credential');
  await frame.getByRole('button',{name:'商品库存',exact:true}).click();await frame.locator('#ui011-inventory').waitFor();assert.equal(await frame.locator('#ui011-connection-label').textContent(),'ShopPlus 商品读取待验证');await frame.locator('#ui011-sync').click();await waitFor(async()=>await frame.locator('#ui011-connection-label').textContent()==='ShopPlus 商品读取已验证');report.checks.push('product-permission-remains-separate');
  await frame.getByRole('button',{name:'连接与设置',exact:true}).click();await frame.locator('#ui036').waitFor();await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(820,640));await page.waitForTimeout(180);const narrow=await card.evaluate(element=>({clientWidth:element.clientWidth,scrollWidth:element.scrollWidth}));assert.ok(narrow.scrollWidth<=narrow.clientWidth);await page.screenshot({path:path.join(output,'shopplus-settings-820x640.png')});report.checks.push('settings-layout-1280x820-and-820x640');
  const counters=await application.evaluate(()=>({configurationCalls:globalThis.__shopPlusPackageConfigCalls,productCalls:globalThis.__shopPlusPackageProductCalls,realShopPlusCalls:globalThis.__shopPlusPackageRealCalls}));assert.deepEqual(counters,{configurationCalls:1,productCalls:1,realShopPlusCalls:0});assert.deepEqual(pageErrors,[]);Object.assign(report,{...counters,errors:pageErrors});
}catch(error){report.errors.push(String(error?.stack||error));throw error;
}finally{
  if(application){const process=application.process();await Promise.race([application.close().catch(()=>{}),new Promise(resolve=>setTimeout(resolve,5000))]);if(process.exitCode===null)process.kill('SIGKILL');}
  await writeFile(path.join(output,'app-verification.json'),JSON.stringify(report,null,2));
  await rm(temporary,{recursive:true,force:true,maxRetries:3,retryDelay:150}).catch(()=>{});
}

console.log(JSON.stringify(report));
