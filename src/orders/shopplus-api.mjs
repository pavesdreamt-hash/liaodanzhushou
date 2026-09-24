import {createHash} from 'node:crypto';
import {mkdir,readFile,rename,unlink,writeFile} from 'node:fs/promises';
import path from 'node:path';

export const SHOPPLUS_OPEN_API_URL='https://api-portal.shoplus.net/open-api';

export const shopPlusApiError=(message,code='SHOPPLUS_API')=>Object.assign(new Error(message),{code,stage:'ShopPlus 订单同步'});

const initial=()=>({version:1,appKey:null,secret:null,test:null});
const validCredential=value=>typeof value==='string'&&value.length>=8&&value.length<=512&&!/\s/u.test(value)&&/^[\x21-\x7e]+$/u.test(value);
const time=value=>{
  const date=value instanceof Date?value:new Date(value);
  if(Number.isNaN(date.getTime()))throw shopPlusApiError('同步时间无效');
  const pad=part=>String(part).padStart(2,'0');
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

export function signShopPlusParameters(parameters,secret){
  if(!validCredential(secret))throw shopPlusApiError('ShopPlus API Secret 格式无效','SHOPPLUS_SECRET_INVALID');
  const body=Object.keys(parameters).sort().map(key=>`${key}${parameters[key]}`).join('');
  return createHash('md5').update(`${secret}${body}${secret}`).digest('hex').toUpperCase();
}

export function buildShopPlusRequest({appKey,secret,name,version='1.0',data,timestamp}){
  if(!validCredential(appKey))throw shopPlusApiError('ShopPlus App Key 格式无效','SHOPPLUS_APP_KEY_INVALID');
  const payload={name,version,app_key:appKey,data:encodeURIComponent(JSON.stringify(data)),timestamp:timestamp||time(new Date())};
  return {...payload,sign:signShopPlusParameters(payload,secret)};
}

export class ShopPlusConnection {
  constructor({userDataPath,safeStorage,promptCredential,fetchImpl=globalThis.fetch,now=()=>new Date()}={}){
    if(!userDataPath||!safeStorage||typeof promptCredential!=='function')throw new TypeError('ShopPlus 连接初始化不完整');
    this.file=path.join(userDataPath,'config','shopplus-api.enc');this.crypto=safeStorage;this.promptCredential=promptCredential;this.fetchImpl=fetchImpl;this.now=now;this.state=null;this.busy=false;this.queue=Promise.resolve();
  }
  serial(operation){const result=this.queue.then(operation);this.queue=result.catch(()=>{});return result;}
  async load(){
    if(this.state)return;
    let encrypted;try{encrypted=await readFile(this.file);}catch(error){if(error?.code==='ENOENT'){this.state=initial();return;}throw shopPlusApiError('无法读取本机 ShopPlus 配置','SHOPPLUS_SETTINGS_READ');}
    try{
      if(!await this.crypto.isEncryptionAvailable())throw shopPlusApiError('系统安全存储暂不可用，ShopPlus 密钥未读取','SHOPPLUS_SECURE_STORAGE_UNAVAILABLE');
      const parsed=JSON.parse(await this.crypto.decryptString(encrypted));
      if(parsed?.version!==1||!(parsed.appKey===null||validCredential(parsed.appKey))||!(parsed.secret===null||validCredential(parsed.secret)))throw new Error('invalid configuration');
      if(parsed.test&&(!['verified','failed'].includes(parsed.test.status)||typeof parsed.test.at!=='string'||typeof parsed.test.message!=='string'))throw new Error('invalid test state');
      this.state=parsed;
    }catch(error){if(error?.code?.startsWith('SHOPPLUS_'))throw error;throw shopPlusApiError('ShopPlus 配置无法解密或格式损坏；原有文件已保留','SHOPPLUS_SETTINGS_UNREADABLE');}
  }
  async persist(next){
    if(!await this.crypto.isEncryptionAvailable())throw shopPlusApiError('系统安全存储暂不可用，未保存 ShopPlus 密钥','SHOPPLUS_SECURE_STORAGE_UNAVAILABLE');
    const temporary=`${this.file}.${Date.now()}.pending`;
    try{await mkdir(path.dirname(this.file),{recursive:true,mode:0o700});await writeFile(temporary,await this.crypto.encryptString(JSON.stringify(next)),{flag:'wx',mode:0o600});await rename(temporary,this.file);this.state=next;}
    catch(error){await unlink(temporary).catch(()=>{});if(error?.code?.startsWith('SHOPPLUS_'))throw error;throw shopPlusApiError('ShopPlus 配置保存失败，原有密钥已保留','SHOPPLUS_SETTINGS_SAVE');}
  }
  publicState(){const state=this.state||initial();return {configured:Boolean(state.appKey&&state.secret),test:state.test?{status:state.test.status,at:state.test.at,message:state.test.message}:null};}
  async status(){return this.serial(async()=>{await this.load();return this.publicState();});}
  async configure(){
    if(this.busy)throw shopPlusApiError('已有 ShopPlus 安全输入窗口，请先完成或关闭它','SHOPPLUS_PROMPT_BUSY');
    this.busy=true;
    try{
      const appKey=await this.promptCredential('ShopPlus App Key');if(appKey===null)return {canceled:true,state:await this.status()};
      if(!validCredential(appKey))throw shopPlusApiError('App Key 格式无效；原有配置未修改','SHOPPLUS_APP_KEY_INVALID');
      const secret=await this.promptCredential('ShopPlus API Secret');if(secret===null)return {canceled:true,state:await this.status()};
      if(!validCredential(secret))throw shopPlusApiError('API Secret 格式无效；原有配置未修改','SHOPPLUS_SECRET_INVALID');
      return this.serial(async()=>{await this.load();await this.persist({...this.state,appKey,secret,test:null});return {canceled:false,state:this.publicState()};});
    }finally{this.busy=false;}
  }
  async request(name,data){
    const state=await this.serial(async()=>{await this.load();if(!this.state.appKey||!this.state.secret)throw shopPlusApiError('请先配置 ShopPlus App Key 和 API Secret','SHOPPLUS_NOT_CONFIGURED');return {appKey:this.state.appKey,secret:this.state.secret};});
    if(typeof this.fetchImpl!=='function')throw shopPlusApiError('当前环境无法访问 ShopPlus 接口','SHOPPLUS_FETCH_UNAVAILABLE');
    const body=buildShopPlusRequest({appKey:state.appKey,secret:state.secret,name,data,timestamp:time(this.now())});
    let response,payload;
    try{response=await this.fetchImpl(SHOPPLUS_OPEN_API_URL,{method:'POST',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});payload=await response.json();}
    catch(error){throw shopPlusApiError(`ShopPlus 接口暂时无法连接：${String(error?.message||error).slice(0,180)}`,'SHOPPLUS_NETWORK_FAILED');}
    if(!response.ok)throw shopPlusApiError(`ShopPlus 接口返回 HTTP ${response.status}`,'SHOPPLUS_HTTP_FAILED');
    if(String(payload?.code)!=='0')throw shopPlusApiError(String(payload?.msg||'ShopPlus 未接受本次请求').slice(0,240),'SHOPPLUS_REQUEST_FAILED');
    return payload.data||{};
  }
  async verify(){
    try{
      await this.request('Order.list',{limit:1,page:1,orderStatus:-2});
      return this.serial(async()=>{await this.load();await this.persist({...this.state,test:{status:'verified',at:this.now().toISOString(),message:'已通过 ShopPlus 订单读取验证'}});return this.publicState();});
    }catch(error){
      await this.serial(async()=>{await this.load();await this.persist({...this.state,test:{status:'failed',at:this.now().toISOString(),message:String(error.message||'验证失败').slice(0,240)}});});
      throw error;
    }
  }
  async markVerified(message='已通过 ShopPlus 订单读取验证'){
    return this.serial(async()=>{await this.load();await this.persist({...this.state,test:{status:'verified',at:this.now().toISOString(),message}});return this.publicState();});
  }
  async markFailed(message){
    return this.serial(async()=>{await this.load();await this.persist({...this.state,test:{status:'failed',at:this.now().toISOString(),message:String(message||'ShopPlus 同步失败').slice(0,240)}});return this.publicState();});
  }
  async listLatestOrders({updatedAtMin=null,maxPages=20,limit=50}={}){
    if(!Number.isSafeInteger(maxPages)||maxPages<1||maxPages>20||!Number.isSafeInteger(limit)||limit<1||limit>100)throw shopPlusApiError('同步页数参数无效');
    const orders=[];let page=1,totalCount=null,truncated=false;
    while(page<=maxPages){
      const data=await this.request('Order.list',{limit,page,orderStatus:-2,...(updatedAtMin?{updatedAtMin:time(updatedAtMin)}:{})});
      const current=Array.isArray(data?.orders)?data.orders:[];orders.push(...current);totalCount=Number.isFinite(Number(data?.totalCount))?Number(data.totalCount):totalCount;
      if(!current.length||current.length<limit)break;
      page++;
      if(page>maxPages){truncated=true;break;}
    }
    return {orders,totalCount,pages:Math.min(page,maxPages),truncated};
  }
}
