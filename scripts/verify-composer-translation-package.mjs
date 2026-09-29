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
await writeFile(settingsFixture,JSON.stringify({key:'fictional-composer-translation-key',translationText:'Please confirm the fictional address.',translationChinese:'请确认虚构地址。',backTranslationChinese:'请确认虚构地址（回译核对）。'}));

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
 const chineseTab=frame.getByRole('button',{name:'中文输入',exact:true});
 const englishTab=frame.getByRole('button',{name:'英文翻译',exact:true});
 const backTranslate=frame.locator('.cwb-back-translate');
 const chinese=frame.getByLabel('中文输入');
 assert.equal(await frame.locator('.cwb-composer-tabs > button[data-editor]').count(),2,'仅保留中文输入和英文翻译两个文字入口');
 assert.equal(await frame.getByRole('button',{name:'转为英文',exact:true}).count(),0,'不得保留第三个“转为英文”动作');
 assert.equal(await backTranslate.isHidden(),true,'没有英文草稿时不显示回译中文核对');
 const forwardLedger=async()=>{
  const settings=await translationRequest('settings');
  assert.equal(settings.ok,true,JSON.stringify(settings));
  return settings.data.ledger.filter(entry=>entry.purpose==='translate-intent');
 };
 const backLedger=async()=>{
  const settings=await translationRequest('settings');
  assert.equal(settings.ok,true,JSON.stringify(settings));
  return settings.data.ledger.filter(entry=>entry.purpose==='translate-draft');
 };

 await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(window=>window.isVisible())?.setContentSize(1280,820));
 await chinese.fill('请确认虚构地址。');
 assert.equal((await forwardLedger()).length,0,'输入本身不得发起翻译');
 await englishTab.click();
 const english=frame.getByLabel('英文翻译');
 await waitFor(async()=>await english.inputValue()==='Please confirm the fictional address.');
 assert.deepEqual((await forwardLedger()).map(entry=>({purpose:entry.purpose,status:entry.status,simulation:entry.simulation})),[{purpose:'translate-intent',status:'responded',simulation:true}]);
 await english.fill('Please carefully confirm the fictional address.');
 assert.equal(await english.inputValue(),'Please carefully confirm the fictional address.','英文翻译结果必须可在原输入框直接编辑');
 assert.equal((await forwardLedger()).length,1,'编辑英文不得触发额外正向翻译');
 await backTranslate.waitFor({state:'visible'});
 await backTranslate.click();
 const backPopover=frame.locator('.cwb-back-translation-popover');
 await backPopover.waitFor({state:'visible'});
 assert.match(await backPopover.textContent()||'',/原中文/);
 assert.match(await backPopover.textContent()||'',/请确认虚构地址。/);
 assert.match(await backPopover.textContent()||'',/请确认虚构地址（回译核对）。/);
 assert.equal(await english.inputValue(),'Please carefully confirm the fictional address.','回译核对不得改写英文草稿');
 assert.deepEqual((await backLedger()).map(entry=>({purpose:entry.purpose,status:entry.status,simulation:entry.simulation})),[{purpose:'translate-draft',status:'responded',simulation:true}]);
 await backTranslate.click();
 assert.equal(await backPopover.isHidden(),true);
 await backTranslate.click();
 await backPopover.waitFor({state:'visible'});
 assert.equal((await backLedger()).length,1,'相同英文再次查看应使用本地缓存，不重复请求');
 await page.screenshot({path:path.join(output,'composer-translation-1280x820.png')});

 await chineseTab.click();
 await frame.locator('.cwb-quick').click();
 await frame.getByRole('button',{name:'确认订单',exact:true}).click();
 assert.equal(await chinese.inputValue(),'感谢你的支持，请确认以上订单信息是否正确。');
 assert.equal((await forwardLedger()).length,1,'快捷回复填入时不得自动翻译');
 await englishTab.click();
 await waitFor(async()=>await english.inputValue()==='Please confirm the fictional address.');
 assert.equal((await forwardLedger()).length,2,'快捷回复必须经同一英文翻译入口');
 assert.equal(await frame.locator('.cwb-send').isDisabled(),false,'英文草稿仍需通过既有人工发送确认入口');

 await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(window=>window.isVisible())?.setContentSize(820,640));
 await page.waitForTimeout(250);
 assert.equal(await englishTab.isVisible(),true,'窄窗口中英文翻译入口仍可见');
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
   'two textual composer tabs remain: 中文输入 and 英文翻译; no third conversion button',
   'fictional Chinese input triggers one simulated manual translation only after explicit 英文翻译 click',
   'translated English is directly editable in the same fixed composer editor',
   'icon-only English-to-Chinese back check preserves both drafts and reuses its local cache',
   'quick reply only fills Chinese until the same explicit 英文翻译 action',
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
