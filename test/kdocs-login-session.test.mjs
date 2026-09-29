import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createKdocsWorkspaceManager} from '../src/source/browser.mjs';

class FictionalPage extends EventEmitter {
  constructor({canvas=false}={}){super();this.canvas=canvas;this.closed=false;this.gotoCalls=[];this.fronted=0;}
  isClosed(){return this.closed;}
  async goto(url,options){this.gotoCalls.push({url,options});}
  async bringToFront(){this.fronted++;}
  async evaluate(){return undefined;}
  locator(selector){return {isVisible:async()=>selector==='#et_canvas'&&this.canvas};}
  close(){if(this.closed)return;this.closed=true;this.emit('close');}
}

class FictionalContext extends EventEmitter {
  constructor(page){super();this.pageList=[page];this.closed=false;this.initScripts=0;}
  pages(){return this.pageList;}
  async newPage(){const page=new FictionalPage();this.pageList.push(page);return page;}
  async addInitScript(){this.initScripts++;}
  async close(){if(this.closed)return;this.closed=true;for(const page of this.pageList)page.close();this.emit('close');}
  addPage(page){this.pageList.push(page);this.emit('page',page);}
}

function fixture(){
  const contexts=[];
  const manager=createKdocsWorkspaceManager({
    launchOptions:async()=>({executablePath:'/fictional/chrome',browserName:'虚构 Chrome'}),
    launchPersistentContext:async()=>{const context=new FictionalContext(new FictionalPage());contexts.push(context);return context;}
  });
  return {manager,contexts};
}

test('KDocs二维码登录页保持打开，刷新期间不被采集超时关闭',async()=>{
  const {manager,contexts}=fixture(),opened=await manager.login('/fictional/profile','https://kdocs.example/login');
  assert.equal(opened.state,'awaiting_login');assert.equal(opened.keptOpen,true);assert.equal(contexts[0].closed,false);
  const waiting=await manager.status();assert.equal(waiting.state,'awaiting_login');assert.equal(contexts[0].closed,false,'二维码页面不是失败，不能关闭浏览器');
  contexts[0].pages()[0].canvas=true;
  const ready=await manager.status();assert.equal(ready.state,'ready');assert.equal(ready.keptOpen,true);
});

test('KDocs登录打开新标签页后，检测与只读采集使用新页面',async()=>{
  const {manager,contexts}=fixture();await manager.login('/fictional/profile','https://kdocs.example/login');
  const loginPage=contexts[0].pages()[0],documentPage=new FictionalPage({canvas:true});contexts[0].addPage(documentPage);loginPage.close();
  assert.equal((await manager.status()).state,'ready');
  const collection=await manager.openForCollection('/fictional/profile','https://kdocs.example/login');
  assert.equal(collection.page,documentPage);assert.equal(contexts[0].initScripts,1);
});

test('未完成登录的同步被拦截但保留二维码窗口，关闭后可重新打开',async()=>{
  const {manager,contexts}=fixture();await manager.login('/fictional/profile','https://kdocs.example/login');
  await assert.rejects(()=>manager.openForCollection('/fictional/profile','https://kdocs.example/login'),error=>error.code==='KDOCS_LOGIN_REQUIRED');
  assert.equal(contexts[0].closed,false,'同步前置检查不能关闭等待扫码窗口');
  contexts[0].pages()[0].close();assert.equal((await manager.status()).state,'closed');
  const reopened=await manager.login('/fictional/profile','https://kdocs.example/login');
  assert.equal(reopened.state,'awaiting_login');assert.equal(contexts.length,2,'用户重新打开登录时才创建新窗口');
});
