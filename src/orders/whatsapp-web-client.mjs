import {EventEmitter} from 'node:events';
import path from 'node:path';
import {mkdir,chmod,writeFile,readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {execFile as execFileCallback} from 'node:child_process';
import {promisify} from 'node:util';
import {findChrome} from '../core/chrome-path.mjs';

const error=(message,code='WHATSAPP_CONNECTION')=>Object.assign(new Error(message),{code,stage:'WhatsApp 只读连接'});
const number=value=>{const s=String(value||'').replace(/^wa-phone:/,'').replace(/[+ ()-]/g,'');if(!/^[1-9]\d{6,14}$/.test(s))throw error('请输入包含国家区号的 WhatsApp 电话号码');return s;};
const serialized=value=>typeof value==='string'?value:value?._serialized ?? value?.$1;
const serializedMessageId=value=>{const direct=serialized(value);if(typeof direct==='string'&&direct)return direct;const remote=serialized(value?.remote),opaque=value?.id;if(typeof value?.fromMe!=='boolean'||typeof remote!=='string'||!remote||typeof opaque!=='string'||!opaque)return null;return `${value.fromMe}_${remote}_${opaque}`;};
const bounded=async(promise,ms)=>{let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(error('连接操作超时；已保存资料保留','WHATSAPP_TIMEOUT')),ms);})]);}finally{clearTimeout(timer);}};
const execFile=promisify(execFileCallback);
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const orphanedProfileBrowsers=async profile=>{const {stdout}=await execFile('/bin/ps',['-axo','pid=,ppid=,command='],{maxBuffer:1024*1024});return stdout.split('\n').map(line=>line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/)).filter(Boolean).map(match=>({pid:Number(match[1]),ppid:Number(match[2]),command:match[3]})).filter(row=>row.ppid===1&&row.command.includes(`--user-data-dir=${profile}`)&&/(?:Google Chrome|Chromium)/.test(row.command));};
const messageType=value=>String(value||'chat').toLowerCase();
const systemMessageType=type=>['notification_template','e2e_notification','revoked'].includes(type);
const systemMessageText=message=>messageType(message.type)==='revoked'?'此消息已撤回。':messageType(message.type)==='e2e_notification'?'WhatsApp 加密通知。':(message.subtype??message._data?.subtype)==='biz_account_type_changed_to_hosted'?'WhatsApp 商业账号类型已变更。':'WhatsApp 系统通知。';
const mediaKind=type=>({image:'image',sticker:'sticker',gif:'gif',video:'video'}[type]||null);
const mediaKindFor=(message,type=messageType(message?.type))=>mediaKind(type)||(/^image\/(?:png|jpeg|webp|gif)$/i.test(String(message?.mimetype||''))?'image':/^video\/mp4$/i.test(String(message?.mimetype||''))?'video':message?.hasMedia&&['unknown','oversized','album'].includes(type)?'image':null);
const mediaLabel=type=>({image:'图片',sticker:'贴纸',gif:'GIF 动图',video:'视频',audio:'语音',ptt:'语音',document:'文件',location:'位置',vcard:'联系人',contact:'联系人',ciphertext:'等待 WhatsApp 解密',album:'媒体相册',unknown:'媒体附件',oversized:'超大媒体',product:'商品卡片',order:'订单卡片',reaction:'表情回应'}[type]||'未知类型消息');
const messageFallback=(type,message)=>{if(type==='ciphertext')return '[等待 WhatsApp 解密的消息]';const label=mediaLabel(type),name=typeof message.filename==='string'&&message.filename.trim()?`：${message.filename.trim().slice(0,160)}`:'';return `[${label}${name}]`;};
const supportedMedia=(type,mimetype)=>/^image\/(?:png|jpeg|webp|gif)$/.test(mimetype)||(['gif','video'].includes(type)&&mimetype==='video/mp4');
const imageLimitBytes=16*1024*1024,videoLimitBytes=1_042_500,mediaCacheLimitBytes=48*1024*1024;
const canonicalMessageId=id=>String(id||'').replace(/^(true|false)_[^_]+_/,'$1_');
const locationDescription=message=>{const value=message?.location?.description??message?.location?.name??message?.locationDescription??message?.body;return typeof value==='string'&&value.trim()&&value.trim().length<=500?value.trim():null;};

