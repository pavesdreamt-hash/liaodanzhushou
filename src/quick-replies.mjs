import {readFile,mkdir,writeFile,rename,unlink} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

const invalid=message=>Object.assign(new Error(message),{code:'QUICK_REPLIES',stage:'常用话术'});
const validText=(value,max)=>typeof value==='string'&&value.trim().length>0&&value.length<=max;
const validId=value=>typeof value==='string'&&/^[a-f0-9-]{36}$/.test(value);
export class QuickReplies {
 constructor(userDataPath){this.file=path.join(userDataPath,'config','quick-replies.json');this.queue=Promise.resolve();}
 serial(operation){const result=this.queue.then(operation);this.queue=result.catch(()=>{});return result;}
 async read(){
  let raw;try{raw=await readFile(this.file,'utf8');}catch(error){if(error.code==='ENOENT')return {version:1,revision:0,items:[]};throw invalid('无法读取常用话术，请稍后重新读取。');}
  try{const value=JSON.parse(raw);if(value.version!==1||!Number.isSafeInteger(value.revision)||value.revision<0||!Array.isArray(value.items)||value.items.length>200||new Set(value.items.map(r=>r?.id)).size!==value.items.length||value.items.some(r=>!validId(r?.id)||!validText(r?.title,80)||!validText(r?.text,6000)))throw Error();return value;}catch{throw invalid('常用话术文件格式异常，原文件已保留，请勿覆盖。');}
 }
 list(){return this.serial(()=>this.read());}
 async write(state){const pending=this.file+'.'+randomUUID()+'.pending';try{await mkdir(path.dirname(this.file),{recursive:true,mode:0o700});await writeFile(pending,JSON.stringify(state,null,2),{mode:0o600,flag:'wx'});await rename(pending,this.file);}catch{await unlink(pending).catch(()=>{});throw invalid('常用话术保存失败，原有内容已保留，请重试。');}return state;}
 mutate(payload,remove){return this.serial(async()=>{
  const keys=remove?['id','revision']:['id','revision','title','text'];if(!payload||Object.keys(payload).some(k=>!keys.includes(k))||!Number.isSafeInteger(payload.revision)||payload.revision<0||payload.id!==undefined&&!validId(payload.id))throw invalid('常用话术参数无效。');
  if(remove&&!validId(payload.id))throw invalid('请选择需要删除的常用话术。');
  if(!remove&&(!validText(payload.title,80)||!validText(payload.text,6000)))throw invalid('请填写名称和话术内容；名称最多80字，内容最多6000字。');
  const state=await this.read();if(state.revision!==payload.revision)throw invalid('常用话术已变化，请重新读取后再保存；当前输入已保留。');
  const index=state.items.findIndex(r=>r.id===payload.id);if(payload.id&&index<0)throw invalid('这条常用话术已不存在，请重新读取。');
  if(remove)state.items.splice(index,1);else{
   const title=payload.title.trim(),text=payload.text.trim();if(state.items.some(r=>r.id!==payload.id&&r.title.toLocaleLowerCase()===title.toLocaleLowerCase()))throw invalid('已有同名话术，请修改名称或编辑原话术。');
   const row={id:payload.id||randomUUID(),title,text};if(index>=0)state.items[index]=row;else{if(state.items.length>=200)throw invalid('最多保存200条常用话术，请先删除不用的内容。');state.items.push(row);}
  }
  state.revision++;return this.write(state);
 });}
 save(payload){return this.mutate(payload,false);}
 remove(payload){return this.mutate(payload,true);}
}
