import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {translateManualReply,generateManualAssistantDraft,recognizeImageText} from '../src/manual-translation.mjs';import {AssistantSettings} from '../src/orders/assistant-settings.mjs';
test('manual translation submits only the typed Chinese using the existing translation purpose and preserves emoji counts',async()=>{
 let request;const service={configuration:async()=>({model:'fictional'}),complete:async value=>{request=value;return {text:'Thank you 😊',chinese:'感谢你'};}};
 const result=await translateManualReply(service,{text:'感谢你的支持😊😊🙏',customer:'must not be sent'});
 assert.deepEqual(request,{configuration:{model:'fictional'},purpose:'translate-intent',input:{intent:'感谢你的支持😊😊🙏'}});assert.equal(result.text,'Thank you 😊😊🙏');assert.equal(result.chinese,'感谢你');
});
test('invalid input and incomplete output never become translated drafts',async()=>{
 let calls=0;const service={configuration:async()=>({}),complete:async()=>{calls++;return {text:'',chinese:'中文'};}};
 await assert.rejects(translateManualReply(service,{text:''}),/输入/);await assert.rejects(translateManualReply(service,{text:'x'.repeat(6001)}),/6000/);assert.equal(calls,0);await assert.rejects(translateManualReply(service,{text:'感谢你的支持'}),/不完整/);assert.equal(calls,1);
});
test('AI reply draft uses only a bounded verified conversation and never sends a message',async()=>{
 let request,calls=0;const service={configuration:async()=>({provider:'fictional',model:'fictional-model',configRevision:3}),complete:async value=>{calls++;request=value;return {text:'Please confirm the fictional delivery address.',chinese:'请确认虚构收货地址。'};}};
 const messages=[{id:'merchant-1',direction:'merchant',sentAt:'2026-09-24T00:00:00.000Z',text:'Hello.'},{id:'customer-2',direction:'customer',sentAt:'2026-09-24T00:01:00.000Z',text:'Could you confirm the fictional delivery address?'}];
 const result=await generateManualAssistantDraft(service,{intent:'请礼貌确认虚构地址',referenceMessageId:'customer-2',messages,rendererMessages:[{id:'other-chat',text:'must not be used'}]});
 assert.deepEqual(result,{text:'Please confirm the fictional delivery address.',chinese:'请确认虚构收货地址。',referenceId:'customer-2',note:'AI 草稿请人工核对后使用，未发送消息。'});
 assert.deepEqual(request,{purpose:'reply',configuration:{provider:'fictional',model:'fictional-model',configRevision:3},input:{mode:'reply',tone:'professional',intent:'请礼貌确认虚构地址',reference:messages[1],context:null,conversation:messages}});assert.equal(calls,1);
});
test('AI reply draft rejects an invalid reference or missing evidence before requesting AI',async()=>{
 let calls=0;const service={configuration:async()=>({}),complete:async()=>{calls++;return {text:'must not be used',chinese:'不得使用'};}};
 await assert.rejects(generateManualAssistantDraft(service,{intent:'',messages:[{id:'merchant-1',direction:'merchant',sentAt:'2026-09-24T00:00:00.000Z',text:'Fictional merchant text'}]}),/中文意图/);
 await assert.rejects(generateManualAssistantDraft(service,{intent:'虚构意图',referenceMessageId:'other-chat',messages:[{id:'customer-1',direction:'customer',sentAt:'2026-09-24T00:00:00.000Z',text:'Fictional customer text'}]}),/当前客户会话/);assert.equal(calls,0);
});
test('image text recognition sends only a validated image to the configured vision request',async()=>{
 let request;const dataUrl='data:image/png;base64,eA==',service={configuration:async()=>({model:'fictional-vision'}),complete:async value=>{request=value;return {text:'ORDER KY40\nAED 250.00'};}};
 assert.deepEqual(await recognizeImageText(service,{dataUrl,other:'not forwarded'}),{text:'ORDER KY40\nAED 250.00'});
 assert.deepEqual(request,{purpose:'image-ocr',input:{image:dataUrl},configuration:{model:'fictional-vision'}});
 await assert.rejects(recognizeImageText(service,{dataUrl:'data:image/gif;base64,eA=='}),/PNG、JPEG 或 WebP/);
});
test('configured image recognition uses multimodal content and records the manual AI purpose',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'manual-image-text-'));t.after(()=>rm(dir,{recursive:true,force:true}));let body;
 const settings=new AssistantSettings({userDataPath:dir,safeStorage:{isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(s),decryptString:b=>b.toString()},promptKey:async()=> 'fictional-image-key',fetchImpl:async(_url,options)=>{body=JSON.parse(options.body);return {ok:true,status:200,text:async()=>JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({text:'Fictional image text'})}}]})};}});
 let state=await settings.get();await settings.changeKey({provider:state.activeProvider,revision:state.revision});const dataUrl='data:image/png;base64,eA==';assert.deepEqual(await recognizeImageText(settings,{dataUrl}),{text:'Fictional image text'});assert.equal(body.messages[1].content[1].type,'image_url');assert.equal(body.messages[1].content[1].image_url.url,dataUrl);state=await settings.get();assert.equal(state.ledger.at(-1).purpose,'image-ocr');
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
