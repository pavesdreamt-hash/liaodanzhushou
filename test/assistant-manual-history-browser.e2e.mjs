import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {WhatsAppBrowser} from '../src/orders/whatsapp-browser.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const out=path.resolve(process.env.KDOCS_TEST_ARTIFACT_DIRECTORY||'artifacts/assistant-manual-8.16/source');
test('manual history does not reselect the chat, waits for slow older pages and rejects a same-title target switch',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage();
  await page.setContent('<main id="main"><header>Fictional customer</header><div data-testid="conversation-panel-body" style="height:80px;overflow:auto"></div></main>');
  await page.evaluate(()=>{
   const panel=document.querySelector('[data-testid="conversation-panel-body"]');window.historyPage=3;
   window.populateHistory=n=>{window.historyPage=n;panel.innerHTML=Array.from({length:3},(_,i)=>`<div data-id="false_971500000001@c.us_p${n}-${i}" style="height:80px"><i data-icon="tail-in"></i><div data-pre-plain-text="[16:0${n}, 2026年9月13日] Fictional:">Fictional older page ${n} message ${i}</div></div>`).join('');panel.scrollTop=80;};
   window.populateHistory(3);let pending=false;
   panel.addEventListener('scroll',()=>{if(panel.scrollTop===0&&window.historyPage>1&&!pending){pending=true;setTimeout(()=>{window.populateHistory(window.historyPage-1);pending=false;},1800);}});
  });
  let inspections=0;const identity={accountId:'fictional-account',chatId:'fictional-chat',timeZone:'Asia/Shanghai'},connector=new WhatsAppBrowser({page});
  // Re-selecting a real chat can restore its latest position. Reproduce that
  // side effect instead of replacing identity inspection with a no-op.
  connector.currentIdentity=async()=>{inspections++;await page.evaluate(()=>window.populateHistory(3));return identity;};
  const ids=new Set(),progress=[];
  await connector.readHistory({...identity,binding:identity,onBatch:async(messages,p)=>{messages.forEach(m=>ids.add(m.id));progress.push(p);}});
  assert.equal(inspections,1,'full identity inspection must not reset every history batch');
  assert.equal(ids.size,9,'all three slowly loaded pages must be archived');
  assert.ok(progress.every(p=>p.complete===false));
  // Same visible name is insufficient: the native remote chat identifier must
  // remain pinned even when the header and #main DOM node remain unchanged.
  let saved=0;
  await assert.rejects(connector.readHistory({...identity,binding:identity,onBatch:async()=>{saved++;await page.evaluate(()=>{document.querySelector('[data-id]').setAttribute('data-id','false_971500000002@c.us_foreign');});}}),/聊天已切换/);
  assert.equal(saved,1,'the changed batch must not be saved');
  assert.equal(inspections,2);
  await mkdir(out,{recursive:true});await writeFile(path.join(out,'manual-history-browser-result.json'),JSON.stringify({result:'PASS-LOCAL',realBrowserDOM:true,realWhatsApp:false,oneFullInspectionPerManualRead:true,slowThreePagesNineMessages:true,sameTitleForeignNativeIdRejected:true,neverClaimsComplete:true,realChatReads:0,messagesSent:0},null,2));
 }finally{await browser.close();}
});
