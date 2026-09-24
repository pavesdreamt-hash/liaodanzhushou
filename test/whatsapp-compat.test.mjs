import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {patchReadCompatibility} from '../scripts/whatsapp-compat.mjs';

test('reviewed compatibility reads renamed native message keys without querying IndexedDB with undefined',async()=>{
 const source=await readFile(new URL('../node_modules/whatsapp-web.js/src/util/Injected/Utils.js',import.meta.url),'utf8');
 const queries=[],window={require(name){if(name==='WALinkify')return {findLinks:()=>[]};if(name==='WAWebCollections')return {Msg:{get:id=>{assert.equal(typeof id,'string');queries.push(id);return null;},getMessagesById:async ids=>{assert.ok(ids.every(id=>typeof id==='string'));queries.push(...ids);return {messages:[]};}}};throw Error('Unexpected module '+name);}};
 const context=vm.createContext({window,exports:{}});vm.runInContext(patchReadCompatibility(source),context);context.exports.LoadUtils();
 const api=window.WWebJS,id='false_15550000002@c.us_fictional';
 assert.equal(api.getMsgKeyId({_serialized:'old',$1:'new'}),'old');assert.equal(api.getMsgKeyId({$1:id}),id);
 const model=api.getMessageModel({body:'Fictional',serialize:()=>({id:{$1:id,remote:'15550000002@c.us'}})});assert.equal(model.id._serialized,id);
 const chat={serialize:()=>({msgs:[{}]}),lastReceivedKey:{$1:id}};await api.getChatModel(chat);assert.deepEqual(queries,[id,id]);
 queries.length=0;chat.lastReceivedKey={};await api.getChatModel(chat);assert.deepEqual(queries,[]);
 const patched=patchReadCompatibility(source);assert.match(patched,/delete message\.__x_id;/);assert.ok(patched.indexOf('delete message.__x_id;')<patched.indexOf("Bot's won't reply if canonicalUrl is set"));assert.match(patched,/Msg\.get\(window\.WWebJS\.getMsgKeyId\(newMsgKey\)\)/);
 assert.equal(patchReadCompatibility(patchReadCompatibility(source)),patchReadCompatibility(source));
 assert.throws(()=>patchReadCompatibility('unreviewed version'),/source changed/);
});
