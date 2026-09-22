import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceTimestamp,WhatsAppBrowser} from '../src/orders/whatsapp-browser.mjs';
test('WhatsApp source timestamps use explicit zone and minute precision, rejecting ambiguity',()=>{
 assert.equal(sourceTimestamp('[11:33, 2026年9月13日]','Asia/Shanghai'),'2026-09-13T03:33:00.000Z');
 assert.equal(sourceTimestamp('[00:15, 2026年1月1日]','Asia/Dubai'),'2025-12-31T20:15:00.000Z');
 for(const v of ['[11:33, 9/13/2026]','[25:00, 2026年9月13日]','[01:00, 2026年2月30日]','missing'])assert.throws(()=>sourceTimestamp(v,'Asia/Shanghai'));
});
test('browser binding requires a fresh inspected candidate and exact account and chat',async()=>{
 const browser=new WhatsAppBrowser({userDataPath:'/unused'});browser.currentIdentity=async()=>({accountId:'wa-phone:123456789',chatId:'wa-phone:987654321',timeZone:'Asia/Shanghai'});
 await assert.rejects(()=>browser.resolve({accountId:'wa-phone:123456789',chatId:'wa-phone:987654321'}),/重新核对/);
 const selected=await browser.inspect();assert.equal((await browser.resolve({...selected,candidateToken:selected.token})).binding.accountId,selected.accountId);
 browser.currentIdentity=async()=>({accountId:'different',chatId:selected.chatId});await assert.rejects(()=>browser.resolve({...selected,candidateToken:selected.token}),/不一致/);
});
test('browser operations serialize, have no send capability, and sanitize unknown errors',async()=>{
 const browser=new WhatsAppBrowser({userDataPath:'/unused'});assert.equal(browser.send,undefined);
 let finish;const pending=browser.exclusive(()=>new Promise(r=>finish=r));await assert.rejects(()=>browser.inspect(),/正在读取/);finish();await pending;
 browser.currentIdentity=async()=>{throw new Error('private message or credential');};await assert.rejects(()=>browser.inspect(),e=>!e.message.includes('private'));
});

test('open reuses a remaining owned WhatsApp tab and relaunches only after context closes',async()=>{
 let launches=0,close;const mkpage=(url='https://web.whatsapp.com/')=>({closed:false,isClosed(){return this.closed;},url:()=>url,async bringToFront(){},async goto(next){url=next;}});const first=mkpage(),other=mkpage();let pages=[first,other];
 const context={pages:()=>pages,on:(_event,fn)=>close=fn,async newPage(){const p=mkpage('about:blank');pages.push(p);return p;}};
 const browser=new WhatsAppBrowser({userDataPath:'/private/tmp/assistant-fictional-lifecycle',launch:async()=>{launches++;return context;}});await browser.open();await browser.open();assert.equal(launches,1);assert.equal(browser.page,first);first.closed=true;await browser.open();assert.equal(launches,1);assert.equal(browser.page,other);other.closed=true;await browser.open();assert.equal(launches,1);assert.equal(pages.length,3);close();assert.equal(browser.context,null);await browser.open();assert.equal(launches,2);
});
