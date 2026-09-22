import {DatabaseSync,backup as sqliteBackup} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {mkdir,readdir,rename,unlink,stat,chmod,copyFile} from 'node:fs/promises';
import path from 'node:path';

export const ORDER_DATABASE_IDENTITY='kdocs-inventory-orders';
export const BACKUP_FORMAT_VERSION=1;
export const AUTOMATIC_BACKUP_LIMIT=30;
const requiredTables=['schema_migrations','orders','packages','order_items','order_events'];
const expectedMigrationNames=['initial_order_schema','versioned_shipping_realized_profit_and_exchange_rate','variable_actual_courier_fees','shopplus_excel_import','annotated_inventory_costs','order_fulfillment_reports','order_data_protection','recipient_data_completion','package_contact_outcome','manual_item_discounts','address_verification','fixed_order_sequence','delivery_address_verification','order_settlement_and_discount_inputs','package_report_workflow','order_level_reports_and_aed_cny_18','chat_drafts_and_order_assistant','assistant_read_integrity','assistant_range_mode','assistant_workspace','assistant_ai_cache','assistant_policy_history','assistant_stage_reminders','assistant_online_sync','business_dashboard_v1'];
const automaticPattern=/^automatic-orders-backup-\d{8}-\d{6}-\d{3}-[a-f0-9]{8}\.sqlite$/;
const safeReason=new Set(['daily','before_import','before_restore','before_migration']);
const timestamp=date=>{const iso=date.toISOString();return `${iso.slice(0,10).replaceAll('-','')}-${iso.slice(11,19).replaceAll(':','')}-${iso.slice(20,23)}`;};
const exists=async file=>stat(file).then(()=>true,error=>error.code==='ENOENT'?false:Promise.reject(error));
const protectionError=(message,code='ORDER_BACKUP_INVALID')=>Object.assign(new Error(message),{code,stage:'订单数据保护'});

export function automaticBackupDirectory(userDataPath){return path.join(userDataPath,'orders','automatic-backups');}
export function automaticBackupName(date=new Date()){return `automatic-orders-backup-${timestamp(date)}-${randomUUID().slice(0,8)}.sqlite`;}
export function manualBackupName(date=new Date()){return `orders-backup-${timestamp(date)}.sqlite`;}

