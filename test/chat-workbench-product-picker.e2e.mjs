import test from 'node:test';
import assert from 'node:assert/strict';
import {_electron as electron} from 'playwright-core';
import electronPath from 'electron';
import {mkdtemp,mkdir,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const cachedImage=`data:image/png;base64,${(await readFile(path.resolve('assets','app-icon-1024.png'))).toString('base64')}`;
const packageVersion=JSON.parse(await readFile(path.resolve('package.json'),'utf8')).version;
const sleep=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));
const launchArguments=directory=>process.env.KDOCS_TEST_EXECUTABLE?[`--isolated-user-data=${directory}`,`--orders-test-user-data=${directory}`]:['.',`--isolated-user-data=${directory}`,`--orders-test-user-data=${directory}`];
const visualArtifactDirectory=process.env.KDOCS_VISUAL_ARTIFACT_DIR?path.resolve(process.env.KDOCS_VISUAL_ARTIFACT_DIR):null;

async function captureProductPickerVisual(application,page,filename,width,height){
 if(!visualArtifactDirectory)return;
 await mkdir(visualArtifactDirectory,{recursive:true});
 await application.evaluate(({BrowserWindow},size)=>BrowserWindow.getAllWindows()[0]?.setContentSize(size.width,size.height),{width,height});
 await page.waitForTimeout(300);
 await page.screenshot({path:path.join(visualArtifactDirectory,filename),fullPage:false});
 console.log(JSON.stringify({visualArtifact:path.join(visualArtifactDirectory,filename),contentSize:{width,height}}));
}

async function closeApplication(application,directory){
 try{if(application)await Promise.race([application.close(),sleep(4000)]);}catch{}
 try{application?.process().kill('SIGKILL');}catch{}
 await rm(directory,{recursive:true,force:true,maxRetries:3,retryDelay:150}).catch(()=>{});
}

test('商品调取只从本机目录加入可编辑草稿和缓存图片，不会自动发送',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'workbench-product-picker-'));let application;
 try{
  application=await electron.launch({executablePath:process.env.KDOCS_TEST_EXECUTABLE||electronPath,args:launchArguments(directory),cwd:path.resolve('.'),env:{...process.env,NODE_ENV:'test'}});
  const page=await application.firstWindow();
  if(process.env.KDOCS_TEST_EXECUTABLE)assert.deepEqual(await application.evaluate(({app})=>({packaged:app.isPackaged,version:app.getVersion()})),{packaged:true,version:packageVersion});
  await application.evaluate(({ipcMain},image)=>{
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
  assert.ok(await application.evaluate(()=>globalThis.__productCatalogRequests.length)>0,'the picker must read the local catalog through its narrow IPC endpoint');

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
  await captureProductPickerVisual(application,page,'product-picker-1280x820.png',1280,820);
  const compactGeometry=await dialog.evaluate(element=>{const dialogRect=element.getBoundingClientRect(),footerRect=element.querySelector('footer')?.getBoundingClientRect();return {dialog:{top:dialogRect.top,bottom:dialogRect.bottom},footer:footerRect?{top:footerRect.top,bottom:footerRect.bottom}:null,viewportHeight:innerHeight};});
  assert.ok(compactGeometry.footer&&compactGeometry.dialog.top>=0&&compactGeometry.dialog.bottom<=compactGeometry.viewportHeight+1&&compactGeometry.footer.top>=compactGeometry.dialog.top&&compactGeometry.footer.bottom<=compactGeometry.dialog.bottom+1,`the compact dialog must keep its action footer visible: ${JSON.stringify(compactGeometry)}`);
  await captureProductPickerVisual(application,page,'product-picker-1440x1000.png',1440,1000);
  await dialog.getByRole('button',{name:'加入草稿',exact:true}).click();
  await dialog.waitFor({state:'detached'});

  const chinese=frame.getByLabel('中文输入');
  const draft=await chinese.inputValue();
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
 }finally{await closeApplication(application,directory);}
});

