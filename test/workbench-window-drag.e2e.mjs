import test from 'node:test';
import assert from 'node:assert/strict';
import {_electron as electron} from 'playwright-core';
import electronPath from 'electron';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {buildNativeWindowDragHelper,nativeWindowDragSupported} from '../scripts/native-window-drag.mjs';

const pause=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));
const waitFor=async(check,{timeout=5000,interval=60}={})=>{
  const until=Date.now()+timeout;
  while(Date.now()<until){if(await check())return;await pause(interval);}
  throw new Error('Timed out waiting for the workbench window-drag state.');
};
const bounds=application=>application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getBounds());
const setWindow=async(application,rect)=>{
  await application.evaluate(({BrowserWindow,app},next)=>{const window=BrowserWindow.getAllWindows()[0];window.unmaximize();window.setBounds(next);window.show();window.focus();app.focus({steal:true});},rect);
  await pause(160);
};
const rects=async(page,frame)=>({
  layers:await page.locator('.order-window-drag').evaluateAll(nodes=>nodes.map(node=>{const rect=node.getBoundingClientRect();return {left:rect.left,top:rect.top,right:rect.right,bottom:rect.bottom};})),
  controls:await frame.locator('#cwb-connection-status,.cwb-top-modes').evaluateAll(nodes=>nodes.map(node=>{const rect=node.getBoundingClientRect();return {left:rect.left,top:rect.top,right:rect.right,bottom:rect.bottom};}))
});
const topbarGeometry=async frame=>frame.locator('#chat-workbench-desktop').evaluate(root=>{
  const measure=selector=>{const element=root.querySelector(selector);if(!element)throw new Error(`Missing top-bar element: ${selector}`);const rect=element.getBoundingClientRect(),style=getComputedStyle(element);return {left:rect.left,top:rect.top,right:rect.right,bottom:rect.bottom,display:style.display,visibility:style.visibility,text:element.textContent?.trim()||'',ariaLabel:element.getAttribute('aria-label')||'',generated:getComputedStyle(element,'::after').content};};
  return {brand:measure('.cwb-brand'),brandName:measure('.cwb-brand strong'),version:measure('.cwb-top-version'),status:measure('#cwb-connection-status'),label:measure('#cwb-connection-status>span'),dot:measure('.cwb-connection-dot')};
});
const assertTopbarNoOverlap=async(frame,{compact,expectedState}={})=>{
  const geometry=await topbarGeometry(frame),overlaps=(first,second)=>first.left<second.right&&first.right>second.left&&first.top<second.bottom&&first.bottom>second.top;
  const state=expectedState||geometry.status.ariaLabel.replace(/^WhatsApp\s+/,'');
  assert.ok(['已连接','未连接'].includes(state),`状态应保留实际语义：${JSON.stringify(geometry.status)}`);
  assert.equal(geometry.status.ariaLabel,`WhatsApp ${state}`);
  assert.ok(geometry.status.text.startsWith(`WhatsApp ${state}`),`状态完整文本丢失：${JSON.stringify(geometry.status)}`);
  assert.equal(overlaps(geometry.brand,geometry.status),false,`窄窗口品牌与状态发生重叠：${JSON.stringify(geometry)}`);
  assert.equal(overlaps(geometry.brandName,geometry.status),false,`窄窗口品牌名称与状态发生重叠：${JSON.stringify(geometry)}`);
  assert.notEqual(geometry.dot.display,'none');
  assert.ok(geometry.dot.right>geometry.dot.left,`状态圆点不可见：${JSON.stringify(geometry.dot)}`);
  if(compact){assert.equal(geometry.version.display,'none');assert.ok(geometry.label.generated.includes(state),`窄窗口应显示短状态：${JSON.stringify(geometry.label)}`);}else{assert.notEqual(geometry.version.display,'none');assert.ok(geometry.label.text.startsWith(`WhatsApp ${state}`));}
};
const assertControlsRemainClickable=async(page,frame)=>{
  const geometry=await rects(page,frame),overlaps=(first,second)=>first.left<second.right&&first.right>second.left&&first.top<second.bottom&&first.bottom>second.top;
  assert.ok(geometry.layers.length>0,'工作台应渲染顶层原生拖动片段');
  for(const control of geometry.controls)for(const layer of geometry.layers)assert.equal(overlaps(layer,control),false,`拖动层覆盖了顶栏控件：${JSON.stringify({layer,control})}`);
};
const waitForChangedChrome=async(page,frame,previous)=>{
  await waitFor(async()=>JSON.stringify(await rects(page,frame))!==JSON.stringify(previous));
  await assertControlsRemainClickable(page,frame);
};
const moveWindow=async(application,page,drag,start)=>{
  await application.evaluate(({BrowserWindow,app})=>{const window=BrowserWindow.getAllWindows()[0];window.show();window.focus();app.focus({steal:true});});
  const before=await bounds(application),viewport=await page.evaluate(()=>({width:innerWidth,height:innerHeight}));
  await drag({pid:application.process().pid,viewport,start,delta:{x:44,y:31}});
  await pause(350);
  const after=await bounds(application),change={x:after.x-before.x,y:after.y-before.y,width:after.width-before.width,height:after.height-before.height};
  assert.ok(change.x>=30&&change.y>=10,`原生拖动没有移动工作台窗口：${JSON.stringify(change)}`);
  assert.equal(change.width,0,JSON.stringify(change));
  assert.equal(change.height,0,JSON.stringify(change));
  return change;
};

