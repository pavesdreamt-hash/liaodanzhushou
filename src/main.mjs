import {ManualChat} from './manual-chat.mjs';
import {translateManualReply,ChatTranslationCache} from './manual-translation.mjs';
import {ManualProductImages} from './manual-product-images.mjs';
import {WhatsAppWebClient} from './orders/whatsapp-web-client.mjs';
import {WhatsAppStructuredBrowser as WhatsAppBrowser} from './orders/whatsapp-structured-browser.mjs';
import {AssistantSettings} from './orders/assistant-settings.mjs';
import {asyncSecretStorage} from './core/async-secret-storage.mjs';
import {promptForApiKey} from './core/native-secret-prompt.mjs';
import {createReadyOpener} from './core/ready-opener.mjs';
import {fictionalAssistantConnectors} from './orders/assistant-test-fixture.mjs';
import {loadAssistantConnectors} from './orders/assistant-connectors.mjs';
import {app,BrowserWindow,ipcMain,safeStorage,shell,dialog,screen,session,Tray,Menu,nativeImage,clipboard} from 'electron';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdtemp,cp,writeFile,readFile,unlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import os from 'node:os';
import {zipDiagnosticDirectory} from './core/diagnostic-zip.mjs';
import {ensureDirectories,copyProfileIfEmpty,readJSON,writeDiagnosticZipManifest,appendLog} from './core/files.mjs';
import {publicError} from './core/errors.mjs';
import {DesktopOAuth} from './google/oauth.mjs';
import {SheetsClient} from './google/sheets.mjs';
import {Orchestrator} from './services/orchestrator.mjs';
import {configureGoogleNetwork} from './core/network.mjs';
import {APP_NAME,DISPLAY_NAME,SOURCE_URL,TARGET_SPREADSHEET_ID,TARGET_SPREADSHEET_URL,TARGET_TITLE} from './config.mjs';
import {openOrderDatabase,orderDatabasePath} from './orders/database.mjs';
import {OrderAppService} from './orders/order-app-service.mjs';
import {CURRENT_ORDER_SCHEMA_VERSION} from './orders/migrations/index.mjs';
import {createVerifiedBackup,createAutomaticBackup,validateOrderDatabaseFile,replaceDatabaseAtomically,finalizeDatabaseReplacement,rollbackDatabaseReplacement,manualBackupName,recordOrderDataAudit} from './orders/order-data-protection.mjs';
import {buildProfitWorkbookBuffer} from './orders/profit-export.mjs';
import {googleMapsSearchUrl} from './orders/google-maps-link.mjs';
import {AddressDeliveryVerifier,loadAddressVerificationConfiguration} from './orders/address-delivery-verification.mjs';
import {closeKdocsWorkspace} from './source/browser.mjs';
import {LocalWebServer} from './local-web-server.mjs';
import {SHOPPLUS_FILE_FILTER_EXTENSIONS,shopPlusExtension,validateShopPlusUpload} from './orders/shopplus-file.mjs';
const directory=path.dirname(fileURLToPath(import.meta.url)),PRODUCTION_WEB_PORT=43877;
app.setName(APP_NAME);const testMode=process.env.NODE_ENV==='test'||process.argv.includes('--orders-test-browser-workspace');const testUserData=testMode&&process.argv.find(value=>value.startsWith('--orders-test-user-data=')),testExcel=testMode&&process.argv.find(value=>value.startsWith('--orders-test-excel=')),testSaveDirectory=testMode&&process.argv.find(value=>value.startsWith('--orders-test-save-directory=')),testDataDirectory=testMode&&process.argv.find(value=>value.startsWith('--orders-test-data-directory=')),testRestoreFile=testMode&&process.argv.find(value=>value.startsWith('--orders-test-restore-file=')),testCancelSave=testMode&&process.argv.includes('--orders-test-cancel-save'),testCancelDataSave=testMode&&process.argv.includes('--orders-test-cancel-data-save'),testAddressDeliverable=testMode&&process.argv.includes('--orders-test-address-deliverable'),testBrowserWorkspace=testMode&&process.argv.includes('--orders-test-browser-workspace'),testBrowserUrlFile=testMode&&process.argv.find(value=>value.startsWith('--orders-test-browser-url-file=')),testTrayBoundsFile=testMode&&process.argv.find(value=>value.startsWith('--orders-test-tray-bounds-file='));app.setPath('userData',testUserData?path.resolve(testUserData.slice('--orders-test-user-data='.length)):path.join(app.getPath('appData'),APP_NAME));
const isolatedUserData=process.argv.find(value=>value.startsWith('--isolated-user-data='));if(isolatedUserData){const selected=path.resolve(isolatedUserData.slice('--isolated-user-data='.length)),production=path.join(app.getPath('appData'),APP_NAME);if(selected===production||selected.startsWith(production+path.sep))throw new Error('隔离目录不能是正式应用数据目录');app.setPath('userData',selected);}
let window,paths,orchestrator,startupLogFile,orderDatabase,orderApp,orderDatabaseError,addressVerifier,webServer,tray,priceCheckTimer,quitting=false;const excelSelections=new Map(),uploadedPreviewFiles=new Map(),restoreSelections=new Map(),operations=new Map();
async function clearExcelSelections(){const temporary=[];for(const selection of excelSelections.values())if(selection?.temporary)temporary.push(selection.filePath);temporary.push(...uploadedPreviewFiles.values());excelSelections.clear();uploadedPreviewFiles.clear();await Promise.all(temporary.map(filePath=>unlink(filePath).catch(error=>{if(error.code!=='ENOENT')throw error;})));}
function lifecycle(stage,message,metrics={}){
  console.error(`[${stage}] ${message}`);if(startupLogFile)appendLog(startupLogFile,{timestamp:new Date().toISOString(),stage,message,metrics}).catch(error=>console.error('[startup-log]',error.message));
}
function nativeFailure(title,error){const safe=publicError(error);lifecycle('fatal',safe.message,{code:safe.code,stage:safe.stage});if(app.isReady())dialog.showErrorBox(title,`${safe.stage}：${safe.message}`);}
function revealWindow(){
  if(!window||window.isDestroyed())return false;
  if(window.isMinimized())window.restore();
  const bounds=window.getBounds(),visible=screen.getAllDisplays().some(display=>{const area=display.workArea;return bounds.x<area.x+area.width&&bounds.x+bounds.width>area.x&&bounds.y<area.y+area.height&&bounds.y+bounds.height>area.y;});
  if(!visible)window.center();window.show();window.moveTop();app.focus({steal:true});window.focus();lifecycle('window','主窗口已显示并获得焦点',{bounds:window.getBounds(),visible:window.isVisible()});return true;
}
const rendererUrl=new URL('../renderer/index.html',import.meta.url);
function allowedSender(event){
  try{
    if(!window||window.isDestroyed()||event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame)return false;
    const sender=new URL(event.senderFrame.url);
    if(sender.protocol===rendererUrl.protocol&&sender.host===rendererUrl.host&&sender.pathname===rendererUrl.pathname)return true;
    return Boolean(webServer?.origin&&sender.origin===webServer.origin&&sender.pathname==='/'&&sender.searchParams.get('token')===webServer.token);
  }
  catch{return false;}
}
async function dispatch(channel,payload){const operation=operations.get(channel);if(!operation)return {ok:false,error:{stage:'安全检查',message:'未知本地操作',code:'UNKNOWN_OPERATION'}};try{return {ok:true,data:await operation(payload)}}catch(error){return {ok:false,error:publicError(error)}};}
function handler(channel,operation){operations.set(channel,operation);ipcMain.handle(channel,async(event,payload)=>allowedSender(event)?dispatch(channel,payload):{ok:false,error:{stage:'安全检查',message:'拒绝未知页面请求',code:'INVALID_SENDER'}});}
const openDialog=options=>window&&!window.isDestroyed()?dialog.showOpenDialog(window,options):dialog.showOpenDialog(options);
const saveDialog=options=>window&&!window.isDestroyed()?dialog.showSaveDialog(window,options):dialog.showSaveDialog(options);
const openDashboard=createReadyOpener(()=>app.whenReady().then(bootstrap),async()=>{if(process.argv.some(value=>value.startsWith('--verify-packaged-startup=')))return true;if(process.env.NODE_ENV==='test'&&!testBrowserWorkspace)return createWindow();if(!webServer?.url)throw new Error('本地管理页面尚未就绪');if(testBrowserUrlFile){await writeFile(path.resolve(testBrowserUrlFile.slice('--orders-test-browser-url-file='.length)),webServer.url,{encoding:'utf8',mode:0o600});return true;}await createWindow(webServer.url);lifecycle('local-web','桌面管理窗口已打开');return true;});
function createTray(){if(tray)return tray;const source=nativeImage.createFromPath(path.resolve(app.getAppPath(),'assets/app-icon-1024.png'));if(source.isEmpty())throw new Error('菜单栏图标无法加载');const icon=source.resize({width:18,height:18,quality:'best'});tray=new Tray(icon);tray.setToolTip(DISPLAY_NAME);tray.setContextMenu(Menu.buildFromTemplate([{label:'打开管理页面',click:()=>openDashboard().catch(error=>nativeFailure('无法打开管理页面',error))},{type:'separator'},{label:'退出',click:()=>{quitting=true;app.quit();}}]));tray.on('click',()=>openDashboard().catch(error=>nativeFailure('无法打开管理页面',error)));return tray;}
let assistantConnectors={},assistantSettings,whatsappBrowser;
function updateSettingsConnector(){const state=assistantSettings?.state,p=state?.providers[state.activeProvider];if(assistantSettings?.saved){assistantConnectors.extractor=p?.key&&p?.model?{mode:"configured",extract:input=>assistantSettings.extract(input)}:null;if(orderApp)orderApp.assistant.extractor=assistantConnectors.extractor;}}
function installOrderApp(){orderApp=new OrderAppService({...assistantConnectors,database:orderDatabase,aiGateway:assistantConnectors.aiGateway||assistantSettings,userDataPath:paths.base,addressVerifier,beforeCommit:()=>createAutomaticBackup(orderDatabase,{userDataPath:paths.base,reason:'before_import',maxVersion:CURRENT_ORDER_SCHEMA_VERSION})});orderDatabaseError=null;if(testMode&&testUserData){const interval=process.argv.find(v=>v.startsWith('--orders-test-online-interval='));if(interval)orderApp.assistant.online.intervalMs=Math.max(100,Number(interval.split('=')[1])||15000);}orderApp.assistant.online.subscribe?.(value=>{if(window&&!window.isDestroyed())window.webContents.send('app:assistant-changed',value);webServer?.emit('assistant-changed',value);});orderApp.assistant.online.start();clearInterval(priceCheckTimer);if(!testMode){const check=()=>orderApp?.checkProductPrices().then(result=>{if(result.pending&&window&&!window.isDestroyed())window.webContents.send('app:assistant-changed',{kind:'product-price',pending:result.pending});}).catch(error=>lifecycle('product-price','网站售价检查暂未完成',{message:error.message}));setTimeout(check,5000).unref?.();priceCheckTimer=setInterval(check,24*60*60*1000);priceCheckTimer.unref?.();}}
async function ensureDailyOrderBackup(){const day=new Date().toISOString().slice(0,10),saved=orderDatabase.prepare("SELECT value FROM order_app_metadata WHERE key='last_daily_backup_day'").get()?.value;if(saved===day)return false;await createAutomaticBackup(orderDatabase,{userDataPath:paths.base,reason:'daily',maxVersion:CURRENT_ORDER_SCHEMA_VERSION});orderDatabase.prepare("INSERT INTO order_app_metadata(key,value) VALUES('last_daily_backup_day',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(day);return true;}
async function restoreOrdersDatabase(backupFile){validateOrderDatabaseFile(backupFile,{maxVersion:CURRENT_ORDER_SCHEMA_VERSION});await orderApp.assistant.online.stop();const databaseFile=orderDatabasePath(paths.base);try{await createAutomaticBackup(orderDatabase,{userDataPath:paths.base,reason:'before_restore',maxVersion:CURRENT_ORDER_SCHEMA_VERSION});orderApp.invalidatePreviews();const checkpoint=orderDatabase.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get();if(Number(checkpoint?.busy||0)!==0)throw new Error('SQLite WAL检查点未完成，已停止恢复');}catch(error){orderApp.assistant.online.start();throw error;}orderDatabase.close();orderDatabase=null;await unlink(`${databaseFile}-wal`).catch(()=>{});await unlink(`${databaseFile}-shm`).catch(()=>{});let replacement;
  try{replacement=await replaceDatabaseAtomically({databaseFile,sourceFile:backupFile,maxVersion:CURRENT_ORDER_SCHEMA_VERSION});orderDatabase=await openOrderDatabase({userDataPath:paths.base,skipMigrationBackup:true});installOrderApp();recordOrderDataAudit(orderDatabase,'database_restored',{schemaVersion:replacement.schemaVersion});await finalizeDatabaseReplacement(replacement.rollbackFile);return {restored:true,orderCount:replacement.orderCount,itemCount:replacement.itemCount,schemaVersion:replacement.schemaVersion};}
  catch(error){if(orderDatabase){orderDatabase.close();orderDatabase=null;}if(replacement?.rollbackFile)await rollbackDatabaseReplacement({databaseFile,rollbackFile:replacement.rollbackFile});orderDatabase=await openOrderDatabase({userDataPath:paths.base,skipMigrationBackup:true});installOrderApp();throw error;}}
async function exportDiagnostics(){
  const destination=await saveDialog({title:'导出诊断报告',defaultPath:path.join(app.getPath('downloads'),`KDocs诊断-${Date.now()}.zip`),filters:[{name:'ZIP',extensions:['zip']}]});if(destination.canceled)return {canceled:true};
  const temp=await mkdtemp(path.join(app.getPath('temp'),'kdocs-diagnostic-')),bundle=path.join(temp,'KDocs诊断');
  await cp(paths.logs,path.join(bundle,'logs'),{recursive:true});await cp(paths.failed,path.join(bundle,'failed'),{recursive:true});await cp(paths.plans,path.join(bundle,'sync-plans'),{recursive:true});
  await writeFile(path.join(bundle,'说明.txt'),'本诊断不包含Google令牌、密码、Cookie或KDocs浏览器profile。\n');await writeDiagnosticZipManifest(paths,path.join(bundle,'included-files.txt'));
  return zipDiagnosticDirectory(bundle,destination.filePath);
}
async function createWindow(dashboardUrl=null){
  if(revealWindow())return window;
  window=new BrowserWindow({width:1280,height:820,minWidth:820,minHeight:640,title:DISPLAY_NAME,show:false,backgroundColor:'#f4f6f8',
    ...(process.platform==='darwin'?{titleBarStyle:'hidden',trafficLightPosition:{x:14,y:9}}:{}),
    webPreferences:{preload:path.join(directory,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});
  const layoutWindow=window;
  let previousDisplay='';
  const notifyDisplay=()=>{
    if(layoutWindow.isDestroyed())return;
    const profile=orderLayoutDisplay(layoutWindow),identity=JSON.stringify(profile);
    if(previousDisplay===identity)return;previousDisplay=identity;
    layoutWindow.webContents.send('order-layout:display-changed',profile);
  };
  layoutWindow.on('move',notifyDisplay);
  screen.on('display-metrics-changed',notifyDisplay);
  screen.on('display-removed',notifyDisplay);
  layoutWindow.once('closed',()=>{screen.removeListener('display-metrics-changed',notifyDisplay);screen.removeListener('display-removed',notifyDisplay);});
  const rendererFile=path.join(directory,'../renderer/index.html');lifecycle('window','BrowserWindow已创建',{rendererFile,bounds:window.getBounds()});
  window.once('ready-to-show',()=>{lifecycle('window','收到ready-to-show');revealWindow();});
  let closing=false;window.on('close',event=>{if(closing)return;event.preventDefault();const target=window;target.webContents.executeJavaScript('window.flushAssistantWorkspaces?.()').then(()=>{closing=true;target.close();}).catch(()=>{revealWindow();});});
  window.on('show',()=>lifecycle('window','收到show事件',{visible:window?.isVisible()}));window.on('closed',()=>{lifecycle('window','主窗口已关闭');window=null;});
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',event=>event.preventDefault());
  window.webContents.on('did-start-navigation',(_event,_url,isInPlace,isMainFrame)=>{if(!isMainFrame||isInPlace)return;void clearExcelSelections();restoreSelections.clear();orderApp?.invalidatePreviews();});
  window.webContents.on('did-finish-load',()=>lifecycle('renderer','主页面加载完成',{url:window?.webContents.getURL()}));
  window.webContents.on('did-fail-load',(_event,errorCode,errorDescription,validatedURL,isMainFrame)=>{if(!isMainFrame)return;lifecycle('renderer','主页面加载失败',{errorCode,errorDescription,validatedURL});dialog.showErrorBox('聊单助手页面加载失败',`${errorCode}: ${errorDescription}\n${validatedURL}`);});
  window.webContents.on('preload-error',(_event,preloadPath,error)=>{lifecycle('preload','preload加载失败',{preloadPath,error:publicError(error)});dialog.showErrorBox('聊单助手启动失败',`preload加载失败：${publicError(error).message}`);});
  window.webContents.on('render-process-gone',(_event,details)=>{lifecycle('renderer','渲染进程退出',details);dialog.showErrorBox('聊单助手界面异常退出',`${details.reason}（${details.exitCode}）`);});
  try{if(dashboardUrl)await window.loadURL(dashboardUrl);else await window.loadFile(rendererFile);lifecycle('window',dashboardUrl?'loadURL成功，执行显示兜底':'loadFile成功，执行显示兜底');revealWindow();return window;}
  catch(error){lifecycle('window','loadFile抛出异常',{error:publicError(error),rendererFile});nativeFailure('聊单助手页面加载失败',error);if(window&&!window.isDestroyed())window.destroy();throw error;}
}
function orderLayoutDisplay(target){
  const display=screen.getDisplayMatching(target.getBounds());
  return {id:String(display.id),label:display.label||`显示器 ${display.id}`,workArea:{width:display.workArea.width,height:display.workArea.height},scaleFactor:display.scaleFactor};
}
async function bootstrap(){
  let manualChat,chatTranslationCache;
  ipcMain.handle('order-layout:chrome',(event,enabled)=>{
    if(process.platform!=='darwin'||typeof enabled!=='boolean'||!window||window.isDestroyed()||event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame)return false;
    window.setWindowButtonPosition(enabled?{x:22,y:21}:{x:14,y:9});return true;
  });
  ipcMain.handle('order-layout:display',event=>{
    if(!window||window.isDestroyed()||event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame)return null;
    return orderLayoutDisplay(window);
  });
  ipcMain.handle('manual-reply-translation',async(event,request)=>{
    if(!window||window.isDestroyed()||event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame||!assistantSettings)return {ok:false,error:'无法访问翻译服务'};
    try{
      const {action,payload}=request||{};
      const chatCache=(translate)=>{
        const binding=manualChat?.bindings.get(payload?.token);if(!binding)throw new Error('请先关联并核对客户聊天');
        chatTranslationCache??=new ChatTranslationCache(path.join(paths.base,'orders','manual-chat'));
        return chatTranslationCache[translate?'translate':'lookup'](assistantSettings,{messages:payload.messages,scope:{accountId:binding.accountId,chatId:binding.chatId}});
      };
      const operations={translate:()=>translateManualReply(assistantSettings,payload),'chat-translate':()=>chatCache(true),'chat-cache':()=>chatCache(false),settings:()=>assistantSettings.get(),save:()=>assistantSettings.save(payload),key:()=>assistantSettings.changeKey(payload),usage:()=>assistantSettings.setUsageMode(payload)};
      if(!Object.hasOwn(operations,action))return {ok:false,error:'未知翻译操作'};
      return {ok:true,data:await operations[action]()};
    }catch(error){return {ok:false,error:publicError(error).message};}
  });
  ipcMain.handle('order-template:export',async(event,payload)=>{
    if(!window||window.isDestroyed()||event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame)return {ok:false,error:'无法导出订单'};
    try{
      if(typeof payload?.content!=='string'||!payload.content.trim()||payload.content.length>500000||typeof payload.filename!=='string')throw new Error('订单内容无效');
      const filename=path.basename(payload.filename).replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').slice(0,120).replace(/\.txt$/i,'')+'.txt';
      const result=testCancelSave?{canceled:true}:testSaveDirectory?{canceled:false,filePath:path.join(path.resolve(testSaveDirectory.slice('--orders-test-save-directory='.length)),filename)}:await saveDialog({title:'导出订单 TXT',defaultPath:path.join(app.getPath('downloads'),filename),filters:[{name:'TXT 文本',extensions:['txt']}]});
      if(result.canceled||!result.filePath)return {ok:true,canceled:true};
      const destination=path.extname(result.filePath).toLowerCase()==='.txt'?result.filePath:result.filePath+'.txt';
      await writeFile(destination,'\uFEFF'+payload.content.replace(/\r?\n/g,'\r\n'),{encoding:'utf8',mode:0o600});return {ok:true,canceled:false,filename:path.basename(destination)};
    }catch(error){return {ok:false,error:publicError(error).message};}
  });
  ipcMain.handle('manual-chat',async(event,request)=>{
    if(!window||window.isDestroyed()||event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame||!whatsappBrowser||!paths)return {ok:false,error:'聊天服务尚未准备好'};
    try{
      manualChat??=new ManualChat({adapter:whatsappBrowser,directory:path.join(paths.base,'orders','manual-chat')});
      const {action,payload={}}=request||{};
      const orderBinding=()=>{
        const orderId=typeof payload.orderId==='string'?payload.orderId:'';
        if(!orderId)throw new Error('请先选择订单');
        const detail=orders().detail({id:orderId});if(!detail||detail.lifecycleState!=='active')throw new Error('订单不存在或已移除');
        return {orderId,detail};
      };
      const verifyOrderPhone=(orderId,detail,chatId)=>{
        if(!String(detail.customer.phone||'').trim())return;
        const check=orders().assistant.phoneCheck(orderId,chatId);
        if(!check.matches)throw new Error(check.status==='unverified'?'订单电话缺少可核实的国家区号，请核对并更正为完整号码':'订单电话与目标 WhatsApp 号码不同，请先人工核对并修正订单资料');
      };
      const bindOrder=async()=>{
        const {orderId,detail}=orderBinding();
        verifyOrderPhone(orderId,detail,payload.chatId);
        const result=await manualChat.bind(payload);
        try{
          await orders().assistant.bind({orderId,accountId:result.accountId,chatId:result.chatId,candidateToken:payload.candidateToken,scopeStart:new Date(Date.now()-86400000).toISOString(),endMode:'latest',confirmed:true});
          await orders().assistant.read({orderId,limit:100,from:new Date(Date.now()-86400000).toISOString()});
        }catch(error){manualChat.bindings.delete(result.token);throw error;}
        return result;
      };
      const restoreOrder=async()=>{
        const {orderId,detail}=orderBinding(),saved=orders().assistant.row(orderId);
        if(!saved.account_id||!saved.chat_id||!saved.browser_binding)throw new Error('本单尚未关联已核对的聊天');
        verifyOrderPhone(orderId,detail,saved.chat_id);
        return manualChat.restore({accountId:saved.account_id,chatId:saved.chat_id,binding:JSON.parse(saved.browser_binding)});
      };
      const sendOrder=async()=>{
        if(payload.orderId){const {orderId,detail}=orderBinding(),saved=orders().assistant.row(orderId),bound=manualChat.bindings.get(payload.token);
          if(!bound||saved.account_id!==bound.accountId||saved.chat_id!==bound.chatId)throw new Error('发送目标不是当前订单已核对的聊天，请重新关联');
          verifyOrderPhone(orderId,detail,bound.chatId);}
        return manualChat.send(payload);
      };
      const historyOrder=async()=>{if(payload.orderId){const {orderId,detail}=orderBinding(),saved=orders().assistant.row(orderId),bound=manualChat.bindings.get(payload.token);if(!bound||saved.account_id!==bound.accountId||saved.chat_id!==bound.chatId)throw new Error('当前订单与聊天关联已变化，请重新核对');verifyOrderPhone(orderId,detail,bound.chatId);await orders().assistant.read({orderId,limit:100,from:new Date(Date.now()-86400000).toISOString()});}return manualChat.history(payload);};
      const operations={status:()=>manualChat.status(),inbox:()=>typeof whatsappBrowser.inbox==='function'?whatsappBrowser.inbox(payload):Promise.reject(new Error('当前 WhatsApp 连接不支持统一会话列表')),openInbox:()=>manualChat.openInbox(payload),recent:()=>manualChat.recent(payload),connect:()=>manualChat.connect(),inspect:()=>manualChat.inspect(payload),bind:()=>payload.orderId?bindOrder():manualChat.bind(payload),restore:restoreOrder,history:historyOrder,send:sendOrder};
      if(!Object.hasOwn(operations,action))return {ok:false,error:'未知聊天操作'};
      return {ok:true,data:await operations[action]()};
    }catch(error){return {ok:false,error:publicError(error).message};}
  });
  let manualImages;
  ipcMain.handle('manual-images',async(event,payload)=>{
    if(!window||window.isDestroyed()||event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame||!paths)return {ok:false,error:'无法访问图片库'};
    try{
      manualImages??=new ManualProductImages(path.join(paths.base,'orders','product-media'),{profiles:()=>orderApp?.productProfiles()||[],encode:data=>{const image=nativeImage.createFromDataURL(data);if(image.isEmpty())throw new Error('图片无效');return image.resize({width:Math.min(1600,image.getSize().width)}).toJPEG(82);}});
      const action=payload?.action;
      const data=action==='list'?await manualImages.list(payload.query):action==='add'?await manualImages.add(payload.image):action==='remove'?await manualImages.remove(payload.id):null;
      return {ok:true,data};
    }catch(error){return {ok:false,error:error.message};}
  });
  lifecycle('startup','正在准备应用目录');
  paths=await ensureDirectories(app.getPath('userData'));
  const addressConfiguration=await loadAddressVerificationConfiguration(paths.base);addressVerifier=testAddressDeliverable?new AddressDeliveryVerifier({apiKey:'test-only',range:{cities:['Example City','Dubai']},fetchImpl:async()=>({ok:true,json:async()=>({status:'OK',results:[{formatted_address:'Fictional normalized address',geometry:{location:{lat:25.2,lng:55.3},location_type:'ROOFTOP'},address_components:[{long_name:'Example City',short_name:'Example City',types:['locality']}]}]})})}):new AddressDeliveryVerifier(addressConfiguration);
  startupLogFile=path.join(paths.logs,`startup-${new Date().toISOString().slice(0,10)}.jsonl`);lifecycle('startup','启动日志已启用',{packaged:app.isPackaged,version:app.getVersion(),platform:process.platform,arch:process.arch,osVersion:os.release(),osEdition:os.version(),userData:app.getPath('userData')});
  assistantConnectors=testMode?{}:await loadAssistantConnectors(paths.base);
  const settingsFixtureArg=testMode&&testUserData&&process.argv.find(value=>value.startsWith('--orders-test-settings='));
  const settingsFixture=settingsFixtureArg?JSON.parse(await readFile(settingsFixtureArg.slice('--orders-test-settings='.length),'utf8')):null;
  const settingsDataArg=testMode&&testUserData&&process.argv.find(value=>value.startsWith('--orders-test-settings-data='));
  assistantSettings=new AssistantSettings({userDataPath:settingsDataArg?path.resolve(settingsDataArg.slice('--orders-test-settings-data='.length)):paths.base,verificationOnly:Boolean(settingsDataArg),safeStorage:asyncSecretStorage(safeStorage),onChanged:updateSettingsConnector,promptKey:settingsFixture?async()=>settingsFixture.key??null:promptForApiKey,...(settingsFixture?{simulation:true,fetchImpl:async(_url,options)=>{if(settingsFixture.delayMs)await new Promise(resolve=>setTimeout(resolve,Math.min(settingsFixture.delayMs,3000)));const request=JSON.parse(options.body),input=JSON.parse(request.messages[1].content);const result=input.language==='zh'?{translations:input.messages.map(m=>({id:m.id,text:(settingsFixture.translationPrefix||'模拟中文：')+m.text}))}:input.intent&&!input.mode?{text:settingsFixture.translationText||'Thank you for your support.',chinese:settingsFixture.translationChinese||'感谢你的支持。'}:input.mode?{text:settingsFixture.reply||'Fictional AI draft. Please confirm the address.',chinese:'模拟中文对照'}:{fields:{fullName:{value:'Avery Example',messageIds:['probe-customer-1']}},items:[],quotes:[]};return {ok:true,status:200,text:async()=>JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(result)}}]})};}}:{})});
  // Loading an existing encrypted key may require user authorization. Orders and
  // the local dashboard must become usable while that asynchronous check waits.
  void assistantSettings.get().then(updateSettingsConnector).catch(()=>{assistantConnectors.extractor=null;if(orderApp)orderApp.assistant.extractor=null;lifecycle('assistant-settings','助手设置暂不可用，可在设置页查看；订单功能继续可用');});
  const whatsappScopeArg=testMode&&testUserData&&process.argv.find(value=>value.startsWith('--orders-test-whatsapp-scope='));
  const whatsappScope=whatsappScopeArg?JSON.parse(await readFile(whatsappScopeArg.slice('--orders-test-whatsapp-scope='.length),'utf8')):null;
  const liveFixtureArg=testMode&&testUserData&&process.argv.find(v=>v.startsWith('--orders-test-live-fixture='));
  whatsappBrowser=(!testMode||process.argv.includes('--orders-test-wwebjs'))?new WhatsAppWebClient({userDataPath:paths.base,restriction:whatsappScope,...(liveFixtureArg?{clientFactory:async()=>{const {fictionalLiveClient}=await import('./orders/assistant-live-fixture.mjs');return fictionalLiveClient(liveFixtureArg.slice('--orders-test-live-fixture='.length));},reconnectDelays:[100,200,400]}:{})}):new WhatsAppBrowser({userDataPath:paths.base,...(whatsappScope?{restriction:whatsappScope,launch:async options=>{const {chromium}=await import('playwright-core');return chromium.launchPersistentContext(whatsappScope.profile,options);}}:{})});
  let lastWhatsAppStatus;whatsappBrowser.subscribe?.(e=>{if(e.kind==='state'&&e.state.status!==lastWhatsAppStatus){lastWhatsAppStatus=e.state.status;lifecycle('WhatsApp自动连接',e.state.message,{status:e.state.status,provider:e.state.provider,hasQR:Boolean(e.state.qr),failureCode:e.state.lastError?.code||null,failureMessage:e.state.lastError?.message||null});}});
  void whatsappBrowser.checkDependency?.().catch(()=>{});
  if(!assistantConnectors.chatAdapter)assistantConnectors.chatAdapter=whatsappBrowser;
  const assistantFixture=testMode&&testUserData&&process.argv.find(value=>value.startsWith('--orders-test-assistant='));if(assistantFixture)assistantConnectors=fictionalAssistantConnectors(JSON.parse(await readFile(assistantFixture.slice('--orders-test-assistant='.length),'utf8')));
  if(settingsDataArg){assistantConnectors.extractor=null;updateSettingsConnector();}
  try{orderDatabase=await openOrderDatabase({userDataPath:paths.base});installOrderApp();if(!testMode)await ensureDailyOrderBackup().catch(error=>lifecycle('orders-backup','每日备份暂未完成',{message:error.message}));lifecycle('orders','订单数据库已安全初始化');}
  catch(error){orderDatabaseError=publicError(error);lifecycle('orders','订单数据库初始化失败',{code:orderDatabaseError.code,stage:orderDatabaseError.stage});}
  const packagedStartupArg=testMode&&isolatedUserData&&process.argv.find(value=>value.startsWith('--verify-packaged-startup='));
  if(packagedStartupArg){const reportFile=path.resolve(packagedStartupArg.slice('--verify-packaged-startup='.length)),index=await readFile(path.resolve(app.getAppPath(),'renderer/index.html'),'utf8'),script=await readFile(path.resolve(app.getAppPath(),'renderer/app.js'),'utf8'),report={ok:Boolean(orderDatabase&&!orderDatabaseError&&index.includes('app.js')&&script.includes('liaodan-assistant-next-ui')),packaged:app.isPackaged,version:app.getVersion(),schemaVersion:orderDatabase?CURRENT_ORDER_SCHEMA_VERSION:null,platform:process.platform,arch:process.arch};await writeFile(reportFile,JSON.stringify(report,null,2),{encoding:'utf8',mode:0o600});await orderApp?.assistant.online.stop();orderDatabase?.close();orderDatabase=null;console.log(JSON.stringify(report));app.exit(report.ok?0:1);return;}
  lifecycle('startup','正在检查聊单助手独立登录资料');
  lifecycle('startup','正在准备应用服务');
  const network=await configureGoogleNetwork(session.defaultSession);lifecycle('network',network.proxy?'已启用macOS系统代理':'使用直接网络连接',{mode:network.mode,proxyConfigured:Boolean(network.proxy)});
  const oauth=new DesktopOAuth({paths,safeStorage,shell,proxy:network.proxy,log:lifecycle,onStatus:value=>{lifecycle('Google OAuth',value.message,{event:value.event,...value.metrics});if(window&&!window.isDestroyed())window.webContents.send('app:oauth-status',value);webServer?.emit('oauth',value);}}),bundledOauth=app.isPackaged?path.join(process.resourcesPath,'google-oauth.json'):path.resolve(app.getAppPath(),'resources/google-oauth.json');
  const oauthSetup=await oauth.ensureBundledConfiguration(bundledOauth);lifecycle('startup',oauthSetup.copied?'已从App Resources初始化OAuth配置':'已保留现有OAuth配置',{copied:oauthSetup.copied});const sheets=new SheetsClient(oauth);
  const restoreArg=process.argv.find(value=>value.startsWith('--restore-google-backup='));
  if(restoreArg){const backupFile=restoreArg.slice('--restore-google-backup='.length),backup=JSON.parse(await readFile(backupFile,'utf8'));
    if(backup.spreadsheetId!==TARGET_SPREADSHEET_ID||backup.title!==TARGET_TITLE)throw new Error('恢复备份与固定目标表格不一致');
    const metadata=await sheets.metadata(TARGET_SPREADSHEET_ID),inventorySheet=metadata.sheets.find(value=>value.properties.title==='库存情况'),mappingSheet=metadata.sheets.find(value=>value.properties.title==='商品映射');
    if(!inventorySheet||!mappingSheet)throw new Error('恢复目标工作表不存在');
    const ranges=await sheets.batchGet(TARGET_SPREADSHEET_ID,["'库存情况'!A:ZZ","'商品映射'!A:E"]),currentInventory=ranges[0]?.values||[],currentMapping=ranges[1]?.values||[];
    const cell=value=>value===''?{}:{userEnteredValue:{stringValue:String(value)}},matrix=(sheetId,values,rowCount,columnCount)=>({updateCells:{start:{sheetId,rowIndex:0,columnIndex:0},rows:Array.from({length:rowCount},(_,r)=>({values:Array.from({length:columnCount},(_,c)=>cell(values[r]?.[c]||''))})),fields:'userEnteredValue'}});
    const inventoryId=inventorySheet.properties.sheetId,mappingId=mappingSheet.properties.sheetId,currentColumns=inventorySheet.properties.gridProperties.columnCount||backup.inventory[0].length,difference=currentColumns-backup.inventory[0].length,requests=[];
    if(difference>0)requests.push({deleteDimension:{range:{sheetId:inventoryId,dimension:'COLUMNS',startIndex:6,endIndex:6+difference}}});
    requests.push(matrix(inventoryId,backup.inventory,Math.max(currentInventory.length,backup.inventory.length),backup.inventory[0].length),matrix(mappingId,backup.mapping,Math.max(currentMapping.length,backup.mapping.length),5));
    await sheets.batchUpdate(TARGET_SPREADSHEET_ID,requests);const verify=await sheets.batchGet(TARGET_SPREADSHEET_ID,[`'库存情况'!A1:J${backup.inventory.length}`,`'商品映射'!A1:E${backup.mapping.length}`]);
    const normalize=values=>values.map(row=>Array.from({length:Math.max(...values.map(item=>item.length))},(_,i)=>String(row[i]||''))).map(row=>{while(row.at(-1)==='')row.pop();return row;});
    if(JSON.stringify(normalize(verify[0]?.values||[]))!==JSON.stringify(normalize(backup.inventory))||JSON.stringify(normalize(verify[1]?.values||[]))!==JSON.stringify(normalize(backup.mapping)))throw new Error('Google备份恢复回读不一致');
    console.log(JSON.stringify({restored:true,backup:backupFile,inventoryRows:backup.inventory.length-1,mappingRows:backup.mapping.length-1}));app.quit();return;}
  if(process.argv.includes('--test-google-read')){const started=Date.now(),metadata=await sheets.metadata(TARGET_SPREADSHEET_ID);console.log(JSON.stringify({passed:metadata.properties?.title===TARGET_TITLE,
    elapsedMs:Date.now()-started,network:{mode:network.mode,proxy:network.proxy},title:metadata.properties?.title,sheets:metadata.sheets.map(value=>value.properties.title)}));app.quit();return;}
  orchestrator=new Orchestrator({paths,oauth,sheets,notify:value=>{window?.webContents.send('app:progress',value);webServer?.emit('progress',value);}});
  if(process.argv.includes('--sync-latest-source')){const source=await orchestrator.latestSource();if(!source)throw new Error('没有可用的KDocs来源快照');const pending=await orchestrator.preparePending(source);
    if(pending.plan.requiresInput||pending.mappingState.firstRun)throw new Error('最新来源仍需商品映射确认，已停止写入');const result=await orchestrator.executePending();console.log(JSON.stringify({completed:true,sourceCapturedAt:source.capturedAt,action:result.action,result:result.result}));app.quit();return;}
  for(const [method,operation] of Object.entries({'usage-mode':p=>assistantSettings.setUsageMode(p),get:()=>assistantSettings.get(),recheck:()=>assistantSettings.recheck(),save:p=>assistantSettings.save(p),'change-key':p=>assistantSettings.changeKey(p),'remove-key':p=>assistantSettings.removeKey(p),test:p=>assistantSettings.test(p)}))handler('assistant-settings:'+method,operation);
  handler('app:status',()=>orchestrator.status());handler('kdocs:open-external',async()=>{await shell.openExternal(SOURCE_URL);return {opened:true};});handler('kdocs:login',()=>orchestrator.login());
  const refreshOrderInventory=async()=>{const view=await orchestrator.localInventory();orderApp?.syncInventoryProducts(view?.current?.products||[]);return view;};
  handler('google:connect',()=>orchestrator.connectGoogle());handler('google:open',async()=>{await shell.openExternal(TARGET_SPREADSHEET_URL);return {opened:true,url:TARGET_SPREADSHEET_URL};});handler('sync:start',async()=>{const result=await orchestrator.sync();await refreshOrderInventory();return result;});handler('sync:mapping',p=>orchestrator.submitMapping(p?.answers,p||{}));
  handler('mapping:status',()=>orchestrator.mappingStatus());handler('inventory:local',refreshOrderInventory);
  handler('app:recent',()=>orchestrator.recent());handler('app:diagnostics',exportDiagnostics);handler('app:renderer-error',value=>{lifecycle('renderer-js','渲染页面JavaScript异常',{message:String(value?.message||'未知错误').slice(0,800),source:String(value?.source||'').slice(0,500),line:Number(value?.line)||0});return true;});
  const orders=()=>{if(!orderApp)throw Object.assign(new Error(orderDatabaseError?.message||'订单数据库不可用'),{code:'ORDER_DATABASE_UNAVAILABLE',stage:'订单数据库'});return orderApp;};
  for(const [method,operation] of Object.entries({linkAssistantOnlineMessages:p=>orders().assistant.online.linkPending(p),assistantOnlineSync:p=>orders().assistant.online.state(p),setAssistantOnlineSync:p=>orders().assistant.online.configure(p),refreshAssistantChat:p=>orders().assistant.history.refresh(p),assistantHistory:p=>orders().assistant.history.state(p),syncAssistantHistory:p=>orders().assistant.history.sync(p),cancelAssistantHistory:p=>orders().assistant.history.cancel(p),importAssistantHistory:p=>orders().assistant.history.import(p),applyAssistantHistory:p=>orders().assistant.history.apply(p),assistantPolicy:()=>orders().assistant.policy.state(),saveAssistantPolicy:p=>orders().assistant.policy.save(p),assistantWorkflow:p=>orders().assistant.policy.workflow(p.orderId),saveAssistantStage:p=>orders().assistant.policy.records.save(p),assistantReminders:()=>orders().assistant.policy.records.reminders(),assistantWorkspace:p=>orders().assistant.workspace.state(p),saveAssistantWorkspace:p=>orders().assistant.workspace.save(p),assistantMessages:p=>orders().assistant.workspace.messages(p),assistantActivity:p=>orders().assistant.workspace.activity(p),assistantTranslations:p=>orders().assistant.ai.translations(p),generateAssistantReply:p=>orders().assistant.ai.generate(p)}))handler('orders:'+method,operation);
  handler('orders:copyAssistantReply',async payload=>{
    const text=orders().assistant.workspace.replyForCopy(payload);try{clipboard.writeText(text);}catch{throw Object.assign(new Error('复制失败，英文草稿已保留，请重试或手动复制。'),{stage:'回复草稿',code:'ASSISTANT_CLIPBOARD_FAILED'});}
    if(process.env.NODE_ENV==='test')return {copied:true,opened:false,message:'英文草稿已复制（测试环境未打开外部聊天）。'};
    try{if(whatsappBrowser.live){const chatId=orders().assistant.row(payload.orderId).chat_id;if(!/^wa-phone:[1-9]\d{6,14}$/.test(chatId||''))throw new Error('本单未关联可核对的 WhatsApp 电话，请手动切换聊天。');await shell.openExternal('https://web.whatsapp.com/send?phone='+chatId.slice('wa-phone:'.length));}else await whatsappBrowser.open();return {copied:true,opened:true,message:'英文草稿已复制。请核对 WhatsApp 聊天后手动粘贴、发送。'};}
    catch(error){return {copied:true,opened:false,message:`英文草稿已复制；${error.code?.startsWith('WHATSAPP')?error.message:'WhatsApp 暂时无法打开，请手动切换到对应聊天。'}`};}
  });
  for(const [method,operation] of Object.entries({assistantConnection:()=>whatsappBrowser.status(),retryAssistantMedia:p=>orders().assistant.online.retryMedia(p),openWhatsApp:()=>whatsappBrowser.open(),inspectWhatsApp:p=>whatsappBrowser.inspect(p),draftCatalog:async()=>{const catalog=await orders().costCatalogLoader(paths.base);return catalog.list?.()||[];},createDraft:p=>orders().drafts.create(p),matchDraftCosts:p=>orders().drafts.matchCosts(p),saveDraft:p=>orders().drafts.save(p),assistantStatus:p=>orders().assistant.status(p),bindChat:p=>orders().assistant.bind(p),readChat:p=>orders().assistant.read(p),extractChat:p=>orders().assistant.extract(p),undoAssistant:p=>orders().assistant.undo(p),resolveAssistant:p=>orders().assistant.resolve(p)}))handler('orders:'+method,operation);
  handler('orders:select-excel',async()=>{const result=testExcel?{canceled:false,filePaths:[path.resolve(testExcel.slice('--orders-test-excel='.length))]}:await openDialog({title:'选择ShopPlus订单文件',properties:['openFile'],filters:[{name:'ShopPlus订单文件',extensions:SHOPPLUS_FILE_FILTER_EXTENSIONS}]});if(result.canceled||!result.filePaths[0])return {canceled:true};const filePath=result.filePaths[0],filename=path.basename(filePath);shopPlusExtension(filePath);await clearExcelSelections();orders().invalidatePreviews();const token=randomUUID();excelSelections.set(token,{filePath,filename,temporary:false});return {canceled:false,token,filename};});
  handler('orders:upload-excel',async payload=>{const filename=typeof payload?.filename==='string'?path.basename(payload.filename):'',content=payload?.content,extension=validateShopPlusUpload(filename,content);await clearExcelSelections();orders().invalidatePreviews();const token=randomUUID(),filePath=path.join(paths.state,`.shopplus-${token}${extension}`);await writeFile(filePath,content,{mode:0o600,flag:'wx'});excelSelections.set(token,{filePath,filename,temporary:true});return {canceled:false,token,filename};});
  handler('orders:preview-import',async payload=>{const token=typeof payload?.token==='string'?payload.token:'';const selection=excelSelections.get(token);if(!selection)throw Object.assign(new Error('文件选择已失效，请重新选择'),{code:'SHOPPLUS_SELECTION_EXPIRED',stage:'订单导入'});excelSelections.delete(token);try{const preview=await orders().previewFile(selection.filePath,{originalFilename:selection.filename});if(selection.temporary)uploadedPreviewFiles.set(preview.token,selection.filePath);return preview;}catch(error){if(selection.temporary)await unlink(selection.filePath).catch(unlinkError=>{if(unlinkError.code!=='ENOENT')throw unlinkError;});throw error;}});
  handler('orders:review-import',payload=>orders().review(payload));handler('orders:commit-import',async payload=>{const result=await orders().commit(payload),filePath=uploadedPreviewFiles.get(payload?.token);uploadedPreviewFiles.delete(payload?.token);if(filePath)await unlink(filePath).catch(error=>{if(error.code!=='ENOENT')throw error;});return result;});handler('orders:summary',()=>orders().summary());handler('orders:list',payload=>orders().list(payload));handler('orders:detail',payload=>orders().detail(payload));
  handler('orders:product-profiles',()=>orders().productProfiles());handler('orders:save-product-profile',payload=>orders().saveProductProfile(payload));handler('orders:check-product-prices',payload=>orders().checkProductPrices(payload));handler('orders:confirm-product-price',payload=>orders().confirmProductPrice(payload));handler('orders:profit-dashboard',payload=>orders().profitDashboard(payload));handler('orders:daily-profit',payload=>orders().dailyProfit(payload));handler('orders:save-daily-costs',payload=>orders().saveDailyCosts(payload));handler('orders:remove-order',payload=>orders().removeOrder(payload));handler('orders:restore-order',payload=>orders().restoreOrder(payload));handler('orders:permanently-delete-order',payload=>orders().permanentlyDeleteOrder(payload));handler('orders:app-lock-status',()=>orders().appLockStatus());handler('orders:configure-app-lock',payload=>orders().configureAppLock(payload));handler('orders:unlock-app',payload=>orders().unlockApp(payload));
  handler('orders:select-product-images',async()=>{const selected=await openDialog({title:'选择商品图片',properties:['openFile','multiSelections'],filters:[{name:'商品图片',extensions:['jpg','jpeg','png','webp']} ]});if(selected.canceled)return {canceled:true,images:[]};const directory=path.join(paths.base,'orders','product-media');await ensureDirectories([directory]);const images=[];for(const file of selected.filePaths.slice(0,20)){const source=nativeImage.createFromPath(file);if(source.isEmpty())continue;const size=source.getSize(),scale=Math.min(1,900/Math.max(size.width,size.height)),resized=scale<1?source.resize({width:Math.max(1,Math.round(size.width*scale)),height:Math.max(1,Math.round(size.height*scale)),quality:'good'}):source,filename=`product-${randomUUID()}.jpg`,target=path.join(directory,filename);await writeFile(target,resized.toJPEG(72),{mode:0o600});images.push({storageKey:`product-media:${filename}`,filename,width:resized.getSize().width,height:resized.getSize().height});}return {canceled:false,images};});
  handler('orders:confirm-order',payload=>orders().confirmOrder(payload));handler('orders:confirm-report-item',payload=>orders().confirmReportItem(payload));handler('orders:update-report-number',payload=>orders().updateReportNumber(payload));handler('orders:update-item-discount',payload=>orders().updateItemDiscount(payload));handler('orders:update-recipient',payload=>orders().updateRecipient(payload));handler('orders:restore-recipient',payload=>orders().restoreRecipient(payload));handler('orders:confirm-full-name',payload=>orders().confirmFullNameAsName(payload));handler('orders:update-package-status',payload=>orders().updatePackageStatus(payload));handler('orders:confirm-package-fee',payload=>orders().confirmPackageFee(payload));handler('orders:preview-package-txt',payload=>orders().previewPackageTxt(payload));handler('orders:profit-report',payload=>orders().profitReport(payload));
  handler('orders:update-package-discount',payload=>orders().updatePackageDiscount(payload));handler('orders:correct-package-status',payload=>orders().correctPackageStatus(payload));handler('orders:verify-address',payload=>orders().verifyAddress(payload));
  handler('orders:open-google-maps',async payload=>{const detail=orders().detail({id:payload?.orderId}),url=googleMapsSearchUrl(detail?.customer||{});if(process.env.NODE_ENV!=='test')await shell.openExternal(url);return {opened:true};});
  handler('orders:record-address-verification',payload=>orders().recordAddressVerification(payload));
  handler('orders:record-remittance',payload=>orders().recordRemittance(payload));
  handler('orders:save-package-txt',async payload=>{const report=orders().reportForSave(payload?.token),result=testCancelSave?{canceled:true}:testSaveDirectory?{canceled:false,filePath:path.join(path.resolve(testSaveDirectory.slice('--orders-test-save-directory='.length)),report.filename)}:await saveDialog({title:'保存报单TXT',defaultPath:path.join(app.getPath('downloads'),report.filename),filters:[{name:'TXT文本',extensions:['txt']}]});if(result.canceled||!result.filePath)return {canceled:true};const destination=path.extname(result.filePath).toLowerCase()==='.txt'?result.filePath:`${result.filePath}.txt`;await writeFile(destination,report.content,{encoding:'utf8',mode:0o600});const detail=orders().reportSaved(payload.token);return {canceled:false,filename:path.basename(destination),detail};});
  handler('orders:download-package-txt',payload=>{const report=orders().reportForSave(payload?.token),detail=orders().reportSaved(payload.token);return {filename:report.filename,content:report.content,detail};});
  handler('orders:data-status',()=>({lastManualBackupAt:orderDatabase.prepare("SELECT value FROM order_app_metadata WHERE key='last_manual_backup_at'").get()?.value||null,schemaVersion:CURRENT_ORDER_SCHEMA_VERSION}));
  handler('orders:create-backup',async()=>{const result=testCancelDataSave?{canceled:true}:testDataDirectory?{canceled:false,filePath:path.join(path.resolve(testDataDirectory.slice('--orders-test-data-directory='.length)),'orders-backup-test.sqlite')}:await saveDialog({title:'创建订单数据备份',defaultPath:path.join(app.getPath('downloads'),manualBackupName()),filters:[{name:'订单数据库备份',extensions:['sqlite']}]});if(result.canceled||!result.filePath)return {canceled:true};const destination=path.extname(result.filePath).toLowerCase()==='.sqlite'?result.filePath:`${result.filePath}.sqlite`,verified=await createVerifiedBackup(orderDatabase,destination,{maxVersion:CURRENT_ORDER_SCHEMA_VERSION}),createdAt=new Date().toISOString();orderDatabase.prepare("INSERT INTO order_app_metadata(key,value) VALUES('last_manual_backup_at',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(createdAt);recordOrderDataAudit(orderDatabase,'manual_backup_created',{schemaVersion:verified.schemaVersion});return {canceled:false,filename:path.basename(destination),createdAt,schemaVersion:verified.schemaVersion};});
  handler('orders:select-restore',async()=>{const result=testRestoreFile?{canceled:false,filePaths:[path.resolve(testRestoreFile.slice('--orders-test-restore-file='.length))]}:await openDialog({title:'选择订单数据备份',properties:['openFile'],filters:[{name:'订单数据库备份',extensions:['sqlite']}]});if(result.canceled||!result.filePaths[0])return {canceled:true};const file=result.filePaths[0],verified=validateOrderDatabaseFile(file,{maxVersion:CURRENT_ORDER_SCHEMA_VERSION}),token=randomUUID();restoreSelections.clear();restoreSelections.set(token,file);return {canceled:false,token,filename:path.basename(file),schemaVersion:verified.schemaVersion,orderCount:verified.orderCount,itemCount:verified.itemCount};});
  handler('orders:restore-backup',async payload=>{const token=typeof payload?.token==='string'?payload.token:'',file=restoreSelections.get(token);if(!file)throw Object.assign(new Error('恢复确认已失效，请重新选择备份'),{code:'ORDER_RESTORE_TOKEN_INVALID',stage:'订单数据恢复'});restoreSelections.delete(token);try{return await restoreOrdersDatabase(file);}finally{orderApp?.assistant.online.start();}});
  handler('orders:export-profit',async payload=>{const includePending=payload?.includePending===true,filters=payload?.filters&&typeof payload.filters==='object'?payload.filters:{},report=orders().profitReport(filters),result=testCancelDataSave?{canceled:true}:testDataDirectory?{canceled:false,filePath:path.join(path.resolve(testDataDirectory.slice('--orders-test-data-directory='.length)),'profit-export-test.xlsx')}:await saveDialog({title:'导出利润登记表',defaultPath:path.join(app.getPath('downloads'),`profit-report-${new Date().toISOString().slice(0,10)}.xlsx`),filters:[{name:'Excel工作簿',extensions:['xlsx']}]});if(result.canceled||!result.filePath)return {canceled:true};const destination=path.extname(result.filePath).toLowerCase()==='.xlsx'?result.filePath:`${result.filePath}.xlsx`,generated=await buildProfitWorkbookBuffer({report,includePending});await writeFile(destination,generated.buffer,{mode:0o600});return {canceled:false,filename:path.basename(destination),rows:generated.rows.length,summary:generated.summary};});
  if(process.env.NODE_ENV==='test'&&!testBrowserWorkspace){lifecycle('startup','正在创建验收窗口');await createWindow();}
  else{webServer=new LocalWebServer({rendererDirectory:path.resolve(app.getAppPath(),'renderer'),sourceDirectory:path.resolve(app.getAppPath(),'src'),productMediaDirectory:path.join(paths.base,'orders','product-media'),dispatch,log:lifecycle,preferredPort:(testMode||isolatedUserData)?0:PRODUCTION_WEB_PORT,tokenFile:testMode?null:path.join(paths.base,'local-web-token')});await webServer.start();if(!testBrowserWorkspace||testTrayBoundsFile){createTray();if(testTrayBoundsFile){await new Promise(resolve=>setTimeout(resolve,250));await writeFile(path.resolve(testTrayBoundsFile.slice('--orders-test-tray-bounds-file='.length)),JSON.stringify(tray.getBounds()),{encoding:'utf8',mode:0o600});}}}
  lifecycle('startup','应用启动完成');
}
if(!app.requestSingleInstanceLock())app.quit();else{
  process.on('uncaughtException',error=>nativeFailure('聊单助手发生未捕获错误',error));process.on('unhandledRejection',error=>nativeFailure('聊单助手发生未处理错误',error));
  app.on('second-instance',()=>{lifecycle('lifecycle','检测到第二次启动，打开管理页面');openDashboard().catch(error=>nativeFailure('无法打开管理页面',error));});
  openDashboard().catch(error=>nativeFailure('聊单助手启动失败',error));
  app.on('activate',()=>{lifecycle('lifecycle','收到macOS激活事件');openDashboard().catch(error=>nativeFailure('无法打开管理页面',error));});let quitReady=false,quitSaving=false;app.on('before-quit',event=>{if(!quitReady){event.preventDefault();if(quitSaving)return;quitSaving=true;Promise.all([window&&!window.isDestroyed()?window.webContents.executeJavaScript('window.flushAssistantWorkspaces?.()'):Promise.resolve(),webServer?.flushAssistantWorkspaces()]).then(async()=>{await Promise.all([orderApp?.assistant.online.stop(),whatsappBrowser?.close()]);}).then(()=>{quitReady=true;app.quit();}).catch(()=>{quitting=false;revealWindow();}).finally(()=>{quitSaving=false;});return;}quitting=true;clearInterval(priceCheckTimer);void whatsappBrowser?.close().catch(()=>{});void clearExcelSelections();restoreSelections.clear();orderApp?.invalidatePreviews();webServer?.close();closeKdocsWorkspace().catch(error=>lifecycle('KDocs工作区','关闭浏览器工作区失败',{message:error.message}));if(orderDatabase){orderDatabase.close();orderDatabase=null;}});app.on('window-all-closed',()=>{if((process.env.NODE_ENV==='test'&&!testBrowserWorkspace)||quitting)app.quit();});
}
