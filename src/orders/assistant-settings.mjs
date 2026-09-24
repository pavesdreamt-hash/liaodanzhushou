import {readFile,mkdir,writeFile,rename,unlink} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {compatibleExtractor,compatibleAssistant} from './assistant-connectors.mjs';

export const AI_PROVIDERS=Object.freeze({
  deepseek:{label:'DeepSeek',baseUrl:'https://api.deepseek.com',defaultModel:'deepseek-flash'},
  openai:{label:'OpenAI / GPT',baseUrl:'https://api.openai.com/v1',defaultModel:''}
});
export const settingsError=(message,code='ASSISTANT_SETTINGS')=>Object.assign(new Error(message),{code,stage:'助手设置'});
const interruptPending=state=>{for(const p of Object.values(state.providers))if(p.test?.status==='testing')p.test={status:'interrupted',message:'设置已变化，旧请求结果已丢弃'};};
const initial=()=>({version:1,revision:0,activeProvider:'deepseek',callsUsed:0,usageMode:'verification',dailyDate:null,dailyCalls:0,providers:Object.fromEntries(Object.entries(AI_PROVIDERS).map(([id,p])=>[id,{model:p.defaultModel,key:null,test:null,configRevision:0}]))});
const sampleMessages=()=>[
  {id:'probe-customer-1',direction:'customer',sentAt:'2026-09-13T00:00:00.000Z',text:'Full name: Avery Example'},
  {id:'probe-merchant-2',direction:'merchant',sentAt:'2026-09-13T00:01:00.000Z',text:'KY02 price is AED 75 each.'},
  {id:'probe-customer-3',direction:'customer',sentAt:'2026-09-13T00:02:00.000Z',text:'How much is shipping? I have not decided to buy.'}
];
export function verifyConnectionSample(value){
  const name=value?.fields?.fullName;
  if(name?.value!=='Avery Example'||!Array.isArray(name.messageIds)||name.messageIds.length!==1||name.messageIds[0]!=='probe-customer-1'||(value.items!==undefined&&(!Array.isArray(value.items)||value.items.length)))
    throw settingsError('接口已响应，但虚构样本校验未通过；请核对模型或稍后重试','AI_SAMPLE_INVALID');
}

