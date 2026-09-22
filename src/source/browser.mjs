import {chromium} from 'playwright-core';
import {access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {installLayoutProbe} from '../../shared/layout-probe.mjs';
import {decodeLayout} from '../../shared/reconstruct.mjs';
import {AppError} from '../core/errors.mjs';
import {findChrome} from '../core/chrome-path.mjs';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let workspaceSession=null;
async function exists(file){try{await access(file);return true;}catch{return false;}}
export function kdocsBrowserContextOptions({capture=false}={}){
  return {headless:false,viewport:null,acceptDownloads:false,locale:'zh-CN',timezoneId:'Asia/Shanghai',
    args:['--start-maximized',...(capture?['--disable-features=Translate']:[])]};
}
export async function browserLaunchOptions(){
  const chrome=await findChrome();
  if(chrome)return {executablePath:chrome,browserName:'Google Chrome'};
  const chromiumPath=chromium.executablePath();
  if(await exists(chromiumPath))return {executablePath:chromiumPath,browserName:'Playwright Chromium'};
  throw new AppError('没有找到Google Chrome或应用备用Chromium',{stage:'打开KDocs',code:'BROWSER_NOT_FOUND'});
}
export async function closeKdocsWorkspace(){
  const session=workspaceSession;workspaceSession=null;
  await session?.context?.close().catch(()=>{});
}
export async function openKdocs(profile,url,{readyTimeoutMs=60000,onProgress=()=>{}}={}){
  if(workspaceSession){onProgress({stage:'KDocs采集',message:'正在将KDocs工作区切换到自动采集模式...'});await closeKdocsWorkspace();}
  const launch=await browserLaunchOptions();onProgress({stage:'KDocs采集',message:`正在启动${launch.browserName}...`});
  const context=await chromium.launchPersistentContext(profile,{...launch,...kdocsBrowserContextOptions({capture:true})});
  await context.addInitScript(installLayoutProbe);
  const page=context.pages()[0]||await context.newPage();
  try{
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
    await page.locator('#et_canvas').waitFor({state:'visible',timeout:readyTimeoutMs});await delay(1200);
    return {context,page,browserName:launch.browserName};
  }catch(error){await context.close();throw new AppError('KDocs库存表未显示，登录可能失效',{stage:'KDocs采集',code:'KDOCS_LOGIN_REQUIRED',details:error.message});}
}
export async function loginKdocs(profile,url,{timeoutMs=10*60_000,onProgress=()=>{}}={}){
  if(workspaceSession){
    try{
      await workspaceSession.page.bringToFront();
      onProgress({stage:'KDocs工作区',message:'已切换到现有Chrome工作窗口'});
      await workspaceSession.page.locator('#et_canvas').waitFor({state:'visible',timeout:timeoutMs});
      return {loggedIn:true,reused:true,keptOpen:true,browserName:workspaceSession.browserName};
    }
    catch{await closeKdocsWorkspace();}
  }
  const launch=await browserLaunchOptions(),context=await chromium.launchPersistentContext(profile,{...launch,...kdocsBrowserContextOptions()});
  const page=context.pages()[0]||await context.newPage();workspaceSession={context,page,browserName:launch.browserName};
  context.on('close',()=>{if(workspaceSession?.context===context)workspaceSession=null;});
  try{
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});await page.bringToFront();
    onProgress({stage:'KDocs工作区',message:'已在独立Chrome窗口打开；可自由缩放和编辑，完成登录后窗口会继续保留'});
    await page.locator('#et_canvas').waitFor({state:'visible',timeout:timeoutMs});await delay(800);
    return {loggedIn:true,reused:false,keptOpen:true,browserName:launch.browserName};
  }catch(error){
    await closeKdocsWorkspace();
    throw new AppError('在规定时间内没有检测到库存表',{stage:'KDocs登录',code:'KDOCS_LOGIN_TIMEOUT'});
  }
}
export async function goTo(page,address){
  if(!/^[A-Z]{1,3}[1-9]\d{0,5}$/.test(address))throw new Error('单元格地址超出安全范围');
  const box=page.locator('input.edit-box');await box.fill(address);await box.press('Enter');await delay(450);
  if((await box.inputValue()).toUpperCase()!==address)throw new Error(`无法定位到${address}`);
}
export async function usedEnd(page){await goTo(page,'A1');await page.keyboard.press('Meta+End');await delay(1500);return (await page.locator('input.edit-box').inputValue()).toUpperCase();}
export async function captureLayout(page,label){
  await page.evaluate(()=>globalThis.__KD_LAYOUT.reset());const viewport=page.viewportSize()||await page.evaluate(()=>({width:Math.round(innerWidth),height:Math.round(innerHeight)}));
  if(!viewport?.width||!viewport?.height)throw new Error('浏览器viewport不可用');
  await page.setViewportSize({...viewport,height:viewport.height-1});await delay(500);await page.evaluate(()=>globalThis.__KD_LAYOUT.reset());
  await page.setViewportSize(viewport);await delay(1000);const snapshot=await page.evaluate(()=>globalThis.__KD_LAYOUT.snapshot());
  if(!snapshot||snapshot.events.length<=20)throw new Error(`Canvas重绘未在限定时间内完成：${label}`);
  return {label,...snapshot,navigation:{selectedAddress:await page.locator('input.edit-box').inputValue()}};
}
export async function captureCellImageFingerprint(page,address){
  const match=/^([A-Z]+)([1-9]\d*)$/.exec(address);if(!match)throw new Error(`图片单元格地址无效：${address}`);
  await goTo(page,address);const raw=await captureLayout(page,`image-${address}`),layout=decodeLayout(raw),rowNumber=Number(match[2]);
  const row=layout.rows.find(x=>x.row===rowNumber),column=layout.columns.find(x=>x.column===match[1]),box=await page.locator('#et_canvas').boundingBox();
  if(!row||!column||!box)throw new Error(`无法定位图片单元格：${address}`);
  const clip={x:box.x+column.left+2,y:box.y+row.top+2,width:Math.max(1,column.width-4),height:Math.max(1,row.height-4)};
  const hashes=[];let byteLength=0;
  for(let attempt=0;attempt<3;attempt++){
    const png=await page.screenshot({clip});byteLength=png.length;hashes.push(createHash('sha256').update(png).digest('hex').slice(0,24));
    if(hashes.length>1&&hashes.at(-1)===hashes.at(-2))return {fingerprint:`SHOT:${hashes.at(-1)}`,method:'cell-screenshot-sha256',byteLength};
    await delay(250);
  }
  throw new Error(`图片单元格像素不稳定：${address} (${hashes.join(',')})`);
}
export {delay};
