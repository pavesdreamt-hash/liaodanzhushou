import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,stat,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import {AssistantSettings} from '../src/orders/assistant-settings.mjs';
import {asyncSecretStorage} from '../src/core/async-secret-storage.mjs';
import {compatibleExtractor} from '../src/orders/assistant-connectors.mjs';
import {promptForApiKey,secretPromptScript} from '../src/core/native-secret-prompt.mjs';

function cryptoStore(){const key=randomBytes(32);return {
  isEncryptionAvailable:()=>true,
  encryptString:text=>{const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv),body=Buffer.concat([cipher.update(text,'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),body]);},
  decryptString:bytes=>{const cipher=createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));cipher.setAuthTag(bytes.subarray(12,28));return Buffer.concat([cipher.update(bytes.subarray(28)),cipher.final()]).toString();}
};}
const valid={fields:{fullName:{value:'Avery Example',messageIds:['probe-customer-1']}},items:[],quotes:[]};
const response=(value=valid)=>({ok:true,status:200,text:async()=>JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}]})});
async function fixture(t,extra={}){const dir=await mkdtemp(path.join(os.tmpdir(),'assistant-settings-unit-'));t.after(()=>rm(dir,{recursive:true,force:true}));const options={userDataPath:dir,safeStorage:cryptoStore(),promptKey:async()=> 'fictional-deepseek-key-86',fetchImpl:async()=>response(),...extra};return {dir,options,service:new AssistantSettings(options)};}
const payload=async(service,provider='deepseek',rest={})=>({provider,revision:(await service.get()).revision,...rest});

