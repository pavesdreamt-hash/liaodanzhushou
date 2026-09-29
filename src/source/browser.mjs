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
const safeCall=async operation=>{try{return await operation();}catch{return null;}};
const activePage=context=>{
  const pages=typeof context?.pages==='function'?context.pages():[];
  return pages.find(page=>!page?.isClosed?.())||null;
};

// Login and collection deliberately share the same persistent profile.  The
// QR page is a valid waiting state, not a failed collection state.
export function createKdocsWorkspaceManager({launchOptions=browserLaunchOptions,launchPersistentContext=(profile,options)=>chromium.launchPersistentContext(profile,options)}={}){
  let session=null;
  const attachPage=(candidate,current)=>{
    if(!candidate)return;
    current.page=candidate;
    candidate.on?.('close',()=>{
      if(session!==current||current.page!==candidate)return;
      const replacement=activePage(current.context);
      if(replacement&&replacement!==candidate){attachPage(replacement,current);return;}
      current.state='closed';current.reason='浏览器窗口已关闭';
    });
    candidate.on?.('crash',()=>{if(session===current&&current.page===candidate){current.state='failed';current.reason='浏览器页面意外退出';}});
  };
  const inspect=async()=>{
    if(!session)return {state:'idle',browserName:null,keptOpen:false};
    const current=session;
    if(current.contextClosed||current.page?.isClosed?.()){
      const replacement=activePage(current.context);
      if(replacement)attachPage(replacement,current);else{current.state='closed';current.reason=current.reason||'浏览器窗口已关闭';}
    }
    if(current.state==='closed'||current.state==='failed')return {state:current.state,browserName:current.browserName,keptOpen:false,reason:current.reason||null};
    const ready=Boolean(await safeCall(()=>current.page?.locator?.('#et_canvas').isVisible({timeout:500})));
    current.state=ready?'ready':'awaiting_login';
    return {state:current.state,browserName:current.browserName,keptOpen:true,reason:ready?null:'请在已打开的来源资料窗口完成登录或扫码'};
  };
  const close=async()=>{
    const current=session;session=null;
    await current?.context?.close?.().catch(()=>{});
  };
  const login=async(profile,url,{onProgress=()=>{}}={})=>{
    if(session){
      const state=await inspect();
      if(state.state!=='closed'&&state.state!=='failed'){
        await safeCall(()=>session.page?.bringToFront?.());
        onProgress({stage:'KDocs登录',message:state.state==='ready'?'来源资料已登录，可以检测后同步':'来源资料登录窗口仍在等待扫码或账号登录'});
        return {...state,reused:true};
      }
      await close();
    }
    const launch=await launchOptions(),context=await launchPersistentContext(profile,{...launch,...kdocsBrowserContextOptions()});
    const page=activePage(context)||await context.newPage();
    const current={context,page,browserName:launch.browserName,state:'opening',reason:null,contextClosed:false};session=current;
    context.on?.('page',candidate=>attachPage(candidate,current));
    context.on?.('close',()=>{if(session===current){current.contextClosed=true;current.state='closed';current.reason='浏览器窗口已关闭';}});
    attachPage(page,current);
    try{await page.goto(url,{waitUntil:'commit',timeout:15_000});}
    catch(error){current.reason='登录页面尚未完全打开，请在来源资料窗口重试或稍候';}
    await safeCall(()=>current.page?.bringToFront?.());
    const state=await inspect();
    onProgress({stage:'KDocs登录',message:state.state==='ready'?'来源资料已登录，可以检测后同步':'已打开受控来源资料窗口，请完成账号登录或二维码扫描；二维码刷新不会关闭窗口'});
    return {...state,reused:false};
  };
  const openForCollection=async(profile,url,{onProgress=()=>{}}={})=>{
    let state=await inspect();
    if(state.state==='idle'||state.state==='closed'||state.state==='failed')state=await login(profile,url,{onProgress});
    if(state.state!=='ready')throw new AppError('请先在已打开的来源资料窗口完成登录，再点击“检测登录状态”。',{stage:'KDocs采集',code:'KDOCS_LOGIN_REQUIRED'});
    const current=session;onProgress({stage:'KDocs采集',message:'来源资料登录已确认，正在开始只读采集...'});
    await current.context.addInitScript(installLayoutProbe);
    // The user may have completed QR login before collection starts, so add the
    // probe to the already-open document as well as future navigations.
    await current.page.evaluate(installLayoutProbe);
    return {context:current.context,page:current.page,browserName:current.browserName};
  };
  return {login,status:inspect,close,openForCollection};
}

const workspace=createKdocsWorkspaceManager();
export const closeKdocsWorkspace=()=>workspace.close();
export const kdocsWorkspaceStatus=()=>workspace.status();
export const loginKdocs=(profile,url,options)=>workspace.login(profile,url,options);
export const openKdocs=(profile,url,options)=>workspace.openForCollection(profile,url,options);
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
