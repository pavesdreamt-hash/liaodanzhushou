import {createHash,randomUUID} from 'node:crypto';
import {createReadStream,constants} from 'node:fs';
import {copyFile,lstat,mkdir,mkdtemp,readFile,readdir,realpath,rename,rm,writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import os from 'node:os';
import path from 'node:path';

// Local drafts have their own IDs and store. A draft is never a website product,
// and website refresh/reconciliation must not create or remove these records.
export const LOCAL_PRODUCT_IMAGE_LIMIT=150000;
const imageTypes=new Set(['.jpg','.jpeg','.png','.webp','.gif','.bmp','.heic','.heif']);
const videoTypes=new Set(['.mp4','.mov','.m4v','.webm']);
const clone=value=>structuredClone(value);
const clean=(value,max=1000)=>String(value??'').trim().slice(0,max);
const normalized=value=>clean(value,240).normalize('NFKC').toUpperCase().replace(/[\s_-]+/gu,'');
const digest=value=>createHash('sha256').update(value).digest('hex');
const sourceFingerprint=rows=>digest(JSON.stringify(rows));
const blank=()=>({schemaVersion:1,products:[],imports:[]});
const amount=value=>{
  if(value===null||value===undefined||String(value).trim()==='')return null;
  const n=Number(value);return Number.isFinite(n)&&n>=0&&n<=10000000?Math.round(n*100)/100:null;
};
function sourceAmount(value){
  const raw=clean(value,200),match=raw.match(/^(?:AED\s*)?(\d+(?:,\d{3})*(?:\.\d{1,2})?)\s*(?:AED)?\s*([（(][^）)]*[）)])?$/iu);
  return match?{value:amount(match[1].replaceAll(',','')),note:match[2]||''}:{value:null,note:raw?'来源价格格式待确认':''};
}
function matchSource(name,rows){
  const matches=rows.filter(r=>!r.removed&&normalized(r.sourceName)===normalized(name));
  if(matches.length!==1||matches[0]?.hasConflictingBusinessFields||matches[0]?.identityUncertain)return {status:matches.length?'ambiguous':'unmatched',candidates:matches.map(r=>({sourceRow:r.sourceRow,sourceName:r.sourceName})),costPriceAed:null,suggestedPriceAed:null,sourceStock:null,description:'',notes:[],row:null};
  const row=matches[0],cost=sourceAmount(row.cost),suggested=sourceAmount(row.suggestedPrice);
  return {status:'matched',candidates:[],row:clone(row),costPriceAed:cost.value,suggestedPriceAed:suggested.value,sourceStock:['有货','无货'].includes(row.stock)?row.stock:null,description:clean(row.additionalInfo,30000),notes:[cost.note,suggested.note].filter(Boolean)};
}
const issues=p=>[...(p.source?.status!=='matched'?['来源资料待匹配']:[]),...(p.costPriceAed===null?['成本待填写']:[]),...(p.salePriceAed===null?['售价待填写']:[]),...(p.notes||[]),...(p.mediaErrors?.length?['部分媒体导入失败']:[])];
const summary=p=>({...clone(p),imageCount:p.images.length,videoCount:p.videos.length,pendingReasons:issues(p)});
async function fileHash(file){const hash=createHash('sha256');for await(const data of createReadStream(file))hash.update(data);return hash.digest('hex');}

