import path from 'node:path';
import os from 'node:os';
import {mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {_electron as electron} from 'playwright-core';
import electronPath from 'electron';

const sourceApp=process.env.UI_SOURCE_APP==='1';
const executable=process.env.UI_EXECUTABLE||(sourceApp?electronPath:null);
const output=path.resolve(process.env.UI_CAPTURE_DIR||'artifacts/ui-boundaries/current');
if(!executable)throw new Error('Set UI_EXECUTABLE to the packaged App executable');
const cases=[
  ['workbench',1280,820],['workbench',1440,1000],
  ['order',1280,820],['order',1440,1000],
  ...['orders','inventory','profit','assistant','settings','product','profit-detail'].map(page=>[page,1280,820])
];
const temporary=await mkdtemp(path.join(os.tmpdir(),'liaodan-ui-boundaries-'));
let application;
try{
  await mkdir(output,{recursive:true});
  application=await electron.launch({executablePath:executable,args:[...(sourceApp?['.']:[]),`--isolated-user-data=${path.join(temporary,'data')}`],cwd:path.resolve('.'),env:{...process.env,NODE_ENV:'production'}});
  const page=await application.firstWindow({timeout:60000});
  await page.waitForURL(/^http:\/\/127\.0\.0\.1:/,{waitUntil:'load',timeout:60000});
  const results=[];
  for(const [route,width,height] of cases){
    await application.evaluate(({BrowserWindow},size)=>{const window=BrowserWindow.getAllWindows()[0];window.unmaximize();window.setContentSize(size.width,size.height);},{width,height});
    const address=new URL(page.url());address.searchParams.set('page',route);
    if(page.url()!==address.href)await page.goto(address.href,{waitUntil:'load'});
    const frame=page.frameLocator('iframe.confirmed-frame');
    await frame.locator('[data-layout-ready=true]').waitFor({timeout:20000});
    await page.waitForTimeout(250);
    const geometry=await frame.locator('body').evaluate(body=>{
      const box=selector=>{const element=body.querySelector(selector);if(!element)return null;const rect=element.getBoundingClientRect(),style=getComputedStyle(element);return {x:Math.round(rect.x),y:Math.round(rect.y),width:Math.round(rect.width),height:Math.round(rect.height),fontSize:style.fontSize,display:style.display};};
      return {viewport:{width:innerWidth,height:innerHeight},root:box('[data-layout-ready=true]'),top:box('.od-topbar,.cw-topbar,.up-top'),nav:box('.od-sidebar,.cw-sidebar,.up-sidebar'),content:box('.od-content,.cw-content,.up-main'),phone:box('.od-phone,.cw-phone'),reply:box('.reply-rail'),empty:box('.live-empty-state')};
    });
    const filename=`${route}-${width}x${height}.png`;
    await page.screenshot({path:path.join(output,filename)});
    results.push({route,width,height,geometry,filename});
  }
  await writeFile(path.join(output,'geometry.json'),JSON.stringify(results,null,2));
  console.log(JSON.stringify({ok:true,output,cases:results.length}));
}finally{
  await application?.close().catch(()=>{});
  await rm(temporary,{recursive:true,force:true});
}
