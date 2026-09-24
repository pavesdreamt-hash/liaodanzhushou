import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {ManualChat} from '../src/manual-chat.mjs';
import {ManualChatHistory} from '../src/manual-chat-history.mjs';
import {WhatsAppWebClient} from '../src/orders/whatsapp-web-client.mjs';
const accountId='wa-phone:971500000001',chatId='wa-phone:971500000002';
const rows=[1,2,3].map(n=>({id:`true_971500000002@c.us_${n}`,accountId,chatId,direction:n===3?'customer':'merchant',sentAt:`2026-09-01T10:0${n}:00.000Z`,text:`real-read-${n}`,metadata:{messageType:n===2?'image':'chat',media:n===2?[{type:'image',status:'cached',dataUrl:'data:image/png;base64,eA=='}]:[]}}));
const adapter=(messages)=>({status:()=>({status:'online'}),openInbox:async()=>({accountId,chatId,binding:{}}),resolve:async value=>value,recent:async()=>({messages,hasMore:false})});
test('verified chat rows survive a browser returning only one message; attachment bytes are not saved',async t=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'verified-chat-history-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const first=new ManualChat({adapter:adapter(rows),directory});const initial=await first.openInbox({chatId,limit:20});assert.equal(initial.messages.length,3);
 const restarted=new ManualChat({adapter:adapter([rows[2]]),directory});const restored=await restarted.openInbox({chatId,limit:20});assert.deepEqual(restored.messages.map(x=>x.text),['real-read-1','real-read-2','real-read-3']);assert.equal(restored.historyPartial,true);
 const image=restored.messages[1].metadata.media[0];assert.equal(image.dataUrl,undefined);assert.equal(image.status,'unavailable');
 const old=await restarted.recent({token:restored.token,limit:20,before:rows[2].sentAt});assert.deepEqual(old.messages.map(x=>x.text),['real-read-1','real-read-2']);
 const other=new ManualChat({adapter:{...adapter([]),openInbox:async()=>({accountId,chatId:'wa-phone:971500000003',binding:{}})},directory});assert.deepEqual((await other.openInbox({chatId:'wa-phone:971500000003'})).messages,[]);
});

test('pagination preserves separate messages sharing the same timestamp',async t=>{const directory=await mkdtemp(path.join(os.tmpdir(),'verified-chat-same-second-'));t.after(()=>rm(directory,{recursive:true,force:true}));const store=new ManualChatHistory(directory),same='2026-09-01T10:00:00.000Z';await store.save(accountId,chatId,['a','b','c'].map(id=>({id,direction:'customer',sentAt:same,text:id,metadata:{media:[]}})));const page=await store.page(accountId,chatId,{limit:1,before:same,beforeId:'c'});assert.deepEqual(page.messages.map(x=>x.id),['b']);assert.equal(page.hasMore,true);});

test('opening a chat archives every verified source row, including rows outside the visible page',async t=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'verified-chat-backfill-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const older=Array.from({length:37},(_,index)=>({id:`false_971500000002@c.us_${index}`,accountId,chatId,direction:'customer',sentAt:new Date(Date.parse('2026-09-01T00:00:00Z')+index*1000).toISOString(),text:`source-${index}`,metadata:{messageType:'chat',media:[]}}));
 const source={...adapter([]),recent:async({archive})=>({messages:archive?older.slice(-20):[older.at(-1)],archiveMessages:archive?older:[older.at(-1)],hasMore:archive})};
 const first=new ManualChat({adapter:source,directory});const opened=await first.openInbox({chatId,limit:20});assert.equal(opened.messages.length,20);assert.equal(opened.hasMore,true);
 const second=new ManualChat({adapter:adapter([older.at(-1)]),directory});const restored=await second.openInbox({chatId,limit:20});assert.equal(restored.messages.length,20);
 const historical=await second.chatHistory.page(accountId,chatId,{limit:100});assert.equal(historical.messages.length,37);assert.equal(historical.messages[0].text,'source-0');
});

