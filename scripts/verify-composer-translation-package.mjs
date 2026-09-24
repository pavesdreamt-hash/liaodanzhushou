import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {_electron as electron} from 'playwright-core';

const version=JSON.parse(await readFile('package.json','utf8')).version;
const appPath=path.resolve(process.env.COMPOSER_TRANSLATION_APP_PATH||path.join('dist',`聊单助手${version}-x64`,'mac',`聊单助手 ${version}.app`));
const output=path.resolve(`artifacts/composer-translation-${version}`);
const waitFor=async(check,{timeout=30000,interval=150}={})=>{
 const until=Date.now()+timeout;let last;
 while(Date.now()<until){try{last=await check();if(last)return last;}catch{}await new Promise(resolve=>setTimeout(resolve,interval));}
 throw new Error(`Timed out waiting for packaged composer translation state${last?`: ${JSON.stringify(last)}`:''}`);
};

await mkdir(output,{recursive:true});
const temporary=await mkdtemp(path.join(os.tmpdir(),'liaodan-composer-translation-app-'));
const data=path.join(temporary,'data');
const liveFixture=path.join(temporary,'fictional-live.json');
const settingsFixture=path.join(temporary,'fictional-settings.json');
await writeFile(liveFixture,JSON.stringify({fictional:true,chatName:'Fictional Translation Customer',allowManualSend:false,accountPhone:'971500000201',targetPhone:'971500000202',messages:[{id:'false_971500000202@c.us_fixture_1',direction:'customer',text:'Can you confirm the fictional address?',sentAt:'2026-09-24T00:00:00.000Z'}]}));
await writeFile(settingsFixture,JSON.stringify({key:'fictional-composer-translation-key',translationText:'Please confirm the fictional address.',translationChinese:'请确认虚构地址。'}));

