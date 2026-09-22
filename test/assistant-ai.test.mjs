import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {migrateOrderDatabase} from '../src/orders/database.mjs';
import {OrderAppService} from '../src/orders/order-app-service.mjs';
import {ORDER_MIGRATIONS} from '../src/orders/migrations/index.mjs';
import {assistantPhoneCheck} from '../src/orders/assistant-phone.mjs';
const setup=t=>{
 const db=new DatabaseSync(':memory:');migrateOrderDatabase(db);t.after(()=>db.close());let config={provider:'deepseek',model:'fictional-model',configRevision:1},calls=[];
 const gateway={configuration:async()=>({...config}),complete:async p=>{calls.push(p);return p.purpose==='translation'?{translations:p.input.messages.map(m=>({id:m.id,text:'模拟中文 '+m.text}))}:{text:'Fictional reply only.',chinese:'虚构回复'};}};
 const app=new OrderAppService({database:db,aiGateway:gateway}),one=app.drafts.create({requestId:'fictional-ai-one'}),two=app.drafts.create({requestId:'fictional-ai-two'});
 for(const id of [one.id,two.id])db.prepare('UPDATE order_assistant SET binding_revision=1,scope_start=?,scope_end=?,chat_id=? WHERE order_id=?').run('2026-09-12T00:00:00.000Z','2026-09-13T00:00:00.000Z','fictional-chat',id);
 const add=(id,m,text='Fictional question',direction='customer',at='2026-09-12T08:00:00.000Z')=>db.prepare('INSERT INTO order_chat_messages(order_id,binding_revision,message_id,direction,sent_at,body) VALUES(?,1,?,?,?,?)').run(id,m,direction,at,text);
 const args=()=>({...app.assistant.workspace.state({orderId:one.id}),purpose:'reply'});
 return {db,app,one,two,add,gateway,calls,args,changeConfig:()=>config.configRevision++};
};
test('AI translation cache preserves original, order isolation, batches 0/1/20/21 and configuration versions',async t=>{
 const f=setup(t),ai=f.app.assistant.ai;assert.equal((await ai.translations({orderId:f.one.id,messageIds:[],generate:true})).generated,0);
 for(let n=0;n<21;n++)f.add(f.one.id,'m'+n,'AED 25 each, not accepted '+n);f.add(f.two.id,'m0','Other order');
 const ids=Array.from({length:21},(_,n)=>'m'+n);assert.equal((await ai.translations({orderId:f.one.id,messageIds:ids})).remaining,21);assert.equal(f.calls.length,0);
 assert.equal((await ai.translations({orderId:f.one.id,messageIds:ids,generate:true})).generated,20);assert.equal((await ai.translations({orderId:f.one.id,messageIds:ids,generate:true})).generated,1);assert.equal(f.calls.length,2);
 assert.equal((await ai.translations({orderId:f.one.id,messageIds:ids,generate:true})).generated,0);assert.equal(f.calls.length,2);
 assert.equal((await ai.translations({orderId:f.two.id,messageIds:['m0']})).remaining,1);
 assert.equal(f.app.assistant.workspace.messages({orderId:f.one.id}).messages[0].text,'AED 25 each, not accepted 0');f.changeConfig();assert.equal((await ai.translations({orderId:f.one.id,messageIds:ids})).remaining,21);
});
test('AI rejects invalid IDs and malformed or partial translations atomically',async t=>{
 const f=setup(t);f.add(f.one.id,'a');f.add(f.one.id,'b');
 await assert.rejects(f.app.assistant.ai.translations({orderId:f.one.id,messageIds:['missing'],generate:true}),/不属于/);assert.equal(f.calls.length,0);
 for(const value of [{translations:[{id:'a',text:'partial'}]},{translations:[{id:'a',text:'x'},{id:'a',text:'y'}]},{translations:[{id:'a',text:'x'},{id:'b',text:''}]}]){
  f.gateway.complete=async()=>value;await assert.rejects(f.app.assistant.ai.translations({orderId:f.one.id,messageIds:['a','b'],generate:true}));assert.equal(f.db.prepare('SELECT count(*) n FROM order_assistant_ai_cache').get().n,0);
 }
});
test('AI selected customer and latest fallback use current order; proactive/intent translation validate inputs',async t=>{
 const f=setup(t);f.add(f.one.id,'a','First');f.add(f.one.id,'b','Latest','customer','2026-09-12T08:01:00.000Z');f.add(f.one.id,'merchant','Merchant','merchant');f.add(f.two.id,'other','Other');
 await f.app.assistant.ai.generate(f.args());assert.equal(f.calls.at(-1).input.reference.id,'b');assert.deepEqual(f.calls.at(-1).input.context.draft,f.app.drafts.state(f.one.id));
 let state=f.app.assistant.workspace.save({...f.args(),patch:{replyMessageId:'a',tone:'brief',intent:'只核对地址'}});await f.app.assistant.ai.generate(state);assert.equal(f.calls.at(-1).input.reference.text,'First');assert.equal(f.calls.at(-1).input.tone,'brief');
 f.app.assistant.workspace.save({...state,patch:{replyMessageId:'merchant'}});await assert.rejects(f.app.assistant.ai.generate(f.args()),/客户消息/);
 state=f.app.assistant.workspace.save({...f.args(),patch:{mode:'proactive',intent:''}});await assert.rejects(f.app.assistant.ai.generate(state),/中文意图/);
 state=f.app.assistant.workspace.save({...state,patch:{intent:'请提供地址，不承诺时效'}});await f.app.assistant.ai.generate({...state,purpose:'translate-intent'});assert.equal(f.calls.at(-1).input.context,null);assert.equal(f.calls.at(-1).input.reference,null);
});
test('AI failed generation and stale saves preserve existing draft and business order',async t=>{
 const f=setup(t);f.add(f.one.id,'a');f.app.assistant.workspace.save({...f.args(),patch:{draft:'Human draft'}});const detail=f.app.detail({id:f.one.id});
 for(const complete of [async()=>{throw Error('Fictional network failure');},async()=>({text:''})]){f.gateway.complete=complete;await assert.rejects(f.app.assistant.ai.generate(f.args()));assert.equal(f.args().values.draft,'Human draft');assert.deepEqual(f.app.detail({id:f.one.id}),detail);}
});
test('AI late response rejects edited input, changed order, changed binding/read or model, and shares per-order exclusion',async t=>{
 const f=setup(t);f.add(f.one.id,'a');
 for(const mutation of [()=>f.app.assistant.workspace.save({...f.args(),patch:{draft:'Human newer'}}),()=>f.db.prepare('UPDATE orders SET draft_revision=draft_revision+1 WHERE id=?').run(f.one.id),()=>f.db.prepare('UPDATE order_assistant SET read_revision=read_revision+1 WHERE order_id=?').run(f.one.id),()=>f.changeConfig(),()=>f.db.prepare('UPDATE order_assistant SET binding_revision=binding_revision+1 WHERE order_id=?').run(f.one.id)]){
  let release,started;const reached=new Promise(r=>started=r);f.gateway.complete=()=>{started();return new Promise(r=>release=r);};const request=f.app.assistant.ai.generate(f.args());await reached;
  await assert.rejects(f.app.assistant.ai.generate(f.args()),/进行中/);mutation();release({text:'Old result'});await assert.rejects(request,e=>e.code==='ASSISTANT_AI_STALE');assert.notEqual(f.args().values.draft,'Old result');
 }
});
test('AI stale translation and transaction rollback never leave partial cache',async t=>{
 const f=setup(t);f.add(f.one.id,'a');let release,started;const reached=new Promise(r=>started=r);f.gateway.complete=()=>{started();return new Promise(r=>release=r);};
 const request=f.app.assistant.ai.translations({orderId:f.one.id,messageIds:['a'],generate:true});await reached;f.db.prepare('UPDATE order_assistant SET read_revision=read_revision+1 WHERE order_id=?').run(f.one.id);release({translations:[{id:'a',text:'old'}]});await assert.rejects(request,e=>e.code==='ASSISTANT_AI_STALE');
 f.gateway.complete=async()=>({translations:[{id:'a',text:'new'}]});f.db.exec("CREATE TRIGGER fail_cache BEFORE INSERT ON order_assistant_ai_cache BEGIN SELECT RAISE(ABORT,'fictional storage failure'); END");await assert.rejects(f.app.assistant.ai.translations({orderId:f.one.id,messageIds:['a'],generate:true}),/storage failure/);assert.equal(f.db.prepare('SELECT count(*) n FROM order_assistant_ai_cache').get().n,0);
});
test('migration 20→21 failure rolls back new cache table and preserves reply payload',t=>{
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());migrateOrderDatabase(db,ORDER_MIGRATIONS.slice(0,20));const app=new OrderAppService({database:db}),one=app.drafts.create({requestId:'migration21'});const before=app.assistant.workspace.save({...app.assistant.workspace.state({orderId:one.id}),patch:{draft:'Saved before upgrade'}});
 const migration=ORDER_MIGRATIONS.find(m=>m.version===21);assert.throws(()=>migrateOrderDatabase(db,[{...migration,statements:[...migration.statements,'INVALID SQL']} ]));assert.equal(db.prepare('SELECT max(version) v FROM schema_migrations').get().v,20);assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name='order_assistant_ai_cache'").get(),undefined);assert.deepEqual(app.assistant.workspace.state({orderId:one.id}),before);migrateOrderDatabase(db);assert.deepEqual(app.assistant.workspace.state({orderId:one.id}),before);
});

