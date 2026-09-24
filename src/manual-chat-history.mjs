import {DatabaseSync} from 'node:sqlite';
import {mkdir,chmod} from 'node:fs/promises';
import path from 'node:path';

// A browser session can expose fewer old messages after a restart. Keep only
// messages that were actually read from the verified chat, never guessed rows.
export class ManualChatHistory {
  constructor(directory){this.directory=directory;this.database=null;}
  async open(){
    if(this.database)return this.database;
    await mkdir(this.directory,{recursive:true,mode:0o700});
    const file=path.join(this.directory,'verified-chat-history.sqlite');
    const database=new DatabaseSync(file,{timeout:5000});
    database.exec('PRAGMA journal_mode=WAL');
    database.exec('CREATE TABLE IF NOT EXISTS messages(account_id TEXT NOT NULL,chat_id TEXT NOT NULL,message_id TEXT NOT NULL,sent_at TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(account_id,chat_id,message_id))');
    database.exec('CREATE INDEX IF NOT EXISTS messages_by_time ON messages(account_id,chat_id,sent_at,message_id)');
    database.exec('CREATE TABLE IF NOT EXISTS hidden_chats(account_id TEXT NOT NULL,chat_id TEXT NOT NULL,hidden_at TEXT NOT NULL,PRIMARY KEY(account_id,chat_id))');
    await Promise.all([file,`${file}-wal`,`${file}-shm`].map(name=>chmod(name,0o600).catch(error=>{if(error.code!=='ENOENT')throw error;})));
    this.database=database;return database;
  }
  static portable(message){
    const media=message.metadata?.media?.map(({dataUrl,status,...item})=>({
      ...item,status:status==='cached'?'unavailable':status
    }));
    return {...message,metadata:{...message.metadata,...(media?{media}:{})}};
  }
  static quality(message){
    const value=String(message?.text||'').trim();
    if(!value)return 0;
    if(/^\[(?:未知类型消息|图片|媒体附件|等待 WhatsApp 解密的消息|非文字消息|视频|GIF 动图|贴纸|文件|语音|位置|联系人|媒体相册|超大媒体|商品卡片|订单卡片|表情回应)(?:：[^\]]+)?\]$/.test(value)||value==='WhatsApp 加密通知。')return 1;
    return 2;
  }
  static merge(saved,incoming){
    if(!saved)return incoming;
    const preferIncoming=ManualChatHistory.quality(incoming)>=ManualChatHistory.quality(saved);
    const primary=preferIncoming?incoming:saved,secondary=preferIncoming?saved:incoming;
    const firstMedia=primary.metadata?.media||[],otherMedia=secondary.metadata?.media||[];
    const media=firstMedia.some(item=>item.dataUrl)?firstMedia:otherMedia.some(item=>item.dataUrl)?otherMedia:firstMedia.length?firstMedia:otherMedia;
    return {...primary,metadata:{...secondary.metadata,...primary.metadata,media}};
  }
  async save(accountId,chatId,messages){
    if(!messages.length)return;
    const db=await this.open(),select=db.prepare('SELECT payload FROM messages WHERE account_id=? AND chat_id=? AND message_id=?'),insert=db.prepare('INSERT INTO messages(account_id,chat_id,message_id,sent_at,payload) VALUES(?,?,?,?,?) ON CONFLICT(account_id,chat_id,message_id) DO UPDATE SET sent_at=excluded.sent_at,payload=excluded.payload');
    db.exec('BEGIN IMMEDIATE');
    try{for(const message of messages){if(!message?.id||!Number.isFinite(Date.parse(message.sentAt)))continue;const old=select.get(accountId,chatId,message.id),next=ManualChatHistory.portable(message),merged=old?ManualChatHistory.merge(JSON.parse(old.payload),next):next;insert.run(accountId,chatId,message.id,merged.sentAt,JSON.stringify(merged));}db.exec('COMMIT');}
    catch(error){db.exec('ROLLBACK');throw error;}
  }
  async page(accountId,chatId,{limit=20,before=null,beforeId=null}={}){
    const db=await this.open(),count=Math.max(1,Math.min(100,limit));
    const query=before&&beforeId?'SELECT payload FROM messages WHERE account_id=? AND chat_id=? AND (sent_at<? OR (sent_at=? AND message_id<?)) ORDER BY sent_at DESC,message_id DESC LIMIT ?':before?'SELECT payload FROM messages WHERE account_id=? AND chat_id=? AND sent_at<? ORDER BY sent_at DESC,message_id DESC LIMIT ?':'SELECT payload FROM messages WHERE account_id=? AND chat_id=? ORDER BY sent_at DESC,message_id DESC LIMIT ?';
    const rows=before&&beforeId?db.prepare(query).all(accountId,chatId,before,before,beforeId,count+1):before?db.prepare(query).all(accountId,chatId,before,count+1):db.prepare(query).all(accountId,chatId,count+1);
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
