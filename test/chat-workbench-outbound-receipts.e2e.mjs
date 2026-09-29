import test from 'node:test';
import assert from 'node:assert/strict';
import {_electron as electron} from 'playwright-core';
import electronPath from 'electron';
import {mkdtemp,rm,mkdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const sleep=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));
async function waitFor(check,message,attempts=30){for(let attempt=0;attempt<attempts;attempt++){if(await check())return;await sleep(100);}throw new Error(message);}

test('outgoing WhatsApp messages show only their verified delivery and read receipts',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'workbench-outbound-receipt-'));let application;
 try{
  const packagedExecutable=process.env.KDOCS_TEST_EXECUTABLE;
  const args=packagedExecutable?[`--isolated-user-data=${directory}`,`--orders-test-user-data=${directory}`]:['.',`--isolated-user-data=${directory}`,`--orders-test-user-data=${directory}`];
  application=await electron.launch({executablePath:packagedExecutable||electronPath,args,cwd:path.resolve('.'),env:{...process.env,NODE_ENV:'test'}});
  const page=await application.firstWindow();await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1280,820));
  await application.evaluate(({ipcMain})=>{
   globalThis.__outboundReceiptRows=[{phone:'971500000601',chatId:'outbound-receipts',name:'Fictional recipient',updatedAt:'2020-01-01T00:00:00.000Z',preview:'Fictional read receipt',direction:'merchant',lastValidDirection:'merchant',unreadCount:0}];
   globalThis.__outboundReceiptImage='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9R6RkAAAAASUVORK5CYII=';
   globalThis.__outboundReceiptMessages=[
    {id:'inbound-no-receipt',direction:'customer',text:'Fictional customer message',sentAt:'2020-01-01T00:00:00.000Z',metadata:{messageType:'chat',media:[]}},
    {id:'outbound-sent',direction:'merchant',sender:'人工发送',text:'Fictional sent message',sentAt:'2020-01-01T00:01:00.000Z',metadata:{messageType:'chat',media:[],deliveryAck:1}},
    {id:'outbound-delivered',direction:'merchant',sender:'人工发送',text:'Fictional delivered message',sentAt:'2020-01-01T00:02:00.000Z',metadata:{messageType:'chat',media:[],deliveryAck:2}},
    {id:'outbound-read',direction:'merchant',sender:'人工发送',text:'Fictional read message',sentAt:'2020-01-01T00:03:00.000Z',metadata:{messageType:'chat',media:[],deliveryAck:3}},
    {id:'outbound-image',direction:'merchant',sender:'人工发送',text:'[图片]',sentAt:'2020-01-01T00:04:00.000Z',metadata:{messageType:'image',media:[{type:'image',status:'cached',dataUrl:globalThis.__outboundReceiptImage}],deliveryAck:1}},
    {id:'outbound-unknown',direction:'merchant',sender:'人工发送',text:'Fictional unknown message',sentAt:'2020-01-01T00:05:00.000Z',metadata:{messageType:'chat',media:[]}}
   ];
   ipcMain.removeHandler('manual-chat');ipcMain.handle('manual-chat',async(_event,{action,payload={}})=>{
    if(action==='status')return {ok:true,data:{status:'online'}};
    if(action==='inbox')return {ok:true,data:{items:globalThis.__outboundReceiptRows,total:1,offset:0,hasMore:false}};
    if(action==='openInbox')return {ok:true,data:{token:'outbound-receipts-token',accountId:'wa-phone:971500000600',chatId:payload.chatId,phone:'971500000601',identityVerified:true,messages:globalThis.__outboundReceiptMessages,hasMore:false}};
    if(action==='recent')return {ok:true,data:{messages:globalThis.__outboundReceiptMessages.map(row=>row.id==='outbound-image'&&globalThis.__outboundReceiptImageFromRefresh?{...row,metadata:{...row.metadata,media:[]}}:row),hasMore:false}};
    if(action==='markSeen')return {ok:true,data:{seen:true}};
    return {ok:false,error:`unexpected manual-chat action: ${action}`};
   });
   ipcMain.removeHandler('manual-reply-translation');ipcMain.handle('manual-reply-translation',async()=>({ok:true,data:{translations:[]}}));
  });
  const frame=page.frameLocator('iframe.confirmed-frame');await frame.locator('.cwb-refresh').click();
  const conversation=frame.locator('.cwb-conversation[data-chat-id="outbound-receipts"]');await conversation.click();
  const receipt=(id,state)=>frame.locator(`article[data-message-id="${id}"] .cwb-message-delivery.is-${state}`);
  await waitFor(async()=>await receipt('outbound-sent','sent').count()===1,'sent receipt should render');
  assert.equal(await receipt('outbound-sent','sent').getAttribute('aria-label'),'已发送到 WhatsApp，等待送达回执');
  assert.equal(await receipt('outbound-delivered','delivered').getAttribute('aria-label'),'已送达');
  assert.equal(await receipt('outbound-read','read').getAttribute('aria-label'),'已读');
  assert.equal(await frame.locator('article[data-message-id="outbound-image"] .cwb-message-image').count(),1,'cached image should render before its receipt changes');
  assert.equal(await frame.locator('article[data-message-id="inbound-no-receipt"] .cwb-message-delivery').count(),0,'customer rows must not show an outbound receipt');
  assert.equal(await frame.locator('article[data-message-id="outbound-unknown"] .cwb-message-delivery').count(),0,'missing ACK must not be guessed as delivered or read');

  await application.evaluate(()=>{globalThis.__outboundReceiptMessages.find(row=>row.id==='outbound-sent').metadata.deliveryAck=3;globalThis.__outboundReceiptMessages.find(row=>row.id==='outbound-image').metadata.deliveryAck=3;globalThis.__outboundReceiptImageFromRefresh=true;});
  await waitFor(async()=>await receipt('outbound-sent','read').count()===1,'a refreshed verified ACK should update from sent to read',130);
  assert.equal(await receipt('outbound-image','read').count(),1,'a cached image message should receive the refreshed read ACK');
  assert.equal(await frame.locator('article[data-message-id="outbound-image"] .cwb-message-image').count(),1,'a refreshed ACK must not discard the existing cached image');
  if(process.env.KDOCS_RECEIPT_SCREENSHOT_DIR){await mkdir(process.env.KDOCS_RECEIPT_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.KDOCS_RECEIPT_SCREENSHOT_DIR,'outbound-receipts-1280x820.png')});}
  await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(820,640));await sleep(200);
  const narrowBox=await receipt('outbound-read','read').boundingBox();assert.ok(narrowBox&&narrowBox.width>0&&narrowBox.height>0,'820×640 should retain the visible read receipt');
  if(process.env.KDOCS_RECEIPT_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.KDOCS_RECEIPT_SCREENSHOT_DIR,'outbound-receipts-820x640.png')});
 }finally{try{application?.process().kill('SIGKILL');}catch{}await rm(directory,{recursive:true,force:true});}
});
