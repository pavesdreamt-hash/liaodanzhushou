import {DatabaseSync} from 'node:sqlite';
import {mkdir,chmod} from 'node:fs/promises';
import path from 'node:path';

const defaultMediaRetentionDays=30,defaultMediaCacheBytes=1024*1024*1024,displayableMedia=/^data:(image\/(?:png|jpeg|webp|gif)|video\/mp4);base64,([A-Za-z0-9+/]+=*)$/i;
const dataBytes=value=>{const body=String(value||'').split(',',2)[1]||'';return Math.floor(body.length*3/4)-(body.endsWith('==')?2:body.endsWith('=')?1:0);};
const cachedData=value=>{const match=typeof value==='string'&&value.match(displayableMedia);return match&&dataBytes(value)>0&&dataBytes(value)<=16*1024*1024?value:null;};
const cachedAt=(value,fallback)=>Number.isFinite(Date.parse(value))?Date.parse(value):fallback;
// WhatsApp can expose the same verified message through a phone-number (PN)
// remote in one read and a LID remote in another. The opaque suffix is the
// message identity; keep it intact, including underscores.
export const canonicalMessageId=value=>String(value||'').trim().replace(/^(true|false)_[^_]+_/,'$1_');

// A browser session can expose fewer old messages after a restart. Keep only
// messages that were actually read from the verified chat, never guessed rows.
export class ManualChatHistory {
  constructor(directory,{now=()=>Date.now(),retentionDays=defaultMediaRetentionDays,maxMediaBytes=defaultMediaCacheBytes}={}){this.directory=directory;this.database=null;this.now=now;this.retentionDays=retentionDays;this.maxMediaBytes=maxMediaBytes;}
  async open(){
    if(this.database)return this.database;
    await mkdir(this.directory,{recursive:true,mode:0o700});
    const file=path.join(this.directory,'verified-chat-history.sqlite');
    const database=new DatabaseSync(file,{timeout:5000});
    database.exec('PRAGMA journal_mode=WAL');
    database.exec('CREATE TABLE IF NOT EXISTS messages(account_id TEXT NOT NULL,chat_id TEXT NOT NULL,message_id TEXT NOT NULL,canonical_id TEXT NOT NULL,sent_at TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(account_id,chat_id,message_id))');
    this.ensureCanonicalIds(database);
    database.exec('CREATE UNIQUE INDEX IF NOT EXISTS messages_by_canonical ON messages(account_id,chat_id,canonical_id)');
    database.exec('CREATE INDEX IF NOT EXISTS messages_by_canonical_time ON messages(account_id,chat_id,sent_at,canonical_id)');
    database.exec('CREATE TABLE IF NOT EXISTS hidden_chats(account_id TEXT NOT NULL,chat_id TEXT NOT NULL,hidden_at TEXT NOT NULL,PRIMARY KEY(account_id,chat_id))');
    await Promise.all([file,`${file}-wal`,`${file}-shm`].map(name=>chmod(name,0o600).catch(error=>{if(error.code!=='ENOENT')throw error;})));
    this.database=database;this.cleanupMediaCache(database);return database;
  }
  ensureCanonicalIds(db){
    const columns=db.prepare('PRAGMA table_info(messages)').all();
    if(!columns.some(column=>column.name==='canonical_id'))db.exec('ALTER TABLE messages ADD COLUMN canonical_id TEXT');
    const rows=db.prepare('SELECT rowid id,account_id,chat_id,message_id,sent_at,payload,canonical_id FROM messages ORDER BY rowid').all(),updateCanonical=db.prepare('UPDATE messages SET canonical_id=? WHERE rowid=?');
    db.exec('BEGIN IMMEDIATE');
    try{
      for(const row of rows)updateCanonical.run(canonicalMessageId(row.message_id),row.id);
      const grouped=new Map();
      for(const row of rows){const key=[row.account_id,row.chat_id,canonicalMessageId(row.message_id)].join('\u0000'),group=grouped.get(key)||[];group.push(row);grouped.set(key,group);}
      const update=db.prepare('UPDATE messages SET message_id=?,canonical_id=?,sent_at=?,payload=? WHERE rowid=?'),remove=db.prepare('DELETE FROM messages WHERE rowid=?');
      for(const group of grouped.values()){
        if(group.length<2)continue;
        let merged=null;
        for(const row of group){
          let payload;
          try{payload=JSON.parse(row.payload);}catch{payload={id:row.message_id,sentAt:row.sent_at,text:'[未知类型消息]',metadata:{media:[]}};}
          merged=merged?ManualChatHistory.merge(merged,payload):payload;
        }
        // Keep the first legacy primary key while its aliases still exist;
        // changing it before deleting the other alias would violate the old
        // primary key constraint. Live reads are reconciled by canonical ID.
        const keeper=group[0],messageId=keeper.message_id,canonicalId=canonicalMessageId(messageId),next={...merged,id:messageId},sentAt=Number.isFinite(Date.parse(next?.sentAt))?next.sentAt:keeper.sent_at;
        update.run(messageId,canonicalId,sentAt,JSON.stringify(next),keeper.id);
        for(const row of group.slice(1))remove.run(row.id);
      }
      db.exec('COMMIT');
    }catch(error){db.exec('ROLLBACK');throw error;}
  }
  static portable(message,now=new Date().toISOString()){
    const media=message.metadata?.media?.map(({dataUrl,status,mediaCachedAt,...item})=>{
      const saved=status==='cached'?cachedData(dataUrl):null;
      return saved?{...item,status:'cached',dataUrl:saved,mediaCachedAt:Number.isFinite(Date.parse(mediaCachedAt))?mediaCachedAt:now}:{...item,status:status==='cached'?'unavailable':status,...(mediaCachedAt?{mediaCachedAt}:{} )};
    });
    return {...message,metadata:{...message.metadata,...(media?{media}:{})}};
  }
  static quality(message){
    const value=String(message?.text||'').trim();
    if(!value)return 0;
    if(/^\[(?:未知类型消息|图片|媒体附件|等待 WhatsApp 解密的消息|非文字消息|视频|GIF 动图|贴纸|文件|语音|位置|联系人|媒体相册|超大媒体|商品卡片|订单卡片|表情回应)(?:：[^\]]+)?\]$/.test(value)||value==='WhatsApp 加密通知。')return 1;
    return 2;
  }
  static deliveryAck(value){
    const ack=Number(value);
    return Number.isInteger(ack)&&ack>=-1&&ack<=4?ack:null;
  }
  static merge(saved,incoming){
    if(!saved)return incoming;
    const preferIncoming=ManualChatHistory.quality(incoming)>=ManualChatHistory.quality(saved);
    const primary=preferIncoming?incoming:saved,secondary=preferIncoming?saved:incoming;
    const firstMedia=primary.metadata?.media||[],otherMedia=secondary.metadata?.media||[];
    const media=firstMedia.some(item=>item.dataUrl)?firstMedia:otherMedia.some(item=>item.dataUrl)?otherMedia:firstMedia.length?firstMedia:otherMedia;
    const primaryAck=ManualChatHistory.deliveryAck(primary.metadata?.deliveryAck),secondaryAck=ManualChatHistory.deliveryAck(secondary.metadata?.deliveryAck);
    return {...primary,metadata:{...secondary.metadata,...primary.metadata,media,...(primaryAck===null&&secondaryAck!==null?{deliveryAck:secondaryAck}:{})}};
  }
  async save(accountId,chatId,messages){
    if(!messages.length)return;
    const db=await this.open(),select=db.prepare('SELECT rowid id,payload FROM messages WHERE account_id=? AND chat_id=? AND canonical_id=?'),insert=db.prepare('INSERT INTO messages(account_id,chat_id,message_id,canonical_id,sent_at,payload) VALUES(?,?,?,?,?,?)'),update=db.prepare('UPDATE messages SET message_id=?,canonical_id=?,sent_at=?,payload=? WHERE rowid=?');
    db.exec('BEGIN IMMEDIATE');
    try{for(const message of messages){
      if(!message?.id||!Number.isFinite(Date.parse(message.sentAt)))continue;
      const canonicalId=canonicalMessageId(message.id);if(!canonicalId)continue;
      const old=select.get(accountId,chatId,canonicalId),next=ManualChatHistory.portable(message,new Date(this.now()).toISOString()),merged=old?ManualChatHistory.merge(JSON.parse(old.payload),next):next,messageId=String(merged.id||message.id);
      if(old)update.run(messageId,canonicalId,merged.sentAt,JSON.stringify(merged),old.id);
      else insert.run(accountId,chatId,messageId,canonicalId,merged.sentAt,JSON.stringify(merged));
    }db.exec('COMMIT');}
    catch(error){db.exec('ROLLBACK');throw error;}
    this.cleanupMediaCache(db);
  }
  async message(accountId,chatId,messageId){
    const canonicalId=canonicalMessageId(messageId);if(!canonicalId)return null;
    const db=await this.open(),row=db.prepare('SELECT rowid id,payload FROM messages WHERE account_id=? AND chat_id=? AND canonical_id=?').get(accountId,chatId,canonicalId);
    if(!row)return null;
    const payload=JSON.parse(row.payload),accessedAt=new Date(this.now()).toISOString();let changed=false;
    for(const media of payload.metadata?.media||[])if(media.status==='cached'&&cachedData(media.dataUrl)&&media.mediaCachedAt!==accessedAt){media.mediaCachedAt=accessedAt;changed=true;}
    if(changed)db.prepare('UPDATE messages SET payload=? WHERE rowid=?').run(JSON.stringify(payload),row.id);
    return payload;
  }
  cleanupMediaCache(db=this.database){
    if(!db)return;
    const cutoff=this.now()-this.retentionDays*86400000,rows=[],updates=new Map();
    for(const row of db.prepare('SELECT rowid id,sent_at,payload FROM messages WHERE payload LIKE \'%dataUrl%\'').all()){
      let payload;try{payload=JSON.parse(row.payload);}catch{continue;}
      for(const media of payload?.metadata?.media||[]){
        if(media?.status!=='cached')continue;
        const dataUrl=cachedData(media.dataUrl);
        if(!dataUrl){delete media.dataUrl;media.status='unavailable';payload.metadata.note='本机图片缓存不可用，可在当前会话重试读取。';updates.set(row.id,payload);continue;}
        rows.push({id:row.id,payload,media,at:cachedAt(media.mediaCachedAt,Date.parse(row.sent_at)),bytes:dataBytes(dataUrl),ageProtected:payload.metadata?.mediaCachePolicy==='verified-outbound'&&media.type==='image'});
      }
    }
    rows.sort((a,b)=>b.at-a.at);let used=0;
    for(const row of rows){
      if((!row.ageProtected&&row.at<cutoff)||used+row.bytes>this.maxMediaBytes){delete row.media.dataUrl;row.media.status='unavailable';row.payload.metadata.note='本机图片缓存已清理，可在当前会话重试读取。';updates.set(row.id,row.payload);}else used+=row.bytes;
    }
    if(!updates.size)return;
    const update=db.prepare('UPDATE messages SET payload=? WHERE rowid=?');db.exec('BEGIN IMMEDIATE');
    try{for(const [id,payload] of updates)update.run(JSON.stringify(payload),id);db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
  }
  async page(accountId,chatId,{limit=20,before=null,beforeId=null}={}){
    const db=await this.open(),count=Math.max(1,Math.min(100,limit));
    const query=before&&beforeId?'SELECT payload FROM messages WHERE account_id=? AND chat_id=? AND (sent_at<? OR (sent_at=? AND canonical_id<?)) ORDER BY sent_at DESC,canonical_id DESC LIMIT ?':before?'SELECT payload FROM messages WHERE account_id=? AND chat_id=? AND sent_at<? ORDER BY sent_at DESC,canonical_id DESC LIMIT ?':'SELECT payload FROM messages WHERE account_id=? AND chat_id=? ORDER BY sent_at DESC,canonical_id DESC LIMIT ?';
    const cursorId=canonicalMessageId(beforeId);
    const rows=before&&beforeId?db.prepare(query).all(accountId,chatId,before,before,cursorId,count+1):before?db.prepare(query).all(accountId,chatId,before,count+1):db.prepare(query).all(accountId,chatId,count+1);
    return {messages:rows.slice(0,count).map(row=>JSON.parse(row.payload)).reverse(),hasMore:rows.length>count};
  }
  async hiddenChatIds(accountId){
    const db=await this.open();
    return db.prepare('SELECT chat_id FROM hidden_chats WHERE account_id=? ORDER BY hidden_at DESC').all(accountId).map(row=>row.chat_id);
  }
  async setHidden(accountId,chatId,hidden){
    const db=await this.open();
    if(hidden)db.prepare('INSERT INTO hidden_chats(account_id,chat_id,hidden_at) VALUES(?,?,?) ON CONFLICT(account_id,chat_id) DO UPDATE SET hidden_at=excluded.hidden_at').run(accountId,chatId,new Date().toISOString());
    else db.prepare('DELETE FROM hidden_chats WHERE account_id=? AND chat_id=?').run(accountId,chatId);
  }
}
