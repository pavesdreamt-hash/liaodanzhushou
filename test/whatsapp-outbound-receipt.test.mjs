import test from 'node:test';
import assert from 'node:assert/strict';
import {WhatsAppWebClient} from '../src/orders/whatsapp-web-client.mjs';
import {ManualChatHistory} from '../src/manual-chat-history.mjs';

const target={accountId:'wa-phone:971500000001',chatId:'wa-phone:971500000002',aliases:new Set(['971500000002@c.us'])};
const message=(ack,fromMe=true)=>({id:{_serialized:`${fromMe?'true':'false'}_971500000002@c.us_fixture-${ack}`,remote:'971500000002@c.us'},fromMe,timestamp:1_710_000_000,type:'chat',body:'Fictional receipt fixture',ack});

test('only a verified outbound WhatsApp ACK is carried to the local message metadata',()=>{
 const adapter=new WhatsAppWebClient({userDataPath:'/tmp/fictional-receipt-fixture'});
 assert.equal(adapter.normalize(message(1),target).metadata.deliveryAck,1);
 assert.equal(adapter.normalize(message(2),target).metadata.deliveryAck,2);
 assert.equal(adapter.normalize(message(3),target).metadata.deliveryAck,3);
 assert.equal(adapter.normalize(message(4),target).metadata.deliveryAck,4);
 assert.equal(adapter.normalize(message(-1),target).metadata.deliveryAck,-1);
 assert.equal(adapter.normalize(message(9),target).metadata.deliveryAck,undefined);
 assert.equal(adapter.normalize(message(3,false),target).metadata.deliveryAck,undefined,'customer messages must not carry a merchant delivery receipt');
});

test('saved outbound receipt survives a source row that omits ACK, while an explicit new ACK wins',()=>{
 const saved={id:'true_971500000002@c.us_fixture',text:'Fictional',metadata:{messageType:'chat',media:[],deliveryAck:3}};
 const missing={id:saved.id,text:'Fictional',metadata:{messageType:'chat',media:[]}};
 const delivered={id:saved.id,text:'Fictional',metadata:{messageType:'chat',media:[],deliveryAck:2}};
 assert.equal(ManualChatHistory.merge(saved,missing).metadata.deliveryAck,3);
 assert.equal(ManualChatHistory.merge(saved,delivered).metadata.deliveryAck,2);
});
