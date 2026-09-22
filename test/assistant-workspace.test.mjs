import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,mkdir,readdir,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {migrateOrderDatabase,openOrderDatabase,orderDatabasePath} from '../src/orders/database.mjs';
import {ORDER_MIGRATIONS} from '../src/orders/migrations/index.mjs';
import {OrderAppService} from '../src/orders/order-app-service.mjs';
import {automaticBackupDirectory,createVerifiedBackup,validateOrderDatabaseFile} from '../src/orders/order-data-protection.mjs';

function setup(db=new DatabaseSync(':memory:')){
  migrateOrderDatabase(db);
  const app=new OrderAppService({database:db}),first=app.drafts.create({requestId:'workspace-one'}),second=app.drafts.create({requestId:'workspace-two'});
  for(const id of [first.id,second.id])db.prepare('UPDATE order_assistant SET binding_revision=1,scope_start=?,scope_end=?,account_id=?,chat_id=? WHERE order_id=?')
    .run('2026-09-12T00:00:00.000Z','2026-09-13T00:00:00.000Z','fictional-account','fictional-chat',id);
  const add=(order,id,text,revision=1,at='2026-09-12T08:00:00.000Z')=>db.prepare('INSERT INTO order_chat_messages(order_id,binding_revision,message_id,direction,sent_at,body) VALUES(?,?,?,?,?,?)').run(order,revision,id,'customer',at,text);
  return {db,app,first,second,add,view:app.assistant.workspace};
}
test('S1 messages use current order, binding and scope; pagination handles equal-minute messages without gaps',()=>{
  const {db,first,second,add,view}=setup();
  try{
    for(let n=0;n<205;n++)add(first.id,'msg-'+String(n).padStart(3,'0'),'Fictional '+n);
    add(second.id,'msg-204','Other order');add(first.id,'old','Previous binding',0);add(first.id,'outside','Outside scope',1,'2026-09-11T08:00:00.000Z');
    let cursor=null,all=[];
    do{const page=view.messages({orderId:first.id,bindingRevision:1,before:cursor,limit:80});all=[...page.messages,...all];cursor=page.before;}while(cursor);
    assert.equal(all.length,205);assert.equal(new Set(all.map(m=>m.id)).size,205);assert.equal(all[0].text,'Fictional 0');assert.equal(all.at(-1).text,'Fictional 204');
    assert.deepEqual(view.messages({orderId:second.id}).messages.map(m=>m.text),['Other order']);
    assert.throws(()=>view.messages({orderId:first.id,limit:201}),/1 到 200/);
    assert.throws(()=>view.messages({orderId:first.id,before:{bindingRevision:1,id:'missing',sentAt:'2026-09-12T08:00:00.000Z'}}),/失效/);
    assert.throws(()=>view.messages({orderId:first.id,bindingRevision:0}),/关联已改变/);
  }finally{db.close();}
});
test('S1 reply state is separate from order values; stale saves and invalid evidence never overwrite',()=>{
  const {db,app,first,second,add,view}=setup();
  try{
    add(first.id,'one','<script>Fictional text, not code</script>');add(second.id,'other','Other customer');
    const original=app.detail({id:first.id}),state=view.state({orderId:first.id});
    const saved=view.save({...state,patch:{intent:'只问地址',draft:'Please provide your address.',mode:'proactive',tone:'brief',replyMessageId:'one',tab:'review',scrollTop:42}});
    assert.equal(saved.revision,1);assert.equal(view.state({orderId:second.id}).values.draft,'');
    assert.deepEqual(app.detail({id:first.id}),original);
    assert.throws(()=>view.save({...state,patch:{draft:'stale overwrite'}}),/其他窗口修改/);
    assert.throws(()=>view.save({...saved,patch:{replyMessageId:'other'}}),/不属于/);
    assert.throws(()=>view.save({...saved,patch:{key:'secret'}}),/字段无效/);
    assert.throws(()=>view.save({...saved,patch:{draft:'a'.repeat(12001)}}),/12000/);
    assert.equal(view.replyForCopy(saved),'Please provide your address.');assert.throws(()=>view.replyForCopy(state),/已改变/);
    db.prepare('UPDATE order_assistant SET binding_revision=2 WHERE order_id=?').run(first.id);
    assert.throws(()=>view.save({...saved,patch:{draft:'wrong target'}}),/关联已改变/);
    assert.equal(view.state({orderId:first.id}).values.replyMessageId,null);
    assert.equal(view.state({orderId:first.id}).values.draft,'Please provide your address.');
    assert.equal(view.state({orderId:first.id}).capabilities.replyGeneration,false);
  }finally{db.close();}
});
test('S1 save failure rolls back reply and version; activity never includes raw customer text',()=>{
  const {db,app,first,view}=setup();
  try{
    const state=view.state({orderId:first.id});
    db.exec("CREATE TRIGGER fail_workspace BEFORE UPDATE ON order_assistant_workspace BEGIN SELECT RAISE(ABORT,'fictional save failure'); END");
    assert.throws(()=>view.save({...state,patch:{draft:'not saved'}}),/fictional save failure/);
    assert.deepEqual(view.state({orderId:first.id}),state);
    app.drafts.event(first.id,'assistant_chat_bound','original private text','new private text');
    assert.ok(view.activity({orderId:first.id}).some(e=>e.type==='assistant_chat_bound'));
    assert.doesNotMatch(JSON.stringify(view.activity({orderId:first.id})),/private text/);
  }finally{db.close();}
});
test('S1 migration 19→20 backs up and rolls back; backup/restart preserve independent reply drafts',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'workspace-backup-fictional-'));let db;
  try{
    await mkdir(path.dirname(orderDatabasePath(directory)),{recursive:true});db=new DatabaseSync(orderDatabasePath(directory));
    migrateOrderDatabase(db,ORDER_MIGRATIONS.slice(0,19));
    const migration=ORDER_MIGRATIONS.find(m=>m.version===20);
    assert.throws(()=>migrateOrderDatabase(db,[{...migration,statements:[...migration.statements,'INVALID SQL']} ]));
    assert.equal(db.prepare('SELECT max(version) v FROM schema_migrations').get().v,19);
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name='order_assistant_workspace'").get(),undefined);
    db.close();db=await openOrderDatabase({userDataPath:directory});
    const backups=await readdir(automaticBackupDirectory(directory));assert.ok(backups.some(f=>validateOrderDatabaseFile(path.join(automaticBackupDirectory(directory),f)).schemaVersion===19));
    const {first,view,add}=setup(db);add(first.id,'source','Fictional source');
    const before=view.save({...view.state({orderId:first.id}),patch:{intent:'虚构资料',draft:'Fictional saved draft',replyMessageId:'source'}});
    const backup=path.join(directory,'backup.sqlite');await createVerifiedBackup(db,backup,{maxVersion:ORDER_MIGRATIONS.at(-1).version});db.close();db=null;
    db=await openOrderDatabase({userDataPath:directory});assert.deepEqual(new OrderAppService({database:db}).assistant.workspace.state({orderId:first.id}),before);db.close();
    db=new DatabaseSync(backup);assert.deepEqual(new OrderAppService({database:db}).assistant.workspace.state({orderId:first.id}),before);assert.equal(validateOrderDatabaseFile(backup).schemaVersion,ORDER_MIGRATIONS.at(-1).version);
  }finally{db?.close();await rm(directory,{recursive:true,force:true});}
});
