import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {readVisibleMessages} from '../src/orders/whatsapp-browser.mjs';
const item=(id,time,text,direction='tail-in')=>`<div data-testid="msg-container" data-id="${id}"><i data-icon="${direction}"></i><div data-pre-plain-text="[${time}, 2026年9月13日] Test: ">${text}</div></div>`;
test('real DOM reader filters before reading text, rejects unsupported scope and preserves native IDs',async()=>{
 const browser=await chromium.launch({headless:true});try{const page=await browser.newPage();
 await page.setContent(`<main id="main"><div data-testid="conversation-panel-body">${item('old','08:00','Private out-of-scope text')}${item('one','11:33','Full name: Avery Example')}${item('two','11:35','KY02 quote AED 75 each','tail-out')}</div></main>`);
 await page.locator('[data-id="old"] [data-pre-plain-text]').evaluate(e=>Object.defineProperty(e,'innerText',{get(){throw new Error('Out of scope text accessed');}}));
 const scope={accountId:'account',chatId:'chat',from:'2026-09-13T03:30:00Z',to:'2026-09-13T03:36:00Z',timeZone:'Asia/Shanghai'};
 let rows=await readVisibleMessages(page,scope);assert.deepEqual(rows.map(r=>[r.id,r.direction]),[['one','customer'],['two','merchant']]);assert.equal(rows[0].metadata.timePrecision,'minute');assert.equal(rows[0].sentAt,'2026-09-13T03:33:00.000Z');assert.equal(rows[0].text,'Full name: Avery Example');
 await page.locator('[data-id="old"] [data-pre-plain-text]').evaluate(e=>{e.getAttribute=()=>{throw new Error('Restricted old metadata accessed');};});
 rows=await readVisibleMessages(page,{...scope,onlyIds:['one','two']});assert.equal(rows.length,2);
 await page.locator('[data-id="two"] [data-icon]').evaluate(e=>e.remove());await assert.rejects(()=>readVisibleMessages(page,{...scope,onlyIds:['one','two']}),/方向/);
 await page.setContent(`<main id="main">${item('one','11:33','Fictional')}</main>`);await assert.rejects(()=>readVisibleMessages(page,scope),/尚未完整/);
 await assert.rejects(()=>readVisibleMessages(page,{...scope,onlyIds:['one','missing']}),/尚未完整加载/);
 await page.setContent(`<main id="main"><div data-testid="conversation-panel-body">${Array.from({length:21},(_,i)=>item('id'+i,'11:33','Fictional')).join('')}</div></main>`);await assert.rejects(()=>readVisibleMessages(page,{...scope,from:'2026-09-13T03:33:00Z'}),/超过 20/);
 }finally{await browser.close();}
});
