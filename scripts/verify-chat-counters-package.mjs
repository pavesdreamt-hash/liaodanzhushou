import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {_electron as electron} from 'playwright-core';

const version=JSON.parse(await readFile('package.json','utf8')).version;
const appPath=path.resolve(process.env.CHAT_COUNTERS_APP_PATH||path.join('dist','聊单助手.app'));
const executableName=path.basename(appPath,'.app');
const output=path.resolve(`artifacts/chat-counters-${version}`);
const report={ok:false,version,appPath,directAppArtifact:true,fictionalIsolation:true,realWhatsAppReads:0,realMessagesSent:0,checks:[],errors:[]};

await mkdir(output,{recursive:true});
const temporary=await mkdtemp(path.join(os.tmpdir(),'liaodan-chat-counters-app-')),data=path.join(temporary,'data');let application;
try{
 application=await electron.launch({executablePath:path.join(appPath,'Contents','MacOS',executableName),args:[`--isolated-user-data=${data}`,`--orders-test-user-data=${data}`],cwd:path.dirname(appPath),env:{...process.env,NODE_ENV:'test'}});
 const page=await application.firstWindow({timeout:60000});page.setDefaultTimeout(30000);const errors=[];page.on('pageerror',error=>errors.push(error.stack||error.message));
 const identity=await application.evaluate(({app})=>({packaged:app.isPackaged,version:app.getVersion(),arch:process.arch,path:app.getAppPath()}));assert.equal(identity.packaged,true);assert.equal(identity.version,version);assert.equal(identity.arch,'x64');assert.equal(identity.path.startsWith(appPath),true);report.identity=identity;report.checks.push('fixed-final-mac-x64-app-launches-directly');
 await application.evaluate(({ipcMain})=>{
  globalThis.__chatCounterRows=[
   {phone:'971500000001',chatId:'counter-customer-unread',name:'',updatedAt:'2026-09-25T08:00:00.000Z',preview:'Fictional customer unread',direction:'customer',lastValidDirection:'customer',unreadCount:3},
   {phone:'971500000002',chatId:'counter-merchant-unread',name:'',updatedAt:'2026-09-25T08:01:00.000Z',preview:'Fictional merchant unread',direction:'merchant',lastValidDirection:'merchant',unreadCount:2},
   {phone:'971500000003',chatId:'counter-customer-read',name:'',updatedAt:'2026-09-25T08:02:00.000Z',preview:'Fictional customer read',direction:'customer',lastValidDirection:'customer',unreadCount:0},
   {phone:'971500000004',chatId:'counter-system',name:'',updatedAt:'2026-09-25T08:03:00.000Z',preview:'WhatsApp 系统通知。',direction:'customer',lastValidDirection:null,unreadCount:0}
  ];
  ipcMain.removeHandler('manual-chat');ipcMain.handle('manual-chat',async(_event,{action})=>({ok:true,data:action==='status'?{status:'online'}:action==='inbox'?{items:globalThis.__chatCounterRows,total:globalThis.__chatCounterRows.length,offset:0,hasMore:false}:null}));
  ipcMain.removeHandler('manual-reply-translation');ipcMain.handle('manual-reply-translation',async()=>({ok:true,data:{translations:[]}}));
 });
 const frame=page.frameLocator('iframe.confirmed-frame');await frame.locator('.cwb-refresh').click();
 assert.equal(await frame.locator('#cwb-count').count(),0,'客户聊天标题不得再显示统计数');
 const metrics={all:3,unread:5,unreplied:2};
 for(const [filter,value] of Object.entries(metrics)){const badge=frame.locator(`[data-filter="${filter}"] b`);await badge.getByText(String(value),{exact:true}).waitFor();const color=await badge.evaluate(element=>getComputedStyle(element).backgroundColor);assert.equal(color,filter==='all'?'rgb(109, 76, 200)':'rgb(229, 72, 77)');}
 assert.equal(await frame.locator('.cwb-conversation').count(),4);
 assert.equal(await frame.locator('.cwb-conversation').nth(0).locator('.cwb-conversation-unread').textContent(),'3');assert.equal(await frame.locator('.cwb-conversation').nth(1).locator('.cwb-conversation-unread').textContent(),'2');assert.equal(await frame.locator('.cwb-conversation').nth(2).locator('.cwb-conversation-unread').count(),0);assert.equal(await frame.locator('.cwb-conversation').nth(3).getByText('待核对',{exact:true}).count(),1);
 await frame.locator('[data-filter="unread"]').click();assert.equal(await frame.locator('.cwb-conversation').count(),2);await frame.locator('[data-filter="unreplied"]').click();assert.equal(await frame.locator('.cwb-conversation').count(),2);await frame.locator('[data-filter="all"]').click();assert.equal(await frame.locator('.cwb-conversation').count(),4);
 await application.evaluate(()=>{globalThis.__chatCounterRows=[{phone:'971500000001',chatId:'counter-customer-unread',name:'',updatedAt:'2026-09-25T08:05:00.000Z',preview:'Read in another fictional client',direction:'customer',lastValidDirection:'customer',unreadCount:0}];});
 await page.waitForTimeout(10_300);assert.equal(await frame.locator('.cwb-conversation').count(),1);assert.equal(await frame.locator('.cwb-conversation').locator('.cwb-conversation-unread').count(),0,'在线未重连时也必须丢弃过期未读红圈');assert.equal(await frame.locator('[data-filter="unread"] b').isHidden(),true);assert.equal(await frame.locator('[data-filter="all"] b').textContent(),'1');assert.equal(await frame.locator('[data-filter="unreplied"] b').textContent(),'1');report.checks.push('online-inbox-poll-replaces-stale-native-unread-count-without-a-reconnect');
 await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(window=>window.isVisible())?.setContentSize(1280,820));await page.waitForTimeout(200);await page.screenshot({path:path.join(output,'chat-counters-1280x820.png')});report.checks.push('all-badge-deduplicates-unread-and-unreplied-conversations; unread-badge-sums-native-WhatsApp-counts; unreplied-uses-last-valid-message');
 await application.evaluate(()=>{globalThis.__chatCounterRows=[{phone:'971500000005',chatId:'counter-empty',name:'',updatedAt:'2026-09-25T08:04:00.000Z',preview:'Handled fictional chat',direction:'merchant',lastValidDirection:'merchant',unreadCount:0}];});await frame.locator('.cwb-refresh').click();for(const filter of Object.keys(metrics))assert.equal(await frame.locator(`[data-filter="${filter}"] b`).isHidden(),true,`${filter} 为零时必须隐藏徽标`);report.checks.push('zero-value-filter-badges-are-hidden');
 await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(window=>window.isVisible())?.setContentSize(820,640));await page.waitForTimeout(200);for(const filter of Object.keys(metrics))assert.equal(await frame.locator(`[data-filter="${filter}"]`).isVisible(),true,`${filter} 在 820x640 必须可见`);await page.screenshot({path:path.join(output,'chat-counters-820x640.png')});report.checks.push('1280x820-and-820x640-packaged-layouts-checked');
 assert.deepEqual(errors,[]);report.ok=true;report.errors=errors;
}catch(error){report.errors.push(String(error?.stack||error));throw error;
}finally{
 if(application){const process=application.process();await application.close().catch(()=>{});try{if(process.exitCode===null)process.kill('SIGKILL');}catch{}}
 await writeFile(path.join(output,'app-verification.json'),JSON.stringify(report,null,2));await rm(temporary,{recursive:true,force:true,maxRetries:3,retryDelay:150}).catch(()=>{});
}
console.log(JSON.stringify(report));
