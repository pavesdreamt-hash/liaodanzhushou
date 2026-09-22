import {DatabaseSync} from 'node:sqlite';
import {chmod,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {ORDER_MIGRATIONS} from './migrations/index.mjs';
import {CURRENT_ORDER_SCHEMA_VERSION} from './migrations/index.mjs';
import {createAutomaticBackup,databaseNeedsMigration} from './order-data-protection.mjs';

export function orderDatabasePath(userDataPath){return path.join(userDataPath,'orders','orders.sqlite');}

export function migrateOrderDatabase(database,migrations=ORDER_MIGRATIONS){
  database.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )`);
  const applied=new Set(database.prepare('SELECT version FROM schema_migrations').all().map(row=>Number(row.version)));
  for(const migration of migrations){
    if(applied.has(migration.version))continue;
    if(migration.foreignKeysOff)database.exec('PRAGMA foreign_keys=OFF');
    database.exec('BEGIN IMMEDIATE');
    try{
      for(const statement of migration.statements)database.exec(statement);
      database.prepare('INSERT INTO schema_migrations(version,name,applied_at) VALUES(?,?,?)').run(migration.version,migration.name,new Date().toISOString());
      if(migration.foreignKeysOff&&database.prepare('PRAGMA foreign_key_check').all().length)throw new Error('迁移后外键校验失败');
      database.exec('COMMIT');
    }catch(error){database.exec('ROLLBACK');throw error;}finally{if(migration.foreignKeysOff)database.exec('PRAGMA foreign_keys=ON');}
  }
  return database.prepare('SELECT version,name,applied_at FROM schema_migrations ORDER BY version').all();
}

export async function openOrderDatabase({userDataPath,databaseFile,skipMigrationBackup=false}={}){
  const file=databaseFile||orderDatabasePath(userDataPath);
  if(file!==':memory:')await mkdir(path.dirname(file),{recursive:true,mode:0o700});
  if(file!==':memory:'&&!skipMigrationBackup&&await databaseNeedsMigration(file,CURRENT_ORDER_SCHEMA_VERSION)){const existing=new DatabaseSync(file,{timeout:5000});try{existing.exec('PRAGMA journal_mode=WAL');await createAutomaticBackup(existing,{userDataPath:userDataPath||path.dirname(path.dirname(file)),reason:'before_migration',maxVersion:CURRENT_ORDER_SCHEMA_VERSION});}finally{existing.close();}}
  const database=new DatabaseSync(file,{timeout:5000});
  database.exec('PRAGMA foreign_keys=ON');
  database.exec('PRAGMA busy_timeout=5000');
  if(file!==':memory:')database.exec('PRAGMA journal_mode=WAL');
  try{migrateOrderDatabase(database);}catch(error){database.close();throw error;}
  if(file!==':memory:')await Promise.all([file,`${file}-wal`,`${file}-shm`].map(value=>chmod(value,0o600).catch(error=>{if(error.code!=='ENOENT')throw error;})));
  return database;
}