test('a later placeholder cannot overwrite a previously verified message body',async t=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'verified-chat-monotonic-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const store=new ManualChatHistory(directory),original={...rows[0],text:'The complete actual message'};
 await store.save(accountId,chatId,[original]);await store.save(accountId,chatId,[{...original,text:'[未知类型消息]',metadata:{messageType:'unknown',media:[],incomplete:true}}]);
 assert.equal((await store.page(accountId,chatId)).messages[0].text,original.text);
 const service=new ManualChat({adapter:adapter([{...original,text:'[未知类型消息]'}]),directory});
 assert.equal((await service.openInbox({chatId})).messages[0].text,original.text);
});

test('a temporary source read failure still serves the verified local chat archive',async t=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'verified-chat-fallback-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const first=new ManualChat({adapter:adapter(rows),directory});await first.openInbox({chatId});
 const failing={...adapter([]),recent:async()=>{throw Error('temporary WhatsApp read failure');}};
 const restarted=new ManualChat({adapter:failing,directory});const opened=await restarted.openInbox({chatId});
 assert.deepEqual(opened.messages.map(row=>row.text),rows.map(row=>row.text));assert.match(opened.historySaveIssue,/本机已保存/);
 assert.deepEqual((await restarted.recent({token:opened.token})).messages.map(row=>row.text),rows.map(row=>row.text));
});

test('hiding a conversation is account-specific and never deletes its archived messages',async t=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'verified-chat-hidden-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const store=new ManualChatHistory(directory),otherAccount='wa-phone:971500000009';
 await store.save(accountId,chatId,[rows[0]]);
 await store.setHidden(accountId,chatId,true);
 assert.deepEqual(await store.hiddenChatIds(accountId),[chatId]);
 assert.deepEqual(await store.hiddenChatIds(otherAccount),[]);
 assert.equal((await store.page(accountId,chatId)).messages[0].text,'real-read-1');
 const restarted=new ManualChatHistory(directory);
 assert.deepEqual(await restarted.hiddenChatIds(accountId),[chatId]);
 await restarted.setHidden(accountId,chatId,false);
 assert.deepEqual(await restarted.hiddenChatIds(accountId),[]);
 assert.equal((await restarted.page(accountId,chatId)).messages.length,1);
});

test('unlinked direct messages are saved on arrival without opening a chat or creating an order',async t=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'unlinked-chat-events-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const live=new WhatsAppWebClient({userDataPath:directory});live.accountId=accountId;live.generation=1;live.readyGeneration=1;live.state={status:'online'};
 const lid='124242424242424@lid',pn='971500000002@c.us';
 live.client={getContactLidAndPhone:async ids=>ids[0]===lid?[{lid,pn}]:[]};
 const service=new ManualChat({adapter:live,directory});assert.equal(live.targets.length,0);
 const message=(remote,id,text)=>({id:{remote,_serialized:`false_${remote}_${id}`},fromMe:false,timestamp:Math.floor(Date.parse('2026-09-23T08:00:00Z')/1000)+(id==='second'?1:0),type:'chat',body:text});
 live.handleMessage(message(pn,'first','First actual message'),1);
 live.handleMessage(message(lid,'second','Second actual message'),1);
 let foreignBodyReads=0;live.handleMessage({id:{remote:'12345@g.us'},get body(){foreignBodyReads++;throw Error('group content must not be read');}},1);
 await live.queue;await service.captureQueue;
 assert.equal(foreignBodyReads,0);assert.equal(service.captureIssue,null);
 const restarted=new ManualChat({adapter:adapter([]),directory});
 const saved=await restarted.chatHistory.page(accountId,chatId,{limit:20});
 assert.deepEqual(saved.messages.map(row=>row.text),['First actual message','Second actual message']);
 assert.equal((await restarted.chatHistory.page(accountId,'wa-phone:971500000003',{limit:20})).messages.length,0);
});
