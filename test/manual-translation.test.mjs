import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {translateManualReply} from '../src/manual-translation.mjs';import {AssistantSettings} from '../src/orders/assistant-settings.mjs';
test('manual translation submits only the typed Chinese using the existing translation purpose and preserves emoji counts',async()=>{
 let request;const service={configuration:async()=>({model:'fictional'}),complete:async value=>{request=value;return {text:'Thank you 😊',chinese:'感谢你'};}};
 const result=await translateManualReply(service,{text:'感谢你的支持😊😊🙏',customer:'must not be sent'});
 assert.deepEqual(request,{configuration:{model:'fictional'},purpose:'translate-intent',input:{intent:'感谢你的支持😊😊🙏'}});assert.equal(result.text,'Thank you 😊😊🙏');assert.equal(result.chinese,'感谢你');
});
test('invalid input and incomplete output never become translated drafts',async()=>{
 let calls=0;const service={configuration:async()=>({}),complete:async()=>{calls++;return {text:'',chinese:'中文'};}};
 await assert.rejects(translateManualReply(service,{text:''}),/输入/);await assert.rejects(translateManualReply(service,{text:'x'.repeat(6001)}),/6000/);assert.equal(calls,0);await assert.rejects(translateManualReply(service,{text:'感谢你的支持'}),/不完整/);assert.equal(calls,1);
});
test('manual translation uses the configured connector, errors preserve limits and no automatic retries occur',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'manual-translation-'));t.after(()=>rm(dir,{recursive:true,force:true}));let calls=0,last;
 const settings=new AssistantSettings({userDataPath:dir,safeStorage:{isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(s),decryptString:b=>b.toString()},promptKey:async()=> 'fictional-translation-key',fetchImpl:async(_url,options)=>{calls++;last=JSON.parse(options.body);return {ok:true,status:200,text:async()=>JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({text:'Thank you for your support.',chinese:'感谢你的支持。'})}}]})};}});
 await assert.rejects(translateManualReply(settings,{text:'感谢你的支持'}),/密钥/);assert.equal(calls,0);
 let state=await settings.get();await settings.changeKey({provider:state.activeProvider,revision:state.revision});
 const result=await translateManualReply(settings,{text:'感谢你的支持'});assert.equal(result.text,'Thank you for your support.');assert.deepEqual(JSON.parse(last.messages[1].content),{intent:'感谢你的支持'});assert.equal(calls,1);
 state=await settings.get();assert.equal(state.callsUsed,1);assert.equal(state.ledger[0].purpose,'translate-intent');
 settings.fetchImpl=async()=>{calls++;throw new Error('fictional outage');};await assert.rejects(translateManualReply(settings,{text:'感谢'}));assert.equal(calls,2);
});
