import test from 'node:test';
import assert from 'node:assert/strict';
import {_electron as electron} from 'playwright-core';
import electronPath from 'electron';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('聊天工作台仅在点击“英文翻译”时生成英文，英文可编辑并可回译核对',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'workbench-composer-translation-'));
 let application;
 try{
  application=await electron.launch({
   executablePath:process.env.KDOCS_TEST_EXECUTABLE||electronPath,
   args:[...(process.env.KDOCS_TEST_EXECUTABLE?[]:['.']),`--orders-test-user-data=${directory}`],
   cwd:path.resolve('.'),
   env:{...process.env,NODE_ENV:'test'}
  });
  const page=await application.firstWindow();
  page.setDefaultTimeout(20000);
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await application.evaluate(({ipcMain})=>{
   globalThis.__composerTranslationCalls=[];
   globalThis.__composerBackTranslationCalls=[];
   globalThis.__composerSends=[];
   globalThis.__composerTranslationMode='normal';
   globalThis.__composerBackTranslationMode='normal';
   globalThis.__composerPending=undefined;
   globalThis.__composerBackPending=undefined;
   const message={id:'fictional-composer-customer-1',direction:'customer',text:'Can you confirm the fictional address?',sentAt:'2026-09-24T00:00:00.000Z'};
   ipcMain.removeHandler('manual-chat');
   ipcMain.handle('manual-chat',async(_event,{action,payload={}})=>{
    if(action==='status')return {ok:true,data:{status:'online'}};
    if(action==='inbox')return {ok:true,data:{items:[{phone:'971500000102',chatId:'wa-phone:971500000102',name:'Fictional Composer Customer',updatedAt:message.sentAt,preview:message.text,direction:'customer',unreadCount:0}],total:1,offset:0,hasMore:false}};
    if(action==='openInbox'||action==='recent')return {ok:true,data:{token:'fictional-composer-binding',accountId:'wa-phone:971500000101',chatId:'wa-phone:971500000102',phone:'971500000102',identityVerified:true,messages:[message],hasMore:false}};
    if(action==='send'){globalThis.__composerSends.push(payload);return {ok:true,data:{status:'sent'}};}
    return {ok:false,error:`unexpected manual-chat action: ${action}`};
   });
   ipcMain.removeHandler('manual-reply-translation');
   ipcMain.handle('manual-reply-translation',async(_event,{action,payload={}})=>{
    if(action==='chat-cache'||action==='chat-translate')return {ok:true,data:{translations:[]}};
    if(action==='translate-draft'){
     globalThis.__composerBackTranslationCalls.push(payload);
     if(globalThis.__composerBackTranslationMode==='fail')return {ok:false,error:'虚构回译服务不可用'};
     if(globalThis.__composerBackTranslationMode==='defer')return new Promise(resolve=>{globalThis.__composerBackPending=resolve;});
     return {ok:true,data:{text:payload.text,chinese:`回译：${payload.text}`}};
    }
    if(action!=='translate')return {ok:false,error:`unexpected translation action: ${action}`};
    globalThis.__composerTranslationCalls.push(payload);
    if(globalThis.__composerTranslationMode==='fail')return {ok:false,error:'虚构翻译服务不可用'};
    if(globalThis.__composerTranslationMode==='defer')return new Promise(resolve=>{globalThis.__composerPending=resolve;});
    const results={
     '请确认虚构地址。':'Please confirm the fictional address.',
     '感谢你的支持，请确认以上订单信息是否正确。':'Thank you for your support. Please confirm the fictional order information.',
     '请保留当前英文。':'Please preserve the current English draft.'
    };
    return {ok:true,data:{text:results[payload.text]||`English: ${payload.text}`}};
   });
  });

  const frame=page.frameLocator('iframe.confirmed-frame');
  await frame.locator('.cwb-refresh').click();
  await frame.locator('.cwb-conversation').click();
  await frame.locator('.cwb-message-text').getByText('Can you confirm the fictional address?',{exact:true}).waitFor();
  const chineseTab=frame.getByRole('button',{name:'中文输入',exact:true});
  const englishTab=frame.getByRole('button',{name:'英文翻译',exact:true});
  const chinese=frame.getByLabel('中文输入');
  const backTranslate=frame.locator('.cwb-back-translate');
  assert.equal(await frame.locator('.cwb-composer-tabs > button[data-editor]').count(),2,'仅保留中文输入和英文翻译两个文字入口');
  assert.equal(await frame.getByRole('button',{name:'转为英文',exact:true}).count(),0,'不得保留第三个“转为英文”按钮');
  assert.equal(await backTranslate.isHidden(),true,'没有英文草稿时不显示回译核对');

  await chinese.fill('请确认虚构地址。');
  assert.equal(await application.evaluate(()=>globalThis.__composerTranslationCalls.length),0,'输入本身不得调用翻译');
  await englishTab.click();
  const english=frame.getByLabel('英文翻译');
  await english.waitFor({state:'visible'});
  assert.equal(await english.inputValue(),'Please confirm the fictional address.');
  assert.deepEqual(await application.evaluate(()=>globalThis.__composerTranslationCalls),[{text:'请确认虚构地址。'}]);
  assert.equal(await application.evaluate(()=>globalThis.__composerSends.length),0,'明确翻译不得发送消息');

  await english.evaluate(node=>{node.focus();node.setSelectionRange(0,0);});
  await english.pressSequentially('Kindly ');
  const editedEnglish='Kindly Please confirm the fictional address.';
  assert.equal(await english.inputValue(),editedEnglish,'生成后的英文应可在原输入框中直接编辑');
  assert.equal(await application.evaluate(()=>globalThis.__composerTranslationCalls.length),1,'手工编辑英文不得触发新的正向翻译');

  await backTranslate.waitFor({state:'visible'});
  await backTranslate.click();
  const backPopover=frame.locator('.cwb-back-translation-popover');
  await backPopover.waitFor({state:'visible'});
  assert.match(await backPopover.textContent()||'',/原中文/);
  assert.match(await backPopover.textContent()||'',/请确认虚构地址。/);
  assert.match(await backPopover.textContent()||'',new RegExp(`回译：${editedEnglish.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}`));
  assert.equal(await english.inputValue(),editedEnglish,'回译仅供核对，不能改写英文草稿');
  assert.deepEqual(await application.evaluate(()=>globalThis.__composerBackTranslationCalls),[{text:editedEnglish}]);
  assert.equal(await application.evaluate(()=>globalThis.__composerSends.length),0,'回译核对不得发送消息');
  await backTranslate.click();
  assert.equal(await backPopover.isHidden(),true);
  await backTranslate.click();
  await backPopover.waitFor({state:'visible'});
  assert.equal(await application.evaluate(()=>globalThis.__composerBackTranslationCalls.length),1,'相同英文再次查看应使用本地核对缓存，不重复请求');

  await chineseTab.click();
  await frame.locator('.cwb-quick').click();
  await frame.getByRole('button',{name:'确认订单',exact:true}).click();
  const quickChinese='感谢你的支持，请确认以上订单信息是否正确。';
  assert.equal(await chinese.inputValue(),quickChinese);
  assert.equal(await application.evaluate(()=>globalThis.__composerTranslationCalls.length),1,'快捷回复填充本身不得自动翻译');
  await englishTab.click();
  await english.waitFor({state:'visible'});
  assert.equal(await english.inputValue(),'Thank you for your support. Please confirm the fictional order information.');
  assert.equal(await application.evaluate(()=>globalThis.__composerTranslationCalls.length),2,'快捷回复只可经同一个英文翻译入口生成英文');

  await english.fill('Existing manual English draft.');
  await chineseTab.click();
  await chinese.fill('请保留当前英文。');
  await application.evaluate(()=>{globalThis.__composerTranslationMode='fail';});
  await englishTab.click();
  await frame.getByText('翻译失败：虚构翻译服务不可用',{exact:true}).waitFor();
  assert.equal(await application.evaluate(()=>globalThis.__composerTranslationCalls.length),3);
  await chinese.fill(quickChinese);
  await application.evaluate(()=>{globalThis.__composerTranslationMode='normal';});
  await englishTab.click();
  await english.waitFor({state:'visible'});
  assert.equal(await english.inputValue(),'Existing manual English draft.','中文修改或翻译失败不得清空手工英文草稿');

  await chineseTab.click();
  await chinese.fill('旧的虚构中文');
  await application.evaluate(()=>{globalThis.__composerTranslationMode='defer';});
  await englishTab.click();
  await englishTab.evaluate(button=>button.dispatchEvent(new MouseEvent('click',{bubbles:true})));
  assert.equal(await application.evaluate(()=>globalThis.__composerTranslationCalls.filter(call=>call.text==='旧的虚构中文').length),1,'等待中的正向翻译只能发起一次请求');
  await chinese.fill('新的虚构中文');
  await application.evaluate(()=>globalThis.__composerPending({ok:true,data:{text:'Stale English must not overwrite the new draft.'}}));
  await frame.getByText('中文或英文草稿已修改，本次翻译未覆盖新内容。',{exact:true}).waitFor();
  await chinese.fill(quickChinese);
  await application.evaluate(()=>{globalThis.__composerTranslationMode='normal';});
  await englishTab.click();
  await english.waitFor({state:'visible'});
  assert.equal(await english.inputValue(),'Existing manual English draft.','迟到的正向翻译不得覆盖既有英文草稿');

  await english.fill('Deferred fictional English review.');
  await application.evaluate(()=>{globalThis.__composerBackTranslationMode='defer';});
  await backTranslate.click();
  await english.fill('Changed fictional English review.');
  await application.evaluate(()=>globalThis.__composerBackPending({ok:true,data:{text:'Deferred fictional English review.',chinese:'不应显示的旧回译'}}));
  await frame.getByText('中英文草稿已修改，本次回译未显示。',{exact:true}).waitFor();
  assert.equal(await backPopover.isHidden(),true,'英文变化后迟到的回译结果不得显示');
  assert.equal(await application.evaluate(()=>globalThis.__composerSends.length),0,'所有虚构翻译和回译路径均不得发送');
  assert.deepEqual(errors,[]);
 }finally{
  try{application?.process().kill('SIGKILL');}catch{}
  await rm(directory,{recursive:true,force:true,maxRetries:3,retryDelay:150}).catch(()=>{});
 }
});
