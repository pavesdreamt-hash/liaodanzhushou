import {normalizeChatRange} from './assistant-range.mjs';
import path from 'node:path';
import {mkdir} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {chromium} from 'playwright-core';
export const chatError=(message,code='WHATSAPP_READ')=>Object.assign(new Error(message),{code,stage:'WhatsApp 只读连接'});
const digits=s=>String(s||'').replace(/\D/g,'');
const phone=s=>{const value=digits(s);if(!/^[1-9]\d{6,14}$/.test(value))throw chatError('无法核对账号或聊天号码，请打开一对一联系人聊天');return value;};
const identity=(account,target)=>({accountId:'wa-phone:'+account,chatId:'wa-phone:'+target});
const hash=s=>createHash('sha256').update(s).digest('hex');
export function sourceTimestamp(prefix,timeZone){
 const m=String(prefix).match(/^\[(\d{1,2}):(\d{2}), (\d{4})年(\d{1,2})月(\d{1,2})日\]/);
 if(!m)throw chatError('消息时间格式无法可靠识别，未读取正文；请使用中文 WhatsApp 网页');
 const [,h,min,y,month,day]=m.map(Number);if(h>23||min>59||month<1||month>12||day<1||day>31)throw chatError('消息时间无效');
 const format=new Intl.DateTimeFormat('en-CA',{timeZone,hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'});
 const parts=value=>Object.fromEntries(format.formatToParts(new Date(value)).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));
 const local=Date.UTC(y,month-1,day,h,min);let utc=local;
 for(let i=0;i<3;i++){const p=parts(utc);utc+=local-Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second);}
 const p=parts(utc);if(p.year!==y||p.month!==month||p.day!==day||p.hour!==h||p.minute!==min)throw chatError('消息日期或时区无效');
 return new Date(utc).toISOString();
}
// Browser evaluation returns metadata first. Text is read only from validated,
// in-range containers in the selected chat, never the conversation list.
export async function readVisibleMessages(page,{accountId,chatId,from,to,timeZone,onlyIds=null,maxMessages=20,requireCoverage=true,archiveMode=false}){
 const range=normalizeChatRange({from,to}),start=Date.parse(range.from),end=Date.parse(range.to);
 const selector=onlyIds?onlyIds.map(id=>{if(!/^[\w@.:-]{1,200}$/.test(id))throw chatError('消息标识无效');return `#main [data-id="${id}"]`;}).join(','):'#main [data-id]';
 if(!selector)return [];
 const key=date=>{const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone,hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).formatToParts(new Date(date)).map(p=>[p.type,p.value]));return parts.year+parts.month+parts.day+parts.hour+parts.minute;};
 // Only boundary booleans and in-range metadata leave the page. The default
 // path checks loaded timestamps; it never returns older bodies or identifiers.
 const scan=await page.locator(selector).evaluateAll((rows,{startKey,endKey,restricted})=>{
  const parsed=rows.map((row,index)=>{
   const prefix=row.querySelector('[data-pre-plain-text]')?.getAttribute('data-pre-plain-text')?.match(/^\[[^\]]+\]/)?.[0]||null;
   const m=prefix?.match(/^\[(\d{1,2}):(\d{2}), (\d{4})年(\d{1,2})月(\d{1,2})日\]/);
   return {row,index,prefix,key:m?m[3]+m[4].padStart(2,'0')+m[5].padStart(2,'0')+m[1].padStart(2,'0')+m[2]:null};
  });
  const before=parsed.filter(p=>p.key&&p.key<=startKey).at(-1)?.index??-1;
  const after=parsed.find(p=>p.key&&p.key>endKey)?.index??rows.length;
  return {containerCount:rows.length,coveredStart:before>=0,coveredEnd:after<rows.length,unknownInRange:parsed.some(p=>!p.key&&(restricted||p.index>before&&p.index<after)),metadata:parsed.filter(p=>p.key&&p.key>=startKey&&p.key<=endKey).map(p=>({id:p.row.getAttribute('data-id'),prefix:p.prefix}))};
 },{startKey:key(start),endKey:key(end),restricted:Boolean(onlyIds)});
 if(onlyIds&&scan.containerCount!==onlyIds.length)throw chatError('本次指定消息尚未完整加载，请保持当前聊天可见');
 if(!onlyIds&&requireCoverage){
  const panel=page.locator('#main [data-testid="conversation-panel-body"]');const atBottom=await panel.count()===1?await panel.evaluate(e=>e.scrollHeight-e.scrollTop-e.clientHeight<8).catch(()=>false):false;
  if(!scan.coveredStart||!scan.coveredEnd&&!atBottom)throw chatError('所选时间段尚未完整显示，请在此聊天加载起始位置或缩小时间范围；未读取正文','WHATSAPP_INCOMPLETE');
 }
 if(scan.unknownInRange)throw chatError('所选范围含有时间无法核对的消息或非文字内容，本批未保存');
 const selected=scan.metadata.map(m=>({...m,sentAt:sourceTimestamp(m.prefix,timeZone)})).filter(m=>Date.parse(m.sentAt)>=start&&Date.parse(m.sentAt)<=end);
 if(selected.length>maxMessages)throw chatError(`本次超过 ${maxMessages} 条消息，页面批次过大；未截断读取`);
 const messages=[];
 for(const m of selected){
  if(!/^[\w@.:-]{1,200}$/.test(m.id))throw chatError('缺少可靠的原生消息标识');
  const row=page.locator(`#main [data-id="${m.id}"]`);
  if(await row.count()!==1)throw chatError('消息重复或页面已变化','WHATSAPP_LIST_CHANGED');
  const value=await row.evaluate(e=>{
   const body=e.querySelector('[data-pre-plain-text]'),icons=[...e.querySelectorAll('[data-icon]')].map(n=>n.getAttribute('data-icon'));
   let n=e,direction=null;while(n&&n.id!=='main'){if(n.classList.contains('message-in'))direction='customer';if(n.classList.contains('message-out'))direction='merchant';n=n.parentElement;}
   const incoming=icons.includes('tail-in'),outgoing=icons.includes('tail-out')||icons.some(i=>/^msg-(dblcheck|check|time)/.test(i));
   if(incoming&&!outgoing)direction='customer';if(outgoing&&!incoming)direction='merchant';if(incoming&&outgoing)direction=null;
   return {text:body?.innerText||'',prefix:body?.getAttribute('data-pre-plain-text')?.match(/^\[[^\]]+\]/)?.[0],direction,edited:!!e.querySelector('[data-testid*="edited"]'),media:[...e.querySelectorAll('[data-testid*="image-thumb"] img')].slice(0,4).map(img=>{try{if(!img.complete||!img.naturalWidth)throw Error();const scale=Math.min(1,640/img.naturalWidth,640/img.naturalHeight),canvas=document.createElement('canvas');canvas.width=Math.round(img.naturalWidth*scale);canvas.height=Math.round(img.naturalHeight*scale);canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);return {type:'image',status:'cached',dataUrl:canvas.toDataURL('image/jpeg',.8)};}catch{return {type:'image',status:'unavailable'};}}),unsupported:!!e.querySelector('audio,video,[data-testid*="sticker"],[data-testid*="document"],[data-testid*="quoted"],[data-testid*="forwarded"]')};
  });
  if(value.prefix!==m.prefix||!value.direction||value.text.length>16000||(!archiveMode&&((!value.text.trim()&&!value.media.length)||value.unsupported||value.edited)))throw chatError('消息方向、编辑状态或非文字内容无法完整核对，本批未保存');
  const incomplete=value.unsupported||value.edited||value.media.length>0||(!value.text.trim()&&!value.media.length),text=archiveMode&&!value.text.trim()&&!value.media.length?'[非文字消息，请在 WhatsApp 查看]':value.text;
  messages.push({id:m.id,accountId,chatId,direction:value.direction,sentAt:m.sentAt,text,metadata:{source:'whatsapp-web',timeZone,timePrecision:'minute',bodyHash:hash(text),media:value.media,...(archiveMode&&incomplete?{incomplete:true,note:'此消息含未完整同步的附件、引用或编辑内容，请在 WhatsApp 核对。'}:{})}});
 }
 return messages;
}
export class WhatsAppBrowser{
 constructor({userDataPath,launch=options=>chromium.launchPersistentContext(path.join(userDataPath,'whatsapp-profile'),options),page=null,restriction=null}={}){this.mode='browser';this.userDataPath=userDataPath;this.launch=launch;this.page=page;this.context=null;this.restriction=restriction;this.busy=false;this.candidates=new Map();this.state={status:'disconnected',message:'WhatsApp 尚未连接'};}
 status(){return {...this.state};}
 async exclusive(fn){if(this.busy)throw chatError('WhatsApp 正在读取或核对，请稍候');this.busy=true;try{return await fn();}catch(e){this.state={status:'error',message:e.code?.startsWith('WHATSAPP')?e.message:'WhatsApp 窗口暂不可用，请重新打开并核对当前聊天'};throw chatError(this.state.message,e.code?.startsWith('WHATSAPP')?e.code:undefined);}finally{this.busy=false;}}
 async open({background=false}={}){return this.exclusive(async()=>{
  if(!this.page||this.page.isClosed()){
   if(!this.context){
    await mkdir(path.join(this.userDataPath,'whatsapp-profile'),{recursive:true,mode:0o700});
    try{this.context=await this.launch({channel:'chrome',headless:false,chromiumSandbox:true,viewport:null,acceptDownloads:false,locale:'zh-CN',args:['--window-size=1200,900','--no-first-run']});}
    catch(error){if(/SingletonLock|ProcessSingleton|profile.*(?:in use|already)|existing browser session|正在现有的浏览器会话中打开/i.test(String(error.message)))throw chatError('WhatsApp 专用窗口正被另一个 App 版本或会话占用。请先关闭旧版打开的 WhatsApp 窗口，再在当前版本点击“打开 WhatsApp 网页”；登录资料会保留','WHATSAPP_PROFILE_IN_USE');throw error;}
    const owned=this.context;owned.on('close',()=>{if(this.context!==owned)return;this.context=null;this.page=null;this.candidates.clear();this.state={status:'disconnected',message:'WhatsApp 窗口已关闭，登录资料已保留'};});
   }
   const pages=this.context.pages().filter(p=>!p.isClosed());
   this.page=pages.find(p=>/^https:\/\/web\.whatsapp\.com(?:\/|$)/.test(p.url()))||pages.find(p=>p.url()==='about:blank')||await this.context.newPage();
   if(!/^https:\/\/web\.whatsapp\.com(?:\/|$)/.test(this.page.url()))await this.page.goto('https://web.whatsapp.com/',{waitUntil:'domcontentloaded',timeout:30000});
  }
  if(this.restriction?.targetTitle){const target=this.page.locator('#pane-side').getByTitle(this.restriction.targetTitle,{exact:true});await target.waitFor({state:'visible',timeout:30000});await target.click();}
  if(!background)await this.page.bringToFront();this.state={status:'login_pending',message:'请在专用 WhatsApp 窗口登录并打开本单聊天，然后核对当前聊天'};return this.status();
 });}
 async currentIdentity(){
  const page=this.page;if(!page||page.isClosed()||new URL(page.url()).origin!=='https://web.whatsapp.com')throw chatError('请先打开专用 WhatsApp 窗口');
  const header=page.locator('#main header').first();await header.waitFor({state:'visible',timeout:8000});
  const title=(await header.innerText()).split('\n')[0];
  const contactPhone=async()=>{
   await page.locator('#main header [data-testid="conversation-info-header"]').click({timeout:8000});
   try{return phone(await page.locator('[data-testid="chat-info-drawer"] [data-testid="contact-info-subtitle selectable-text"]').innerText({timeout:8000}));}
   finally{await page.getByRole('button',{name:'关闭',exact:true}).click({timeout:3000}).catch(()=>{});}
  };
  const target=await contactPhone();
  const nativeRemote=async()=>{const ids=await page.locator('#main [data-id]').evaluateAll(rows=>[...new Set(rows.map(r=>r.getAttribute('data-id')?.match(/^(?:true|false)_([^_]+)_/)?.[1]).filter(Boolean))]);return ids.length===1?ids[0]:null;};
  const inspectedRemote=await nativeRemote();
  if(this.restriction&&target!==this.restriction.targetPhone)throw chatError('当前聊天不在本次已授权验证范围');
  await page.getByRole('button',{name:'自己',exact:true}).click({timeout:8000});
  await page.locator('[data-testid="li-profile"]').click({timeout:8000});
  await page.waitForFunction(()=>[...document.querySelectorAll('span,div')].some(e=>!e.closest('#main,#pane-side')&&e.childElementCount===0&&e.checkVisibility()&&/^(电话号码|你的电话号码)$/.test(e.textContent.trim())),{},{timeout:8000});
  let account;
  try{account=await page.evaluate(()=>{
   const all=[...document.querySelectorAll('span,div')].filter(e=>!e.closest('#main,#pane-side')&&e.children.length===0&&e.checkVisibility()&&/^\+\d[\d ()-]{5,24}\d$/.test(e.textContent.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,'').trim()));
   const candidates=[...new Set(all.map(e=>e.innerText.replace(/\D/g,'')))];return candidates.length===1?candidates[0]:null;
  });}finally{await page.getByRole('button',{name:'对话',exact:true}).click({timeout:8000});const exact=page.locator('#pane-side').getByTitle(title,{exact:true});if(await exact.count()!==1)throw chatError('无法唯一恢复指定聊天，请手动打开后重试');await exact.click({timeout:8000});}
  account=phone(account);if(this.restriction&&account!==this.restriction.accountPhone)throw chatError('当前账号不在本次已授权验证范围');
  if(await contactPhone()!==target)throw chatError('聊天已改变，请重新核对');
  if(await nativeRemote()!==inspectedRemote)throw chatError('核对期间原生聊天标识变化，请重新核对','WHATSAPP_TARGET_CHANGED');
  const timeZone=await page.evaluate(()=>Intl.DateTimeFormat().resolvedOptions().timeZone);
  return {...identity(account,target),accountPhone:account,targetPhone:target,timeZone,nativeRemote:inspectedRemote};
 }
 async connectedIdentity(){return this.exclusive(()=>this.currentIdentity());}
 async inspect(){return this.exclusive(async()=>{const selected=await this.currentIdentity(),token=randomUUID(),expiresAt=Date.now()+300000;for(const [key,value] of this.candidates)if(value.expires<Date.now())this.candidates.delete(key);while(this.candidates.size>=20)this.candidates.delete(this.candidates.keys().next().value);this.candidates.set(token,{...selected,expires:expiresAt});this.state={status:'target_pending',message:'当前账号和聊天号码已核对，等待确认关联'};return {token,expiresAt,...selected,identityType:'经核对的账号与联系人电话号码组合（不是平台聊天 JID）'};});}
 async resolve({accountId,chatId,candidateToken,binding}){return this.exclusive(async()=>{
  const candidate=candidateToken?this.candidates.get(candidateToken):binding;
  if(!candidate||candidateToken&&candidate.expires<Date.now())throw chatError('聊天核对结果已失效，请点击确认关联重新核对；原有订单关联未修改','WHATSAPP_CANDIDATE_EXPIRED');
  if(candidate.accountId!==accountId||candidate.chatId!==chatId)throw chatError('核对结果与选定聊天不符，请重新核对','WHATSAPP_TARGET_CHANGED');
  const current=await this.currentIdentity();if(current.accountId!==accountId||current.chatId!==chatId)throw chatError('当前账号或聊天与订单关联不一致，已停止','WHATSAPP_TARGET_CHANGED');
  this.state={status:'target_verified',message:'当前账号与本单聊天匹配'};return {accountId,chatId,binding:{...current,confirmedAt:new Date().toISOString()}};
 });}
 async read({accountId,chatId,from,to,binding}){return this.exclusive(async()=>{
  const current=await this.currentIdentity();if(!binding||current.accountId!==accountId||current.chatId!==chatId||binding.accountId!==accountId||binding.chatId!==chatId)throw chatError('当前聊天与本单关联不符，请重新打开指定聊天');
  const messages=await readVisibleMessages(this.page,{accountId,chatId,from,to,timeZone:current.timeZone,onlyIds:this.restriction?.useTimeFilter?null:this.restriction?.messageIds,maxMessages:this.restriction?20:500});
  // Recheck phone identity after asynchronous DOM access, not only the caption.
  const after=await this.currentIdentity();if(after.accountId!==accountId||after.chatId!==chatId)throw chatError('读取期间切换了账号或聊天，本批结果已丢弃');
  this.state={status:'read_verified',message:messages.length?`已核对并读取 ${messages.length} 条文字消息`:'所选范围内没有可读取文字消息'};return messages;
 });}
 async resume(){if(!this.page||this.page.isClosed())await this.open({background:true});}
 async readUpdates({accountId,chatId,binding,from,to,knownIds=[],cancelled=()=>false,onBatch}){return this.exclusive(async()=>{
  if(this.restriction)throw chatError('受限验证连接不允许持续读取');
  const verify=async()=>{const c=await this.currentIdentity();if(!binding||binding.accountId!==accountId||binding.chatId!==chatId||c.accountId!==accountId||c.chatId!==chatId)throw chatError('在线同步目标改变，本批未保存','WHATSAPP_TARGET_CHANGED');return c;};
  const current=await verify(),panel=this.page.locator('#main [data-testid="conversation-panel-body"]');if(await panel.count()!==1)throw chatError('无法定位聊天滚动区域');
  await panel.evaluate(e=>{e.scrollTop=e.scrollHeight;});await this.page.waitForTimeout(400);
  const known=new Set(knownIds),deadline=Date.now()+45000;let last='',stable=0,cursorIds=[];
  for(let n=0;n<30&&Date.now()<deadline;n++){
   if(cancelled())return {gap:true,cancelled:true,cursorIds:knownIds};await verify();
   const messages=await readVisibleMessages(this.page,{accountId,chatId,from,to,timeZone:current.timeZone,maxMessages:500,requireCoverage:false});await verify();
   if(cancelled())return {gap:true,cancelled:true,cursorIds:knownIds};
   if(n===0)cursorIds=messages.map(m=>m.id).slice(-500);
   await onBatch(messages,{complete:false});
   // Inspect only a boundary boolean outside the authorized range, never its
   // identifiers or body. A stable page without an anchor is an unverified gap.
   const covered=await this.page.locator('#main [data-id]').evaluateAll((rows,start)=>rows.some(row=>{const p=row.querySelector('[data-pre-plain-text]')?.getAttribute('data-pre-plain-text'),m=p?.match(/^\[(\d{1,2}):(\d{2}), (\d{4})年(\d{1,2})月(\d{1,2})日\]/);return m&&m[3]+m[4].padStart(2,'0')+m[5].padStart(2,'0')+m[1].padStart(2,'0')+m[2]<=start;}),(()=>{const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:current.timeZone,hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).formatToParts(new Date(from)).map(p=>[p.type,p.value]));return p.year+p.month+p.day+p.hour+p.minute;})());
   if(messages.some(m=>known.has(m.id))||covered)return {gap:false,cursorIds:cursorIds.length?cursorIds:knownIds};
   const key=messages.map(m=>m.id).join('|');stable=key===last?stable+1:0;last=key;if(stable>=2)break;
   await panel.evaluate(e=>{e.scrollTop=0;});await this.page.waitForTimeout(400);
  }
  return {gap:true,cursorIds:knownIds};
 });}
 // Pin the already verified chat without opening drawers or reselecting it.
 // A caption alone is insufficient: native IDs must retain the remote namespace.
 async historyReadGuard({expectedRemote=null}={}){
  const page=this.page,main=await page.locator('#main').elementHandle(),url=page.url(),token=randomUUID();
  if(!main)throw chatError('当前聊天不可用');
  const stamp=await main.evaluate(e=>({title:(e.querySelector('header')?.innerText||'').split('\n')[0],remotes:[...new Set([...e.querySelectorAll('[data-id]')].map(r=>r.getAttribute('data-id').match(/^(?:true|false)_([^_]+)_/)?.[1]).filter(Boolean))]}));
  if(!stamp.title||stamp.remotes.length!==1){await main.dispose();throw chatError('无法可靠锁定当前聊天的原生标识，未读取历史；请核对后重试','WHATSAPP_TARGET_UNVERIFIED');}
  if(expectedRemote&&stamp.remotes[0]!==expectedRemote){await main.dispose();throw chatError('核对后聊天已切换，未读取历史','WHATSAPP_TARGET_CHANGED');}
  await main.evaluate((e,{stamp,token})=>{
   const state={changed:false};const check=()=>{const title=(e.querySelector('header')?.innerText||'').split('\n')[0],ids=[...e.querySelectorAll('[data-id]')].map(r=>r.getAttribute('data-id').match(/^(?:true|false)_([^_]+)_/)?.[1]).filter(Boolean);if(title!==stamp.title||ids.some(id=>id!==stamp.remotes[0]))state.changed=true;};
   state.observer=new MutationObserver(check);state.observer.observe(e,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['data-id']});e[token]=state;
  },{stamp,token});
  return {verify:async()=>{
   const same=page.url()===url&&await main.evaluate((e,s)=>e.isConnected&&!e[s.token]?.changed&&e===document.querySelector('#main')&&(e.querySelector('header')?.innerText||'').split('\n')[0]===s.title&&(()=>{const ids=[...e.querySelectorAll('[data-id]')].map(r=>r.getAttribute('data-id').match(/^(?:true|false)_([^_]+)_/)?.[1]).filter(Boolean);return ids.length>0&&ids.every(id=>id===s.remotes[0]);})(),{...stamp,token}).catch(()=>false);
   if(!same)throw chatError('同步期间聊天已切换或页面已重载，本批未保存','WHATSAPP_TARGET_CHANGED');
  },dispose:async()=>{await main.evaluate((e,k)=>{e[k]?.observer.disconnect();delete e[k];},token).catch(()=>{});await main.dispose();}};
 }
 async readHistory({accountId,chatId,binding,direction='latest',initial=false,progress={},cancelled=()=>false,onBatch}){return this.exclusive(async()=>{
  if(this.restriction)throw chatError('本次真实验证只授权本单指定消息，不能扩展读取历史');
  if(!['latest','older'].includes(direction))throw chatError('同步方向无效');
  const current=await this.currentIdentity();if(!binding||binding.accountId!==accountId||binding.chatId!==chatId||current.accountId!==accountId||current.chatId!==chatId)throw chatError('当前聊天与关联不符，停止历史读取');
  const panel=this.page.locator('#main [data-testid="conversation-panel-body"]');if(await panel.count()!==1)throw chatError('无法定位聊天滚动区域');
  if(Object.hasOwn(current,'nativeRemote')&&!current.nativeRemote)throw chatError('当前聊天的消息标识尚未加载，未读取历史；请等待网页加载后人工刷新','WHATSAPP_TARGET_UNVERIFIED');
  const guard=await this.historyReadGuard({expectedRemote:current.nativeRemote});try{
  // One human operation walks the whole available list. Never jump to an old
  // anchor: virtualization can unload it, and jumping may leave a history gap.
  const deadline=Date.now()+30*60*1000,maxBatches=10000,loadWait=5000;
  let earliest=progress.earliest||null,latest=progress.latest||null,earliestId=progress.earliestId||null,stalls=0,previous='',batches=0;
  const incompleteIds=new Set(progress.incompleteIds||[]);
  const report=async(messages,status,note)=>onBatch(messages,{complete:false,status,earliest,latest,earliestId,incompleteIds:[...incompleteIds],batchesRead:batches,coverage:'web-available-unverified',note});
  // Identity inspection can reset the scroll position. Both entry points
  // deliberately rewalk from newest, deduplicating persisted native IDs.
  await panel.evaluate(e=>{e.scrollTop=e.scrollHeight;});
  await this.page.waitForTimeout(300);
  const fingerprint=()=>this.page.locator('#main [data-id]').evaluateAll(rows=>rows.map(r=>r.getAttribute('data-id')).join('|'));
  const verifyLoaded=async()=>{
   // A loading virtual list is not a verified target. Wait for native rows,
   // then run the unchanged strict guard before inspecting any message body.
   const until=Math.min(deadline,Date.now()+15000);
   while(!await this.page.locator('#main [data-id]').count()){
    if(cancelled())return false;
    if(Date.now()>=until)throw chatError('网页消息列表加载超时；已保存记录保留，请检查连接后人工继续','WHATSAPP_HISTORY_LOADING');
    await this.page.waitForTimeout(100);
   }
   await guard.verify();return true;
  };
  const waitChange=async(old)=>{
   const until=Math.min(deadline,Date.now()+loadWait);
   while(Date.now()<until){
    if(cancelled())return false;
    if(!await verifyLoaded())return false;
    try{await this.page.waitForFunction(old=>[...document.querySelectorAll('#main [data-id]')].map(r=>r.getAttribute('data-id')).join('|')!==old,old,{timeout:Math.min(250,Math.max(1,until-Date.now()))});return true;}
    catch(error){if(error.name!=='TimeoutError')throw error;}
   }
   return false;
  };
  for(;batches<maxBatches&&Date.now()<deadline;batches++){
   if(cancelled()){await report([],'cancelled','已停止同步；成功批次保留，历史覆盖未确认。');return;}
   if(!await verifyLoaded()){await report([],'cancelled','已停止同步；成功批次保留，历史覆盖未确认。');return;}
   let messages;
   for(let attempt=0;attempt<3;attempt++){
    try{messages=await readVisibleMessages(this.page,{accountId,chatId,from:'1970-01-01T00:00:00.000Z',to:new Date().toISOString(),timeZone:current.timeZone,maxMessages:500,requireCoverage:false,archiveMode:true});break;}
    catch(error){if(error.code!=='WHATSAPP_LIST_CHANGED'||attempt===2)throw error;await guard.verify();await this.page.waitForTimeout(300);if(cancelled())break;}
   }
   if(cancelled()){await report([],'cancelled','已停止同步；成功批次保留，历史覆盖未确认。');return;}
   await guard.verify();
   if(cancelled()){await report([],'cancelled','已停止同步；成功批次保留，历史覆盖未确认。');return;}
   const sorted=[...messages].sort((a,b)=>a.sentAt.localeCompare(b.sentAt)||a.id.localeCompare(b.id));
   if(sorted[0]&&(!earliest||sorted[0].sentAt<earliest)){earliest=sorted[0].sentAt;earliestId=sorted[0].id;}
   if(sorted.at(-1)&&(!latest||sorted.at(-1).sentAt>latest))latest=sorted.at(-1).sentAt;
   const key=sorted.map(m=>m.id).join('|');
   for(const m of messages)if(m.metadata?.incomplete)incompleteIds.add(m.id);
   await report(messages,'running','正在一次补取可获取历史；逐批保存，不需反复点击。'+(stalls?' 正在等待更早记录加载。':''));
   await guard.verify();
   // A repeated virtual list is only a temporary stall, never proof that the
   // first-ever account message has been reached. Retry the load trigger.
   if(key!==previous)stalls=0;previous=key;
   const loaded=await fingerprint();
   await panel.evaluate(e=>{e.scrollTop=Math.min(e.scrollHeight-e.clientHeight,Math.max(1,e.clientHeight/2));});
   await panel.evaluate(e=>{e.scrollTop=0;});
   const changed=await waitChange(loaded);
   if(changed){stalls=0;continue;}
   if(cancelled()){await report([],'cancelled','已停止同步；成功批次保留，历史覆盖未确认。');return;}
   if(++stalls>=3){
    await report([],'page-top-unverified','已读取本轮网页可获取记录；多次等待后页面未提供更早记录，历史覆盖尚未确认。'+(incompleteIds.size?' 有非文字或编辑内容需在 WhatsApp 核对。':'')+' 不会自动重开或刷新 WhatsApp。');
    this.state={status:'read_verified',message:'本轮网页可获取历史已保存；账号全部历史覆盖未确认'};return;
   }
  }
  await report([],'paused','本轮达到30分钟或10000批保护上限；成功批次保留，历史未完整，可人工继续。');
  this.state={status:'read_verified',message:'本轮历史已保存，达到保护上限，覆盖未确认'};
  }finally{await guard.dispose();}
 });}
 async close(){await this.context?.close();}
}