// Only the maintained library owns the WhatsApp protocol and browser internals.
// This adapter never exposes its Client, authentication data, or send methods to UI.
export class WhatsAppWebClient {
 constructor({userDataPath,restriction=null,clientFactory=null,chromePath=null,clock=()=>Date.now(),reconnectDelays=[5000,15000,30000,60000],staleBrowserScanner=orphanedProfileBrowsers,processTerminator=pid=>process.kill(pid,'SIGTERM'),wait=pause}={}){
  this.mode='browser';this.live=true;this.userDataPath=userDataPath;this.authPath=path.join(userDataPath,'whatsapp-live-auth');this.marker=path.join(this.authPath,'connection.json');this.restriction=restriction;this.clientFactory=clientFactory;this.chromePath=chromePath;this.chromeOverride=chromePath;this.clock=clock;this.delays=reconnectDelays;this.staleBrowserScanner=staleBrowserScanner;this.processTerminator=processTerminator;this.wait=wait;this.events=new EventEmitter();this.candidates=new Map();this.targets=[];this.inboxRemotes=new Map();this.mediaCache=new Map();this.mediaCacheBytes=0;this.state={provider:'whatsapp-web.js',status:'disconnected',message:'自动消息连接尚未启动'};this.generation=0;this.closed=false;this.attempt=0;this.queue=Promise.resolve();this.mediaQueue=[];this.mediaActive=0;this.ownedClients=new Set();this.signaledClients=new WeakSet();this.exitHook=()=>{for(const c of this.ownedClients){try{if(!this.signaledClients.has(c)){c.pupBrowser?.process()?.kill('SIGTERM');this.signaledClients.add(c);}}catch{}}};
 }
 status(){return {...this.state};}
 subscribe(fn){this.events.on('update',fn);return()=>this.events.off('update',fn);}
 subscribeInbox(fn){this.events.on('inbox-message',fn);return()=>this.events.off('inbox-message',fn);}
 emit(value){this.events.emit('update',value);}
 stateChange(patch){if(patch.status&&patch.status!==this.state.status)this.phaseStarted=this.clock();this.state={...this.state,...patch};this.emit({kind:'state',state:this.status()});}
 allowedPhone(phone){return !this.restriction||phone===this.restriction.targetPhone;}
 async checkDependency(){if(!this.clientFactory){this.chromePath=await findChrome({explicitPath:this.chromeOverride});if(!this.chromePath){this.stateChange({status:'dependency-missing',message:'未找到 Google Chrome，请安装后点击连接。'});throw error('自动消息同步需要已安装的 Google Chrome','WHATSAPP_CHROME_MISSING');}}}
 async canResume(){try{const saved=JSON.parse(await readFile(this.marker,'utf8'));return saved.enabled===true;}catch{return false;}}
 async saveConnection(enabled){await mkdir(this.authPath,{recursive:true,mode:0o700});await chmod(this.authPath,0o700);await writeFile(this.marker,JSON.stringify({enabled}),{mode:0o600});}
 async open(){this.closed=false;await this.checkDependency();await this.saveConnection(true);void this.connect();return this.status();}
 async resume(){if(await this.canResume()){this.closed=false;void this.connect();}return this.status();}
 async reclaimOrphanedProfile(){const profile=path.join(this.authPath,'session-local-account');let rows;try{rows=await this.staleBrowserScanner(profile);}catch{return [];}const pids=[...new Set(rows.map(row=>row.pid).filter(pid=>Number.isInteger(pid)&&pid>1))];if(!pids.length)return [];for(const pid of pids){try{await this.processTerminator(pid);}catch{}}for(let attempt=0;attempt<10;attempt++){await this.wait(150);try{if(!(await this.staleBrowserScanner(profile)).length)break;}catch{break;}}this.emit({kind:'orphaned-browser-reclaimed',count:pids.length});return pids;}
 async connect(){
  if(this.closed||this.connecting||this.client)return;const generation=++this.generation,attempt=Symbol();this.connectAttempt=attempt;
  this.connecting=(async()=>{let attemptClient;try{
   await this.checkDependency();await mkdir(this.authPath,{recursive:true,mode:0o700});await chmod(this.authPath,0o700);await this.reclaimOrphanedProfile();
   let client;
   if(this.clientFactory)client=await this.clientFactory();else{
    const {default:library}=await import('whatsapp-web.js');
    class RetainedLocalAuth extends library.LocalAuth {async logout(){/* Preserve local session on failure. Explicit reconnect uses the existing profile. */}}
    class ReadOnlyClient extends library.Client {async inject(){try{return await super.inject();}catch(e){if(this.kdocsClosing&&/Target closed|Session closed|Execution context was destroyed/.test(String(e)))return;throw e;}}}
    client=new ReadOnlyClient({authStrategy:new RetainedLocalAuth({dataPath:this.authPath,clientId:'local-account'}),webVersionCache:{type:'local',path:path.join(this.authPath,'web-cache'),strict:false},puppeteer:{executablePath:this.chromePath,headless:true,args:['--no-first-run']},takeoverOnConflict:false,authTimeoutMs:60000});
   }
   if(this.closed||generation!==this.generation){await client.destroy();return;}attemptClient=client;this.client=client;this.ownedClients.add(client);if(!this.exitRegistered){process.on('exit',this.exitHook);this.exitRegistered=true;}this.stateChange({status:'connecting',message:'正在连接 WhatsApp；不会打开或刷新聊天窗口',qr:null});
   const current=()=>!this.closed&&generation===this.generation&&this.client===client;clearInterval(this.watchdog);this.watchdog=setInterval(()=>{if(current()&&['connecting','authenticated'].includes(this.state.status)&&this.clock()-this.phaseStarted>120000)void this.fail('连接准备超时，将自动重试；登录资料保留');},5000);this.watchdog.unref?.();
   client.on('qr',qr=>{void (async()=>{const {default:QRCode}=await import('qrcode');const image=await QRCode.toDataURL(qr,{width:280,margin:2});if(current())this.stateChange({status:'qr',message:'请用 WhatsApp 手机端的“已关联设备”扫码',qr:image});})().catch(()=>{if(current())this.stateChange({status:'error',message:'二维码显示失败，请重新连接'});});});
   client.on('authenticated',()=>{if(current())this.stateChange({status:'authenticated',message:'已认证，正在准备消息连接',qr:null});});
   client.on('ready',()=>{if(current())void this.ready(client,generation).catch(()=>this.fail('身份无法核对，请重新连接',true));});
   client.on('change_state',state=>{if(!current()||this.readyGeneration!==generation)return;if(['TIMEOUT','OPENING'].includes(state)){this.stateChange({status:'reconnecting',message:'网络连接中断，等待 WhatsApp 恢复；已保存资料保留'});if(!this.networkTimer)this.networkTimer=setTimeout(()=>{if(current())void this.fail('网络未恢复，将自动重新连接；登录资料保留');},60000);}else if(state==='CONNECTED'){clearTimeout(this.networkTimer);this.networkTimer=null;this.stateChange({status:'online',message:'自动消息连接在线'});this.emit({kind:'ready'});}});
   client.on('auth_failure',()=>{if(current())void this.fail('登录失效，请重新连接并扫码；本地资料保留',true);});
   client.on('disconnected',reason=>{if(current()){const login=['LOGOUT','UNPAIRED','UNPAIRED_IDLE'].includes(reason),conflict=['CONFLICT','TOS_BLOCK','SMB_TOS_BLOCK'].includes(reason);void this.fail(login?'登录已退出，请重新连接并扫码':conflict?'连接冲突或平台限制，请处理后重新连接；不会抢占其他会话':'连接中断，正在自动重连；已保存消息保留',login||conflict);}});
   client.on('message_create',message=>{if(current())this.handleMessage(message,generation);});
   client.on('message_edit',message=>{if(current())this.handleMessage(message,generation,true);});
   client.on('message_revoke_everyone',message=>{if(current())this.handleMessage(message,generation,true);});
   await client.initialize();
  }catch(error){if(!this.closed&&generation===this.generation){const code=String(error?.code||'');const message=code==='WHATSAPP_CHROME_MISSING'?error.message:code==='WHATSAPP_TIMEOUT'?error.message:code==='WHATSAPP_CONNECTION'?error.message:'WhatsApp Web 初始化失败，正在自动重试；登录资料保留。';this.lastConnectionError={code:code||'WHATSAPP_INITIALIZE_FAILED',message:String(error?.message||'').slice(0,240)};await this.fail(message,code==='WHATSAPP_LOGIN_REQUIRED'||code==='WHATSAPP_AUTH_REQUIRED');}}finally{if(attemptClient&&(this.closed||generation!==this.generation))await this.destroy(attemptClient);if(this.connectAttempt===attempt)this.connecting=null;}})();return this.connecting;
 }
 async ready(client,generation){
  const ended=()=>{if(!this.closed&&generation===this.generation&&this.client===client)void this.fail('后台浏览器连接中断，正在自动恢复；登录资料保留');};client.pupBrowser?.once?.('disconnected',ended);client.pupPage?.once?.('error',ended);client.pupPage?.once?.('close',ended);
  let me=serialized(client.info?.wid);if(me?.endsWith('@lid')){const pairs=await client.getContactLidAndPhone([me]);me=pairs.find(p=>p.lid===me)?.pn;}
  const account=number(me?.replace(/@c\.us$/,''));if(this.restriction&&account!==this.restriction.accountPhone)throw error('登录账号不在本次验证范围');
  if(generation!==this.generation||this.closed)return;this.accountId='wa-phone:'+account;this.readyGeneration=generation;this.attempt=0;await this.refreshAliases();if(generation!==this.generation||this.closed)return;clearInterval(this.watchdog);this.stateChange({status:'online',message:'自动消息连接在线',accountId:this.accountId,lastConnectedAt:new Date(this.clock()).toISOString(),qr:null});this.emit({kind:'ready'});
 }
 async setTargets(targets){this.targets=targets.filter(t=>this.allowedPhone(number(t.chatId))).map(t=>({...t,aliases:new Set([number(t.chatId)+'@c.us'])}));if(this.state.status==='online')await this.refreshAliases();}
 async refreshAliases(){for(const t of this.targets){if(t.accountId!==this.accountId)continue;try{const pairs=await bounded(this.client.getContactLidAndPhone([number(t.chatId)+'@c.us']),8000);for(const p of pairs||[])if(p.pn===number(t.chatId)+'@c.us'&&p.lid)t.aliases.add(p.lid);}catch{/* Existing verified PN/native aliases remain; unknown IDs are never guessed. */}}}
 async inbox({offset=0,limit=20,hiddenChatIds=[],hiddenOnly=false}={}){
  if(this.state.status!=='online')throw error('请先在连接与设置完成 WhatsApp 登录');
  const start=Math.max(0,Number.isSafeInteger(offset)?offset:0),size=Math.max(1,Math.min(50,Number.isSafeInteger(limit)?limit:20));
  const chats=await bounded(this.client.getChats(),30000),items=[];
  const remotes=chats.map(chat=>serialized(chat.id)||''),lids=remotes.filter(remote=>remote.endsWith('@lid'));
  const phoneByLid=new Map();
  if(lids.length){try{for(const pair of await bounded(this.client.getContactLidAndPhone(lids),30000)){const lid=serialized(pair?.lid)||'',pn=serialized(pair?.pn)||'',match=pn.match(/^([1-9]\d{6,14})@c\.us$/);if(lid&&match)phoneByLid.set(lid,match[1]);}}catch{/* Chats whose LID cannot be verified are omitted rather than assigned a guessed number. */}}
  for(const chat of chats){
   const remote=serialized(chat.id)||'',direct=remote.match(/^([1-9]\d{6,14})@c\.us$/),phone=direct?.[1]||phoneByLid.get(remote);if(!phone)continue;
   const latest=chat.lastMessage||null,stamp=Number(latest?.timestamp||chat.timestamp||0);
   if(!Number.isFinite(stamp)||stamp<=0)continue;
   let preview='',name=typeof chat.name==='string'?chat.name:'',avatarUrl=null;
   if(latest&&systemMessageType(messageType(latest.type)))preview=systemMessageText(latest);else if(latest)preview=typeof latest.body==='string'&&latest.body.trim()?latest.body:latest.type==='image'?'[图片]':latest.type==='ciphertext'?'[等待 WhatsApp 解密的消息]':'[非文字消息]';
   items.push({phone,chatId:'wa-phone:'+phone,name,avatarUrl,updatedAt:new Date(stamp*1000).toISOString(),preview,direction:latest?.fromMe?'merchant':'customer',unreadCount:Number(chat.unreadCount||0),binding:{accountId:this.accountId,chatId:'wa-phone:'+phone,accountPhone:number(this.accountId),targetPhone:phone,nativeRemote:remote,aliases:[remote,phone+'@c.us']},chat,remote});
  }
  const hidden=new Set(hiddenChatIds);items.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));const filtered=items.filter(item=>hidden.has(item.chatId)===hiddenOnly),page=filtered.slice(start,start+size);
  await Promise.all(page.map(async item=>{this.inboxRemotes.set(item.phone,item.remote);try{const contact=await bounded(item.chat.getContact(),8000);item.name=contact.pushname||contact.name||item.name;const photo=typeof contact.getProfilePicUrl==='function'?await bounded(contact.getProfilePicUrl(),8000):null;if(typeof photo==='string'&&/^https:\/\//.test(photo))item.avatarUrl=photo;}catch{/* No profile photo is treated as absent, never substituted with a fictional image. */}}));
  return {accountId:this.accountId,total:filtered.length,offset:start,items:page.map(({chat,remote,...item})=>item),hasMore:start+size<filtered.length};
 }
 async openInbox({chatId}={}){
  if(this.state.status!=='online')throw error('请先在连接与设置完成 WhatsApp 登录');
  const target=number(chatId),pn=target+'@c.us',preferred=this.inboxRemotes.get(target)||pn;
  const identify=async chat=>{
   const remote=serialized(chat.id);if(!remote)throw error('未能核对当前 WhatsApp 会话');
   const remotePhone=remote.match(/^([1-9]\d{6,14})@c\.us$/)?.[1];
   if(remotePhone)return {remote,identityVerified:remotePhone===target,conflict:remotePhone!==target};
   if(remote.endsWith('@lid')){
    try{const pairs=await bounded(this.client.getContactLidAndPhone([remote]),8000),mapped=pairs.find(pair=>serialized(pair?.lid)===remote)?.pn,mappedPhone=serialized(mapped)?.match(/^([1-9]\d{6,14})@c\.us$/)?.[1];
     if(mappedPhone)return {remote,identityVerified:mappedPhone===target,conflict:mappedPhone!==target};
    }catch{/* A temporary mapping failure is not evidence of a wrong number. */}
   }
   return {remote,identityVerified:false,conflict:false};
  };
  let chat;try{chat=await bounded(this.client.getChatById(preferred),10000);}catch(cause){if(preferred===pn)throw cause;chat=await bounded(this.client.getChatById(pn),10000);}
  let identity=await identify(chat);
  if(identity.conflict&&preferred!==pn){
   try{const directChat=await bounded(this.client.getChatById(pn),10000),directIdentity=await identify(directChat);if(directIdentity.identityVerified){chat=directChat;identity=directIdentity;this.inboxRemotes.set(target,directIdentity.remote);}}catch{/* Keep the confirmed conflict from the stale list mapping. */}
  }
  if(identity.conflict)throw error('WhatsApp 会话号码与所选号码不一致，已停止读取；请重新选择客户','WHATSAPP_IDENTITY_MISMATCH');
  const {remote,identityVerified}=identity;
  const aliases=new Set([pn,remote]);
  try{const pairs=await bounded(this.client.getContactLidAndPhone([pn]),8000);for(const pair of pairs||[])if(pair.pn===pn&&pair.lid)aliases.add(pair.lid);}catch{/* The verified phone remote remains sufficient. */}
  return {accountId:this.accountId,chatId:'wa-phone:'+target,identityVerified,binding:{accountId:this.accountId,chatId:'wa-phone:'+target,accountPhone:number(this.accountId),targetPhone:target,nativeRemote:remote,aliases:[...aliases]}};
 }
 async recent({accountId,chatId,binding,limit=20,before=null,beforeId=null,archive=false}={}){
  const count=Math.max(1,Math.min(100,Number.isSafeInteger(limit)?limit:20)),need=before?5000:archive?500:Math.max(100,count),{target,messages}=await this.fetch({accountId,chatId,binding,limit:need});
  const cutoff=before?Date.parse(before):Number.POSITIVE_INFINITY;
  const archiveMessages=[];let skipped=0;
  for(const message of messages){try{archiveMessages.push(this.normalize(message,target));}catch{skipped++;}}
  archiveMessages.sort((a,b)=>a.sentAt.localeCompare(b.sentAt)||a.id.localeCompare(b.id));
  const rows=archiveMessages.filter(m=>Date.parse(m.sentAt)<cutoff||beforeId&&Date.parse(m.sentAt)===cutoff&&m.id<beforeId);
  return {messages:rows.slice(-count),archiveMessages,hasMore:rows.length>count,...(skipped?{archiveIssue:`WhatsApp 本次有 ${skipped} 条消息身份或时间无法核对；其他已核实消息已保存。`}:{})};
 }
 async inspect({targetPhone}={}){
  if(this.state.status!=='online')throw error('请先连接并完成扫码，等状态显示在线');const target=number(targetPhone);if(!this.allowedPhone(target))throw error('此聊天不在本次授权验证范围');
  const pn=target+'@c.us',id=serialized(await bounded(this.client.getNumberId(target),10000)),pairs=await bounded(this.client.getContactLidAndPhone([pn]),10000),aliases=[pn,...(pairs||[]).filter(p=>p.pn===pn).map(p=>p.lid)].filter(Boolean),token=randomUUID();if(!id||!aliases.includes(id))throw error('未能核对这个 WhatsApp 号码与当前聊天标识');
  const candidate={accountId:this.accountId,chatId:'wa-phone:'+target,accountPhone:number(this.accountId),targetPhone:target,nativeRemote:id,aliases,token,expiresAt:this.clock()+300000};this.candidates.set(token,candidate);for(const [k,c] of this.candidates)if(c.expiresAt<this.clock())this.candidates.delete(k);return candidate;
 }
 async resolve({accountId,chatId,candidateToken,binding}={}){const c=candidateToken?this.candidates.get(candidateToken):binding;if(this.state.status!=='online'||!c||candidateToken&&c.expiresAt<this.clock()||c.accountId!==accountId||c.chatId!==chatId||accountId!==this.accountId||!this.allowedPhone(number(chatId)))throw error('聊天核对结果已失效，请重新核对号码');return {accountId,chatId,binding:{...c,confirmedAt:new Date(this.clock()).toISOString()}};}
 targetFor(message){const remote=serialized(message.id?.remote)|| (message.fromMe?message.to:message.from);return this.targets.find(t=>t.accountId===this.accountId&&t.aliases.has(remote));}
 async directTargetFor(message){
  const remote=serialized(message.id?.remote)|| (message.fromMe?message.to:message.from);
  if(typeof remote!=='string')return null;
  let phone=remote.match(/^([1-9]\d{6,14})@c\.us$/)?.[1];
  if(!phone&&/^\d+@lid$/.test(remote)){
   const pairs=await bounded(this.client.getContactLidAndPhone([remote]),8000);
   phone=pairs.find(pair=>serialized(pair?.lid)===remote)?.pn?.match(/^([1-9]\d{6,14})@c\.us$/)?.[1];
  }
  if(!phone||!this.allowedPhone(phone))return null;
  return {accountId:this.accountId,chatId:'wa-phone:'+phone,aliases:new Set([remote,phone+'@c.us'])};
 }
 normalize(message,target){
  const id=serialized(message.id),remote=serialized(message.id?.remote),sentAt=new Date(Number(message.timestamp)*1000).toISOString();if(!id||id.length>200||!target.aliases.has(remote)||typeof message.fromMe!=='boolean'||!id.startsWith((message.fromMe?'true_':'false_')+remote+'_')||!Number.isSafeInteger(message.timestamp)||message.timestamp<=0)throw error('消息标识或时间无法核对');
  let text=message.body||'';if(typeof text!=='string'||text.length>16000)throw error('消息正文超过安全限制');const type=messageType(message.type);
  if(systemMessageType(type))return {id,accountId:target.accountId,chatId:target.chatId,direction:message.fromMe?'merchant':'customer',sentAt,text:type==='revoked'?systemMessageText(message):text||systemMessageText(message),metadata:{source:'whatsapp-wwebjs',timePrecision:'second',messageType:type,media:[],incomplete:false,note:null}};
  const kind=mediaKindFor(message,type),displayType=kind||type,cached=this.mediaCache.get(target.accountId+':'+id);
  if(!text)text=messageFallback(displayType,message);
  const incomplete=Boolean(message.isEdited)||Boolean(message.hasQuotedMsg)||type!=='chat'&&!(kind&&cached);
  const media=cached?[{...cached}]:kind?[{type:kind,status:'unavailable',source:'attachment',mimetype:typeof message.mimetype==='string'?message.mimetype:null,filename:typeof message.filename==='string'?message.filename:null}]:type!=='chat'&&type!=='ciphertext'?[{type,status:'unavailable',source:'attachment',mimetype:typeof message.mimetype==='string'?message.mimetype:null,filename:typeof message.filename==='string'?message.filename:null}]:[];
  const note=incomplete?(kind?`${mediaLabel(displayType)}正在读取；暂时不能显示时请在 WhatsApp 查看。`:`${mediaLabel(displayType)}内容请在 WhatsApp 查看。`):null;
  const location=type==='location'?{description:locationDescription(message)}:undefined;
  return {id,accountId:target.accountId,chatId:target.chatId,direction:message.fromMe?'merchant':'customer',sentAt,text,metadata:{source:'whatsapp-wwebjs',timePrecision:'second',messageType:displayType,media,incomplete,note,...(location?{location}:{})}};
 }
 handleMessage(message,generation,edited=false){
  if(generation!==this.readyGeneration)return;const target=this.targetFor(message),captureInbox=this.events.listenerCount('inbox-message')>0;
  if(!target&&!captureInbox)return; // Do not inspect unrelated message bodies without local inbox retention enabled.
  this.queue=this.queue.then(async()=>{if(this.closed||generation!==this.generation)return;const current=this.targetFor(message);
   if(edited){if(current)this.emit({kind:'conflict',accountId:current.accountId,chatId:current.chatId});return;}
   const direct=captureInbox?await this.directTargetFor(message):null;
   if(!current&&!direct)return;
   if(direct){const normalized=this.normalize(message,direct);this.events.emit('inbox-message',normalized);}
   if(current){const normalized=this.normalize(message,current);if(!current.ranges.some(r=>normalized.sentAt>=r.from&&normalized.sentAt<=r.to()))return;this.emit({kind:'message',message:normalized});this.stateChange({lastReceivedAt:new Date(this.clock()).toISOString()});}
  }).catch(()=>{this.stateChange({lastError:'有消息未通过校验，已保存记录保留'});this.emit({kind:'receive-error'});});
 }
 scheduleMedia(message,target,generation,{trusted=false}={}){
  const id=serialized(message.id),type=messageType(message.type),key=target.accountId+':'+id;
  if(!(mediaKindFor(message,type)||message.hasMedia)||typeof message.downloadMedia!=='function'||this.mediaCache.has(key)||this.mediaQueue.length>=200||this.mediaQueue.some(job=>!job.manual&&job.generation===generation&&serialized(job.message.id)===id))return;
  this.mediaQueue.push({message,target,generation,trusted});this.drainMedia();
 }
 drainMedia(){
  while(!this.closed&&this.mediaActive<2&&this.mediaQueue.length){
   const job=this.mediaQueue.shift();if(job.generation!==this.generation){job.reject?.(error('WhatsApp 连接已变化，请重新打开图片'));continue;}
   this.mediaActive++;
   void (async()=>{const source=job.manual?await this.locateMediaMessage(job.input):{message:job.message,target:job.target};const key=source.target.accountId+':'+serialized(source.message.id),cached=this.mediaCache.get(key);if(cached&&!job.input?.force){this.mediaCache.delete(key);this.mediaCache.set(key,cached);return this.normalize(source.message,source.target);}return this.downloadImage(source.message,source.target,job.generation,{manual:job.manual,emit:!job.manual,trusted:job.trusted});})().then(value=>job.resolve?.(value),failure=>job.reject?.(failure)).finally(()=>{this.mediaActive--;this.drainMedia();});
  }
 }
 async locateMediaMessage(input){
  const {target,messages}=await this.fetch({...input,limit:1});
  let message=null;
  if(typeof this.client.getMessageById==='function')try{message=await bounded(this.client.getMessageById(input.messageId),15000);}catch{/* The single recent row is still usable when direct lookup is unavailable. */}
  message??=messages.find(row=>canonicalMessageId(serialized(row.id))===canonicalMessageId(input.messageId));
  if(!message)throw error('WhatsApp 当前未返回这条图片；可在 WhatsApp 打开该聊天后重试','WHATSAPP_MEDIA_NOT_FOUND');
  if(canonicalMessageId(serialized(message.id))!==canonicalMessageId(input.messageId))throw error('图片标识与所选消息不一致，已停止读取','WHATSAPP_MEDIA_IDENTITY');
  this.normalize(message,target);
  if(!(mediaKindFor(message,messageType(message.type))||message.hasMedia))throw error('这条消息没有可读取的图片附件','WHATSAPP_MEDIA_UNAVAILABLE');
  return {target,message};
 }
 async downloadImage(message,target,generation,{manual=false,emit=true,trusted=false}={}){
  if(systemMessageType(messageType(message.type)))return null;
  if(typeof message.downloadMedia!=='function')throw error('WhatsApp 暂未提供图片下载接口，可稍后重试','WHATSAPP_MEDIA_UNAVAILABLE');
  const media=await bounded(message.downloadMedia(),30000);
  if(this.closed||generation!==this.generation||!manual&&!trusted&&!this.targets.some(t=>t.accountId===target.accountId&&t.chatId===target.chatId))return null;
  const type=messageType(message.type),id=serialized(message.id);
  if(!media||typeof media.data!=='string'||!media.data.length)throw error('WhatsApp 暂未返回图片数据，可稍后重试','WHATSAPP_MEDIA_UNAVAILABLE');
  if(!supportedMedia(type,media.mimetype))throw error('当前附件格式暂不支持本机显示，请在 WhatsApp 查看原文件','WHATSAPP_MEDIA_UNSUPPORTED');
  const maxBytes=media.mimetype==='video/mp4'?videoLimitBytes:imageLimitBytes;
  const bytes=Math.floor(media.data.length*3/4)-(media.data.endsWith('==')?2:media.data.endsWith('=')?1:0);
  if(bytes>maxBytes)throw error(media.mimetype==='video/mp4'?'视频超过本机安全显示上限，请在 WhatsApp 查看':'图片超过本机 16 MB 安全显示上限，请在 WhatsApp 查看原图','WHATSAPP_MEDIA_TOO_LARGE');
  if(!/^[A-Za-z0-9+/]+=*$/.test(media.data))throw error('WhatsApp 返回的图片内容无效，可稍后重试','WHATSAPP_MEDIA_INVALID');
  const kind=type==='sticker'?'sticker':media.mimetype==='image/gif'||type==='gif'?'gif':media.mimetype==='video/mp4'||type==='video'?'video':'image';
  const key=target.accountId+':'+id,old=this.mediaCache.get(key);if(old){this.mediaCacheBytes-=old.dataUrl.length;this.mediaCache.delete(key);}
  while(this.mediaCache.size&&(this.mediaCache.size>=20||this.mediaCacheBytes+media.data.length+64>mediaCacheLimitBytes)){const [first,entry]=this.mediaCache.entries().next().value;this.mediaCache.delete(first);this.mediaCacheBytes-=entry.dataUrl.length;}
  const cached={type:kind,status:'cached',source:'attachment',mimetype:media.mimetype,filename:typeof message.filename==='string'?message.filename:null,dataUrl:'data:'+media.mimetype+';base64,'+media.data};
  this.mediaCache.set(key,cached);this.mediaCacheBytes+=cached.dataUrl.length;
  const normalized=this.normalize(message,target);if(emit)this.emit({kind:'message',message:normalized});return normalized;
 }
 async fetch({accountId,chatId,binding,limit=500}){await this.resolve({accountId,chatId,binding});const pn=number(chatId)+'@c.us',target=this.targets.find(t=>t.accountId===accountId&&t.chatId===chatId)||{accountId,chatId,aliases:new Set([pn])};if(target.aliases.size===1){const pairs=await bounded(this.client.getContactLidAndPhone([pn]),8000);for(const p of pairs||[])if(p.pn===pn&&p.lid)target.aliases.add(p.lid);}const remote=target.aliases.has(binding.nativeRemote)?binding.nativeRemote:pn,chat=await bounded(this.client.getChatById(remote),10000);if(!target.aliases.has(serialized(chat.id)))throw error('聊天身份变化，停止读取');const messages=await bounded(chat.fetchMessages({limit}),45000);return {target,messages};}
 async verifyManualTarget(binding){
  await this.resolve(binding);const generation=this.generation,client=this.client;
  const remote=number(binding.chatId)+'@c.us',chat=await bounded(client.getChatById(remote),10000);
  if(this.closed||this.generation!==generation||this.client!==client||this.state.status!=='online'||!binding.binding.aliases.includes(serialized(chat.id)))throw error('聊天身份或连接已变化，请重新核对');
  return {remote,client,generation};
 }
 async sendVerified(binding,part){
  const {remote,client,generation}=await this.verifyManualTarget(binding);let content=part.text,sendMediaAsDocument=false;
  if(part.attachment||part.image){const attachment=part.attachment||{dataUrl:part.image,name:'reply-image.jpg',kind:'image'},match=attachment.dataUrl.match(/^data:([a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*);base64,([A-Za-z0-9+/]+=*)$/i);if(!match)throw error('附件格式无效');const {default:library}=await import('whatsapp-web.js');content=new library.MessageMedia(match[1].toLowerCase(),match[2],attachment.name);sendMediaAsDocument=attachment.kind==='file';}
  if(this.closed||generation!==this.generation||this.client!==client||this.state.status!=='online')throw error('连接已变化');
  const options={sendSeen:false,waitUntilMsgSent:true,...(sendMediaAsDocument?{sendMediaAsDocument:true}:{})};
  if(part.replyToMessageId){
   if(typeof part.replyToMessageId!=='string'||!part.replyToMessageId.trim()||part.replyToMessageId.length>200)throw error('引用消息标识无效','WHATSAPP_QUOTE_INVALID');
   let quoted=null;if(typeof client.getMessageById==='function')try{quoted=await bounded(client.getMessageById(part.replyToMessageId),15000);}catch{/* Fall back to the verified target chat. */}
   if(!quoted){const chat=await bounded(client.getChatById(remote),10000),rows=await bounded(chat.fetchMessages({limit:100}),15000);quoted=rows.find(message=>canonicalMessageId(serialized(message.id))===canonicalMessageId(part.replyToMessageId));}
   const quoteId=serialized(quoted?.id),quoteRemote=quoteId?.match(/^(?:true|false)_([^_]+)_.+$/)?.[1];
   if(!quoteId||canonicalMessageId(quoteId)!==canonicalMessageId(part.replyToMessageId)||!quoteRemote||!binding.binding.aliases.includes(quoteRemote))throw error('引用消息不属于当前已核对会话，已停止发送','WHATSAPP_QUOTE_IDENTITY');
   options.quotedMessageId=quoteId;
  }
  const result=await bounded(client.sendMessage(remote,content,options),45000),id=serializedMessageId(result?.id);
  let receiptRemote=typeof id==='string'?id.match(/^true_([1-9]\d{6,14}@(c\.us|lid))_.+$/)?.[1]:null,verified=Boolean(id&&id.length<=200&&receiptRemote);
  if(!verified&&receiptRemote?.endsWith('@lid'))try{const pairs=await bounded(client.getContactLidAndPhone([receiptRemote]),8000),target=number(binding.chatId)+'@c.us';verified=pairs.some(pair=>serialized(pair?.lid)===receiptRemote&&serialized(pair?.pn)===target);if(verified&&!binding.binding.aliases.includes(receiptRemote))binding.binding.aliases.push(receiptRemote);}catch{/* An unmapped receipt remains unverified. */}
  if(!verified&&id&&id.length<=200)try{const chat=await bounded(client.getChatById(remote),10000),chatRemote=serialized(chat.id);if(!binding.binding.aliases.includes(chatRemote))throw error('回执聊天身份变化');const recent=await bounded(chat.fetchMessages({limit:20}),15000),nonce=canonicalMessageId(id);verified=recent.some(message=>canonicalMessageId(serialized(message.id))===nonce&&message.fromMe===true);}catch{/* A matching receipt absent from the verified target chat remains unverified. */}
  if(!verified)throw error('消息可能已发出，但 WhatsApp 回执身份无法核对；请查看目标会话','WHATSAPP_SEND_RECEIPT_UNVERIFIED');
  return {id};
 }
 async read(input){const {target,messages}=await this.fetch(input),visible=messages.filter(m=>m.timestamp*1000>=Date.parse(input.from)&&m.timestamp*1000<=Date.parse(input.to));return visible.map(m=>this.normalize(m,target));}
 async readHistory({accountId,chatId,binding,cancelled=()=>false,onBatch,direction='latest'}){const {target,messages}=await this.fetch({accountId,chatId,binding,limit:direction==='older'?5000:500});for(let n=0;n<messages.length;n+=100){if(cancelled())return;const batch=messages.slice(n,n+100),rows=batch.map(m=>this.normalize(m,target));await onBatch(rows,{reader:'wwebjs',complete:false,status:'recent-saved',coverage:'recent-library-available',note:'已保存连接库可获取的近期记录；账号全部历史覆盖未确认。'});}return {complete:false};}
 async supplement(input){const generation=this.generation,started=this.clock();let rows=[],anchor=false;for(const limit of [500,1000,2000,5000]){if(this.closed||generation!==this.generation||input.cancelled?.()||this.clock()-started>120000)return {gap:true};const {target,messages}=await this.fetch({...input,limit});rows=messages.map(m=>this.normalize(m,target)).filter(m=>m.sentAt<=input.to);const nonce=id=>id.replace(/^(true|false)_[^_]+_/,'$1_'),known=new Set((input.knownIds||[]).map(nonce));anchor=rows.some(m=>known.has(nonce(m.id)))||rows.some(m=>m.sentAt<=input.from);for(let n=0;n<rows.length;n+=100){if(input.cancelled?.())return {gap:true};await input.onBatch(rows.slice(n,n+100).filter(m=>m.sentAt>=input.from));}if(anchor||messages.length<limit)break;}return {gap:!anchor,cursorIds:rows.slice(-500).map(m=>m.id)};}
 async retryMedia(input){
  if(this.mediaQueue.length>=200)throw error('图片读取队列已满，请稍后重试','WHATSAPP_MEDIA_BUSY');
  return new Promise((resolve,reject)=>{this.mediaQueue.unshift({manual:true,input,generation:this.generation,resolve,reject});this.drainMedia();});
 }
 cancelQueuedMedia(reason){const jobs=this.mediaQueue.splice(0);for(const job of jobs)job.reject?.(error(reason,'WHATSAPP_MEDIA_CANCELLED'));}
 async fail(message,requiresScan=false){if(this.closed||this.failing)return;this.failing=true;this.generation++;clearTimeout(this.networkTimer);this.networkTimer=null;clearInterval(this.watchdog);this.cancelQueuedMedia('WhatsApp 连接已变化，请重新打开图片');this.stateChange({status:requiresScan?'auth-required':'reconnecting',message,qr:null,lastError:this.lastConnectionError||null});const client=this.client;this.client=null;await this.destroy(client);this.connecting=null;this.connectAttempt=null;this.failing=false;if(!requiresScan&&!this.closed){clearTimeout(this.retryTimer);this.retryTimer=setTimeout(()=>{void this.connect();},this.delays[Math.min(this.attempt++,this.delays.length-1)]);this.retryTimer.unref?.();}}
 async destroy(client){if(!client)return;client.kdocsClosing=true;client.pupPage?.removeAllListeners?.('framenavigated');const process=client.pupBrowser?.process?.();try{await bounded(client.destroy(),10000);}catch{/* The owned Chromium process is terminated below even if library cleanup fails. */}finally{try{if(process&&!process.killed&&!this.signaledClients.has(client)){process.kill('SIGTERM');this.signaledClients.add(client);}}catch{}this.ownedClients.delete(client);}}
 async close(){this.closed=true;clearTimeout(this.networkTimer);this.networkTimer=null;clearTimeout(this.retryTimer);clearInterval(this.watchdog);this.cancelQueuedMedia('WhatsApp 连接已关闭，请重新打开图片');this.generation++;const c=this.client;this.client=null;await this.destroy(c);this.connecting=null;this.connectAttempt=null;await this.queue;if(this.exitRegistered){process.off('exit',this.exitHook);this.exitRegistered=false;}}
}
