import {app,BrowserWindow,ipcMain} from 'electron';
import {promptForApiKey} from '../../src/core/native-secret-prompt.mjs';
import {writeFile} from 'node:fs/promises';
app.setPath('userData',process.argv.find(a=>a.startsWith('--data=')).slice(7));
const resultFile=process.argv.find(a=>a.startsWith('--result=')).slice(9);
let requests=0;ipcMain.handle('fixture:prompt',()=>start());
async function start(){try{const value=await promptForApiKey('DeepSeek',{platform:'win32'});await writeFile(resultFile,JSON.stringify({request:++requests,canceled:value===null,matchesFictional:value==='fictional-ui-key',secretWritten:false}));}catch{await writeFile(resultFile,JSON.stringify({error:true}));}}
void app.whenReady().then(async()=>{const holder=new BrowserWindow({show:false,webPreferences:{sandbox:true}});await holder.loadURL('about:blank');void start();});
app.on('window-all-closed',()=>{});
