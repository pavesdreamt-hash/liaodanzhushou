import {createHash} from 'node:crypto';
import {mkdir,readFile,rename,unlink,writeFile} from 'node:fs/promises';
import path from 'node:path';

export const SHOPPLUS_OPEN_API_URL='https://api-portal.shoplus.net/open-api';
// Product listing is a read-only, potentially much larger request than the
// order refreshes.  Keep its longer deadline and retry policy isolated from
// every write-capable endpoint.
export const SHOPPLUS_PRODUCT_LIST_TIMEOUT_MS=120_000;
export const SHOPPLUS_PRODUCT_LIST_READ_RETRIES=1;

export const shopPlusApiError=(message,code='SHOPPLUS_API')=>Object.assign(new Error(message),{code,stage:'ShopPlus 订单同步'});

const initial=()=>({version:1,appKey:null,secret:null,test:null,productTest:null});
const validCredential=value=>typeof value==='string'&&value.length>=8&&value.length<=512&&!/\s/u.test(value)&&/^[\x21-\x7e]+$/u.test(value);
const identifier=(value,label)=>{
  const source=String(value??'').trim();
  if(!/^\d{1,15}$/u.test(source)||!Number.isSafeInteger(Number(source))||Number(source)<=0)throw shopPlusApiError(`${label}无效`,'SHOPPLUS_PRODUCT_IDENTIFIER_INVALID');
  return Number(source);
};
const inventoryQuantity=value=>{
  const parsed=typeof value==='number'?value:Number(String(value??'').trim());
  if(!Number.isSafeInteger(parsed)||parsed<0||parsed>10_000_000)throw shopPlusApiError('库存数量必须是 0 至 10000000 的整数','SHOPPLUS_INVENTORY_QUANTITY_INVALID');
  return parsed;
};
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
      for(const test of [parsed.test,parsed.productTest])if(test&&(!['verified','failed'].includes(test.status)||typeof test.at!=='string'||typeof test.message!=='string'))throw new Error('invalid test state');
      // productTest was introduced after the original encrypted settings document.
      // Keep old credentials readable and only add the independent capability marker.
      this.state={...initial(),...parsed,productTest:parsed.productTest||null};
    }catch(error){if(error?.code?.startsWith('SHOPPLUS_'))throw error;throw shopPlusApiError('ShopPlus 配置无法解密或格式损坏；原有文件已保留','SHOPPLUS_SETTINGS_UNREADABLE');}
  }
  async persist(next){
    if(!await this.crypto.isEncryptionAvailable())throw shopPlusApiError('系统安全存储暂不可用，未保存 ShopPlus 密钥','SHOPPLUS_SECURE_STORAGE_UNAVAILABLE');
    const temporary=`${this.file}.${Date.now()}.pending`;
    try{await mkdir(path.dirname(this.file),{recursive:true,mode:0o700});await writeFile(temporary,await this.crypto.encryptString(JSON.stringify(next)),{flag:'wx',mode:0o600});await rename(temporary,this.file);this.state=next;}
    catch(error){await unlink(temporary).catch(()=>{});if(error?.code?.startsWith('SHOPPLUS_'))throw error;throw shopPlusApiError('ShopPlus 配置保存失败，原有密钥已保留','SHOPPLUS_SETTINGS_SAVE');}
  }
  publicState(){const state=this.state||initial();return {configured:Boolean(state.appKey&&state.secret),test:state.test?{status:state.test.status,at:state.test.at,message:state.test.message}:null,productTest:state.productTest?{status:state.productTest.status,at:state.productTest.at,message:state.productTest.message}:null};}
  async status(){return this.serial(async()=>{await this.load();return this.publicState();});}
  async configure(){
    if(this.busy)throw shopPlusApiError('已有 ShopPlus 安全输入窗口，请先完成或关闭它','SHOPPLUS_PROMPT_BUSY');
    this.busy=true;
    try{
      const appKey=await this.promptCredential('ShopPlus App Key');if(appKey===null)return {canceled:true,state:await this.status()};
      if(!validCredential(appKey))throw shopPlusApiError('App Key 格式无效；原有配置未修改','SHOPPLUS_APP_KEY_INVALID');
      const secret=await this.promptCredential('ShopPlus API Secret');if(secret===null)return {canceled:true,state:await this.status()};
      if(!validCredential(secret))throw shopPlusApiError('API Secret 格式无效；原有配置未修改','SHOPPLUS_SECRET_INVALID');
      return this.serial(async()=>{await this.load();await this.persist({...this.state,appKey,secret,test:null,productTest:null});return {canceled:false,state:this.publicState()};});
    }finally{this.busy=false;}
  }
  async request(name,data,{timeoutMs=30_000,retries=0}={}){
    const state=await this.serial(async()=>{await this.load();if(!this.state.appKey||!this.state.secret)throw shopPlusApiError('请先配置 ShopPlus App Key 和 API Secret','SHOPPLUS_NOT_CONFIGURED');return {appKey:this.state.appKey,secret:this.state.secret};});
    if(typeof this.fetchImpl!=='function')throw shopPlusApiError('当前环境无法访问 ShopPlus 接口','SHOPPLUS_FETCH_UNAVAILABLE');
    const body=buildShopPlusRequest({appKey:state.appKey,secret:state.secret,name,data,timestamp:time(this.now())});
    if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1_000||timeoutMs>300_000||!Number.isSafeInteger(retries)||retries<0||retries>2)throw shopPlusApiError('ShopPlus 请求策略无效','SHOPPLUS_REQUEST_POLICY_INVALID');
    let response,payload,lastError;
    for(let attempt=0;attempt<=retries;attempt++){
      try{
        response=await this.fetchImpl(SHOPPLUS_OPEN_API_URL,{method:'POST',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(timeoutMs)});
        payload=await response.json();
        lastError=null;
        break;
      }catch(error){lastError=error;}
    }
    if(lastError)throw shopPlusApiError(`ShopPlus 接口暂时无法连接：${String(lastError?.message||lastError).slice(0,180)}`,'SHOPPLUS_NETWORK_FAILED');
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
  async markProductVerified(message='已通过 ShopPlus 商品读取验证'){
    return this.serial(async()=>{await this.load();await this.persist({...this.state,productTest:{status:'verified',at:this.now().toISOString(),message:String(message).slice(0,240)}});return this.publicState();});
  }
  async markProductFailed(message){
    return this.serial(async()=>{await this.load();await this.persist({...this.state,productTest:{status:'failed',at:this.now().toISOString(),message:String(message||'ShopPlus 商品读取失败').slice(0,240)}});return this.publicState();});
  }
  async listProductsPage({pageNum=1,pageSize=2,fields=[1,2,3]}={}){
    if(!Number.isSafeInteger(pageNum)||pageNum<1||pageNum>100000||!Number.isSafeInteger(pageSize)||pageSize<1||pageSize>200)throw shopPlusApiError('商品读取分页参数无效');
    if(!Array.isArray(fields)||!fields.length||fields.length>3||fields.some(value=>![1,2,3].includes(value)))throw shopPlusApiError('商品读取字段参数无效');
    const data=await this.request('products',{pageNum,pageSize,fields:[...new Set(fields)].sort((a,b)=>a-b)},{timeoutMs:SHOPPLUS_PRODUCT_LIST_TIMEOUT_MS,retries:SHOPPLUS_PRODUCT_LIST_READ_RETRIES});
    return {products:Array.isArray(data?.productVOs)?data.productVOs:[],totalCount:Number.isFinite(Number(data?.totalCount))?Number(data.totalCount):null,pageNum,pageSize};
  }
  async productDetail(productId){return await this.request('products.detail',{id:identifier(productId,'ShopPlus 商品 ID')});}
  async updateProductPublishStatus({productId,publishStatus}={}){
    const id=identifier(productId,'ShopPlus 商品 ID'),status=Number(publishStatus);
    if(![0,1].includes(status))throw shopPlusApiError('上架状态只能是 0（下架）或 1（上架）','SHOPPLUS_PUBLISH_STATUS_INVALID');
    const result=await this.request('products.updateSpuSelective',{id,publishStatus:status});
    if(result?.result!==true)throw shopPlusApiError('ShopPlus 未确认商品上架状态更新','SHOPPLUS_PUBLISH_UPDATE_UNCONFIRMED');
    return await this.productDetail(id);
  }
  async updateVariantInventory({productId,variantId,stockQuantity}={}){
    const id=identifier(productId,'ShopPlus 商品 ID'),variant=identifier(variantId,'ShopPlus 变体 ID'),quantity=inventoryQuantity(stockQuantity);
    await this.request('products.skus.addOrUpdate',{productId:id,updateProductVariants:[{id:variant,availableStockQuantity:quantity}]});
    return await this.productDetail(id);
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
