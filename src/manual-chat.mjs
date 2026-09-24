import {randomUUID,createHash} from 'node:crypto';
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import path from 'node:path';
import {ManualChatHistory} from './manual-chat-history.mjs';

const fail=message=>Object.assign(new Error(message),{stage:'人工发送',code:'MANUAL_CHAT'});
const hash=value=>createHash('sha256').update(value).digest('hex');
const allowedAttachmentTypes=new Set(['image/jpeg','image/png','image/webp','application/pdf','text/plain','text/csv','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/zip','application/x-zip-compressed']);
const attachmentLimitBytes=16*1024*1024,totalAttachmentLimitBytes=32*1024*1024;
const attachmentBytes=data=>{const value=data.slice(data.indexOf(',')+1);return Math.floor(value.length*3/4)-(value.endsWith('==')?2:value.endsWith('=')?1:0);};
const safeAttachment=(value,index)=>{
  if(!value||typeof value!=='object'||typeof value.dataUrl!=='string'||typeof value.name!=='string')throw fail(`第 ${index+1} 个附件无效`);
  const match=value.dataUrl.match(/^data:([a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*);base64,([A-Za-z0-9+/]+=*)$/i),name=value.name.trim();
  if(!match||!allowedAttachmentTypes.has(match[1].toLowerCase()))throw fail(`不支持第 ${index+1} 个附件的格式`);
  if(!name||name.length>180||name!==path.basename(name)||/[\u0000-\u001f\u007f]/.test(name))throw fail(`第 ${index+1} 个附件名称无效`);
  const size=attachmentBytes(value.dataUrl);if(!size||size>attachmentLimitBytes)throw fail(`附件“${name}”超过 16 MB 或内容为空`);
  const mimetype=match[1].toLowerCase(),kind=mimetype.startsWith('image/')?'image':'file';return {dataUrl:value.dataUrl,name,mimetype,kind,size};
};
export class ManualChat {
  constructor({adapter,directory,now=()=>Date.now()}){
    this.adapter=adapter;this.directory=directory;this.now=now;this.bindings=new Map();this.queue=Promise.resolve();this.chatHistory=new ManualChatHistory(directory);
    this.captureQueue=Promise.resolve();this.captureIssue=null;
    this.unsubscribeInbox=adapter.subscribeInbox?.(message=>{
      this.captureQueue=this.captureQueue.then(async()=>{
        if(!/^wa-phone:[1-9]\d{6,14}$/.test(message?.accountId||'')||!/^wa-phone:[1-9]\d{6,14}$/.test(message?.chatId||''))return;
        await this.chatHistory.save(message.accountId,message.chatId,[message]);this.captureIssue=null;
      }).catch(error=>{this.captureIssue=error;});
    });
  }
  status(){const s=this.adapter.status();return {status:s.status,message:s.message,qr:s.qr||null,accountId:s.accountId||null};}
  async hiddenChats(accountId){if(!/^wa-phone:[1-9]\d{6,14}$/.test(accountId||''))return [];return this.chatHistory.hiddenChatIds(accountId);}
  async setInboxHidden({chatId,hidden}){
    const accountId=this.status().accountId;
    if(!/^wa-phone:[1-9]\d{6,14}$/.test(accountId||'')||!/^wa-phone:[1-9]\d{6,14}$/.test(chatId||'')||typeof hidden!=='boolean')throw fail('请先连接 WhatsApp 并选择有效的客户会话');
    await this.chatHistory.setHidden(accountId,chatId,hidden);
    return {chatId,hidden};
  }
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
    const decorated=await this.decorate(rows,b);await this.chatHistory.save(b.accountId,b.chatId,decorated);return decorated;
  }
  async historyPage(binding,page,{limit=20,before=null,beforeId=null}={}){
    const live=await this.decorate(page.messages,binding);
    try{
      const archive=await this.decorate(page.archiveMessages||page.messages,binding);
      await this.chatHistory.save(binding.accountId,binding.chatId,archive);
      const saved=await this.chatHistory.page(binding.accountId,binding.chatId,{limit,before,beforeId});
      const current=new Map(live.map(row=>[row.id,row]));
      return {messages:saved.messages.map(row=>ManualChatHistory.merge(row,current.get(row.id)||row)),hasMore:page.hasMore||saved.hasMore,historyPartial:!page.hasMore&&!saved.hasMore,sourceCount:archive.length,...(page.archiveIssue?{historySaveIssue:page.archiveIssue}:{})};
    }catch(error){return {messages:live,hasMore:page.hasMore,historyPartial:!page.hasMore,sourceCount:live.length,historySaveIssue:'本机历史保存失败；本次消息仍可阅读，请检查存储空间。'};}
  }
  async retainedPage(binding,{limit=20,before=null,beforeId=null}={}){
    const saved=await this.chatHistory.page(binding.accountId,binding.chatId,{limit,before,beforeId});
    return {...saved,historyPartial:true,sourceCount:0,historySaveIssue:'WhatsApp 本次读取失败；显示本机已保存的真实消息，可稍后刷新重试。'};
  }
  async openInbox({chatId,limit=20}){
    if(typeof this.adapter.openInbox!=='function'||typeof this.adapter.recent!=='function')throw fail('当前 WhatsApp 连接不支持统一会话列表');
    const resolved=await this.adapter.openInbox({chatId});
    if(/^wa-phone:[1-9]\d{6,14}$/.test(chatId)&&resolved.chatId!==chatId)throw fail('实际打开的会话与所选号码不一致，已停止读取');
    const token=randomUUID(),binding={...resolved,createdAt:this.now()};this.bindings.set(token,binding);
    let page;try{const live=await this.adapter.recent({...binding,limit,archive:true});page=await this.historyPage(binding,live,{limit});}
    catch(error){page=await this.retainedPage(binding,{limit});}
    return {token,accountId:binding.accountId,chatId:binding.chatId,phone:binding.chatId.replace(/^wa-phone:/,''),identityVerified:binding.identityVerified,...page};
  }
  async recent({token,limit=20,before=null,beforeId=null}){
    const b=await this.target(token);if(typeof this.adapter.recent!=='function')return {messages:await this.history({token}),hasMore:false};
    try{const page=await this.adapter.recent({...b,limit,before,beforeId});return await this.historyPage(b,page,{limit,before,beforeId});}
    catch(error){return this.retainedPage(b,{limit,before,beforeId});}
  }
  async media({token,messageId,force=false}){
    if(typeof messageId!=='string'||!messageId.trim()||messageId.length>200)throw fail('图片消息标识无效');
    const b=await this.target(token);if(typeof this.adapter.retryMedia!=='function')throw fail('当前 WhatsApp 连接不支持读取图片');
    const row=await this.adapter.retryMedia({...b,messageId:messageId.trim(),force:force===true});return row?(await this.decorate([row],b))[0]:null;
  }
  async ledger(){try{return JSON.parse(await readFile(path.join(this.directory,'manual-outbox.json'),'utf8'));}catch(e){if(e.code==='ENOENT')return [];throw e;}}
  async persist(records){await mkdir(this.directory,{recursive:true});const temp=path.join(this.directory,`outbox-${randomUUID()}.tmp`);await writeFile(temp,JSON.stringify(records),{mode:0o600});await rename(temp,path.join(this.directory,'manual-outbox.json'));}
  send(payload){const next=this.queue.then(()=>this.perform(payload));this.queue=next.catch(()=>{});return next;}
  async perform({token,requestId,text,images=[],attachments=[],replyToMessageId=null}){
    if(!/^[a-f0-9-]{36}$/.test(requestId||'')||typeof text!=='string'||text.length>16000||!Array.isArray(images)||!Array.isArray(attachments)||images.length+attachments.length>6||(!text.trim()&&!images.length&&!attachments.length)||(replyToMessageId!==null&&(typeof replyToMessageId!=='string'||!replyToMessageId.trim()||replyToMessageId.length>200)))throw fail('发送内容无效');
    const outgoing=[...images.map((data,index)=>safeAttachment({dataUrl:data,name:`reply-image-${index+1}.${String(data).startsWith('data:image/png')?'png':String(data).startsWith('data:image/webp')?'webp':'jpg'}`},index)),...attachments.map((value,index)=>safeAttachment(value,images.length+index))];
    if(outgoing.reduce((sum,item)=>sum+item.size,0)>totalAttachmentLimitBytes)throw fail('本次附件总大小超过 32 MB');
    const b=await this.target(token);if(typeof this.adapter.sendVerified!=='function')throw fail('当前连接不支持人工发送，请连接 WhatsApp');
    const replyTo=replyToMessageId?.trim()||null,fingerprint=hash(JSON.stringify([b.accountId,b.chatId,text,outgoing.map(item=>[item.name,item.mimetype,hash(item.dataUrl)]),replyTo])),records=await this.ledger();
    const existing=records.find(r=>r.requestId===requestId);
    if(existing){if(existing.fingerprint!==fingerprint)throw fail('同一发送操作的内容已变化');return existing;}
    const recent=records.find(r=>r.fingerprint===fingerprint&&r.status==='sent'&&Date.parse(r.createdAt)>this.now()-300000);if(recent)return recent;
    if(records.some(r=>r.fingerprint===fingerprint&&r.status!=='sent'))throw fail('这份内容已有待核实的发送记录。请先在 WhatsApp 核对，系统不会重复发送。');
    // Verify before creating an outbox entry. Once dispatch starts, a timeout is uncertain, never automatically retried.
    await this.adapter.verifyManualTarget(b);
    const entry={requestId,fingerprint,accountId:b.accountId,chatId:b.chatId,status:'sending',parts:[],createdAt:new Date(this.now()).toISOString(),...(replyTo?{replyToMessageId:replyTo}:{})};
    const keep=records.filter(r=>r.status!=='sent'||Date.parse(r.createdAt)>this.now()-30*86400000);keep.push(entry);await this.persist(keep);
    const parts=[...(text.trim()?[{text}]:[]),...outgoing.map((attachment,index)=>({attachment,attachmentIndex:index}))].map((part,index)=>index===0&&replyTo?{...part,replyToMessageId:replyTo}:part);
    for(const part of parts){
      const record={kind:part.attachment?.kind||'text',attachmentIndex:part.attachmentIndex,status:'sending',...(part.attachment?{name:part.attachment.name,mimetype:part.attachment.mimetype}:{})};entry.parts.push(record);await this.persist(keep);
      try{const sent=await this.adapter.sendVerified(b,part);if(!sent?.id)throw fail('未取得消息回执');Object.assign(record,{status:'sent',id:sent.id});await this.persist(keep);}
      catch(cause){const reason=String(cause?.message||'WhatsApp 未返回可核对结果').slice(0,300);record.status='unknown';record.error=reason;entry.status='unknown';entry.message=`发送结果待核实：${reason}。可能已有部分消息发出；原稿保留，请在 WhatsApp 核对，系统不会自动重发。`;await this.persist(keep);return entry;}
    }
    entry.status='sent';await this.persist(keep);return entry;
  }
}
