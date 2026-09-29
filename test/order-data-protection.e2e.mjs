import test from 'node:test';
import assert from 'node:assert/strict';
import {_electron as electron} from 'playwright-core';
import electronPath from 'electron';
import {DatabaseSync} from 'node:sqlite';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {migrateOrderDatabase,orderDatabasePath} from '../src/orders/database.mjs';
import {ORDER_MIGRATIONS} from '../src/orders/migrations/index.mjs';

test('Electron accepts the published v25 migration alias and upgrades only the isolated restore copy',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'order-migration-package-'));
  const data=path.join(directory,'data'),legacy=path.join(directory,'legacy-v25.sqlite');
  const executable=process.env.KDOCS_TEST_EXECUTABLE||electronPath;
  let application;
  try{
    await mkdir(path.dirname(legacy),{recursive:true});
    const database=new DatabaseSync(legacy);
    try{
      migrateOrderDatabase(database,ORDER_MIGRATIONS.slice(0,25));
      database.prepare('UPDATE schema_migrations SET name=? WHERE version=25').run('v824_business_dashboard');
    }finally{database.close();}
    application=await electron.launch({
      executablePath:executable,
      args:[...(process.env.KDOCS_TEST_EXECUTABLE?[]:['.']),`--orders-test-user-data=${data}`,`--orders-test-restore-file=${legacy}`],
      cwd:path.resolve('.'),
      env:{...process.env,NODE_ENV:'test'}
    });
    const page=await application.firstWindow({timeout:60000});
    const selected=await page.evaluate(()=>window.inventoryApp.orders.selectRestore());
    assert.equal(selected.ok,true);
    assert.equal(selected.data.schemaVersion,25);
    const restored=await page.evaluate(token=>window.inventoryApp.orders.restoreBackup(token),selected.data.token);
    assert.equal(restored.ok,true,JSON.stringify(restored.error));
    assert.equal(restored.data.restored,true);
    const upgraded=new DatabaseSync(orderDatabasePath(data),{readOnly:true});
    try{
      assert.equal(upgraded.prepare('SELECT name FROM schema_migrations WHERE version=25').get().name,'v824_business_dashboard');
      assert.equal(upgraded.prepare('SELECT name FROM schema_migrations WHERE version=26').get().name,'shopplus_order_sync_attention');
    }finally{upgraded.close();}
  }finally{
    if(application){
      const process=application.process();
      await Promise.race([application.close().catch(()=>{}),new Promise(resolve=>setTimeout(resolve,3000))]);
      if(process.exitCode===null)process.kill('SIGKILL');
    }
    await rm(directory,{recursive:true,force:true,maxRetries:3,retryDelay:150});
  }
});
