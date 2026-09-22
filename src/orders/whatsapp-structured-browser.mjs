import {WhatsAppBrowser,chatError} from './whatsapp-browser.mjs';
import {randomUUID} from 'node:crypto';

// Runs in the application's own WhatsApp page. No credentials, other-chat
// enumeration, message listeners, send methods or customer bodies during identity checks.
export async function structuredOperation(input){
 const req=name=>window.require(name),serial=v=>typeof v==='string'?v:v?._serialized;
 const native=m=>m.id?._serialized||m.id?.serialized||String(m.id);
 const me=serial(req('WAWebUserPrefsMeUser').getMaybeMePnUser());
 if(!/^\d{7,15}@c\.us$/.test(me||''))throw Error('WHATSAPP_LOGIN_REQUIRED');
 const main=document.querySelector('#main');
 const mounted=()=>[...main?.querySelectorAll('[data-id]')||[]].map(e=>e.getAttribute('data-id'));
 const ids=mounted(),remotes=[...new Set(ids.map(id=>id?.match(/^(?:true|false)_([^_]+)_/)?.[1]).filter(Boolean))];
 if(!main||!ids.length)throw Error('WHATSAPP_TARGET_UNVERIFIED');
 const shortLayout=remotes.length===0&&ids.every(id=>/^[A-Za-z0-9-]{1,200}$/.test(id||''));
 const title=(main.querySelector('header')?.innerText||'').split('\n')[0].replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,'').trim();
 const headerPhone=/^\+?\d[\d ()-]{5,24}\d$/.test(title)?title.replace(/\D/g,''):null;
 if(!shortLayout&&remotes.length!==1||shortLayout&&!headerPhone)throw Error('WHATSAPP_TARGET_UNVERIFIED');
 const remote=shortLayout?headerPhone+'@c.us':remotes[0],wid=req('WAWebWidFactory').createWid(remote),api=req('WAWebApiContact');
 const pn=remote.endsWith('@c.us')?wid:api.getPhoneNumber(wid);
 const target=serial(pn);
 if(!/^\d{7,15}@c\.us$/.test(target||''))throw Error('WHATSAPP_TARGET_UNVERIFIED');
 const lid=api.getCurrentLid(pn),aliases=[target,serial(lid)].filter(Boolean);
 if(!aliases.includes(remote))throw Error('WHATSAPP_TARGET_CHANGED');
 const chat=req('WAWebCollections').Chat.get(wid)||req('WAWebCollections').Chat.get(pn)||(lid&&req('WAWebCollections').Chat.get(lid));
 if(!chat||!aliases.includes(serial(chat.id)))throw Error('WHATSAPP_TARGET_UNVERIFIED');
 const nativeRemote=shortLayout?serial(chat.id):remote;
 const proveMounted=()=>{
  const current=mounted();if(!current.length)throw Error('WHATSAPP_TARGET_UNVERIFIED');
  if(!shortLayout){if(current.some(id=>!aliases.includes(id?.match(/^(?:true|false)_([^_]+)_/)?.[1])))throw Error('WHATSAPP_TARGET_CHANGED');return;}
  const models=chat.msgs.getModelsArray();
  // A phone caption alone never authorizes reading: each mounted short ID must
  // match exactly one native message in this selected PN/LID chat namespace.
  for(const id of current){const matches=models.filter(m=>m.id?.id===id||native(m)===id);if(matches.length!==1||!aliases.includes(serial(matches[0].id?.remote)))throw Error('WHATSAPP_TARGET_CHANGED');}
 };
 proveMounted();
 if(input.op==='identify')return {accountId:'wa-phone:'+me.split('@')[0],chatId:'wa-phone:'+target.split('@')[0],accountPhone:me.split('@')[0],targetPhone:target.split('@')[0],nativeRemote,aliases,timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone};
 const verify=()=>{
  if(input.accountId!=='wa-phone:'+serial(req('WAWebUserPrefsMeUser').getMaybeMePnUser())?.split('@')[0]||input.chatId!=='wa-phone:'+target.split('@')[0]||!aliases.includes(input.nativeRemote)||document.querySelector('#main')!==main)throw Error('WHATSAPP_TARGET_CHANGED');
  if((main.querySelector('header')?.innerText||'').split('\n')[0].replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,'').trim()!==title)throw Error('WHATSAPP_TARGET_CHANGED');
  proveMounted();
 };
 verify();
 if(input.op==='guard')return {verified:true};
 const models=()=>chat.msgs.getModelsArray().filter(m=>!m.isNotification&&m.type!=='e2e_notification');
 const boundary=()=>{const state=chat.msgs.msgLoadState,webTopLoaded=state?.noEarlierMsgs===true&&state.contextLoaded===true&&state.isLoadingEarlierMsgs===false&&state.isRepairingMsgHistory!==true;return {noEarlierMsgs:chat.noEarlierMsgs===true||webTopLoaded,endOfHistoryTransfer:chat.endOfHistoryTransfer===true,webTopLoaded,transferType:chat.endOfHistoryTransferType??null};};
 if(input.op==='snapshot'){
  const all=models();if(all.length>50000)throw Error('WHATSAPP_HISTORY_LIMIT');
  // Validate the full target namespace before accessing any body, including rows outside this page.
  for(const m of all){if(!aliases.includes(serial(m.id?.remote)))throw Error('WHATSAPP_TARGET_CHANGED');if(!/^(true|false)_[^_]+_.+/.test(native(m))||native(m).length>200||typeof m.id.fromMe!=='boolean'||!Number.isSafeInteger(m.t)||m.t<=0)throw Error('WHATSAPP_MESSAGE_INVALID');}
  all.sort((a,b)=>a.t-b.t||native(a).localeCompare(native(b)));
  const messages=all.slice(input.offset||0,(input.offset||0)+200).filter(m=>m.t*1000<=input.cutoff).map(m=>{
   const id=native(m);if(!/^(true|false)_[^_]+_.+/.test(id)||id.length>200||typeof m.id.fromMe!=='boolean'||!Number.isSafeInteger(m.t)||m.t<=0)throw Error('WHATSAPP_MESSAGE_INVALID');
   const text=m.body??'';if(typeof text!=='string'||text.length>16000)throw Error('WHATSAPP_MESSAGE_INVALID');
   return {id,direction:m.id.fromMe?'merchant':'customer',sentAt:new Date(m.t*1000).toISOString(),type:m.type,text,quoted:!!(m.quotedStanzaID||m.quotedMsg),edited:!!m.isEdited};
  });verify();
  return {messages,total:all.length,boundary:boundary(),fingerprint:all.map(m=>native(m)+':'+m.type).join('|')};
 }
 if(input.op==='load') {const rows=await req('WAWebChatLoadMessages').loadEarlierMsgs({chat});verify();return {loaded:rows?.length||0,boundary:boundary()};}
 if(input.op==='historyRequest'){await req('WAWebSendNonMessageDataRequest').sendPeerDataOperationRequest(3,{chatId:chat.id});verify();return {invoked:true};}
 if(input.op==='recover'){
  const wanted=new Set(input.ids),rows=models().filter(m=>wanted.has(native(m))&&m.type==='ciphertext'&&!(m.subtype&&m.subtype.endsWith('_unavailable_fanout')));
  for(const m of rows)if(!aliases.includes(serial(m.id.remote)))throw Error('WHATSAPP_TARGET_CHANGED');
  if(rows.length)await req('WAWebNonMessageDataRequestPlaceholderMessageResendUtils').handlePlaceholderMsgsSeen(rows,true);
  verify();return {invoked:rows.length};
 }
 if(input.op==='image'){
  const msg=models().find(m=>native(m)===input.id);
  if(!msg||msg.type!=='image'||!aliases.includes(serial(msg.id.remote)))throw Error('WHATSAPP_TARGET_CHANGED');
  if(msg.size>1000000||!['image/jpeg','image/png','image/webp'].includes(msg.mimetype)||!msg.mediaData)return {type:'image',status:'unavailable',source:'attachment'};
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  try{
   if(msg.mediaData.mediaStage==='REUPLOADING')return {type:'image',status:'unavailable',source:'attachment'};
   if(msg.mediaData.mediaStage!=='RESOLVED')await Promise.race([msg.downloadMedia({downloadEvenIfExpensive:true,rmrReason:1}),new Promise((_,reject)=>controller.signal.addEventListener('abort',()=>reject(Error('media timeout')),{once:true}))]);
   if(msg.mediaData.mediaStage!=='RESOLVED')return {type:'image',status:'unavailable',source:'attachment'};
   const qpl={addAnnotations(){return this;},addPoint(){return this;}};
   const bytes=await req('WAWebDownloadManager').downloadManager.downloadAndMaybeDecrypt({directPath:msg.directPath,encFilehash:msg.encFilehash,filehash:msg.filehash,mediaKey:msg.mediaKey,mediaKeyTimestamp:msg.mediaKeyTimestamp,type:msg.type,signal:controller.signal,downloadQpl:qpl});
   verify();if(bytes.byteLength>1000000)return {type:'image',status:'unavailable',source:'attachment'};
   const dataUrl=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(new Blob([bytes],{type:msg.mimetype}));});
   verify();return {type:'image',status:'cached',source:'attachment',dataUrl};
  }catch(e){verify();return {type:'image',status:'unavailable',source:'attachment'};}finally{clearTimeout(timer);}
 }
 throw Error('WHATSAPP_OPERATION_INVALID');
}