let application;
try{
 application=await electron.launch({
  executablePath:path.join(appPath,'Contents','MacOS',`聊单助手 ${version}`),
  args:[`--isolated-user-data=${data}`,`--orders-test-user-data=${data}`,'--orders-test-browser-workspace','--orders-test-wwebjs',`--orders-test-live-fixture=${liveFixture}`,`--orders-test-settings=${settingsFixture}`],
  cwd:path.dirname(appPath),
  env:{...process.env,NODE_ENV:'production'}
 });
 const page=await application.firstWindow({timeout:60000});
 page.setDefaultTimeout(30000);
 const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.waitForURL(/http:\/\/127\.0\.0\.1:/,{waitUntil:'load'});
 const frame=page.frameLocator('iframe.confirmed-frame');
 await frame.locator('.cwb-shell').waitFor();
 const identity=await application.evaluate(({app})=>({packaged:app.isPackaged,version:app.getVersion(),path:app.getAppPath(),arch:process.arch}));
 assert.equal(identity.packaged,true);
 assert.equal(identity.version,version);
 assert.equal(identity.arch,'x64');
 assert.equal(identity.path.startsWith(appPath),true);
 assert.match(await frame.locator('.cwb-top-version').textContent()||'',new RegExp(version.replaceAll('.','\\.')));

 const bridge=frame.locator('.cwb-shell');
 const manualChatRequest=(action,payload)=>bridge.evaluate(async(_element,request)=>{
  const api=window.manualChat||window.parent?.manualChat;
  return api?.request(request)||{ok:false,error:'聊天桥接未就绪'};
 },{action,payload});
 const translationRequest=(action,payload)=>bridge.evaluate(async(_element,request)=>{
  const api=window.manualReplyTranslation||window.parent?.manualReplyTranslation;
  return api?.request(request)||{ok:false,error:'翻译桥接未就绪'};
 },{action,payload});
 const connect=await manualChatRequest('connect');
 assert.equal(connect.ok,true,JSON.stringify(connect));
 await waitFor(async()=>{const state=await manualChatRequest('status');return state.ok&&state.data?.status==='online';});
 await frame.getByText('WhatsApp 已连接',{exact:true}).waitFor({timeout:12000});
 await frame.locator('.cwb-refresh').click();
 await frame.locator('.cwb-conversation').click();
 await frame.locator('.cwb-message-text').getByText('Can you confirm the fictional address?',{exact:true}).waitFor();

 const initialSettings=await translationRequest('settings');
 assert.equal(initialSettings.ok,true,JSON.stringify(initialSettings));
 const savedKey=await translationRequest('key',{provider:initialSettings.data.activeProvider,revision:initialSettings.data.revision});
 assert.equal(savedKey.ok,true,JSON.stringify(savedKey));
 assert.equal(savedKey.data.canceled,false);
 const convert=frame.locator('.cwb-convert');
 const chinese=frame.getByLabel('中文输入');
 assert.equal(await convert.count(),1);
 assert.equal(await convert.isDisabled(),true);
 const replyLedger=async()=>{
  const settings=await translationRequest('settings');
  assert.equal(settings.ok,true,JSON.stringify(settings));
  return settings.data.ledger.filter(entry=>entry.purpose==='translate-intent');
 };

 await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(window=>window.isVisible())?.setContentSize(1280,820));
 await chinese.fill('请确认虚构地址。');
 assert.equal((await replyLedger()).length,0,'输入本身不得发起翻译');
 assert.equal(await convert.isDisabled(),false);
 await convert.click();
 const english=frame.getByLabel('英文翻译');
 await waitFor(async()=>await english.inputValue()==='Please confirm the fictional address.');
 assert.deepEqual((await replyLedger()).map(entry=>({purpose:entry.purpose,status:entry.status,simulation:entry.simulation})),[{purpose:'translate-intent',status:'responded',simulation:true}]);
 await page.screenshot({path:path.join(output,'composer-translation-1280x820.png')});

 await frame.locator('[data-editor="zh"]').click();
 await frame.locator('.cwb-quick').click();
 await frame.getByRole('button',{name:'确认订单',exact:true}).click();
 assert.equal(await chinese.inputValue(),'感谢你的支持，请确认以上订单信息是否正确。');
 assert.equal((await replyLedger()).length,1,'快捷回复填入时不得自动翻译');
 await convert.click();
 await waitFor(async()=>await english.inputValue()==='Please confirm the fictional address.');
 assert.equal((await replyLedger()).length,2,'快捷回复必须经同一明确转换动作');
 assert.equal(await frame.locator('.cwb-send').isDisabled(),false,'英文草稿仍需通过既有人工发送确认入口');

 await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(window=>window.isVisible())?.setContentSize(820,640));
 await page.waitForTimeout(250);
 assert.equal(await convert.isVisible(),true,'窄窗口中转换操作仍可见');
 await page.screenshot({path:path.join(output,'composer-translation-820x640.png')});
 const fixtureAfter=JSON.parse(await readFile(liveFixture,'utf8'));
 assert.equal(fixtureAfter.messages.length,1,'验收不得向虚构 WhatsApp 发送消息');
 assert.deepEqual(errors,[]);
 const report={
  ok:true,
  version,
  appPath,
  identity,
  directAppArtifact:true,
  fictionalClient:true,
  realMessagesSent:0,
  realAiCalls:0,
  checks:[
   'final Mac x64 app launched directly',
   'packaged app version and x64 identity',
   'visible single manual convert button is disabled for empty Chinese input',
   'fictional Chinese input triggers one simulated manual translation only after explicit click',
   'editable English draft is shown after translation',
   'quick reply only fills Chinese until the same explicit convert action',
   'existing manual send confirmation entry remains available without sending',
   '820x640 and 1280x820 packaged screenshots',
   'no real WhatsApp message or real AI call'
  ],
  errors
 };
 await writeFile(path.join(output,'app-verification.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify(report));
}finally{
 try{application?.process().kill('SIGKILL');}catch{}
 await application?.close().catch(()=>{});
 await rm(temporary,{recursive:true,force:true,maxRetries:3,retryDelay:150}).catch(()=>{});
}