test('settings persist encrypted, providers remain independent, public state never contains keys',async t=>{
  const {service:s,options}=await fixture(t);assert.equal((await s.get()).providers.deepseek.hasApiKey,false);
  await s.changeKey(await payload(s));assert.equal((await s.get()).providers.deepseek.hasApiKey,true);
  await s.save(await payload(s,'openai',{model:'gpt-fictional'}));assert.equal((await s.get()).providers.openai.hasApiKey,false);
  s.promptKey=async()=> 'fictional-openai-key-86';await s.changeKey(await payload(s,'openai'));
  const bytes=await readFile(s.file);assert.equal(bytes.includes('fictional-'),false);assert.equal((await stat(s.file)).mode&0o777,0o600);
  const restarted=new AssistantSettings(options),state=await restarted.get();assert.equal(state.activeProvider,'openai');assert.equal(state.providers.openai.model,'gpt-fictional');assert.equal(state.providers.deepseek.hasApiKey,true);assert.doesNotMatch(JSON.stringify(state),/fictional-(?:deepseek|openai)-key/);
  await restarted.removeKey(await payload(restarted));assert.equal((await restarted.get()).providers.openai.hasApiKey,true);assert.equal((await restarted.get()).providers.deepseek.hasApiKey,false);
});
test('cancel and invalid key input keep the previous key and configuration',async t=>{
  const {service:s}=await fixture(t);await s.changeKey(await payload(s));const before=await readFile(s.file);
  s.promptKey=async()=>null;assert.equal((await s.changeKey(await payload(s))).canceled,true);assert.deepEqual(await readFile(s.file),before);
  s.promptKey=async()=> 'wrong key';await assert.rejects(s.changeKey(await payload(s)),/密钥格式无效/);assert.deepEqual(await readFile(s.file),before);
});
test('unavailable encryption cannot silently save plaintext or discard an existing store',async t=>{
  const {service:s,options}=await fixture(t);await s.changeKey(await payload(s));const before=await readFile(s.file);
  s.crypto.isEncryptionAvailable=()=>false;await assert.rejects(s.save(await payload(s,'deepseek',{model:'another-model'})),/安全存储/);assert.deepEqual(await readFile(s.file),before);
  await assert.rejects(new AssistantSettings(options).get(),/安全存储/);
});
test('save failure preserves the previous encrypted file and in-memory state',async t=>{
  const {service:s}=await fixture(t);await s.changeKey(await payload(s));const before=await readFile(s.file),state=await s.get();
  s.crypto.encryptString=()=>{throw new Error('fictional encryption failure');};await assert.rejects(s.save(await payload(s,'deepseek',{model:'not-saved'})),/保存失败/);
  assert.deepEqual(await s.get(),state);assert.deepEqual(await readFile(s.file),before);
});
test('opening settings never sends requests; plaintext key payloads and unknown providers are rejected',async t=>{
  let calls=0;const {service:s}=await fixture(t,{fetchImpl:async()=>{calls++;return response();}});
  await s.get();await s.get();assert.equal(calls,0);await assert.rejects(s.save({...await payload(s),model:'deepseek-flash',apiKey:'fictional-key'}),/设置已变化|模型名称/);
  await assert.rejects(s.changeKey(await payload(s,'bad-provider')),/设置已变化/);await assert.rejects(s.test(await payload(s)),/保存.*密钥/);assert.equal(calls,0);
});
test('provider-specific JSON request contracts and saved credentials are used',async t=>{
  const requests=[];const {service:s}=await fixture(t,{fetchImpl:async(url,options)=>{requests.push({url:String(url),...options,body:JSON.parse(options.body)});return response();}});
  await s.changeKey(await payload(s));await s.test(await payload(s));
  assert.equal(requests[0].url,'https://api.deepseek.com/chat/completions');assert.equal(requests[0].body.max_tokens,2500);assert.deepEqual(requests[0].body.thinking,{type:'disabled'});assert.equal(requests[0].body.max_completion_tokens,undefined);assert.equal(requests[0].body.store,undefined);assert.equal(requests[0].redirect,'error');
  await s.save(await payload(s,'openai',{model:'gpt-fictional'}));s.promptKey=async()=> 'fictional-openai-key-86';await s.changeKey(await payload(s,'openai'));await s.test(await payload(s,'openai'));
  assert.equal(requests[1].url,'https://api.openai.com/v1/chat/completions');assert.equal(requests[1].body.store,false);assert.equal(requests[1].body.max_completion_tokens,2500);assert.equal(requests[1].body.thinking,undefined);assert.notEqual(requests[0].headers.Authorization,requests[1].headers.Authorization);
});
test('successful sample test persists; five-call cap survives restart and provider changes',async t=>{
  let calls=0;const {service:s,options}=await fixture(t,{fetchImpl:async()=>{calls++;return response();}});await s.changeKey(await payload(s));
  for(let i=0;i<5;i++)await s.test(await payload(s));assert.equal((await s.get()).providers.deepseek.test.status,'verified');
  const restarted=new AssistantSettings(options);await assert.rejects(restarted.test(await payload(restarted)),/5 次/);assert.equal(calls,5);assert.equal((await restarted.get()).callsUsed,5);
});
test('401 errors are sanitized, count once, and do not retry',async t=>{
  let calls=0;const {service:s}=await fixture(t,{fetchImpl:async()=>{calls++;return {ok:false,status:401,text:async()=> 'fictional secret echoed by remote server'};}});await s.changeKey(await payload(s));
  await assert.rejects(s.test(await payload(s)),e=>e.message.includes('401')&&!e.message.includes('echoed'));assert.equal(calls,1);const state=await s.get();assert.equal(state.callsUsed,1);assert.equal(state.providers.deepseek.test.status,'failed');
});
test('changing settings during a request discards old results without resetting the consumed call',async t=>{
  let complete;const {service:s}=await fixture(t,{fetchImpl:()=>new Promise(resolve=>{complete=resolve;})});await s.changeKey(await payload(s));
  const pending=s.test(await payload(s));const rejected=assert.rejects(pending,/配置已变化/);
  while(!complete)await new Promise(resolve=>setImmediate(resolve));await s.save(await payload(s,'deepseek',{model:'new-model'}));complete(response());await rejected;
  const state=await s.get();assert.equal(state.providers.deepseek.model,'new-model');assert.equal(state.providers.deepseek.test,null);assert.equal(state.callsUsed,1);
});
test('wrong sample purchase, truncated JSON and interrupted requests cannot become verified',async t=>{
  const {service:s,options}=await fixture(t,{fetchImpl:async()=>response({...valid,items:[{sku:'KY02',quantity:1,price:'75'}]})});await s.changeKey(await payload(s));await assert.rejects(s.test(await payload(s)),/样本校验/);assert.equal((await s.get()).providers.deepseek.test.status,'failed');
  const extractor=compatibleExtractor({url:'https://api.deepseek.com',provider:'deepseek',model:'deepseek-flash',token:'fictional',fetchImpl:async()=>({ok:true,text:async()=>JSON.stringify({choices:[{finish_reason:'length',message:{content:JSON.stringify(valid)}}]})})});await assert.rejects(extractor.extract({messages:[]}),/有效提取 JSON/);
  const interrupted=structuredClone(s.state);interrupted.providers.deepseek.test={status:'testing'};await s.persist(interrupted);assert.equal((await new AssistantSettings(options).get()).providers.deepseek.test.status,'interrupted');
});
test('switching providers during a probe does not leave an unfinishable testing state',async t=>{
  let complete;const {service:s}=await fixture(t,{fetchImpl:()=>new Promise(resolve=>{complete=resolve;})});await s.changeKey(await payload(s));
  const pending=s.test(await payload(s)),rejected=assert.rejects(pending,/配置已变化/);
  while(!complete)await new Promise(resolve=>setImmediate(resolve));await s.save(await payload(s,'openai',{model:'gpt-fictional'}));complete(response());await rejected;
  await s.save(await payload(s,'deepseek',{model:'deepseek-flash'}));assert.equal((await s.get()).providers.deepseek.test.status,'interrupted');
});
test('corrupt encrypted settings fail visibly and are never silently replaced',async t=>{
  const {service:s,options}=await fixture(t);await s.save(await payload(s,'deepseek',{model:'deepseek-flash'}));await writeFile(s.file,'fictional damaged ciphertext');await assert.rejects(new AssistantSettings(options).get(),/解密或格式损坏/);assert.equal(await readFile(s.file,'utf8'),'fictional damaged ciphertext');
});
test('native key input uses a hidden macOS field, cancellation and errors do not expose secrets',async()=>{
  const script=secretPromptScript('DeepSeek');assert.match(script,/with hidden answer/);assert.doesNotMatch(script,/System Events|accessibility/);
  const key=await promptForApiKey('DeepSeek',{execute:async(file,args)=>{assert.equal(file,'/usr/bin/osascript');assert.equal(args.length,2);return {stdout:'fictional-local-key\n'};}});assert.equal(key,'fictional-local-key');
  assert.equal(await promptForApiKey('DeepSeek',{execute:async()=>{throw {stderr:'User canceled. (-128)'};}}),null);
  await assert.rejects(promptForApiKey('DeepSeek',{execute:async()=>{throw {stderr:'fictional-secret',message:'fictional-secret'};}}),e=>!e.message.includes('fictional-secret'));
});

