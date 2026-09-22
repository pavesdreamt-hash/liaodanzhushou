import path from 'node:path';
import {access} from 'node:fs/promises';

export function chromeCandidates({platform=process.platform,env=process.env,explicitPath=null}={}){
 if(explicitPath)return [explicitPath];
 if(platform==='darwin')return ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
 if(platform==='win32')return [...new Set([env.LOCALAPPDATA,env.ProgramW6432||env.ProgramFiles,env['ProgramFiles(x86)']].filter(Boolean).map(root=>path.win32.join(root,'Google','Chrome','Application','chrome.exe')))];
 return ['/usr/bin/google-chrome','/usr/bin/google-chrome-stable'];
}
export async function findChrome(options={},exists=async file=>{try{await access(file);return true;}catch{return false;}}){
 for(const candidate of chromeCandidates(options))if(await exists(candidate))return candidate;
 return null;
}