test('AI validates order versions after the final asynchronous settings lookup',async t=>{
 const f=setup(t);f.add(f.one.id,'a');let lookups=0,release,started;const reached=new Promise(r=>started=r);f.gateway.configuration=async()=>{if(++lookups===2){started();await new Promise(r=>release=r);}return {provider:'fictional',model:'simulation',configRevision:1};};
 const request=f.app.assistant.ai.generate(f.args());await reached;f.app.assistant.workspace.save({...f.args(),patch:{draft:'Human edit during settings wait'}});release();await assert.rejects(request,e=>e.code==='ASSISTANT_AI_STALE');assert.equal(f.args().values.draft,'Human edit during settings wait');
});

test('literal translations work with incomplete history, quoted/edited English and associated older messages, skipping only absent bodies',async t=>{
 const f=setup(t),ai=f.app.assistant.ai;f.add(f.one.id,'english','Please confirm your address.');f.add(f.one.id,'quoted','Discount is ten percent.');f.add(f.one.id,'picture','[图片]');
 f.db.prepare('UPDATE order_chat_messages SET metadata=? WHERE message_id IN (?,?)').run(JSON.stringify({incomplete:true,messageType:'chat'}),'quoted','picture');
 f.db.prepare('UPDATE order_assistant SET account_id=?,read_issue=? WHERE order_id=?').run('fictional-account','本单含未完整同步的非文字、引用或编辑内容；请在 WhatsApp 核对',f.one.id);
 f.db.prepare('INSERT INTO assistant_chat_archive VALUES(?,?,?,?,?,?,?)').run('fictional-account','fictional-chat','old','customer','2026-09-01T00:00:00.000Z','Older English question','{}');
 const ids=['english','quoted','picture','old'],r=await ai.translations({orderId:f.one.id,messageIds:ids,generate:true});assert.equal(r.generated,3);assert.deepEqual(r.skipped,['picture']);assert.deepEqual(f.calls[0].input.messages.map(m=>m.id),['english','quoted','old']);assert.equal(f.calls[0].input.context,undefined);
 await assert.rejects(ai.generate(f.args()),/未完整同步/);assert.equal(f.calls.length,1);assert.equal((await ai.translations({orderId:f.one.id,messageIds:ids,generate:true})).generated,0);assert.equal(f.calls.length,1);
 f.db.prepare('INSERT INTO assistant_chat_archive VALUES(?,?,?,?,?,?,?)').run('another-account','fictional-chat','foreign','customer','2026-09-01T00:00:00.000Z','Private foreign English','{}');await assert.rejects(ai.translations({orderId:f.one.id,messageIds:['foreign'],generate:true}),/不属于/);assert.equal(f.calls.length,1);
 f.changeConfig();f.db.prepare('UPDATE order_assistant SET read_issue=? WHERE order_id=?').run('聊天同步未完成；已保存记录和草稿保留',f.one.id);assert.equal((await ai.translations({orderId:f.one.id,messageIds:['english'],generate:true})).generated,1);
});

