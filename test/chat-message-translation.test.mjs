import test from 'node:test';import assert from 'node:assert/strict';
import {translateChatMessages,ChatTranslationCache} from '../src/manual-translation.mjs';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
test('chat translation submits only selected message text and verifies returned message identities',async()=>{
 let captured;const service={configuration:async()=>({model:'fictional'}),complete:async value=>{captured=value;return {translations:[{id:'m2',text:'请送到迪拜。'},{id:'m1',text:'你好。'}]};}};
 const result=await translateChatMessages(service,{messages:[{id:'m1',text:'Hello',phone:'private'},{id:'m2',text:'Deliver to Dubai'}],draft:'not sent'});
 assert.deepEqual(captured.input,{language:'zh',messages:[{id:'m1',text:'Hello'},{id:'m2',text:'Deliver to Dubai'}]});assert.equal(captured.purpose,'translation');assert.equal(result.translations.find(t=>t.id==='m1').text,'你好。');
 service.complete=async()=>({translations:[{id:'m1',text:'你好。'},{id:'m1',text:'重复'}]});await assert.rejects(translateChatMessages(service,{messages:captured.input.messages}),/不完整/);
});
test('chat translation rejects empty and excessive batches before contacting the provider and does not retry failures',async()=>{
 let calls=0;const service={configuration:async()=>({}),complete:async()=>{calls++;throw new Error('fictional offline');}};
 for(const messages of [[],Array.from({length:21},(_,i)=>({id:String(i),text:'hello'})),[{id:'x',text:'x'.repeat(6001)}]])await assert.rejects(translateChatMessages(service,{messages}));assert.equal(calls,0);
 await assert.rejects(translateChatMessages(service,{messages:[{id:'1',text:'Hello'}]}),/offline/);assert.equal(calls,1);
});
test('phone translations survive restart and never reuse a result for another chat, body or model',async t=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'phone-translation-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 let calls=0,revision=1;const settings={configuration:async()=>({provider:'fictional',model:'fictional-model',configRevision:revision}),complete:async({input})=>{calls++;return {translations:input.messages.map(({id,text})=>({id,text:`中文 ${text}`}))};}};
 const scope={accountId:'merchant',chatId:'customer-one'},messages=[{id:'message-1',text:'Hello'}],payload={scope,messages};
 const first=new ChatTranslationCache(directory);assert.equal((await first.translate(settings,payload)).translations[0].text,'中文 Hello');assert.equal(calls,1);
 const restored=new ChatTranslationCache(directory);assert.deepEqual((await restored.lookup(settings,payload)).translations,[{id:'message-1',text:'中文 Hello'}]);
 assert.equal((await restored.translate(settings,payload)).translations[0].text,'中文 Hello');assert.equal(calls,1);
 assert.deepEqual((await restored.lookup(settings,{scope:{...scope,chatId:'customer-two'},messages})).translations,[]);
 await restored.translate(settings,{scope,messages:[{id:'message-1',text:'Hello again'}]});assert.equal(calls,2);
 revision=2;assert.deepEqual((await restored.lookup(settings,payload)).translations,[]);await restored.translate(settings,payload);assert.equal(calls,3);
});
