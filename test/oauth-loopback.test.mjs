import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises';
import {DesktopOAuth} from '../src/google/oauth.mjs';

const safeStorage={
  isEncryptionAvailable:()=>true,
  encryptString:value=>Buffer.from(`encrypted:${value}`),
  decryptString:value=>value.toString().replace(/^encrypted:/,'')
};

async function fixture({openCallback=true,timeoutMs=500,storedRefreshToken=null,issuedTokens={access_token:'test-access',refresh_token:'test-refresh'}}={}){
  const base=await mkdtemp(path.join(os.tmpdir(),'kdocs-oauth-loopback-')),state=path.join(base,'state');await mkdir(state);
  await writeFile(path.join(base,'google-oauth.json'),JSON.stringify({installed:{client_id:'desktop.apps.googleusercontent.com',client_secret:'desktop-secret'}}));
  if(storedRefreshToken)await writeFile(path.join(state,'google-refresh-token.enc'),Buffer.from(`encrypted:${storedRefreshToken}`).toString('base64')+'\n');
  const statuses=[];let redirectUsed='',authOptions=null,loadedStoredToken=false;
  const oauthClientFactory=(_id,_secret,redirect)=>({
    credentials:{},on:()=>{},setCredentials(tokens){this.credentials=tokens;if(tokens.refresh_token===storedRefreshToken)loadedStoredToken=true;},
    async generateCodeVerifierAsync(){return {codeVerifier:'verifier-value',codeChallenge:'challenge-value'};},
    generateAuthUrl(options){authOptions=options;redirectUsed=redirect;const url=new URL('https://accounts.google.test/o/oauth2/v2/auth');url.searchParams.set('redirect_uri',redirect);url.searchParams.set('state',options.state);url.searchParams.set('code_challenge',options.code_challenge);url.searchParams.set('code_challenge_method',options.code_challenge_method);return url.toString();},
    async getToken({code,codeVerifier}){assert.equal(code,'local-code');assert.equal(codeVerifier,'verifier-value');return {tokens:issuedTokens};}
  });
  const shell={async openExternal(authUrl){if(openCallback){const auth=new URL(authUrl),callback=new URL(auth.searchParams.get('redirect_uri'));callback.searchParams.set('state',auth.searchParams.get('state'));callback.searchParams.set('code','local-code');setTimeout(()=>fetch(callback).catch(()=>{}),5);}}};
  const oauth=new DesktopOAuth({paths:{base,state},safeStorage,shell,timeoutMs,oauthClientFactory,onStatus:value=>statuses.push(value)});
  return {oauth,statuses,getRedirect:()=>redirectUsed,getAuthOptions:()=>authOptions,wasStoredTokenLoaded:()=>loadedStoredToken,state};
}

test('Desktop OAuth使用127.0.0.1随机端口、PKCE并完成本地回调和令牌保存',async()=>{
  const value=await fixture(),result=await value.oauth.connect();assert.equal(result.connected,true);
  const redirect=new URL(value.getRedirect());assert.equal(redirect.hostname,'127.0.0.1');assert.ok(Number(redirect.port)>0);assert.equal(redirect.pathname,'/oauth2callback');
  assert.equal(value.getAuthOptions().access_type,'offline');assert.equal(value.getAuthOptions().prompt,'consent');assert.equal(value.getAuthOptions().code_challenge_method,'S256');assert.ok(value.getAuthOptions().code_challenge);
  assert.deepEqual(value.statuses.map(item=>item.event),['oauth-started','oauth-browser-opened','oauth-callback-received','oauth-state-verified','oauth-authorization-code-received','oauth-token-exchange-started','oauth-token-success']);
  assert.ok((await readFile(path.join(value.state,'google-refresh-token.enc'),'utf8')).trim().length>10);
});

test('Desktop OAuth未收到本地回调时会在限定时间内明确失败',async()=>{
  const value=await fixture({openCallback:false,timeoutMs:30});await assert.rejects(value.oauth.connect(),error=>error.code==='GOOGLE_OAUTH_TIMEOUT');
  assert.equal(value.statuses.at(-1).event,'oauth-error');assert.equal(value.statuses.at(-1).metrics.code,'GOOGLE_OAUTH_TIMEOUT');
});

test('Desktop OAuth能从safeStorage恢复refresh token且不需要重新授权',async()=>{
  const value=await fixture();await writeFile(path.join(value.state,'google-refresh-token.enc'),Buffer.from('encrypted:saved-refresh').toString('base64')+'\n');
  const client=await value.oauth.authClient();assert.equal(client.credentials.refresh_token,'saved-refresh');
});

test('用户重新连接时不加载已经失效的refresh token',async()=>{
  const value=await fixture({storedRefreshToken:'expired-refresh'});value.oauth.markAuthorizationInvalid();assert.deepEqual(await value.oauth.status(),{configured:true,connected:false,needsReconnect:true});await value.oauth.connect();
  assert.equal(value.wasStoredTokenLoaded(),false);assert.equal(value.statuses.find(item=>item.event==='oauth-token-success').metrics.hasNewRefreshToken,true);
  assert.deepEqual(await value.oauth.status(),{configured:true,connected:true,needsReconnect:false});
});

test('Google未签发新refresh token时拒绝伪成功且保留原令牌文件',async()=>{
  const value=await fixture({storedRefreshToken:'expired-refresh',issuedTokens:{access_token:'short-lived-access'}}),tokenFile=path.join(value.state,'google-refresh-token.enc'),before=await readFile(tokenFile,'utf8');
  await assert.rejects(value.oauth.connect(),error=>error.code==='GOOGLE_REFRESH_TOKEN_MISSING');assert.equal(await readFile(tokenFile,'utf8'),before);assert.equal(value.wasStoredTokenLoaded(),false);
});
