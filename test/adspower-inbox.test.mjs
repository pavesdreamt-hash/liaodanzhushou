import test from 'node:test';
import assert from 'node:assert/strict';
import {AdsPowerInboxScanner,AdsPowerScanSessions} from '../src/adspower-inbox.mjs';

const json=value=>({ok:true,json:async()=>value});

test('AdsPower scanner only reads open local profiles and supported Facebook or Business Suite inbox pages',async()=>{
  const requests=[],reads=[];
  const fetchImpl=async(url,options={})=>{
    const href=String(url);requests.push({href,method:options.method});
    if(href.includes('/api/v1/browser/local-active'))return json({code:0,data:{list:[
      {user_id:'profile-safe-001',debug_port:'34567'},
      {user_id:'profile-safe-002',debug_port:'34568'},
      {user_id:'profile-safe-003',debug_port:'34569'},
      {user_id:'bad profile id',debug_port:'34569'}
    ]}});
    if(href==='http://127.0.0.1:34567/json/list')return json([
      {id:'facebook-inbox',type:'page',url:'https://www.facebook.com/marketplace/inbox/',title:'Marketplace',webSocketDebuggerUrl:'ws://127.0.0.1:34567/devtools/page/fb'},
      {id:'other-site',type:'page',url:'https://example.com/',title:'Other',webSocketDebuggerUrl:'ws://127.0.0.1:34567/devtools/page/other'}
    ]);
    if(href==='http://127.0.0.1:34568/json/list')return json([{id:'facebook-home',type:'page',url:'https://www.facebook.com/',title:'Home',webSocketDebuggerUrl:'ws://127.0.0.1:34568/devtools/page/home'}]);
    if(href==='http://127.0.0.1:34569/json/list')return json([
      {id:'business-inbox',type:'page',url:'https://business.facebook.com/latest/inbox?asset_id=fictional',title:'Inbox',webSocketDebuggerUrl:'ws://127.0.0.1:34569/devtools/page/inbox'},
      {id:'business-home',type:'page',url:'https://business.facebook.com/latest/home',title:'Business home',webSocketDebuggerUrl:'ws://127.0.0.1:34569/devtools/page/home'}
    ]);
    throw new Error(`unexpected request ${href}`);
  };
  const scanner=new AdsPowerInboxScanner({fetchImpl,readPage:async(endpoint,expression)=>{reads.push({endpoint,expression});return {title:'Buyer A',fragments:['Hello, is this available?','Can you deliver today?']};},clock:()=>new Date('2026-10-02T00:00:00.000Z')});
  const result=await scanner.scan();
  assert.equal(result.profiles.length,3);
  assert.equal(result.profiles[0].status,'scanned');
  assert.deepEqual(result.profiles[0].pages[0].fragments.map(row=>row.text),['Hello, is this available?','Can you deliver today?']);
  assert.equal(result.profiles[1].status,'skipped');
  assert.equal(result.profiles[2].status,'scanned');
  assert.equal(result.profiles[2].pages.length,1,'Business Suite home must not be read as an inbox');
  assert.equal(reads.length,2);
  assert.match(reads[1].endpoint,/34569\/devtools\/page\/inbox/);
  assert.match(reads[0].expression,/querySelector/);
  assert.ok(requests.every(request=>request.method==='GET'));
  assert.ok(requests.every(request=>!request.href.includes('/browser/start')&&!request.href.includes('/browser/stop')&&!request.href.includes('/user/list')));
});

test('AdsPower scan sessions translate only just-scanned rows and expire or clear safely',async()=>{
  let now=1000,translated=[];
  const scanner={scan:async()=>({scannedAt:'2026-10-02T00:00:00.000Z',profiles:[{profileId:'profile-a',label:'AdsPower 档案 1 · ile-a',status:'scanned',detail:'',pages:[{pageId:'page-a',title:'Messenger',fragments:[{id:'one',text:'Hello'},{id:'two',text:'How much?'}]}]}],limits:{profiles:20,fragmentsPerProfile:20}})};
  const sessions=new AdsPowerScanSessions({scanner,clock:()=>now,ttlMs:50,translate:async rows=>{translated=rows;return {translations:rows.map(row=>({id:row.id,text:`中文：${row.text}`}))};}});
  const scan=await sessions.scan();
  assert.deepEqual(await sessions.translateRows({token:scan.token,messageIds:['two','one']}),{translations:[{id:'two',text:'中文：How much?'},{id:'one',text:'中文：Hello'}]});
  assert.deepEqual(translated,[{id:'two',text:'How much?'},{id:'one',text:'Hello'}]);
  await assert.rejects(sessions.translateRows({token:scan.token,messageIds:['outside']}),/不属于本次扫描/);
  sessions.clear(scan.token);
  await assert.rejects(sessions.translateRows({token:scan.token,messageIds:['one']}),/已关闭或已失效/);
  const second=await sessions.scan();now+=51;
  await assert.rejects(sessions.translateRows({token:second.token,messageIds:['one']}),/已关闭或已失效/);
});
