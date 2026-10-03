import {createHash,randomUUID} from 'node:crypto';

const DEFAULT_LOCAL_API='http://local.adspower.net:50325';
const MAX_PROFILES=20,MAX_PAGES_PER_PROFILE=3,MAX_FRAGMENTS_PER_PROFILE=20,MAX_FRAGMENT_LENGTH=1200;
const timeoutError=()=>Object.assign(new Error('AdsPower 本机连接超时，请确认 AdsPower 已打开并在“自动化 → API”启用了 Local API。'),{code:'ADSPOWER_TIMEOUT'});
const invalid=message=>Object.assign(new Error(message),{code:'ADSPOWER_INVALID'});

const isLoopbackHost=host=>['127.0.0.1','localhost','::1','local.adspower.net'].includes(host.toLowerCase());
function localHttpUrl(value){
  let url;try{url=new URL(value);}catch{throw invalid('AdsPower 本机地址无效');}
  if(url.protocol!=='http:'||!isLoopbackHost(url.hostname))throw invalid('只允许连接本机 AdsPower Local API');
  return url;
}
function localWsUrl(value){
  let url;try{url=new URL(value);}catch{throw invalid('AdsPower 返回的浏览器地址无效');}
  if(url.protocol!=='ws:'||!isLoopbackHost(url.hostname))throw invalid('AdsPower 返回的浏览器地址不是本机连接');
  return url;
}
function validProfileId(value){return typeof value==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(value);}
function safeText(value,limit=MAX_FRAGMENT_LENGTH){return String(value??'').replace(/\s+/gu,' ').trim().slice(0,limit);}
function isFacebookInboxUrl(value){
  try{
    const url=new URL(value),host=url.hostname.toLowerCase(),facebook=host==='facebook.com'||host.endsWith('.facebook.com'),messenger=host==='messenger.com'||host.endsWith('.messenger.com'),businessSuite=host==='business.facebook.com';
    if(!facebook&&!messenger&&!businessSuite)return false;
    const path=url.pathname.toLowerCase();
    return messenger||path.includes('/messages')||path.includes('/marketplace/inbox')||path.includes('/marketplace/messages')||(businessSuite&&(path.includes('/inbox')||path.includes('/messages')));
  }catch{return false;}
}
function profileLabel(id,index){return `AdsPower 档案 ${index+1} · ${id.slice(-6)}`;}
function fragmentId(profileId,pageId,text,index){return createHash('sha256').update(JSON.stringify([profileId,pageId,index,text])).digest('hex').slice(0,40);}

// This expression deliberately has no navigation, input, scroll, click, storage, or network
// operation. It reads only visible, already-rendered text from the current page.
const VISIBLE_TEXT_EXPRESSION=`(() => {
  const visible = element => {
    const style = getComputedStyle(element), rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0 && rect.width > 0 && rect.height > 0;
  };
  const ignored = new Set(['facebook','messenger','marketplace','search facebook','search messenger','home','menu','notifications','groups','settings','privacy','help']);
  const root = document.querySelector('[role="main"]') || document.body;
  const candidates = [...root.querySelectorAll('[dir="auto"],[role="article"] [dir="auto"],[role="row"] [dir="auto"]')]
    .filter(visible)
    .map(element => (element.innerText || element.textContent || '').replace(/\\s+/g, ' ').trim())
    .filter(value => value && value.length <= 1200 && !ignored.has(value.toLowerCase()));
  const fallback = candidates.length ? candidates : (root.innerText || '').split(/\\n+/).map(value => value.replace(/\\s+/g, ' ').trim()).filter(value => value && value.length <= 1200 && !ignored.has(value.toLowerCase()));
  const unique = [];
  for (const value of fallback) if (!unique.includes(value)) unique.push(value);
  return {title: document.title || '', fragments: unique.slice(-20)};
})()`;

