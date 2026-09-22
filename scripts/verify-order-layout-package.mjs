import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import {mkdir,mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {_electron as electron} from 'playwright-core';

const root=path.resolve('.'),pkg=JSON.parse(await readFile('package.json','utf8'));
const output=path.join(root,'artifacts',`order-layout-${pkg.version}`);
const extracted=path.join(output,'extracted'),zip=path.join(root,'dist',`聊单助手${pkg.version}-x64.zip`);
await mkdir(extracted,{recursive:true});await promisify(execFile)('/usr/bin/ditto',['-x','-k',zip,extracted]);
const appPath=path.join(extracted,`聊单助手${pkg.version}`,`聊单助手 ${pkg.version}.app`);
const temporary=await mkdtemp(path.join(os.tmpdir(),'order-layout-package-'));
let application;
try{
 console.log('Launching extracted app');
 application=await electron.launch({executablePath:path.join(appPath,'Contents','MacOS',`聊单助手 ${pkg.version}`),args:[`--isolated-user-data=${path.join(temporary,'data')}`],env:{...process.env,NODE_ENV:'production'}});
 console.log('Automation connected');
 const page=await application.firstWindow({timeout:60000}),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.waitForURL(/http:\/\/127\.0\.0\.1:/,{waitUntil:'load'});
 await page.frameLocator('iframe').locator('button').first().waitFor();
 const url=new URL(page.url());url.searchParams.set('page','order');await page.goto(url.href);
 const frame=page.frameLocator('iframe');await frame.locator('[data-layout-ready="true"]').waitFor();
 await frame.locator('.ol-merged-titlebar').waitFor();
 const chrome=await application.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];return {buttons:w.getWindowButtonPosition(),bounds:w.getBounds(),content:w.getContentBounds()};});
 assert.deepEqual(chrome.buttons,{x:22,y:21});assert.equal(chrome.bounds.height,chrome.content.height);
 assert.equal(await page.locator('.desktop-titlebar').count(),0);assert.equal(await page.locator('.order-window-drag').evaluate(el=>getComputedStyle(el).getPropertyValue('-webkit-app-region')),'drag');
 const identity=await application.evaluate(({app})=>({packaged:app.isPackaged,version:app.getVersion(),path:app.getAppPath()}));assert(identity.packaged);assert.equal(identity.version,pkg.version);assert(identity.path.startsWith(appPath));
 assert.equal(await frame.locator('.od-version').textContent(),pkg.version);
 const displays=await application.evaluate(({screen})=>screen.getAllDisplays().map(d=>({id:String(d.id),label:d.label,internal:d.internal,scaleFactor:d.scaleFactor,bounds:d.bounds,workArea:d.workArea})));
 const move=async display=>{
  await application.evaluate(({BrowserWindow},area)=>{const w=BrowserWindow.getAllWindows()[0];w.unmaximize();w.setBounds({x:area.x+30,y:area.y+30,width:Math.min(1100,area.width-60),height:Math.min(800,area.height-60)});},display.workArea);
  await page.waitForTimeout(250);await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].maximize());
  await page.waitForFunction(async id=>(await window.orderLayoutDesktop.getDisplay())?.id===id,display.id);
  await frame.locator('.ol-display').filter({hasText:display.label||`显示器 ${display.id}`}).waitFor({state:'attached'});await page.waitForTimeout(250);
 };
 const font=()=>frame.locator('.od-bubble').first().evaluate(el=>getComputedStyle(el).fontSize);
 const setFont=async value=>{await frame.getByRole('button',{name:'布局设置',exact:true}).click();await frame.locator('[data-setting="chatFont"]').fill(String(value));await frame.locator('[data-setting="chatFont"]').press('Tab');await frame.getByRole('button',{name:'完成',exact:true}).click();};
 const reset=async()=>{await frame.getByRole('button',{name:'布局设置',exact:true}).click();await frame.getByRole('button',{name:'恢复本屏幕默认'}).click();await frame.getByRole('button',{name:'完成',exact:true}).click();};
 const screens=[];
 for(const display of displays){
  await move(display);assert.equal(await font(),'13px');
  const metrics=await frame.locator('.od-phone').evaluate(el=>{const r=el.getBoundingClientRect();return {viewport:{width:innerWidth,height:innerHeight},phone:{width:r.width,height:r.height,bottom:r.bottom},navFont:getComputedStyle(document.querySelector('.od-nav-item')).fontSize,overflow:document.documentElement.scrollWidth>innerWidth,documentScroll:document.documentElement.scrollHeight>innerHeight,sidebarBottom:document.querySelector('.od-sidebar').getBoundingClientRect().bottom,appBottom:document.querySelector('.od-app').getBoundingClientRect().bottom};});
  assert.equal(metrics.navFont,'15px');assert(!metrics.overflow);assert(Math.abs(metrics.phone.height/metrics.phone.width-2.1)<.005);
  assert(!metrics.documentScroll);assert(Math.abs(metrics.sidebarBottom-metrics.appBottom)<2);
  const screenshot=path.join(output,`packaged-display-${display.id}.png`);await page.screenshot({path:screenshot});screens.push({display,metrics,screenshot});
 }
 if(displays.length>1){
  await move(displays[0]);await setFont(17);await move(displays[1]);assert.equal(await font(),'13px');await setFont(15);
  await move(displays[0]);assert.equal(await font(),'17px');await page.reload();await frame.locator('[data-layout-ready="true"]').waitFor();assert.equal(await font(),'17px');await reset();
  await move(displays[1]);assert.equal(await font(),'15px');await reset();
 }
 await frame.getByRole('button',{name:'布局设置',exact:true}).click();await page.screenshot({path:path.join(output,'packaged-layout-settings.png')});await frame.getByRole('button',{name:'完成',exact:true}).click();
 await frame.locator('.ol-reply-divider').focus();await page.keyboard.press('ArrowUp');assert.equal(await frame.locator('.od-composer').evaluate(el=>el.getBoundingClientRect().height),288);
 await frame.getByRole('button',{name:'订单管理',exact:true}).click();await frame.locator('[data-layout-ready=true]').waitFor();
 assert.equal(await page.locator('.desktop-titlebar').count(),0);
 assert.equal(await page.locator('iframe').evaluate(el=>el.getBoundingClientRect().y),0);assert.equal(await page.locator('.order-window-drag').count(),1);
 assert.deepEqual(await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getWindowButtonPosition()),{x:22,y:21});
 await frame.locator('[data-detail]').first().click();await frame.locator('[data-layout-ready="true"]').waitFor();assert.equal(await page.locator('iframe').evaluate(el=>el.getBoundingClientRect().y),0);assert.equal(await frame.locator('.od-composer').evaluate(el=>el.getBoundingClientRect().height),288);
 // Exercise the packaged native image bridge with isolated fictional material.
 const imageResult=await page.evaluate(async()=>{
  const c=document.createElement('canvas');c.width=40;c.height=40;c.getContext('2d').fillRect(0,0,40,40);
  const saved=await window.manualProductImages.request({action:'add',image:{sku:'FICTIONAL-TEST',name:'Fictional image',dataUrl:c.toDataURL('image/jpeg')}});
  if(!saved.ok)return saved;const listed=await window.manualProductImages.request({action:'list',query:'FICTIONAL-TEST'});
  return {ok:listed.ok,count:listed.data?.length,id:saved.data.id};
 });assert(imageResult.ok,JSON.stringify(imageResult));assert.equal(imageResult.count,1);
 await page.reload();await frame.locator('[data-layout-ready=true]').waitFor();
 assert.equal(await page.evaluate(async()=>{const r=await window.manualProductImages.request({action:'list',query:'FICTIONAL-TEST'});return r.data?.length;}),1);
 for(const name of ['workbench','orders','inventory','product','profit','profit-detail','assistant','settings']){
  const next=new URL(page.url());next.searchParams.set('page',name);await page.goto(next.href);await frame.locator('[data-layout-ready=true]').waitFor();
  assert.equal(await page.locator('.desktop-titlebar').count(),0);assert.equal(await page.locator('iframe').evaluate(el=>el.getBoundingClientRect().y),0);
  assert.equal(await frame.locator('.od-version,.version,.ver').first().textContent(),pkg.version);
  await frame.getByRole('button',{name:'布局设置',exact:true}).click();await page.locator('.order-window-drag').waitFor({state:'hidden'});await frame.getByRole('button',{name:'完成',exact:true}).click();
 }
 assert.deepEqual(errors,[]);
 const report={ok:true,zip,appPath,identity,screens,chrome,nativeDisplayPersistence:displays.length>1,replySplitPersistence:true,unifiedPageChrome:true,errors};await writeFile(path.join(output,'packaged-verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await application?.close().catch(()=>{});await rm(temporary,{recursive:true,force:true});}
