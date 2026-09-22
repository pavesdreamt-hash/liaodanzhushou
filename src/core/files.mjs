import {mkdir,open,readFile,rename,unlink,readdir,writeFile,stat,copyFile} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import path from 'node:path';
export async function ensureDirectories(base){
  const paths={base,profile:path.join(base,'kdocs-profile'),snapshots:path.join(base,'snapshots'),failed:path.join(base,'failed'),
    backups:path.join(base,'backups'),logs:path.join(base,'logs'),plans:path.join(base,'sync-plans'),state:path.join(base,'state'),diagnostics:path.join(base,'diagnostics')};
  await Promise.all(Object.values(paths).map(directory=>mkdir(directory,{recursive:true})));return paths;
}
export async function atomicWrite(file,content,{mode=0o600}={}){
  await mkdir(path.dirname(file),{recursive:true});const temp=path.join(path.dirname(file),`.${path.basename(file)}.${randomUUID()}.tmp`);
  const handle=await open(temp,'wx',mode);try{await handle.writeFile(content);await handle.sync();}finally{await handle.close();}
  try{await rename(temp,file);}finally{await unlink(temp).catch(e=>{if(e.code!=='ENOENT')throw e;});}
}
export const writeJSON=(file,value)=>atomicWrite(file,JSON.stringify(value,null,2)+'\n');
export async function readJSON(file,fallback=null){try{return JSON.parse(await readFile(file,'utf8'));}catch(error){if(error.code==='ENOENT')return fallback;throw error;}}
export function timestampName(prefix,date=new Date()){
  const p=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',fractionalSecondDigits:3,hour12:false}).formatToParts(date);
  const get=t=>p.find(x=>x.type===t)?.value;return `${prefix}_${get('year')}-${get('month')}-${get('day')}_${get('hour')}${get('minute')}${get('second')}_${get('fractionalSecond')}_${randomUUID().slice(0,8)}.json`;
}
export const stableHash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export async function appendLog(file,entry){
  await mkdir(path.dirname(file),{recursive:true});const line=JSON.stringify(entry).replace(/Bearer\s+[^\s"<>]+/gi,'Bearer [已隐藏]')+'\n';
  const handle=await open(file,'a',0o600);try{await handle.writeFile(line);}finally{await handle.close();}
}
export async function copyProfileIfEmpty(source,destination){
  try{if((await readdir(destination)).length)return false;}catch{}
  try{if(!(await stat(source)).isDirectory())return false;}catch{return false;}
  const skip=new Set(['SingletonCookie','SingletonLock','SingletonSocket','DevToolsActivePort']);
  async function copyDir(from,to){await mkdir(to,{recursive:true});for(const e of await readdir(from,{withFileTypes:true})){if(skip.has(e.name))continue;const a=path.join(from,e.name),b=path.join(to,e.name);if(e.isDirectory())await copyDir(a,b);else if(e.isFile())await copyFile(a,b);}}
  await copyDir(source,destination);return true;
}
export async function listJSON(directory,prefix){return (await readdir(directory).catch(()=>[])).filter(n=>n.startsWith(prefix)&&n.endsWith('.json')).sort();}
export async function writeDiagnosticZipManifest(paths,file){
  // Cross-platform ZIP export uses this explicit manifest to keep
  // selection explicit so tokens/cookies/profile can never be added accidentally.
  const entries=[];for(const dir of [paths.logs,paths.failed,paths.plans])for(const name of await readdir(dir).catch(()=>[]))entries.push(path.join(dir,name));
  await writeFile(file,entries.join('\n')+'\n',{mode:0o600});return entries;
}
