import {_electron as electron} from 'playwright-core';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const executable=process.env.KDOCS_TEST_EXECUTABLE;
if(!executable)throw new Error('请设置 KDOCS_TEST_EXECUTABLE 为最终 ZIP 解压 App 的可执行文件路径');
const output=path.resolve(process.env.UI_CAPTURE_DIR||'artifacts/restored-capture');
const profile=await mkdtemp(path.join(os.tmpdir(),'liaodan-restored-capture-'));
let app;
try{
 await mkdir(output,{recursive:true});
 app=await electron.launch({executablePath:executable,args:[`--isolated-user-data=${profile}`],env:{...process.env,NODE_ENV:'production'}});
 const page=await app.firstWindow();
 await page.waitForURL(/^http:\/\/127\.0\.0\.1:/);
 for(const [width,height] of [[1280,820],[1440,1000]]){
  await app.evaluate(({BrowserWindow},size)=>BrowserWindow.getAllWindows()[0].setContentSize(size.width,size.height),{width,height});
  for(const route of ['inventory','profit','assistant','settings','product','profit-detail']){
   const url=new URL(page.url());url.searchParams.set('page',route);await page.goto(url.href);
   const frame=page.frameLocator('iframe.confirmed-frame');
   await frame.locator('.live-page-status').waitFor();
   await page.screenshot({path:path.join(output,`${route}-${width}x${height}.png`)});
  }
 }
 console.log(output);
}finally{await app?.close().catch(()=>{});await rm(profile,{recursive:true,force:true});}