export class LocalProducts {
  constructor({directory,sourceRows=async()=>[],encodeImage,now=()=>new Date()}={}){
    if(!directory)throw new Error('缺少本机商品保存目录');
    this.directory=directory;this.file=path.join(directory,'products.json');this.mediaDirectory=path.join(directory,'media');this.sourceRows=sourceRows;this.encodeImage=encodeImage;this.now=now;this.queue=Promise.resolve();this.plans=new Map();this.runs=new Map();
  }
  serial(fn){const next=this.queue.then(fn);this.queue=next.catch(()=>{});return next;}
  async load(){
    let doc;try{doc=JSON.parse(await readFile(this.file,'utf8'));}catch(e){if(e.code==='ENOENT')return blank();throw new Error('本机新增商品无法读取，原资料已保留');}
    if(doc.schemaVersion!==1||!Array.isArray(doc.products)||!Array.isArray(doc.imports))throw new Error('本机新增商品格式不正确，原资料已保留');return doc;
  }
  async persist(doc){await mkdir(this.directory,{recursive:true,mode:0o700});const temp=this.file+'.'+randomUUID()+'.pending';try{await writeFile(temp,JSON.stringify({...doc,revision:randomUUID()},null,2),{mode:0o600,flag:'wx'});await rename(temp,this.file);}catch(e){await rm(temp,{force:true}).catch(()=>{});throw e;}}
  async view(){const doc=await this.load(),products=doc.products.map(summary);return {products,imports:doc.imports.slice(0,20),activeRuns:[...this.runs.values()].filter(r=>r.status==='running').map(clone),missingImages:products.filter(p=>p.imageCount<5).map(p=>({id:p.id,name:p.name,imageCount:p.imageCount,missing:5-p.imageCount})),defaults:{stockQuantity:10,markupAed:220,imageMaxBytes:LOCAL_PRODUCT_IMAGE_LIMIT},sources:(await this.sourceRows()).map(row=>({sourceRow:row.sourceRow,sourceName:row.sourceName,cost:row.cost,suggestedPrice:row.suggestedPrice,stock:row.stock,additionalInfo:row.additionalInfo,hasConflictingBusinessFields:row.hasConflictingBusinessFields}))};}
  async files(folder){
    const found=[];
    const walk=async(current,depth)=>{if(depth>8)throw new Error('商品目录层级超过8层，请检查文件夹');for(const item of await readdir(current,{withFileTypes:true})){if(item.name.startsWith('.'))continue;const file=path.join(current,item.name);if(item.isSymbolicLink())continue;if(item.isDirectory())await walk(file,depth+1);else if(item.isFile()){const stat=await lstat(file),ext=path.extname(file).toLowerCase();found.push({path:file,name:path.relative(folder,file),size:stat.size,mtimeMs:stat.mtimeMs,kind:imageTypes.has(ext)?'image':videoTypes.has(ext)?'video':'other'});}}};
    await walk(folder,0);return found.sort((a,b)=>a.name.localeCompare(b.name,'zh-CN',{numeric:true}));
  }
  async planFolder(folder){
    const root=await realpath(folder),stat=await lstat(root);if(!stat.isDirectory())throw new Error('请选择包含各商品子文件夹的总文件夹');
    const rows=await this.sourceRows(),existing=(await this.load()).products,entries=(await readdir(root,{withFileTypes:true})).filter(d=>d.isDirectory()&&!d.name.startsWith('.')).sort((a,b)=>a.name.localeCompare(b.name,'en',{numeric:true}));
    if(!entries.length)throw new Error('没有找到商品子文件夹；每个商品应放在单独的子文件夹中');if(entries.length>1000)throw new Error('单批最多导入1000个商品文件夹');
    const products=[];for(const entry of entries){const folderPath=path.join(root,entry.name),files=await this.files(folderPath),source=matchSource(entry.name,rows),previous=existing.find(p=>p.importKey===normalized(entry.name)||normalized(p.name)===normalized(entry.name));products.push({folderName:entry.name,folderPath,files,source,existingId:previous?.id||null});}
    const token=randomUUID(),plan={token,createdAt:Date.now(),root,products,sourceFingerprint:sourceFingerprint(rows)};this.plans.set(token,plan);
    for(const [key,item]of this.plans)if(Date.now()-item.createdAt>1800000)this.plans.delete(key);
    return {token,folderName:path.basename(root),products:products.map(p=>({folderName:p.folderName,name:p.source.row?.sourceName||p.folderName.toUpperCase(),sourceStatus:p.source.status,sourceRow:p.source.row?.sourceRow||null,costPriceAed:p.source.costPriceAed,salePriceAed:p.source.costPriceAed===null?null:Math.round((p.source.costPriceAed+220)*100)/100,stockQuantity:10,imageCount:p.files.filter(f=>f.kind==='image').length,videoCount:p.files.filter(f=>f.kind==='video').length,notes:p.source.notes,existing:Boolean(p.existingId)}))};
  }
  startImport({token}={}){
    const plan=this.plans.get(token);if(!plan||Date.now()-plan.createdAt>1800000)throw new Error('目录检查已过期，请重新选择文件夹');this.plans.delete(token);
    const run={id:randomUUID(),status:'running',total:plan.products.length,processed:0,added:0,skipped:0,mediaFailed:0,failed:[],current:'准备导入',at:this.now().toISOString()};this.runs.set(run.id,run);
    this.serial(()=>this.importPlan(plan,run)).catch(e=>{run.status='failed';run.error=e.message;});return clone(run);
  }
  progress({id}={}){const run=this.runs.get(id);if(!run)throw new Error('没有找到该次导入进度，请重新查看本机商品');return clone(run);}
  async copyMedia(product,files){
    const dir=path.join(this.mediaDirectory,product.id);await mkdir(dir,{recursive:true,mode:0o700});const errors=[];
    for(const file of files){if(file.kind==='other')continue;try{
      const stat=await lstat(file.path);if(!stat.isFile()||stat.isSymbolicLink()||stat.size!==file.size||stat.mtimeMs!==file.mtimeMs)throw new Error('原文件在检查后发生变化，请重新导入');
      const sha256=await fileHash(file.path),list=file.kind==='image'?product.images:product.videos;if(list.some(m=>m.originalSha256===sha256))continue;
      const ext=file.kind==='image'?'.jpg':path.extname(file.path).toLowerCase(),filename=sha256+ext,target=path.join(dir,filename);
      let meta={};if(file.kind==='image'){
        if(stat.size>100*1024*1024)throw new Error('图片超过100MB，待单独处理');
      const source=await readFile(file.path);if(digest(source)!==sha256)throw new Error('原图片在读取中变化，请重试');const encoded=await this.encodeImage?.(source,LOCAL_PRODUCT_IMAGE_LIMIT);if(!encoded?.bytes?.length||encoded.bytes.length>LOCAL_PRODUCT_IMAGE_LIMIT)throw new Error('无法生成150KB以内的图片');
        await writeFile(target,encoded.bytes,{mode:0o600});meta={byteLength:encoded.bytes.length,width:encoded.width,height:encoded.height,mimeType:'image/jpeg',sha256:digest(encoded.bytes)};
      }else{await copyFile(file.path,target,constants.COPYFILE_EXCL).catch(async e=>{if(e.code!=='EEXIST'||await fileHash(target)!==sha256)throw e;});if(await fileHash(target)!==sha256)throw new Error('视频副本校验失败');meta={byteLength:stat.size,sha256,mimeType:ext==='.mov'?'video/quicktime':ext==='.webm'?'video/webm':'video/mp4'};}
      list.push({file:filename,name:file.name,originalPath:file.path,originalByteLength:stat.size,originalSha256:sha256,...meta});
    }catch(e){errors.push({name:file.name,reason:e.message});}}
    return errors;
  }
  async importPlan(plan,run){
    if(sourceFingerprint(await this.sourceRows())!==plan.sourceFingerprint)throw new Error('来源资料已更新，请重新检查文件夹后导入');
    const doc=await this.load();
    for(const item of plan.products){
      run.current=item.folderName;
      const existing=doc.products.find(p=>p.importKey===normalized(item.folderName)||normalized(p.name)===normalized(item.folderName));
      if(existing){run.skipped++;run.processed++;continue;}
      const s=item.source,at=this.now().toISOString(),p={id:randomUUID(),importKey:normalized(item.folderName),name:s.row?.sourceName||item.folderName.toUpperCase(),productNumber:'',source:{status:s.status,row:s.row,candidates:s.candidates,snapshotFingerprint:plan.sourceFingerprint},costPriceAed:s.costPriceAed,suggestedPriceAed:s.suggestedPriceAed,salePriceAed:s.costPriceAed===null?null:Math.round((s.costPriceAed+220)*100)/100,stockQuantity:10,sourceStock:s.sourceStock,description:s.description,notes:s.notes,images:[],videos:[],mediaErrors:[],folderPath:item.folderPath,remoteProductId:null,state:'local-draft',createdAt:at,updatedAt:at};p.productNumber='LOCAL-'+p.id.slice(0,8).toUpperCase();
      try{p.mediaErrors=await this.copyMedia(p,item.files);doc.products.push(p);try{await this.persist(doc);}catch(e){doc.products.pop();throw e;}run.added++;run.mediaFailed+=p.mediaErrors.length;}
      catch(e){await rm(path.join(this.mediaDirectory,p.id),{recursive:true,force:true}).catch(()=>{});run.failed.push({name:item.folderName,reason:e.message});}
      run.processed++;
    }
    run.current='';run.status=run.failed.length||run.mediaFailed?'partial':'complete';run.finishedAt=this.now().toISOString();doc.imports.unshift({...clone(run),folderName:path.basename(plan.root)});doc.imports=doc.imports.slice(0,30);await this.persist(doc);
  }
  async save(payload={}){return this.serial(async()=>{
    const doc=await this.load(),previous=payload.id?doc.products.find(p=>p.id===payload.id):null;if(payload.id&&!previous)throw new Error('该本机商品已不存在，请刷新列表');if(previous&&payload.expectedUpdatedAt!==previous.updatedAt)throw new Error('商品已被其它操作更新，请重新打开后再保存');
    const name=clean(payload.name,240);if(!name)throw new Error('请填写商品名称');if(doc.products.some(p=>p.id!==previous?.id&&normalized(p.name)===normalized(name)))throw new Error('已有同名本机商品，请编辑原商品');
    const cost=amount(payload.costPriceAed),sale=amount(payload.salePriceAed),stock=Number(payload.stockQuantity??10);if(payload.costPriceAed!==''&&payload.costPriceAed!==null&&payload.costPriceAed!==undefined&&cost===null)throw new Error('成本格式不正确');if(payload.salePriceAed!==''&&payload.salePriceAed!==null&&payload.salePriceAed!==undefined&&sale===null)throw new Error('售价格式不正确');if(payload.stockQuantity!==undefined&&payload.stockQuantity!==null&&String(payload.stockQuantity).trim()===''||!Number.isSafeInteger(stock)||stock<0||stock>1000000)throw new Error('库存需要填写0至1000000的整数，不能留空');
    const at=new Date(Math.max(this.now().getTime(),Date.parse(previous?.updatedAt||0)+1||0)).toISOString(),id=previous?.id||randomUUID(),p=previous?clone(previous):{id,productNumber:'LOCAL-'+id.slice(0,8).toUpperCase(),images:[],videos:[],mediaErrors:[],remoteProductId:null,state:'local-draft',createdAt:at,source:{status:'unmatched',row:null},notes:[]};
    if(payload.sourceRow!==undefined){const wanted=payload.sourceRow===''||payload.sourceRow===null?null:Number(payload.sourceRow),rows=await this.sourceRows(),candidates=rows.filter(r=>r.sourceRow===wanted);if(wanted!==null&&candidates.length!==1)throw new Error('所选来源记录已变化，请重新选择');if(wanted!==null){const row=candidates[0];if(row.hasConflictingBusinessFields)throw new Error('该来源存在冲突，请先核对来源资料');p.source={status:'matched',row:clone(row),candidates:[],manuallyConfirmed:true};p.sourceStock=row.stock;p.suggestedPriceAed=sourceAmount(row.suggestedPrice).value;p.notes=[sourceAmount(row.cost).note,sourceAmount(row.suggestedPrice).note].filter(Boolean);}else p.source={status:'unmatched',row:null};}
    Object.assign(p,{name,costPriceAed:cost,salePriceAed:sale,stockQuantity:stock,description:clean(payload.description,30000),updatedAt:at});if(previous)doc.products[doc.products.indexOf(previous)]=p;else doc.products.push(p);await this.persist(doc);return summary(p);
  });}
  async setWebsite(id,{expectedUpdatedAt,remoteProductId,websiteImport}={}){return this.serial(async()=>{
    const doc=await this.load(),p=doc.products.find(p=>p.id===id);if(!p||p.updatedAt!==expectedUpdatedAt)throw Error('商品已更新，请重新打开后操作');
    if(remoteProductId!==undefined)p.remoteProductId=remoteProductId===null?null:String(remoteProductId);
    if(websiteImport!==undefined)p.websiteImport=websiteImport;
    p.updatedAt=new Date(Math.max(this.now().getTime(),Date.parse(p.updatedAt)+1)).toISOString();await this.persist(doc);return summary(p);
  });}
  async addMedia(id,paths){return this.serial(async()=>{const doc=await this.load(),p=doc.products.find(p=>p.id===id);if(!p)throw new Error('请先保存本机商品');const files=[];for(const file of paths){const stat=await lstat(file),ext=path.extname(file).toLowerCase();if(!stat.isFile()||stat.isSymbolicLink())continue;files.push({path:file,name:path.basename(file),size:stat.size,mtimeMs:stat.mtimeMs,kind:imageTypes.has(ext)?'image':videoTypes.has(ext)?'video':'other'});}const errors=await this.copyMedia(p,files);p.mediaErrors=errors;p.updatedAt=this.now().toISOString();await this.persist(doc);return summary(p);});}
  async detail(id){const p=(await this.load()).products.find(p=>p.id===id);if(!p)throw new Error('本机商品不存在');return summary(p);}
  async retryMedia(id){return this.serial(async()=>{const doc=await this.load(),p=doc.products.find(p=>p.id===id);if(!p?.folderPath)throw new Error('该商品没有原始目录，请使用“添加图片和视频”');p.mediaErrors=await this.copyMedia(p,await this.files(p.folderPath));p.updatedAt=this.now().toISOString();await this.persist(doc);return summary(p);});}
  async missingImagesTxt(){const {missingImages}=await this.view();return {filename:'图片不足5张的本机商品.txt',content:'商品名称\t现有图片\t需补图片\r\n'+missingImages.map(p=>`${p.name}\t${p.imageCount}\t${p.missing}`).join('\r\n')+'\r\n',count:missingImages.length};}
}

