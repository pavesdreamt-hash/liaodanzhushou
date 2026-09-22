import path from 'node:path';
import {mkdir,readFile,writeFile,rename,unlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';

// A separate local catalogue: attaching images never changes stock, cost or product prices.
export class ManualProductImages {
  constructor(directory,{profiles=()=>[],encode}={}){this.directory=directory;this.profiles=profiles;this.encode=encode;this.queue=Promise.resolve();}
  async records(){try{return JSON.parse(await readFile(path.join(this.directory,'manual-images.json'),'utf8'));}catch(error){if(error.code==='ENOENT')return [];throw error;}}
  async commit(records){await mkdir(this.directory,{recursive:true});const temp=path.join(this.directory,`manual-images-${randomUUID()}.tmp`);await writeFile(temp,JSON.stringify(records),{mode:0o600});await rename(temp,path.join(this.directory,'manual-images.json'));}
  mutate(operation){const next=this.queue.then(operation);this.queue=next.catch(()=>{});return next;}
  async list(query=''){
    const q=String(query).slice(0,100).trim().toLowerCase(),rows=await this.records();
    for(const p of this.profiles())for(const key of p.imagePaths||[])if(/^product-media:product-[a-f0-9-]+\.jpg$/i.test(key))rows.push({id:key,sku:p.businessId,name:p.displayName||p.businessId,file:key.slice(14),readonly:true});
    const result=[];
    for(const row of rows.filter(r=>!q||`${r.sku} ${r.name}`.toLowerCase().includes(q)).slice(0,60)){
      if(!/^(manual|product)-[a-f0-9-]+\.jpg$/i.test(row.file))continue;
      try{const bytes=await readFile(path.join(this.directory,row.file));if(bytes.length<=2_000_000)result.push({...row,dataUrl:`data:image/jpeg;base64,${bytes.toString('base64')}`});}catch(error){if(error.code!=='ENOENT')throw error;}
    }
    return result;
  }
  add(payload){return this.mutate(async()=>{
    const sku=String(payload?.sku||'').trim().slice(0,80),name=String(payload?.name||sku).trim().slice(0,120),data=payload?.dataUrl;
    if(!sku||typeof data!=='string'||data.length>3_000_000||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(data))throw new Error('商品编号或图片无效');
    const bytes=this.encode(data);if(!bytes?.length||bytes.length>2_000_000)throw new Error('无法读取图片，请选择较小的 JPG、PNG 或 WebP 图片');
    const records=await this.records();if(records.length>=240)throw new Error('本机图片库已满，请先移除不需要的图片');
    const id=randomUUID(),file=`manual-${id}.jpg`;await mkdir(this.directory,{recursive:true});await writeFile(path.join(this.directory,file),bytes,{mode:0o600});
    const row={id,sku,name,file};try{await this.commit([...records,row]);}catch(error){await unlink(path.join(this.directory,file)).catch(()=>{});throw error;}return {...row,dataUrl:`data:image/jpeg;base64,${bytes.toString('base64')}`};
  });}
  remove(id){return this.mutate(async()=>{const records=await this.records(),row=records.find(r=>r.id===id);if(!row)return false;await this.commit(records.filter(r=>r.id!==id));if(/^manual-[a-f0-9-]+\.jpg$/i.test(row.file))await unlink(path.join(this.directory,row.file)).catch(()=>{});return true;});}
}
