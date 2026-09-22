import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {orderDatabasePath} from '../src/orders/database.mjs';
import {_electron as electron,chromium} from 'playwright-core';
import {mkdtemp,readFile,readdir,rm,mkdir} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

test('packaged production startup and activation open a usable dashboard',async()=>{
  assert.ok(process.env.KDOCS_TEST_EXECUTABLE);
  const dir=await mkdtemp(path.join(os.tmpdir(),'kdocs-production-startup-'));
  let application,browser;let stderr='';
  try{
    application=await electron.launch({executablePath:process.env.KDOCS_TEST_EXECUTABLE,args:[`--isolated-user-data=${dir}`],env:{...process.env,NODE_ENV:'production'}});
    application.process().stderr.on('data',data=>{stderr+=data;});
    await application.evaluate(({app})=>{app.emit('activate');app.emit('second-instance');});
    let entries=[];
    for(let i=0;i<200;i++){
      const files=await readdir(path.join(dir,'logs')).catch(()=>[]);
      entries=(await Promise.all(files.filter(f=>f.startsWith('startup-')).map(f=>readFile(path.join(dir,'logs',f),'utf8')))).join('\n').split('\n').filter(Boolean).flatMap(line=>{try{return [JSON.parse(line)];}catch{return [];}});
      if(entries.some(e=>e.message==='已在默认浏览器打开管理页面'))break;
      await new Promise(r=>setTimeout(r,100));
    }
    assert.ok(entries.some(e=>e.message==='应用启动完成'));
    const port=entries.find(e=>e.message==='本地管理页面已启动')?.metrics.port;
    assert.ok(port);assert.notEqual(port,43875);
    const token=(await readFile(path.join(dir,'local-web-token'),'utf8')).trim();
    const identity=await application.evaluate(({app})=>({version:app.getVersion(),packaged:app.isPackaged,userData:app.getPath('userData')}));
    assert.deepEqual(identity,{version:JSON.parse(await readFile('package.json','utf8')).version,packaged:true,userData:dir});
    browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:900,height:700}});
    await page.goto(`http://127.0.0.1:${port}/?token=${token}`);
    await page.getByRole('button',{name:'订单管理',exact:true}).click();
    await page.getByRole('button',{name:'新建订单',exact:true}).click();
    await page.getByRole('heading',{name:'草稿 #1',exact:true}).waitFor();
    await page.getByRole('button',{name:'订单助手',exact:true}).click();
    await page.locator('.assistant-binding-summary').filter({hasText:'自动消息连接尚未启动'}).waitFor();assert.equal(await page.getByRole('button',{name:'刷新聊天',exact:true}).isDisabled(),true);
    const artifactDirectory=process.env.KDOCS_TEST_ARTIFACT_DIRECTORY||'artifacts/startup-7.8';
    await mkdir(artifactDirectory,{recursive:true});
    await page.screenshot({path:path.join(artifactDirectory,'production-isolated-dashboard.png')});
    await page.getByText('聊天关联',{exact:true}).click();
    await page.getByLabel('客户 WhatsApp 电话').waitFor();assert.equal(await page.locator('[aria-label="WhatsApp 自动消息连接"]').count(),0);
    assert.equal(await page.getByLabel('账号标识',{exact:true}).isVisible(),false);
    assert.equal(await page.getByLabel('稳定聊天标识',{exact:true}).isVisible(),false);
    assert.equal(await page.getByLabel('本单开始时间',{exact:true}).inputValue(),'');
    assert.equal(await page.getByLabel('自动接收到最新',{exact:true}).isChecked(),true);
    assert.equal(await page.getByLabel('本单结束时间',{exact:true}).isVisible(),false);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.locator('.order-assistant').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(artifactDirectory,'packaged-browser-assistant-range-900x700.png'),fullPage:true});
    await page.getByText('聊天关联',{exact:true}).click();await page.getByLabel('英文草稿 · 可编辑').fill('Fictional browser reply saved on App quit');const closed=application.waitForEvent('close');await application.evaluate(({app})=>{setTimeout(()=>app.quit(),0);});await closed;application=null;const db=new DatabaseSync(orderDatabasePath(dir));try{assert.equal(JSON.parse(db.prepare('SELECT payload FROM order_assistant_workspace').get().payload).draft,'Fictional browser reply saved on App quit');}finally{db.close();}
    assert.doesNotMatch(stderr,/本地管理页面尚未就绪|无法打开管理页面|未捕获错误|启动失败/);
  }finally{await browser?.close();await application?.close();await rm(dir,{recursive:true,force:true});}
});