// Electron nativeImage is injected so the same rules run in the production
// handler and packaged import. No edits are made to source photos or videos.
export async function encodeLocalProductImage(nativeImage,bytes,maxBytes=LOCAL_PRODUCT_IMAGE_LIMIT){
  let original=nativeImage.createFromBuffer(bytes);
  // nativeImage decodes PNG/JPEG, but local folders can include GIF or HEIC.
  // macOS ImageIO converts only a temporary copy; it never writes the original.
  if(original.isEmpty()&&process.platform==='darwin'){
    const dir=await mkdtemp(path.join(os.tmpdir(),'liaodan-product-image-'));
    try{const source=path.join(dir,'original.image'),output=path.join(dir,'converted.png');await writeFile(source,bytes,{mode:0o600});await promisify(execFile)('/usr/bin/sips',['-s','format','png',source,'--out',output],{timeout:20000,maxBuffer:1024*1024,windowsHide:true});original=nativeImage.createFromBuffer(await readFile(output));}
    catch{throw new Error('图片无法解码；请检查原图片格式');}finally{await rm(dir,{recursive:true,force:true});}
  }
  if(original.isEmpty())throw new Error('图片无法解码');const size=original.getSize();if(!size.width||!size.height)throw new Error('图片尺寸无效');
  let limit=Math.min(2000,Math.max(size.width,size.height));
  for(let step=0;step<18;step++){
    const scale=Math.min(1,limit/Math.max(size.width,size.height)),width=Math.max(1,Math.round(size.width*scale)),height=Math.max(1,Math.round(size.height*scale)),image=scale<1?original.resize({width,height,quality:'best'}):original;
    for(const quality of [90,82,74,66,56,45]){const output=image.toJPEG(quality);if(output.length&&output.length<=maxBytes)return {bytes:output,width,height};}
    limit=Math.max(32,Math.floor(limit*.8));
  }
  throw new Error('图片无法压缩到150KB以内');
}
