import test from 'node:test';
import assert from 'node:assert/strict';
import {_electron as electron,chromium} from 'playwright-core';
import {mkdtemp,writeFile,readFile,rm,mkdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('packaged settings: waiting for OS authorization must not block order operations',async()=>{
  assert.ok(process.env.KDOCS_TEST_EXECUTABLE);
  const dir=await mkdtemp(path.join(os.tmpdir(),'settings-permission-')),urlFile=path.join(dir,'url'),fixture=path.join(dir,'fixture.json'),out=path.resolve(process.env.KDOCS_TEST_ARTIFACT_DIRECTORY||'artifacts/assistant-settings-8.6');
  let application,browser;
  try{
    await mkdir(out,{recursive:true});await writeFile(fixture,JSON.stringify({key:null}));
    application=await electron.launch({timeout:20000,executablePath:process.env.KDOCS_TEST_EXECUTABLE,args:[`--orders-test-user-data=${path.join(dir,'user-data')}`,'--orders-test-browser-workspace',`--orders-test-browser-url-file=${urlFile}`,`--orders-test-settings=${fixture}`],env:{...process.env,NODE_ENV:'test'}});
    let url='';for(let i=0;i<150&&!url;i++){url=await readFile(urlFile,'utf8').catch(()=>'');if(!url)await new Promise(r=>setTimeout(r,100));}assert.ok(url);
    browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1280,height:850}});page.setDefaultTimeout(10000);
    await page.goto(url+'#settings');await page.getByRole('button',{name:'保存密钥',exact:true}).waitFor();
    await page.waitForFunction(()=>!document.getElementById('assistant-settings-key').disabled);
    await page.screenshot({path:path.join(out,'packaged-settings-before-key.png'),fullPage:true});
    await page.getByRole('button',{name:'保存密钥',exact:true}).click();
    await page.locator('.app-nav').getByRole('button',{name:'订单管理',exact:true}).click();await page.getByRole('button',{name:'新建订单',exact:true}).click();
    await page.getByRole('heading',{name:'草稿 #1',exact:true}).waitFor();
    await page.screenshot({path:path.join(out,'order-during-keychain-wait.png'),fullPage:true});
    await page.waitForTimeout(21000);
    await page.locator('.app-nav').getByRole('button',{name:'助手设置',exact:true}).click();
    await page.waitForFunction(()=>!document.getElementById('assistant-settings-provider').disabled);
    const state=await page.evaluate(async()=>(await window.inventoryApp.assistantSettings.get()).data);
    assert.equal(state.providers.deepseek.hasApiKey,false);
    await writeFile(path.join(out,'packaged-keychain-availability.json'),JSON.stringify({orderOperationsWhileAwaitingAuthorization:'PASS',secureStorageAvailable:state.secureStorageAvailable,realCredentialUsed:false,apiCalls:state.callsUsed,nativeKeyInput:'not executed; fixture cancels after availability',encryptedPersistence:'separate test requires successful OS authorization'},null,2));
  }finally{
    await browser?.close();if(application){let timer;try{await Promise.race([application.close(),new Promise(resolve=>{timer=setTimeout(()=>{application.process().kill('SIGKILL');resolve();},5000);})]);}finally{clearTimeout(timer);}}
    await rm(dir,{recursive:true,force:true});
  }
});