export function inspectOrderDatabase(database,{maxVersion}={}){
  const integrity=database.prepare('PRAGMA integrity_check').all().map(row=>Object.values(row)[0]);if(integrity.length!==1||integrity[0]!=='ok')throw protectionError('备份数据库完整性检查失败','ORDER_BACKUP_CORRUPT');
  const tables=new Set(database.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row=>row.name));for(const table of requiredTables)if(!tables.has(table))throw protectionError('所选文件不是本App订单数据库','ORDER_BACKUP_WRONG_DATABASE');
  const migrations=database.prepare('SELECT version,name FROM schema_migrations ORDER BY version').all();if(!migrations.length||Number(migrations[0].version)!==1)throw protectionError('订单数据库迁移记录无效','ORDER_BACKUP_WRONG_DATABASE');const schemaVersion=Math.max(...migrations.map(row=>Number(row.version)));
  if(schemaVersion>=24){if(!tables.has('assistant_online_sync')||['order_id','binding_revision','account_id','chat_id','enabled','revision','payload','updated_at'].some(c=>!database.prepare("SELECT 1 FROM pragma_table_info('assistant_online_sync') WHERE name=?").get(c)))throw protectionError('在线同步结构不完整','ORDER_BACKUP_WRONG_DATABASE');if(database.prepare("SELECT 1 FROM assistant_online_sync WHERE revision<0 OR enabled NOT IN(0,1) OR NOT json_valid(payload)").get())throw protectionError('在线同步记录损坏','ORDER_BACKUP_CORRUPT');for(const r of database.prepare('SELECT payload FROM assistant_online_sync').all()){const p=JSON.parse(r.payload);if(!p||typeof p!=='object'||Array.isArray(p))throw protectionError('在线同步状态损坏','ORDER_BACKUP_CORRUPT');}}
  if(schemaVersion>=25){
    for(const [table,columns] of Object.entries({product_profiles:['business_id','actual_price_fils','inventory_status','inventory_checked_at','chat_enabled','image_paths','updated_at'],daily_operating_costs:['day','ad_usd_cents','usd_cny_rate_scaled','account_cost_cny_fen','updated_at'],order_lifecycle:['order_id','state','recycled_at','updated_at'],app_preferences:['key','value','updated_at']})){
      if(!tables.has(table)||columns.some(column=>!database.prepare(`SELECT 1 FROM pragma_table_info('${table}') WHERE name=?`).get(column)))throw protectionError('新版经营数据结构不完整','ORDER_BACKUP_WRONG_DATABASE');
    }
    if(database.prepare("SELECT 1 FROM product_profiles WHERE chat_enabled NOT IN(0,1) OR NOT json_valid(image_paths)").get())throw protectionError('商品资料记录损坏','ORDER_BACKUP_CORRUPT');
    if(database.prepare("SELECT 1 FROM order_lifecycle WHERE state NOT IN('active','void','recycle')").get())throw protectionError('订单生命周期记录损坏','ORDER_BACKUP_CORRUPT');
  }
  if(schemaVersion>=23){if(!tables.has('order_assistant_stages')||['order_id','revision','payload','updated_at'].some(c=>!database.prepare("SELECT 1 FROM pragma_table_info('order_assistant_stages') WHERE name=?").get(c)))throw protectionError('订单阶段记录结构不完整','ORDER_BACKUP_WRONG_DATABASE');if(database.prepare("SELECT 1 FROM order_assistant_stages WHERE revision<0 OR NOT json_valid(payload)").get())throw protectionError('阶段记录格式损坏','ORDER_BACKUP_CORRUPT');for(const row of database.prepare('SELECT payload FROM order_assistant_stages').all()){const v=JSON.parse(row.payload);if(!v||Array.isArray(v)||typeof v!=='object'||!Array.isArray(v.history)||v.history.length>500||typeof v.ended!=='boolean'||['anchorAt','nextFollowUpAt','waitingUntil'].some(k=>v[k]!==null&&(typeof v[k]!=='string'||!Number.isFinite(Date.parse(v[k]))))||typeof v.waitingNote!=='string'||typeof v.endReason!=='string'||v.history.some(h=>!h||typeof h.action!=='string'||typeof h.at!=='string'||!Number.isFinite(Date.parse(h.at))||typeof h.note!=='string')||(v.confirmation!=null&&(!v.confirmation||typeof v.confirmation.fingerprint!=='string'||typeof v.confirmation.at!=='string'||!Number.isFinite(Date.parse(v.confirmation.at))||typeof v.confirmation.note!=='string'))||(v.focus!==null&&(!v.focus||typeof v.focus.stageId!=='string'||typeof v.focus.reason!=='string'||typeof v.focus.fingerprint!=='string')))throw protectionError('阶段记录内容损坏','ORDER_BACKUP_CORRUPT');}}
  if(schemaVersion>=22&&['assistant_policy','assistant_chat_archive','assistant_chat_progress'].some(name=>!tables.has(name)))throw protectionError('助手流程与聊天历史结构不完整','ORDER_BACKUP_WRONG_DATABASE');
  if(schemaVersion>=22){
    for(const [table,columns] of Object.entries({assistant_policy:['id','revision','payload'],assistant_chat_archive:['account_id','chat_id','message_id','direction','sent_at','body','metadata'],assistant_chat_progress:['account_id','chat_id','revision','payload'],order_assistant_ai_cache:['accessed_at']}))if(columns.some(name=>!database.prepare(`SELECT 1 FROM pragma_table_info('${table}') WHERE name=?`).get(name)))throw protectionError('助手流程与历史字段不完整','ORDER_BACKUP_WRONG_DATABASE');
    if(database.prepare("SELECT 1 FROM assistant_policy WHERE revision<0 OR NOT json_valid(payload)").get()||database.prepare("SELECT 1 FROM assistant_chat_progress WHERE revision<0 OR NOT json_valid(payload)").get()||database.prepare("SELECT 1 FROM assistant_chat_archive WHERE metadata IS NOT NULL AND NOT json_valid(metadata)").get())throw protectionError('助手流程或历史记录格式损坏','ORDER_BACKUP_CORRUPT');
  }
  if(schemaVersion>=21&&(!tables.has('order_assistant_ai_cache')||['order_id','binding_revision','cache_key','result','created_at'].some(name=>!database.prepare("SELECT 1 FROM pragma_table_info('order_assistant_ai_cache') WHERE name=?").get(name))))throw protectionError('订单助手译文缓存结构不完整','ORDER_BACKUP_WRONG_DATABASE');
  if(schemaVersion>=20&&(!tables.has('order_assistant_workspace')||['revision','payload','updated_at'].some(name=>!database.prepare("SELECT 1 FROM pragma_table_info('order_assistant_workspace') WHERE name=?").get(name))))throw protectionError('订单助手回复草稿结构不完整','ORDER_BACKUP_WRONG_DATABASE');
  if(schemaVersion>=19&&!database.prepare("SELECT 1 FROM pragma_table_info('order_assistant') WHERE name='scope_end_mode'").get())throw protectionError('订单助手时间范围结构不完整','ORDER_BACKUP_WRONG_DATABASE');
  if(schemaVersion>=18&&['browser_binding','read_issue','read_revision'].some(name=>!database.prepare("SELECT 1 FROM pragma_table_info('order_assistant') WHERE name=?").get(name)))throw protectionError('订单助手结构不完整','ORDER_BACKUP_WRONG_DATABASE');
  if(schemaVersion>=18&&!database.prepare("SELECT 1 FROM pragma_table_info('order_chat_messages') WHERE name='metadata'").get())throw protectionError('消息依据结构不完整','ORDER_BACKUP_WRONG_DATABASE');
  if(maxVersion!==undefined&&schemaVersion>maxVersion)throw protectionError('备份数据库版本高于当前App支持版本','ORDER_BACKUP_NEWER_VERSION');
  if(migrations.length!==schemaVersion||migrations.some((row,index)=>Number(row.version)!==index+1||row.name!==expectedMigrationNames[index]))throw protectionError('订单数据库迁移签名无效','ORDER_BACKUP_WRONG_DATABASE');if(schemaVersion>=4&&!tables.has('import_batches'))throw protectionError('订单数据库结构不完整','ORDER_BACKUP_WRONG_DATABASE');if(schemaVersion>=8&&!tables.has('order_recipient_overrides'))throw protectionError('订单数据库结构不完整','ORDER_BACKUP_WRONG_DATABASE');if(schemaVersion>=9&&!database.prepare("SELECT 1 FROM pragma_table_info('packages') WHERE name='contact_outcome'").get())throw protectionError('订单数据库结构不完整','ORDER_BACKUP_WRONG_DATABASE');if(schemaVersion>=10&&(!database.prepare("SELECT 1 FROM pragma_table_info('order_items') WHERE name='source_line_revenue'").get()||!database.prepare("SELECT 1 FROM pragma_table_info('order_items') WHERE name='manual_discount'").get()))throw protectionError('订单数据库结构不完整','ORDER_BACKUP_WRONG_DATABASE');if(schemaVersion>=11&&!tables.has('order_address_verifications'))throw protectionError('订单数据库结构不完整','ORDER_BACKUP_WRONG_DATABASE');if(schemaVersion>=12&&(!database.prepare("SELECT 1 FROM pragma_table_info('orders') WHERE name='fixed_sequence'").get()||!database.prepare("SELECT 1 FROM sqlite_master WHERE type='index' AND name='orders_fixed_sequence_unique'").get()))throw protectionError('订单数据库结构不完整','ORDER_BACKUP_WRONG_DATABASE');if(schemaVersion>=13&&!tables.has('order_delivery_verifications'))throw protectionError('订单数据库结构不完整','ORDER_BACKUP_WRONG_DATABASE');if(schemaVersion>=14&&(!tables.has('product_discount_limits')||!database.prepare("SELECT 1 FROM pragma_table_info('orders') WHERE name='net_remittance'").get()||!database.prepare("SELECT 1 FROM pragma_table_info('order_items') WHERE name='discount_input_type'").get()))throw protectionError('订单数据库结构不完整','ORDER_BACKUP_WRONG_DATABASE');
  if(schemaVersion>=15&&!database.prepare("SELECT 1 FROM pragma_table_info('packages') WHERE name='reported_at'").get())throw protectionError('订单数据库结构不完整','ORDER_BACKUP_WRONG_DATABASE');
  if(schemaVersion>=17&&['order_draft_items','order_field_sources','order_assistant','order_chat_messages','order_assistant_changes'].some(name=>!tables.has(name)))throw protectionError('订单草稿及助手结构不完整','ORDER_BACKUP_WRONG_DATABASE');
  if(tables.has('order_app_metadata')){const identity=database.prepare("SELECT value FROM order_app_metadata WHERE key='database_identity'").get()?.value;if(identity!==ORDER_DATABASE_IDENTITY)throw protectionError('订单数据库身份标记无效','ORDER_BACKUP_WRONG_DATABASE');}
  const count=table=>Number(database.prepare(`SELECT count(*) count FROM ${table}`).get().count);return {valid:true,schemaVersion,orderCount:count('orders'),itemCount:count('order_items'),packageCount:count('packages'),integrity:'ok'};
}

