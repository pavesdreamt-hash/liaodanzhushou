import {createHash} from 'node:crypto';
import {draftError} from './draft-orders.mjs';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const conflict=()=>Object.assign(draftError('订单、聊天或回复输入已变化，旧 AI 结果已丢弃；当前草稿保留。'),{code:'ASSISTANT_AI_STALE'});
export class AssistantAI{
 constructor(app,assistant,gateway=null){this.app=app;this.assistant=assistant;this.db=app.database;this.gateway=gateway;this.running=new Set();}
 async config(){if(!this.gateway)throw draftError('AI 尚未配置，请从助手设置保存服务商、模型和密钥');return this.gateway.configuration();}
 messages(orderId,binding){return this.db.prepare('SELECT message_id id,direction,sent_at sentAt,body text FROM order_chat_messages WHERE order_id=? AND binding_revision=? AND sent_at>=? AND sent_at<=? ORDER BY sent_at,message_id').all(orderId,binding.binding_revision,binding.scope_start||'',binding.scope_end||'');}
 async translations({orderId,messageIds=[],generate=false,automatic=false}){
  if(automatic&&!(await this.gateway?.automaticAllowed?.()))throw draftError('自动AI操作需要明确开启日常额度；验证额度不能用于自动请求');
  if(typeof generate!=='boolean')throw draftError('译文请求方式无效');
  this.assistant.policy.cleanup();
  const binding=this.assistant.row(orderId);
  if(!Array.isArray(messageIds)||messageIds.length>200||messageIds.some(id=>typeof id!=='string')||new Set(messageIds).size!==messageIds.length)throw draftError('译文消息参数无效');
  const all=this.db.prepare('SELECT message_id id,direction,sent_at sentAt,body text,metadata FROM order_chat_messages WHERE order_id=? AND binding_revision=? UNION ALL SELECT a.message_id id,a.direction,a.sent_at sentAt,a.body text,a.metadata FROM assistant_chat_archive a WHERE a.account_id=? AND a.chat_id=? AND NOT EXISTS(SELECT 1 FROM order_chat_messages m WHERE m.order_id=? AND m.binding_revision=? AND m.message_id=a.message_id)').all(orderId,binding.binding_revision,binding.account_id,binding.chat_id,orderId,binding.binding_revision),byId=new Map(all.map(m=>[m.id,m]));if(messageIds.some(id=>!byId.has(id)))throw draftError('翻译消息不属于本单当前关联范围');
  const metadata=new Map(all.map(m=>[m.id,JSON.parse(m.metadata||'{}')]));
  const skipped=messageIds.filter(id=>{const m=byId.get(id),meta=metadata.get(id)||{};return !m.text.trim()||['ciphertext','revoked'].includes(meta.messageType)||/^\[(?:图片|非文字消息[^\]]*|(?:正在等待|等待 WhatsApp 解密的)此?消息[^\]]*)\]$/.test(m.text.trim());});
  const skippedIds=new Set(skipped),config=await this.config(),result={},missing=[];
  const key=m=>hash(['translation','zh',config,m.id,m.text]);
  for(const id of messageIds){if(skippedIds.has(id))continue;const m=byId.get(id),row=this.db.prepare('SELECT result FROM order_assistant_ai_cache WHERE order_id=? AND binding_revision=? AND cache_key=?').get(orderId,binding.binding_revision,key(m));if(row){result[id]=JSON.parse(row.result);if(this.assistant.policy.available())this.db.prepare('UPDATE order_assistant_ai_cache SET accessed_at=? WHERE order_id=? AND binding_revision=? AND cache_key=?').run(this.app.now().toISOString(),orderId,binding.binding_revision,key(m));}else missing.push(m);}
  if(!generate||!missing.length)return {translations:result,remaining:missing.length,generated:0,skipped};
  // Translate the displayed literal text independently of conversation coverage.
  const batch=missing.slice(0,20).map(({metadata,...m})=>m);if(this.running.has(orderId))throw draftError('本单已有 AI 操作进行中，请稍候');this.running.add(orderId);
  try{
   const response=await this.gateway.complete({purpose:'translation',input:{language:'zh',messages:batch},configuration:config});
   if(!response||!Array.isArray(response.translations)||response.translations.length!==batch.length)throw draftError('AI 译文响应不完整，未保存本批结果');
   const seen=new Set();for(const r of response.translations){if(!r||!batch.some(m=>m.id===r.id)||seen.has(r.id)||typeof r.text!=='string'||!r.text.trim()||r.text.length>16000)throw draftError('AI 译文格式无效，未保存本批结果');seen.add(r.id);}
   if(JSON.stringify(await this.config())!==JSON.stringify(config))throw conflict();
   this.app.drafts.repo.transaction(()=>{const now=this.assistant.row(orderId);if(now.binding_revision!==binding.binding_revision||now.read_revision!==binding.read_revision)throw conflict();
    for(const r of response.translations){this.db.prepare('INSERT OR REPLACE INTO order_assistant_ai_cache(order_id,binding_revision,cache_key,result,created_at) VALUES(?,?,?,?,?)').run(orderId,binding.binding_revision,key(byId.get(r.id)),JSON.stringify(r.text),this.app.now().toISOString());result[r.id]=r.text;}
   });return {translations:result,remaining:missing.length-batch.length,generated:batch.length,skipped};
  }finally{this.running.delete(orderId);}
 }
 async generate({orderId,revision,bindingRevision,purpose='reply',automatic=false}){
  if(automatic&&!(await this.gateway?.automaticAllowed?.()))throw draftError('自动起草需要明确开启日常额度；验证额度不能用于自动请求');
  if(!['reply','compose','translate-intent','translate-draft','regenerate'].includes(purpose))throw draftError('回复操作无效');
  const workspace=this.assistant.workspace.state({orderId}),binding=this.assistant.row(orderId),order=this.app.drafts.order(orderId);
  if(workspace.revision!==revision||workspace.bindingRevision!==bindingRevision)throw conflict();
  if(this.running.has(orderId))throw draftError('本单已有 AI 操作进行中，请稍候');
  const values=workspace.values,messages=this.messages(orderId,binding);let reference=null;
  if(['compose','translate-intent'].includes(purpose)&&!values.intent.trim())throw draftError('请先填写中文想说的话');
  if(values.mode==='proactive'&&purpose!=='translate-draft'&&!values.intent.trim())throw draftError('主动联系请先填写中文意图');
  if(values.mode==='reply'&&['reply','regenerate'].includes(purpose)){
   reference=values.replyMessageId?messages.find(m=>m.id===values.replyMessageId):messages.filter(m=>m.direction==='customer').at(-1);
   if(!reference||reference.direction!=='customer')throw draftError('请先选择本单客户消息，或切换为主动联系');
   if(binding.read_issue)throw draftError(binding.read_issue);
  }
  if(purpose==='translate-draft'&&!values.draft.trim())throw draftError('请先填写英文草稿');
  if(binding.read_issue&&['reply','compose','regenerate'].includes(purpose))throw draftError(binding.read_issue);
  const policy=this.assistant.policy.state();
  const config=await this.config(),detail=this.app.detail({id:orderId});
  const context=['translate-intent','translate-draft'].includes(purpose)?null:{customer:detail.customer,draft:this.app.drafts.state(orderId),confirmed:detail.confirmed};
  const conversation=context?messages.map(({id,direction,sentAt,text})=>({id,direction,sentAt,text})):[];
  this.running.add(orderId);
  try{
   const input={mode:values.mode,tone:values.tone,intent:values.intent,english:purpose==='translate-draft'?values.draft:undefined,reference,context,conversation,workflow:context?this.assistant.policy.workflow(orderId):null,businessRules:context?policy.values.businessRules:undefined,examples:context?policy.values.examples:undefined};
   if(JSON.stringify(input).length>100000)throw draftError('本单对话或批准范例超出单次AI处理上限，请缩小本单范围或整理范例；未请求AI，原稿保留。');
   const result=await this.gateway.complete({purpose:purpose==='regenerate'?'reply':purpose,input,configuration:config});
   if(typeof result?.text!=='string'||!result.text.trim()||result.text.length>12000)throw draftError('AI 未返回有效英文草稿，已有草稿保留');
   const latestConfig=await this.config();const current=this.assistant.workspace.state({orderId}),now=this.assistant.row(orderId),newOrder=this.app.drafts.order(orderId);
   if(current.revision!==revision||now.binding_revision!==bindingRevision||now.read_revision!==binding.read_revision||order.draft_revision!==newOrder.draft_revision||order.updated_at!==newOrder.updated_at||JSON.stringify(latestConfig)!==JSON.stringify(config)||this.assistant.policy.state().revision!==policy.revision)throw conflict();
   if(purpose==='translate-draft'&&result.text!==values.draft)throw draftError('中文对照请求改动了英文，结果未采用');
   if(typeof result.chinese!=='string'||!result.chinese.trim()||result.chinese.length>12000)throw draftError('AI 未返回有效中文对照，已有草稿保留');
   return {text:result.text,chinese:result.chinese,revision,bindingRevision,referenceId:reference?.id||null,note:'AI 草稿请核对后使用，未发送消息。'};
  }finally{this.running.delete(orderId);}
 }
}