test('fresh settings do not touch Keychain; asynchronous access has a bounded wait and never calls synchronous APIs',async t=>{
  let availability=0;
  const backend={isAsyncEncryptionAvailable:async()=>{availability++;return true;},encryptStringAsync:async text=>Buffer.from(text),decryptStringAsync:async bytes=>({result:bytes.toString()}),isEncryptionAvailable:()=>{throw new Error('must not call synchronous Keychain');}};
  const store=asyncSecretStorage(backend),{service:s}=await fixture(t,{safeStorage:store});
  assert.equal((await s.get()).secureStorageAvailable,null);await s.get();assert.equal(availability,0);
  assert.equal(await store.isEncryptionAvailable(),true);assert.equal(await store.decryptString(await store.encryptString('fictional')), 'fictional');
  let ticked=false;const blocked=asyncSecretStorage({isAsyncEncryptionAvailable:()=>new Promise(()=>{})},{timeoutMs:30});
  setTimeout(()=>{ticked=true;},1);await assert.rejects(blocked.isEncryptionAvailable(),e=>e.code==='AI_SECURE_STORAGE_PENDING'&&e.message.includes('重新检查'));assert.equal(ticked,true);
});
test('daily mode is explicit, bounded and cannot reset or bypass development verification budget',async t=>{
 let requests=0;let date=new Date('2026-09-13T00:00:00Z');const {service:s,options}=await fixture(t,{now:()=>date,fetchImpl:async()=>{requests++;return response();}});await s.changeKey(await payload(s));
 for(let i=0;i<5;i++)await s.test(await payload(s));assert.equal(requests,5);
 await s.setUsageMode(await payload(s,'deepseek',{usageMode:'daily'}));assert.equal((await s.get()).callsUsed,5);
 for(let i=0;i<20;i++)await s.extract({messages:[]});assert.equal((await s.get()).dailyCalls,20);await assert.rejects(()=>s.extract({messages:[]}),/20 次/);assert.equal(requests,25);
 const restarted=new AssistantSettings(options);assert.equal((await restarted.get()).dailyCalls,20);await assert.rejects(async()=>restarted.test(await payload(restarted)),/验证额度/);
 const development=new AssistantSettings({...options,verificationOnly:true});await assert.rejects(()=>development.extract({messages:[]}),/验证额度/);assert.equal(requests,25);
 date=new Date('2026-09-14T00:00:00Z');await restarted.extract({messages:[]});assert.equal((await restarted.get()).dailyCalls,1);assert.equal((await restarted.get()).callsUsed,5);
});