export function validateOrderDatabaseFile(file,{maxVersion}={}){let database;try{database=new DatabaseSync(file,{readOnly:true});return inspectOrderDatabase(database,{maxVersion});}catch(error){if(error?.code?.startsWith?.('ORDER_BACKUP_'))throw error;throw protectionError('无法读取或验证备份文件','ORDER_BACKUP_CORRUPT');}finally{database?.close();}}

async function normalizeStandaloneBackup(file){const database=new DatabaseSync(file);try{database.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get();database.exec('PRAGMA journal_mode=DELETE');}finally{database.close();}await unlink(`${file}-wal`).catch(()=>{});await unlink(`${file}-shm`).catch(()=>{});}

export async function createVerifiedBackup(database,destination,{maxVersion}={}){
  await mkdir(path.dirname(destination),{recursive:true,mode:0o700});const checkpoint=database.prepare('PRAGMA wal_checkpoint(FULL)').get();if(Number(checkpoint?.busy||0)!==0)throw protectionError('SQLite WAL检查点未完成，已停止备份','ORDER_BACKUP_WAL_BUSY');
  const temporary=path.join(path.dirname(destination),`.${path.basename(destination)}.${randomUUID()}.tmp`);try{await sqliteBackup(database,temporary);await normalizeStandaloneBackup(temporary);const result=validateOrderDatabaseFile(temporary,{maxVersion});await chmod(temporary,0o600);await rename(temporary,destination);return {...result,file:destination};}catch(error){await unlink(temporary).catch(()=>{});await unlink(`${temporary}-wal`).catch(()=>{});await unlink(`${temporary}-shm`).catch(()=>{});throw error;}
}

