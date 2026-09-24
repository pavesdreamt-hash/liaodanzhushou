import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import {mkdir,mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {_electron as electron} from 'playwright-core';
import {buildNativeWindowDragHelper} from './native-window-drag.mjs';

const version=JSON.parse(await readFile('package.json','utf8')).version;
const appPath=path.resolve(process.env.WORKBENCH_DRAG_APP_PATH||path.join('dist',`聊单助手${version}-x64`,'mac',`聊单助手 ${version}.app`));
const output=path.resolve(`artifacts/workbench-drag-${version}`);
const pause=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));
const waitFor=async(check,{timeout=6000,interval=60}={})=>{const until=Date.now()+timeout;while(Date.now()<until){if(await check())return;await pause(interval);}throw new Error('Timed out waiting for packaged workbench drag verification.');};
const overlaps=(first,second)=>first.left<second.right&&first.right>second.left&&first.top<second.bottom&&first.bottom>second.top;
await mkdir(output,{recursive:true});
const temporary=await mkdtemp(path.join(os.tmpdir(),'liaodan-packaged-workbench-drag-'));
let application;
try{
  const native=await buildNativeWindowDragHelper(temporary),data=path.join(temporary,'data');
  application=await electron.launch({executablePath:path.join(appPath,'Contents','MacOS',`聊单助手 ${version}`),args:[`--isolated-user-data=${data}`,`--orders-test-user-data=${data}`,'--orders-test-browser-workspace'],cwd:path.dirname(appPath),env:{...process.env,NODE_ENV:'production'}});
  const page=await application.firstWindow({timeout:60000}),frame=page.frameLocator('iframe.confirmed-frame'),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.waitForURL(/http:\/\/127\.0\.0\.1:/,{waitUntil:'load'});
  await frame.locator('.cwb-top-modes').waitFor();
  const identity=await application.evaluate(({app})=>({packaged:app.isPackaged,version:app.getVersion(),path:app.getAppPath(),arch:process.arch}));
  assert(identity.packaged);assert.equal(identity.version,version);assert.equal(identity.arch,'x64');assert(identity.path.startsWith(appPath));
  const setWindow=async(rect)=>{await application.evaluate(({BrowserWindow,app},next)=>{const window=BrowserWindow.getAllWindows()[0];window.unmaximize();window.setBounds(next);window.show();window.focus();app.focus({steal:true});},rect);await pause(180);};
  const windowBounds=()=>application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getBounds());
  const topGeometry=async()=>({
    layers:await page.locator('.order-window-drag').evaluateAll(nodes=>nodes.map(node=>{const rect=node.getBoundingClientRect();return {left:rect.left,top:rect.top,right:rect.right,bottom:rect.bottom};})),
    controls:await frame.locator('#cwb-connection-status,.cwb-top-modes').evaluateAll(nodes=>nodes.map(node=>{const rect=node.getBoundingClientRect();return {left:rect.left,top:rect.top,right:rect.right,bottom:rect.bottom};}))
  });
  const topbarGeometry=async()=>frame.locator('#chat-workbench-desktop').evaluate(root=>{
    const measure=selector=>{const element=root.querySelector(selector);if(!element)throw new Error(`Missing top-bar element: ${selector}`);const rect=element.getBoundingClientRect(),style=getComputedStyle(element);return {left:rect.left,top:rect.top,right:rect.right,bottom:rect.bottom,display:style.display,visibility:style.visibility,text:element.textContent?.trim()||'',ariaLabel:element.getAttribute('aria-label')||'',generated:getComputedStyle(element,'::after').content};};
    return {brand:measure('.cwb-brand'),brandName:measure('.cwb-brand strong'),version:measure('.cwb-top-version'),status:measure('#cwb-connection-status'),label:measure('#cwb-connection-status>span'),dot:measure('.cwb-connection-dot')};
  });
  const assertTopbarNoOverlap=async({compact,expectedState}={})=>{
    const geometry=await topbarGeometry(),state=expectedState||geometry.status.ariaLabel.replace(/^WhatsApp\s+/,'');
    assert.ok(['已连接','未连接'].includes(state),`packaged status lost its actual meaning: ${JSON.stringify(geometry.status)}`);
    assert.equal(geometry.status.ariaLabel,`WhatsApp ${state}`);
    assert.ok(geometry.status.text.startsWith(`WhatsApp ${state}`),`packaged status text lost its actual meaning: ${JSON.stringify(geometry.status)}`);
    assert.equal(overlaps(geometry.brand,geometry.status),false,`packaged compact top bar overlaps brand and status: ${JSON.stringify(geometry)}`);
    assert.equal(overlaps(geometry.brandName,geometry.status),false,`packaged compact top bar overlaps brand name and status: ${JSON.stringify(geometry)}`);
    assert.notEqual(geometry.dot.display,'none');
    assert.ok(geometry.dot.right>geometry.dot.left,`packaged connection dot is not visible: ${JSON.stringify(geometry.dot)}`);
    if(compact){assert.equal(geometry.version.display,'none');assert.ok(geometry.label.generated.includes(state),`packaged compact state label is missing: ${JSON.stringify(geometry.label)}`);}else{assert.notEqual(geometry.version.display,'none');assert.ok(geometry.label.text.startsWith(`WhatsApp ${state}`));}
    return geometry;
  };
  const assertClearControls=async()=>{
    const {layers,controls}=await topGeometry();
    assert.ok(layers.length>0,'packaged workbench did not expose any parent native drag region');
    for(const control of controls)for(const layer of layers)assert.equal(overlaps(layer,control),false,`packaged drag layer overlaps a title-bar control: ${JSON.stringify({layer,control})}`);
  };
  const waitForChangedChrome=async(previous)=>{
    await waitFor(async()=>JSON.stringify(await topGeometry())!==JSON.stringify(previous));
    await assertClearControls();
  };
  const drag=async(start)=>{
    await application.evaluate(({BrowserWindow,app})=>{const window=BrowserWindow.getAllWindows()[0];window.show();window.focus();app.focus({steal:true});});
    const before=await windowBounds(),viewport=await page.evaluate(()=>({width:innerWidth,height:innerHeight})),display=await application.evaluate(({BrowserWindow,screen})=>screen.getDisplayMatching(BrowserWindow.getAllWindows()[0].getBounds()).workArea);
    const verticallyConstrained=before.height>=display.height&&before.y<=display.y&&before.y+before.height>=display.y+display.height;
    await native.drag({pid:application.process().pid,viewport,start,delta:{x:44,y:31}});
    await pause(350);
    const after=await windowBounds(),change={x:after.x-before.x,y:after.y-before.y,width:after.width-before.width,height:after.height-before.height};
    assert.ok(change.x>=30&&(verticallyConstrained||change.y>=10),`packaged native workbench drag failed: ${JSON.stringify({before,after,viewport,display,start,verticallyConstrained,change})}`);
    assert.equal(change.width,0,JSON.stringify(change));assert.equal(change.height,0,JSON.stringify(change));
    return {...change,verticallyConstrained};
  };
  const results=[],topbarResults=[];
  await setWindow({x:200,y:120,width:1280,height:820});
  await assertClearControls();
  topbarResults.push({layout:'1280x820',compact:false,geometry:await assertTopbarNoOverlap()});
  const workbench=frame.locator('#chat-workbench-desktop'),wasNavOpen=await workbench.evaluate(root=>root.classList.contains('is-nav-open'));
  await frame.locator('.cwb-nav-toggle').click();
  await waitFor(async()=>await workbench.evaluate(root=>root.classList.contains('is-nav-open'))!==wasNavOpen);
  await pause(100);
  await assertClearControls();
  let priorChrome=await topGeometry();
  await frame.locator('.cwb-column-resizer').evaluate(resizer=>{const doc=resizer.ownerDocument,start=resizer.getBoundingClientRect().left+4;resizer.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:start,pointerId:1}));doc.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:start+72,pointerId:1}));doc.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,clientX:start+72,pointerId:1}));});
  await waitForChangedChrome(priorChrome);
  priorChrome=await topGeometry();
  await frame.locator('.cwb-order-resizer').evaluate(resizer=>{const doc=resizer.ownerDocument,start=resizer.getBoundingClientRect().left+4;resizer.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:start,pointerId:2}));doc.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:start-72,pointerId:2}));doc.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,clientX:start-72,pointerId:2}));});
  await waitForChangedChrome(priorChrome);
  priorChrome=await topGeometry();
  await frame.locator('#cwb-connection-status').evaluate(status=>{status.classList.add('is-online');status.setAttribute('aria-label','WhatsApp 已连接');const label=status.querySelector('span');if(label)label.textContent='WhatsApp 已连接（虚构）';});
  await waitForChangedChrome(priorChrome);
  topbarResults.push({layout:'1280x820-online',compact:false,geometry:await assertTopbarNoOverlap({expectedState:'已连接'})});
  await frame.locator('.cwb-top-modes [data-mode="assist"]').click();
  await frame.getByText('AI辅助需要先在助手配置保存服务商、模型和 API 密钥。',{exact:true}).waitFor();
  results.push({layout:'1280x820',side:'left',change:await drag({x:140,y:24})});
  await setWindow({x:200,y:120,width:1280,height:820});
  results.push({layout:'1280x820',side:'right',change:await drag({x:1100,y:24})});
  await page.screenshot({path:path.join(output,'workbench-drag-1280x820.png')});
  await setWindow({x:200,y:120,width:820,height:640});
  await assertClearControls();
  topbarResults.push({layout:'820x640',compact:true,geometry:await assertTopbarNoOverlap({compact:true,expectedState:'已连接'})});
  results.push({layout:'820x640',side:'left',change:await drag({x:320,y:24})});
  await setWindow({x:200,y:120,width:820,height:640});
  results.push({layout:'820x640',side:'right',change:await drag({x:790,y:24})});
  await page.screenshot({path:path.join(output,'workbench-drag-820x640.png')});
  await setWindow({x:200,y:120,width:1440,height:1000});
  await frame.getByRole('button',{name:'连接与设置',exact:true}).click();
  await frame.getByRole('button',{name:'聊单工作台',exact:true}).click();
  await frame.locator('.cwb-top-modes').waitFor();
  await assertClearControls();
  topbarResults.push({layout:'1440x1000-returned',compact:false,geometry:await assertTopbarNoOverlap()});
  await page.screenshot({path:path.join(output,'workbench-drag-1440x1000.png')});
  results.push({layout:'1440x1000-returned',side:'right',change:await drag({x:1260,y:24})});
  await setWindow({x:200,y:120,width:1440,height:1000});
  await frame.locator('#chat-workbench-desktop').evaluate(root=>{const dialog=document.createElement('dialog');dialog.id='workbench-drag-package-modal';document.body.append(dialog);dialog.showModal();});
  await waitFor(async()=>await page.locator('.order-window-drag').count()===0);
  const before=await windowBounds(),viewport=await page.evaluate(()=>({width:innerWidth,height:innerHeight}));
  await native.drag({pid:application.process().pid,viewport,start:{x:140,y:24},delta:{x:44,y:31}});
  await pause(300);
  assert.deepEqual(await windowBounds(),before,'packaged modal allowed a native title-bar drag');
  await frame.locator('#workbench-drag-package-modal').evaluate(dialog=>{dialog.close();dialog.remove();});
  await waitFor(async()=>await page.locator('.order-window-drag').count()>0);
  results.push({layout:'1440x1000-modal-closed',side:'right',change:await drag({x:1260,y:24})});
  assert.deepEqual(errors,[]);
  const report={ok:true,version,appPath,identity,directAppArtifact:true,fictionalClient:true,realMessagesSent:0,realAiCalls:0,results,topbarResults,checks:['final Mac x64 app launched directly','packaged app version and x64 identity','compact 820x640 brand and WhatsApp status do not overlap while retaining the short visible state and full accessibility name','full WhatsApp status text and version badge remain visible at 1280x820 and 1440x1000','native left and right workbench drag at 1280x820','native left and right workbench drag at 820x640','top AI assist control remains clickable','title-bar controls are not covered by parent drag fragments','navigation, customer-column, order-column and connection-state changes recompute drag fragments','business-page return recomputes drag fragments','modal disables native drag and restores it on close'],errors};
  await writeFile(path.join(output,'app-verification.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
}finally{
  try{application?.process().kill('SIGKILL');}catch{}
  await application?.close().catch(()=>{});
  await rm(temporary,{recursive:true,force:true,maxRetries:3,retryDelay:150}).catch(()=>{});
}
