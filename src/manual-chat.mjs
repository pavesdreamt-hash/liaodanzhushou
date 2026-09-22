import {randomUUID,createHash} from 'node:crypto';
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import path from 'node:path';

const fail=message=>Object.assign(new Error(message),{stage:'人工发送',code:'MANUAL_CHAT'});
const hash=value=>createHash('sha256').update(value).digest('hex');
export class ManualChat {
  constructor({adapter,directory,now=()=>Date.now()}){this.adapter=adapter;this.directory=directory;this.now=now;this.bindings=new Map();this.queue=Promise.resolve();}
  status(){const s=this.adapter.status();return {status:s.status,message:s.message,qr:s.qr||null,accountId:s.accountId||null};}
  async connect(){await this.adapter.open();return this.status();}
  async inspect({phone}){return this.adapter.inspect({targetPhone:phone});}
  async bind({candidateToken,accountId,chatId}){
    const resolved=await this.adapter.resolve({candidateToken,accountId,chatId});
    const token=randomUUID(),binding={...resolved,createdAt:this.now()};this.bindings.set(token,binding);
    return {token,accountId,chatId,phone:chatId.replace(/^wa-phone:/,''),messages:await this.history({token})};
  }
  async restore({accountId,chatId,binding}){
    const resolved=await this.adapter.resolve({accountId,chatId,binding});
    const token=randomUUID();this.bindings.set(token,{...resolved,createdAt:this.now()});
    return {token,accountId,chatId,phone:chatId.replace(/^wa-phone:/,''),messages:await this.history({token})};
  }
  async target(token){const b=this.bindings.get(token);if(!b)throw fail('请先关联并核对真实客户聊天');await this.adapter.resolve(b);return b;}
  async decorate(rows,b){
    const manualIds=new Set((await this.ledger()).filter(record=>record.accountId===b.accountId&&record.chatId===b.chatId).flatMap(record=>record.parts||[]).filter(part=>part.status==='sent'&&part.id).map(part=>part.id));
    return rows.map(row=>({...row,sender:row.direction==='customer'?'客户':manualIds.has(row.id)?'人工发送':row.sender||row.metadata?.sender||row.metadata?.origin||'我方发送'}));
  }
  async history({token}){
    const b=await this.target(token),now=this.now();
    const rows=await this.adapter.read({...b,limit:100,from:new Date(now-86400000).toISOString(),to:new Date(now).toISOString()});
    return this.decorate(rows,b);
  }
  async openInbox({chatId,limit=20}){
    if(typeof this.adapter.openInbox!=='function'||typeof this.adapter.recent!=='function')throw fail('当前 WhatsApp 连接不支持统一会话列表');
    const resolved=await this.adapter.openInbox({chatId}),token=randomUUID(),binding={...resolved,createdAt:this.now()};this.bindings.set(token,binding);
    const page=await this.adapter.recent({...binding,limit});return {token,accountId:binding.accountId,chatId:binding.chatId,phone:binding.chatId.replace(/^wa-phone:/,''),messages:await this.decorate(page.messages,binding),hasMore:page.hasMore};
  }
  async recent({token,limit=20,before=null}){
    const b=await this.target(token);if(typeof this.adapter.recent!=='function')return {messages:await this.history({token}),hasMore:false};
    const page=await this.adapter.recent({...b,limit,before});return {messages:await this.decorate(page.messages,b),hasMore:page.hasMore};
  }
  async ledger(){try{return JSON.parse(await readFile(path.join(this.directory,'manual-outbox.json'),'utf8'));}catch(e){if(e.code==='ENOENT')return [];throw e;}}
  async persist(records){await mkdir(this.directory,{recursive:true});const temp=path.join(this.directory,`outbox-${randomUUID()}.tmp`);await writeFile(temp,JSON.stringify(records),{mode:0o600});await rename(temp,path.join(this.directory,'manual-outbox.json'));}
  send(payload){const next=this.queue.then(()=>this.perform(payload));this.queue=next.catch(()=>{});return next;}
  async perform({token,requestId,text,images=[]}){
    if(!/^[a-f0-9-]{36}$/.test(requestId||'')||typeof text!=='string'||text.length>16000||!Array.isArray(images)||images.length>6||(!text.trim()&&!images.length))throw fail('发送内容无效');
    const pictures=images.map(data=>{if(typeof data!=='string'||data.length>3_000_000||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(data))throw fail('图片格式无效');return data;});
    const b=await this.target(token);if(typeof this.adapter.sendVerified!=='function')throw fail('当前连接不支持人工发送，请连接 WhatsApp');
    const fingerprint=hash(JSON.stringify([b.accountId,b.chatId,text,pictures.map(hash)])),records=await this.ledger();
    const existing=records.find(r=>r.requestId===requestId);
    if(existing){if(existing.fingerprint!==fingerprint)throw fail('同一发送操作的内容已变化');return existing;}
    const recent=records.find(r=>r.fingerprint===fingerprint&&r.status==='sent'&&Date.parse(r.createdAt)>this.now()-300000);if(recent)return recent;
    if(records.some(r=>r.fingerprint===fingerprint&&r.status!=='sent'))throw fail('这份内容已有待核实的发送记录。请先在 WhatsApp 核对，系统不会重复发送。');
    // Verify before creating an outbox entry. Once dispatch starts, a timeout is uncertain, never automatically retried.
    await this.adapter.verifyManualTarget(b);
    const entry={requestId,fingerprint,accountId:b.accountId,chatId:b.chatId,status:'sending',parts:[],createdAt:new Date(this.now()).toISOString()};
    const keep=records.filter(r=>r.status!=='sent'||Date.parse(r.createdAt)>this.now()-30*86400000);keep.push(entry);await this.persist(keep);
    const parts=[...(text.trim()?[{text}]:[]),...pictures.map((image,index)=>({image,imageIndex:index}))];
    for(const part of parts){
      const record={kind:part.image?'image':'text',imageIndex:part.imageIndex,status:'sending'};entry.parts.push(record);await this.persist(keep);
      try{const sent=await this.adapter.sendVerified(b,part);if(!sent?.id)throw fail('未取得消息回执');Object.assign(record,{status:'sent',id:sent.id});await this.persist(keep);}
      catch{record.status='unknown';entry.status='unknown';entry.message='发送结果待核实，可能已有部分消息发出。原稿保留，请在 WhatsApp 核对；不会自动重发。';await this.persist(keep);return entry;}
    }
    entry.status='sent';await this.persist(keep);return entry;
  }
}
