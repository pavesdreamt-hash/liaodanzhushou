import path from 'node:path';
import {collectKdocs} from '../source/collector.mjs';
import {loginKdocs} from '../source/browser.mjs';
import {parseMappingRows,reconcileMappings,applyWizardAnswers} from '../mapping/mapping.mjs';
import {buildSyncPlan,planFileView} from '../sync/plan.mjs';
import {readWorkbook,ensureHeaders} from '../google/workbook.mjs';
import {executeTransaction} from '../google/transaction.mjs';
import {TARGET_SPREADSHEET_ID,TARGET_SPREADSHEET_URL,TARGET_TITLE} from '../config.mjs';
import {readJSON,writeJSON,listJSON,timestampName,appendLog,stableHash} from '../core/files.mjs';
import {unlink} from 'node:fs/promises';
import {AppError,publicError} from '../core/errors.mjs';
import {LocalInventoryStore} from '../inventory/local-store.mjs';
const GOOGLE_AUTH_ERROR_CODES=new Set(['GOOGLE_AUTH_EXPIRED','GOOGLE_INVALID_GRANT','GOOGLE_NOT_CONNECTED','GOOGLE_REFRESH_TOKEN_MISSING','TOKEN_DECRYPT_FAILED']);
export function isGoogleAuthorizationError(error){const code=error?.code||'',message=String(error?.message||'');return GOOGLE_AUTH_ERROR_CODES.has(code)||(code==='GOOGLE_API_FAILED'&&/\binvalid_grant\b/i.test(message));}
export class Orchestrator {
  constructor({paths,oauth,sheets,notify=()=>{}}){this.paths=paths;this.oauth=oauth;this.sheets=sheets;this.notify=notify;this.running=false;this.pending=null;this.pendingStorage='google';this.localStore=new LocalInventoryStore(paths);this.stateFile=path.join(paths.state,'app-state.json');this.pendingFile=path.join(paths.state,'pending-sync.json');}
  async log(stage,message,metrics={}){await appendLog(path.join(this.paths.logs,`${new Date().toISOString().slice(0,10)}.jsonl`),{timestamp:new Date().toISOString(),stage,message,metrics});}
  progress(value){const event={at:new Date().toISOString(),...value};this.notify(event);this.log(event.stage,event.message,{currentRow:event.currentRow,endRow:event.endRow}).catch(()=>{});}
  async state(){return await readJSON(this.stateFile,{lastSuccessfulSync:null,lastCheck:null,productCount:0,kdocsLoggedIn:false,latest:null});}
  async loadPending(){if(this.pending)return this.pending;const saved=await readJSON(this.pendingFile,null);if(saved?.source?.capturedAt&&saved?.mappingState?.rows&&saved?.plan?.schemaVersion===1){this.pending={...saved,storage:saved.storage||'google'};this.pendingStorage=this.pending.storage;}return this.pending;}
  mappingSummary(mappingState){return {total:mappingState?.total||0,automatic:mappingState?.automatic||0,needsConfirmation:mappingState?.needsConfirmation||0,pendingNumber:mappingState?.pendingNumber||0,firstRun:Boolean(mappingState?.firstRun)};}
  async status(){const [state,storedGoogle,pending,local]=await Promise.all([this.state(),this.oauth.status(),this.loadPending(),this.localStore.getView()]),authorizationInvalid=storedGoogle.needsReconnect||state.googleAuthorization?.status==='invalid'||isGoogleAuthorizationError(state.latest?.error),google={...storedGoogle,connected:storedGoogle.connected&&!authorizationInvalid,needsReconnect:Boolean(authorizationInvalid)};return {...state,google,targetUrl:TARGET_SPREADSHEET_URL,busy:this.running,pending:pending?planFileView(pending.plan):null,mapping:pending?this.mappingSummary(pending.mappingState):state.mapping||null,localInventory:{updatedAt:local.updatedAt,latestCapturedAt:local.latestCollection?.capturedAt||null,historyCount:local.retention.historyCount,retention:local.retention}};}
  async localInventory(){return await this.localStore.getView();}
  async login(){if(this.running)throw new AppError('已有任务正在运行',{stage:'KDocs登录',code:'BUSY'});this.running=true;try{const result=await loginKdocs(this.paths.profile,'https://www.kdocs.cn/l/ccFsTP9rvhmp',{onProgress:v=>this.progress(v)});
    const state=await this.state();state.kdocsLoggedIn=true;await writeJSON(this.stateFile,state);return result;}finally{this.running=false;}}
  async connectGoogle(){if(this.running)throw new AppError('已有任务正在运行',{stage:'Google授权',code:'BUSY'});this.running=true;try{
    this.progress({stage:'Google授权',message:'正在启动安全授权流程...'});await this.oauth.connect();
    this.progress({stage:'Google测试',message:'正在读取目标Google Sheet元数据...'});const metadata=await this.sheets.metadata(TARGET_SPREADSHEET_ID);
    if(metadata.spreadsheetId!==TARGET_SPREADSHEET_ID||metadata.properties?.title!==TARGET_TITLE)throw new AppError(`目标表格不是“${TARGET_TITLE}”`,{stage:'Google测试',code:'WRONG_SPREADSHEET'});
    const sheets=(metadata.sheets||[]).map(sheet=>sheet.properties?.title).filter(Boolean);this.oauth.reportStatus('oauth-sheets-test-succeeded','Google Sheets真实读取成功',{title:metadata.properties.title,sheetCount:sheets.length});
    const state=await this.state(),verifiedAt=new Date().toISOString();if(isGoogleAuthorizationError(state.latest?.error))state.latest=null;state.googleAuthorization={status:'verified',verifiedAt};await writeJSON(this.stateFile,state);
    this.progress({stage:'Google测试',message:`✅ 已连接，表格名称：${metadata.properties.title}`});return {connected:true,title:metadata.properties.title,sheets};
  }finally{this.running=false;}}
  async latestSource(){
    const files=(await listJSON(this.paths.snapshots,'source_')).reverse();for(const name of files){const value=await readJSON(path.join(this.paths.snapshots,name));if(value?.quality?.passed)return value;}return null;
  }
  async preparePending(source,{writePlan=true,useGoogle=null}={}){
    const shouldUseGoogle=useGoogle===null?Boolean((await this.oauth.status()).connected):Boolean(useGoogle);
    this.pendingStorage=shouldUseGoogle?'google':'local';
    this.progress({stage:shouldUseGoogle?'Google读取':'本地读取',message:shouldUseGoogle?'正在读取商品映射和库存情况（最长20秒）...':'正在读取本地商品映射和库存情况...'});
    const workbook=ensureHeaders(shouldUseGoogle?await readWorkbook(this.sheets,TARGET_SPREADSHEET_ID):await this.localStore.workbook());this.progress({stage:'商品映射',message:'正在检查商品映射...'});const existing=parseMappingRows(workbook.mapping),mappingState=reconcileMappings(source.products,existing);
    const plan=buildSyncPlan({sourceSnapshot:source,mappingState,inventoryValues:workbook.inventory,mappingValuesBefore:workbook.mapping,metadata:workbook.metadata});
    this.pending={source,mappingState,workbook,plan,storage:this.pendingStorage};await writeJSON(this.pendingFile,this.pending);if(writePlan)await writeJSON(path.join(this.paths.plans,timestampName('plan')),planFileView(plan));
    const state=await this.state(),now=new Date().toISOString();await writeJSON(this.stateFile,{...state,lastCheck:now,productCount:source.quality.namedProducts,kdocsLoggedIn:true,
      collection:{status:'success',capturedAt:source.capturedAt,products:source.quality.namedProducts,endpoint:source.quality.endpoint},mapping:this.mappingSummary(mappingState),googleWrite:shouldUseGoogle?'尚未执行':'未连接（将保存本地）',localWrite:'尚未保存',workflow:plan.requiresInput||plan.firstSync?'waiting_confirmation':'ready'});return this.pending;
  }
  async mappingStatus(){
    try{let pending=await this.loadPending();if(!pending){const source=await this.latestSource();if(!source)return {status:'not-generated',sourceAvailable:false};pending=await this.preparePending(source);}
      const summary=this.mappingSummary(pending.mappingState);return {status:pending.plan.requiresInput||pending.plan.firstSync?'pending':'clear',summary,
        warnings:pending.source?.quality?.warnings||[],mapping:{...summary,review:pending.mappingState.review||[],rows:pending.mappingState.rows||[]},plan:planFileView(pending.plan)};
    }catch(error){if(isGoogleAuthorizationError(error)){const state=await this.state(),invalidAt=new Date().toISOString();state.googleAuthorization={status:'invalid',invalidAt,code:'GOOGLE_AUTH_EXPIRED'};state.latest={ok:false,error:publicError(error),at:invalidAt};await writeJSON(this.stateFile,state);}throw error;}
  }
  async sync(){
    if(this.running)throw new AppError('库存同步正在运行，请稍候',{stage:'启动同步',code:'BUSY'});
    this.running=true;this.pending=null;
    try{
      const googleConnected=Boolean((await this.oauth.status()).connected),previous=await this.latestSource();this.progress({stage:'KDocs采集',message:'正在打开KDocs...'});
      const source=await collectKdocs({profile:this.paths.profile,paths:this.paths,previous,onProgress:v=>this.progress(v)});
      await this.localStore.recordCollection(source.snapshot);
      this.progress({stage:'商品映射',message:'正在检查商品映射...'});const {mappingState,plan}=await this.preparePending(source.snapshot,{useGoogle:googleConnected});
      if(mappingState.firstRun||plan.requiresInput){this.progress({stage:'同步计划',message:mappingState.firstRun?'首次映射准备完成，等待一次确认':'发现待编号或待确认商品'});return {action:mappingState.firstRun?'first-confirmation':'mapping-input',warnings:source.snapshot.quality.warnings||[],plan:planFileView(plan),mapping:mappingState};}
      return await this.executePending();
    }catch(error){const state=await this.state(),failedAt=new Date().toISOString();if(error.code==='KDOCS_LOGIN_REQUIRED')state.kdocsLoggedIn=false;if(isGoogleAuthorizationError(error))state.googleAuthorization={status:'invalid',invalidAt:failedAt,code:'GOOGLE_AUTH_EXPIRED'};state.latest={ok:false,error:publicError(error),at:failedAt};await writeJSON(this.stateFile,state);throw error;
    }finally{this.running=false;}
  }
  async submitMapping(answers,{confirmFirstSync=false}={}){
    await this.loadPending();if(!this.pending)throw new AppError('没有等待确认的同步计划，请先完成一次库存采集',{stage:'商品映射',code:'NO_PENDING_PLAN'});
    const mappingState=applyWizardAnswers(this.pending.mappingState,answers);const plan=buildSyncPlan({sourceSnapshot:this.pending.source,mappingState,
      inventoryValues:this.pending.workbook.inventory,mappingValuesBefore:this.pending.workbook.mapping,metadata:this.pending.workbook.metadata});
    this.pending={...this.pending,mappingState,plan};await writeJSON(this.pendingFile,this.pending);if(plan.requiresInput)return {action:'mapping-input',warnings:this.pending.source?.quality?.warnings||[],plan:planFileView(plan),mapping:mappingState};
    if(plan.firstSync&&!confirmFirstSync)return {action:'first-confirmation',warnings:this.pending.source?.quality?.warnings||[],plan:planFileView(plan),mapping:mappingState};
    this.running=true;try{return await this.executePending();}catch(error){const old=await this.state(),failedAt=new Date().toISOString();if(isGoogleAuthorizationError(error))old.googleAuthorization={status:'invalid',invalidAt:failedAt,code:'GOOGLE_AUTH_EXPIRED'};await writeJSON(this.stateFile,{...old,googleWrite:'失败',workflow:'waiting_confirmation',latest:{ok:false,at:failedAt,error:publicError(error)}});throw error;}finally{this.running=false;}
  }
  async executePending(){
    if(!this.pending)throw new Error('同步计划不存在');const {source,mappingState,plan}=this.pending,storage=this.pending.storage||this.pendingStorage||'google';
    this.progress({stage:'同步计划',message:`同步计划：${plan.counts.total}条，成本${plan.counts.costChanged}，售价${plan.counts.priceChanged}，库存${plan.counts.stockChanged}`});
    let transaction={mode:'local',skippedGoogle:true};
    if(storage==='google')transaction=await executeTransaction({client:this.sheets,spreadsheetId:TARGET_SPREADSHEET_ID,paths:this.paths,plan,onProgress:v=>this.progress(v)});
    this.progress({stage:'本地保存',message:'正在保存本地库存和采集历史...'});
    const local=await this.localStore.commit({source,mappingState,plan});
    const oldState=await this.state(),now=new Date().toISOString(),result={ok:true,at:now,sourceCapturedAt:source.capturedAt,productCount:source.quality.namedProducts,
      status:plan.formalChanged?'changed':'unchanged',message:plan.formalChanged?(storage==='google'?'同步完成并已保存本地':'本地保存完成'):'没有发现变化，本次未增加历史版本',summary:plan.summary,detail:plan.detail,transaction,local:{updatedAt:local.updatedAt,historyCount:local.retention.historyCount}};
    const previousBaseline=await readJSON(path.join(this.paths.state,'baseline.json'));
    await writeJSON(path.join(this.paths.state,'baseline.json'),{schemaVersion:2,status:'baseline',updatedAt:now,versionAt:plan.formalChanged?now:previousBaseline?.versionAt||now,
      sourceSnapshot:source.capturedAt,mappingHash:stableHash(mappingState.rows),historyHeaders:plan.formalChanged?plan.historyHeaders:previousBaseline?.historyHeaders||[],products:plan.inventoryAfter});
    await writeJSON(path.join(this.paths.state,'latest-result.json'),result);await writeJSON(this.stateFile,{...oldState,kdocsLoggedIn:true,lastCheck:now,lastSuccessfulSync:now,
      productCount:source.quality.namedProducts,collection:{status:'success',capturedAt:source.capturedAt,products:source.quality.namedProducts,endpoint:source.quality.endpoint},mapping:this.mappingSummary(mappingState),googleWrite:storage==='google'?'已完成':'未连接（已跳过）',localWrite:'已完成',workflow:'complete',latest:result});this.pending=null;await unlink(this.pendingFile).catch(error=>{if(error.code!=='ENOENT')throw error;});this.progress({stage:'完成',message:plan.formalChanged?'✅ 保存完成':'✅ 检查完成，没有发现变化'});return {action:'complete',result};
  }
  async recent(){return await readJSON(path.join(this.paths.state,'latest-result.json'),null);}
}
