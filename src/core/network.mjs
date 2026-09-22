export function proxyUrlFromDirective(value=''){
  for(const item of String(value).split(';').map(part=>part.trim()).filter(Boolean)){
    const [kind,target]=item.split(/\s+/,2);if(!target)continue;
    if(kind==='PROXY'||kind==='HTTPS')return `http://${target}`;
    if(kind==='SOCKS'||kind==='SOCKS5')return `socks5://${target}`;
  }
  return null;
}

export async function configureGoogleNetwork(electronSession){
  const directive=await electronSession.resolveProxy('https://oauth2.googleapis.com/token'),proxy=proxyUrlFromDirective(directive);
  if(proxy?.startsWith('http')){
    process.env.HTTPS_PROXY=proxy;process.env.HTTP_PROXY=proxy;process.env.https_proxy=proxy;process.env.http_proxy=proxy;
    const exclusions=new Set(String(process.env.NO_PROXY||'').split(',').map(v=>v.trim()).filter(Boolean));for(const value of ['127.0.0.1','localhost','::1'])exclusions.add(value);process.env.NO_PROXY=[...exclusions].join(',');
  }
  return {directive,proxy:proxy?.startsWith('http')?proxy:null,mode:proxy?.startsWith('http')?'proxy':'direct'};
}
