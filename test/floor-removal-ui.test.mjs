import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium,_electron as electron} from 'playwright-core';
import electronPath from 'electron';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const cachedImage=`data:image/png;base64,${(await readFile(path.resolve('assets','app-icon-1024.png'))).toString('base64')}`;
const packageVersion=JSON.parse(await readFile(path.resolve('package.json'),'utf8')).version;
const sleep=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));
const launchArguments=directory=>[...(process.env.KDOCS_TEST_EXECUTABLE?[]:['.']),`--orders-test-user-data=${directory}`,'--orders-test-browser-workspace',`--orders-test-browser-url-file=${path.join(directory,'url')}`];
const visualArtifactDirectory=process.env.KDOCS_VISUAL_ARTIFACT_DIR?path.resolve(process.env.KDOCS_VISUAL_ARTIFACT_DIR):null;

async function captureProductPickerVisual(application,page,filename,width,height){
 if(!visualArtifactDirectory)return;
 await mkdir(visualArtifactDirectory,{recursive:true});
 await page.setViewportSize({width,height});
 await page.waitForTimeout(300);
 await page.screenshot({path:path.join(visualArtifactDirectory,filename),fullPage:false});
 console.log(JSON.stringify({visualArtifact:path.join(visualArtifactDirectory,filename),contentSize:{width,height}}));
}

async function closeApplication(application,directory){
 try{if(application)await Promise.race([application.close(),sleep(4000)]);}catch{}
 try{application?.process().kill('SIGKILL');}catch{}
 await rm(directory,{recursive:true,force:true,maxRetries:3,retryDelay:150}).catch(()=>{});
}

