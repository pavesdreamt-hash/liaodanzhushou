import JSZip from 'jszip';
import {readdir,readFile,lstat} from 'node:fs/promises';
import path from 'node:path';
import {atomicWrite} from './files.mjs';

export async function zipDiagnosticDirectory(directory,destination){
 const zip=new JSZip();let total=0;
 async function add(dir,prefix){for(const item of await readdir(dir,{withFileTypes:true})){
  const file=path.join(dir,item.name),name=prefix+'/'+item.name;
  if(item.isDirectory())await add(file,name);
  else if(item.isFile()){const size=(await lstat(file)).size;total+=size;if(total>100*1024*1024)throw new Error('诊断报告超过100MB，请先清理旧诊断日志后重试');zip.file(name,await readFile(file));}
 }}
 await add(directory,path.basename(directory));await atomicWrite(destination,await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}));
 return {file:destination};
}
