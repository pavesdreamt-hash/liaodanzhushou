import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,rename,writeFile} from 'node:fs/promises';
import path from 'node:path';
const invalid=message=>Object.assign(new Error(message),{stage:'回复翻译',code:'MANUAL_TRANSLATION'});
function validateChatMessages(payload){
  const messages=payload?.messages;
  if(!Array.isArray(messages)||!messages.length||messages.length>20||messages.some(m=>typeof m?.id!=='string'||!m.id||m.id.length>200||typeof m.text!=='string'||!m.text.trim()||m.text.length>6000)||new Set(messages.map(m=>m.id)).size!==messages.length||messages.reduce((n,m)=>n+m.text.length,0)>12000)throw invalid('一次最多翻译 20 条、12000 字符的聊天文字');
  return messages;
}
export async function translateChatMessages(settings,payload){
  const messages=validateChatMessages(payload);
  const configuration=await settings.configuration();
  const result=await settings.complete({purpose:'translation',input:{language:'zh',messages:messages.map(({id,text})=>({id,text}))},configuration});
  if(!Array.isArray(result?.translations)||result.translations.length!==messages.length||new Set(result.translations.map(t=>t?.id)).size!==messages.length||result.translations.some(t=>!messages.some(m=>m.id===t?.id)||typeof t.text!=='string'||!t.text.trim()||t.text.length>16000))throw invalid('聊天翻译结果不完整，请重试');
  return {translations:result.translations.map(({id,text})=>({id,text:text.trim()}))};
}
export class ChatTranslationCache {
  constructor(directory){this.directory=directory;this.queue=Promise.resolve();}
  translate(settings,payload){const next=this.queue.then(()=>this.perform(settings,payload));this.queue=next.catch(()=>{});return next;}
  async lookup(settings,payload){
    const messages=payload?.messages,scope=payload?.scope;
    if(!Array.isArray(messages)||messages.length>100||messages.some(m=>typeof m?.id!=='string'||!m.id||m.id.length>200||typeof m.text!=='string'||m.text.length>6000)||typeof scope?.accountId!=='string'||!scope.accountId||typeof scope.chatId!=='string'||!scope.chatId)throw invalid('缓存查询内容无效');
    const configuration=await settings.configuration(),entries=await this.load();
    return {translations:messages.flatMap(message=>{const text=entries[this.key(scope,configuration,message)];return typeof text==='string'&&text.trim()?[{id:message.id,text}]:[];})};
  }
  key(scope,configuration,message){return createHash('sha256').update(JSON.stringify([scope.accountId,scope.chatId,message.id,message.text,configuration.provider,configuration.model,configuration.configRevision])).digest('hex');}
  async load(){
    try{const saved=JSON.parse(await readFile(path.join(this.directory,'chat-translations.json'),'utf8'));return saved?.version===1&&saved.entries&&typeof saved.entries==='object'&&!Array.isArray(saved.entries)?saved.entries:{};}
    catch(error){if(error.code==='ENOENT')return {};throw error;}
  }
  async perform(settings,payload){
    const messages=validateChatMessages(payload),scope=payload?.scope;
    if(typeof scope?.accountId!=='string'||!scope.accountId||typeof scope.chatId!=='string'||!scope.chatId)throw invalid('请先关联并核对客户聊天');
    const configuration=await settings.configuration(),file=path.join(this.directory,'chat-translations.json');
    const entries=await this.load(),key=message=>this.key(scope,configuration,message);
    const missing=messages.filter(message=>typeof entries[key(message)]!=='string'||!entries[key(message)].trim());
    if(missing.length){
      const result=await translateChatMessages(settings,{messages:missing});
      for(const message of result.translations)entries[key(missing.find(row=>row.id===message.id))]=message.text;
      const keys=Object.keys(entries);if(keys.length>5000)for(const old of keys.slice(0,keys.length-5000))delete entries[old];
      await mkdir(this.directory,{recursive:true});const temp=path.join(this.directory,`chat-translations-${randomUUID()}.tmp`);
      await writeFile(temp,JSON.stringify({version:1,entries}),{mode:0o600});await rename(temp,file);
    }
    return {translations:messages.map(message=>({id:message.id,text:entries[key(message)]}))};
  }
}
export async function translateManualReply(settings,payload){
  const intent=payload?.text;
  if(typeof intent!=='string'||!intent.trim())throw invalid('请先输入需要翻译的中文');
  if(intent.length>6000)throw invalid('一次最多翻译 6000 个字符，请分段翻译');
  const configuration=await settings.configuration();
  // Only the text explicitly submitted by the merchant leaves this process.
  const result=await settings.complete({purpose:'translate-intent',input:{intent},configuration});
  if(typeof result?.text!=='string'||!result.text.trim()||result.text.length>16000||typeof result.chinese!=='string'||!result.chinese.trim()||result.chinese.length>16000)throw invalid('翻译结果不完整，原稿已保留，请重试');
  let text=result.text.trim();
  const graphemes=s=>Array.from(new Intl.Segmenter('zh',{granularity:'grapheme'}).segment(s),x=>x.segment).filter(x=>/[\p{Extended_Pictographic}\p{Regional_Indicator}]/u.test(x));
  const present=graphemes(text);
  for(const emoji of graphemes(intent)){const index=present.indexOf(emoji);if(index<0)text+=emoji;else present.splice(index,1);}
  return {text,chinese:result.chinese.trim()};
}
