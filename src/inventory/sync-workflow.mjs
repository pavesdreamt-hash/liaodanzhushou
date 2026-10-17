import path from 'node:path';
import {readJSON,writeJSON} from '../core/files.mjs';
export class ProductSyncWorkflow{
  constructor(paths){this.file=path.join(paths.state,'product-sync-workflow.json');this.queue=Promise.resolve();}
  async view(){const saved=await readJSON(this.file,{});return Object.fromEntries(Object.entries(saved).map(([key,value])=>[key,value.status==='running'?{...value,status:'failed',message:'上次操作未完成，请重新执行'}:value]));}
  async run(step,operation){
    const execute=async()=>{
      const state=await readJSON(this.file,{});state[step]={status:'running',at:new Date().toISOString()};await writeJSON(this.file,state);
      try{const result=await operation(),ok=(!result.outcome||result.outcome==='complete')&&!(step==='details'&&result.catalog?.refreshRun?.missing>0);state[step]={status:ok?'complete':'failed',at:new Date().toISOString(),sourceAt:result.sourceChanges?.report?.at||null,message:ok?'已完成':result.reason||'本次核对尚未完整完成'};await writeJSON(this.file,state);return {...result,workflow:await this.view()};}
      catch(error){state[step]={status:'failed',at:new Date().toISOString(),message:String(error?.message||error)};await writeJSON(this.file,state);throw error;}
    };
    const next=this.queue.then(execute,execute);this.queue=next.catch(()=>{});return next;
  }
}
