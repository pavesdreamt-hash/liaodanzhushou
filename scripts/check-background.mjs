// Development checks only: never import Electron or the production bootstrap.
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile,access} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const args=process.argv.slice(2),tests=[];
let pageName=null,check=true;
for(let index=0;index<args.length;index++){
  const arg=args[index];
  if(arg==='--help'){
    console.log('node scripts/check-background.mjs [test/name.test.mjs ...] [--page fb-chat|inventory] [--skip-check]\n默认执行类型与共享模块检查；指定测试只运行 .test.mjs；可选页面截图使用无窗口 Chromium 和空白虚构服务，不启动 Electron。');
    process.exit(0);
  }
  if(arg==='--skip-check'){check=false;continue;}
  if(arg==='--page'){
    pageName=args[++index];
    if(!['fb-chat','inventory'].includes(pageName))throw new Error('后台页面检查只支持 fb-chat 或 inventory；其它页面请扩展明确的虚构资料适配器。');
    continue;
  }
  const resolved=path.resolve(root,arg);
  if(!resolved.startsWith(path.join(root,'test')+path.sep)||!arg.endsWith('.test.mjs'))throw new Error('后台入口只接受项目 test 目录中的 .test.mjs；桌面 .e2e.mjs 需另行安排，不自动弹窗。');
  await access(resolved);tests.push(resolved);
}
if(!check&&!tests.length&&!pageName)throw new Error('请至少选择一项检查。');

const run=argv=>new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,argv,{cwd:root,env:{...process.env,NODE_ENV:'test'},stdio:'inherit'});
  const stop=()=>child.kill('SIGTERM');
  process.once('SIGINT',stop);process.once('SIGTERM',stop);
  const cleanup=()=>{process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);};
  child.once('error',error=>{cleanup();reject(error);});
  child.once('exit',(code,signal)=>{cleanup();code===0?resolve():reject(new Error(`后台检查失败（${signal||code}）；不会自动启动或重启桌面 App。`));});
});
if(check){
  await run(['node_modules/typescript/bin/tsc','--noEmit']);
  await run(['scripts/build-shared.mjs','--check']);
}
if(tests.length)await run(['--test','--test-concurrency=1','--test-timeout=30000',...tests]);

if(pageName){
  const {chromium}=await import('playwright-core');
  const {LocalWebServer}=await import('../src/local-web-server.mjs');
  // No live adapters, saved configuration, accounts, keys, or business database.
  const fixtures={
    'app:status':{google:{connected:false},source:{},target:{},local:{}},
    'orders:shopplus-product-catalog':{catalog:{products:[],archivedProducts:[],mappingCatalog:[],dailyPending:[]},sourceChanges:null,status:{configured:false}},
    'inventory:local':{latestCollection:null,current:null,history:[]},
    'source:changes':null,
    'mapping:status':{rows:[]},
    'orders:summary':{total:0,counts:{}},
    'orders:list':{items:[],total:0},
    'orders:assistantConnection':{status:'offline'},
    'assistant-settings:get':{configured:false,providers:{},usageMode:'manual'}
  };
  const calls=[];
  const server=new LocalWebServer({rendererDirectory:path.join(root,'renderer'),sourceDirectory:path.join(root,'src'),dispatch:async channel=>{
    calls.push(channel);
    return Object.hasOwn(fixtures,channel)?{ok:true,data:structuredClone(fixtures[channel])}:{ok:false,error:{message:'后台虚构预览未提供此操作；未连接正式服务。',code:'BACKGROUND_FIXTURE_ONLY'}};
  }});
  const output=path.join(root,'artifacts','background-check',`${Date.now()}-${pageName}`);
  let browser;
  try{
    const executablePath=chromium.executablePath();
    await access(executablePath); // Missing runtime is an error, never a headed fallback.
    const url=new URL(await server.start());url.searchParams.set('page',pageName);
    browser=await chromium.launch({headless:true});
    const context=await browser.newContext({viewport:{width:1280,height:820},serviceWorkers:'block'});
    const blocked=[];
    await context.route('**/*',route=>{
      const target=new URL(route.request().url());
      if(target.origin===url.origin||['data:','about:'].includes(target.protocol))return route.continue();
      blocked.push(target.origin);return route.abort();
    });
    const page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(url.href,{waitUntil:'domcontentloaded'});
    const frame=page.frameLocator('iframe.confirmed-frame');
    await frame.locator(pageName==='fb-chat'?'#fb-chat-page':'#ui011-inventory').waitFor({state:'visible',timeout:15000});
    await frame.locator('body').evaluate(async()=>{await document.fonts.ready;});
    await mkdir(output,{recursive:true});
    for(const [width,height] of [[1280,820],[820,640]]){
      await page.setViewportSize({width,height});
      await page.screenshot({path:path.join(output,`${width}x${height}.png`)});
    }
    if(errors.length)throw new Error(`后台页面错误：${errors.join('；')}`);
    const version=JSON.parse(await readFile(path.join(root,'package.json'),'utf8')).version;
    const report={result:'PASS-HEADLESS-PREVIEW',version,page:pageName,electronLaunched:false,fixtureOnly:true,liveAdapters:false,calls,externalRequestsBlocked:blocked,errors,scope:'当前已构建网页的空白状态和截图；不代表桌面IPC、正式资料或最终App验收。'};
    await writeFile(path.join(output,'result.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify({result:report.result,output,scope:report.scope}));
  }finally{await browser?.close();server.close();}
}
console.log('后台检查完成；未启动桌面 App。');
