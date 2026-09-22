import {draftError} from './draft-orders.mjs';
import {createHash} from 'node:crypto';

export const stageDefinitions=Object.freeze([
 {id:'intent',name:'商品意向',requires:['items'],action:'了解商品、规格与意向数量，询价不等于确认购买。'},
 {id:'recipient',name:'收货资料',requires:['fullName','phone','country','city','street'],action:'只询问缺少的收货资料，历史地址需要确认本次是否沿用。'},
 {id:'delivery',name:'配送核对',requires:['deliverable'],action:'核对当前地址；超范围时询问替代地址。'},
 {id:'confirmation',name:'客户确认',requires:['items','price','deliverable','confirmed'],action:'汇总商品、规格、数量、成交价格及收货资料，请客户明确确认。'},
 {id:'readiness',name:'报单准备',requires:['reportReady'],action:'补齐报单必需字段、匹配商品并完成分包；保留现有报单规则。'},
 {id:'txt',name:'生成报单',requires:['txt'],action:'生成并保存或下载当前有效TXT；文件修改后需重新生成。'},
 {id:'receipt',name:'收货跟进',requires:['received'],action:'询问是否全部收到、有哪些异常；多个包裹分别登记。'},
 {id:'settlement',name:'费用结算',requires:['settled'],action:'登记成本、运费、其他费用与回款，未知费用不能当成0。'}
]);
export function stageGoal(stage){
 const def=stageDefinitions.find(t=>t.id===stage?.id);if(!def)return stage?.action||stage?.name||'核对本阶段信息';
 if(stage.action&&stage.action!==def.action)return stage.action;
 if(stage.id==='recipient'){
  const missing=stage.missing||def.requires,parts=[];
  if(missing.includes('fullName'))parts.push('姓名');if(missing.includes('phone'))parts.push('电话');
  if(missing.some(k=>['country','city','street','province','residence'].includes(k)))parts.push('地址');
  return parts.length?'确认收货'+parts.join('、'):'核对本次收货资料';
 }
 return {intent:'了解商品与意向数量',delivery:'核对地址配送范围',confirmation:'请客户确认商品与收货信息',readiness:'补齐报单资料并完成分包',txt:'生成并下载报单TXT',receipt:'跟进本单是否全部收货',settlement:'登记费用回款并核算利润'}[stage.id];
}
const initial=()=>({anchorAt:null,nextFollowUpAt:null,waitingUntil:null,waitingNote:'',ended:false,endReason:'',focus:null,confirmation:null,history:[]});
const present=v=>typeof v==='string'&&Boolean(v.trim());
const terminal=new Set(['signed','refused','cancelled_before_outbound','cancelled_after_outbound']);
export class AssistantStages{
 constructor(app){this.app=app;this.db=app.database;}
 state(orderId){if(!this.db.prepare('SELECT 1 FROM orders WHERE id=?').get(orderId))throw draftError('找不到订单');const available=this.db.prepare("SELECT 1 FROM sqlite_master WHERE name='order_assistant_stages'").get();const row=available?this.db.prepare('SELECT * FROM order_assistant_stages WHERE order_id=?').get(orderId):null;return {orderId,revision:row?.revision||0,values:{...initial(),...JSON.parse(row?.payload||'{}')}};}
 save({orderId,revision,action,at,note,stageId}){
  const s=this.state(orderId);if(revision!==s.revision)throw draftError('阶段记录已被其他窗口修改，请重新打开核对');
  const v=structuredClone(s.values),now=this.app.now().toISOString(),reason=String(note||'').trim();if(reason.length>500)throw draftError('阶段备注最多500字');
  if(['followup','anchor','waiting'].includes(action)){if(typeof at!=='string'||!Number.isFinite(Date.parse(at)))throw draftError('请选择有效时间');const when=new Date(at).toISOString();if(action==='anchor'&&Date.parse(when)>Number(this.app.now()))throw draftError('起算时间不能晚于当前时间');if(action!=='anchor'&&Date.parse(when)<=Number(this.app.now()))throw draftError('下次提醒必须晚于当前时间');if(!reason)throw draftError('请填写调整或跟进依据');v[action==='anchor'?'anchorAt':action==='waiting'?'waitingUntil':'nextFollowUpAt']=when;if(action==='waiting')v.waitingNote=reason;if(action==='followup')v.waitingUntil=null;}
  else if(action==='end'){if(!reason)throw draftError('结束跟进需要明确原因');v.ended=true;v.endReason=reason;}
  else if(action==='resume'){v.ended=false;v.endReason='';v.waitingUntil=null;v.nextFollowUpAt=null;v.focus=null;}
  else if(action==='focus'){if(!reason||!this.app.assistant.policy.state().values.stages.some(t=>t.id===stageId))throw draftError('人工关注需要有效阶段和原因');v.focus={stageId,reason,fingerprint:this.fingerprint(orderId)};}
  else if(action==='confirmation'){if(!reason||!this.app.detail({id:orderId}).confirmed)throw draftError('请先在订单中登记客户确认；重新核对需要明确依据');v.confirmation={fingerprint:this.confirmationFingerprint(orderId),at:now,note:reason};}
  else if(action==='automatic'){v.focus=null;}
  else throw draftError('阶段操作无效');
  v.history.push({action,at:now,note:reason,time:at||null,stageId:stageId||null});if(v.history.length>500)throw draftError('阶段记录已达到500条，请先备份，不自动删除依据');
  this.db.exec('BEGIN IMMEDIATE');try{const row=this.db.prepare('SELECT revision FROM order_assistant_stages WHERE order_id=?').get(orderId);if((row?.revision||0)!==revision)throw draftError('阶段记录已改变');this.db.prepare('INSERT INTO order_assistant_stages(order_id,revision,payload,updated_at) VALUES(?,?,?,?) ON CONFLICT(order_id) DO UPDATE SET revision=excluded.revision,payload=excluded.payload,updated_at=excluded.updated_at').run(orderId,revision+1,JSON.stringify(v),now);this.db.exec('COMMIT');}catch(e){this.db.exec('ROLLBACK');throw e;}return this.app.assistant.policy.workflow(orderId);
 }
 confirmationFingerprint(orderId){const d=this.app.detail({id:orderId});return createHash('sha256').update(JSON.stringify([d.customer.firstName,d.customer.lastName,d.customer.phone,d.customer.country,d.customer.province,d.customer.city,d.customer.street,d.customer.residence,d.items.map(i=>[i.businessCode,i.quantity,i.unitActualPriceFils])])).digest('hex');}
 confirmationValid(orderId){const d=this.app.detail({id:orderId}),c=this.state(orderId).values.confirmation;if(!d.confirmed)return false;if(c)return c.fingerprint===this.confirmationFingerprint(orderId);return !this.db.prepare("SELECT 1 FROM order_events WHERE order_id=? AND rowid>COALESCE((SELECT MAX(rowid) FROM order_events WHERE order_id=? AND event_type='order_confirmed'),0) AND (event_type IN ('item_discount_updated','package_discount_updated') OR (event_type IN ('recipient_override_saved','recipient_override_restored') AND new_value IN ('firstName','lastName','phone','country','province','city','street','residence'))) LIMIT 1").get(orderId,orderId);}
 fingerprint(orderId){const d=this.app.detail({id:orderId});return createHash('sha256').update(JSON.stringify([d.customer,d.draft?.fields,d.draft?.items||d.items,d.addressVerification.status,d.confirmed,d.report?.reportedAt,d.packages.map(p=>[p.id,p.status,p.shippingFeeConfirmed]),d.remittance])).digest('hex');}
 workflow(policy,orderId,labels){
  const d=this.app.detail({id:orderId}),s=this.state(orderId),v=s.values,draft=this.app.drafts.state(orderId),fields=d.entryState==='draft'?draft.fields:{...d.customer,...Object.fromEntries(d.recipient.fields.map(f=>[f.field,f.effective])),fullName:d.recipient.fullName||d.customer.fullName||d.recipient.displayName},items=d.entryState==='draft'?draft.items:d.items;
  const checks={...Object.fromEntries(Object.keys(labels).map(k=>[k,present(fields[k])])),items:items.length>0&&items.every(i=>present(i.sku||i.businessCode)&&Number(i.quantity)>0),price:items.length>0&&items.every(i=>d.entryState==='draft'?i.price_fils!==null:i.unitActualPriceFils!==null),payment:Boolean(d.remittance?.registeredAt)||d.paymentStatus==='paid',confirmed:this.confirmationValid(orderId),reported:Boolean(d.report?.reportedAt),shipped:d.packages.length>0&&d.packages.every(p=>['shipped_pending','signed'].includes(p.status)),deliverable:d.addressVerification.status==='deliverable',reportReady:Boolean(d.report?.readiness.ok)&&this.confirmationValid(orderId),txt:Boolean(d.report?.reportedAt)&&Boolean(d.report?.readiness.ok)&&this.confirmationValid(orderId),received:d.packages.length>0&&d.packages.every(p=>terminal.has(p.status)),settled:d.profitStatus==='final'&&Boolean(d.remittance?.completedAt)};
  const a=this.app.assistant.row(orderId),conflicts=JSON.parse(a.result||'{}').conflicts||[],stages=policy.values.stages.map((t,i)=>{const def=stageDefinitions.find(x=>x.id===t.id),requires=[...new Set([...(def?.requires||[]),...t.requires])],missing=requires.filter(k=>!checks[k]);return {...t,number:i+1,missing,complete:missing.length===0,goal:stageGoal({...t,missing}),action:t.action||def?.action||'核对当前阶段所缺的信息。'};});
  const first=this.db.prepare("SELECT MIN(event_time) at FROM order_events WHERE order_id=? AND event_type='order_report_saved'").get(orderId)?.at,anchorAt=v.anchorAt||first||d.report?.reportedAt||null,deadline=anchorAt?new Date(Date.parse(anchorAt)+policy.values.followUpDays*86400000).toISOString():null,dueAt=v.nextFollowUpAt||deadline;
  const reminder={anchorAt,anchorSource:v.anchorAt?'人工修正':'首次保存/下载有效TXT',dueAt,overdue:Boolean(dueAt&&Date.parse(dueAt)<=Number(this.app.now())&&!checks.received&&!v.ended&&!(v.waitingUntil&&Date.parse(v.waitingUntil)>Number(this.app.now()))),active:Boolean(dueAt&&!checks.received&&!v.ended)};
  const waiting=Boolean(v.waitingUntil&&Date.parse(v.waitingUntil)>Number(this.app.now())),focus=v.focus?.fingerprint===this.fingerprint(orderId)?v.focus:null;let current=stages.findIndex(t=>!t.complete);if(current<0)current=stages.length;
  if(focus&&stages.some(t=>t.id===focus.stageId))current=stages.findIndex(t=>t.id===focus.stageId);if(reminder.overdue&&!conflicts.length&&checks.txt&&!focus&&stages.some(t=>t.id==='receipt'))current=stages.findIndex(t=>t.id==='receipt');
  if(v.ended)current=d.packages.length&&stages.some(t=>t.id==='settlement')?stages.findIndex(t=>t.id==='settlement'):stages.length;
  const selected=stages[current],next=stages.slice(current+1).find(t=>!t.complete),outOfRange=d.addressVerification.status==='out_of_range',exception=v.ended?'已结束销售跟进':conflicts.length?'资料差异待核对':outOfRange?'询问替代地址':d.packages.some(p=>p.status==='unreachable')?'联系异常，请核对':null;
  const messages=this.db.prepare('SELECT message_id,body,sent_at FROM order_chat_messages WHERE order_id=? AND binding_revision=? AND direction=? ORDER BY sent_at DESC,message_id DESC LIMIT 100').all(orderId,a.binding_revision,'customer'),candidates=[];
  for(const m of messages){if(/[?？]|\b(?:not|never|haven.t|hasn.t|didn.t|no)\b|没有|没收到|未收到|还没|是否|收到没/i.test(m.body))continue;if(/(?:received|got) (?:all|both|everything)|全部.*收到|都收到了/i.test(m.body))candidates.push({type:'receipt',messageId:m.message_id,text:m.body,at:m.sent_at,note:'疑似全部收货，请核对并登记；不自动改包裹状态'});else if(/confirm (?:the |my )?order|确认(?:购买|订单)|就按.*(?:下单|发货)/i.test(m.body))candidates.push({type:'confirmation',messageId:m.message_id,text:m.body,at:m.sent_at,note:'疑似确认购买，请核对对应订单汇总；不自动确认订单'});if(candidates.length===5)break;}
  const missing=selected?.missing.map(k=>labels[k])||[],issues=(d.report?.readiness.checks||[]).filter(c=>!c.ok&&c.blocking!==false).map(c=>({key:c.key,text:c.text}));
  return {policyRevision:policy.revision,stages,current,stage:exception||(waiting?'等待客户 · ':'')+(selected?.name||'流程已完成'),currentStageId:selected?.id||null,nextStage:next||null,missing,checks,blocked:conflicts.length>0,conflicts:conflicts.map(c=>labels[c.field]||c.field),exception,waiting,manualFocus:focus,reminder,candidates,readIssue:a.read_issue||null,readinessIssues:issues,stageState:s,messageCount:Number(this.db.prepare('SELECT COUNT(*) n FROM order_chat_messages WHERE order_id=? AND binding_revision=?').get(orderId,a.binding_revision).n),evidence:{confirmation:v.confirmation?.at||d.confirmedAt,confirmationNote:v.confirmation?.note||d.confirmationNote,delivery:d.addressVerification,txt:d.report?.reportedAt,packages:d.packages.map(p=>({id:p.id,series:p.seriesCode,status:p.status,feeConfirmed:p.shippingFeeConfirmed})),settlement:d.remittance},question:v.ended||waiting?null:outOfRange?'请询问客户是否有其他可配送的收货地址。':selected?.id==='recipient'?'请向客户询问以下缺少的收货资料：'+missing.join('、')+'。不要重复询问已有资料。':outOfRange?'请询问客户是否有其他可配送的收货地址。':selected?.id==='intent'?'请询问客户想要的商品、规格和意向数量；不要提前要求确认订单。':selected?.id==='confirmation'?'请汇总当前商品、规格、数量、成交价格与收货资料，请客户明确确认；不编造运费或发货安排。':selected?.id==='receipt'?'请询问客户是否全部收到本单包裹，以及是否有配送或商品异常；不要声称已发货。':null,note:'按本单保存事实判断；聊天表述仅待核对。不会登记付款、客户确认或发送消息。桃园和回执不纳入本阶段。'};
 }
 reminders(){return this.db.prepare("SELECT o.id,o.fixed_sequence FROM orders o WHERE EXISTS(SELECT 1 FROM order_events e WHERE e.order_id=o.id AND e.event_type='order_report_saved') OR EXISTS(SELECT 1 FROM packages p WHERE p.order_id=o.id AND p.reported_at IS NOT NULL) OR EXISTS(SELECT 1 FROM order_assistant_stages s WHERE s.order_id=o.id) ORDER BY o.created_at DESC").all().map(r=>{const f=this.app.assistant.policy.workflow(r.id);return {orderId:r.id,sequence:r.fixed_sequence,stage:f.stage,...f.reminder};}).filter(r=>r.overdue);}
}
