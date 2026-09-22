import path from 'node:path';
import os from 'node:os';
import {readFile,mkdtemp,mkdir,rm} from 'node:fs/promises';
import {_electron as electron} from 'playwright-core';

const root=path.resolve('.');
const pkg=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
const targetPage=process.env.VERIFY_PAGE||'workbench';
const appPath=path.join(root,'dist','mac',`聊单助手 ${pkg.version}.app`);
const executable=path.join(appPath,'Contents','MacOS',`聊单助手 ${pkg.version}`);
const temporary=await mkdtemp(path.join(os.tmpdir(),`liaodan-${pkg.version}-render-`));
const output=path.join(root,'artifacts','packaged-app-ui',`${targetPage}-${pkg.version}.png`);
await mkdir(path.dirname(output),{recursive:true});
let application;
try{
  application=await electron.launch({
    executablePath:executable,
    args:[`--isolated-user-data=${path.join(temporary,'data')}`],
    cwd:path.dirname(appPath),
    env:{...process.env,NODE_ENV:'production'}
  });
  let page=await application.firstWindow({timeout:60000});
  if(process.env.VERIFY_WIDTH||process.env.VERIFY_HEIGHT){
    const width=Number(process.env.VERIFY_WIDTH)||1424,height=Number(process.env.VERIFY_HEIGHT)||1082;
    await application.evaluate(({BrowserWindow},size)=>BrowserWindow.getAllWindows()[0]?.setContentSize(size.width,size.height),{width,height});
    await page.waitForTimeout(250);
  }
  if(targetPage!=='workbench'){
    const url=new URL(page.url());url.searchParams.set('page',targetPage);
    await page.goto(url.href,{waitUntil:'domcontentloaded'});
  }
  const frame=page.frameLocator('iframe.confirmed-frame');
  const metrics=targetPage==='order'
    ?await frame.locator('.od-shell').evaluate(element=>({
      display:getComputedStyle(element).display,
      columns:getComputedStyle(element).gridTemplateColumns,
      layout:getComputedStyle(document.querySelector('.od-layout')).gridTemplateColumns,
      chatWidth:document.querySelector('.od-chat-column').getBoundingClientRect().width,
      appBottom:document.querySelector('.od-app').getBoundingClientRect().bottom,
      viewport:innerHeight,
      navFont:getComputedStyle(document.querySelector('.od-nav-item')).fontSize
    }))
    :await frame.locator('.cw-shell').evaluate(element=>({
      display:getComputedStyle(element).display,
      columns:getComputedStyle(element).gridTemplateColumns,
      cardRadius:getComputedStyle(document.querySelector('.cw-panel')).borderRadius,
      title:getComputedStyle(document.querySelector('.cw-heading h1')).fontSize
    }));
  if(targetPage==='order'){
    if(metrics.display!=='grid'||metrics.chatWidth<280||metrics.chatWidth>650||metrics.navFont!=='15px')throw new Error(`打包 App 订单比例未生效: ${JSON.stringify(metrics)}`);
  }else if(metrics.display!=='grid'||!metrics.columns.includes('154px')||metrics.cardRadius==='0px')throw new Error(`打包 App 样式未生效: ${JSON.stringify(metrics)}`);
  const identity=await application.evaluate(({app})=>({packaged:app.isPackaged,version:app.getVersion()}));
  if(!identity.packaged||identity.version!==pkg.version)throw new Error(`打包身份错误: ${JSON.stringify(identity)}`);
  await page.screenshot({path:output,fullPage:true});
  console.log(JSON.stringify({ok:true,identity,metrics,output}));
}finally{
  await application?.close().catch(()=>{});
  await rm(temporary,{recursive:true,force:true});
}
