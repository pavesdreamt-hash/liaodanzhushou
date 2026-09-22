import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,mkdir,readdir,rm} from 'node:fs/promises';
import path from 'node:path';import os from 'node:os';
import {normalizeChatRange} from '../src/orders/assistant-range.mjs';
import {WhatsAppBrowser,chatError} from '../src/orders/whatsapp-browser.mjs';
import {migrateOrderDatabase,openOrderDatabase,orderDatabasePath} from '../src/orders/database.mjs';
import {ORDER_MIGRATIONS} from '../src/orders/migrations/index.mjs';
import {OrderAppService} from '../src/orders/order-app-service.mjs';
import {automaticBackupDirectory,validateOrderDatabaseFile,createVerifiedBackup} from '../src/orders/order-data-protection.mjs';
import {asyncSecretStorage} from '../src/core/async-secret-storage.mjs';

test('native authorization stays single-flight across timeout, retry and late completion',async()=>{
  let resolveAvailability,resolveDecrypt,availabilityCalls=0,decryptCalls=0,encryptCalls=0;
  const store=asyncSecretStorage({isAsyncEncryptionAvailable:()=>{availabilityCalls++;return new Promise(r=>resolveAvailability=r);},decryptStringAsync:()=>{decryptCalls++;return new Promise(r=>resolveDecrypt=r);},encryptStringAsync:async()=>{encryptCalls++;return Buffer.from('fictional cipher');}},{timeoutMs:15});
  for(let i=0;i<3;i++)await assert.rejects(store.isEncryptionAvailable(),e=>e.code==='AI_SECURE_STORAGE_PENDING');
  assert.equal(availabilityCalls,1);resolveAvailability(true);await Promise.resolve();assert.equal(await store.isEncryptionAvailable(),true);assert.equal(availabilityCalls,1);
  const bytes=Buffer.from('fictional encrypted settings');
  await assert.rejects(store.decryptString(bytes),e=>e.code==='AI_SECURE_STORAGE_PENDING');await assert.rejects(store.decryptString(bytes),e=>e.code==='AI_SECURE_STORAGE_PENDING');
  await assert.rejects(store.encryptString('unrelated operation'),e=>e.code==='AI_SECURE_STORAGE_PENDING');assert.equal(encryptCalls,0);assert.equal(decryptCalls,1);
  resolveDecrypt({result:'fictional decrypted settings'});await Promise.resolve();assert.equal(await store.decryptString(bytes),'fictional decrypted settings');assert.equal(decryptCalls,1);
});
test('denied native authorization can be explicitly retried without using plaintext fallback',async()=>{
  let calls=0;const store=asyncSecretStorage({isAsyncEncryptionAvailable:async()=>++calls>1});assert.equal(await store.isEncryptionAvailable(),false);assert.equal(await store.isEncryptionAvailable(),true);assert.equal(calls,2);
});
test('range validation uses one rule and latest is bounded by the current read time',()=>{
  const now=new Date('2026-09-13T07:29:00Z');
  assert.throws(()=>normalizeChatRange({from:'2026-09-01T06:35:00Z',to:'2026-09-13T07:35:00Z',now}),/结束时间晚于/);
  assert.throws(()=>normalizeChatRange({from:'',endMode:'latest',now}),/开始时间/);
  assert.throws(()=>normalizeChatRange({from:'2026-09-14T00:00:00Z',endMode:'latest',now}),/开始时间晚于/);
  assert.throws(()=>normalizeChatRange({from:'2026-09-13T07:00:00Z',to:'2026-09-13T06:00:00Z',now}),/不能晚于/);
  assert.equal(normalizeChatRange({from:'2026-09-13T06:00:00Z',endMode:'latest',now}).to,now.toISOString());
});
test('inspecting another order does not destroy a valid candidate; expired and changed targets still fail',async()=>{
  const b=new WhatsAppBrowser({userDataPath:'/unused'}),identity={accountId:'fictional-account',chatId:'fictional-chat'};b.currentIdentity=async()=>identity;
  const first=await b.inspect();await b.inspect();assert.equal((await b.resolve({...identity,candidateToken:first.token})).chatId,identity.chatId);
  b.candidates.get(first.token).expires=Date.now()-1;await assert.rejects(b.resolve({...identity,candidateToken:first.token}),e=>e.code==='WHATSAPP_CANDIDATE_EXPIRED');
  const fresh=await b.inspect();b.currentIdentity=async()=>({...identity,chatId:'another-fictional-chat'});await assert.rejects(b.resolve({...identity,candidateToken:fresh.token}),e=>e.code==='WHATSAPP_TARGET_CHANGED');
});
function fixture(){const db=new DatabaseSync(':memory:');migrateOrderDatabase(db);let now=new Date('2026-09-13T07:00:00Z');let resolveCalls=0;const chat={resolve:async p=>{resolveCalls++;return p;},read:async()=>[]};const app=new OrderAppService({database:db,chatAdapter:chat,clock:()=>now.getTime()});const id=app.drafts.create({requestId:'fictional-fixes-order'}).id;const bind=p=>app.assistant.bind({orderId:id,accountId:'fictional-account',chatId:'fictional-chat',scopeStart:'2026-09-13T06:00:00Z',scopeEnd:'2026-09-13T07:00:00Z',confirmed:true,...p});return {db,chat,app,id,bind,setNow:d=>now=new Date(d),resolveCalls:()=>resolveCalls};}
test('future binding is rejected before browser access; latest advances only on a successful read',async()=>{
  const f=fixture();try{
    await assert.rejects(f.bind({scopeEnd:'2026-09-13T07:35:00Z'}),/结束时间晚于/);assert.equal(f.resolveCalls(),0);assert.equal(f.app.assistant.status({orderId:f.id}).chat_id,null);
    await f.bind({endMode:'latest',scopeEnd:undefined});f.setNow('2026-09-13T08:00:00Z');let received;f.chat.read=async p=>{received=p;return [];};await f.app.assistant.read({orderId:f.id});assert.equal(received.to,'2026-09-13T08:00:00.000Z');assert.equal(f.app.assistant.row(f.id).scope_end,received.to);
    f.setNow('2026-09-13T09:00:00Z');f.chat.read=async()=>{throw chatError('所选时间段尚未完整显示','WHATSAPP_INCOMPLETE');};await assert.rejects(f.app.assistant.read({orderId:f.id}),/尚未完整/);assert.equal(f.app.assistant.row(f.id).scope_end,'2026-09-13T08:00:00.000Z');assert.equal(f.app.assistant.row(f.id).read_issue,'所选时间段尚未完整显示');
    await f.bind({endMode:'fixed'});f.chat.read=async p=>{received=p;return [];};await f.app.assistant.read({orderId:f.id});assert.equal(received.to,'2026-09-13T07:00:00.000Z');
  }finally{f.db.close();}
});
test('late failed read cannot invalidate a newer successful read in the same order',async()=>{
  const f=fixture();try{await f.bind();let rejectOld;f.chat.read=()=>new Promise((_,reject)=>rejectOld=reject);const old=f.app.assistant.read({orderId:f.id});f.chat.read=async()=>[];await f.app.assistant.read({orderId:f.id});const current=f.app.assistant.row(f.id);rejectOld(chatError('Old fictional failure'));await assert.rejects(old);assert.deepEqual(f.app.assistant.row(f.id),current);}finally{f.db.close();}
});
test('migration 18 to 19 preserves existing fixed scopes, backs up, rolls back and restores latest mode',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'assistant-range-migration-'));let db;try{
    const file=orderDatabasePath(dir);await mkdir(path.dirname(file),{recursive:true});db=new DatabaseSync(file);migrateOrderDatabase(db,ORDER_MIGRATIONS.slice(0,18));const service=new OrderAppService({database:db,userDataPath:dir}),id=service.drafts.create({requestId:'fictional-range-migration'}).id;db.prepare('UPDATE order_assistant SET scope_start=?,scope_end=? WHERE order_id=?').run('2026-09-12T00:00:00.000Z','2026-09-13T00:00:00.000Z',id);
    const migration=ORDER_MIGRATIONS.find(m=>m.version===19);assert.equal(migration.version,19);assert.throws(()=>migrateOrderDatabase(db,[{...migration,statements:[...migration.statements,'INVALID SQL']} ]));assert.equal(db.prepare('SELECT max(version) v FROM schema_migrations').get().v,18);db.close();
    db=await openOrderDatabase({userDataPath:dir});assert.equal(db.prepare('SELECT scope_end_mode FROM order_assistant').get().scope_end_mode,'fixed');const files=await readdir(automaticBackupDirectory(dir));assert.ok(files.some(f=>validateOrderDatabaseFile(path.join(automaticBackupDirectory(dir),f)).schemaVersion===18));
    db.prepare("UPDATE order_assistant SET scope_end_mode='latest'").run();const before=db.prepare('SELECT * FROM order_assistant').all(),backup=path.join(dir,'backup.sqlite');await createVerifiedBackup(db,backup,{maxVersion:ORDER_MIGRATIONS.at(-1).version});const restored=new DatabaseSync(backup);assert.deepEqual(restored.prepare('SELECT * FROM order_assistant').all(),before);restored.close();
  }finally{db?.close();await rm(dir,{recursive:true,force:true});}
});

test('a browser profile owned by another App reports actionable conflict without closing it',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'whatsapp-profile-busy-'));
 try{const b=new WhatsAppBrowser({userDataPath:dir,launch:async()=>{throw new Error('Target page closed. 正在现有的浏览器会话中打开。 kill EPERM');}});await assert.rejects(b.open(),e=>e.code==='WHATSAPP_PROFILE_IN_USE'&&e.message.includes('关闭旧版'));assert.equal(b.status().status,'error');assert.match(b.status().message,/登录资料会保留/);assert.equal(b.context,null);}
 finally{await rm(dir,{recursive:true,force:true});}
});