test('macOS workbench keeps native drag space without covering title-bar controls',{skip:!nativeWindowDragSupported},async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'liaodan-workbench-drag-'));
  let application;
  try{
    const native=await buildNativeWindowDragHelper(directory);
    application=await electron.launch({executablePath:electronPath,args:['.',`--orders-test-user-data=${path.join(directory,'data')}`,'--orders-test-browser-workspace'],cwd:path.resolve('.'),env:{...process.env,NODE_ENV:'test'}});
    const page=await application.firstWindow({timeout:60000}),frame=page.frameLocator('iframe.confirmed-frame'),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await setWindow(application,{x:200,y:120,width:1280,height:820});
    await frame.locator('.cwb-top-modes').waitFor();
    await assertControlsRemainClickable(page,frame);
    await assertTopbarNoOverlap(frame,{compact:false});
    const workbench=frame.locator('#chat-workbench-desktop'),wasNavOpen=await workbench.evaluate(root=>root.classList.contains('is-nav-open'));
    await frame.locator('.cwb-nav-toggle').click();
    await waitFor(async()=>await workbench.evaluate(root=>root.classList.contains('is-nav-open'))!==wasNavOpen);
    await pause(100);
    await assertControlsRemainClickable(page,frame);
    let priorChrome=await rects(page,frame);
    await frame.locator('.cwb-column-resizer').evaluate(resizer=>{const doc=resizer.ownerDocument,start=resizer.getBoundingClientRect().left+4;resizer.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:start,pointerId:1}));doc.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:start+72,pointerId:1}));doc.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,clientX:start+72,pointerId:1}));});
    await waitForChangedChrome(page,frame,priorChrome);
    priorChrome=await rects(page,frame);
    await frame.locator('.cwb-order-resizer').evaluate(resizer=>{const doc=resizer.ownerDocument,start=resizer.getBoundingClientRect().left+4;resizer.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:start,pointerId:2}));doc.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:start-72,pointerId:2}));doc.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,clientX:start-72,pointerId:2}));});
    await waitForChangedChrome(page,frame,priorChrome);
    priorChrome=await rects(page,frame);
    await frame.locator('#cwb-connection-status').evaluate(status=>{status.classList.add('is-online');status.setAttribute('aria-label','WhatsApp 已连接');const label=status.querySelector('span');if(label)label.textContent='WhatsApp 已连接（虚构）';});
    await waitForChangedChrome(page,frame,priorChrome);
    await assertTopbarNoOverlap(frame,{compact:false,expectedState:'已连接'});
    await frame.locator('.cwb-top-modes [data-mode="assist"]').click();
    await frame.getByText('AI辅助需要先在助手配置保存服务商、模型和 API 密钥。',{exact:true}).waitFor();
    await moveWindow(application,page,native.drag,{x:140,y:24});
    await setWindow(application,{x:200,y:120,width:1280,height:820});
    await moveWindow(application,page,native.drag,{x:1100,y:24});

    await setWindow(application,{x:200,y:120,width:820,height:640});
    await assertControlsRemainClickable(page,frame);
    await assertTopbarNoOverlap(frame,{compact:true,expectedState:'已连接'});
    await moveWindow(application,page,native.drag,{x:320,y:24});
    await setWindow(application,{x:200,y:120,width:820,height:640});
    await moveWindow(application,page,native.drag,{x:790,y:24});

    await setWindow(application,{x:200,y:120,width:1280,height:820});
    await frame.getByRole('button',{name:'连接与设置',exact:true}).click();
    await frame.getByRole('button',{name:'聊单工作台',exact:true}).click();
    await frame.locator('.cwb-top-modes').waitFor();
    await assertControlsRemainClickable(page,frame);
    await assertTopbarNoOverlap(frame,{compact:false});
    await moveWindow(application,page,native.drag,{x:1100,y:24});

    await setWindow(application,{x:200,y:120,width:1280,height:820});
    await frame.locator('#chat-workbench-desktop').evaluate(root=>{const dialog=document.createElement('dialog');dialog.id='workbench-drag-test-modal';document.body.append(dialog);dialog.showModal();});
    await waitFor(async()=>await page.locator('.order-window-drag').count()===0);
    const before=await bounds(application),viewport=await page.evaluate(()=>({width:innerWidth,height:innerHeight}));
    await native.drag({pid:application.process().pid,viewport,start:{x:140,y:24},delta:{x:44,y:31}});
    await pause(300);
    assert.deepEqual(await bounds(application),before,'工作台模态弹窗打开时不得移动窗口');
    await frame.locator('#workbench-drag-test-modal').evaluate(dialog=>{dialog.close();dialog.remove();});
    await waitFor(async()=>await page.locator('.order-window-drag').count()>0);
    await moveWindow(application,page,native.drag,{x:1100,y:24});
    assert.deepEqual(errors,[]);
  }finally{
    try{application?.process().kill('SIGKILL');}catch{}
    await application?.close().catch(()=>{});
    await rm(directory,{recursive:true,force:true,maxRetries:3,retryDelay:100});
  }
});
