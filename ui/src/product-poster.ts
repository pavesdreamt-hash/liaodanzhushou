import {dialog,trapDialogFocus} from './live-dialog';
import {localProductCall} from './inventory-product-actions';

type Product={key:string;code:string;name:string;sourceRow:number|null;image:{file:string;kind:string;url?:string;localId?:string;remoteProductId?:string;sha256?:string}};
type Plan={sourceCapturedAt:string|null;sourceQuality:boolean;sourceInStock:number;eligible:Product[];missingImage:{key:string;code:string}[];unresolved:number};
type Settings={title:string;mode:'all'|'category';sheets:number;orientation:'landscape'|'portrait';color:string;categories:Record<string,string>;assets:Record<string,string>};
const key='liaodan-product-poster-v1';
const defaults=():Settings=>({title:'现货商品合集',mode:'all',sheets:1,orientation:'landscape',color:'#50127d',categories:{},assets:{}});
const read=():Settings=>{try{const value=JSON.parse(localStorage.getItem(key)||'null');return value&&typeof value==='object'?{...defaults(),...value,categories:value.categories||{},assets:value.assets||{}}:defaults();}catch{return defaults();}};
const save=(value:Settings)=>{try{localStorage.setItem(key,JSON.stringify(value));}catch{throw Error('本机海报设置保存空间不足，请移除不用的背景或底部素材后重试');}};
const el=<K extends keyof HTMLElementTagNameMap>(doc:Document,tag:K,text='',className='')=>{const node=doc.createElement(tag);node.textContent=text;if(className)node.className=className;return node;};
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));

export function posterPages(products:Product[],settings:Settings){
  const count=clamp(Math.floor(Number(settings.sheets)||1),1,24),groups=settings.mode==='category'?[...new Set(products.map(p=>settings.categories[p.key]?.trim()||'未分类'))].map(name=>({name,items:products.filter(p=>(settings.categories[p.key]?.trim()||'未分类')===name)})):[{name:'',items:products}];
  const pages:{name:string;items:Product[]}[]=[];
  for(const group of groups){for(let i=0;i<count;i++){const start=Math.floor(group.items.length*i/count),end=Math.floor(group.items.length*(i+1)/count);if(end>start)pages.push({name:group.name,items:group.items.slice(start,end)});}}
  if(pages.length>24)throw Error('分类与张数合计超过24张，请减少每类张数');
  return pages;
}

const loadImage=(url:string)=>new Promise<HTMLImageElement>((resolve,reject)=>{
  const image=new Image(),timer=setTimeout(()=>{image.onload=image.onerror=null;image.src='';reject(Error('图片读取超时'));},15000);
  image.onload=()=>{clearTimeout(timer);resolve(image);};image.onerror=()=>{clearTimeout(timer);reject(Error('图片读取失败'));};image.src=url;
});
async function loadProductImage(product:Product){
  if(product.image.kind==='local'&&product.image.url)return loadImage(product.image.url);
  if(product.image.kind!=='website-cache'||!product.image.remoteProductId)throw Error('缺少本机图片对应信息');
  // These are Shoplus images already saved locally, not the separate chat attachment cache.
  let response=await window.shopPlusProductPilot?.localMedia({remoteProductId:product.image.remoteProductId,primaryOnly:true});
  if(!response?.ok)throw Error(response?.error?.message||'本机图片读取失败');
  // The inventory may select the next saved photo when an earlier file is absent.
  if(!(response.data as any)?.images?.some((v:any)=>v.file===product.image.file))response=await window.shopPlusProductPilot?.localMedia({remoteProductId:product.image.remoteProductId,primaryOnly:false});
  if(!response?.ok)throw Error(response?.error?.message||'本机图片读取失败');
  const images=(response.data as any)?.images||[],image=images.find((v:any)=>v.file===product.image.file);
  if(!image?.dataUrl||product.image.sha256&&image.sha256!==product.image.sha256)throw Error('图片已变化或无法读取，请重新打开合集图');
  return loadImage(image.dataUrl);
}
const cover=(ctx:CanvasRenderingContext2D,image:CanvasImageSource,width:number,height:number,x:number,y:number,w:number,h:number)=>{const iw=(image as HTMLImageElement).naturalWidth||width,ih=(image as HTMLImageElement).naturalHeight||height,scale=Math.max(w/iw,h/ih),sw=w/scale,sh=h/scale;ctx.drawImage(image,(iw-sw)/2,(ih-sh)/2,sw,sh,x,y,w,h);};
const contain=(ctx:CanvasRenderingContext2D,image:HTMLImageElement,x:number,y:number,w:number,h:number)=>{const scale=Math.min(w/image.naturalWidth,h/image.naturalHeight);ctx.drawImage(image,x+(w-image.naturalWidth*scale)/2,y+(h-image.naturalHeight*scale)/2,image.naturalWidth*scale,image.naturalHeight*scale);};
async function raster(file:File,{cropFooter=false}={}){
  if(file.size>40*1024*1024)throw Error('素材超过40MB，请选择较小图片');
  // Decode a bounded working copy: the reference poster can be 11811px square.
  let bitmap:ImageBitmap|null=null,image:CanvasImageSource,width:number,height:number;
  try{bitmap=await createImageBitmap(file,{resizeWidth:1800});image=bitmap;width=bitmap.width;height=bitmap.height;}
  catch{const raw=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(Error('素材无法读取'));reader.readAsDataURL(file);});const fallback=await loadImage(raw);image=fallback;width=fallback.naturalWidth;height=fallback.naturalHeight;}
  const canvas=document.createElement('canvas'),sourceY=cropFooter?Math.floor(height*.79):0,sourceHeight=height-sourceY,scale=Math.min(1,1800/width,900/sourceHeight);
  try{canvas.width=Math.max(1,Math.floor(width*scale));canvas.height=Math.max(1,Math.floor(sourceHeight*scale));const ctx=canvas.getContext('2d')!;ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,sourceY,width,sourceHeight,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/jpeg',.84);}finally{bitmap?.close();}
}
const chooseFile=(doc:Document)=>new Promise<File|null>(resolve=>{const input=doc.createElement('input');input.type='file';input.accept='image/*';input.hidden=true;input.onchange=()=>{const file=input.files?.[0]||null;input.remove();resolve(file);};input.addEventListener('cancel',()=>{input.remove();resolve(null)},{once:true});doc.body.append(input);input.click();});

