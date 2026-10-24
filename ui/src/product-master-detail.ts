import {dialog,trapDialogFocus} from './live-dialog';
import {localProductCall} from './inventory-product-actions';
import {confirmLocalPrice} from './local-price-warning';
type Options={doc:Document;row:()=>any;changed:()=>void;error:(message:string)=>void;tools:HTMLElement;action:(label:string,fn:()=>unknown,kind?:'dialog'|'task')=>HTMLButtonElement;link:()=>unknown;importWebsite:()=>unknown};
const esc=(s:any)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const text=(v:any)=>v===null||v===undefined||v===''?'待填写':String(v);
const plain=(s:any)=>String(s??'').replace(/<br\s*\/?\s*>|<\/p>/gi,'\n').replace(/<[^>]*>/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&');
const points=(s:any)=>{try{const p=typeof s==='string'?JSON.parse(s):s;if(Array.isArray(p))return p.map(v=>[v.key,v.value].filter(Boolean).join('：')).join('\n');}catch{}return plain(s);};
const labels:Record<string,string>={name:'商品名称',salePriceAed:'产品售价',availability:'库存状态',sellingPoints:'产品卖点',description:'产品介绍'};
export function installMasterDetail(o:Options){
 const {doc}=o,root=doc.querySelector<HTMLElement>('#ui032')!,stack=root.querySelector<HTMLElement>('.stack')!,area=doc.createElement('div'),media=doc.createElement('div'),extra=doc.createElement('div');root.classList.add('local-first-detail');area.className='master-panels';media.className='master-media-actions';extra.className='master-extra-actions';
 for(const el of [...stack.children] as HTMLElement[])el.hidden=true;stack.append(area);root.querySelector('.gallery')!.append(media);root.querySelector('.left-info')!.append(extra);
 root.querySelector('.product-heading-line')!.append(o.tools);
 const btn=(label:string,fn:()=>void)=>{const b=doc.createElement('button');b.type='button';b.textContent=label;b.onclick=fn;return b;};
 function edit(key:string){void(async()=>{try{const info=await localProductCall('website-info',{key:o.row().key}),row=info.row,d=dialog(doc,'修改本机'+labels[key]),field=doc.createElement('label'),input=doc.createElement(key==='availability'?'select':['sellingPoints','description'].includes(key)?'textarea':'input') as HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement,bar=doc.createElement('footer');let busy=false;
 field.textContent=labels[key]+(key==='salePriceAed'?'（AED）':'');input.setAttribute('aria-label',field.textContent);input.value=String(row.master[key]??'');if(key==='availability'){for(const v of ['有货','无货','待核对'])input.append(new Option(v,v));input.value=row.master.availability;}if(key==='salePriceAed'){const n=input as HTMLInputElement;n.type='number';n.min='0';n.max='10000000';n.step='0.01';n.required=true;}if(key==='name')(input as HTMLInputElement).required=true;field.append(input);
 const cancel=btn('取消',()=>d.box.close()),save=btn('保存到本机',()=>void(async()=>{if(busy||!input.reportValidity())return;busy=true;save.disabled=cancel.disabled=true;try{const approval=key==='salePriceAed'?await confirmLocalPrice(doc,input.value,row.costPriceAed):null;if(approval===false)return;await localProductCall('master-save',{key:row.key,fingerprint:info.fingerprint,changes:{[key]:input.value},priceApproval:approval});d.box.close();o.changed();}catch(e){d.result.textContent=(e as Error).message;}finally{busy=false;save.disabled=cancel.disabled=false;}})());save.className='primary';bar.append(cancel,save);d.box.append(field,bar);d.box.addEventListener('cancel',e=>{if(busy)e.preventDefault();});trapDialogFocus(d.box);d.box.showModal();input.focus();}catch(e){o.error((e as Error).message);}})();}
 async function synchronize(direction:'to-website'|'to-local'){
  try{
   if(!o.row().remoteProductId){if(direction==='to-website')return o.importWebsite();throw Error('请先关联网站商品');}
   const info=await localProductCall('master-read',{key:o.row().key});o.error('');o.changed();
   const row=info.row,m=row.master,w=row.website,d=dialog(doc,direction==='to-website'?'本机 → 网站':'网站 → 本机'),body=doc.createElement('div'),bar=doc.createElement('footer');
   d.box.classList.add('master-sync-dialog');let busy=false,stale=false;
   const variants=w.variants||[],selection=doc.createElement('label'),variant=doc.createElement('select');selection.textContent='网站规格';variant.setAttribute('aria-label','网站规格');
   if(variants.length!==1)variant.append(new Option(variants.length?'请选择要同步的网站规格':'暂无可用规格',''));
   for(const v of variants)variant.append(new Option(v.skuCode||v.name||v.id,v.id));selection.append(variant);body.append(selection);
   const inputs=new Map<string,HTMLInputElement>(),websiteName=doc.createElement('input'),quantity=doc.createElement('input'),availability=doc.createElement('select');
   websiteName.value=w.sourceName||m.name;websiteName.maxLength=240;websiteName.setAttribute('aria-label','目标网站名称');quantity.type='number';quantity.min='0';quantity.max='1000000';quantity.step='1';quantity.setAttribute('aria-label','目标网站库存件数');
   for(const v of ['有货','无货','待核对'])availability.append(new Option(v,v));availability.value=m.availability;availability.setAttribute('aria-label','目标本机库存状态');
   const webPrice=()=>variants.find((v:any)=>v.id===variant.value)?.salePrice,webStock=()=>variants.find((v:any)=>v.id===variant.value)?.stockQuantity;
   const fillQuantity=()=>quantity.value=String(variant.value?(m.availability==='无货'?0:webStock()??''):'');fillQuantity();
   for(const key of Object.keys(labels)){
    const line=doc.createElement('div'),label=doc.createElement('label'),check=doc.createElement('input'),value=doc.createElement('p');line.className='master-sync-field';check.type='checkbox';check.setAttribute('aria-label','同步'+labels[key]);inputs.set(key,check);label.append(check,doc.createTextNode(labels[key]));value.dataset.syncValue=key;line.append(label,value);
    if(key==='name'&&direction==='to-website')line.append(websiteName);if(key==='availability')line.append(direction==='to-website'?quantity:availability);body.append(line);
   }
   const webValue=(key:string)=>key==='name'?w.sourceName:key==='salePriceAed'?webPrice():key==='availability'?webStock():key==='sellingPoints'?points(w.sourceShortDescription):plain(w.sourceLongDescription).trim();
   const targetValue=(key:string)=>direction==='to-website'?(key==='name'?websiteName.value.trim():key==='availability'?Number(quantity.value):m[key]):(key==='availability'?availability.value:webValue(key));
   const differs=(key:string)=>targetValue(key)!==(direction==='to-website'?webValue(key):m[key]);
   const selected=()=>[...inputs].filter(([,v])=>v.checked).map(([k])=>k);
   const reason=()=>{
    if(stale)return '本次确认已失效。请关闭此窗口，刷新读取后重新核对。';
    const keys=selected();if(!keys.length)return '请勾选要同步的字段。';
    if(keys.some(k=>['salePriceAed','availability'].includes(k))&&!variant.value)return '请先选择明确的网站规格。';
    if(keys.includes('name')&&!String(targetValue('name')??'').trim())return '请填写有效的网站商品名称。';
    if(keys.includes('salePriceAed')){const v=targetValue('salePriceAed');if(v===null||v===undefined||!Number.isFinite(v)||v<0||v>10000000||Math.abs(v*100-Math.round(v*100))>0.00001)return '所选售价无效，请先核对售价（最多两位小数）。';}
    if(keys.includes('availability')&&direction==='to-website'&&(!quantity.value.trim()||!Number.isSafeInteger(Number(quantity.value))||Number(quantity.value)<0||Number(quantity.value)>1000000))return '请填写有效的网站库存件数（0～1000000的整数）。';
    if(!keys.some(differs))return '所选字段已一致，无需同步。';return '';
   };
   const cancel=btn('取消',()=>d.box.close()),yes=btn('确认同步',()=>void submit());yes.className='primary';
   function draw(){
    const why=reason();yes.disabled=busy||Boolean(why);cancel.disabled=busy;yes.title=why;d.result.textContent=busy?'正在提交并核对结果，请稍候…':why||'仅同步已勾选且有变化的字段；未勾选字段保持原值。';
    variant.disabled=busy||stale||variants.length<2;
    for(const [key,check]of inputs){check.disabled=busy||stale;const web=webValue(key),value=body.querySelector(`[data-sync-value="${key}"]`)!;value.textContent=`本机：${text(m[key])}　·　网站：${text(web)}${key==='availability'&&web!==undefined?' 件':''}${check.checked&&!differs(key)?'　·　已一致':''}`;}
    websiteName.disabled=busy||stale||!inputs.get('name')!.checked;quantity.disabled=availability.disabled=busy||stale||!inputs.get('availability')!.checked;
   }
   async function submit(){
    if(busy||reason())return;const fields=selected().filter(differs);busy=true;draw();
    try{
     const approval=fields.includes('salePriceAed')?await confirmLocalPrice(doc,targetValue('salePriceAed'),row.costPriceAed,direction==='to-website'?'website':'local'):null;if(approval===false)return;
     await localProductCall('master-sync',{key:row.key,fingerprint:info.fingerprint,direction,fields,variantId:variant.value,websiteName:websiteName.value,stockQuantity:quantity.value,availability:availability.value,priceApproval:approval,confirmed:true});d.box.close();o.changed();
    }catch(e){stale=true;busy=false;draw();d.result.textContent=(e as Error).message+' 请关闭此窗口，刷新读取后重新核对。';o.changed();}
    finally{busy=false;if(!stale)draw();}
   }
   variant.onchange=()=>{fillQuantity();draw();};body.addEventListener('input',draw);body.addEventListener('change',draw);bar.append(cancel,yes);d.box.append(body,bar);d.box.addEventListener('cancel',e=>{if(busy)e.preventDefault();});trapDialogFocus(d.box);draw();d.box.showModal();
  }catch(e){o.error((e as Error).message);return false;}
 }

 function render(){
  const row=o.row(),m=row.master,w=row.website;media.replaceChildren();extra.replaceChildren();
  const prior=[...o.tools.querySelectorAll<HTMLButtonElement>('button')],websiteActions=doc.createElement('div');websiteActions.className='master-website-actions';
  for(const b of prior){const label=b.dataset.actionLabel||'';if(['同步网站图片','添加本机图片','添加图片和视频'].includes(label))media.append(b);else if(['网站对应','关联网站商品','产品上架','产品下架','修改售价','修改库存','导入网站','核对导入结果'].includes(label)){if(row.remoteProductId||['关联网站商品','核对导入结果'].includes(label))websiteActions.append(b);}else if(['修改成本','选择来源资料'].includes(label))extra.append(b);}
  o.tools.replaceChildren(o.action('本机 → 网站',()=>synchronize('to-website')),o.action('网站 → 本机',()=>synchronize('to-local')),o.action('刷新读取',async()=>{await localProductCall('master-read',{key:row.key});o.error('');o.changed();},'task'));
  o.tools.querySelectorAll('button').forEach((b,i)=>{b.className='master-header-button';const icon=doc.createElement('i');icon.dataset.lucide=['upload','download','refresh-cw'][i];b.prepend(icon);});
  const block=(index:number,reason:string)=>{const b=o.tools.children[index] as HTMLButtonElement;b.disabled=true;b.dataset.operationDisabled='true';b.dataset.disabledReason=reason;b.dataset.tooltip=reason;b.title=reason;};
  if(!row.remoteProductId)block(1,'请先关联网站商品');
  if(row.syncRecovery?.pending)for(const i of [0,1])block(i,'上次同步尚未核对，请先点击“刷新读取”');
  const field=(key:string,local:boolean)=>`<div class="master-field"><h3>${key==='availability'?'库存数量':labels[key]}${key==='salePriceAed'?' <small>AED</small>':''}</h3><div class="master-value ${local?'is-local':''}"><span>${local?'本机':'网站'}</span><strong>${esc(text(local?m[key]:key==='name'?w?.sourceName:key==='salePriceAed'?w?.websitePriceAed:row.stockQuantity))}${!local&&key==='availability'&&row.stockQuantity!==null?' 件':''}</strong>${local?`<button type="button" data-master-edit="${key}" aria-label="修改本机${labels[key]}"><i data-lucide="pencil"></i></button>`:''}</div></div>`;
  area.innerHTML=`<section class="card master-source"><div class="card-head"><span class="card-title"><i data-lucide="table-2"></i>来源表价格与状态</span><span class="source-note">${row.sourceRow?'来源第 '+esc(row.sourceRow)+' 行':'来源待核对'}</span></div><div class="master-three">${[['成本价格',row.costPriceAed],['建议售价',row.suggestedPriceAed],['库存状态',row.sourceStock]].map(([k,v],i)=>`<div class="master-source-value"><span>${k}</span><strong>${esc(text(v))}${i<2&&v!==null?' <small>AED</small>':''}</strong></div>`).join('')}</div></section><section class="card master-local"><div class="card-head"><span class="card-title"><i data-lucide="file-text"></i>本机资料</span><span class="source-note">本机维护 · 按需同步</span></div><div class="master-three">${['name','salePriceAed','availability'].map(k=>field(k,true)).join('')}</div><div class="master-two">${['sellingPoints','description'].map(k=>`<div><h3>${labels[k]}<button type="button" data-master-edit="${k}" aria-label="修改本机${labels[k]}"><i data-lucide="pencil"></i></button></h3><div class="master-copy">${esc(text(m[k]))}</div></div>`).join('')}</div></section><section class="card master-website"><div class="card-head"><span class="card-title"><i data-lucide="globe"></i>网站发布</span><span class="source-note">${w?.updatedAt?'最近读取 '+esc(new Date(w.updatedAt).toLocaleString('zh-CN',{hour12:false})):'尚未关联网站'}</span></div>${w?`<div class="master-three">${['name','salePriceAed','availability'].map(k=>field(k,false)).join('')}</div><div class="master-copy-links"><button data-web-copy="sellingPoints">查看网站卖点</button><button data-web-copy="description">查看网站介绍</button><span>${row.publishStatus===1?'已上架':row.publishStatus===0?'已下架':'状态待读取'}</span></div>`:'<p class="master-empty">关联已有网站商品，或通过上方“本机 → 网站”新建。</p>'}</section>`;
  const recovery=row.syncRecovery,notice=doc.createElement('p');notice.className='master-sync-notice';notice.setAttribute('role','status');
  notice.textContent=recovery?.pending?'上次网站同步尚未核对，两个同步已暂停。请点击“刷新读取”，核对结果后重新选择字段。':({applied:'已重新读取：网站符合上次全部目标，无需重复提交。',unchanged:'已重新读取：网站与提交前一致。请核对资料，再选择需要同步的字段。',changed:'已重新读取：网站与上次目标不完全一致，可能仅部分提交成功或有其它修改。请逐项核对后重新选择字段。'} as Record<string,string>)[recovery?.outcome]||'';
  if(notice.textContent)area.querySelector('.master-website .card-head')!.after(notice);
  area.querySelector('.master-website')!.append(websiteActions);for(const b of area.querySelectorAll<HTMLButtonElement>('[data-master-edit]'))b.onclick=()=>edit(b.dataset.masterEdit!);for(const b of area.querySelectorAll<HTMLButtonElement>('[data-web-copy]'))b.onclick=()=>{const d=dialog(doc,b.textContent||''),p=doc.createElement('p');p.className='master-copy';p.textContent=b.dataset.webCopy==='sellingPoints'?points(w?.sourceShortDescription):plain(w?.sourceLongDescription);d.box.append(p,btn('关闭',()=>d.box.close()));trapDialogFocus(d.box);d.box.showModal();};
  const left=root.querySelector('.left-info')!,rows=[...left.querySelectorAll<HTMLElement>(':scope > .info-line')];for(const [i,[label,value]]of [['本机编号',row.code],['最后修改',row.local?.updatedAt?new Date(row.local.updatedAt).toLocaleString('zh-CN',{hour12:false}):'待保存本机主档'],['数据主档','本机']].entries()){rows[i].querySelector('span')!.textContent=label;rows[i].querySelector('strong')!.textContent=value;}
  if(!left.querySelector('.master-group-title')){const heading=doc.createElement('h3');heading.className='master-group-title';heading.innerHTML='<span>01</span>本机信息';left.prepend(heading);const h2=heading.cloneNode(true) as HTMLElement;h2.innerHTML='<span>02</span>来源与网站标识';left.querySelector('.product-identifiers')!.before(h2);}
  const status=root.querySelector('#u32-availability-label');if(status)status.textContent='本机'+m.availability;const badge=root.querySelector<HTMLElement>('#u32-availability-status');if(badge){badge.className='top-availability is-'+(m.availability==='有货'?'in':m.availability==='无货'?'out':'pending');badge.title='本机库存状态：'+m.availability;}root.querySelector('.subtitle')?.setAttribute('hidden','');
  (doc.defaultView as any)?.lucide?.createIcons({nodes:[root]});
 }
 return {render};
}
