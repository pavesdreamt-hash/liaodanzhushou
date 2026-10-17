import {AppError} from './errors.mjs';

export function externalWebUrl(value){
  const reject=()=>{throw new AppError('链接无效；只支持普通 HTTP 或 HTTPS 网页。',{stage:'打开链接',code:'INVALID_EXTERNAL_LINK'});};
  if(typeof value!=='string'||value.length>8192||/[\u0000-\u0020\u007f]/u.test(value)||!/^https?:\/\//iu.test(value))return reject();
  let url;try{url=new URL(value);}catch{return reject();}
  if(!['http:','https:'].includes(url.protocol)||!url.hostname||url.username||url.password)return reject();
  return url.href;
}
export async function openExternalWebLink(value,open){
  const url=externalWebUrl(value);
  try{await open(url);}catch(error){throw new AppError(`无法启动默认浏览器：${String(error?.message||'请检查默认浏览器设置后重试')}`,{stage:'打开链接',code:'EXTERNAL_LINK_OPEN_FAILED'});}
  return {opened:true,url};
}