test('实际browser 取消底价引用后保留建议售价、草稿、图片及身份保护',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'workbench-product-picker-'));let application,browser,page;const errors=[];
 try{
  application=await electron.launch({executablePath:process.env.KDOCS_TEST_EXECUTABLE||electronPath,args:launchArguments(directory),cwd:path.resolve('.'),env:{...process.env,NODE_ENV:'test'}});
  assert.equal(await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().length),0);
  let url;for(let i=0;i<100&&!url;i++){url=await readFile(path.join(directory,'url'),'utf8').catch(()=>'');if(!url)await sleep(100);}assert.ok(url);
  browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1280,height:820},serviceWorkers:'block'});
  await context.route('**/*',r=>new URL(r.request().url()).origin===new URL(url).origin?r.continue():r.abort());
  page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
  if(process.env.KDOCS_TEST_EXECUTABLE)assert.deepEqual(await application.evaluate(({app})=>({packaged:app.isPackaged,version:app.getVersion()})),{packaged:true,version:packageVersion});
  await application.evaluate(({app},image)=>{
   // The headless workspace dispatches HTTP operations, not ipcMain handlers.
   const handlers=new Map(),ipcMain={removeHandler:channel=>handlers.delete(channel),handle:(channel,fn)=>handlers.set(channel,fn)};
   const req=process.getBuiltinModule('module').createRequire(app.getAppPath()+'/package.json'),Server=req(app.getAppPath()+'/src/local-web-server.mjs').LocalWebServer,handle=Server.prototype.handle;
   Server.prototype.handle=function(request,response){if(!this.__pickerFixture){const dispatch=this.dispatch;this.dispatch=(channel,payload)=>handlers.has(channel)?handlers.get(channel)({},payload):dispatch(channel,payload);this.__pickerFixture=true;}return handle.call(this,request,response);};

   const customer={id:'fictional-customer-1',direction:'customer',text:'Fictional customer asks for a product.',sentAt:'2026-09-30T08:00:00.000Z',metadata:{messageType:'chat',media:[]}};
   globalThis.__productPickerSends=[];
   globalThis.__productPickerMediaCalls=[];
   globalThis.__productPickerIdentityVerified=false;
   ipcMain.removeHandler('manual-chat');
   ipcMain.handle('manual-chat',async(_event,{action,payload={}})=>{
    if(action==='status')return {ok:true,data:{status:'online'}};
    if(action==='inbox')return {ok:true,data:{items:[{phone:'971500009101',chatId:'wa-phone:971500009101',name:'Fictional product recipient',updatedAt:customer.sentAt,preview:customer.text,direction:'customer',unreadCount:0}],total:1,offset:0,hasMore:false}};
    if(action==='openInbox'||action==='recent')return {ok:true,data:{token:'product-picker-binding',accountId:'wa-phone:971500009100',chatId:'wa-phone:971500009101',phone:'971500009101',identityVerified:globalThis.__productPickerIdentityVerified,messages:[customer],hasMore:false}};
    if(action==='markSeen')return {ok:true,data:{seen:true}};
    if(action==='media'){globalThis.__productPickerMediaCalls.push(payload);return {ok:false,error:'the cached local image must not be read from WhatsApp again'};}
    if(action==='send'){globalThis.__productPickerSends.push(payload);return {ok:true,data:{status:'sent'}};}
    return {ok:false,error:`unexpected manual-chat action: ${action}`};
   });
   ipcMain.removeHandler('manual-reply-translation');
   ipcMain.handle('manual-reply-translation',async()=>({ok:true,data:{translations:[]}}));
   ipcMain.removeHandler('orders:list');
   ipcMain.handle('orders:list',async()=>({ok:true,data:[]}));
   globalThis.__productCatalogRequests=[];
   const catalog=[
    {remoteProductId:'fictional-product-001',productNumber:'SP-FICTIONAL-001',sourceSpu:'F-SPU-001',name:'沙漠礼盒（虚构）',stockKnown:true,stockQuantity:12,sourceStock:'有货',websitePriceAed:199,costPriceAed:88,suggestedPriceAed:260,floorPriceAed:170,image:{status:'cached',mimetype:'image/png',filename:'fictional-desert-gift.png',dataUrl:image}},
    {remoteProductId:'fictional-product-002',productNumber:'SP-FICTIONAL-002',sourceSpu:'F-SPU-002',name:'海湾水杯（虚构）',stockKnown:true,stockQuantity:4,sourceStock:'有货',websitePriceAed:42,costPriceAed:16,suggestedPriceAed:65,floorPriceAed:36,image:{status:'unavailable'}}
   ];
   ipcMain.removeHandler('orders:chat-product-catalog');
   ipcMain.handle('orders:chat-product-catalog',async(_event,payload={})=>{
    globalThis.__productCatalogRequests.push(structuredClone(payload));
    const query=String(payload.query||'').trim().toLocaleLowerCase('zh-CN');
    const selected=String(payload.remoteProductId||'').trim();
    const matches=catalog.filter(product=>selected?product.remoteProductId===selected:!query||[product.name,product.productNumber,product.sourceSpu].some(value=>String(value).toLocaleLowerCase('zh-CN').includes(query)));
    const products=matches.map(product=>payload.includeImage===true?product:{...product,image:{status:product.image.status}});
    return {ok:true,data:{products,lastSuccessfulReadAt:'2026-09-30T08:10:00.000Z'}};
   });
  },cachedImage);
  const target=new URL(url);target.searchParams.set('page','workbench');await page.goto(target.href);

  const frame=page.frameLocator('iframe.confirmed-frame');
  await frame.locator('.cwb-refresh').click();
  await frame.locator('.cwb-conversation').click();
  await frame.locator('article[data-message-id="fictional-customer-1"] .cwb-message-text').waitFor();
  const productButton=frame.locator('.cwb-product');
  assert.equal(await productButton.isDisabled(),true,'the local product entry must remain unavailable until the selected chat identity is verified');
  assert.equal(await application.evaluate(()=>globalThis.__productCatalogRequests.length),0,'an unverified chat must not read the local product catalog');
  await application.evaluate(()=>{globalThis.__productPickerIdentityVerified=true;});
  await frame.locator('.cwb-conversation').click();
  for(let attempt=0;attempt<20&&await productButton.isDisabled();attempt++)await page.waitForTimeout(50);
  assert.equal(await productButton.isDisabled(),false,'the product entry should unlock after the current chat identity is verified');
  await productButton.click();
  const dialog=frame.locator('dialog.cwb-product-picker-dialog');
  await dialog.waitFor({state:'visible'});
  assert.equal(await application.evaluate(()=>globalThis.__productPickerSends.length),0,'opening the local product picker must not send WhatsApp content');
  await dialog.getByText('沙漠礼盒（虚构）',{exact:true}).waitFor();
  assert.ok(await application.evaluate(()=>globalThis.__productCatalogRequests.length)>0,'the picker must read the local catalog through its narrow local endpoint');

  const search=dialog.locator('input:not([type="checkbox"])').first();
  await search.fill('礼盒');
  await dialog.getByText('沙漠礼盒（虚构）',{exact:true}).waitFor();
  await dialog.getByText('海湾水杯（虚构）',{exact:true}).waitFor({state:'detached'});
  assert.equal(await dialog.getByText('海湾水杯（虚构）',{exact:true}).count(),0,'search results should not retain products outside the current query');
  await dialog.getByText('沙漠礼盒（虚构）',{exact:true}).click();
  await dialog.getByText('AED 199.00',{exact:true}).waitFor();
  await dialog.getByText('AED 260.00',{exact:true}).waitFor();
  await dialog.getByText(/库存.*12/).waitFor();
  await dialog.locator('input[type="checkbox"]').first().waitFor();
  assert.equal(await dialog.locator('[data-product-field=floorPrice]').count(),0);assert.doesNotMatch(await dialog.textContent(),/底价/);
  assert.ok(await dialog.locator('[data-product-field=suggestedPrice]').isChecked());
  await captureProductPickerVisual(application,page,'product-picker-1280x820.png',1280,820);
  const compactGeometry=await dialog.evaluate(element=>{const dialogRect=element.getBoundingClientRect(),footerRect=element.querySelector('footer')?.getBoundingClientRect();return {dialog:{top:dialogRect.top,bottom:dialogRect.bottom},footer:footerRect?{top:footerRect.top,bottom:footerRect.bottom}:null,viewportHeight:innerHeight};});
  assert.ok(compactGeometry.footer&&compactGeometry.dialog.top>=0&&compactGeometry.dialog.bottom<=compactGeometry.viewportHeight+1&&compactGeometry.footer.top>=compactGeometry.dialog.top&&compactGeometry.footer.bottom<=compactGeometry.dialog.bottom+1,`the compact dialog must keep its action footer visible: ${JSON.stringify(compactGeometry)}`);
  await captureProductPickerVisual(application,page,'product-picker-820x640.png',820,640);
  await dialog.getByRole('button',{name:'加入草稿',exact:true}).click();
  await dialog.waitFor({state:'detached'});

  const chinese=frame.getByLabel('中文输入');
  const draft=await chinese.inputValue();assert.doesNotMatch(draft,/底价/);
  assert.match(draft,/沙漠礼盒（虚构）/);
  assert.match(draft,/AED 199\.00/,'website sale price should be inserted into the editable draft');
  assert.match(draft,/AED 260\.00/,'suggested pricing should be inserted into the editable draft');
  assert.match(draft,/库存.*12/,'stock should be inserted into the editable draft');
  await chinese.fill(`${draft}\n人工可编辑补充：请核对颜色。`);
  assert.match(await chinese.inputValue(),/人工可编辑补充：请核对颜色。/,'the product text remains an ordinary editable composer draft');
  const attachment=frame.locator('.cwb-attachment-chip');
  assert.equal(await attachment.count(),1,'a selected cached product image should become an ordinary pending attachment');
  assert.equal(await attachment.locator('img').getAttribute('src'),cachedImage);
  assert.equal(await application.evaluate(()=>globalThis.__productPickerSends.length),0,'adding a product must stop before the user explicitly clicks send');
  const requests=await application.evaluate(()=>globalThis.__productCatalogRequests);
  assert.ok(requests.every(request=>request.token==='product-picker-binding'),'each local catalog request must carry the current verified chat token');
  assert.ok(requests.some(request=>String(request.query||'').includes('礼盒')),'the local catalog search query should be delivered to the local endpoint');
  assert.deepEqual(errors,[]);
  if(visualArtifactDirectory)await writeFile(path.join(visualArtifactDirectory,'result.json'),JSON.stringify({passed:true,version:packageVersion,windows:await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().length),floorInDraft:/底价/.test(draft),suggestedInDraft:/AED 260\.00/.test(draft),sends:await application.evaluate(()=>globalThis.__productPickerSends.length),requests:requests.length,errors},null,2));
 }catch(error){if(visualArtifactDirectory){await mkdir(visualArtifactDirectory,{recursive:true});await page?.screenshot({path:path.join(visualArtifactDirectory,'failure.png')}).catch(()=>{});await writeFile(path.join(visualArtifactDirectory,'failure.json'),JSON.stringify({error:error.stack,body:await page?.locator('body').innerText().catch(()=>''),errors},null,2));}throw error;
 }finally{await browser?.close();await closeApplication(application,directory);}
});
