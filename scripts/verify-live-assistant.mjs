// Explicit opt-in development verification. Never included in the App and never
// run by npm test. Uses only the approved two-message scope and a disposable DB.
import assert from 'node:assert/strict';
import {_electron as electron} from 'playwright-core';
import electronPath from 'electron';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
const readOnly=process.env.KDOCS_LIVE_READ_ONLY==='1';
const scopeFile=process.env.KDOCS_REAL_SCOPE_FILE;
if(!scopeFile)throw new Error('Explicit approved scope file is required');
const scope=JSON.parse(await readFile(scopeFile,'utf8'));
assert.equal(scope.expectedMessages.length,2);
assert.notEqual(scope.useTimeFilter,true,'Real verification is limited to the two previously approved native message IDs');
assert.equal(scope.expectedMessages[0].text.replace(/\s+/g,' ').trim(),'[KDOCS-0913-A7-C1] Full name: Avery Example I am only asking about KY02. I have not decided to buy.');
assert.equal(scope.expectedMessages[1].text.replace(/\s+/g,' ').trim(),'[KDOCS-0913-A7-M1] KY02 price is AED 75 each. This is only a quotation.');
const dir=await mkdtemp(path.join(os.tmpdir(),'kdocs-live-fictional-')),evidence=path.resolve(process.env.KDOCS_TEST_ARTIFACT_DIRECTORY||'artifacts/assistant-integration-8.7'),userData=path.join(dir,'data');
let app,page,phase='launch';const report={startedAt:new Date().toISOString(),realBrowser:true,realAI:false,scope:'exactly two approved new fictional text messages',formalOrderDatabaseAccessed:false,automatedMessageSends:0,checks:{}};
const localValue=date=>{const d=new Date(date);return new Date(d-d.getTimezoneOffset()*60000).toISOString().slice(0,16);};
const call=(method,payload)=>page.evaluate(async({method,payload})=>{const r=await window.inventoryApp.orders[method](payload);if(!r.ok)throw new Error(r.error.message);return r.data;},{method,payload});
const settings=()=>page.evaluate(async()=>{const r=await window.inventoryApp.assistantSettings.get();if(!r.ok)throw new Error(r.error.message);return r.data;});
async function launch(){
 const executable=process.env.KDOCS_TEST_EXECUTABLE;
 app=await electron.launch({executablePath:executable||electronPath,args:[...(executable?[]:['.']),`--orders-test-user-data=${userData}`,`--orders-test-whatsapp-scope=${path.resolve(scopeFile)}`,...(readOnly?[]:[`--orders-test-settings-data=${path.join(os.homedir(),'Library/Application Support/KDocs Order Assistant')}`])],env:{...process.env,NODE_ENV:'test'},timeout:30000});
 page=await app.firstWindow();page.setDefaultTimeout(45000);page.on('dialog',dialog=>dialog.accept());
 await page.getByRole('button',{name:'订单管理',exact:true}).click();
}
try{
 await mkdir(evidence,{recursive:true});await launch();phase='saved key';const before=await settings();if(!readOnly)assert.equal(before.providers.deepseek.hasApiKey,true);else{assert.equal(before.providers.deepseek.hasApiKey,false);report.settingsScope='disposable empty settings; existing encrypted key not accessed';report.normalTimeBoundary='NOT TESTED: restricted to two approved message IDs';}assert.equal(before.activeProvider,'deepseek');if(!readOnly)assert.ok(before.callsUsed<5);report.callsBefore=before.callsUsed;
 await page.getByRole('button',{name:'新建订单',exact:true}).click();await page.getByRole('heading',{name:'草稿 #1',exact:true}).waitFor();await page.getByRole('button',{name:'订单助手',exact:true}).click();
 phase='open browser';await page.getByRole('button',{name:'打开 WhatsApp 网页',exact:true}).click();await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='打开 WhatsApp 网页'&&!b.matches(':disabled')),{},{timeout:45000});const opened=await call('assistantStatus',{orderId:(await call('list',{}))[0].id});if(opened.browser?.status==='error')throw new Error(opened.browser.message);await page.getByText('关联指定聊天',{exact:true}).click();
 phase='inspect';await page.getByRole('button',{name:'核对当前聊天',exact:true}).click();await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='确认关联此聊天'&&!b.disabled),{},{timeout:45000});
 await page.getByLabel('本单开始时间',{exact:true}).fill(localValue(scope.scopeStart));await page.getByLabel('每次读取到最新',{exact:true}).uncheck();await page.getByLabel('本单结束时间',{exact:true}).fill(localValue(scope.scopeEnd));
 phase='bind';await page.getByRole('button',{name:'确认关联此聊天',exact:true}).click();await page.getByText(/已读 0 条/).waitFor();
 phase='read';await page.getByRole('button',{name:'读取/刷新聊天',exact:true}).click();await page.getByText(/已读 2 条/).waitFor();report.checks.appButtonReadTwoRealMessages=true;
 phase='read again';await page.getByRole('button',{name:'读取/刷新聊天',exact:true}).click();await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='读取/刷新聊天'&&!b.disabled),{},{timeout:45000});assert.equal(await page.getByText(/已读 2 条/).count(),1);report.checks.repeatReadNoDuplicate=true;
 const list=await call('list',{}),firstId=list[0].id;let detail,after;
 if(!readOnly){
 phase='real AI extract';report.realAI=true;await page.getByRole('button',{name:'提取并补全资料',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[aria-label="客户姓名（保持原文）"]')?.value==='Avery Example',{},{timeout:30000});
 detail=await call('detail',firstId);assert.equal(detail.customer.fullName,'Avery Example');assert.equal(detail.draft.items.length,0);assert.equal(detail.packages.length,0);assert.equal(detail.amounts.orderTotal,null);assert.equal(detail.confirmed,false);
 const status=await call('assistantStatus',{orderId:firstId});assert.equal(status.messageCount,2);assert.ok(status.sources.some(s=>s.field==='fullName'&&s.source==='chat'));assert.ok(status.result.quotes.some(q=>q.sku==='KY02'&&Number(q.price)===75&&q.accepted===false));report.checks.exactNameWithSource=true;report.checks.inquiryNotPurchase=true;report.checks.merchantQuoteNotAccepted=true;report.checks.noInventedAmountOrPackage=true;
 after=await settings();assert.equal(after.callsUsed,before.callsUsed+1);report.callsAfter=after.callsUsed;report.provider=after.activeProvider;report.model=after.providers[after.activeProvider].model;
 }else{detail=await call('detail',firstId);after=await settings();assert.equal(after.callsUsed,before.callsUsed);report.callsAfter=after.callsUsed;report.checks.readOnlyDidNotCallAI=true;assert.equal(detail.draft.items.length,0);assert.equal(detail.customer.fullName,null);}
 // Only fictional order fields are captured; the real account binding is hidden.
 const mask=await page.addStyleTag({content:'.assistant-binding-summary{visibility:hidden}'});await page.screenshot({path:path.join(evidence,readOnly?'packaged-real-read-empty-draft.png':'real-extraction-fictional-draft.png'),fullPage:true});await mask.evaluate(e=>e.remove());
 phase='second order';await page.getByRole('button',{name:'返回订单列表',exact:true}).click();await page.getByRole('button',{name:'新建订单',exact:true}).click();await page.getByRole('heading',{name:'草稿 #2',exact:true}).waitFor();await page.getByLabel('客户姓名（保持原文）').fill('Avery Example');await page.getByRole('button',{name:'保存草稿',exact:true}).click();await page.getByText('本单尚未关联聊天',{exact:true}).waitFor();assert.deepEqual(await call('detail',firstId),detail);report.checks.secondOrderIndependent=true;
 phase='restart';await app.close();app=null;await launch();assert.equal((await call('detail',firstId)).customer.fullName,readOnly?null:'Avery Example');assert.equal((await call('assistantStatus',{orderId:firstId})).messageCount,2);assert.equal((await settings()).callsUsed,after.callsUsed);report.checks.restartPreservesDraftBindingEvidenceAndCallBudget=true;
 report.result=readOnly?'PASS: packaged App real scoped WhatsApp reading, duplication and restart; no AI request':'PASS: actual App → scoped WhatsApp UI → actual DeepSeek → fictional draft; no purchase was present in these messages';
}catch(e){report.result=phase==='open browser'&&/正被另一个 App 版本或会话占用/.test(e.message)?'BLOCKED: approved browser profile is owned by another App':'FAIL';report.phase=phase;report.error=String(e.message).split('\n')[0];if(page)report.uiError=await page.locator('#orders-error-message').textContent().catch(()=>'');throw e;
}finally{if(app){let timer;try{await Promise.race([app.close(),new Promise(resolve=>{timer=setTimeout(()=>{app.process().kill('SIGKILL');resolve();},5000);})]);}finally{clearTimeout(timer);}}await rm(dir,{recursive:true,force:true});report.finishedAt=new Date().toISOString();report.disposableDatabaseRemoved=true;await writeFile(path.join(evidence,readOnly?'packaged-real-read.json':'live-app-chain.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({result:report.result,phase:report.phase,checks:report.checks,callsBefore:report.callsBefore,callsAfter:report.callsAfter}));}