async function readJson(fetchImpl,url,{timeoutMs=3500}={}){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetchImpl(url,{method:'GET',headers:{accept:'application/json'},signal:controller.signal});
    if(!response.ok)throw new Error(`本机服务返回 ${response.status}`);
    return await response.json();
  }catch(error){
    if(error?.name==='AbortError')throw timeoutError();
    throw error;
  }finally{clearTimeout(timer);}
}

async function evaluateReadonlyPage(wsEndpoint,expression,{timeoutMs=3500,WebSocketImpl=globalThis.WebSocket}={}){
  if(typeof WebSocketImpl!=='function')throw new Error('当前运行环境不支持本机浏览器只读连接');
  const endpoint=localWsUrl(wsEndpoint).href;
  return await new Promise((resolve,reject)=>{
    let settled=false,opened=false;
    const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);try{socket.close();}catch{}error?reject(error):resolve(value);};
    const timer=setTimeout(()=>finish(timeoutError()),timeoutMs);
    let socket;try{socket=new WebSocketImpl(endpoint);}catch(error){finish(error);return;}
    socket.addEventListener('open',()=>{opened=true;try{socket.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression,returnByValue:true,awaitPromise:true,userGesture:false}}));}catch(error){finish(error);}});
    socket.addEventListener('message',event=>{try{const result=JSON.parse(String(event.data));if(result.id!==1)return;if(result.error)throw new Error('浏览器只读连接被拒绝');if(result.result?.exceptionDetails)throw new Error('当前 Facebook 页面文字暂时无法读取');finish(null,result.result?.result?.value||{title:'',fragments:[]});}catch(error){finish(error);}});
    socket.addEventListener('error',()=>finish(opened?new Error('浏览器只读连接中断'):new Error('无法连接已打开的 AdsPower 浏览器')));
    socket.addEventListener('close',()=>{if(!settled)finish(new Error('浏览器只读连接已关闭'));});
  });
}

export class AdsPowerInboxScanner {
  constructor({fetchImpl=globalThis.fetch,localApi=DEFAULT_LOCAL_API,readPage=evaluateReadonlyPage,clock=()=>new Date()}={}){
    if(typeof fetchImpl!=='function')throw new TypeError('缺少本机请求实现');
    this.fetchImpl=fetchImpl;this.localApi=localHttpUrl(localApi);this.readPage=readPage;this.clock=clock;
  }
  async activeProfiles(){
    const payload=await readJson(this.fetchImpl,new URL('/api/v1/browser/local-active',this.localApi),{});
    if(payload?.code!==0||!Array.isArray(payload?.data?.list))throw new Error(safeText(payload?.msg||'无法读取已打开的 AdsPower 档案',240));
    const seen=new Set(),profiles=[];
    for(const row of payload.data.list){
      const profileId=String(row?.user_id||'');if(!validProfileId(profileId)||seen.has(profileId))continue;
      const port=Number(row?.debug_port);
      if(!Number.isInteger(port)||port<1024||port>65535)continue;
      seen.add(profileId);profiles.push({profileId,port});if(profiles.length>=MAX_PROFILES)break;
    }
    return profiles;
  }
  async debugPages(port){
    const payload=await readJson(this.fetchImpl,new URL(`/json/list`, `http://127.0.0.1:${port}`),{});
    if(!Array.isArray(payload))throw new Error('已打开浏览器没有返回可读取页面');
    return payload.filter(page=>page?.type==='page'&&typeof page?.webSocketDebuggerUrl==='string'&&isFacebookInboxUrl(page?.url)).slice(0,MAX_PAGES_PER_PROFILE);
  }
  async scanProfile(profile,index){
    const entry={profileId:profile.profileId,label:profileLabel(profile.profileId,index),status:'skipped',detail:'当前档案没有打开 Facebook 收件箱页面。',pages:[]};
    let pages;
    try{pages=await this.debugPages(profile.port);}catch(error){entry.status='failed';entry.detail=`无法读取当前档案：${safeText(error?.message||'未知错误',180)}`;return entry;}
    if(!pages.length)return entry;
    entry.status='scanned';entry.detail='仅读取当前已加载页面，不会切换客户对话或发送消息。';
    for(const page of pages){
      try{
        const raw=await this.readPage(page.webSocketDebuggerUrl,VISIBLE_TEXT_EXPRESSION),fragments=Array.isArray(raw?.fragments)?raw.fragments.map(value=>safeText(value)).filter(Boolean):[];
        entry.pages.push({pageId:String(page.id||page.webSocketDebuggerUrl).slice(0,200),title:safeText(raw?.title||page.title||'Facebook 收件箱',160),fragments:fragments.map((text,index)=>({id:fragmentId(profile.profileId,String(page.id||page.webSocketDebuggerUrl),text,index),text}))});
      }catch(error){entry.pages.push({pageId:String(page.id||page.webSocketDebuggerUrl).slice(0,200),title:safeText(page.title||'Facebook 收件箱',160),error:`页面文字暂时无法读取：${safeText(error?.message||'未知错误',180)}`,fragments:[]});}
    }
    let remaining=MAX_FRAGMENTS_PER_PROFILE;
    for(const page of entry.pages){page.fragments=page.fragments.slice(0,Math.max(0,remaining));remaining-=page.fragments.length;}
    if(!entry.pages.some(page=>page.fragments.length))entry.detail='已找到 Facebook 收件箱页面，但当前没有可识别的已加载文字。请在该档案中手动打开客户对话后再扫描。';
    return entry;
  }
  async scan(){
    const profiles=await this.activeProfiles(),items=[];
    for(let index=0;index<profiles.length;index++)items.push(await this.scanProfile(profiles[index],index));
    return {scannedAt:this.clock().toISOString(),profiles:items,limits:{profiles:MAX_PROFILES,fragmentsPerProfile:MAX_FRAGMENTS_PER_PROFILE}};
  }
}

