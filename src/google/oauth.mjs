import http from 'node:http';
import {randomBytes} from 'node:crypto';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {google} from 'googleapis';
import {atomicWrite,readJSON} from '../core/files.mjs';
import {AppError,publicError} from '../core/errors.mjs';
import {SHEETS_SCOPE} from './sheets.mjs';
import {parseOAuthCallback,exchangeAuthorizationCode} from './oauth-flow.mjs';
const CALLBACK_HTML='<!doctype html><meta charset="utf-8"><title>授权成功</title><style>body{font:18px -apple-system;padding:40px;max-width:600px;margin:auto}h1{color:#137333}</style><h1>授权成功</h1><p>您可以关闭此页面并返回“聊单助手”。</p>';
function credentials(value){
  const c=value?.installed;if(!c||typeof c.client_id!=='string'||typeof c.client_secret!=='string'||!c.client_id.endsWith('.apps.googleusercontent.com'))
    throw new AppError('请选择Google Desktop app类型的OAuth JSON',{stage:'Google授权',code:'DESKTOP_OAUTH_INVALID'});
  return {clientId:c.client_id,clientSecret:c.client_secret};
}
export class DesktopOAuth {
  constructor({paths,safeStorage,shell,log=()=>{},onStatus=()=>{},timeoutMs=120_000,tokenTimeoutMs=30_000,proxy=null,oauthClientFactory}={}){this.paths=paths;this.safeStorage=safeStorage;this.shell=shell;this.log=log;this.onStatus=onStatus;this.timeoutMs=timeoutMs;this.tokenTimeoutMs=tokenTimeoutMs;this.proxy=proxy;
    this.oauthClientFactory=oauthClientFactory||((clientId,clientSecret,redirectUri)=>new google.auth.OAuth2({clientId,clientSecret,redirectUri,transporterOptions:{timeout:this.tokenTimeoutMs,...(this.proxy?{proxy:this.proxy}:{})}}));
    this.credentialFile=path.join(paths.base,'google-oauth.json');this.tokenFile=path.join(paths.state,'google-refresh-token.enc');this.client=null;this.authorizationInvalid=false;}
  reportStatus(event,message,metrics={}){const value={event,message,metrics,at:new Date().toISOString()};try{this.onStatus(value);}catch{}return value;}
  async ensureBundledConfiguration(resourceFile){
    if(await this.configured())return {configured:true,copied:false,path:this.credentialFile};
    let raw;try{raw=await readFile(resourceFile,'utf8');credentials(JSON.parse(raw));}catch(error){throw new AppError(`应用内置OAuth配置不可用：${error.message}`,{stage:'Google授权',code:'BUNDLED_OAUTH_MISSING'});}
    await atomicWrite(this.credentialFile,raw,{mode:0o600});this.client=null;return {configured:true,copied:true,path:this.credentialFile};
  }
  async configured(){try{credentials(await readJSON(this.credentialFile));return true;}catch{return false;}}
  async tokenStored(){try{return (await readFile(this.tokenFile,'utf8')).trim().length>10;}catch{return false;}}
  async createClient(redirectUri='http://127.0.0.1',{loadStoredToken=true}={}){
    const {clientId,clientSecret}=credentials(await readJSON(this.credentialFile));const client=this.oauthClientFactory(clientId,clientSecret,redirectUri);
    if(loadStoredToken&&await this.tokenStored()){
      if(!this.safeStorage.isEncryptionAvailable())throw new AppError('系统安全存储当前不可用，不能解密Google授权',{stage:'Google授权',code:'SAFE_STORAGE_UNAVAILABLE'});
      try{const encrypted=Buffer.from((await readFile(this.tokenFile,'utf8')).trim(),'base64'),refresh_token=this.safeStorage.decryptString(encrypted);client.setCredentials({refresh_token});}
      catch{throw new AppError('Google授权安全存储无法解密，请重新连接',{stage:'Google授权',code:'TOKEN_DECRYPT_FAILED'});}
    }
    client.on('tokens',tokens=>{if(tokens.refresh_token)this.saveRefreshToken(tokens.refresh_token).catch(error=>this.log('Google授权','保存refresh token失败',{error:publicError(error)}));});
    return client;
  }
  async saveRefreshToken(value){
    if(!value)return;if(!this.safeStorage.isEncryptionAvailable())throw new AppError('系统安全存储不可用，拒绝明文保存Google令牌',{stage:'Google授权',code:'SAFE_STORAGE_UNAVAILABLE'});
    const encrypted=this.safeStorage.encryptString(value);await atomicWrite(this.tokenFile,encrypted.toString('base64')+'\n');
  }
  async status(){const configured=await this.configured(),stored=configured&&await this.tokenStored();return {configured,connected:stored&&!this.authorizationInvalid,needsReconnect:stored&&this.authorizationInvalid};}
  markAuthorizationInvalid(){this.client=null;this.authorizationInvalid=true;}
  async authClient(){if(!this.client)this.client=await this.createClient();if(!this.client.credentials.refresh_token)throw new AppError('尚未连接Google Sheets',{stage:'Google授权',code:'GOOGLE_NOT_CONNECTED'});return this.client;}
  async connect(){
    if(!await this.configured())throw new AppError('OAuth配置缺失，请重新安装完整应用',{stage:'Google授权',code:'DESKTOP_OAUTH_REQUIRED'});
    const state=randomBytes(24).toString('hex');let resolveCode,rejectCode,settled=false;
    const settle=(method,value)=>{if(settled)return;settled=true;method(value);};
    const codePromise=new Promise((resolve,reject)=>{resolveCode=resolve;rejectCode=reject;});
    const server=http.createServer((request,response)=>{
      try{const url=new URL(request.url,'http://127.0.0.1');if(url.pathname==='/favicon.ico'){response.writeHead(204);return response.end();}if(url.pathname!=='/oauth2callback'){response.writeHead(404);return response.end('Not found');}
        this.reportStatus('oauth-callback-received','已收到Google本地回调',{hasState:url.searchParams.has('state'),hasCode:url.searchParams.has('code'),hasError:url.searchParams.has('error')});
        const code=parseOAuthCallback(url,state);this.reportStatus('oauth-state-verified','OAuth安全校验通过');
        this.reportStatus('oauth-authorization-code-received','已收到Google授权码');response.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});response.end(CALLBACK_HTML);settle(resolveCode,code);
      }catch(error){response.writeHead(400,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});response.end('<!doctype html><meta charset="utf-8"><h1>授权失败</h1><p>请返回“聊单助手”查看具体原因。</p>');settle(rejectCode,error);}
    });
    try{await new Promise((resolve,reject)=>{const onError=error=>{server.off('listening',onListening);reject(error);},onListening=()=>{server.off('error',onError);resolve();};server.once('error',onError);server.once('listening',onListening);server.listen(0,'127.0.0.1');});}
    catch(error){this.reportStatus('oauth-error','本地OAuth回调监听器启动失败',{code:'GOOGLE_LISTENER_FAILED'});throw new AppError(`无法启动Google授权回调：${error.message}`,{stage:'Google授权',code:'GOOGLE_LISTENER_FAILED'});}
    const address=server.address(),port=typeof address==='object'&&address?address.port:0,redirect=`http://127.0.0.1:${port}/oauth2callback`;
    this.reportStatus('oauth-started','OAuth本地回调监听器已启动',{host:'127.0.0.1',port});
    let timer;
    try{
      // A user-initiated reconnect must obtain a fresh refresh token. Loading the
      // stored token here can make a new access token look healthy for an hour
      // while silently retaining the revoked/expired refresh token underneath.
      const client=await this.createClient(redirect,{loadStoredToken:false}),{codeVerifier,codeChallenge}=await client.generateCodeVerifierAsync();
      const url=client.generateAuthUrl({access_type:'offline',scope:[SHEETS_SCOPE],prompt:'consent',state,code_challenge:codeChallenge,code_challenge_method:'S256'});
      await this.shell.openExternal(url);this.reportStatus('oauth-browser-opened','Google授权页面已打开');
      const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new AppError('Google授权超时：没有收到本地回调。请重新点击“连接并测试”',{stage:'Google授权',code:'GOOGLE_OAUTH_TIMEOUT'})),this.timeoutMs);});const code=await Promise.race([codePromise,timeout]);
      this.reportStatus('oauth-token-exchange-started','正在换取Google访问令牌',{network:this.proxy?'system-proxy':'direct'});
      const {tokens,hasNewRefreshToken}=await exchangeAuthorizationCode({client,code,codeVerifier,timeoutMs:this.tokenTimeoutMs});
      await this.saveRefreshToken(tokens.refresh_token);client.setCredentials(tokens);this.client=client;this.authorizationInvalid=false;this.reportStatus('oauth-token-success','Google令牌交换成功',{hasAccessToken:true,hasRefreshToken:true,hasNewRefreshToken});return {connected:true};
    }catch(error){const safe=error instanceof AppError?error:new AppError(`Google授权失败：${error.message}`,{stage:'Google授权',code:'GOOGLE_OAUTH_FAILED'});this.reportStatus('oauth-error',safe.message,{code:safe.code});throw safe;}
    finally{clearTimeout(timer);if(server.listening)server.close();server.closeIdleConnections?.();const force=setTimeout(()=>server.closeAllConnections?.(),250);force.unref?.();}
  }
}
