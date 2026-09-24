import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {settingsError} from '../orders/assistant-settings.mjs';
import {promptInLocalWindow} from './local-secret-window.mjs';
const run=promisify(execFile);
const allowedLabels=new Set(['DeepSeek','OpenAI / GPT','ShopPlus App Key','ShopPlus API Secret']);
export function secretPromptScript(label){
  if(!allowedLabels.has(label))throw settingsError('未知服务商');
  const shopPlus=label.startsWith('ShopPlus '),message=shopPlus?`请输入 ${label}。该内容只保存在本机加密存储中，不会显示在应用页面。`:`请输入 ${label} API 密钥。保存后自动复用，不会显示在网页中。`,title=shopPlus?'ShopPlus 订单同步':'KDocs 助手设置';
  return `text returned of (display dialog "${message}" default answer "" with hidden answer buttons {"取消", "保存"} default button "保存" cancel button "取消" with title "${title}")`;
}
export async function promptForApiKey(label,{execute=run,platform=process.platform,localPrompt=promptInLocalWindow}={}){
  if(!allowedLabels.has(label))throw settingsError('未知服务商');
  if(platform!=='darwin')return localPrompt(label);
  try{const result=await execute('/usr/bin/osascript',['-e',secretPromptScript(label)],{timeout:600000,maxBuffer:8192});return result.stdout.trim();}
  catch(e){if(String(e.stderr||'').includes('(-128)'))return null;throw settingsError('安全输入窗口未完成，请重试；原有密钥未修改','AI_KEY_INPUT_FAILED');}
}
