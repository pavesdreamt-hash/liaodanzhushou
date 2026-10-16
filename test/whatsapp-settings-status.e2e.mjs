import test from 'node:test';
import assert from 'node:assert/strict';
import {_electron as electron} from 'playwright-core';
import electronPath from 'electron';
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('WhatsApp设置实际在线颜色、登录方式、时间、状态变化和失败恢复；零真实外部调用',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'wa-settings-status-'));
  const data=path.join(root,'data'),fixture=path.join(root,'settings.json');
  const artifacts=path.resolve(process.env.KDOCS_WHATSAPP_STATUS_ARTIFACTS||'artifacts/whatsapp-status-3.6.1/source');
  const version=JSON.parse(await readFile('package.json','utf8')).version;
  const executable=process.env.KDOCS_TEST_EXECUTABLE;let application;
  try{
    await mkdir(artifacts,{recursive:true});await writeFile(fixture,JSON.stringify({key:null}));
    application=await electron.launch({executablePath:executable||electronPath,args:[...(executable?[]:['.']),`--orders-test-user-data=${data}`,`--isolated-user-data=${data}`,`--orders-test-settings=${fixture}`],cwd:path.resolve('.'),env:{...process.env,NODE_ENV:'test'}});
    const page=await application.firstWindow({timeout:30000});page.setDefaultTimeout(15000);
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    const runtime=await application.evaluate(({app,ipcMain},data)=>{
      globalThis.__waSettingsState={provider:'whatsapp-web.js',status:'online',message:'自动消息连接在线（虚构）',accountId:'wa-phone:971500000500',lastConnectedAt:'2026-10-16T07:12:17.571Z'};
      globalThis.__waSettingsReads=0;globalThis.__waSettingsOpen=0;globalThis.__waSettingsExternal=[];globalThis.__waSettingsHeld=[];
      const replace=(channel,operation)=>{ipcMain.removeHandler(channel);ipcMain.handle(channel,operation);};
      replace('orders:assistantConnection',async()=>{
        globalThis.__waSettingsReads++;
        if(globalThis.__waSettingsFail)return {ok:false,error:{message:'虚构状态读取失败'}};
        const snapshot={ok:true,data:{...globalThis.__waSettingsState}};
        if(globalThis.__waSettingsHoldNext){globalThis.__waSettingsHoldNext=false;return new Promise(resolve=>globalThis.__waSettingsHeld.push(()=>resolve(snapshot)));}
        return snapshot;
      });
      replace('orders:openWhatsApp',async()=>{globalThis.__waSettingsOpen++;return {ok:true,data:globalThis.__waSettingsState};});
      replace('orders:shopplus-status',async()=>({ok:true,data:{configured:false,test:null,productTest:null}}));
      for(const channel of ['source:sync-local','inventory:daily-source-sync','orders:sync-shopplus','orders:collect-shopplus-products','orders:refresh-shopplus-products','orders:update-shopplus-publish-status','orders:update-shopplus-variant-inventory','manual-chat:send'])replace(channel,async()=>{globalThis.__waSettingsExternal.push(channel);return {ok:false,error:{message:'此虚构场景禁止外部操作'}};});
      return {packaged:app.isPackaged,version:app.getVersion(),arch:process.arch,isolated:app.getPath('userData')===data};
    },data);
    assert.equal(runtime.isolated,true);assert.equal(runtime.version,version);if(executable){assert.equal(runtime.packaged,true);assert.equal(runtime.arch,'x64');}
    const frame=page.frameLocator('iframe.confirmed-frame');
    await frame.getByRole('button',{name:'连接与设置',exact:true}).click();await frame.locator('#ui036').waitFor();
    const card=frame.locator('#ui036 .card').filter({has:frame.locator('#u36-manage-wa')});
    const badge=card.locator('.card-head .status'),online=card.locator('.online'),meta=card.locator('.meta-grid b');
    const waitText=(locator,text)=>locator.filter({hasText:text}).waitFor();
    const color=()=>online.evaluate(node=>getComputedStyle(node).color);
    const fullTime=iso=>meta.nth(1).evaluate((_node,iso)=>new Date(iso).toLocaleString('zh-CN',{hour12:false}),iso);
    const notify=async(patch,extra={})=>application.evaluate(({BrowserWindow},{patch,extra})=>{
      Object.assign(globalThis.__waSettingsState,patch);Object.assign(globalThis,extra);
      for(const w of BrowserWindow.getAllWindows())w.webContents.send('app:assistant-changed',{orderIds:[]});
    },{patch,extra});
    await waitText(online,'● 在线');assert.equal(await color(),'rgb(22, 136, 101)');
    assert.equal(await badge.textContent(),'已登录');assert.equal(await card.locator('.account-main b').textContent(),'+971500000500');
    assert.equal(await meta.nth(0).textContent(),'网页登录');
    assert.equal(await meta.nth(1).getAttribute('title'),await fullTime('2026-10-16T07:12:17.571Z'));
    const expectedTime=await meta.nth(1).evaluate(()=>new Date('2026-10-16T07:12:17.571Z').toLocaleString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}));
    assert.equal(await meta.nth(1).textContent(),expectedTime);
    const sizes=[];
    for(const [width,height] of [[1280,820],[1440,1000],[820,640]]){
      await application.evaluate(({BrowserWindow},{width,height})=>BrowserWindow.getAllWindows()[0].setContentSize(width,height),{width,height});
      await card.scrollIntoViewIfNeeded();await page.mouse.move(0,0);await page.waitForTimeout(120);
      const layout=await card.evaluate(node=>{const box=node.getBoundingClientRect();return {width:box.width,height:box.height,clientWidth:node.clientWidth,scrollWidth:node.scrollWidth,viewport:{width:innerWidth,height:innerHeight},onlineColor:getComputedStyle(node.querySelector('.online')).color};});
      assert.ok(layout.scrollWidth<=layout.clientWidth,'WhatsApp卡在宽窄窗口不能横向溢出');sizes.push({requested:{width,height},...layout});
      await page.screenshot({path:path.join(artifacts,`online-${width}x${height}.png`)});
      await card.screenshot({path:path.join(artifacts,`online-card-${width}x${height}.png`)});
    }
    await notify({status:'authenticated',message:'已认证，正在准备消息连接（虚构）'});
    await waitText(badge,'已认证 · 连接中');assert.equal(await online.textContent(),'● 连接中');assert.equal(await color(),'rgb(182, 106, 29)');
    await notify({status:'reconnecting',message:'网络恢复中（虚构）'});await waitText(online,'● 重连中');assert.notEqual(await color(),'rgb(22, 136, 101)');
    await notify({status:'qr'});await waitText(online,'● 等待扫码');
    await notify({status:'disconnected'});await waitText(online,'● 未在线');assert.equal(await color(),'rgb(120, 114, 128)');
    assert.equal(await meta.nth(1).getAttribute('title'),await fullTime('2026-10-16T07:12:17.571Z'),'离线保留服务返回的上次连接时间');
    await notify({status:'online',lastConnectedAt:'invalid'});await waitText(meta.nth(1),'未记录');assert.equal(await color(),'rgb(22, 136, 101)');
    assert.equal(await meta.nth(1).getAttribute('title'),'');
    await notify({provider:'unknown',lastConnectedAt:null});await waitText(meta.nth(0),'未记录');assert.equal(await meta.nth(1).textContent(),'未记录');
    await notify({status:'error',message:'连接异常（虚构）'});await waitText(badge,'连接异常');assert.equal(await color(),'rgb(209, 75, 75)');
    await page.screenshot({path:path.join(artifacts,'connection-error.png')});
    await notify({}, {__waSettingsFail:true});await waitText(badge,'状态待核对');assert.notEqual(await color(),'rgb(22, 136, 101)');
    await application.evaluate(()=>{globalThis.__waSettingsFail=false;globalThis.__waSettingsState={provider:'whatsapp-web.js',status:'online',accountId:'wa-phone:971500000500',lastConnectedAt:'2026-10-16T08:00:00.000Z'};});
    await card.getByRole('button',{name:'检测连接',exact:true}).click();await waitText(online,'● 在线');
    assert.equal(await color(),'rgb(22, 136, 101)');assert.equal(await meta.nth(1).getAttribute('title'),await fullTime('2026-10-16T08:00:00.000Z'));
    await card.getByRole('button',{name:'管理登录',exact:true}).click();const dialog=frame.locator('.wa-login-dialog');
    await waitText(dialog.locator('.wa-login-account'),'+971500000500');assert.doesNotMatch(await dialog.textContent(),/wa-phone:/);
    await dialog.getByRole('button',{name:'关闭',exact:true}).click();await dialog.waitFor({state:'hidden'});
    await notify({status:'authenticated'},{__waSettingsHoldNext:true});
    for(let i=0;i<30;i++){if(await application.evaluate(()=>globalThis.__waSettingsHeld.length))break;await page.waitForTimeout(50);}
    assert.equal(await application.evaluate(()=>globalThis.__waSettingsHeld.length),1);
    await notify({status:'online',lastConnectedAt:'2026-10-16T09:00:00.000Z'});await waitText(online,'● 在线');
    await application.evaluate(()=>globalThis.__waSettingsHeld.shift()());await page.waitForTimeout(120);
    assert.equal(await badge.textContent(),'已登录');assert.equal(await color(),'rgb(22, 136, 101)');
    assert.equal(await meta.nth(1).getAttribute('title'),await fullTime('2026-10-16T09:00:00.000Z'),'旧响应不能覆盖较新的在线时间');
    await frame.getByRole('button',{name:'利润核算',exact:true}).click();await frame.locator('#ui036').waitFor({state:'detached'});await page.waitForTimeout(150);
    const readsBefore=await application.evaluate(()=>globalThis.__waSettingsReads);await notify({status:'disconnected'});await page.waitForTimeout(1000);
    assert.equal(await application.evaluate(()=>globalThis.__waSettingsReads),readsBefore,'离开设置页后不保留订阅或登录弹窗轮询');
    await frame.getByRole('button',{name:'连接与设置',exact:true}).click();await waitText(online,'● 未在线');assert.equal(await badge.textContent(),'未登录');
    const counts=await application.evaluate(()=>({statusReads:globalThis.__waSettingsReads,fictionalLoginOpens:globalThis.__waSettingsOpen,externalOperations:globalThis.__waSettingsExternal}));
    assert.equal(counts.fictionalLoginOpens,1);assert.deepEqual(counts.externalOperations,[]);assert.deepEqual(errors,[]);
    await writeFile(path.join(artifacts,'result.json'),JSON.stringify({runtime,sizes,onlineColorCorrect:true,metadataFromReturnedState:true,unknownMetadataNotInvented:true,connectionTransitions:true,failedReadClearsOnline:true,manualDetectionRecovers:true,oldResponseIgnored:true,subscriptionsDisposed:true,realChatReads:0,realExternalOperations:0,counts,errors},null,2));
  }finally{
    if(application){const process=application.process();await Promise.race([application.close().catch(()=>{}),new Promise(resolve=>setTimeout(resolve,3000))]);if(process.exitCode===null)process.kill('SIGKILL');}
    await rm(root,{recursive:true,force:true,maxRetries:3,retryDelay:150}).catch(()=>{});
  }
});
