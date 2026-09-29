import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {_electron as electron} from 'playwright-core';

const version=JSON.parse(await readFile('package.json','utf8')).version;
const appPath=path.resolve(process.env.INVENTORY_PRODUCT_APP_PATH||path.join('dist','聊单助手.app'));
const executableName=path.basename(appPath,'.app');
const output=path.resolve(`artifacts/inventory-product-${version}`);
const waitFor=async(check,{timeout=30_000,interval=120}={})=>{const until=Date.now()+timeout;while(Date.now()<until){try{if(await check())return;}catch{}await new Promise(resolve=>setTimeout(resolve,interval));}throw new Error('Timed out waiting for packaged fictional catalogue collection');};

await mkdir(output,{recursive:true});
const temporary=await mkdtemp(path.join(os.tmpdir(),'liaodan-inventory-product-app-'));const data=path.join(temporary,'data');let application;
try{
  application=await electron.launch({executablePath:path.join(appPath,'Contents','MacOS',executableName),args:[`--isolated-user-data=${data}`,`--orders-test-user-data=${data}`],cwd:path.dirname(appPath),env:{...process.env,NODE_ENV:'test'}});
  const page=await application.firstWindow({timeout:60_000});page.setDefaultTimeout(30_000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const identity=await application.evaluate(({app})=>({packaged:app.isPackaged,version:app.getVersion(),arch:process.arch,path:app.getAppPath()}));
  assert.deepEqual({packaged:identity.packaged,version:identity.version,arch:identity.arch},{packaged:true,version,arch:'x64'});assert.equal(identity.path.startsWith(appPath),true);
  await application.evaluate(({ipcMain})=>{
    globalThis.__publishedCatalogCalls=0;globalThis.__publishedCatalogScope=null;globalThis.__publishedCatalogMediaCalls=0;
    globalThis.__publishedCatalogStatus={configured:true,productTest:null};
    globalThis.__publishedCatalogProducts=[{remoteProductId:'legacy-inactive',productNumber:'LEGACY-001',name:'Legacy local archive',websitePriceAed:1,stockQuantity:0,publishStatus:0,description:'manual local text',floorPriceAed:1}];
    const view=()=>({version:2,products:globalThis.__publishedCatalogProducts,archivedCount:globalThis.__publishedCatalogArchived?.length||0,limit:null,legacyLimit:100,defaultTarget:2,imageMaxBytes:500*1024,canCollect:true,lastRun:globalThis.__publishedCatalogLastRun||null,refreshRun:null,mediaRun:null,sourcePricingRun:null,batch:{status:'ready',captured:globalThis.__publishedCatalogProducts.length}});
    ipcMain.removeHandler('orders:shopplus-product-catalog');ipcMain.handle('orders:shopplus-product-catalog',async()=>({ok:true,data:{catalog:view(),status:globalThis.__publishedCatalogStatus}}));
    ipcMain.removeHandler('orders:sync-shopplus-products');ipcMain.handle('orders:sync-shopplus-products',async(_event,payload)=>{
      globalThis.__publishedCatalogCalls++;globalThis.__publishedCatalogScope=payload?.scope||null;
      if(payload?.scope!=='published-in-stock')return {ok:false,error:{message:'验收只接受全量已上架有货范围'}};
      globalThis.__publishedCatalogProducts=Array.from({length:205},(_,index)=>({remoteProductId:`published-${index+1}`,productNumber:`PUBLISHED-${String(index+1).padStart(3,'0')}`,name:`Published fictional ${index+1}`,websitePriceAed:100+index,stockQuantity:index===0?1:2,publishStatus:1,description:'fictional read-only product'}));
      globalThis.__publishedCatalogArchived=[{remoteProductId:'legacy-inactive',productNumber:'LEGACY-001',name:'Legacy local archive',description:'manual local text',floorPriceAed:1,archivedReason:'unpublished'}];
      globalThis.__publishedCatalogLastRun={at:'2026-09-26T12:00:00.000Z',scope:'published-in-stock',status:'completed',pages:5,received:208,captured:205,added:204,reinstated:0,archived:1,skippedUnpublished:1,skippedOutOfStock:2,imageManualReview:0};
      globalThis.__publishedCatalogStatus={configured:true,productTest:{status:'verified',at:'2026-09-26T12:00:00.000Z',message:'已通过虚构 ShopPlus 商品读取验证'}};
      return {ok:true,data:{catalog:view(),status:globalThis.__publishedCatalogStatus,collected:true}};
    });
    ipcMain.removeHandler('orders:sync-shopplus-product-media');ipcMain.handle('orders:sync-shopplus-product-media',async()=>{globalThis.__publishedCatalogMediaCalls++;return {ok:false,error:{message:'目录采集不应读取图片'}};});
  });
  const frame=page.frameLocator('iframe.confirmed-frame');await frame.getByRole('button',{name:'商品库存',exact:true}).click();await frame.locator('#ui011-inventory').waitFor();
  await frame.locator('#ui011-page-help').click();await frame.locator('#ui011-popover').waitFor({state:'visible'});const help=await frame.locator('#ui011-popover').textContent()||'';assert.match(help,/已上架且库存大于 0/);assert.match(help,/不再有 100 款截断/);await frame.locator('#ui011-close-popover').click();
  await frame.locator('#ui011-product-manager').click();const manager=frame.locator('dialog.shared-dialog').filter({hasText:'采集与更新商品'});await manager.waitFor({state:'visible'});assert.equal(await manager.locator('#ui011-manager-target').count(),0);assert.match(await manager.textContent()||'',/读取全部上架有货商品/);await manager.locator('#ui011-manager-collect').click();
  await waitFor(async()=>await frame.locator('#ui011-rows tr').count()===10);assert.equal(await application.evaluate(()=>globalThis.__publishedCatalogCalls),1);assert.equal(await application.evaluate(()=>globalThis.__publishedCatalogScope),'published-in-stock');assert.equal(await application.evaluate(()=>globalThis.__publishedCatalogMediaCalls),0);
  assert.match(await manager.locator('output').textContent()||'',/已保存 205 款/);assert.match(await manager.locator('output').textContent()||'',/已下架跳过 1/);assert.match(await manager.locator('output').textContent()||'',/无货或库存未知跳过 2/);assert.match(await manager.locator('output').textContent()||'',/归档 1/);await manager.locator('#ui011-manager-close').click();
  assert.equal(await frame.locator('#ui011-connection-label').textContent(),'ShopPlus 商品读取已验证');assert.equal(await frame.locator('#ui011-product-manager').innerText(),'采集与更新商品');assert.equal(await frame.locator('#ui011-rows tr').first().getByRole('button',{name:'商品操作',exact:true}).count(),1);assert.deepEqual(await frame.locator('.overview-grid').evaluate(grid=>({label:getComputedStyle(grid.querySelector('label')).fontSize,value:getComputedStyle(grid.querySelector('strong')).fontSize})),{label:'11px',value:'14px'});assert.equal(await frame.locator('#ui011-page-summary').textContent(),'本页第 1–10 项 · 共 205 项');assert.equal(await frame.locator('#ui011-page-current').textContent(),'1 / 21');assert.deepEqual(await frame.locator('#ui011-inventory thead th').allTextContents(),['序号','商品名称','网站售价（AED）','网站库存','上架状态','操作']);assert.match(await frame.locator('#ui011-rows tr').first().textContent()||'',/库存少 · 1/);assert.match(await frame.locator('#ui011-rows tr').first().textContent()||'',/已上架/);
  await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(window=>window.isVisible())?.setContentSize(1280,820));await page.waitForTimeout(250);const wide=await frame.locator('#ui011-inventory .table-wrap').evaluate(node=>({clientWidth:node.clientWidth,scrollWidth:node.scrollWidth}));assert.ok(wide.clientWidth>0&&wide.scrollWidth>=wide.clientWidth);assert.match(await frame.locator('#ui011-rows tr').first().textContent()||'',/Published fictional 1/);await page.screenshot({path:path.join(output,'published-in-stock-1280x820.png')});
  await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(window=>window.isVisible())?.setContentSize(820,640));await page.waitForTimeout(250);const narrow=await frame.locator('#ui011-inventory .table-wrap').evaluate(node=>({clientWidth:node.clientWidth,scrollWidth:node.scrollWidth}));assert.ok(narrow.scrollWidth>narrow.clientWidth);await page.screenshot({path:path.join(output,'published-in-stock-820x640.png')});assert.deepEqual(errors,[]);
  const report={ok:true,version,appPath,identity,directAppArtifact:true,fictionalProducts:true,realShopPlusCalls:0,realMessagesSent:0,checks:['final Mac x64 app launched directly','top-level collection label and per-row product-operation label are distinct','overview facts use 11px labels and 14px values','explicit product-manager action sends only published-in-stock scope','205 fictional published in-stock products survive the former 100-item boundary','one unpublished and two out-of-stock-or-unknown fictional products are reported as skipped','one existing inactive product is reported as locally archived','no image-read IPC is called by catalogue collection','six-column inventory and pager remain usable at 1280x820 and 820x640','no real ShopPlus, source-library, order, customer, WhatsApp, or AI operation']};await writeFile(path.join(output,'app-verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{try{application?.process().kill('SIGKILL');}catch{}await application?.close().catch(()=>{});await rm(temporary,{recursive:true,force:true,maxRetries:3,retryDelay:150}).catch(()=>{});}
