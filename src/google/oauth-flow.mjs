import {AppError} from '../core/errors.mjs';

export function parseOAuthCallback(requestUrl,expectedState){
  const url=new URL(requestUrl,'http://127.0.0.1');
  if(url.pathname!=='/oauth2callback')throw new AppError('OAuth回调路径不匹配',{stage:'Google授权',code:'GOOGLE_CALLBACK_PATH_MISMATCH'});
  const oauthError=url.searchParams.get('error');
  if(oauthError==='access_denied')throw new AppError('你取消了Google授权，可以重新授权',{stage:'Google授权',code:'GOOGLE_ACCESS_DENIED'});
  if(oauthError)throw new AppError(`Google拒绝授权：${oauthError}`,{stage:'Google授权',code:'GOOGLE_OAUTH_REJECTED'});
  if(url.searchParams.get('state')!==expectedState)throw new AppError('OAuth安全校验失败：state不一致',{stage:'Google授权',code:'GOOGLE_STATE_MISMATCH'});
  const code=url.searchParams.get('code');if(!code)throw new AppError('Google没有返回授权码',{stage:'Google授权',code:'GOOGLE_CODE_MISSING'});return code;
}

function tokenError(error){
  if(error instanceof AppError)return error;const reason=error?.response?.data?.error||error?.code||'',description=error?.response?.data?.error_description||error?.message||String(error);
  if(reason==='invalid_grant')return new AppError(`Google授权码无效或已过期：${description}`,{stage:'Google授权',code:'GOOGLE_INVALID_GRANT'});
  if(reason==='invalid_client')return new AppError(`Google OAuth客户端配置无效：${description}`,{stage:'Google授权',code:'GOOGLE_INVALID_CLIENT'});
  if(reason==='ETIMEDOUT'||reason==='ECONNABORTED'||/timed?\s*out/i.test(description))return new AppError('连接Google令牌服务超时，请检查网络代理后重试',{stage:'Google授权',code:'GOOGLE_TOKEN_TIMEOUT'});
  return new AppError(`Google令牌交换失败：${description}`,{stage:'Google授权',code:'GOOGLE_TOKEN_EXCHANGE_FAILED'});
}

export async function exchangeAuthorizationCode({client,code,codeVerifier,existingRefreshToken=null,timeoutMs=30_000}){
  let timer;try{
    const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new AppError('连接Google令牌服务超时，请检查网络代理后重试',{stage:'Google授权',code:'GOOGLE_TOKEN_TIMEOUT'})),timeoutMs);});
    const response=await Promise.race([client.getToken({code,codeVerifier}),timeout]),tokens=response?.tokens;
    if(!tokens?.access_token)throw new AppError('Google没有返回access token',{stage:'Google授权',code:'GOOGLE_ACCESS_TOKEN_MISSING'});
    const refreshToken=tokens.refresh_token||existingRefreshToken;if(!refreshToken)throw new AppError('Google没有返回refresh token，请重新授权并允许访问',{stage:'Google授权',code:'GOOGLE_REFRESH_TOKEN_MISSING'});
    return {tokens:{...tokens,refresh_token:refreshToken},hasNewRefreshToken:Boolean(tokens.refresh_token)};
  }catch(error){throw tokenError(error);}finally{clearTimeout(timer);}
}
