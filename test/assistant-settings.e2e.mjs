import test from 'node:test';
import assert from 'node:assert/strict';
import {_electron as electron,chromium} from 'playwright-core';
import electronPath from 'electron';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('settings through the browser bridge: encrypted key, provider switch, restart, cancel, delete and responsive UI',async t=>{
  const step=message=>t.diagnostic(message);
  const directory=await mkdtemp(path.join(os.tmpdir(),'settings-ui-')),userData=path.join(directory,'user-data'),urlFile=path.join(directory,'url'),fixture=path.join(directory,'settings-fixture.json'),evidence=path.resolve(process.env.KDOCS_TEST_ARTIFACT_DIRECTORY||'artifacts/assistant-settings-8.6');
  const key='fictional-settings-e2e-key-86';let application,browser,page;let stderr='';const pageErrors=[];
  async function launch(){
    await rm(urlFile,{force:true});const packaged=process.env.KDOCS_TEST_EXECUTABLE;
    step('launch App');application=await electron.launch({timeout:20000,executablePath:packaged||electronPath,args:[...(packaged?[]:['.']),`--orders-test-user-data=${userData}`,'--orders-test-browser-workspace',`--orders-test-browser-url-file=${urlFile}`,`--orders-test-settings=${fixture}`],cwd:path.resolve('.'),env:{...process.env,NODE_ENV:'test'}});
    application.process().stderr.on('data',value=>{stderr+=value;});
    let url='';for(let i=0;i<150&&!url;i++){url=await readFile(urlFile,'utf8').catch(()=>'');if(!url)await new Promise(resolve=>setTimeout(resolve,100));}
    assert.ok(url);step('local browser URL ready');browser=await chromium.launch({headless:true});page=await browser.newPage({viewport:{width:1280,height:850}});page.setDefaultTimeout(30000);page.on('pageerror',e=>pageErrors.push(e.message));
    await page.goto(url+'#settings');await page.getByRole('heading',{name:'助手设置',exact:true}).waitFor();await page.waitForFunction(()=>!document.getElementById('assistant-settings-provider').disabled);
  }
  const state=()=>page.evaluate(async()=>{const result=await window.inventoryApp.assistantSettings.get();if(!result.ok)throw new Error(result.error.message);return result.data;});
  async function choose(provider){await page.locator('#assistant-settings-provider').selectOption(provider);await page.getByRole('button',{name:'保存设置',exact:true}).click();await page.getByText('设置已保存',{exact:true}).waitFor();}
  try{
    await mkdir(evidence,{recursive:true});await writeFile(fixture,JSON.stringify({key}));await launch();
    assert.equal(await page.locator('#assistant-settings-model').inputValue(),'deepseek-flash');assert.equal(await page.getByRole('button',{name:'测试连接（虚构资料）'}).isDisabled(),true);
    step('save fictional key');await page.getByRole('button',{name:'保存密钥',exact:true}).click();await page.getByText('密钥已加密保存，后续自动复用',{exact:true}).waitFor();
    await page.getByRole('button',{name:'重新检查安全存储',exact:true}).click();await page.waitForFunction(()=>!document.getElementById('assistant-settings-provider').disabled);assert.equal((await state()).secureStorageAvailable,true);assert.equal((await state()).providers.deepseek.hasApiKey,true);assert.equal(await page.locator('input[type="password"]').count(),0);assert.doesNotMatch(JSON.stringify(await state()),new RegExp(key));
    const encrypted=await readFile(path.join(userData,'config','assistant-settings.enc'));assert.equal(encrypted.includes(key),false);
    await page.getByRole('button',{name:'测试连接（虚构资料）'}).click();await page.getByText('模拟接口样本通过（未验证真实服务）',{exact:true}).waitFor();assert.equal((await state()).callsUsed,1);
    page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'开启日常使用',exact:true}).click();await page.getByText('调用模式已保存',{exact:true}).waitFor();assert.equal((await state()).usageMode,'daily');assert.equal((await state()).callsUsed,1);await page.getByRole('button',{name:'暂停日常使用',exact:true}).click();await page.getByText('调用模式已保存',{exact:true}).waitFor();assert.equal((await state()).usageMode,'verification');
    await page.screenshot({path:path.join(evidence,'settings-1280x850.png'),fullPage:true});
    await choose('openai');assert.equal(await page.locator('#assistant-settings-key-state').textContent(),'尚未保存');assert.equal(await page.locator('#assistant-settings-model').inputValue(),'');
    await page.locator('#assistant-settings-model').fill('gpt-fictional');await page.getByRole('button',{name:'保存设置',exact:true}).click();await page.getByText('设置已保存',{exact:true}).waitFor();
    step('save fictional key');await page.getByRole('button',{name:'保存密钥',exact:true}).click();await page.getByText('密钥已加密保存，后续自动复用',{exact:true}).waitFor();
    await choose('deepseek');assert.equal(await page.locator('#assistant-settings-model').inputValue(),'deepseek-flash');
    await page.setViewportSize({width:900,height:700});await page.screenshot({path:path.join(evidence,'settings-900x700.png'),fullPage:true});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.getByRole('button',{name:'测试连接（虚构资料）'}).scrollIntoViewIfNeeded();assert.equal(await page.getByRole('button',{name:'测试连接（虚构资料）'}).isVisible(),true);
    await page.locator('.app-nav').getByRole('button',{name:'订单管理',exact:true}).click();await page.getByRole('button',{name:'新建订单',exact:true}).click();await page.getByRole('heading',{name:'草稿 #1',exact:true}).waitFor();
    const draftName=page.locator('.draft-editor input').first();await draftName.fill('Unsaved Fictional Name');
    await page.locator('.app-nav').getByRole('button',{name:'助手设置',exact:true}).click();await page.waitForFunction(()=>!document.getElementById('assistant-settings-provider').disabled);
    await page.locator('.app-nav').getByRole('button',{name:'订单管理',exact:true}).click();await page.getByRole('heading',{name:'草稿 #1',exact:true}).waitFor();assert.equal(await draftName.inputValue(),'Unsaved Fictional Name');
    step('restart App');await browser.close();browser=null;await application.close();application=null;
    await writeFile(fixture,JSON.stringify({key:null}));await launch();
    const restored=await state();assert.equal(restored.providers.deepseek.hasApiKey,true);assert.equal(restored.providers.openai.hasApiKey,true);assert.equal(restored.providers.openai.model,'gpt-fictional');assert.equal(restored.callsUsed,1);
    await page.getByRole('button',{name:'更换密钥',exact:true}).click();await page.getByText('已取消，原有密钥未修改',{exact:true}).waitFor();assert.equal((await state()).providers.deepseek.hasApiKey,true);
    page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'删除密钥',exact:true}).click();await page.getByText('密钥已删除',{exact:true}).waitFor();
    assert.equal((await state()).providers.deepseek.hasApiKey,false);assert.equal((await state()).providers.openai.hasApiKey,true);
    const denied=await page.evaluate(async()=>{const s=await window.inventoryApp.assistantSettings.get();return window.inventoryApp.assistantSettings.save({provider:'deepseek',revision:s.data.revision,model:'deepseek-flash',apiKey:'fictional-secret-in-renderer'});});assert.equal(denied.ok,false);
    assert.equal(stderr.includes(key),false);assert.deepEqual(pageErrors,[]);
  }catch(error){step('failure: '+error.message.split('\n')[0]);if(page)step('settings state: '+await page.locator('#assistant-settings-message').textContent().catch(()=>''));throw error;}finally{step('cleanup');await browser?.close();if(application){let timer;try{await Promise.race([application.close(),new Promise(resolve=>{timer=setTimeout(()=>{application.process().kill('SIGKILL');step('closed pending authorization process after cleanup timeout');resolve();},5000);})]);}finally{clearTimeout(timer);}}await rm(directory,{recursive:true,force:true});}
});