export function recordOrderDataAudit(database,eventType,details={},clock=()=>new Date()){
  const allowed=new Set(['manual_backup_created','automatic_backup_created','database_restored']);if(!allowed.has(eventType))throw new TypeError('订单数据审计事件无效');database.prepare('INSERT INTO order_data_audit(id,event_type,event_time,details) VALUES(?,?,?,?)').run(randomUUID(),eventType,clock().toISOString(),JSON.stringify(details));
}

export async function cleanupAutomaticBackups(directory,{limit=AUTOMATIC_BACKUP_LIMIT,maxVersion}={}){
  const names=(await readdir(directory).catch(error=>error.code==='ENOENT'?[]:Promise.reject(error))).filter(name=>automaticPattern.test(name)).sort().reverse(),kept=names.slice(0,limit),candidates=names.slice(limit),removed=[];
  for(const name of candidates){const file=path.join(directory,name);try{validateOrderDatabaseFile(file,{maxVersion});await unlink(file);removed.push(name);}catch{/* 未经验证的文件绝不自动删除 */}}
  return {kept,removed};
}

export async function createAutomaticBackup(database,{userDataPath,reason,clock=()=>new Date(),maxVersion,limit=AUTOMATIC_BACKUP_LIMIT}={}){
  if(!safeReason.has(reason))throw new TypeError('自动备份原因无效');const directory=automaticBackupDirectory(userDataPath),destination=path.join(directory,automaticBackupName(clock())),result=await createVerifiedBackup(database,destination,{maxVersion});
  if(database.prepare("SELECT count(*) count FROM sqlite_master WHERE type='table' AND name='order_data_audit'").get().count)recordOrderDataAudit(database,'automatic_backup_created',{reason,filename:path.basename(destination)},clock);
  await cleanupAutomaticBackups(directory,{limit,maxVersion});return result;
}

