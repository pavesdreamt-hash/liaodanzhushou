import test from 'node:test';
import assert from 'node:assert/strict';
import {parseOAuthCallback,exchangeAuthorizationCode} from '../src/google/oauth-flow.mjs';
import {proxyUrlFromDirective} from '../src/core/network.mjs';

test('OAuth callback解析与state校验',()=>{
  assert.equal(parseOAuthCallback('http://127.0.0.1:4567/oauth2callback?state=expected&code=one-time','expected'),'one-time');
  assert.throws(()=>parseOAuthCallback('http://127.0.0.1:4567/oauth2callback?state=wrong&code=x','expected'),error=>error.code==='GOOGLE_STATE_MISMATCH');
  assert.throws(()=>parseOAuthCallback('http://127.0.0.1:4567/oauth2callback?state=expected&error=access_denied','expected'),error=>error.code==='GOOGLE_ACCESS_DENIED');
});

test('macOS代理解析优先使用HTTP CONNECT代理',()=>{
  assert.equal(proxyUrlFromDirective('PROXY 127.0.0.1:10808; SOCKS 127.0.0.1:10808; DIRECT'),'http://127.0.0.1:10808');
  assert.equal(proxyUrlFromDirective('DIRECT'),null);
});

test('token exchange 200会验证令牌并复用已有refresh token',async()=>{
  const client={getToken:async()=>({tokens:{access_token:'access'}})};const result=await exchangeAuthorizationCode({client,code:'code',codeVerifier:'verifier',existingRefreshToken:'refresh',timeoutMs:100});
  assert.deepEqual(result.tokens,{access_token:'access',refresh_token:'refresh'});assert.equal(result.hasNewRefreshToken,false);
});

for(const [reason,code] of [['invalid_grant','GOOGLE_INVALID_GRANT'],['invalid_client','GOOGLE_INVALID_CLIENT']])test(`token exchange 400 ${reason}会给出明确错误`,async()=>{
  const client={getToken:async()=>{const error=new Error('bad request');error.response={data:{error:reason,error_description:`${reason} detail`}};throw error;}};
  await assert.rejects(exchangeAuthorizationCode({client,code:'code',codeVerifier:'verifier',timeoutMs:100}),error=>error.code===code);
});

test('token exchange网络错误与超时均不会无限loading',async()=>{
  const network={getToken:async()=>{const error=new Error('socket unavailable');error.code='ENETUNREACH';throw error;}};
  await assert.rejects(exchangeAuthorizationCode({client:network,code:'code',codeVerifier:'verifier',timeoutMs:100}),error=>error.code==='GOOGLE_TOKEN_EXCHANGE_FAILED');
  const hanging={getToken:()=>new Promise(()=>{})};const started=Date.now();await assert.rejects(exchangeAuthorizationCode({client:hanging,code:'code',codeVerifier:'verifier',timeoutMs:20}),error=>error.code==='GOOGLE_TOKEN_TIMEOUT');assert.ok(Date.now()-started<200);
});
