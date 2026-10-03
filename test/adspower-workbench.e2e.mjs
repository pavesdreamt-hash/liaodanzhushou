import test from 'node:test';
import assert from 'node:assert/strict';
import {_electron as electron} from 'playwright-core';
import electronPath from 'electron';
import {mkdtemp,mkdir,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const sleep=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));
const expectedVersion=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8')).version;
const launchArguments=directory=>process.env.KDOCS_TEST_EXECUTABLE?[`--isolated-user-data=${directory}`,`--orders-test-user-data=${directory}`]:['.',`--isolated-user-data=${directory}`,`--orders-test-user-data=${directory}`];
const visualArtifactDirectory=process.env.KDOCS_VISUAL_ARTIFACT_DIR?path.resolve(process.env.KDOCS_VISUAL_ARTIFACT_DIR):null;
async function closeApplication(application,directory){try{if(application)await Promise.race([application.close(),sleep(4000)]);}catch{}try{application?.process().kill('SIGKILL');}catch{}await rm(directory,{recursive:true,force:true,maxRetries:3,retryDelay:150}).catch(()=>{});}

test('FB chat keeps scanning read-only, translates only when requested, and copies drafts without FB sending',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'adspower-workbench-'));let application;
 try{
  application=await electron.launch({executablePath:process.env.KDOCS_TEST_EXECUTABLE||electronPath,args:launchArguments(directory),cwd:path.resolve('.'),env:{...process.env,NODE_ENV:'test'}});
  const page=await application.firstWindow();await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0]?.setContentSize(1280,820));const pageErrors=[];page.on('pageerror',error=>pageErrors.push(error.message));
  await application.evaluate(({ipcMain})=>{
   globalThis.__adsPowerCalls=[];
   globalThis.__fbReplyCalls=[];
   ipcMain.removeHandler('adspower:scan');ipcMain.removeHandler('adspower:translate');ipcMain.removeHandler('adspower:clear');
   ipcMain.removeHandler('manual-reply-translation');
   ipcMain.handle('adspower:scan',async()=>{globalThis.__adsPowerCalls.push({action:'scan'});return {ok:true,data:{token:'fictional-scan-token',scannedAt:'2026-10-02T08:00:00.000Z',limits:{profiles:20,fragmentsPerProfile:20},profiles:[{profileId:'fictional-profile',label:'AdsPower 档案 1 · le-001',status:'scanned',detail:'仅读取当前已加载页面，不会切换客户对话或发送消息。',pages:[{pageId:'fictional-page',title:'Business Suite Inbox（虚构）',fragments:[{id:'fictional-row-1',text:'Hello, is this still available?'},{id:'fictional-row-2',text:'Can you deliver today?'}]}]}]}};});
   ipcMain.handle('adspower:translate',async(_event,payload)=>{globalThis.__adsPowerCalls.push({action:'translate',payload:structuredClone(payload)});return {ok:true,data:{translations:payload.messageIds.map(id=>({id,text:id==='fictional-row-1'?'中文：你好，还可以买吗？':'中文：今天可以配送吗？'}))}};});
   ipcMain.handle('adspower:clear',async(_event,payload)=>{globalThis.__adsPowerCalls.push({action:'clear',payload:structuredClone(payload)});return {ok:true,data:{cleared:true}};});
   ipcMain.handle('manual-reply-translation',async(_event,request)=>{globalThis.__fbReplyCalls.push(structuredClone(request));const text=request?.payload?.text||'';if(request?.action==='translate')return {ok:true,data:{text:`English translation: ${text}`,chinese:text}};if(request?.action==='fb-assist-draft')return {ok:true,data:{text:`AI draft: ${text}`,chinese:`已整理：${text}`,note:'未向 FB 发送内容。'}};return {ok:false,error:'测试不支持的回复操作'};});
  });
  const frame=page.frameLocator('iframe.confirmed-frame');
  await frame.locator('#chat-workbench-desktop').waitFor();await page.waitForTimeout(150);
  assert.equal(await frame.locator('.cwb-adspower-scan').count(),0,'WhatsApp workbench must not expose the FB scan action');
  await frame.getByRole('button',{name:'FB 聊天',exact:true}).click();
  const fbPage=frame.locator('#fb-chat-page');await fbPage.waitFor({state:'visible'});await page.waitForTimeout(150);
  assert.equal(await fbPage.locator('.fb-empty').count(),1,`FB workspace controller must be installed before scanning: ${pageErrors.join(' | ')}`);
  assert.equal(await fbPage.locator('.fb-version').innerText(),expectedVersion,'FB title bar must show the bundled current release version');
  assert.match(await fbPage.locator('.fb-page-head').innerText(),/Meta Business Suite Inbox/,'FB workspace must state that Business Suite Inbox is an eligible read-only source');
  assert.equal(await fbPage.locator('.cwb-send,.cwb-product,[data-open-order-detail]').count(),0,'FB workspace must not contain WhatsApp reply, product or order controls');
  assert.equal(await fbPage.locator('.fb-reply-workspace').count(),1,'FB has its own copy-only reply draft workspace');
  const replyLayout=await fbPage.evaluate(element=>{const workspace=element.querySelector('.fb-reply-workspace'),results=element.querySelector('.fb-results'),head=element.querySelector('.fb-reply-head'),tools=element.querySelector('.fb-reply-tools-row'),actions=element.querySelector('.fb-reply-assist-actions'),reference=element.querySelector('.fb-reference-scripts'),assist=element.querySelector('.fb-ai-assist'),grid=element.querySelector('.fb-reply-composer-grid'),cards=Array.from(element.querySelectorAll('.fb-reply-language-card'));if(!workspace||!results||!head||!tools||!actions||!reference||!assist||!grid||cards.length!==2)throw new Error('回复草稿确认布局不完整');const box=node=>node.getBoundingClientRect(),workspaceBox=box(workspace),resultsBox=box(results),headBox=box(head),toolsBox=box(tools),actionsBox=box(actions),referenceBox=box(reference),assistBox=box(assist),gridBox=box(grid),leftBox=box(cards[0]),rightBox=box(cards[1]),service=element.querySelector('.fb-reply-service-note');return {workspaceWidth:Math.round(workspaceBox.width),resultsWidth:Math.round(resultsBox.width),toolsBelowHead:Math.round(toolsBox.top)>=Math.round(headBox.bottom)-1,actionsInTools:actions.parentElement===tools,actionsAboveGrid:Math.round(actionsBox.bottom)<=Math.round(gridBox.top)+1,referenceBeforeAssist:Math.round(referenceBox.right)<=Math.round(assistBox.left)+1,gridColumns:getComputedStyle(grid).gridTemplateColumns.split(' ').length,leftWidth:Math.round(leftBox.width),rightWidth:Math.round(rightBox.width),serviceDisplay:service?getComputedStyle(service).display:'none',serviceHeight:service?Math.round(box(service).height):0};});
  assert.ok(Math.abs(replyLayout.workspaceWidth-replyLayout.resultsWidth)<=1&&replyLayout.toolsBelowHead&&replyLayout.actionsInTools&&replyLayout.actionsAboveGrid&&replyLayout.referenceBeforeAssist&&replyLayout.gridColumns===2&&Math.abs(replyLayout.leftWidth-replyLayout.rightWidth)<=1&&replyLayout.serviceDisplay==='flex'&&replyLayout.serviceHeight<=22,`FB 回复草稿必须与扫描档案同宽，并采用带“参考话术”的紧凑顶部工具栏和等宽双栏：${JSON.stringify(replyLayout)}`);
  await fbPage.getByRole('button',{name:'参考话术',exact:true}).click();
  const referenceDialog=fbPage.locator('[data-fb-reference-dialog]');await referenceDialog.waitFor({state:'visible'});
  assert.equal(await referenceDialog.locator('.fb-reference-content section').count(),5,'reference dialog must retain all five supplied script groups');
  assert.match(await referenceDialog.innerText(),/发大图/);assert.match(await referenceDialog.innerText(),/谈价格/);assert.match(await referenceDialog.innerText(),/成交/);
  assert.equal((await application.evaluate(()=>globalThis.__fbReplyCalls)).length,0,'viewing reference scripts must not call AI or translation');
  if(visualArtifactDirectory){await mkdir(visualArtifactDirectory,{recursive:true});await page.screenshot({path:path.join(visualArtifactDirectory,'adspower-reference-scripts-dialog.png'),fullPage:false});}
  await referenceDialog.getByRole('button',{name:'关闭',exact:true}).click();await referenceDialog.waitFor({state:'hidden'});
  const navToggleIcon=await fbPage.locator('.fb-nav-toggle svg').evaluate(icon=>{const bounds=icon.getBoundingClientRect();return {width:bounds.width,height:bounds.height,color:getComputedStyle(icon).color};});
  assert.ok(navToggleIcon.width>=16&&navToggleIcon.height>=16&&navToggleIcon.color!=='rgba(0, 0, 0, 0)',`FB navigation toggle icon must remain visible: ${JSON.stringify(navToggleIcon)}`);
  const headerGeometry=await fbPage.evaluate(element=>{const topbar=element.querySelector('.fb-topbar'),brand=element.querySelector('.fb-brand');if(!topbar||!brand)throw new Error('FB title bar is missing');const topbarBounds=topbar.getBoundingClientRect(),brandBounds=brand.getBoundingClientRect();return {topbarLeft:topbarBounds.left,topbarRight:topbarBounds.right,brandLeft:brandBounds.left,brandRight:brandBounds.right};});
  assert.ok(headerGeometry.brandLeft-headerGeometry.topbarLeft>=100,`FB brand must reserve a clear macOS traffic-light safety area: ${JSON.stringify(headerGeometry)}`);
  const dragBox=await page.locator('.fb-window-drag').boundingBox();assert.ok(dragBox&&dragBox.x>=96&&dragBox.height===56,`FB top blank area must have the shared 56px native draggable overlay: ${JSON.stringify(dragBox)}`);
  const dragMode=await page.locator('.fb-window-drag').evaluate(node=>getComputedStyle(node).getPropertyValue('-webkit-app-region'));
  assert.equal(dragMode,'drag','FB title blank must use Electron native drag instead of per-pointer IPC window movement');
  await fbPage.getByRole('button',{name:'折叠导航栏'}).click();assert.equal(await fbPage.evaluate(element=>element.classList.contains('up-nav-collapsed')),true,'FB navigation must use the shared collapsed state');
  assert.ok(await fbPage.locator('.fb-nav-toggle svg path').count()>0,'the collapsed FB navigation toggle must retain its visible icon');
  assert.equal(await fbPage.evaluate(()=>localStorage.getItem('liaodan-unified-nav-collapsed')),'true','FB navigation must write the common navigation preference');
  await frame.getByRole('button',{name:/^聊单工作台/}).click();await frame.locator('#chat-workbench-desktop').waitFor({state:'visible'});
  assert.equal(await frame.locator('#chat-workbench-desktop').evaluate(element=>element.classList.contains('is-nav-open')),false,'the chat workbench must read the same collapsed navigation preference');
  await frame.getByRole('button',{name:'FB 聊天',exact:true}).click();await fbPage.waitFor({state:'visible'});
  assert.equal(await fbPage.evaluate(element=>element.classList.contains('up-nav-collapsed')),true,'returning to FB must retain the common collapsed navigation preference');
  await fbPage.getByRole('button',{name:'展开导航栏'}).click();assert.equal(await fbPage.evaluate(element=>element.classList.contains('up-nav-collapsed')),false,'FB navigation must expand again');assert.ok(await fbPage.locator('.fb-nav-toggle svg path').count()>0,'the expanded FB navigation toggle must retain its visible icon');
  await fbPage.locator('.fb-scan').click();await fbPage.getByText('Hello, is this still available?',{exact:true}).waitFor();
  assert.match(await fbPage.locator('[data-fb-status]').innerText(),/请选择需要翻译/);
  assert.equal((await application.evaluate(()=>globalThis.__adsPowerCalls)).filter(value=>value.action==='translate').length,0,'a scan must never auto-translate');
  assert.equal((await application.evaluate(()=>globalThis.__fbReplyCalls)).length,0,'a scan must never request AI drafting or reply translation');
  assert.equal(await fbPage.getByText('尚未翻译',{exact:true}).count(),2,'both rows must start as untranslated');
  assert.equal(await fbPage.locator('.fb-translation-toolbar').count(),1,'the bulk translation controls must live in one compact toolbar at the inbox top');
  assert.equal(await fbPage.locator('.fb-translation-actions').count(),0,'the original/chinese panels must not have a middle bulk-translation column');
  const translationLayout=await fbPage.evaluate(element=>{const page=element.querySelector('.fb-page'),title=page?.querySelector('.fb-page-title'),toolbar=page?.querySelector('.fb-translation-toolbar'),board=page?.querySelector('.fb-translation-board');if(!title||!toolbar||!board)throw new Error('translation layout is incomplete');const titleBox=title.getBoundingClientRect(),toolbarBox=toolbar.getBoundingClientRect(),boardBox=board.getBoundingClientRect();return {titleBottom:titleBox.bottom,toolbarTop:toolbarBox.top,toolbarBottom:toolbarBox.bottom,boardTop:boardBox.top,columns:getComputedStyle(board).gridTemplateColumns.split(' ').length};});
  assert.ok(translationLayout.toolbarTop>=translationLayout.titleBottom-1&&translationLayout.toolbarBottom<=translationLayout.boardTop+1&&translationLayout.columns===2,`bulk translation controls must be directly below the inbox heading above two language panels: ${JSON.stringify(translationLayout)}`);
  await fbPage.evaluate(()=>{try{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{globalThis.__fbCopiedText=text}}});}catch{}});
  await fbPage.getByRole('button',{name:'翻译这条',exact:true}).first().click();await fbPage.getByText('中文：你好，还可以买吗？',{exact:true}).waitFor();
  assert.deepEqual((await application.evaluate(()=>globalThis.__adsPowerCalls)).filter(value=>value.action==='translate').map(value=>value.payload),[{token:'fictional-scan-token',messageIds:['fictional-row-1']}],'single translate must submit only its current scan fragment');
  await fbPage.locator('.fb-source-row').nth(1).getByRole('checkbox',{name:'选择这条原文'}).check();await fbPage.getByRole('button',{name:/翻译已选（1）/}).click();await fbPage.getByText('中文：今天可以配送吗？',{exact:true}).waitFor();
  assert.deepEqual((await application.evaluate(()=>globalThis.__adsPowerCalls)).filter(value=>value.action==='translate').map(value=>value.payload),[{token:'fictional-scan-token',messageIds:['fictional-row-1']},{token:'fictional-scan-token',messageIds:['fictional-row-2']}],'selected translation must submit only selected current scan text');
  const chineseReply=fbPage.locator('[data-fb-reply-chinese]'),englishReply=fbPage.locator('[data-fb-reply-english]');
  await chineseReply.fill('第一条，只复制不发送。');await fbPage.getByRole('button',{name:'翻译为英文',exact:true}).click();await page.waitForTimeout(50);await englishReply.inputValue().then(value=>assert.equal(value,'English translation: 第一条，只复制不发送。'));
  assert.deepEqual(await application.evaluate(()=>globalThis.__fbReplyCalls),[{action:'translate',payload:{text:'第一条，只复制不发送。'}}],'reply translation must submit only the current manual Chinese input');
  await fbPage.getByRole('button',{name:'加入待复制列表',exact:true}).click();
  await chineseReply.fill('第二条，人工到 FB 发送。');await fbPage.getByRole('button',{name:'AI 整理',exact:true}).click();await page.waitForTimeout(50);await englishReply.inputValue().then(value=>assert.equal(value,'AI draft: 第二条，人工到 FB 发送。'));
  assert.deepEqual(await application.evaluate(()=>globalThis.__fbReplyCalls),[{action:'translate',payload:{text:'第一条，只复制不发送。'}},{action:'fb-assist-draft',payload:{text:'第二条，人工到 FB 发送。'}}],'AI drafting must submit only the current manual Chinese input; the main process owns the fixed local reference and never receives scan text');
  await fbPage.getByRole('button',{name:'加入待复制列表',exact:true}).click();
  assert.equal(await fbPage.locator('.fb-draft-card').count(),2,'both user-created reply drafts must remain in the local list');
  await fbPage.locator('.fb-draft-card').first().getByRole('button',{name:'复制此条',exact:true}).click();await page.waitForTimeout(50);assert.equal(await fbPage.evaluate(()=>globalThis.__fbCopiedText),'English translation: 第一条，只复制不发送。','single copy must use only the local clipboard');
  await fbPage.locator('.fb-draft-select input').nth(0).check();await fbPage.locator('.fb-draft-select input').nth(1).check();await fbPage.getByRole('button',{name:'复制已选（2）',exact:true}).click();await page.waitForTimeout(50);
  assert.equal(await fbPage.evaluate(()=>globalThis.__fbCopiedText),'English translation: 第一条，只复制不发送。\n\nAI draft: 第二条，人工到 FB 发送。','multi-copy must join only user-selected drafts');
  assert.match(await fbPage.locator('[data-fb-reply-status]').innerText(),/已复制 2 条回复草稿/);
  await frame.getByRole('button',{name:/^聊单工作台/}).click();await frame.locator('#chat-workbench-desktop').waitFor({state:'visible'});await frame.getByRole('button',{name:'FB 聊天',exact:true}).click();await fbPage.waitFor({state:'visible'});
  await fbPage.getByText('中文：你好，还可以买吗？',{exact:true}).waitFor();assert.equal(await fbPage.locator('.fb-draft-card').count(),2,'scan results and drafts must stay in memory across page navigation');
  for(const size of [{width:1280,height:820},{width:1440,height:1000}]){
   await application.evaluate(({BrowserWindow},size)=>BrowserWindow.getAllWindows()[0]?.setContentSize(size.width,size.height),size);await page.waitForTimeout(250);
   const geometry=await fbPage.evaluate(element=>{const rect=element.getBoundingClientRect(),actions=element.querySelector('.fb-actions')?.getBoundingClientRect(),reply=element.querySelector('.fb-reply-workspace')?.getBoundingClientRect(),results=element.querySelector('.fb-results')?.getBoundingClientRect();return {top:rect.top,bottom:rect.bottom,height:innerHeight,actionsBottom:actions?.bottom,replyWidth:reply?.width,resultsWidth:results?.width};});
   assert.ok(geometry.top>=0&&geometry.bottom<=geometry.height+1&&geometry.actionsBottom<=geometry.bottom+1&&geometry.replyWidth>0&&Math.abs((geometry.replyWidth||0)-(geometry.resultsWidth||0))<=1,`FB controls must remain visible and reply workspace must match the archive width at ${size.width}×${size.height}: ${JSON.stringify(geometry)}`);
   if(visualArtifactDirectory){await mkdir(visualArtifactDirectory,{recursive:true});await page.screenshot({path:path.join(visualArtifactDirectory,`adspower-ondemand-${size.width}x${size.height}.png`),fullPage:false});}
  }
  if(visualArtifactDirectory){await fbPage.locator('.fb-reply-workspace').scrollIntoViewIfNeeded();await page.waitForTimeout(100);await page.screenshot({path:path.join(visualArtifactDirectory,'adspower-reply-workspace-1440x1000.png'),fullPage:false});}
  const calls=await application.evaluate(()=>globalThis.__adsPowerCalls);assert.equal(calls.some(value=>value.action==='send'),false,'the FB workspace must not have a send route');
  await fbPage.getByRole('button',{name:'清空本次扫描',exact:true}).click();await fbPage.getByText('等待你的主动扫描',{exact:true}).waitFor();assert.equal(await fbPage.locator('.fb-draft-card').count(),2,'clearing a scan must not clear reply drafts');
  assert.deepEqual((await application.evaluate(()=>globalThis.__adsPowerCalls)).filter(value=>value.action==='clear').map(value=>value.payload),[{token:'fictional-scan-token'}]);
 }finally{await closeApplication(application,directory);}
});
