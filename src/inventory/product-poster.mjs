import {readFile} from 'node:fs/promises';

export async function readPosterTemplate(file){
  let bytes;
  try{bytes=await readFile(file);}catch{throw new Error('默认工厂与配送宣传图片缺失，请重新安装完整版本');}
  if(bytes.length<100||bytes.length>10*1024*1024||bytes[0]!==0xff||bytes[1]!==0xd8||bytes.at(-2)!==0xff||bytes.at(-1)!==0xd9)throw new Error('默认工厂与配送宣传图片损坏，请重新安装完整版本');
  return {footer:`data:image/jpeg;base64,${bytes.toString('base64')}`};
}

// Poster membership is deliberately based on the saved source stock and saved
// local media only. Website stock, publication and network state are irrelevant.
export function posterCandidates(view){
  const rows=Array.isArray(view?.rows)?view.rows:[];
  const inStock=rows.filter(row=>row.sourceStock==='有货');
  const eligible=inStock.filter(row=>Array.isArray(row.images)&&row.images.length>0&&row.images[0]?.file);
  return {
    sourceCapturedAt:view?.sourceCapturedAt||null,
    sourceQuality:view?.sourceQuality===true,
    sourceInStock:inStock.length,
    eligible:eligible.map(row=>({key:row.key,code:String(row.code||'').trim(),name:String(row.sourceName||row.local?.name||row.websiteName||row.code||'').trim(),sourceRow:row.sourceRow,image:row.images[0]})),
    missingImage:inStock.filter(row=>!eligible.includes(row)).map(row=>({key:row.key,code:row.code})),
    unresolved:rows.filter(row=>row.sourceStock!=='有货'&&row.sourceStock!=='无货').length
  };
}

export const posterManifest=items=>items.map(p=>`${p.key}:${p.image.file}:${p.image.sha256||''}`).join('|');

export function decodePosterExport(payload,current){
  const pages=payload?.pages;
  if(!Array.isArray(pages)||pages.length<1||pages.length>24)throw new Error('请生成1至24张合集图');
  if(!current.sourceCapturedAt||current.sourceCapturedAt!==payload.sourceCapturedAt||posterManifest(current.eligible)!==payload.manifest)throw new Error('来源状态或本机图片已有变化，请重新打开合集图再导出');
  let total=0;
  return pages.map((item,index)=>{
    if(typeof item!=='string'||!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/u.test(item)||item.length>36*1024*1024)throw new Error(`第${index+1}张图片格式或大小无效`);
    const bytes=Buffer.from(item.slice('data:image/jpeg;base64,'.length),'base64');total+=bytes.length;
    if(total>96*1024*1024)throw new Error('图片总大小超过96MB，请减少张数后重试');
    if(bytes.length<100||bytes.length>27*1024*1024||bytes[0]!==0xff||bytes[1]!==0xd8||bytes.at(-2)!==0xff||bytes.at(-1)!==0xd9)throw new Error(`第${index+1}张图片未完整生成`);
    return bytes;
  });
}
