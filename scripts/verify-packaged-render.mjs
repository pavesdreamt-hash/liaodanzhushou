import path from 'node:path';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {LocalWebServer} from '../src/local-web-server.mjs';

const root=path.resolve('.');
const targetPage=process.env.VERIFY_PAGE||'workbench';
const output=path.join(root,'artifacts','packaged-service-ui',`${targetPage}.png`);
await mkdir(path.dirname(output),{recursive:true});
const server=new LocalWebServer({
  rendererDirectory:path.join(root,'renderer'),
  sourceDirectory:path.join(root,'src'),
  dispatch:async()=>({ok:true,data:{}})
});
let browser;
try{
  const url=new URL(await server.start());
  url.searchParams.set('page',targetPage);
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:Number(process.env.VERIFY_WIDTH)||1424,height:Number(process.env.VERIFY_HEIGHT)||912},deviceScaleFactor:1});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(url.href,{waitUntil:'domcontentloaded'});
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
    :await frame.locator('.cw-shell').evaluate(element=>{
      const shell=getComputedStyle(element);
      const sidebar=getComputedStyle(document.querySelector('.cw-sidebar'));
      const card=getComputedStyle(document.querySelector('.cw-panel'));
      return {display:shell.display,columns:shell.gridTemplateColumns,sidebarBackground:sidebar.backgroundColor,cardRadius:card.borderRadius,bodyOverflow:getComputedStyle(document.body).overflow};
    });
  if(targetPage==='order'){
    if(metrics.display!=='grid'||metrics.chatWidth<280||metrics.chatWidth>650||metrics.appBottom<metrics.viewport-9||metrics.navFont!=='15px')throw new Error(`订单详情比例未生效: ${JSON.stringify(metrics)}`);
  }else if(metrics.display!=='grid'||!metrics.columns.includes('154px')||metrics.cardRadius==='0px')throw new Error(`确认稿样式未生效: ${JSON.stringify(metrics)}`);
  if(errors.length)throw new Error(`页面错误: ${errors.join('; ')}`);
  await page.screenshot({path:output,fullPage:true});
  console.log(JSON.stringify({ok:true,output,metrics}));
}finally{
  await browser?.close();
  server.close();
}