export function structuredMessage(m,{accountId,chatId},media=[]){
 const placeholder=m.type==='ciphertext',unsupported=m.type!=='chat',incomplete=unsupported||m.quoted||m.edited||!m.text.trim();
 return {id:m.id,accountId,chatId,direction:m.direction,sentAt:m.sentAt,text:placeholder?'[等待 WhatsApp 解密此消息]':m.text|| (m.type==='image'?'[图片]':'[非文字消息，请在 WhatsApp 查看]'),metadata:{source:'whatsapp-structured',timePrecision:'second',messageType:m.type,media,incomplete:Boolean(incomplete),note:placeholder?'WhatsApp 尚未提供这条消息的正文；保留占位，不用于资料提取。':m.type==='image'?'图片可查看；图片内容尚未用于 AI 理解。':incomplete?'此消息的附件、引用或编辑内容需在 WhatsApp 核对。':null}};
}

export class WhatsAppStructuredBrowser extends WhatsAppBrowser{
 constructor(options={}){super(options);this.limits={waitMs:4000,stalls:5,maxBatches:10000,deadlineMs:30*60*1000,...options.limits};}
 async operation(input){
  let timer,poll;
  try{return await Promise.race([this.page.evaluate(structuredOperation,input),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('WHATSAPP_LOADING_TIMEOUT')),20000);poll=setInterval(()=>{if(this.activeCancelled?.())reject(Error('WHATSAPP_CANCELLED'));},100);})]);}
  catch(e){const code=String(e.message).match(/WHATSAPP_[A-Z_]+/)?.[0]||'WHATSAPP_STRUCTURE_UNAVAILABLE';throw chatError(code==='WHATSAPP_LOGIN_REQUIRED'?'WhatsApp 需要扫码登录；已保存聊天保留。':code==='WHATSAPP_TARGET_CHANGED'?'读取期间账号或聊天已切换，本批未保存。':'WhatsApp 网页读取未完成，已保存记录保留；'+(code==='WHATSAPP_STRUCTURE_UNAVAILABLE'?'当前网页结构需要适配。':'身份或消息依据未通过核验。'),code);}
  finally{clearTimeout(timer);clearInterval(poll);}
 }
 async currentIdentity(){if(this.restriction)return super.currentIdentity();if(!this.page||this.page.isClosed()||new URL(this.page.url()).origin!=='https://web.whatsapp.com')throw chatError('请先打开专用 WhatsApp 窗口');await this.page.locator('#main [data-id]').first().waitFor({state:'attached',timeout:8000});return this.operation({op:'identify'});}
 async historyReadGuard({expectedRemote=null}={}){
  if(this.restriction)return super.historyReadGuard({expectedRemote});
  const current=await this.currentIdentity();if(expectedRemote&&current.nativeRemote!==expectedRemote)throw chatError('核对后聊天已切换，未读取历史','WHATSAPP_TARGET_CHANGED');
  const page=this.page,url=page.url(),main=await page.locator('#main').elementHandle(),token=randomUUID();
  await main.evaluate((e,token)=>{const title=(e.querySelector('header')?.innerText||'').split('\n')[0],state={changed:false};state.observer=new MutationObserver(()=>{if((e.querySelector('header')?.innerText||'').split('\n')[0]!==title)state.changed=true;});state.observer.observe(e,{subtree:true,childList:true,characterData:true});e[token]=state;},token);
  return {verify:async()=>{const same=page.url()===url&&await main.evaluate((e,token)=>e.isConnected&&e===document.querySelector('#main')&&!e[token]?.changed,token).catch(()=>false);if(!same)throw chatError('同步期间聊天已切换或页面已重载，本批未保存','WHATSAPP_TARGET_CHANGED');await this.operation({...current,op:'guard'});},dispose:async()=>{await main.evaluate((e,token)=>{e[token]?.observer.disconnect();delete e[token];},token).catch(()=>{});await main.dispose();}};
 }
 async readHistory(input){if(this.restriction)return super.readHistory(input);return this.exclusive(async()=>{
  const {accountId,chatId,binding,cancelled=()=>false,onBatch,progress={},direction='latest'}=input;
  if(!['latest','older'].includes(direction))throw chatError('同步方向无效');
  const current=await this.currentIdentity();if(!binding||binding.accountId!==accountId||binding.chatId!==chatId||current.accountId!==accountId||current.chatId!==chatId)throw chatError('当前聊天与关联不符，停止历史读取','WHATSAPP_TARGET_CHANGED');
  const guard=await this.historyReadGuard({expectedRemote:current.nativeRemote}),args={accountId,chatId,nativeRemote:current.nativeRemote,cutoff:Date.now()},deadline=Date.now()+this.limits.deadlineMs;
  let earliest=progress.earliest||null,latest=progress.latest||null,earliestId=progress.earliestId||null,last='',stalls=0,batches=0,peerRequested=false,recoveryInvoked=false;
  const images=new Map(),pending=new Set();
  const report=async(messages,status,note,boundary={})=>{await guard.verify();await this.operation({...args,op:'guard'});if(cancelled()&&status==='running')return;await onBatch(messages,{complete:false,status,note,earliest,latest,earliestId,batchesRead:batches,coverage:'selected-web-history',incompleteIds:[...pending],boundary,reader:'structured'});};
  try{
   this.activeCancelled=cancelled;
   while(Date.now()<deadline&&batches<this.limits.maxBatches){
    if(cancelled()){await report([],'cancelled','已停止同步；成功批次保留。');return;}
    let offset=0,snapshot,recoveryIds=[];
    do{
     await guard.verify();snapshot=await this.operation({...args,op:'snapshot',offset});if(cancelled())break;
     let rows=[],bytes=0;
     for(const m of snapshot.messages){
      if(cancelled()||Date.now()>=deadline||batches>=this.limits.maxBatches)break;
      if(m.type==='image'&&!images.has(m.id)){await guard.verify();const cached=await input.mediaLookup?.(m.id);images.set(m.id,cached?.source==='attachment'&&cached.status==='cached'?cached:await this.operation({...args,op:'image',id:m.id}));await guard.verify();if(images.size>64)images.delete(images.keys().next().value);}
      const row=structuredMessage(m,args,m.type==='image'?[images.get(m.id)]:[]);rows.push(row);
      bytes+=JSON.stringify(row).length;if(bytes>8*1024*1024){const tail=rows.pop();batches++;await report(rows,'running','正在逐批保存聊天图片和文字。',snapshot.boundary);rows=[tail];bytes=JSON.stringify(tail).length;}
      if(row.metadata.incomplete)pending.add(row.id);else pending.delete(row.id);
      if(m.type==='ciphertext')recoveryIds.push(m.id);
      if(!earliest||m.sentAt<earliest){earliest=m.sentAt;earliestId=m.id;}if(!latest||m.sentAt>latest)latest=m.sentAt;
     }
     batches++;await report(rows,'running','正在读取此客户可获取的聊天，逐批保存。',snapshot.boundary);offset+=200;
    }while(offset<snapshot.total&&Date.now()<deadline&&batches<this.limits.maxBatches&&!cancelled());
    if(cancelled()){await report([],'cancelled','已停止同步；成功批次保留。');return;}
    if(offset<snapshot.total)break;
    if(recoveryIds.length&&!recoveryInvoked){recoveryInvoked=true;try{await this.operation({...args,op:'recover',ids:recoveryIds});}catch(e){if(e.code==='WHATSAPP_TARGET_CHANGED')throw e;}}
    if(snapshot.fingerprint===last)stalls++;else stalls=0;last=snapshot.fingerprint;
    // Web exhaustion is a separate fact from the phone's complete history.
    if(stalls>=this.limits.stalls){const top=snapshot.boundary.noEarlierMsgs&&(snapshot.boundary.endOfHistoryTransfer||snapshot.boundary.webTopLoaded);await report([],top?'web-top-verified':'coverage-unverified',top?'已保存网页当前可获取历史；手机完整历史仍待核对。':'已保存可获取记录；网页未确认历史到底，完整覆盖待核对。',snapshot.boundary);this.state={status:'read_verified',message:'可获取聊天已保存；'+pending.size+'条内容待核对，完整历史覆盖未确认'};return;}
    await guard.verify();const loaded=await this.operation({...args,op:'load'});
    if(!loaded.loaded&&!loaded.boundary.noEarlierMsgs&&!peerRequested){peerRequested=true;try{await this.operation({...args,op:'historyRequest'});}catch(e){if(e.code==='WHATSAPP_TARGET_CHANGED')throw e;}}
    await this.page.waitForTimeout(this.limits.waitMs);
   }
   await report([],'paused','已到达30分钟或10000批保护上限，成功批次保留，可人工继续。');
  }catch(e){if(e.code==='WHATSAPP_CANCELLED'&&cancelled()){await report([],'cancelled','已停止同步；成功批次保留。');return;}throw e;}finally{this.activeCancelled=null;await guard.dispose();}
 });}
 async read(input){if(this.restriction)return super.read(input);const messages=new Map();let progress;await this.readHistory({...input,onBatch:async(rows,p)=>{rows.forEach(m=>messages.set(m.id,m));progress=p;}});const selected=[...messages.values()].filter(m=>m.sentAt>=input.from&&m.sentAt<=input.to);if(selected.length>500||progress?.status==='paused'||progress?.status==='cancelled'||(!progress?.boundary?.noEarlierMsgs&&progress?.earliest>input.from))throw chatError('本单范围尚未完整核对，已停止提取','WHATSAPP_INCOMPLETE');return selected;}
}