test('phone comparison normalizes national/international forms without matching trailing digits or guessing countries',()=>{
 for(const phone of ['0500000002','+971 50 000 0002','00971-50-000-0002','971500000002'])assert.equal(assistantPhoneCheck({phone,country:'United Arab Emirates'},'wa-phone:971500000002').matches,true);
 assert.equal(assistantPhoneCheck({phone:'0500000999',country:'United Arab Emirates'},'wa-phone:628000000001').matches,false);
 assert.equal(assistantPhoneCheck({phone:'0500000002',country:''},'wa-phone:971500000002').matches,false);
 assert.equal(assistantPhoneCheck({phone:'+62500000002'},'wa-phone:971500000002').matches,false);
 assert.equal(assistantPhoneCheck({phone:''},'wa-phone:971500000002').status,'missing');
 assert.equal(assistantPhoneCheck({phone:'+971500000002 ext 2'},'wa-phone:971500000002').matches,false);
});

test('phone mismatch is advisory; multilingual translation, copy and explicit binding remain usable without changing customer data',async t=>{
 const f=setup(t);f.add(f.one.id,'english','Please confirm your address.');f.db.prepare('UPDATE orders SET customer_phone=?,country=? WHERE id=?').run('0500000999','United Arab Emirates',f.one.id);f.db.prepare('UPDATE order_assistant SET chat_id=? WHERE order_id=?').run('wa-phone:628000000001',f.one.id);
 f.db.prepare('UPDATE order_assistant SET account_id=? WHERE order_id=?').run('fictional-account',f.one.id);f.app.assistant.chat={resolve:async({accountId,chatId})=>({accountId,chatId})};const before=f.app.detail({id:f.one.id});assert.equal(f.app.assistant.status({orderId:f.one.id}).phoneCheck.matches,false);assert.equal(f.args().capabilities.translation,true);
 await f.app.assistant.bind({orderId:f.one.id,accountId:'fictional-account',chatId:'wa-phone:628000000001',scopeStart:'2026-09-12T00:00:00Z',scopeEnd:'2026-09-13T00:00:00Z',confirmed:true});
 f.add(f.one.id,'arabic','هل يمكنك تأكيد العنوان؟');f.add(f.one.id,'french','Merci de confirmer votre adresse.');
 f.db.prepare('UPDATE order_assistant SET read_issue=? WHERE order_id=?').run('本单含未完整同步内容，请核对',f.one.id);
 const ids=['english','arabic','french'];assert.equal((await f.app.assistant.ai.translations({orderId:f.one.id,messageIds:ids,generate:true})).generated,3);assert.deepEqual(f.calls[0].input.messages.map(m=>m.id),ids);assert.equal(f.calls[0].input.language,'zh');assert.equal(f.calls[0].input.context,undefined);
 f.app.assistant.workspace.save({...f.args(),patch:{draft:'Human draft survives advisory'}});assert.equal(f.app.assistant.workspace.replyForCopy(f.args()),'Human draft survives advisory');assert.deepEqual(f.app.detail({id:f.one.id}),before);assert.equal(f.app.assistant.status({orderId:f.one.id}).messageCount,3);
 await assert.rejects(f.app.assistant.ai.generate(f.args()),/未完整同步/);f.db.prepare('UPDATE order_assistant SET read_issue=NULL WHERE order_id=?').run(f.one.id);assert.equal((await f.app.assistant.ai.generate(f.args())).text,'Fictional reply only.');
 f.db.prepare('UPDATE orders SET customer_phone=?,country=? WHERE id=?').run('','',f.one.id);assert.equal(f.app.assistant.status({orderId:f.one.id}).phoneCheck.status,'missing');assert.equal(f.args().capabilities.translation,true);f.changeConfig();assert.equal((await f.app.assistant.ai.translations({orderId:f.one.id,messageIds:ids,generate:true})).generated,3);
});
