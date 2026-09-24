import test from 'node:test';
import assert from 'node:assert/strict';
import {_electron as electron} from 'playwright-core';
import electronPath from 'electron';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('聊天工作台中文和快捷回复只在明确转换后生成英文，并保护草稿',async()=>{
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
   globalThis.__composerSends=[];
   globalThis.__composerTranslationMode='normal';
   globalThis.__composerPending=undefined;
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
  const convert=frame.locator('.cwb-convert');
  const chinese=frame.getByLabel('中文输入');
  assert.equal(await convert.count(),1,'转换操作必须唯一且可见');
  assert.equal(await convert.textContent(),'转为英文');
  assert.equal(await convert.isDisabled(),true,'空中文不得转换');

  await chinese.fill('请确认虚构地址。');
  assert.equal(await application.evaluate(()=>globalThis.__composerTranslationCalls.length),0,'输入本身不得调用翻译');
  assert.equal(await convert.isDisabled(),false);
  await convert.click();
  const english=frame.getByLabel('英文翻译');
  await assert.doesNotReject(()=>english.inputValue());
  await english.waitFor({state:'visible'});
  assert.equal(await english.inputValue(),'Please confirm the fictional address.');
  assert.deepEqual(await application.evaluate(()=>globalThis.__composerTranslationCalls),[{text:'请确认虚构地址。'}]);
  await frame.locator('[data-editor="zh"]').click();
  assert.equal(await chinese.inputValue(),'请确认虚构地址。','转换后原中文仍可核对');
  assert.equal(await application.evaluate(()=>globalThis.__composerSends.length),0,'转换不得发送消息');

  await frame.locator('.cwb-quick').click();
  await frame.getByRole('button',{name:'确认订单',exact:true}).click();
  assert.equal(await chinese.inputValue(),'感谢你的支持，请确认以上订单信息是否正确。');
  assert.equal(await application.evaluate(()=>globalThis.__composerTranslationCalls.length),1,'快捷回复填充本身不得自动翻译');
  await convert.click();
  await english.waitFor({state:'visible'});
  assert.equal(await english.inputValue(),'Thank you for your support. Please confirm the fictional order information.');
  assert.deepEqual(await application.evaluate(()=>globalThis.__composerTranslationCalls),[
   {text:'请确认虚构地址。'},
   {text:'感谢你的支持，请确认以上订单信息是否正确。'}
  ]);

  await frame.locator('[data-editor="zh"]').click();
  await chinese.fill('请保留当前英文。');
  await frame.locator('[data-editor="en"]').click();
  await english.fill('Existing manual English draft.');
  await application.evaluate(()=>{globalThis.__composerTranslationMode='fail';});
  await convert.click();
  await frame.getByText(/翻译失败：虚构翻译服务不可用/).waitFor();
  assert.equal(await english.inputValue(),'Existing manual English draft.','失败不能清空现有英文草稿');
  await frame.locator('[data-editor="zh"]').click();
  assert.equal(await chinese.inputValue(),'请保留当前英文。','失败不能清空中文草稿');

  await chinese.fill('旧的虚构中文');
  await application.evaluate(()=>{globalThis.__composerTranslationMode='defer';});
  await convert.click();
  await convert.evaluate(button=>button.dispatchEvent(new MouseEvent('click',{bubbles:true})));
  assert.equal(await application.evaluate(()=>globalThis.__composerTranslationCalls.filter(call=>call.text==='旧的虚构中文').length),1,'等待中重复触发只能发起一次请求');
  await chinese.fill('新的虚构中文');
  await application.evaluate(()=>globalThis.__composerPending({ok:true,data:{text:'Stale English must not overwrite the new draft.'}}));
  await frame.getByText('中文或英文草稿已修改，本次翻译未覆盖新内容。',{exact:true}).waitFor();
  await frame.locator('[data-editor="en"]').click();
  assert.equal(await english.inputValue(),'','迟到结果不得覆盖新中文对应的英文草稿');
  await frame.locator('[data-editor="zh"]').click();
  assert.equal(await chinese.inputValue(),'新的虚构中文');
  assert.equal(await application.evaluate(()=>globalThis.__composerSends.length),0,'所有虚构转换路径均不得发送');
  assert.deepEqual(errors,[]);
 }finally{
  try{application?.process().kill('SIGKILL');}catch{}
  await rm(directory,{recursive:true,force:true,maxRetries:3,retryDelay:150}).catch(()=>{});
 }
});