async function drawPoster(canvas:HTMLCanvasElement,page:{name:string;items:Product[]},settings:Settings,number:number,total:number){
  const landscape=settings.orientation==='landscape',w=canvas.width,h=canvas.height,ctx=canvas.getContext('2d',{alpha:false})!;
  ctx.fillStyle=settings.color;ctx.fillRect(0,0,w,h);
  const background=settings.assets.background;if(background){const image=await loadImage(background);cover(ctx,image,image.naturalWidth,image.naturalHeight,0,0,w,h);ctx.fillStyle='#2c0a5288';ctx.fillRect(0,0,w,h);}
  let footerSource=settings.assets.footer;
  if(!footerSource&&!settings.assets.factory&&!settings.assets.delivery){
    const template=await localProductCall('poster-template') as {footer:string};
    if(!template?.footer)throw Error('默认工厂与配送宣传图片无法读取，请重新安装完整版本');
    footerSource=template.footer;
  }
  const footerImage=footerSource?await loadImage(footerSource):null;
  const scale=w/(landscape?6000:4200),header=350*scale,footer=footerImage?Math.min(h*.35,w*footerImage.naturalHeight/footerImage.naturalWidth):landscape?820*scale:1000*scale,pad=110*scale,gap=16*scale;
  ctx.fillStyle='#180a2aa8';ctx.fillRect(0,0,w,header);
  ctx.fillStyle='#fff';ctx.textAlign='center';ctx.font=`700 ${148*scale}px -apple-system, PingFang SC, sans-serif`;ctx.fillText(settings.title||'现货商品合集',w/2,205*scale,w-2*pad);
  ctx.font=`500 ${58*scale}px -apple-system, PingFang SC, sans-serif`;ctx.fillText([page.name,`现货 ${page.items.length} 款`,total>1?`${number}/${total}`:''].filter(Boolean).join('  ·  '),w/2,286*scale,w-2*pad);
  const areaY=header+36*scale,areaH=h-header-footer-68*scale,areaW=w-2*pad,ratio=landscape?1.27:.8,columns=Math.max(1,Math.ceil(Math.sqrt(page.items.length*areaW/areaH/ratio))),rows=Math.ceil(page.items.length/columns),cellW=Math.min((areaW-gap*(columns-1))/columns,680*scale),cellH=Math.min((areaH-gap*(rows-1))/rows,740*scale),gridLeft=(w-columns*cellW-(columns-1)*gap)/2;
  const failures:{index:number;code:string}[]=[];let next=0;
  const drawItem=async(p:Product,i:number)=>{
    const col=i%columns,row=Math.floor(i/columns),x=gridLeft+col*(cellW+gap),y=areaY+row*(cellH+gap),labelH=clamp(cellH*.21,38*scale,84*scale),pictureH=cellH-labelH;
    let image:HTMLImageElement|null=null;
    try{image=await loadProductImage(p);}catch{failures.push({index:i,code:p.code||p.name});}
    ctx.fillStyle='#fffffff0';ctx.beginPath();ctx.roundRect(x,y,cellW,cellH,14*scale);ctx.fill();
    if(image){contain(ctx,image,x+12*scale,y+10*scale,cellW-24*scale,pictureH-18*scale);image.src='';}
    else{ctx.fillStyle='#a13a3a';ctx.textAlign='center';ctx.font=`500 ${clamp(labelH*.5,22*scale,40*scale)}px -apple-system, PingFang SC, sans-serif`;ctx.fillText('图片待修复',x+cellW/2,y+pictureH/2,cellW-20*scale);}
    ctx.fillStyle='#3c165e';ctx.textAlign='center';ctx.font=`700 ${clamp(labelH*.57,25*scale,46*scale)}px -apple-system, PingFang SC, sans-serif`;ctx.fillText(p.code||p.name,x+cellW/2,y+pictureH+labelH*.66,cellW-12*scale);
  };
  await Promise.all(Array.from({length:Math.min(6,page.items.length)},async()=>{while(next<page.items.length){const index=next++;await drawItem(page.items[index],index);}}));
  const fy=h-footer;ctx.fillStyle='#fff';ctx.fillRect(0,fy,w,footer);
  // A reference footer contains text and certificates: preserve the entire strip.
  if(footerImage){contain(ctx,footerImage,0,fy,w,footer);footerImage.src='';}
  else{
    const panels=[{name:'工厂直供',sub:'Factory Direct',asset:settings.assets.factory},{name:'快速配送',sub:'Fast Delivery',asset:settings.assets.delivery}];
    panels.forEach((_part,i)=>{const x=i*w/2;ctx.fillStyle=i?'#7a174d':'#32105c';ctx.fillRect(x,fy,w/2,footer);});
    for(let i=0;i<2;i++){const part=panels[i],x=i*w/2;if(part.asset){const image=await loadImage(part.asset);cover(ctx,image,image.naturalWidth,image.naturalHeight,x,fy,w/2,footer);ctx.fillStyle='#180622aa';ctx.fillRect(x,fy,w/2,footer);}ctx.fillStyle='#fff';ctx.textAlign='center';ctx.font=`700 ${104*scale}px -apple-system, PingFang SC, sans-serif`;ctx.fillText(part.name,x+w/4,fy+footer*.54,w/2-90*scale);ctx.font=`500 ${57*scale}px -apple-system, sans-serif`;ctx.fillText(part.sub,x+w/4,fy+footer*.69,w/2-90*scale);}
  }
  return failures.sort((a,b)=>a.index-b.index).map(f=>f.code);
}

