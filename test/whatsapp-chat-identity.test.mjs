import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {WhatsAppWebClient} from '../src/orders/whatsapp-web-client.mjs';
import {ManualChat} from '../src/manual-chat.mjs';

const selected='971500000002';
const other='971500000003';
const lid='123456789012345@lid';

function clientFor(remote,mapping){
 const client=new WhatsAppWebClient({userDataPath:'/tmp/fictional-chat-identity'});
 client.state={status:'online'};
 client.accountId='wa-phone:971500000001';
 client.inboxRemotes.set(selected,remote);
 client.client={getChatById:async()=>({id:{_serialized:remote}}),getContactLidAndPhone:async()=>mapping};
 return client;
}

test('a selected phone opens normally when WhatsApp confirms the same LID mapping',async()=>{
 const client=clientFor(lid,[{lid,pn:`${selected}@c.us`}]);
 const opened=await client.openInbox({chatId:`wa-phone:${selected}`});
 assert.equal(opened.chatId,`wa-phone:${selected}`);
 assert.equal(opened.identityVerified,true);
});

test('a conflicting LID mapping stops before message history is read',async()=>{
 const client=clientFor(lid,[{lid,pn:`${other}@c.us`}]);
 await assert.rejects(client.openInbox({chatId:`wa-phone:${selected}`}),/会话号码与所选号码不一致/);
});

test('a stale list mapping does not block a phone chat that WhatsApp directly verifies',async()=>{
 const client=clientFor(lid,[{lid,pn:`${other}@c.us`}]);
 client.client.getChatById=async id=>({id:{_serialized:id===`${selected}@c.us`?`${selected}@c.us`:lid}});
 const opened=await client.openInbox({chatId:`wa-phone:${selected}`});
 assert.equal(opened.binding.nativeRemote,`${selected}@c.us`);
 assert.equal(opened.identityVerified,true);
});

test('a temporary missing LID mapping does not block the selected chat',async()=>{
 const client=clientFor(lid,[]);
 const opened=await client.openInbox({chatId:`wa-phone:${selected}`});
 assert.equal(opened.chatId,`wa-phone:${selected}`);
 assert.equal(opened.identityVerified,false);
});

test('a native phone chat belonging to another number is blocked',async()=>{
 const client=clientFor(`${other}@c.us`,[]);
 await assert.rejects(client.openInbox({chatId:`wa-phone:${selected}`}),/会话号码与所选号码不一致/);
});

test('the chat service refuses a conflicting resolved chat before reading or saving messages',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'fictional-chat-identity-'));let reads=0;
 try{
  const chat=new ManualChat({directory,adapter:{openInbox:async()=>({accountId:'wa-phone:971500000001',chatId:`wa-phone:${other}`}),recent:async()=>{reads++;return {messages:[],hasMore:false};}}});
  await assert.rejects(chat.openInbox({chatId:`wa-phone:${selected}`}),/实际打开的会话与所选号码不一致/);
  assert.equal(reads,0);
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('inbox paginates visible and hidden conversations separately',async()=>{
 const client=clientFor(`${selected}@c.us`,[]);
 const chat=phone=>({id:{_serialized:`${phone}@c.us`},timestamp:1790244000,lastMessage:{timestamp:1790244000,body:'Actual message',fromMe:false,type:'chat'},unreadCount:0,getContact:async()=>({pushname:'Fixture'})});
 client.client.getChats=async()=>[chat(selected),chat(other)];
 const hiddenChatIds=[`wa-phone:${selected}`];
 const visible=await client.inbox({hiddenChatIds,limit:1});
 const hidden=await client.inbox({hiddenChatIds,hiddenOnly:true,limit:1});
 assert.deepEqual(visible.items.map(item=>item.chatId),[`wa-phone:${other}`]);
 assert.deepEqual(hidden.items.map(item=>item.chatId),[`wa-phone:${selected}`]);
 assert.equal(visible.total,1);assert.equal(hidden.total,1);
});