test('已发送图片的本地缓存跨 PN/LID 刷新继续显示且不重新读 WhatsApp 媒体',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'workbench-send-cache-'));let application;
 try{
  application=await electron.launch({executablePath:process.env.KDOCS_TEST_EXECUTABLE||electronPath,args:launchArguments(directory),cwd:path.resolve('.'),env:{...process.env,NODE_ENV:'test'}});
  const page=await application.firstWindow();
  await application.evaluate(({ipcMain},image)=>{
   const initial=[{id:'fictional-inbound-before-image',direction:'customer',text:'Please send the fictional picture.',sentAt:'2026-09-30T08:20:00.000Z',metadata:{messageType:'chat',media:[]}}];
   globalThis.__sendCacheStage='before';
   globalThis.__productPickerSends=[];
   globalThis.__productPickerMediaCalls=[];
   ipcMain.removeHandler('manual-chat');
   ipcMain.handle('manual-chat',async(_event,{action,payload={}})=>{
    const initialRows=[{id:'fictional-inbound-before-image',direction:'customer',text:'Please send the fictional picture.',sentAt:'2026-09-30T08:20:00.000Z',metadata:{messageType:'chat',media:[]}}];
    const unavailable={id:'true_971500009101_fictional-outgoing-image',direction:'merchant',sender:'人工发送',text:'[图片]',sentAt:'2026-09-30T08:21:00.000Z',metadata:{messageType:'image',media:[{type:'image',status:'unavailable'}],deliveryAck:1}};
    if(action==='status')return {ok:true,data:{status:'online'}};
    if(action==='inbox')return {ok:true,data:{items:[{phone:'971500009101',chatId:'wa-phone:971500009101',name:'Fictional image recipient',updatedAt:'2026-09-30T08:20:00.000Z',preview:initialRows[0].text,direction:'customer',unreadCount:0}],total:1,offset:0,hasMore:false}};
    if(action==='openInbox')return {ok:true,data:{token:'send-cache-binding',accountId:'wa-phone:971500009100',chatId:'wa-phone:971500009101',phone:'971500009101',identityVerified:true,messages:initialRows,hasMore:false}};
    if(action==='recent')return {ok:true,data:{messages:globalThis.__sendCacheStage==='after'?[...initialRows,unavailable]:initialRows,hasMore:false}};
    if(action==='markSeen')return {ok:true,data:{seen:true}};
    if(action==='media'){globalThis.__productPickerMediaCalls.push(payload);return {ok:false,error:'must not reread the freshly cached outgoing image'};}
    if(action==='send'){
     globalThis.__productPickerSends.push(payload);
     globalThis.__sendCacheStage='after';
     return {ok:true,data:{status:'sent',messages:[{id:'true_111111111111111@lid_fictional-outgoing-image',direction:'merchant',sender:'人工发送',text:'[图片]',sentAt:'2026-09-30T08:21:00.000Z',metadata:{messageType:'image',media:[{type:'image',status:'cached',mimetype:'image/png',dataUrl:image}],deliveryAck:1}}]}};
    }
    return {ok:false,error:`unexpected manual-chat action: ${action}`};
   });
   ipcMain.removeHandler('manual-reply-translation');
   ipcMain.handle('manual-reply-translation',async()=>({ok:true,data:{translations:[]}}));
   ipcMain.removeHandler('orders:list');
   ipcMain.handle('orders:list',async()=>({ok:true,data:[]}));
  },cachedImage);

  const frame=page.frameLocator('iframe.confirmed-frame');
  await frame.locator('.cwb-refresh').click();
  await frame.locator('.cwb-conversation').click();
  await frame.locator('article[data-message-id="fictional-inbound-before-image"] .cwb-message-text').waitFor();
  await frame.locator('.cwb-attachment-input').setInputFiles(path.resolve('assets/app-icon-1024.png'));
  await frame.locator('.cwb-attachment-chip img').waitFor();
  await frame.getByRole('button',{name:'发送确认',exact:true}).click();
  const refreshedImage=frame.locator('article[data-message-id="true_971500009101_fictional-outgoing-image"] .cwb-message-image');
  await refreshedImage.waitFor({state:'visible'});
  assert.match(await refreshedImage.getAttribute('src'),/^data:image\/png;base64,/,'the later PN refresh must retain the outgoing image cached under its LID receipt id');
  await sleep(450);
  assert.equal(await application.evaluate(()=>globalThis.__productPickerSends.length),1,'the explicit click should be the only WhatsApp send');
  assert.equal(await application.evaluate(()=>globalThis.__productPickerMediaCalls.length),0,'a fresh cached outgoing image must not issue a media retry after PN/LID reconciliation');
  await captureProductPickerVisual(application,page,'outbound-image-cache-1280x820.png',1280,820);
 }finally{await closeApplication(application,directory);}
});
