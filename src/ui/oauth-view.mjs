export function oauthView(value={}){
  const event=value.event||'',message=value.message||'';
  if(event==='oauth-error')return {stage:'Google授权',message,connected:false,error:{stage:'Google授权',code:value.metrics?.code||'GOOGLE_OAUTH_FAILED',message},buttonText:'重新授权'};
  if(event==='oauth-sheets-test-succeeded')return {stage:'Google Sheets',message,connected:true,error:null,buttonText:'重新连接'};
  return {stage:'Google授权',message,connected:false,error:null,buttonText:null};
}
