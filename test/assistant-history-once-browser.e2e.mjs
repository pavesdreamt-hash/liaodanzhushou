import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {WhatsAppBrowser,readVisibleMessages} from '../src/orders/whatsapp-browser.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const out=path.resolve(process.env.KDOCS_TEST_ARTIFACT_DIRECTORY||'artifacts/assistant-history-once-8.17/source');
const identity={accountId:'fictional-account',chatId:'fictional-chat',timeZone:'Asia/Shanghai'};
test('one operation reads 72 virtual pages, survives a six-second stall, rewalks after identity reset and never claims account completeness',async()=>{
 const browser=await chromium.launch({headless:true});try{
  const page=await browser.newPage();await page.setContent('<main id="main"><header>Fictional customer</header><div data-testid="conversation-panel-body" style="height:80px;overflow:auto"></div></main>');
  await page.evaluate(()=>{
   const panel=document.querySelector('[data-testid="conversation-panel-body"]');window.oldestPage=1;window.newestPage=72;window.pendingLoad=false;window.didSlowLoad=false;
   window.populate=n=>{window.currentPage=n;const d=new Date(Date.UTC(2026,0,n)),stamp=`${d.getUTCFullYear()}年${d.getUTCMonth()+1}月${d.getUTCDate()}日`;panel.innerHTML=Array.from({length:3},(_,i)=>`<div data-id="false_971500000001@c.us_once-${n}-${i}" style="height:80px"><i data-icon="tail-in"></i><div data-pre-plain-text="[16:00, ${stamp}] Fictional:">Fictional page ${n} row ${i}</div></div>`).join('');panel.scrollTop=80;};window.populate(72);
   panel.addEventListener('scroll',()=>{if(panel.scrollTop===0&&window.currentPage>window.oldestPage&&!window.pendingLoad){window.pendingLoad=true;const slow=window.currentPage===68&&!window.didSlowLoad;if(slow){window.didSlowLoad=true;panel.replaceChildren();}setTimeout(()=>{window.populate(window.currentPage-1);window.pendingLoad=false;},slow?6000:20);}});
  });
  const connector=new WhatsAppBrowser({page});let inspections=0;connector.currentIdentity=async()=>{inspections++;await page.evaluate(()=>window.populate(window.newestPage));return identity;};
  const archived=new Map();let finalProgress;
  const save=async(messages,p)=>{for(const m of messages){if(archived.has(m.id))assert.deepEqual(archived.get(m.id),m);archived.set(m.id,m);}finalProgress=p;};
  await connector.readHistory({...identity,binding:identity,initial:true,onBatch:save});
  assert.equal(archived.size,216);assert.equal(inspections,1);assert.equal(finalProgress.status,'page-top-unverified');assert.equal(finalProgress.complete,false);assert.equal(finalProgress.earliestId,'false_971500000001@c.us_once-1-0');assert.ok(finalProgress.batchesRead>60);assert.equal(await page.evaluate(()=>window.didSlowLoad),true);assert.equal(connector.status().status,'read_verified');
  // Simulate reopening the chat at newest, with one extra page. The saved
  // oldest row is not mounted. Older must rewalk, not silently miss new rows.
  await page.evaluate(()=>{window.newestPage=73;window.oldestPage=70;window.populate(73);});
  await connector.readHistory({...identity,binding:identity,direction:'older',progress:finalProgress,onBatch:save});assert.equal(archived.size,219);assert.equal(inspections,2);
  let cancelled=false,savedBatches=0;await connector.readHistory({...identity,binding:identity,cancelled:()=>cancelled,onBatch:async(messages,p)=>{if(messages.length){savedBatches++;cancelled=true;}finalProgress=p;}});assert.equal(savedBatches,1);assert.equal(finalProgress.status,'cancelled');assert.equal(finalProgress.complete,false);
  await mkdir(out,{recursive:true});await writeFile(path.join(out,'history-once-browser-result.json'),JSON.stringify({result:'PASS-LOCAL',realWhatsApp:false,actualBrowserDOM:true,pagesInSingleOperation:72,messagesInSingleOperation:216,slowLoadMs:6000,olderAfterResetAddsNewPage:true,nativeDeduplication:true,cancel:true,fullInspectionPerOperation:1,accountCompletenessClaimed:false,realChatReads:0,realAIRequests:0,messagesSent:0},null,2));
 }finally{await browser.close();}
});
test('historical media placeholders preserve adjacent text while strict scoped reader still rejects incomplete messages',async()=>{
 const browser=await chromium.launch({headless:true});try{
  const page=await browser.newPage();await page.setContent('<main id="main"><div data-id="false_971500000001@c.us_audio"><i data-icon="tail-in"></i><div data-pre-plain-text="[16:00, 2026年9月13日] Fictional:"></div><audio></audio></div><div data-id="false_971500000001@c.us_text"><i data-icon="tail-in"></i><div data-pre-plain-text="[16:01, 2026年9月13日] Fictional:">Adjacent fictional text</div></div></main>');
  const scope={...identity,from:'2026-09-13T07:59:00Z',to:'2026-09-13T08:02:00Z',requireCoverage:false,maxMessages:500};await assert.rejects(readVisibleMessages(page,scope),/非文字/);
  const rows=await readVisibleMessages(page,{...scope,archiveMode:true});assert.equal(rows.length,2);assert.equal(rows[0].metadata.incomplete,true);assert.match(rows[0].text,/非文字/);assert.equal(rows[1].text,'Adjacent fictional text');assert.equal(rows[1].metadata.incomplete,undefined);
 }finally{await browser.close();}
});
test('transient row virtualization retries within the same operation before saving any partial batch',async()=>{
 const browser=await chromium.launch({headless:true});try{
  const page=await browser.newPage();await page.setContent('<main id="main"><header>Fictional customer</header><div data-testid="conversation-panel-body"><div data-id="false_971500000001@c.us_a"><i data-icon="tail-in"></i><div data-pre-plain-text="[16:00, 2026年9月13日] Fictional:">First text</div></div><div data-id="false_971500000001@c.us_b"><i data-icon="tail-in"></i><div data-pre-plain-text="[16:01, 2026年9月13日] Fictional:">Second text</div></div></div></main>');
  await page.evaluate(()=>{const first=document.querySelector('[data-pre-plain-text]'),second=document.querySelector('[data-id$="_b"]'),panel=second.parentElement;let once=false;Object.defineProperty(first,'innerText',{get(){if(!once){once=true;second.remove();setTimeout(()=>panel.append(second),100);}return 'First text';}});});
  const connector=new WhatsAppBrowser({page});connector.currentIdentity=async()=>identity;let cancelled=false,saved=0,terminal;await connector.readHistory({...identity,binding:identity,cancelled:()=>cancelled,onBatch:async(messages,p)=>{if(messages.length){assert.equal(messages.length,2);assert.deepEqual(messages.map(m=>m.text),['First text','Second text']);saved++;cancelled=true;}terminal=p;}});assert.equal(saved,1);assert.equal(terminal.status,'cancelled');assert.equal(terminal.complete,false);
 }finally{await browser.close();}
});
test('a same-title switch between phone inspection and guard creation is rejected before any body is read',async()=>{
 const browser=await chromium.launch({headless:true});try{
  const page=await browser.newPage();await page.setContent('<main id="main"><header>Fictional customer</header><div data-testid="conversation-panel-body"><div data-id="false_971500000002@c.us_foreign"><i data-icon="tail-in"></i><div data-pre-plain-text="[16:00, 2026年9月13日] Fictional:">Foreign body must not be accessed</div></div></div></main>');await page.locator('[data-pre-plain-text]').evaluate(e=>Object.defineProperty(e,'innerText',{get(){throw Error('Foreign body was accessed');}}));
  const connector=new WhatsAppBrowser({page});connector.currentIdentity=async()=>({...identity,nativeRemote:'971500000001@c.us'});let batches=0;await assert.rejects(connector.readHistory({...identity,binding:identity,onBatch:async()=>batches++}),/核对后聊天已切换/);assert.equal(batches,0);
 }finally{await browser.close();}
});