// Only this main-process service ever holds plaintext keys. The renderer receives
// a whitelist of public settings; all persistent state is encrypted atomically.
export class AssistantSettings{
  constructor({userDataPath,safeStorage,promptKey,fetchImpl=fetch,now=()=>new Date(),onChanged=()=>{},simulation=false,verificationOnly=false}){
    this.file=path.join(userDataPath,'config','assistant-settings.enc');this.crypto=safeStorage;this.promptKey=promptKey;this.fetchImpl=fetchImpl;this.now=now;this.onChanged=onChanged;
    this.verificationOnly=verificationOnly;this.simulation=simulation;this.state=null;this.saved=false;this.queue=Promise.resolve();this.requestBusy=false;this.promptBusy=false;this.encryptionAvailable=null;
  }
  async load(){
    if(this.state)return;
    let bytes;try{bytes=await readFile(this.file);}catch(e){if(e.code!=='ENOENT')throw settingsError('无法读取本机助手设置');this.state=initial();return;}
    await this.requireEncryption();
    try{
      const state=JSON.parse(await this.crypto.decryptString(bytes));
      if(state.version!==1||!AI_PROVIDERS[state.activeProvider]||!Number.isSafeInteger(state.revision)||state.revision<0||!Number.isSafeInteger(state.callsUsed)||state.callsUsed<0)throw new Error();
      for(const id of Object.keys(AI_PROVIDERS)){
        const p=state.providers?.[id];if(!p||typeof p.model!=='string'||(p.key!==null&&typeof p.key!=='string'))throw new Error();
        if(p.test?.status==='testing')p.test={status:'interrupted',message:'上次请求已中断，未自动重试'};
      }
      state.usageMode??='verification';state.dailyDate??=null;state.dailyCalls??=0;
      if(!['verification','daily'].includes(state.usageMode)||!Number.isSafeInteger(state.dailyCalls)||state.dailyCalls<0||state.dailyDate!==null&&!/^\d{4}-\d{2}-\d{2}$/.test(state.dailyDate))throw new Error();
      for(const p of Object.values(state.providers)){p.configRevision??=0;if(!Number.isSafeInteger(p.configRevision)||p.configRevision<0)throw new Error();}state.ledger??=[];if(!Array.isArray(state.ledger)||state.ledger.length>100)throw new Error();for(const entry of state.ledger){if(!entry||!['extraction','translation','reply','compose','translate-intent','translate-draft','image-ocr','connection-test'].includes(entry.purpose)||!['started','interrupted','failed','responded'].includes(entry.status)||typeof entry.at!=='string'||!Number.isFinite(Date.parse(entry.at)))throw new Error();if(entry.status==='started')entry.status='interrupted';}this.state=state;this.saved=true;this.onChanged();
    }catch(error){if(error?.code==='AI_SECURE_STORAGE_PENDING')throw settingsError(error.message,error.code);throw settingsError('助手设置无法解密或格式损坏；请保留文件并检查本机安全存储','AI_SETTINGS_UNREADABLE');}
  }
  async requireEncryption(){
    try{this.encryptionAvailable=Boolean(await this.crypto?.isEncryptionAvailable());}
    catch(error){this.encryptionAvailable=false;if(error?.code==='AI_SECURE_STORAGE_PENDING')throw settingsError(error.message,error.code);}
    if(!this.encryptionAvailable)throw settingsError('系统安全存储暂不可用，请完成系统授权后重试；未保存明文密钥','AI_SECURE_STORAGE_UNAVAILABLE');
  }
  async persist(next){
    await this.requireEncryption();const temporary=this.file+'.'+randomUUID()+'.pending';
    try{
      const encrypted=await this.crypto.encryptString(JSON.stringify(next));
      await mkdir(path.dirname(this.file),{recursive:true,mode:0o700});
      await writeFile(temporary,encrypted,{flag:'wx',mode:0o600});await rename(temporary,this.file);
    }catch(error){await unlink(temporary).catch(()=>{});if(error?.code==='AI_SECURE_STORAGE_PENDING')throw settingsError(error.message,error.code);throw settingsError('设置保存失败，原有配置和密钥已保留','AI_SETTINGS_SAVE_FAILED');}
    this.state=next;this.saved=true;
  }
  serial(operation){const result=this.queue.then(operation);this.queue=result.catch(()=>{});return result;}
  validate(payload){
    if(!payload||Object.keys(payload).some(k=>!['provider','revision','model'].includes(k))||!AI_PROVIDERS[payload.provider]||payload.revision!==this.state.revision)throw settingsError('设置已变化，请重新打开设置后操作','AI_SETTINGS_CHANGED');
  }
  today(){return this.now().toLocaleDateString('sv-SE');}
  publicState(){
    const s=this.state;
    return {revision:s.revision,activeProvider:s.activeProvider,secureStorageAvailable:this.encryptionAvailable,callsUsed:s.callsUsed,usageMode:s.usageMode,dailyCalls:s.dailyDate===this.today()?s.dailyCalls:0,ledger:(s.ledger||[]).map(({purpose,at,status,elapsedMs,simulation})=>({purpose,at,status,elapsedMs,simulation})),providers:Object.fromEntries(Object.entries(AI_PROVIDERS).map(([id,p])=>{
      const current=s.providers[id],test=current.test?.status==='testing'&&!this.requestBusy?{status:'interrupted',message:'上次请求未完成，未自动重试'}:current.test;
      return [id,{label:p.label,baseUrl:p.baseUrl,model:current.model,hasApiKey:Boolean(current.key),test:test?{status:test.status,message:test.message,at:test.at,elapsedMs:test.elapsedMs}:null}];
    }))};
  }
  async get(){return this.serial(async()=>{await this.load();return this.publicState();});}
  async recheck(){return this.serial(async()=>{await this.requireEncryption();await this.load();this.onChanged();return this.publicState();});}
  async save(payload){return this.serial(async()=>{
    await this.load();this.validate(payload);
    if(Object.keys(payload).some(k=>!['provider','revision','model'].includes(k))||typeof payload.model!=='string'||!/^[a-zA-Z0-9._:-]{0,120}$/.test(payload.model))throw settingsError('模型名称格式无效；密钥只能通过安全输入窗口保存');
    const next=structuredClone(this.state),p=next.providers[payload.provider];if(p.model!==payload.model){p.test=null;p.configRevision=(p.configRevision||0)+1;}
    interruptPending(next);p.model=payload.model;next.activeProvider=payload.provider;next.revision++;
    await this.persist(next);this.onChanged();return this.publicState();
  });}
  async changeKey(payload){
    await this.serial(async()=>{await this.load();this.validate(payload);await this.requireEncryption();if(this.promptBusy)throw settingsError('安全输入窗口已打开');this.promptBusy=true;});
    try{
      const key=await this.promptKey(AI_PROVIDERS[payload.provider].label);
      if(key===null)return {canceled:true,state:await this.get()};
      if(typeof key!=='string'||key.length<8||key.length>512||/\s|[^\x21-\x7e]/.test(key))throw settingsError('密钥格式无效；原有密钥未修改');
      return await this.serial(async()=>{this.validate(payload);const next=structuredClone(this.state);interruptPending(next);next.providers[payload.provider].key=key;next.providers[payload.provider].configRevision=(next.providers[payload.provider].configRevision||0)+1;next.providers[payload.provider].test=null;next.revision++;await this.persist(next);this.onChanged();return {canceled:false,state:this.publicState()};});
    }finally{this.promptBusy=false;}
  }
  async removeKey(payload){return this.serial(async()=>{await this.load();this.validate(payload);const next=structuredClone(this.state);interruptPending(next);next.providers[payload.provider].key=null;next.providers[payload.provider].configRevision=(next.providers[payload.provider].configRevision||0)+1;next.providers[payload.provider].test=null;next.revision++;await this.persist(next);this.onChanged();return this.publicState();});}
  async setUsageMode(payload){return this.serial(async()=>{
    await this.load();this.validate({provider:payload?.provider,revision:payload?.revision});
    if(Object.keys(payload).some(k=>!['provider','revision','usageMode'].includes(k))||!['verification','daily'].includes(payload.usageMode))throw settingsError('调用模式无效');
    const next=structuredClone(this.state);interruptPending(next);next.usageMode=payload.usageMode;next.revision++;await this.persist(next);this.onChanged();return this.publicState();
  });}
  async request({provider,revision,messages,probe=false,purpose='extraction',input=null}){
    let config,requestId,expectedRevision;
    await this.serial(async()=>{
      await this.load();this.validate({provider,revision});
      if(!['extraction','translation','reply','compose','translate-intent','translate-draft','image-ocr'].includes(purpose))throw settingsError('AI 用途无效');
      if(this.requestBusy)throw settingsError('已有 AI 请求正在进行，请稍候');
      const p=this.state.providers[provider];if(!p.model)throw settingsError('请先填写并保存模型名称');if(!p.key)throw settingsError('请先保存此服务商的 API 密钥');
      const verification=probe||this.verificationOnly||this.state.usageMode!=='daily',today=this.today();
      config={...p};requestId=randomUUID();const next=structuredClone(this.state);if(verification)next.callsUsed++;else{next.dailyCalls=next.dailyDate===today?next.dailyCalls+1:1;next.dailyDate=today;}next.revision++;
      if(probe)next.providers[provider].test={status:'testing',requestId,message:'正在使用虚构资料测试连接'};
      next.ledger=[...(next.ledger||[]),{id:requestId,purpose:probe?'connection-test':purpose,at:this.now().toISOString(),status:'started',simulation:this.simulation}].slice(-100);
      await this.persist(next);expectedRevision=next.revision;this.requestBusy=true;
    });
    const started=Date.now();let value,failure;
    try{
      const options={provider,url:AI_PROVIDERS[provider].baseUrl,model:config.model,token:config.key,fetchImpl:this.fetchImpl,timeoutMs:20000,maxCalls:1};
      value=purpose==='extraction'?await compatibleExtractor(options).extract({messages}):await compatibleAssistant(options).complete({purpose,input});
      if(probe)verifyConnectionSample(value);
    }catch(e){failure=e?.code==='AI_SAMPLE_INVALID'?e:settingsError(e?.code==='ASSISTANT_CONNECTION'?e.message:'接口响应无法验证，未写入订单','AI_CONNECTION_FAILED');}
    try{
      return await this.serial(async()=>{
        const current=this.state.providers[provider];
        if(this.state.revision!==expectedRevision||this.state.activeProvider!==provider||current.model!==config.model||current.key!==config.key||(probe&&current.test?.requestId!==requestId)){const discarded=structuredClone(this.state),entry=discarded.ledger?.find(e=>e.id===requestId);if(entry){entry.status='interrupted';entry.elapsedMs=Date.now()-started;await this.persist(discarded);}throw settingsError('请求期间配置已变化，已丢弃旧结果','AI_SETTINGS_CHANGED');}
        if(probe){const next=structuredClone(this.state);next.revision++;next.providers[provider].test={status:failure?'failed':'verified',message:failure?failure.message:(this.simulation?'模拟接口样本通过（未验证真实服务）':'真实接口及虚构资料样本校验通过'),at:this.now().toISOString(),elapsedMs:Date.now()-started};await this.persist(next);}
        const audited=structuredClone(this.state),entry=audited.ledger?.find(e=>e.id===requestId);if(entry){entry.status=failure?'failed':'responded';entry.elapsedMs=Date.now()-started;await this.persist(audited);}
        if(failure)throw failure;return probe?this.publicState():value;
      });
    }finally{this.requestBusy=false;}
  }
  async test(payload){await this.load();return this.request({...payload,messages:sampleMessages(),probe:true});}
  async extract({messages}){const state=await this.get();return this.request({provider:state.activeProvider,revision:state.revision,messages});}
  isConfigured(){const p=this.state?.providers?.[this.state.activeProvider];return Boolean(p?.key&&p?.model);}
  async automaticAllowed(){await this.load();return !this.verificationOnly&&this.state.usageMode==='daily';}
  async configuration(){const state=await this.get(),p=this.state.providers[state.activeProvider];if(!p.key||!p.model)throw settingsError('请先保存模型和 API 密钥');return {provider:state.activeProvider,model:p.model,configRevision:p.configRevision||0};}
  async complete({purpose,input,configuration}){const config=await this.configuration();if(JSON.stringify(config)!==JSON.stringify(configuration))throw settingsError('模型配置已变化，请重试','AI_SETTINGS_CHANGED');const state=await this.get();return this.request({provider:state.activeProvider,revision:state.revision,purpose,input});}
  async connector(){await this.get();if(!this.saved||!this.state.providers[this.state.activeProvider].key||!this.state.providers[this.state.activeProvider].model)return null;return {mode:'configured',extract:input=>this.extract(input)};}
}
