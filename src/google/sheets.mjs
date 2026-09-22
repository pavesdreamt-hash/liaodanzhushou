import {google} from 'googleapis';
import {AppError} from '../core/errors.mjs';
export const SHEETS_SCOPE='https://www.googleapis.com/auth/spreadsheets';
export async function withGoogleDeadline(promise,timeoutMs,stage){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new AppError(`Google连接超过${Math.ceil(timeoutMs/1000)}秒，已停止等待，请检查网络代理后重试`,{stage,code:'GOOGLE_TIMEOUT'})),timeoutMs);})]);}finally{clearTimeout(timer);}}
export class SheetsClient {
  constructor(authProvider,{authTimeoutMs=15_000,requestTimeoutMs=20_000,apiFactory=auth=>google.sheets({version:'v4',auth})}={}){this.authProvider=authProvider;this.authTimeoutMs=authTimeoutMs;this.requestTimeoutMs=requestTimeoutMs;this.apiFactory=apiFactory;}
  async api(){const auth=await this.authProvider.authClient();await withGoogleDeadline(auth.getAccessToken(),this.authTimeoutMs,'Google令牌刷新');return this.apiFactory(auth);}
  async metadata(spreadsheetId){try{return (await (await this.api()).spreadsheets.get({spreadsheetId,includeGridData:false,
    fields:'spreadsheetId,properties(title,locale,timeZone),sheets(properties(sheetId,title,index,sheetType,gridProperties),basicFilter,merges)'},{timeout:this.requestTimeoutMs})).data;}catch(e){throw this.wrap(e,'读取Google表格');}}
  async batchGet(spreadsheetId,ranges){try{return (await (await this.api()).spreadsheets.values.batchGet({spreadsheetId,ranges,valueRenderOption:'FORMATTED_VALUE',dateTimeRenderOption:'FORMATTED_STRING',majorDimension:'ROWS'},{timeout:this.requestTimeoutMs})).data.valueRanges||[];}catch(e){throw this.wrap(e,'读取Google数据');}}
  async batchUpdate(spreadsheetId,requests){try{return (await (await this.api()).spreadsheets.batchUpdate({spreadsheetId,requestBody:{requests},includeSpreadsheetInResponse:false},{timeout:this.requestTimeoutMs})).data;}catch(e){throw this.wrap(e,'写入Google表格');}}
  async valuesUpdate(spreadsheetId,range,values){try{return (await (await this.api()).spreadsheets.values.update({spreadsheetId,range,valueInputOption:'RAW',requestBody:{majorDimension:'ROWS',values}},{timeout:this.requestTimeoutMs})).data;}catch(e){throw this.wrap(e,'写入Google测试数据');}}
  async valuesGet(spreadsheetId,range){try{return (await (await this.api()).spreadsheets.values.get({spreadsheetId,range,valueRenderOption:'FORMATTED_VALUE'},{timeout:this.requestTimeoutMs})).data.values||[];}catch(e){throw this.wrap(e,'回读Google测试数据');}}
  wrap(error,stage){const status=error?.response?.status||error?.code,reason=error?.response?.data?.error||error?.cause?.response?.data?.error||'',message=String(error?.message||error||'');
    if(reason==='invalid_grant'||/\binvalid_grant\b/i.test(message)){this.authProvider.markAuthorizationInvalid?.();return new AppError('Google授权已过期或被撤销，请点击“重新连接”。这不是VPN TUN设置造成的；如果大约每7天发生一次，请检查Google OAuth应用是否仍处于“测试”状态。',{stage,code:'GOOGLE_AUTH_EXPIRED'});}
    if(status===401){this.authProvider.markAuthorizationInvalid?.();return new AppError('Google授权已失效，请重新连接',{stage,code:'GOOGLE_AUTH_EXPIRED'});}
    if(status===403)return new AppError('Google Sheets权限不足或API配置有误',{stage,code:'GOOGLE_FORBIDDEN'});if(status===404)return new AppError('没有找到目标Google Sheet',{stage,code:'GOOGLE_NOT_FOUND'});
    if(error instanceof AppError)return error;if(['ETIMEDOUT','ECONNABORTED'].includes(status)||/timed?\s*out/i.test(String(error?.message||'')))return new AppError(`${stage}超时，已停止等待，请检查网络代理后重试`,{stage,code:'GOOGLE_TIMEOUT'});
    return new AppError(`${stage}失败：${String(error?.message||error).replace(/Bearer\s+\S+/gi,'Bearer [已隐藏]').slice(0,800)}`,{stage,code:'GOOGLE_API_FAILED'});}
}