export async function databaseNeedsMigration(file,currentVersion){if(!await exists(file))return false;let database;try{database=new DatabaseSync(file,{readOnly:true});const tables=database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all(),hasMigrations=tables.some(row=>row.name==='schema_migrations');if(!hasMigrations){if(tables.length)throw protectionError('现有文件不是本App订单数据库','ORDER_BACKUP_WRONG_DATABASE');return false;}const version=Number(database.prepare('SELECT COALESCE(MAX(version),0) version FROM schema_migrations').get().version);return version>0&&version<currentVersion;}finally{database?.close();}}

export async function replaceDatabaseAtomically({databaseFile,sourceFile,maxVersion}){
  validateOrderDatabaseFile(sourceFile,{maxVersion});const temporary=path.join(path.dirname(databaseFile),`.orders-restore-${randomUUID()}.sqlite`),rollback=path.join(path.dirname(databaseFile),`.orders-rollback-${randomUUID()}.sqlite`);let originalMoved=false,replacementInstalled=false;
  try{await copyFile(sourceFile,temporary);await chmod(temporary,0o600);validateOrderDatabaseFile(temporary,{maxVersion});await rename(databaseFile,rollback);originalMoved=true;await rename(temporary,databaseFile);replacementInstalled=true;return {...validateOrderDatabaseFile(databaseFile,{maxVersion}),rollbackFile:rollback};}
  catch(error){if(originalMoved){if(replacementInstalled)await rename(databaseFile,temporary).catch(()=>{});try{await rename(rollback,databaseFile);}catch(rollbackError){throw protectionError(`恢复失败，原数据库保留在安全回滚文件：${path.basename(rollback)}`,'ORDER_RESTORE_ROLLBACK_REQUIRED');}}throw error;}
  finally{await unlink(temporary).catch(()=>{});}
}

export async function finalizeDatabaseReplacement(rollbackFile){await unlink(rollbackFile);}
export async function rollbackDatabaseReplacement({databaseFile,rollbackFile}){const failed=path.join(path.dirname(databaseFile),`.orders-failed-${randomUUID()}.sqlite`);await unlink(`${databaseFile}-wal`).catch(()=>{});await unlink(`${databaseFile}-shm`).catch(()=>{});await rename(databaseFile,failed);try{await rename(rollbackFile,databaseFile);}catch(error){await rename(failed,databaseFile).catch(()=>{});throw error;}await unlink(failed).catch(()=>{});}
