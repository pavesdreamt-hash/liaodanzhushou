import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright-core';
import {LocalWebServer} from '../src/local-web-server.mjs';

const output=path.resolve('artifacts/order-layout-1.0.7');await mkdir(output,{recursive:true});
const server=new LocalWebServer({rendererDirectory:path.resolve('renderer'),sourceDirectory:path.resolve('src'),dispatch:async()=>({ok:true,data:{}})});
let browser;
const results=[];
try{
 const url=new URL(await server.start());url.searchParams.set('page','order');
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1280,height:820}});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{if(window!==window.top)return;let callback;window.orderLayoutDesktop={getDisplay:async()=>({id:'external',label:'外接屏（测试）'}),onDisplayChanged:cb=>{callback=cb;return()=>{callback=null;};}};window.changeTestDisplay=id=>callback?.({id,label:id});});
 const frame=()=>page.frameLocator('iframe');
 const ready=()=>frame().locator('[data-layout-ready="true"]').waitFor();
 const metrics=()=>frame().locator('#ui008-order-detail').evaluate(root=>{
  const rect=s=>{const r=root.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right};};
  const font=s=>getComputedStyle(root.querySelector(s)).fontSize;
  return {viewport:{width:innerWidth,height:innerHeight},phone:rect('.od-phone'),content:rect('.od-content'),nav:rect('.od-sidebar'),send:rect('#od-send-preview'),messages:rect('.od-messages'),editor:rect('.od-editor-scroll'),font:{nav:font('.od-nav-item'),title:font('.od-card-title'),value:font('.od-field-value'),label:font('.od-field-label'),chat:font('.od-bubble'),translation:font('.od-translation'),input:font('#od-chinese'),heading:font('h1')},overflow:document.documentElement.scrollWidth>innerWidth};
 });
 const openSettings=()=>frame().getByRole('button',{name:'布局设置',exact:true}).click();
 const closeSettings=()=>frame().getByRole('button',{name:'完成',exact:true}).click();
 const input=key=>frame().locator(`[data-setting="${key}"]`);
 const set=async(key,value)=>{await input(key).fill(String(value));await input(key).press('Tab');};
 await page.goto(url.href);await ready();
 for(const [width,height] of [[1024,1000],[1280,820],[1440,1000],[1920,1080],[820,640]]){
  await page.setViewportSize({width,height});await page.waitForTimeout(80);
  const m=await metrics();assert.deepEqual(m.font,{nav:'15px',title:'15px',value:'15px',label:'13px',chat:'13px',translation:'11px',input:'13px',heading:'20px'});
  assert(Math.abs(m.phone.height/m.phone.width-2.1)<.005,'phone ratio');assert(!m.overflow,'no horizontal page overflow');
  assert(m.send.bottom<=m.phone.bottom-7,'send stays inside phone');
  assert(await frame().locator('html').evaluate(el=>el.scrollHeight<=innerHeight&&scrollY===0),'document must not scroll');
  assert(await frame().locator('.od-sidebar').evaluate(el=>Math.abs(el.getBoundingClientRect().bottom-document.querySelector('.od-app').getBoundingClientRect().bottom)<=2),'sidebar reaches app bottom');assert(m.messages.height>=64,'chat readable');
  await page.screenshot({path:path.join(output,`order-${width}x${height}.png`)});results.push(m);
 }
 await page.setViewportSize({width:1440,height:1000});await openSettings();
 await set('navFont',18);await set('contentFont',17);await set('chatFont',16);await set('navWidth',210);await set('phoneWidth',390);
 await input('locked').uncheck();await set('phoneHeight',800);await closeSettings();
 let m=await metrics();assert.equal(m.nav.width,210);assert.equal(m.phone.width,390);assert.equal(m.phone.height,800);assert.equal(m.font.nav,'18px');assert.equal(m.font.chat,'16px');assert.equal(m.font.title,'17px');
 await page.reload();await ready();m=await metrics();assert.equal(m.phone.height,800);assert.equal(m.font.chat,'16px');
 // Inner scroll never moves the header, the order column, or bottom navigation status.
 const internal=await frame().locator('.ol-chat-scroll').evaluate(el=>{
  const top=document.querySelector('.od-topbar'),status=document.querySelector('.od-connection'),content=document.querySelector('.od-content');
  const before=[top.getBoundingClientRect().top,status.getBoundingClientRect().bottom,content.getBoundingClientRect().top];el.scrollTop=10000;window.scrollTo(0,1000);
  return {scrolled:el.scrollTop>0,outer:scrollY,before,after:[top.getBoundingClientRect().top,status.getBoundingClientRect().bottom,content.getBoundingClientRect().top],statusGap:document.querySelector('.od-sidebar').getBoundingClientRect().bottom-status.getBoundingClientRect().bottom};
 });assert(internal.scrolled);assert.equal(internal.outer,0);assert.deepEqual(internal.before,internal.after);assert(internal.statusGap<=16);
 const splitter=frame().locator('.ol-reply-divider');await splitter.scrollIntoViewIfNeeded();
 const phoneBefore=(await metrics()).phone;const replyBefore=await frame().locator('.od-composer').evaluate(el=>el.clientHeight);
 const splitBox=await splitter.boundingBox();await page.mouse.move(splitBox.x+splitBox.width/2,splitBox.y+7);await page.mouse.down();await page.mouse.move(splitBox.x+splitBox.width/2,splitBox.y-43,{steps:5});await page.mouse.up();
 assert.equal(await frame().locator('.od-composer').evaluate(el=>el.clientHeight),replyBefore+50);
 assert.equal((await metrics()).phone.height,phoneBefore.height);
 await page.reload();await ready();assert.equal(await frame().locator('.od-composer').evaluate(el=>el.clientHeight),replyBefore+50);
 await splitter.focus();await page.keyboard.press('ArrowDown');assert.equal(await frame().locator('.od-composer').evaluate(el=>el.clientHeight),replyBefore+42);
 await splitter.dblclick();assert.equal(await frame().locator('.od-composer').evaluate(el=>el.getBoundingClientRect().height),280);
 await openSettings();await set('composerHeight',1200);await closeSettings();assert((await metrics()).messages.height>=99);assert((await metrics()).send.bottom<=(await metrics()).phone.bottom-7);
 await openSettings();await set('composerHeight',280);await closeSettings();
 await page.evaluate(()=>window.changeTestDisplay('built-in'));m=await metrics();assert.equal(m.font.chat,'13px');
 await openSettings();await set('chatFont',15);await closeSettings();await page.evaluate(()=>window.changeTestDisplay('external'));m=await metrics();assert.equal(m.font.chat,'16px');
 // Width, height and corner handles: every side must work, preserve the other dimension unlocked.
 for(const [direction,key,property] of [['e','ArrowRight','width'],['w','ArrowLeft','width'],['s','ArrowDown','height'],['n','ArrowUp','height'],['ne','ArrowRight','width'],['nw','ArrowLeft','width'],['sw','ArrowDown','height'],['se','ArrowDown','height']]){
  const before=(await metrics()).phone;await frame().locator(`.ol-resize-${direction}`).focus();await page.keyboard.press(key);const after=(await metrics()).phone;assert.equal(after[property],before[property]+8,direction);
 }
 const beforeDrag=(await metrics()).nav.width;await frame().locator('.ol-nav-divider').scrollIntoViewIfNeeded();const handle=await frame().locator('.ol-nav-divider').boundingBox();await page.mouse.move(handle.x+5,handle.y+20);await page.mouse.down();await page.mouse.move(handle.x+35,handle.y+20,{steps:5});await page.mouse.up();assert.equal((await metrics()).nav.width,beforeDrag+30);
 await openSettings();await input('locked').check();const locked=(await metrics()).phone;await closeSettings();await frame().locator('.ol-resize-se').focus();await page.keyboard.press('ArrowRight');m=await metrics();assert(Math.abs(m.phone.height/m.phone.width-locked.height/locked.width)<.005);
 // Unusual sizes and fonts must stay usable; width is bounded by available center space.
 await openSettings();await set('phoneWidth',650);await set('navFont',22);await set('contentFont',22);await set('chatFont',20);await closeSettings();await page.setViewportSize({width:1280,height:820});await page.waitForTimeout(80);m=await metrics();assert(!m.overflow);assert(m.content.width>=379,JSON.stringify(m));assert(m.send.bottom<=m.phone.bottom-7);await page.screenshot({path:path.join(output,'order-large-fonts.png')});
 // Left scroll does not move phone; chat and composer have independent scroll ranges.
 const scroll=await frame().locator('.od-content').evaluate(el=>{const phone=document.querySelector('.od-phone'),before=phone.getBoundingClientRect().top;el.scrollTop=300;return {changed:el.scrollTop>0,before,after:phone.getBoundingClientRect().top};});assert(scroll.changed);assert.equal(scroll.before,scroll.after);
 await frame().locator('.od-messages').evaluate(el=>{for(let i=0;i<15;i++)el.append(el.querySelector('.od-bubble').cloneNode(true));});
 for(const selector of ['.od-messages','.od-editor-scroll'])assert(await frame().locator(selector).evaluate(el=>{el.scrollTop=200;return el.scrollTop>0;}),`${selector} scrolls`);
 await openSettings();await frame().getByRole('button',{name:'恢复本屏幕默认'}).click();await page.keyboard.press('Escape');m=await metrics();assert.equal(m.font.chat,'13px');
 await page.evaluate(()=>window.changeTestDisplay('built-in'));assert.equal((await metrics()).font.chat,'15px');await page.evaluate(()=>window.changeTestDisplay('external'));
 await openSettings();await set('contentWidth',500);await closeSettings();assert(Math.abs((await metrics()).content.width-500)<=1);
 const centerWidth=(await metrics()).content.width;await frame().locator('.ol-column-divider').focus();await page.keyboard.press('ArrowRight');assert.equal((await metrics()).content.width,centerWidth+8);
 await frame().locator('.od-close').click();assert(await frame().locator('.ol-phone-box').isHidden());await frame().locator('.od-close').click();assert(await frame().locator('.ol-phone-box').isVisible());
 await frame().locator('[data-mode="assist"]').click();assert.equal(await frame().locator('[data-mode="assist"]').getAttribute('aria-pressed'),'true');await frame().locator('[data-mode="manual"]').click();
 await frame().getByRole('button',{name:/确认客户资料/}).click();await page.waitForTimeout(80);assert(await frame().locator('#od-customer-title').evaluate(el=>el.closest('section').classList.contains('od-is-collapsed')));
 await frame().getByRole('button',{name:'订单管理',exact:true}).click();assert.equal(await frame().locator('.ol-layout-button').count(),0);await frame().locator('[data-detail]').first().click();await ready();assert.equal((await metrics()).font.chat,'13px');
 const before=JSON.parse(await readFile(path.join(output,'before.json'),'utf8'));
 const unchanged=[];
 for(const [file,hash] of Object.entries(before)){if((file.startsWith('ui/src/confirmed/')&&!file.endsWith('/order.html'))||file==='ui/src/styles.css'){assert.equal(createHash('sha256').update(await readFile(file)).digest('hex'),hash,file);unchanged.push(file);}}
 for(const name of ['workbench','orders','inventory','profit','profit-detail','product','settings','assistant']){const other=new URL(url);other.searchParams.set('page',name);await page.goto(other.href);await frame().locator('button').first().waitFor();assert.equal(await frame().locator('.ol-layout-button').count(),name==='workbench'?1:0);}
 assert.deepEqual(errors,[]);
 const report={ok:true,viewports:results,unchanged,checks:['fonts','ratio','edge-and-corner-resize','pointer-divider','reload-persistence','display-switch','reset-per-display','independent-scroll','customer-confirm-fold','navigation-isolation'],errors};
 await writeFile(path.join(output,'browser-verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser?.close();server.close();}
