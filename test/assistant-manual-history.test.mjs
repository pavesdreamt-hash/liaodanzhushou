import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {migrateOrderDatabase} from '../src/orders/database.mjs';
import {OrderAppService} from '../src/orders/order-app-service.mjs';
function setup(t){
 const database=new DatabaseSync(':memory:');migrateOrderDatabase(database);t.after(()=>database.close());
 let reads=0,resumes=0,fail=false,foreign=false;
 const old={id:'old',direction:'customer',sentAt:'2026-09-11T08:00:00Z',text:'Fictional old history'},current={id:'current',direction:'customer',sentAt:'2026-09-13T08:00:00Z',text:'Fictional current history'};
 const chat={mode:'browser',resolve:async p=>({accountId:p.accountId,chatId:p.chatId,binding:{accountId:p.accountId,chatId:p.chatId}}),resume:async()=>resumes++,readUpdates:async()=>assert.fail('No background read is permitted'),readHistory:async({onBatch})=>{reads++;await onBatch([old],{complete:false});if(foreign)database.prepare('UPDATE order_assistant SET binding_revision=binding_revision+1 WHERE order_id=?').run(one.id);if(fail)throw Error('Fictional history failure');await onBatch([current],{complete:false});}};
 const app=new OrderAppService({database,chatAdapter:chat,clock:()=>new Date('2026-09-17T08:00:00Z')}),one=app.drafts.create({requestId:'manual-one'});
 const bind=p=>app.assistant.bind({orderId:one.id,accountId:'fictional-account',chatId:'fictional-chat',scopeStart:'2026-09-12T00:00:00Z',scopeEnd:'2026-09-14T00:00:00Z',confirmed:true,...p});
 return {app,database,one,bind,get reads(){return reads;},get resumes(){return resumes;},set fail(v){fail=v;},set foreign(v){foreign=v;}};
}
test('first explicitly confirmed association archives older history once, limits order evidence and preserves the reply',async t=>{
 const f=setup(t),w=f.app.assistant.workspace.state({orderId:f.one.id});f.app.assistant.workspace.save({...w,patch:{draft:'Human original reply'}});
 await f.bind({historyConsent:true});assert.equal(f.reads,1);assert.equal(f.app.assistant.history.state({orderId:f.one.id}).count,2);assert.equal(f.app.assistant.status({orderId:f.one.id}).messageCount,1);
 assert.equal(f.app.assistant.history.state({orderId:f.one.id}).progress.complete,false);
 await f.bind({historyConsent:true});assert.equal(f.reads,1);
 assert.equal(f.app.assistant.workspace.state({orderId:f.one.id}).values.draft,'Human original reply');
 await f.app.assistant.history.refresh({orderId:f.one.id});assert.equal(f.reads,2);assert.equal(f.app.assistant.history.state({orderId:f.one.id}).count,2);
});
test('no history consent or a restricted connector never expands association reads',async t=>{
 const f=setup(t);await f.bind();assert.equal(f.reads,0);f.app.assistant.chat.restriction={messageIds:['current']};await f.bind({historyConsent:true});assert.equal(f.reads,0);
});
test('partial first read retains successful batches and association, then waits for a manual retry',async t=>{
 const f=setup(t);f.fail=true;const r=await f.bind({historyConsent:true});assert.match(r.syncNotice,/首次历史补取未完成/);assert.equal(f.app.assistant.history.state({orderId:f.one.id}).count,1);assert.equal(f.app.assistant.status({orderId:f.one.id}).chat_id,'fictional-chat');
 await f.bind({historyConsent:true});assert.equal(f.reads,1);f.fail=false;await f.app.assistant.history.refresh({orderId:f.one.id});assert.equal(f.reads,2);assert.equal(f.app.assistant.history.state({orderId:f.one.id}).count,2);
});
test('startup, restart and restored enabled approvals cannot reopen WhatsApp or read messages',async t=>{
 const f=setup(t);await f.bind();const b=f.app.assistant.row(f.one.id);f.database.prepare('INSERT INTO assistant_online_sync VALUES(?,?,?,?,1,3,?,?)').run(f.one.id,b.binding_revision,b.account_id,b.chat_id,'{"status":"online"}',new Date().toISOString());
 for(const a of [f.app,new OrderAppService({database:f.database,chatAdapter:f.app.assistant.chat})]){
  a.assistant.online.start();await a.assistant.online.tick();assert.equal(a.assistant.online.timer,null);assert.equal(a.assistant.online.state({orderId:f.one.id}).enabled,false);assert.equal(a.assistant.online.state({orderId:f.one.id}).canEnable,false);assert.throws(()=>a.assistant.online.configure({orderId:f.one.id,revision:3,enabled:true,confirmed:true}),/自动刷新已停用/);
 }
 assert.equal(f.resumes,0);assert.equal(f.reads,0);assert.equal(f.app.assistant.online.row(f.one.id).enabled,1);
});
test('restored continuous sync settings are ineffective and enabling them is rejected',t=>{
 const f=setup(t),s=f.app.assistant.policy.state();f.database.prepare('UPDATE assistant_policy SET payload=? WHERE id=1').run(JSON.stringify({...s.values,continuousSync:true}));assert.equal(f.app.assistant.policy.state().values.continuousSync,false);assert.throws(()=>f.app.assistant.policy.save({revision:s.revision,patch:{continuousSync:true}}),/自动刷新已停用/);
});
test('binding changes during the first read discard the stale batch without assigning it to the new order context',async t=>{
 const f=setup(t);f.foreign=true;const r=await f.bind({historyConsent:true});assert.match(r.syncNotice,/首次历史补取未完成/);assert.equal(f.app.assistant.history.state({orderId:f.one.id}).count,1);assert.equal(f.app.assistant.status({orderId:f.one.id}).messageCount,0);
});
