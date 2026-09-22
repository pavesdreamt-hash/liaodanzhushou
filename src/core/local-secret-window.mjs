import {fileURLToPath,pathToFileURL} from 'node:url';
import {settingsError} from '../orders/assistant-settings.mjs';
let active=false;

export async function promptInLocalWindow(label,{electron=null,timeoutMs=600000}={}){
 if(!['DeepSeek','OpenAI / GPT'].includes(label))throw settingsError('未知服务商');
 if(active)throw settingsError('已有密钥输入窗口，请先完成或关闭它');
 const {BrowserWindow,ipcMain}=electron||await import('electron');active=true;
 return new Promise((resolve,reject)=>{
  let win,timer,settled=false;
  const channel='native-secret:submit',file=fileURLToPath(new URL('../../renderer/native-secret.html',import.meta.url));
  const finish=(error,value=null,alreadyClosed=false)=>{if(settled)return;settled=true;clearTimeout(timer);ipcMain.removeHandler(channel);active=false;error?reject(settingsError('安全输入窗口未完成，请重试；原有密钥未修改','AI_KEY_INPUT_FAILED')):resolve(value);if(!alreadyClosed&&win&&!win.isDestroyed())win.destroy();};
  try{
   win=new BrowserWindow({width:440,height:300,resizable:false,title:label+' API 密钥',show:false,autoHideMenuBar:true,webPreferences:{preload:fileURLToPath(new URL('./secret-preload.cjs',import.meta.url)),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});
   win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());
   ipcMain.handle(channel,(event,payload)=>{
    if(event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame||event.senderFrame.url!==pathToFileURL(file).href)return {ok:false};
    if(payload?.cancel===true){finish(null);return {ok:true};}
    if(typeof payload?.value!=='string'||!payload.value.trim()||payload.value.length>16000)return {ok:false};
    finish(null,payload.value.trim());return {ok:true};
   });
   win.once('close',()=>finish(null,null,true));win.once('closed',()=>finish(null,null,true));win.once('ready-to-show',()=>{if(!win.isDestroyed()){win.show();win.focus();}});timer=setTimeout(()=>finish(null),timeoutMs);
   Promise.resolve(win.loadFile(file)).catch(error=>finish(error));
  }catch(error){finish(error);}
 });
}