export async function openProductPoster(doc:Document){
  const {box,result}=dialog(doc,'制作现货商品合集图'),settings=read();box.classList.add('product-poster-dialog');
  const summary=el(doc,'p','正在读取本机来源状态和图片…','product-poster-summary'),body=el(doc,'div','','product-poster-body'),controls=el(doc,'section','','product-poster-controls'),preview=el(doc,'section','','product-poster-preview'),canvas=el(doc,'canvas') as HTMLCanvasElement,pageNav=el(doc,'div','','product-poster-page-nav'),categoryList=el(doc,'div','','product-poster-category-list'),footer=el(doc,'footer'),close=el(doc,'button','关闭'),previewButton=el(doc,'button','生成预览'),exportButton=el(doc,'button','导出 JPG 图片');
  let plan:Plan|null=null,pages:{name:string;items:Product[]}[]=[],active=0,busy=false,previewReady=false;
  const setBusy=(value:boolean)=>{busy=value;for(const input of box.querySelectorAll<HTMLInputElement|HTMLButtonElement|HTMLSelectElement>('input,select,button'))input.disabled=value;previewButton.disabled=value||!pages.length;exportButton.disabled=value||!previewReady||!pages.length;};
  const persist=()=>{previewReady=false;try{save(settings);result.textContent='设置已更改，请重新生成预览后导出。';}catch(error){result.textContent=(error as Error).message;}setBusy(false);};
  const field=(label:string,input:HTMLElement)=>{const wrap=el(doc,'label',label);wrap.append(input);controls.append(wrap);return wrap;};
  const title=el(doc,'input') as HTMLInputElement;title.value=settings.title;title.maxLength=32;title.onchange=()=>{settings.title=title.value.trim()||'现货商品合集';persist();};field('标题',title);
  const mode=el(doc,'select') as HTMLSelectElement;for(const [value,label] of [['all','全部商品'],['category','按分类']] as const){const option=el(doc,'option',label);option.value=value;mode.append(option);}mode.value=settings.mode;mode.onchange=()=>{settings.mode=mode.value as Settings['mode'];persist();renderPages();};field('排版方式',mode);
  const sheets=el(doc,'input') as HTMLInputElement;sheets.type='number';sheets.min='1';sheets.max='24';sheets.value=String(settings.sheets);sheets.onchange=()=>{settings.sheets=clamp(Number(sheets.value)||1,1,24);sheets.value=String(settings.sheets);persist();renderPages();};field('张数（按分类时为每类）',sheets);
  const orientation=el(doc,'select') as HTMLSelectElement;for(const [value,label] of [['landscape','横向'],['portrait','竖向']] as const){const option=el(doc,'option',label);option.value=value;orientation.append(option);}orientation.value=settings.orientation;orientation.onchange=()=>{settings.orientation=orientation.value as Settings['orientation'];persist();};field('画面方向',orientation);
  const color=el(doc,'input') as HTMLInputElement;color.type='color';color.value=settings.color;color.oninput=()=>{settings.color=color.value;persist();};field('背景颜色',color);
  const assetBar=el(doc,'div','','product-poster-assets');controls.append(el(doc,'h3','图片素材'),assetBar);
  for(const [kind,label,crop] of [['background','更换背景',false],['footer','从样图提取底部',true],['factory','工厂照片',false],['delivery','配送照片',false]] as const){const button=el(doc,'button',label);button.type='button';button.onclick=async()=>{if(busy)return;setBusy(true);try{const file=await chooseFile(doc);if(!file)return;settings.assets[kind]=await raster(file,{cropFooter:crop});if(kind==='factory'||kind==='delivery')delete settings.assets.footer;persist();result.textContent=`已保存${label}，请重新生成预览。`;}catch(error){result.textContent=(error as Error).message;}finally{setBusy(false);}};assetBar.append(button);}
  const clearAssets=el(doc,'button','清除自选素材');clearAssets.type='button';clearAssets.onclick=()=>{settings.assets={};persist();result.textContent='已恢复默认背景和工厂、证书、配送宣传图，请重新生成预览。';};assetBar.append(clearAssets);
  const categories=el(doc,'details','','product-poster-categories'),categoryTitle=el(doc,'summary','商品分类（可选）'),search=el(doc,'input') as HTMLInputElement;search.placeholder='搜索编号或名称';categories.append(categoryTitle,search,categoryList);controls.append(categories);
  const categoryRows=()=>{categoryList.replaceChildren();if(!plan)return;const q=search.value.trim().toLowerCase();for(const p of plan.eligible.filter(p=>!q||`${p.code} ${p.name}`.toLowerCase().includes(q)).slice(0,300)){const line=el(doc,'label'),name=el(doc,'span',p.code+' · '+p.name),input=el(doc,'input') as HTMLInputElement;input.placeholder='未分类';input.maxLength=30;input.value=settings.categories[p.key]||'';input.onchange=()=>{const value=input.value.trim();if(value)settings.categories[p.key]=value;else delete settings.categories[p.key];persist();renderPages();};line.append(name,input);categoryList.append(line);}};search.oninput=categoryRows;
  const previewTitle=el(doc,'h3','预览'),previewInfo=el(doc,'p','选择设置后生成预览'),canvasWrap=el(doc,'div','','product-poster-canvas-wrap');canvasWrap.append(canvas);preview.append(previewTitle,previewInfo,canvasWrap,pageNav);body.append(controls,preview);
  const renderPages=()=>{if(!plan)return;try{pages=posterPages(plan.eligible,settings);active=clamp(active,0,Math.max(0,pages.length-1));pageNav.replaceChildren();for(let i=0;i<pages.length;i++){const button=el(doc,'button',String(i+1));button.type='button';button.setAttribute('aria-current',String(i===active));button.onclick=()=>{active=i;void renderPreview();};pageNav.append(button);}previewInfo.textContent=`共 ${pages.length} 张 · 当前预览第 ${active+1} 张 · ${pages[active]?.items.length||0} 款`;exportButton.disabled=busy||!previewReady||!pages.length;}catch(error){pages=[];previewInfo.textContent=(error as Error).message;exportButton.disabled=true;}};
  const renderPreview=async()=>{
    if(busy||!pages.length)return;previewReady=false;setBusy(true);result.textContent='正在绘制预览…';
    const working=doc.createElement('canvas');
    try{
      working.width=settings.orientation==='landscape'?1200:840;working.height=settings.orientation==='landscape'?840:1200;
      const failed=await drawPoster(working,pages[active],settings,active+1,pages.length);
      canvas.width=working.width;canvas.height=working.height;canvas.getContext('2d')!.drawImage(working,0,0);
      previewReady=failed.length===0;
      result.textContent=failed.length?`${failed.length} 款图片无法读取：${failed.join('、')}。其余商品已正常预览；请在图片管理中修复后重新生成，当前不可导出。`:'预览已更新；确认后可导出高清 JPG。';
      renderPages();
    }catch(error){result.textContent=(error as Error).message+'；预览未完成，当前不可导出。';}
    finally{working.width=working.height=1;setBusy(false);}
  };
  previewButton.type=exportButton.type=close.type='button';exportButton.className='primary';previewButton.onclick=()=>void renderPreview();
  exportButton.onclick=async()=>{if(busy||!previewReady||!plan||!pages.length)return;setBusy(true);try{const fresh=await localProductCall('poster-plan') as Plan,manifest=(items:Product[])=>items.map(p=>`${p.key}:${p.image.file}:${p.image.sha256||''}`).join('|'),oldManifest=manifest(plan.eligible),newManifest=manifest(fresh.eligible);if(fresh.sourceCapturedAt!==plan.sourceCapturedAt||newManifest!==oldManifest)throw Error('来源状态或本机图片已有变化，请关闭后重新打开合集图再导出');const output:string[]=[];for(let i=0;i<pages.length;i++){result.textContent=`正在生成第 ${i+1}/${pages.length} 张高清图片…`;await new Promise<void>(resolve=>setTimeout(resolve,0));const page=doc.createElement('canvas');page.width=settings.orientation==='landscape'?6000:4200;page.height=settings.orientation==='landscape'?4200:6000;const failed=await drawPoster(page,pages[i],settings,i+1,pages.length);if(failed.length){page.width=page.height=1;throw Error('图片无法读取：'+failed.join('、')+'，未导出。请修复后重新生成预览');}output.push(page.toDataURL('image/jpeg',.88));page.width=page.height=1;}result.textContent='图片已生成，请选择保存位置…';const saved=await localProductCall('poster-export',{pages:output,sourceCapturedAt:plan.sourceCapturedAt,manifest:oldManifest}) as {canceled:boolean;files?:string[]};result.textContent=saved.canceled?'已取消保存，原资料未改变。':`已保存 ${saved.files?.length||0} 张图片：${saved.files?.join('；')}`;}catch(error){previewReady=false;result.textContent=(error as Error).message;}finally{setBusy(false);}};
  close.onclick=()=>{if(!busy)box.close();};box.addEventListener('cancel',event=>{if(busy)event.preventDefault();});footer.append(previewButton,exportButton,close);box.append(summary,body,footer);trapDialogFocus(box);box.showModal();previewButton.disabled=exportButton.disabled=true;
  try{plan=await localProductCall('poster-plan') as Plan;summary.textContent=`来源有货 ${plan.sourceInStock} 款 · 有本机图片可入图 ${plan.eligible.length} 款 · 缺图 ${plan.missingImage.length} 款 · 来源状态待核对 ${plan.unresolved} 款${plan.sourceCapturedAt?' · 来源快照 '+new Date(plan.sourceCapturedAt).toLocaleString('zh-CN'):''}`;if(!plan.sourceCapturedAt)summary.textContent+='。请先同步来源表。';if(!plan.sourceQuality)summary.textContent+='；来源快照质量未确认，请核对。';if(!plan.eligible.length){previewInfo.textContent='暂无可合成商品：需来源表明确有货，且本机已经保存图片。';previewButton.disabled=exportButton.disabled=true;}else{categoryRows();renderPages();await renderPreview();}}catch(error){summary.textContent='本机商品读取失败：'+(error as Error).message;previewButton.disabled=exportButton.disabled=true;}
}
