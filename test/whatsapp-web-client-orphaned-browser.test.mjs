import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {WhatsAppWebClient} from '../src/orders/whatsapp-web-client.mjs';

test('orphaned browser using the app WhatsApp profile is reclaimed before a reconnect',async t=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'wweb-orphaned-profile-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 let orphaned=true,initialized=false;const terminated=[];const browser=new EventEmitter();browser.initialize=async()=>{initialized=true;};browser.destroy=async()=>{};
 const client=new WhatsAppWebClient({userDataPath:directory,clientFactory:async()=>{assert.equal(orphaned,false);return browser;},staleBrowserScanner:async()=>orphaned?[{pid:4312,ppid:1,command:'Google Chrome --user-data-dir=app-profile'}]:[],processTerminator:async pid=>{terminated.push(pid);orphaned=false;},wait:async()=>{}});
 await client.open();await client.connecting;
 assert.deepEqual(terminated,[4312]);assert.equal(initialized,true);
 await client.close();
});
