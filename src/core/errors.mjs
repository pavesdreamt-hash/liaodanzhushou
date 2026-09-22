export class AppError extends Error {
  constructor(message,{stage='未知阶段',code='APP_ERROR',details}={}){super(message);this.name='AppError';this.stage=stage;this.code=code;this.details=details;}
}
export const appError=(error,stage,code='APP_ERROR')=>error instanceof AppError?error:new AppError(String(error?.message||error||'未知错误'),{stage,code});
export function publicError(error){
  const text=String(error?.message||error||'未知错误').replace(/Bearer\s+[^\s"<>]+/gi,'Bearer [已隐藏]')
    .replace(/ya29\.[A-Za-z0-9._~-]+/g,'[已隐藏]')
    .replace(/((?:access_token|refresh_token|id_token|client_secret|cookie)\s*[=:]\s*)[^\s&"<>]+/gi,'$1[已隐藏]');
  return {message:text.slice(0,1800),stage:error?.stage||'未知阶段',code:error?.code||'APP_ERROR'};
}
