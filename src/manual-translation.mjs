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

export async function generateManualAssistantDraft(settings,payload){
  const intent=payload?.intent;
  if(intent!==undefined&&typeof intent!=='string')throw invalid('中文意图无效');
  if(typeof intent==='string'&&intent.length>6000)throw invalid('一次最多输入 6000 个字符的中文意图');
  const messages=validateChatMessages(payload).map(message=>{
    if(!['customer','merchant'].includes(message.direction)||typeof message.sentAt!=='string'||!Number.isFinite(Date.parse(message.sentAt)))throw invalid('当前会话文字无效，请重新选择客户');
    return {id:message.id,direction:message.direction,text:message.text.trim(),sentAt:message.sentAt};
  });
  const referenceMessageId=payload?.referenceMessageId??null;
  if(referenceMessageId!==null&&(typeof referenceMessageId!=='string'||!referenceMessageId.trim()||referenceMessageId.length>200))throw invalid('引用的客户消息无效');
  const customerMessages=messages.filter(message=>message.direction==='customer');
  const reference=referenceMessageId===null?customerMessages.at(-1):customerMessages.find(message=>message.id===referenceMessageId);
  if(referenceMessageId!==null&&!reference)throw invalid('引用消息不属于当前客户会话');
  const trimmedIntent=typeof intent==='string'?intent.trim():'';
  if(!reference&&!trimmedIntent)throw invalid('请输入中文意图，或选择当前会话中的客户文字消息');
  const configuration=await settings.configuration();
  // The main process supplies this bounded, currently verified conversation; never trust
  // renderer-provided chat text or turn an AI result into a send operation.
  const result=await settings.complete({purpose:'reply',input:{mode:reference?'reply':'proactive',tone:'professional',intent:trimmedIntent,reference:reference||null,context:null,conversation:messages},configuration});
  if(typeof result?.text!=='string'||!result.text.trim()||result.text.length>12000||typeof result.chinese!=='string'||!result.chinese.trim()||result.chinese.length>12000)throw invalid('AI 草稿结果不完整，已有草稿保留，请重试');
  return {text:result.text.trim(),chinese:result.chinese.trim(),referenceId:reference?.id||null,note:'AI 草稿请人工核对后使用，未发送消息。'};
}

export async function recognizeImageText(settings,payload){
  const dataUrl=payload?.dataUrl;
  const match=typeof dataUrl==='string'&&dataUrl.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+=*)$/i);
  if(!match)throw invalid('这条消息没有可识别的 PNG、JPEG 或 WebP 图片');
  const bytes=Math.floor(match[2].length*3/4)-(match[2].endsWith('==')?2:match[2].endsWith('=')?1:0);
  if(!bytes||bytes>16*1024*1024)throw invalid('图片超过 16 MB 或内容为空，无法识别');
  const configuration=await settings.configuration();
  const result=await settings.complete({purpose:'image-ocr',input:{image:dataUrl},configuration});
  if(typeof result?.text!=='string'||!result.text.trim()||result.text.length>16000)throw invalid('没有识别到可用文字');
  return {text:result.text.trim()};
}
