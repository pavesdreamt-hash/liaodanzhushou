import test from 'node:test';
import assert from 'node:assert/strict';
import {WhatsAppWebClient} from '../src/orders/whatsapp-web-client.mjs';
const remote='971500000002@c.us';
const target={accountId:'wa-phone:971500000001',chatId:'wa-phone:971500000002',aliases:new Set([remote])};
const make=(type,extra={})=>({id:{_serialized:`false_${remote}_fixture`,remote},timestamp:1789990804,fromMe:false,type,body:'',...extra});
test('real observed notification schema is rendered as a notice even with stale media cache',async()=>{
 const adapter=new WhatsAppWebClient({userDataPath:'/tmp/unused-notice-fixture'});
 const msg=make('notification_template',{_data:{subtype:'biz_account_type_changed_to_hosted'},hasMedia:false});
 adapter.mediaCache.set(msg.id._serialized,{type:'image',status:'cached',dataUrl:'data:image/png;base64,eA=='});
 const row=adapter.normalize(msg,target);
 assert.equal(row.text,'WhatsApp 商业账号类型已变更。');assert.deepEqual(row.metadata.media,[]);
 assert.equal(row.id,msg.id._serialized);assert.equal(row.sentAt,new Date(msg.timestamp*1000).toISOString());assert.equal(row.direction,'customer');
 let calls=0;msg.downloadMedia=async()=>{calls++;};
 assert.equal(await adapter.downloadImage(msg,target,0,{manual:true}),null);assert.equal(calls,0);
});
test('unknown notification subtype is neutral, actual notification body retained, revoked content not exposed',()=>{
 const a=new WhatsAppWebClient({userDataPath:'/tmp/unused-notice-fixture'});
 assert.equal(a.normalize(make('notification_template',{_data:{subtype:'future_subtype'}}),target).text,'WhatsApp 系统通知。');
 assert.equal(a.normalize(make('notification_template',{body:'Original notice'}),target).text,'Original notice');
 const revoked=a.normalize(make('revoked',{body:'Old removed content',hasMedia:true}),target);
 assert.equal(revoked.text,'此消息已撤回。');assert.deepEqual(revoked.metadata.media,[]);
 assert.equal(a.normalize(make('image',{hasMedia:true}),target).metadata.media[0].type,'image');
 const encrypted=a.normalize(make('e2e_notification',{_data:{subtype:'encrypt'},hasMedia:false}),target);assert.equal(encrypted.text,'WhatsApp 加密通知。');assert.deepEqual(encrypted.metadata.media,[]);
});
