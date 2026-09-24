import test from 'node:test';
import assert from 'node:assert/strict';
import {_electron as electron} from 'playwright-core';
import electronPath from 'electron';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

test('desktop close hides the window and macOS activation restores it',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'liaodan-window-lifecycle-'));
  let application;
  try{
    application=await electron.launch({executablePath:electronPath,args:['.',`--orders-test-user-data=${path.join(directory,'data')}`],cwd:path.resolve('.'),env:{...process.env,NODE_ENV:'test'}});
    await application.firstWindow();
    await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].close());
    await new Promise(resolve=>setTimeout(resolve,450));
    const hiddenState=await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().map(window=>({destroyed:window.isDestroyed(),visible:window.isVisible()})));
    assert.deepEqual(hiddenState,[{destroyed:false,visible:false}],JSON.stringify(hiddenState));
    await new Promise(resolve=>setTimeout(resolve,550));
    await application.evaluate(({app})=>app.emit('activate'));
    for(let attempt=0;attempt<20;attempt++){
      if(await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0]?.isVisible()))break;
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    assert.equal(await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0]?.isVisible()),true);
  }finally{
    // This test verifies hide/restore, not the separate graceful-quit path.
    // Playwright's close waits on the hidden tray window, so stop only this isolated fixture first.
    try{application?.process()?.kill('SIGKILL');}catch{}
    await application?.close().catch(()=>{});
    await rm(directory,{recursive:true,force:true});
  }
});

test('graceful app quit completes instead of falling back to a hidden window',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'liaodan-window-quit-'));
  let application;
  try{
    application=await electron.launch({executablePath:electronPath,args:['.',`--orders-test-user-data=${path.join(directory,'data')}`],cwd:path.resolve('.'),env:{...process.env,NODE_ENV:'test'}});
    await application.firstWindow();
    const child=application.process();
    const exited=await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('菜单栏退出共用的安全退出流程未在 12 秒内结束')),12000);
      child.once('exit',(code,signal)=>{clearTimeout(timer);resolve({code,signal});});
      void application.evaluate(({app})=>app.quit()).catch(()=>{});
    });
    assert.equal(exited.signal,null,JSON.stringify(exited));
    assert.equal(exited.code,0,JSON.stringify(exited));
  }finally{
    try{application?.process()?.kill('SIGKILL');}catch{}
    await application?.close().catch(()=>{});
    await rm(directory,{recursive:true,force:true});
  }
});

test('menu bar open and quit callbacks restore then terminate an isolated app',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'liaodan-tray-quit-')),trayBounds=path.join(directory,'tray-bounds.json');
  let application;
  try{
    application=await electron.launch({executablePath:electronPath,args:['.',`--orders-test-user-data=${path.join(directory,'data')}`,'--orders-test-browser-workspace',`--orders-test-tray-bounds-file=${trayBounds}`],cwd:path.resolve('.'),env:{...process.env,NODE_ENV:'test'}});
    await application.firstWindow();
    const tray=await application.evaluate(({app})=>app.__liaodanTrayTest&&{labels:app.__liaodanTrayTest.labels});
    assert.deepEqual(tray?.labels,['打开管理页面','退出']);
    await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].close());
    await new Promise(resolve=>setTimeout(resolve,450));
    assert.deepEqual(await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().map(window=>({destroyed:window.isDestroyed(),visible:window.isVisible()}))),[{destroyed:false,visible:false}]);
    await application.evaluate(({app})=>app.__liaodanTrayTest.invoke('打开管理页面'));
    for(let attempt=0;attempt<20;attempt++){
      if(await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0]?.isVisible()))break;
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    assert.equal(await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0]?.isVisible()),true);
    await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].close());
    await new Promise(resolve=>setTimeout(resolve,450));
    const child=application.process();
    const exited=await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('菜单栏“退出”未在 12 秒内结束隔离应用')),12000);
      child.once('exit',(code,signal)=>{clearTimeout(timer);resolve({code,signal});});
      void application.evaluate(({app})=>app.__liaodanTrayTest.invoke('退出')).catch(()=>{});
    });
    assert.equal(exited.signal,null,JSON.stringify(exited));
    assert.equal(exited.code,0,JSON.stringify(exited));
  }finally{
    try{application?.process()?.kill('SIGKILL');}catch{}
    await application?.close().catch(()=>{});
    await rm(directory,{recursive:true,force:true});
  }
});
