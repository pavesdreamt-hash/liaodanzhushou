import {draftError} from './draft-orders.mjs';
import {AssistantStages,stageDefinitions} from './assistant-stages.mjs';

export const requirementLabels=Object.freeze({deliverable:'地址可配送',reportReady:'报单资料完整',txt:'当前有效TXT已保存/下载',received:'配送已完成或明确结束',settled:'费用及回款已结算',items:'商品与数量',price:'成交单价',fullName:'收货姓名',phone:'收货电话',country:'国家/地区',city:'城市',street:'街道',residence:'寓所',payment:'付款已核实',confirmed:'客户明确确认',reported:'有效报单',shipped:'已登记发货'});
export const defaultPolicy=Object.freeze({retentionDays:90,mediaRetentionDays:45,autoTranslate:false,autoReview:false,autoDraft:false,continuousSync:false,businessRules:'不得无依据承诺库存、交期或付款已到账。客户询价不等于购买；客户确认和发送消息由人工操作。',followUpDays:7,stages:stageDefinitions.map(s=>({...s,requires:[...s.requires]})),examples:[]});
export class AssistantPolicy{
 constructor(app){this.app=app;this.db=app.database;this.records=new AssistantStages(app);}
 available(){return Boolean(this.db.prepare("SELECT 1 FROM sqlite_master WHERE name='assistant_policy'").get());}
 state(){if(!this.available())return {revision:0,values:structuredClone(defaultPolicy),requirements:requirementLabels};this.db.prepare('INSERT OR IGNORE INTO assistant_policy(id) VALUES(1)').run();const r=this.db.prepare('SELECT * FROM assistant_policy WHERE id=1').get();const stored=JSON.parse(r.payload);const old=['了解购买需求','确认成交金额','补齐收货信息','等待客户确认','准备分包与报单','登记发货'];if(stored.stages?.length===6&&stored.stages.every((t,i)=>t.name===old[i]&&JSON.stringify(t.requires)===JSON.stringify([['items'],['price'],['fullName','phone','country','city','street','residence'],['confirmed'],['reported'],['shipped']][i])))stored.stages=structuredClone(defaultPolicy.stages);const values={...structuredClone(defaultPolicy),...stored};values.continuousSync=false;values.stages=values.stages.map((t,i)=>({...t,id:t.id||'custom-'+(i+1)}));return {revision:r.revision,values,requirements:requirementLabels};}
 save({revision,patch}){
  const s=this.state();if(revision!==s.revision)throw draftError('流程设置已被其他窗口修改，请重新打开后核对');
  if(!patch||Array.isArray(patch)||typeof patch!=='object'||Object.keys(patch).some(k=>!Object.hasOwn(defaultPolicy,k)))throw draftError('流程设置参数无效');
  const v={...s.values,...patch};if(v.continuousSync)throw draftError('自动刷新已停用，请点击刷新聊天更新');if(!Number.isInteger(v.followUpDays)||v.followUpDays<1||v.followUpDays>7)throw draftError('收货提醒期限为1至7天');if(![0,30,90].includes(v.retentionDays)||![0,30,45,90].includes(v.mediaRetentionDays))throw draftError('译文保留时间无效');
  for(const k of ['autoTranslate','autoReview','autoDraft','continuousSync'])if(typeof v[k]!=='boolean')throw draftError('自动处理开关无效');
  if(typeof v.businessRules!=='string'||v.businessRules.length>8000)throw draftError('业务规则最多8000字');
  if(!Array.isArray(v.stages)||!v.stages.length||v.stages.length>12||v.stages.some(t=>!t||typeof t.name!=='string'||!t.name.trim()||t.name.length>80||!Array.isArray(t.requires)||!t.requires.length||new Set(t.requires).size!==t.requires.length||t.requires.some(k=>!Object.hasOwn(requirementLabels,k))))throw draftError('每个步骤需要名称和至少一个有效完成条件');
  v.stages=v.stages.map((t,i)=>({...t,id:t.id||'custom-'+(i+1)}));if(new Set(v.stages.map(t=>t.id)).size!==v.stages.length||v.stages.some(t=>typeof t.id!=='string'||!/^[-a-z0-9]{1,60}$/.test(t.id)||typeof(t.action||'')!=='string'||(t.action||'').length>1000))throw draftError('阶段标识或动作说明无效');
  if(v.stages.some(t=>stageDefinitions.some(d=>d.id===t.id))&&stageDefinitions.some(d=>!v.stages.some(t=>t.id===d.id)))throw draftError('标准流程需要保留全部八个阶段，可调整顺序、名称或增加步骤');
  if(!Array.isArray(v.examples)||v.examples.length>20||v.examples.some(e=>!e||typeof e.intent!=='string'||typeof e.english!=='string'||typeof e.chinese!=='string'||!e.english.trim()||[e.intent,e.english,e.chinese].some(x=>x.length>12000)))throw draftError('批准范例最多20条，每项最多12000字');
  if(!this.available())throw draftError('数据库尚未升级，不能保存流程设置');
  const r=this.db.prepare('UPDATE assistant_policy SET revision=revision+1,payload=? WHERE id=1 AND revision=?').run(JSON.stringify(v),revision);if(r.changes!==1)throw draftError('流程设置已改变');this.cleanup();return this.state();
 }
 cleanup(){if(!this.available())return 0;const days=this.state().values.retentionDays;this.cleanupMedia();if(!days)return 0;const cutoff=new Date(Number(this.app.now())-days*86400000).toISOString();return Number(this.db.prepare('DELETE FROM order_assistant_ai_cache WHERE COALESCE(accessed_at,created_at)<?').run(cutoff).changes);}
 cleanupMedia(){const days=this.state().values.mediaRetentionDays,cutoff=Number(this.app.now())-days*86400000,rows=[];for(const table of ['order_chat_messages','assistant_chat_archive'])for(const r of this.db.prepare(`SELECT rowid id,sent_at,metadata FROM ${table} WHERE metadata LIKE '%dataUrl%'`).all()){const m=JSON.parse(r.metadata||'{}');rows.push({table,id:r.id,m,at:Date.parse(m.mediaCachedAt||r.sent_at)});}rows.sort((a,b)=>b.at-a.at);let bytes=0;for(const r of rows){let changed=false;for(const m of r.m.media||[]){if(m.status!=='cached')continue;const size=Buffer.byteLength(m.dataUrl||'');if((days&&r.at<cutoff)||bytes+size>100*1024*1024){delete m.dataUrl;m.status='unavailable';m.note='图片缓存已清理，请在WhatsApp查看原图。';changed=true;}else bytes+=size;}if(changed)this.db.prepare(`UPDATE ${r.table} SET metadata=? WHERE rowid=?`).run(JSON.stringify(r.m),r.id);}}

 workflow(orderId){return this.records.workflow(this.state(),orderId,requirementLabels);}
}
