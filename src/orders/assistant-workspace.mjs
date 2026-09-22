import {draftError} from './draft-orders.mjs';

const defaults=Object.freeze({tab:'chat',mode:'reply',tone:'polite',intent:'',draft:'',draftChinese:'',draftChineseSource:'',chatHeight:null,showTranslation:false,replyMessageId:null,scrollTop:null,scrollMessageId:null,scrollOffset:0});
const enums={tab:['chat','review','activity'],mode:['reply','proactive'],tone:['polite','brief','friendly']};
const conflict=message=>Object.assign(draftError(message),{code:'ASSISTANT_WORKSPACE_CONFLICT'});

/** Local view state has its own revision: typing a reply never changes order costs or confirmation. */
export class AssistantWorkspace{
  constructor(app,assistant){this.app=app;this.assistant=assistant;this.db=app.database;}
  row(orderId){
    const binding=this.assistant.row(orderId);
    this.db.prepare('INSERT OR IGNORE INTO order_assistant_workspace(order_id) VALUES(?)').run(orderId);
    return {binding,row:this.db.prepare('SELECT * FROM order_assistant_workspace WHERE order_id=?').get(orderId)};
  }
  state({orderId}){
    const {binding,row}=this.row(orderId),values={...defaults,...JSON.parse(row.payload)};
    if(values.replyMessageId&&!this.message(orderId,binding,values.replyMessageId))values.replyMessageId=null;
    const replyMessage=values.replyMessageId?this.message(orderId,binding,values.replyMessageId):null;
    const latestCustomerMessage=this.db.prepare("SELECT message_id id,body text,direction,sent_at sentAt FROM order_chat_messages WHERE order_id=? AND binding_revision=? AND direction='customer' AND sent_at>=? AND sent_at<=? ORDER BY sent_at DESC,message_id DESC LIMIT 1").get(orderId,binding.binding_revision,binding.scope_start||'',binding.scope_end||'')||null;
    const aiAvailable=Boolean(this.assistant.ai.gateway&&(this.assistant.ai.gateway.isConfigured?.()??true));
    return {replyMessage,latestCustomerMessage,orderId,revision:row.revision,bindingRevision:binding.binding_revision,values,updatedAt:row.updated_at,
      capabilities:{translation:aiAvailable,replyGeneration:aiAvailable},capabilityNote:aiAvailable?'AI 操作需模型和密钥；点击才请求，结果请人工核对。':'AI 尚未配置，可手动编辑并复制英文草稿。'};
  }
  message(orderId,binding,id){
    return this.db.prepare('SELECT message_id id,body text,direction,sent_at sentAt FROM order_chat_messages WHERE order_id=? AND binding_revision=? AND message_id=? AND sent_at>=? AND sent_at<=?')
      .get(orderId,binding.binding_revision,id,binding.scope_start||'',binding.scope_end||'');
  }
  save({orderId,revision,bindingRevision,patch}){
    if(!patch||typeof patch!=='object'||Array.isArray(patch))throw draftError('回复草稿参数无效');
    const {binding,row}=this.row(orderId);
    if(!Number.isSafeInteger(revision)||row.revision!==revision)throw conflict('此订单的回复草稿已在其他窗口修改，请重新载入后核对；当前输入仍保留。');
    if(bindingRevision!==binding.binding_revision)throw conflict('聊天关联已改变，请重新核对回复目标；当前输入仍保留。');
    for(const [key,value] of Object.entries(patch)){
      if(!Object.hasOwn(defaults,key))throw draftError('回复草稿字段无效');
      if(enums[key]&&!enums[key].includes(value))throw draftError('回复选项无效');
      if(['intent','draft','draftChinese','draftChineseSource'].includes(key)&&(typeof value!=='string'||value.length>12000))throw draftError('回复内容必须为不超过 12000 字的文字');
      if(key==='chatHeight'&&value!==null&&(!Number.isFinite(value)||value<240||value>1600))throw draftError('聊天区高度必须在240到1600之间');
      if(key==='showTranslation'&&typeof value!=='boolean')throw draftError('译文开关无效');
      if(key==='scrollTop'&&value!==null&&(!Number.isFinite(value)||value<0||value>1e8))throw draftError('聊天阅读位置无效');
      if(key==='scrollOffset'&&(!Number.isFinite(value)||Math.abs(value)>1e6))throw draftError('聊天阅读偏移无效');
      if(key==='scrollMessageId'&&value!==null&&(typeof value!=='string'||!this.scrollMessage(orderId,binding,value)))throw draftError('聊天阅读位置不属于当前客户');
      if(key==='replyMessageId'&&value!==null&&(typeof value!=='string'||value.length>200||!this.message(orderId,binding,value)))throw draftError('引用消息不属于本单当前关联范围');
    }
    const values={...defaults,...JSON.parse(row.payload),...patch};
    const saved=this.db.prepare('UPDATE order_assistant_workspace SET payload=?,revision=revision+1,updated_at=? WHERE order_id=? AND revision=?')
      .run(JSON.stringify(values),this.app.now().toISOString(),orderId,revision);
    if(saved.changes!==1)throw conflict('回复草稿已改变，请重新载入后核对');
    return this.state({orderId});
  }
  messages({orderId,bindingRevision,before=null,limit=80,includeHistory=false}){
    if(includeHistory)return this.conversation({orderId,bindingRevision,before,limit});
    const binding=this.assistant.row(orderId);
    if(bindingRevision!==undefined&&bindingRevision!==binding.binding_revision)throw conflict('聊天关联已改变，请重新载入聊天');
    if(!Number.isSafeInteger(limit)||limit<1||limit>200)throw draftError('每页消息数量必须在 1 到 200 之间');
    let clause='',args=[orderId,binding.binding_revision,binding.scope_start||'',binding.scope_end||''];
    if(before){
      if(typeof before!=='object'||before.bindingRevision!==binding.binding_revision||typeof before.id!=='string'||typeof before.sentAt!=='string')throw conflict('聊天分页位置已失效');
      const anchor=this.db.prepare('SELECT sent_at FROM order_chat_messages WHERE order_id=? AND binding_revision=? AND message_id=?').get(orderId,binding.binding_revision,before.id);
      if(!anchor||anchor.sent_at!==before.sentAt)throw conflict('聊天分页位置已失效');
      clause=' AND (sent_at<? OR (sent_at=? AND message_id<?))';args.push(before.sentAt,before.sentAt,before.id);
    }
    const rows=this.db.prepare(`SELECT message_id id,direction,sent_at sentAt,body text,metadata FROM order_chat_messages WHERE order_id=? AND binding_revision=? AND sent_at>=? AND sent_at<=?${clause} ORDER BY sent_at DESC,message_id DESC LIMIT ?`).all(...args,limit+1);
    const hasOlder=rows.length>limit,messages=rows.slice(0,limit).reverse().map(({metadata,...m})=>({...m,timePrecision:metadata?JSON.parse(metadata).timePrecision||null:null,media:metadata?JSON.parse(metadata).media||[]:[]}));
    const first=messages[0];
    return {orderId,bindingRevision:binding.binding_revision,messages,hasOlder,before:hasOlder&&first?{id:first.id,sentAt:first.sentAt,bindingRevision:binding.binding_revision}:null};
  }
  conversation({orderId,bindingRevision,before=null,limit=80}){
    const b=this.assistant.row(orderId);
    if(bindingRevision!==undefined&&bindingRevision!==b.binding_revision)throw conflict('聊天关联已改变，请重新载入聊天');
    if(!Number.isSafeInteger(limit)||limit<1||limit>200)throw draftError('每页消息数量必须在 1 到 200 之间');
    const cte=`WITH conversation AS (
      SELECT a.message_id id,COALESCE(o.direction,a.direction) direction,COALESCE(o.sent_at,a.sent_at) sentAt,COALESCE(o.body,a.body) text,COALESCE(o.metadata,a.metadata) metadata,CASE WHEN o.message_id IS NOT NULL AND o.sent_at>=? AND o.sent_at<=? THEN 1 ELSE 0 END inOrder
      FROM assistant_chat_archive a LEFT JOIN order_chat_messages o ON o.order_id=? AND o.binding_revision=? AND o.message_id=a.message_id
      WHERE a.account_id=? AND a.chat_id=?
      UNION ALL SELECT message_id id,direction,sent_at sentAt,body text,metadata,1 inOrder FROM order_chat_messages o WHERE order_id=? AND binding_revision=? AND sent_at>=? AND sent_at<=? AND NOT EXISTS (SELECT 1 FROM assistant_chat_archive a WHERE a.account_id=? AND a.chat_id=? AND a.message_id=o.message_id)
    )`;
    const args=[b.scope_start||'',b.scope_end||'',orderId,b.binding_revision,b.account_id,b.chat_id,orderId,b.binding_revision,b.scope_start||'',b.scope_end||'',b.account_id,b.chat_id];const baseArgs=[...args];let clause='';
    if(before){
      if(before.bindingRevision!==b.binding_revision||before.accountId!==b.account_id||before.chatId!==b.chat_id||typeof before.id!=='string'||typeof before.sentAt!=='string')throw conflict('聊天分页位置已失效');
      const anchor=this.db.prepare(cte+' SELECT sentAt FROM conversation WHERE id=?').get(...args,before.id);if(!anchor||anchor.sentAt!==before.sentAt)throw conflict('聊天分页位置已失效');
      clause=' WHERE (sentAt<? OR (sentAt=? AND id<?))';args.push(before.sentAt,before.sentAt,before.id);
    }
    const rows=this.db.prepare(cte+' SELECT * FROM conversation'+clause+' ORDER BY sentAt DESC,id DESC LIMIT ?').all(...args,limit+1);
    const messages=rows.slice(0,limit).reverse().map(({metadata,inOrder,...m})=>({...m,inOrder:Boolean(inOrder),timePrecision:JSON.parse(metadata||'{}').timePrecision||null,media:JSON.parse(metadata||'{}').media||[],incomplete:Boolean(JSON.parse(metadata||'{}').incomplete),syncNote:JSON.parse(metadata||'{}').note||null})),first=messages[0];
    const count=Number(this.db.prepare(`SELECT count(*) n FROM assistant_chat_archive WHERE account_id=? AND chat_id=?`).get(b.account_id,b.chat_id).n);
    return {orderId,bindingRevision:b.binding_revision,messages,hasOlder:rows.length>limit,before:rows.length>limit&&first?{id:first.id,sentAt:first.sentAt,bindingRevision:b.binding_revision,accountId:b.account_id,chatId:b.chat_id}:null,historyCount:count,conversationCount:Number(this.db.prepare(cte+' SELECT count(*) n FROM conversation').get(...baseArgs).n),historyProgress:JSON.parse(this.assistant.history.progress(b).payload)};
  }
  scrollMessage(orderId,binding,id){return this.message(orderId,binding,id)||this.db.prepare('SELECT message_id id FROM assistant_chat_archive WHERE account_id=? AND chat_id=? AND message_id=?').get(binding.account_id,binding.chat_id,id);}
  activity({orderId}){
    this.assistant.row(orderId);
    return this.db.prepare("SELECT id,event_type type,event_time at FROM order_events WHERE order_id=? AND (event_type LIKE 'assistant_%' OR event_type='draft_created' OR event_type='draft_saved') ORDER BY event_time DESC,rowid DESC LIMIT 100").all(orderId);
  }
  replyForCopy({orderId,revision,bindingRevision}){
    
    const state=this.state({orderId});
    if(state.revision!==revision||state.bindingRevision!==bindingRevision)throw conflict('回复草稿或聊天关联已改变，请重新核对后复制');
    if(!state.values.draft.trim())throw draftError('请先填写英文草稿');
    return state.values.draft;
  }
}
