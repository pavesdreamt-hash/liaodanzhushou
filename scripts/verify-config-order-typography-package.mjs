import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {_electron as electron} from 'playwright-core';

const version=JSON.parse(await readFile('package.json','utf8')).version;
const appPath=path.resolve(process.env.CONFIG_ORDER_TYPOGRAPHY_APP_PATH||path.join('dist','聊单助手.app'));
const executableName=path.basename(appPath,'.app');
const output=path.resolve(`artifacts/config-order-typography-${version}`);
const report={ok:false,version,appPath,directAppArtifact:true,fictionalIsolation:true,realKeychainAccess:false,realShopPlusCalls:0,realMessagesSent:0,checks:[],errors:[]};

await mkdir(output,{recursive:true});
const temporary=await mkdtemp(path.join(os.tmpdir(),'liaodan-config-typography-')),data=path.join(temporary,'data');let application;
try{
  application=await electron.launch({executablePath:path.join(appPath,'Contents','MacOS',executableName),args:[`--isolated-user-data=${data}`,`--orders-test-user-data=${data}`],cwd:path.dirname(appPath),env:{...process.env,NODE_ENV:'test'}});
  const page=await application.firstWindow({timeout:60000});page.setDefaultTimeout(30000);const errors=[];page.on('pageerror',error=>errors.push(error.stack||error.message));
  const identity=await application.evaluate(({app})=>({packaged:app.isPackaged,version:app.getVersion(),arch:process.arch,path:app.getAppPath()}));assert.equal(identity.packaged,true);assert.equal(identity.version,version);assert.equal(identity.arch,'x64');assert.equal(identity.path.startsWith(appPath),true);report.identity=identity;report.checks.push('fixed-final-mac-x64-app-launches-directly');
  const frame=page.frameLocator('iframe.confirmed-frame');
  await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(window=>window.isVisible())?.setContentSize(1280,820));
  await frame.getByRole('button',{name:'连接与设置',exact:true}).click();const settings=frame.locator('#ui036');await settings.waitFor();
  assert.equal(await settings.locator('[data-panel]').count(),4);assert.deepEqual(await settings.evaluate(root=>{const size=selector=>getComputedStyle(root.querySelector(selector)).fontSize;return {description:size('.desc'),status:size('.status'),fieldLabel:size('.field label'),note:size('.note'),button:size('.button'),metaLabel:size('.meta span'),metaValue:size('.meta b')}}),{description:'13px',status:'13px',fieldLabel:'13px',note:'14px',button:'13px',metaLabel:'13px',metaValue:'15px'});
  assert.equal(await settings.locator('.panel-grid').first().evaluate(element=>getComputedStyle(element).gridTemplateColumns.split(' ').length),2);await page.screenshot({path:path.join(output,'settings-connections-1280x820.png')});
  for(const [name,panel,check] of [
    ['业务与同步','business',root=>{const size=selector=>getComputedStyle(root.querySelector(selector)).fontSize;return {label:size('.currency span'),value:size('.currency strong'),note:size('.note')}}],
    ['通知','notifications',root=>{const size=selector=>getComputedStyle(root.querySelector(selector)).fontSize;return {label:size('.setting span'),value:size('.setting b')}}],
    ['数据与存储','data',root=>{const size=selector=>getComputedStyle(root.querySelector(selector)).fontSize;return {label:size('.retain span'),value:size('.retain strong'),button:size('.button')}}]
  ]){await frame.getByRole('button',{name,exact:true}).click();const target=settings.locator(`[data-panel="${panel}"]`);await target.waitFor();const fonts=await target.evaluate(check);if(panel==='business')assert.deepEqual(fonts,{label:'13px',value:'15px',note:'14px'});if(panel==='notifications')assert.deepEqual(fonts,{label:'13px',value:'14px'});if(panel==='data')assert.deepEqual(fonts,{label:'13px',value:'15px',button:'13px'});}
  report.checks.push('all-four-settings-tabs-keep-their-existing-structure-and-use-readable-body-fonts');
  await frame.getByRole('button',{name:'助手配置',exact:true}).click();const assistant=frame.locator('#ui041');await assistant.waitFor();
  assert.equal(await assistant.locator('[data-panel]').count(),3);assert.deepEqual(await assistant.evaluate(root=>{const size=selector=>getComputedStyle(root.querySelector(selector)).fontSize;return {description:size('.desc'),modeDescription:size('.mode p'),modeName:size('.mode b'),scopeItem:size('.list li'),ruleDescription:size('.rule span'),ruleName:size('.rule b')}}),{description:'13px',modeDescription:'13px',modeName:'14px',scopeItem:'13px',ruleDescription:'13px',ruleName:'14px'});
  assert.equal(await assistant.locator('.grid').first().evaluate(element=>getComputedStyle(element).gridTemplateColumns.split(' ').length),2);await page.screenshot({path:path.join(output,'assistant-abilities-1280x820.png')});
  await frame.getByRole('button',{name:'暂停规则',exact:true}).click();const pause=assistant.locator('[data-panel="pause"]');await pause.waitFor();assert.deepEqual(await pause.evaluate(root=>{const size=selector=>getComputedStyle(root.querySelector(selector)).fontSize;return {number:size('.pause-num'),description:size('.pause span:not(.pause-num)'),name:size('.pause b'),stepDescription:size('.step span'),stepName:size('.step b')}}),{number:'12px',description:'13px',name:'14px',stepDescription:'13px',stepName:'14px'});
  await frame.getByRole('button',{name:'资料与记录',exact:true}).click();const safety=assistant.locator('[data-panel="safety"]');await safety.waitFor();assert.deepEqual(await safety.evaluate(root=>{const size=selector=>getComputedStyle(root.querySelector(selector)).fontSize;return {ruleDescription:size('.rule span'),fixed:size('.fixed'),logLabel:size('.log span'),logValue:size('.log b'),notice:size('.notice'),button:size('.btn')}}),{ruleDescription:'13px',fixed:'13px',logLabel:'13px',logValue:'15px',notice:'14px',button:'13px'});report.checks.push('all-three-assistant-tabs-keep-their-existing-structure-and-use-readable-body-fonts');
  await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(window=>window.isVisible())?.setContentSize(820,640));await page.waitForTimeout(200);await frame.getByRole('button',{name:'连接与设置',exact:true}).click();await settings.waitFor();let widths=await settings.evaluate(element=>({clientWidth:element.clientWidth,scrollWidth:element.scrollWidth}));assert.ok(widths.scrollWidth<=widths.clientWidth,JSON.stringify(widths));await frame.getByRole('button',{name:'助手配置',exact:true}).click();await assistant.waitFor();widths=await assistant.evaluate(element=>({clientWidth:element.clientWidth,scrollWidth:element.scrollWidth}));assert.ok(widths.scrollWidth<=widths.clientWidth,JSON.stringify(widths));await page.screenshot({path:path.join(output,'assistant-safety-820x640.png')});report.checks.push('settings-and-assistant-820x640-no-horizontal-breakage');
  assert.deepEqual(errors,[]);report.ok=true;report.errors=errors;
}catch(error){report.errors.push(String(error?.stack||error));throw error;
}finally{
  if(application){const process=application.process();await application.close().catch(()=>{});try{if(process.exitCode===null)process.kill('SIGKILL');}catch{}}
  await writeFile(path.join(output,'app-verification.json'),JSON.stringify(report,null,2));
  await rm(temporary,{recursive:true,force:true,maxRetries:3,retryDelay:150}).catch(()=>{});
}

console.log(JSON.stringify(report));
