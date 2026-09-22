import test from 'node:test';
import assert from 'node:assert/strict';
import {SheetsClient,withGoogleDeadline} from '../src/google/sheets.mjs';

test('Google令牌刷新超时会在限定时间内结束',async()=>{
  const started=Date.now();await assert.rejects(withGoogleDeadline(new Promise(()=>{}),20,'Google令牌刷新'),error=>error.code==='GOOGLE_TIMEOUT');assert.ok(Date.now()-started<200);
});

test('SheetsClient不会在refresh token网络请求上无限等待',async()=>{
  const authProvider={authClient:async()=>({getAccessToken:()=>new Promise(()=>{})})};const client=new SheetsClient(authProvider,{authTimeoutMs:20,apiFactory:()=>{throw new Error('不应创建API');}});
  await assert.rejects(client.metadata('sheet'),error=>error.code==='GOOGLE_TIMEOUT');
});

test('invalid_grant明确标记为授权失效且不误导用户开启TUN',async()=>{
  let invalidated=false;const error=new Error('invalid_grant');error.response={status:400,data:{error:'invalid_grant'}};
  const authProvider={markAuthorizationInvalid:()=>{invalidated=true;},authClient:async()=>({getAccessToken:async()=>{throw error;}})};
  const client=new SheetsClient(authProvider,{apiFactory:()=>{throw new Error('不应创建API');}});
  await assert.rejects(client.metadata('sheet'),value=>value.code==='GOOGLE_AUTH_EXPIRED'&&value.message.includes('不是VPN TUN'));
  assert.equal(invalidated,true);
});