export class AdsPowerScanSessions {
  // Scan text is intentionally process-memory only. The separate FB workspace keeps it
  // until the user clears it or exits the app; explicit short TTLs remain available for tests.
  constructor({scanner,translate,clock=()=>Date.now(),ttlMs=Infinity}={}){
    if(!scanner||typeof scanner.scan!=='function'||typeof translate!=='function')throw new TypeError('扫描服务配置无效');
    this.scanner=scanner;this.translate=translate;this.clock=clock;this.ttlMs=ttlMs;this.sessions=new Map();
  }
  purge(){const now=this.clock();for(const [token,session] of this.sessions)if(Number.isFinite(session.expiresAt)&&session.expiresAt<=now)this.sessions.delete(token);}
  async scan(){
    this.purge();const result=await this.scanner.scan(),token=randomUUID(),byId=new Map();
    for(const profile of result.profiles)for(const page of profile.pages||[])for(const fragment of page.fragments||[])byId.set(fragment.id,{id:fragment.id,text:fragment.text});
    this.sessions.set(token,{expiresAt:this.clock()+this.ttlMs,byId});return {...result,token};
  }
  async translateRows({token,messageIds}={}){
    this.purge();if(typeof token!=='string'||!token)throw invalid('本次扫描已失效，请重新扫描');
    const session=this.sessions.get(token);if(!session)throw invalid('本次扫描已关闭或已失效，请重新扫描');
    if(!Array.isArray(messageIds)||!messageIds.length||messageIds.length>20||messageIds.some(value=>typeof value!=='string'))throw invalid('请选择本次扫描中的 1 至 20 条文字进行翻译');
    const unique=[...new Set(messageIds)],messages=unique.map(id=>session.byId.get(id));
    if(messages.some(value=>!value))throw invalid('翻译内容不属于本次扫描，已停止读取');
    return this.translate(messages);
  }
  clear(token){if(typeof token==='string')this.sessions.delete(token);return {cleared:true};}
}

export const ADSPOWER_SCAN_LIMITS=Object.freeze({profiles:MAX_PROFILES,pagesPerProfile:MAX_PAGES_PER_PROFILE,fragmentsPerProfile:MAX_FRAGMENTS_PER_PROFILE});