test('explicit secure-storage recheck recovers first-save denial without extra key prompts or AI calls',async t=>{
  let available=false,prompts=0,calls=0;const crypto=cryptoStore();crypto.isEncryptionAvailable=()=>available;
  const {service:s}=await fixture(t,{safeStorage:crypto,promptKey:async()=>{prompts++;return 'fictional-recheck-key';},fetchImpl:async()=>{calls++;return response();}});
  const initial=await s.get();assert.equal(initial.secureStorageAvailable,null);
  await assert.rejects(s.changeKey(await payload(s)),/安全存储/);assert.equal(prompts,0);
  available=true;const checked=await s.recheck();assert.equal(checked.secureStorageAvailable,true);assert.equal(checked.providers.deepseek.hasApiKey,false);assert.equal(checked.callsUsed,0);assert.equal(calls,0);assert.equal(prompts,0);
  await s.changeKey(await payload(s));assert.equal(prompts,1);assert.equal((await s.get()).providers.deepseek.hasApiKey,true);
});
test('late unlock reloads encrypted settings, reconnects extractor and preserves exhausted verification budget',async t=>{
  const {service:s,options}=await fixture(t);await s.changeKey(await payload(s));await s.persist({...s.state,callsUsed:5});const before=await readFile(s.file);let resolveDecrypt,changed=0,decryptCalls=0;
  const native=asyncSecretStorage({isAsyncEncryptionAvailable:async()=>true,decryptStringAsync:()=>{decryptCalls++;return new Promise(r=>resolveDecrypt=r);}},{timeoutMs:15});
  const restarted=new AssistantSettings({...options,safeStorage:native,onChanged:()=>changed++});
  await assert.rejects(restarted.get(),e=>e.code==='AI_SECURE_STORAGE_PENDING');await assert.rejects(restarted.recheck(),e=>e.code==='AI_SECURE_STORAGE_PENDING');assert.equal(decryptCalls,1);assert.equal(changed,0);
  resolveDecrypt({result:options.safeStorage.decryptString(before)});await Promise.resolve();
  const restored=await restarted.recheck();assert.equal(restored.providers.deepseek.hasApiKey,true);assert.equal(restored.callsUsed,5);assert.ok(changed>0);assert.ok(await restarted.connector());assert.equal(decryptCalls,1);assert.deepEqual(await readFile(s.file),before);
  await assert.rejects(restarted.test(await payload(restarted)),e=>e.code==='AI_CALL_LIMIT');
});

test('all AI purposes share persisted budget and sanitized ledger; cached config does not change when requests consume it',async t=>{
 let network=0;const {service:s,options}=await fixture(t,{simulation:true,fetchImpl:async(_url,request)=>{network++;const input=JSON.parse(JSON.parse(request.body).messages[1].content);return response(input.language?{translations:input.messages.map(m=>({id:m.id,text:'模拟中文'}))}:input.mode?{text:'Fictional reply.'}:valid);}});
 await s.changeKey(await payload(s));const config=await s.configuration();
 await s.complete({purpose:'translation',input:{language:'zh',messages:[{id:'fictional-a',text:'Fictional original'}]},configuration:config});
 await s.complete({purpose:'reply',input:{mode:'proactive',intent:'虚构意图'},configuration:config});
 await s.complete({purpose:'translate-intent',input:{mode:'proactive',intent:'虚构意图'},configuration:config});
 await s.extract({messages:[]});await s.test(await payload(s));assert.equal(network,5);assert.equal((await s.get()).callsUsed,5);assert.deepEqual(await s.configuration(),config);
 const restarted=new AssistantSettings(options);await assert.rejects(restarted.complete({purpose:'reply',input:{mode:'proactive'},configuration:config}),e=>e.code==='AI_CALL_LIMIT');assert.equal(network,5);
 const state=await restarted.get();assert.deepEqual(state.ledger.map(e=>e.purpose),['translation','reply','translate-intent','extraction','connection-test']);assert.ok(state.ledger.every(e=>e.status==='responded'&&e.simulation&&e.elapsedMs>=0));assert.doesNotMatch(JSON.stringify(state.ledger),/fictional|虚构意图|key|original/);
});
