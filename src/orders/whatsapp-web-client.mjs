import {EventEmitter} from 'node:events';
import path from 'node:path';
import {mkdir,chmod,writeFile,readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {findChrome} from '../core/chrome-path.mjs';

const error=(message,code='WHATSAPP_CONNECTION')=>Object.assign(new Error(message),{code,stage:'WhatsApp 只读连接'});
const number=value=>{const s=String(value||'').replace(/^wa-phone:/,'').replace(/[+ ()-]/g,'');if(!/^[1-9]\d{6,14}$/.test(s))throw error('请输入包含国家区号的 WhatsApp 电话号码');return s;};
const serialized=value=>typeof value==='string'?value:value?._serialized ?? value?.$1;
const bounded=async(promise,ms)=>{let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(error('连接操作超时；已保存资料保留','WHATSAPP_TIMEOUT')),ms);})]);}finally{clearTimeout(timer);}};

// Only the maintained library owns the WhatsApp protocol and browser internals.
// This adapter never exposes its Client, authentication data, or send methods to UI.
export class WhatsAppWebClient {
 constructor({userDataPath,restriction=null,clientFactory=null,chromePath=null,clock=()=>Date.now(),reconnectDelays=[5000,15000,30000,60000]}={}){
  this.mode='browser';this.live=true;this.userDataPath=userDataPath;this.authPath=path.join(userDataPath,'whatsapp-live-auth');this.marker=path.join(this.authPath,'connection.json');this.restriction=restriction;this.clientFactory=clientFactory;this.chromePath=chromePath;this.chromeOverride=chromePath;this.clock=clock;this.delays=reconnectDelays;this.events=new EventEmitter();this.candidates=new Map();this.targets=[];this.state={provider:'whatsapp-web.js',status:'disconnected',message:'自动消息连接尚未启动'};this.generation=0;this.closed=false;this.attempt=0;this.queue=Promise.resolve();this.mediaQueue=[];this.mediaActive=0;this.ownedClients=new Set();this.exitHook=()=>{for(const c of this.ownedClients){try{c.pupBrowser?.process()?.kill('SIGTERM');}catch{}}};
 }
 status(){return {...this.state};}
 subscribe(fn){this.events.on('update',fn);return()=>this.events.off('update',fn);}
 emit(value){this.events.emit('update',value);}
 stateChange(patch){if(patch.status&&patch.status!==this.state.status)this.phaseStarted=this.clock();this.state={...this.state,...patch};this.emit({kind:'state',state:this.status()});}
 allowedPhone(phone){return !this.restriction||phone===this.restriction.targetPhone;}
 async checkDependency(){if(!this.clientFactory){this.chromePath=await findChrome({explicitPath:this.chromeOverride});if(!this.chromePath){this.stateChange({status:'dependency-missing',message:'未找到 Google Chrome，请安装后点击连接。'});throw error('自动消息同步需要已安装的 Google Chrome','WHATSAPP_CHROME_MISSING');}}}
 async canResume(){try{const saved=JSON.parse(await readFile(this.marker,'utf8'));return saved.enabled===true;}catch{return false;}}
 async saveConnection(enabled){await mkdir(this.authPath,{recursive:true,mode:0o700});await chmod(this.authPath,0o700);await writeFile(this.marker,JSON.stringify({enabled}),{mode:0o600});}
 async open(){this.closed=false;await this.checkDependency();await this.saveConnection(true);void this.connect();return this.status();}
 async resume(){if(await this.canResume()){this.closed=false;void this.connect();}return this.status();}
 async connect(){
  if(this.closed||this.connecting||this.client)return;const generation=++this.generation,attempt=Symbol();this.connectAttempt=attempt;
  this.connecting=(async()=>{let attemptClient;try{
   await this.checkDependency();await mkdir(this.authPath,{recursive:true,mode:0o700});await chmod(this.authPath,0o700);
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
 async inbox({offset=0,limit=20}={}){
  if(this.state.status!=='online')throw error('请先在连接与设置完成 WhatsApp 登录');
  const start=Math.max(0,Number.isSafeInteger(offset)?offset:0),size=Math.max(1,Math.min(50,Number.isSafeInteger(limit)?limit:20));
  const chats=await bounded(this.client.getChats(),30000),items=[];
  for(const chat of chats){
   const remote=serialized(chat.id)||'',match=remote.match(/^([1-9]\d{6,14})@c\.us$/);if(!match)continue;
   const latest=chat.lastMessage||null,stamp=Number(latest?.timestamp||chat.timestamp||0);
   if(!Number.isFinite(stamp)||stamp<=0)continue;
   let preview='',name=typeof chat.name==='string'?chat.name:'',avatarUrl=null;
   if(latest)preview=typeof latest.body==='string'&&latest.body.trim()?latest.body:latest.type==='image'?'[图片]':latest.type==='ciphertext'?'[等待 WhatsApp 解密的消息]':'[非文字消息]';
   try{const contact=await bounded(chat.getContact(),8000);name=contact.pushname||contact.name||name;const photo=typeof contact.getProfilePicUrl==='function'?await bounded(contact.getProfilePicUrl(),8000):null;if(typeof photo==='string'&&/^https:\/\//.test(photo))avatarUrl=photo;}catch{/* No profile photo is treated as absent, never substituted with a fictional image. */}
   items.push({phone:match[1],chatId:'wa-phone:'+match[1],name,avatarUrl,updatedAt:new Date(stamp*1000).toISOString(),preview,direction:latest?.fromMe?'merchant':'customer',unreadCount:Number(chat.unreadCount||0),binding:{accountId:this.accountId,chatId:'wa-phone:'+match[1],accountPhone:number(this.accountId),targetPhone:match[1],nativeRemote:remote,aliases:[remote,match[1]+'@c.us']}});
  }
  items.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));return {accountId:this.accountId,total:items.length,offset:start,items:items.slice(start,start+size),hasMore:start+size<items.length};
 }
 async openInbox({chatId}={}){
  if(this.state.status!=='online')throw error('请先在连接与设置完成 WhatsApp 登录');
  const target=number(chatId),pn=target+'@c.us',chat=await bounded(this.client.getChatById(pn),10000),remote=serialized(chat.id);
  if(!remote)throw error('未能核对当前 WhatsApp 会话');const aliases=new Set([pn,remote]);
  try{const pairs=await bounded(this.client.getContactLidAndPhone([pn]),8000);for(const pair of pairs||[])if(pair.pn===pn&&pair.lid)aliases.add(pair.lid);}catch{/* The verified phone remote remains sufficient. */}
  return {accountId:this.accountId,chatId:'wa-phone:'+target,binding:{accountId:this.accountId,chatId:'wa-phone:'+target,accountPhone:number(this.accountId),targetPhone:target,nativeRemote:remote,aliases:[...aliases]}};
 }
 async recent({accountId,chatId,binding,limit=20,before=null}={}){
  const count=Math.max(1,Math.min(100,Number.isSafeInteger(limit)?limit:20)),need=before?5000:Math.max(100,count),{target,messages}=await this.fetch({accountId,chatId,binding,limit:need});
  const cutoff=before?Date.parse(before):Number.POSITIVE_INFINITY;
  const rows=messages.map(m=>this.normalize(m,target)).filter(m=>Date.parse(m.sentAt)<cutoff).sort((a,b)=>a.sentAt.localeCompare(b.sentAt));
  return {messages:rows.slice(-count),hasMore:rows.length>count};
 }
 async inspect({targetPhone}={}){
  if(this.state.status!=='online')throw error('请先连接并完成扫码，等状态显示在线');const target=number(targetPhone);if(!this.allowedPhone(target))throw error('此聊天不在本次授权验证范围');
  const pn=target+'@c.us',id=serialized(await bounded(this.client.getNumberId(target),10000)),pairs=await bounded(this.client.getContactLidAndPhone([pn]),10000),aliases=[pn,...(pairs||[]).filter(p=>p.pn===pn).map(p=>p.lid)].filter(Boolean),token=randomUUID();if(!id||!aliases.includes(id))throw error('未能核对这个 WhatsApp 号码与当前聊天标识');
  const candidate={accountId:this.accountId,chatId:'wa-phone:'+target,accountPhone:number(this.accountId),targetPhone:target,nativeRemote:id,aliases,token,expiresAt:this.clock()+300000};this.candidates.set(token,candidate);for(const [k,c] of this.candidates)if(c.expiresAt<this.clock())this.candidates.delete(k);return candidate;
 }
 async resolve({accountId,chatId,candidateToken,binding}={}){const c=candidateToken?this.candidates.get(candidateToken):binding;if(this.state.status!=='online'||!c||candidateToken&&c.expiresAt<this.clock()||c.accountId!==accountId||c.chatId!==chatId||accountId!==this.accountId||!this.allowedPhone(number(chatId)))throw error('聊天核对结果已失效，请重新核对号码');return {accountId,chatId,binding:{...c,confirmedAt:new Date(this.clock()).toISOString()}};}
 targetFor(message){const remote=serialized(message.id?.remote)|| (message.fromMe?message.to:message.from);return this.targets.find(t=>t.accountId===this.accountId&&t.aliases.has(remote));}
 normalize(message,target){
  const id=serialized(message.id),remote=serialized(message.id?.remote),sentAt=new Date(Number(message.timestamp)*1000).toISOString();if(!id||id.length>200||!target.aliases.has(remote)||typeof message.fromMe!=='boolean'||!id.startsWith((message.fromMe?'true_':'false_')+remote+'_')||!Number.isSafeInteger(message.timestamp)||message.timestamp<=0)throw error('消息标识或时间无法核对');
  let text=message.body||'';if(typeof text!=='string'||text.length>16000)throw error('消息正文超过安全限制');const image=message.type==='image',waiting=message.type==='ciphertext',unsupported=!['chat','image'].includes(message.type)||Boolean(message.isEdited)||Boolean(message.hasQuotedMsg)||image;
  if(!text)text=image?'[图片]':waiting?'[等待 WhatsApp 解密的消息]':'[非文字消息，请在 WhatsApp 查看]';
  return {id,accountId:target.accountId,chatId:target.chatId,direction:message.fromMe?'merchant':'customer',sentAt,text,metadata:{source:'whatsapp-wwebjs',timePrecision:'second',messageType:message.type,media:image?[{type:'image',status:'unavailable',source:'attachment'}]:[],incomplete:unsupported,note:unsupported?'此消息需在 WhatsApp 核对。':null}};
 }
 handleMessage(message,generation,edited=false){
  if(generation!==this.readyGeneration)return;const target=this.targetFor(message);if(!target)return; // Filter before touching body or downloading attachments.
  this.queue=this.queue.then(async()=>{if(this.closed||generation!==this.generation)return;const current=this.targetFor(message);if(!current)return;if(edited){this.emit({kind:'conflict',accountId:current.accountId,chatId:current.chatId});return;}
   const normalized=this.normalize(message,current);if(!current.ranges.some(r=>normalized.sentAt>=r.from&&normalized.sentAt<=r.to()))return;this.emit({kind:'message',message:normalized});this.stateChange({lastReceivedAt:new Date(this.clock()).toISOString()});
   this.scheduleMedia(message,current,generation);
  }).catch(()=>{this.stateChange({lastError:'有消息未通过校验，已保存记录保留'});this.emit({kind:'receive-error'});});
 }
 scheduleMedia(message,target,generation){if(message.type==='image'&&this.mediaQueue.length<200&&!this.mediaQueue.some(j=>j.generation===generation&&serialized(j.message.id)===serialized(message.id))){this.mediaQueue.push({message,target,generation});this.drainMedia();}}
 drainMedia(){while(!this.closed&&this.mediaActive<2&&this.mediaQueue.length){const job=this.mediaQueue.shift();if(job.generation!==this.generation)continue;this.mediaActive++;void this.downloadImage(job.message,job.target,job.generation).catch(()=>{}).finally(()=>{this.mediaActive--;this.drainMedia();});}}
 async downloadImage(message,target,generation,{manual=false,emit=true}={}){const media=await bounded(message.downloadMedia(),20000);if(this.closed||generation!==this.generation||!manual&&!this.targets.some(t=>t.accountId===target.accountId&&t.chatId===target.chatId))return null;const m=this.normalize(message,target);if(media&&/^image\/(png|jpeg|webp)$/.test(media.mimetype)&&typeof media.data==='string'&&media.data.length<=1390000&&/^[A-Za-z0-9+/]+=*$/.test(media.data)){m.metadata.media=[{type:'image',status:'cached',source:'attachment',dataUrl:'data:'+media.mimetype+';base64,'+media.data}];if(emit)this.emit({kind:'message',message:m});return m;}return null;}
 async fetch({accountId,chatId,binding,limit=500}){await this.resolve({accountId,chatId,binding});const pn=number(chatId)+'@c.us',target=this.targets.find(t=>t.accountId===accountId&&t.chatId===chatId)||{accountId,chatId,aliases:new Set([pn])};if(target.aliases.size===1){const pairs=await bounded(this.client.getContactLidAndPhone([pn]),8000);for(const p of pairs||[])if(p.pn===pn&&p.lid)target.aliases.add(p.lid);}const remote=target.aliases.has(binding.nativeRemote)?binding.nativeRemote:pn,chat=await bounded(this.client.getChatById(remote),10000);if(!target.aliases.has(serialized(chat.id)))throw error('聊天身份变化，停止读取');const messages=await bounded(chat.fetchMessages({limit}),45000);return {target,messages};}
 async verifyManualTarget(binding){
  await this.resolve(binding);const generation=this.generation,client=this.client;
  const remote=number(binding.chatId)+'@c.us',chat=await bounded(client.getChatById(remote),10000);
  if(this.closed||this.generation!==generation||this.client!==client||this.state.status!=='online'||!binding.binding.aliases.includes(serialized(chat.id)))throw error('聊天身份或连接已变化，请重新核对');
  return {remote,client,generation};
 }
 async sendVerified(binding,part){
  const {remote,client,generation}=await this.verifyManualTarget(binding);let content=part.text;
  if(part.image){const match=part.image.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+=*)$/);if(!match)throw error('图片格式无效');const {default:library}=await import('whatsapp-web.js');content=new library.MessageMedia(match[1],match[2],'reply-image.'+(match[1]==='image/png'?'png':match[1]==='image/webp'?'webp':'jpg'));}
  if(this.closed||generation!==this.generation||this.client!==client||this.state.status!=='online')throw error('连接已变化');
  const result=await bounded(client.sendMessage(remote,content,{sendSeen:false,waitUntilMsgSent:true}),45000),id=serialized(result?.id);
  if(!id||result.fromMe!==true||!binding.binding.aliases.some(alias=>id.startsWith('true_'+alias+'_')))throw error('发送回执无法核对');
  return {id};
 }
 async read(input){const {target,messages}=await this.fetch(input);return messages.filter(m=>m.timestamp*1000>=Date.parse(input.from)&&m.timestamp*1000<=Date.parse(input.to)).map(m=>this.normalize(m,target));}
 async readHistory({accountId,chatId,binding,cancelled=()=>false,onBatch,direction='latest'}){const generation=this.generation,{target,messages}=await this.fetch({accountId,chatId,binding,limit:direction==='older'?5000:500});for(let n=0;n<messages.length;n+=100){if(cancelled())return;const batch=messages.slice(n,n+100),rows=batch.map(m=>this.normalize(m,target));await onBatch(rows,{reader:'wwebjs',complete:false,status:'recent-saved',coverage:'recent-library-available',note:'已保存连接库可获取的近期记录；账号全部历史覆盖未确认。'});for(const m of batch)this.scheduleMedia(m,target,generation);}return {complete:false};}
 async supplement(input){const generation=this.generation,started=this.clock();let rows=[],anchor=false;for(const limit of [500,1000,2000,5000]){if(this.closed||generation!==this.generation||input.cancelled?.()||this.clock()-started>120000)return {gap:true};const {target,messages}=await this.fetch({...input,limit});rows=messages.map(m=>this.normalize(m,target)).filter(m=>m.sentAt<=input.to);const nonce=id=>id.replace(/^(true|false)_[^_]+_/,'$1_'),known=new Set((input.knownIds||[]).map(nonce));anchor=rows.some(m=>known.has(nonce(m.id)))||rows.some(m=>m.sentAt<=input.from);for(let n=0;n<rows.length;n+=100){if(input.cancelled?.())return {gap:true};await input.onBatch(rows.slice(n,n+100).filter(m=>m.sentAt>=input.from));}for(const m of messages)if(m.timestamp*1000>=Date.parse(input.from)&&m.timestamp*1000<=Date.parse(input.to)&&!input.hasCachedImage?.(serialized(m.id)))this.scheduleMedia(m,target,generation);if(anchor||messages.length<limit)break;}return {gap:!anchor,cursorIds:rows.slice(-500).map(m=>m.id)};}
 async retryMedia(input){const {target,messages}=await this.fetch({...input,limit:500});const m=messages.find(m=>serialized(m.id)===input.messageId||serialized(m.id).replace(/^(true|false)_[^_]+_/,'$1_')===input.messageId.replace(/^(true|false)_[^_]+_/,'$1_'));if(!m||m.type!=='image')throw error('近期记录中未找到此图片，请在 WhatsApp 查看原图');return this.downloadImage(m,target,this.generation,{manual:true,emit:false});}
 async fail(message,requiresScan=false){if(this.closed||this.failing)return;this.failing=true;this.generation++;clearTimeout(this.networkTimer);this.networkTimer=null;clearInterval(this.watchdog);this.mediaQueue=[];this.stateChange({status:requiresScan?'auth-required':'reconnecting',message,qr:null,lastError:this.lastConnectionError||null});const client=this.client;this.client=null;await this.destroy(client);this.connecting=null;this.connectAttempt=null;this.failing=false;if(!requiresScan&&!this.closed){clearTimeout(this.retryTimer);this.retryTimer=setTimeout(()=>{void this.connect();},this.delays[Math.min(this.attempt++,this.delays.length-1)]);this.retryTimer.unref?.();}}
 async destroy(client){if(!client)return;client.kdocsClosing=true;client.pupPage?.removeAllListeners?.('framenavigated');const process=client.pupBrowser?.process?.();try{await bounded(client.destroy(),10000);}catch{/* The owned Chromium process is terminated below even if library cleanup fails. */}finally{try{if(process&&!process.killed)process.kill('SIGTERM');}catch{}this.ownedClients.delete(client);}}
 async close(){this.closed=true;clearTimeout(this.networkTimer);this.networkTimer=null;clearTimeout(this.retryTimer);clearInterval(this.watchdog);this.mediaQueue=[];this.generation++;const c=this.client;this.client=null;await this.destroy(c);this.connecting=null;this.connectAttempt=null;await this.queue;if(this.exitRegistered){process.off('exit',this.exitHook);this.exitRegistered=false;}}
}
