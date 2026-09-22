import assert from 'node:assert/strict';import path from 'node:path';import {mkdir,writeFile} from 'node:fs/promises';import {chromium} from 'playwright-core';import {LocalWebServer} from '../src/local-web-server.mjs';
const output=path.resolve('artifacts/manual-translation-1.0.8');await mkdir(output,{recursive:true});const server=new LocalWebServer({rendererDirectory:path.resolve('renderer'),sourceDirectory:path.resolve('src'),dispatch:async()=>({ok:true,data:{}})});let browser;const errors=[];
try{
 const url=new URL(await server.start());browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{if(window!==top)return;window.translationCalls=[];window.manualReplyTranslation={request:async request=>{
  window.translationCalls.push(request);if(request.action==='translate')return new Promise(resolve=>window.finishTranslation=resolve);
  return {ok:true,data:{revision:0,activeProvider:'deepseek',usageMode:'verification',providers:{deepseek:{label:'DeepSeek',model:'fictional-model',hasApiKey:true}}}};
 }};});
 const f=()=>page.frameLocator('iframe'),go=async name=>{url.searchParams.set('page',name);await page.goto(url.href);await f().locator('[data-layout-ready=true]').waitFor();};
 const resolve=async result=>{await page.evaluate(result=>window.finishTranslation(result),result);await f().locator('#od-convert').waitFor({state:'visible'});await page.waitForFunction(()=>document.querySelector('iframe').contentDocument.querySelector('#od-convert').disabled===false);};
 const translated={ok:true,data:{text:'Thank you for your support.',chinese:'感谢你的支持。'}};
 for(const name of ['order','workbench']){
  await go(name);assert.equal(await page.evaluate(()=>window.translationCalls.length),0);
  await f().locator('#od-convert').click();assert.equal(await page.evaluate(()=>window.translationCalls.length),0);
  await f().locator('#od-chinese').fill('感谢你的支持');await f().locator('#od-convert').click();assert(await f().locator('#od-convert').isDisabled());assert.equal(await page.evaluate(()=>window.translationCalls.length),1);await resolve(translated);
  assert.equal(await f().locator('#od-english').inputValue(),translated.data.text);assert((await f().locator('.od-retranslation').textContent()).includes('感谢你的支持'));await f().locator('#od-send-preview').click();assert.equal(await f().locator('.reply-preview-text').textContent(),translated.data.text);await f().getByRole('button',{name:'关闭',exact:true}).click();
  await f().locator('#od-convert').click();await f().locator('#od-chinese').fill('新的草稿');await resolve({ok:true,data:{text:'Old result',chinese:'过时结果'}});assert.equal(await f().locator('#od-english').inputValue(),translated.data.text);assert((await f().locator('.reply-state').textContent()).includes('未覆盖'));
  await f().locator('#od-convert').click();await resolve({ok:false,error:'模拟网络失败'});assert.equal(await f().locator('#od-chinese').inputValue(),'新的草稿');assert.equal(await f().locator('#od-english').inputValue(),translated.data.text);assert((await f().locator('.reply-state').textContent()).includes('原稿已保留'));
  await f().locator('#od-convert').click();await f().locator('#od-english').fill('Edited manually');await resolve(translated);assert.equal(await f().locator('#od-english').inputValue(),'Edited manually');
  await f().locator('#od-chinese').fill('感谢你的支持');await f().locator('#od-convert').click();await resolve(translated);
  await f().locator('#od-convert').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,`${name}-translation.png`)});
  await f().getByRole('button',{name:'翻译服务设置',exact:true}).click();await f().locator('[data-model]').waitFor();assert.equal(await f().locator('input[type=password]').count(),0);await f().getByRole('button',{name:'关闭',exact:true}).click();
 }
 await f().locator('#od-convert').click();await f().locator('.cw-task-row').nth(1).click();await resolve(translated);assert.equal(await f().locator('#od-english').inputValue(),'');
 assert.deepEqual(errors,[]);await writeFile(path.join(output,'browser-verification.json'),JSON.stringify({ok:true,checks:['both chat pages','no automatic requests','Chinese to English and Chinese comparison','preview uses translated draft','loading/duplicate guard','stale Chinese/English response discarded','failure keeps draft','customer switch isolation','settings no plaintext key'],errors},null,2));console.log('Manual translation browser checks passed');
}finally{await browser?.close();server.close();}
