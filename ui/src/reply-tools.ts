import {loadReplies,openReplySettings,fillTemplate,orderFields} from './message-templates';
import {installManualChat} from './manual-chat-ui';
import {installManualTranslation} from './manual-translation';
type Picture={id:string;sku?:string;name:string;dataUrl:string;readonly?:boolean};
type NativeImages={request:(payload:unknown)=>Promise<{ok:boolean;data:unknown;error?:string}>};
const native=(window as Window&{manualProductImages?:NativeImages}).manualProductImages;
export async function catalogue(action:string,values:Record<string,unknown>={}):Promise<Picture[]>{
  if(native){const result=await native.request({action,...values});if(!result.ok)throw new Error(result.error||'图片库读取失败');return result.data as Picture[];}
  // Browser preview storage. The packaged app uses its persistent native catalogue.
  const key='liaodan.product-images.v1',all:Picture[]=JSON.parse(window.localStorage.getItem(key)||'[]');
  if(action==='add'){all.push(values.image as Picture);window.localStorage.setItem(key,JSON.stringify(all));}
  if(action==='remove')window.localStorage.setItem(key,JSON.stringify(all.filter(p=>p.id!==values.id)));
  const query=String(values.query||'').toLowerCase();return all.filter(p=>`${p.sku} ${p.name}`.toLowerCase().includes(query));
}
async function readPicture(file:File,doc:Document):Promise<Picture>{
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('请选择 JPG、PNG 或 WebP 图片');
  if(file.size>12*1024*1024)throw new Error('单张图片不能超过 12 MB');
  const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('图片读取失败'));reader.readAsDataURL(file);});
  const img=doc.createElement('img');img.src=data;await img.decode().catch(()=>{throw new Error('图片文件无法打开');});
  if(img.naturalWidth*img.naturalHeight>40_000_000)throw new Error('图片像素过大，请选择缩小后的图片');
  const scale=Math.min(1,1600/Math.max(img.naturalWidth,img.naturalHeight)),canvas=doc.createElement('canvas');canvas.width=Math.round(img.naturalWidth*scale);canvas.height=Math.round(img.naturalHeight*scale);
  const context=canvas.getContext('2d')!;context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(img,0,0,canvas.width,canvas.height);
  return {id:crypto.randomUUID(),name:file.name,dataUrl:canvas.toDataURL('image/jpeg',.82)};
}
function dialog(doc:Document,title:string){
  const el=doc.createElement('dialog');el.className='shared-dialog reply-dialog';const h=doc.createElement('h2');h.textContent=title;el.append(h);
  const body=doc.createElement('div');body.className='reply-dialog-body';el.append(body);const footer=doc.createElement('footer'),close=doc.createElement('button');close.type='button';close.textContent='关闭';close.onclick=()=>el.close();footer.append(close);el.append(footer);doc.body.append(el);el.addEventListener('close',()=>el.remove(),{once:true});return {el,body,footer};
}
function preview(doc:Document,picture:Picture){const d=dialog(doc,'图片预览'),img=doc.createElement('img');img.src=picture.dataUrl;img.alt=picture.name;img.className='reply-full-image';d.body.append(img);d.el.showModal();}
function fileInput(doc:Document,onFiles:(files:File[])=>Promise<void>){const input=doc.createElement('input');input.type='file';input.accept='image/jpeg,image/png,image/webp';input.multiple=true;input.hidden=true;input.onchange=()=>{const files=Array.from(input.files||[]);input.value='';void onFiles(files);};return input;}

export function installProductPictures(doc:Document,page:string){
  if(!['inventory','product'].includes(page))return ()=>{};
  const root=doc.querySelector('.app')!,target=root.querySelector('.overview-actions,.identity,.gallery')!;
  const button=doc.createElement('button');button.type='button';button.className='product-images-button';button.textContent='商品图片';target.append(button);
  const sku=()=>page==='inventory'?(doc.querySelector('#ui011-overview-name')?.textContent?.trim()||''):(doc.querySelector('#ui032 .left-info .info-line:first-child strong')?.textContent?.trim()||'');
  button.onclick=()=>{
    const selected=sku();if(!selected||selected==='—')return;
    const d=dialog(doc,`${selected} · 商品图片`),hint=doc.createElement('p');hint.textContent='保存到本机商品图片库，可在客户聊天中人工选取。';d.body.append(hint);
    const status=doc.createElement('output');status.setAttribute('aria-live','polite');d.body.append(status);
    const list=doc.createElement('div');list.className='reply-image-grid';d.body.append(list);
    const refresh=async()=>{try{const pictures=(await catalogue('list',{query:selected})).filter(p=>p.sku===selected);list.replaceChildren();if(!pictures.length)status.textContent='还没有图片，点击添加商品图片。';for(const picture of pictures){const item=doc.createElement('div'),view=doc.createElement('button'),img=doc.createElement('img');img.src=picture.dataUrl;img.alt=picture.name;view.append(img);view.onclick=()=>preview(doc,picture);item.append(view);if(!picture.readonly){const remove=doc.createElement('button');remove.textContent='移除';remove.onclick=async()=>{try{await catalogue('remove',{id:picture.id});await refresh();}catch(e){status.textContent=(e as Error).message;}};item.append(remove);}list.append(item);}}catch(e){status.textContent=(e as Error).message;}};
    const upload=doc.createElement('button');upload.textContent='添加商品图片';upload.dataset.productUpload='';
    const input=fileInput(doc,async files=>{upload.disabled=true;try{for(const file of files.slice(0,6)){const p=await readPicture(file,doc);await catalogue('add',{image:{...p,sku:selected,name:selected}});}status.textContent='图片已保存';await refresh();}catch(e){status.textContent=(e as Error).message;}finally{upload.disabled=false;}});
    upload.onclick=()=>input.click();d.footer.prepend(upload);d.body.append(input);d.el.showModal();void refresh();
  };
  return ()=>{};
}

function confirmation(doc:Document):{zh:string;en:string}{
  if(!doc.querySelector('#ui008-order-detail'))throw new Error('请进入订单详情，核对商品和金额后再生成确认内容。');
  if(doc.querySelector('.od-product-editor:not([hidden]),[contenteditable="true"]'))throw new Error('请先保存正在编辑的订单资料，再生成确认内容。');
  const clean=(s:string)=>doc.querySelector(s)?.textContent?.replace(/\s+/g,' ').trim()||'';
  const fields=Array.from(doc.querySelectorAll('#od-customer-title')).flatMap(el=>Array.from(el.closest('section')!.querySelectorAll('.od-field-value'))).map(el=>Array.from(el.childNodes).filter(n=>n.nodeType===3).map(n=>n.textContent).join('').trim());
  const names=['姓名','电话','国家','城市','详细地址'],english=['Name','Phone','Country','City','Address'];
  const valid=(v:string)=>v&&!/^(—|-|待填写|未填写|待确认)$/.test(v);
  const lines=fields.slice(0,5).map((v,i)=>`${names[i]}：${valid(v)?v:'待补充'}`),enLines=fields.slice(0,5).map((v,i)=>`${english[i]}: ${valid(v)?v:'Please provide'}`);
  const products=Array.from(doc.querySelectorAll('.od-product-list .od-product'));
  if(!products.length)products.push(...doc.querySelectorAll('.od-product'));
  const items=products.map(el=>['.od-product-name','.od-qty','.od-price'].map(s=>el.querySelector(s)?.textContent?.trim()||'待核对').join(' · '));
  const payable=clean('#od-payable'),fee=clean('#od-customer-delivery-display')||clean('#od-customer-delivery-fee');
  if(!items.length||!payable)throw new Error('请先补齐商品和应付金额，再生成订单确认。');
  return {zh:`请核对以下订单信息：\n${items.join('\n')}\n${lines.join('\n')}\n配送费：${fee||'待核对'}\n应付总额：${payable}\n请确认以上内容是否正确；配送范围及时间以人工核对为准。`,en:`Please check your order details:\n${items.join('\n')}\n${enLines.join('\n')}\nDelivery fee: ${fee||'To be confirmed'}\nTotal payable: ${payable}\nCould you confirm these details are correct? Delivery availability and timing are subject to confirmation.`};
}
export function installReplyTools(doc:Document,win:Window,{orderId}:{orderId?:string}={}){
  const order=Boolean(doc.querySelector('#ui008-order-detail')),root=doc.querySelector<HTMLElement>('#ui008-order-detail,#chat-workbench-aligned')!;
  const old=root.querySelector('.od-composer,.cw-composer')!,composer=doc.createElement('div');composer.className='od-composer manual-composer';
  composer.innerHTML=`<div class="od-editor-scroll"><div class="reply-input-heading"><label class="od-compose-label" for="od-chinese">用中文写回复</label><button type="button" class="reply-clear" aria-label="清空中英文回复" title="清空中英文回复"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 3l-6 10M8 12l7 4-4 6-9-5zM6 16l-1 3M10 17l-2 4"/></svg></button></div><textarea id="od-chinese" class="od-write" placeholder="输入中文，或选择上方快捷回复"></textarea><div class="od-compose-tools"><span>发送语言：英语</span><button id="od-convert" type="button" class="manual-convert"><i data-lucide="languages"></i>转为英文</button></div><label class="od-compose-label" for="od-english">英文内容 · 可编辑</label><textarea id="od-english" class="od-write od-english" placeholder="点击“转为英文”后在这里核对，也可以手工编辑"></textarea><p class="od-retranslation">翻译后显示中文对照，方便核对。</p><button type="button" class="translation-settings-button">翻译服务设置</button><div class="reply-attachments" aria-label="待发图片"></div></div><output class="reply-state" aria-live="polite">核对英文后发送</output><div class="od-phone-actions"><button type="button" class="reply-tool reply-emoji" aria-label="表情" title="表情"><i data-lucide="smile"></i></button><button type="button" class="reply-tool reply-attach" aria-label="附件" title="上传或选择商品图片"><i data-lucide="paperclip"></i></button><button id="od-send-preview" type="button" class="reply-preview-button">发送</button></div>`;
  old.replaceWith(composer);
  const zh=composer.querySelector<HTMLTextAreaElement>('#od-chinese')!,en=composer.querySelector<HTMLTextAreaElement>('#od-english')!,state=composer.querySelector('output')!,attachments=composer.querySelector('.reply-attachments')!;
  let active=zh,pictures:Picture[]=[],disposed=false,epoch=0,revision=0,stale=false;
  const drafts=new Map<string,{zh:string;en:string;pictures:Picture[];stale:boolean}>();
  const contact=()=>root.querySelector('.cw-contact-phone,.od-contact strong')?.textContent?.trim()||'order';let current=contact();
  let chatUI:ReturnType<typeof installManualChat>|undefined;
  const say=(text:string)=>{state.textContent=text;chatUI?.update();};
  [zh,en].forEach(el=>el.addEventListener('focus',()=>{active=el;}));
  const backTranslation=composer.querySelector<HTMLElement>('.od-retranslation')!;
  const disposeTranslation=installManualTranslation(doc,composer,{revision:()=>revision,epoch:()=>epoch,say,success:()=>{stale=false;revision++;}});
  zh.oninput=()=>{revision++;backTranslation.textContent='中文已修改，请重新翻译或手工核对英文。';stale=Boolean(en.value.trim());say(stale?'中文已修改，请同步核对英文后预览。':'点击“转为英文”生成英文回复。');};
  en.oninput=()=>{revision++;backTranslation.textContent='英文已手工修改，请核对含义。';stale=false;say('英文可继续编辑，右侧同步显示待发送内容');};
  function render(){chatUI?.update();attachments.replaceChildren();pictures.forEach(p=>{const cell=doc.createElement('div');cell.className='reply-thumb';const view=doc.createElement('button');view.type='button';view.setAttribute('aria-label',`预览 ${p.name}`);const img=doc.createElement('img');img.src=p.dataUrl;img.alt=p.name;view.append(img);view.onclick=()=>preview(doc,p);const remove=doc.createElement('button');remove.type='button';remove.className='reply-remove';remove.textContent='×';remove.setAttribute('aria-label',`移除 ${p.name}`);remove.onclick=()=>{pictures=pictures.filter(x=>x.id!==p.id);render();};cell.append(view,remove);attachments.append(cell);});}
  let undoTimer:ReturnType<typeof setTimeout>|undefined;
  const undo=doc.createElement('button');undo.type='button';undo.className='reply-undo';undo.textContent='撤销清空';undo.hidden=true;state.after(undo);
  composer.querySelector<HTMLButtonElement>('.reply-clear')!.onclick=()=>{
    if(chatUI?.isSending())return;
    const before={zh:zh.value,en:en.value,note:backTranslation.textContent,stale};if(!before.zh&&!before.en)return;
    revision++;const clearedRevision=revision,clearedEpoch=epoch;zh.value='';en.value='';stale=false;backTranslation.textContent='';say('中英文已清空，已选图片保留。');undo.hidden=false;clearTimeout(undoTimer);
    undo.onclick=()=>{if(chatUI?.isSending())return;undo.hidden=true;if(revision!==clearedRevision||epoch!==clearedEpoch){say('草稿已更新，未覆盖新内容。');return;}revision++;zh.value=before.zh;en.value=before.en;stale=before.stale;backTranslation.textContent=before.note;say('已恢复清空前的文字。');};undoTimer=setTimeout(()=>{undo.hidden=true;},8000);
  };
  const upload=fileInput(doc,async files=>{const token=epoch;try{if(pictures.length+files.length>6)throw new Error('每次最多选择 6 张图片');const decoded=await Promise.all(files.map(f=>readPicture(f,doc)));if(disposed||token!==epoch)return;pictures.push(...decoded);render();say('图片已加入待发区，请核对后预览。');}catch(e){if(!disposed&&token===epoch)say((e as Error).message);}});composer.append(upload);
  composer.querySelector<HTMLButtonElement>('.reply-emoji')!.onclick=()=>{
    const target=active,start=target.selectionStart,end=target.selectionEnd,d=dialog(doc,'选择表情');d.el.classList.add('emoji-dialog');
    for(const [emoji,label] of [['😊','友好'],['🤔','疑问'],['🙏','抱歉'],['👌','OK']]){const b=doc.createElement('button');b.textContent=emoji;b.setAttribute('aria-label',label);b.onclick=()=>{revision++;target.setRangeText(emoji,start,end,'end');if(target===zh){en.value+=emoji;}else if(target!==en){target.dispatchEvent(new Event('input'));}d.el.close();target.focus();say('表情已加入回复，英文中也会保留。');};d.body.append(b);}d.el.showModal();
  };
  const chooseLibrary=()=>{
    const token=epoch,d=dialog(doc,'从商品图片库选择'),search=doc.createElement('input');search.type='search';search.placeholder='搜索商品编号或名称';search.setAttribute('aria-label','搜索商品图片');
    const note=doc.createElement('output'),list=doc.createElement('div');list.className='reply-image-grid';d.body.append(search,note,list);let request=0;
    const refresh=async()=>{const id=++request;note.textContent='正在读取图片…';try{const rows=await catalogue('list',{query:search.value});if(id!==request||!d.el.isConnected)return;list.replaceChildren();note.textContent=rows.length?'点击图片加入待发区。':'没有匹配图片，可在“商品库存 → 商品图片”添加。';for(const row of rows){const b=doc.createElement('button'),img=doc.createElement('img'),label=doc.createElement('span');img.src=row.dataUrl;img.alt=row.name;label.textContent=row.sku||row.name;b.append(img,label);b.onclick=()=>{if(epoch!==token){d.el.close();return;}if(pictures.length>=6){note.textContent='每次最多 6 张图片';return;}pictures.push({...row,id:crypto.randomUUID()});render();d.el.close();say('商品图片已加入待发区。');};list.append(b);}}catch(e){note.textContent=(e as Error).message;}};
    search.oninput=()=>void refresh();d.el.showModal();void refresh();
  };
  composer.querySelector<HTMLButtonElement>('.reply-attach')!.onclick=()=>{const d=dialog(doc,'添加图片');for(const [label,action] of [['上传本机图片',()=>upload.click()],['从商品图片库选择',chooseLibrary]] as const){const b=doc.createElement('button');b.textContent=label;b.onclick=()=>{d.el.close();action();};d.body.append(b);}d.el.showModal();};
  const rail=doc.createElement('aside');rail.className='reply-rail';rail.setAttribute('aria-label','快捷回复');rail.innerHTML='<div class="reply-rail-head"><strong><i data-lucide="zap"></i>快捷回复</strong><button type="button" class="reply-rail-toggle" aria-label="收起回复区" aria-expanded="true">‹</button></div><div class="reply-shortcuts"></div>';
  const gear=doc.createElement('button');gear.type='button';gear.className='reply-settings-button';gear.textContent='⚙';gear.setAttribute('aria-label','快捷回复设置');gear.title='快捷回复设置';rail.querySelector('.reply-rail-head')!.insertBefore(gear,rail.querySelector('.reply-rail-toggle'));
  gear.onclick=()=>openReplySettings(doc,paintShortcuts,()=>catalogue('list'));
  const modes=root.querySelector<HTMLElement>('.od-mode-switch')!;rail.append(modes,composer);
  modes.addEventListener('click',event=>{const b=(event.target as Element).closest<HTMLButtonElement>('[data-mode]');if(!b)return;event.preventDefault();event.stopImmediatePropagation();if(b.dataset.mode!=='manual'){say('此模式暂未启用，继续使用人工回复；草稿已保留。');return;}modes.querySelectorAll('[data-mode]').forEach(el=>el.setAttribute('aria-pressed',String(el===b)));},true);
  modes.querySelectorAll<HTMLElement>('[data-mode]').forEach(el=>{el.setAttribute('aria-pressed',String(el.dataset.mode==='manual'));if(el.dataset.mode!=='manual')el.setAttribute('aria-disabled','true');});
  const chat=root.querySelector('.od-chat-column')!;chat.before(rail);
  function paintShortcuts(){
    const list=rail.querySelector('.reply-shortcuts')!;list.replaceChildren();
    try{for(const t of loadReplies().filter(t=>t.enabled)){
      const b=doc.createElement('button');b.type='button';b.textContent=t.label;b.dataset.shortcut=t.id;b.onclick=async()=>{
        const token=epoch,startRevision=revision;
        try{
          const dynamic=/\{[^{}]+\}/.test(t.zh+t.en);if(dynamic&&(root.dataset.emptyData==='true'||root.classList.contains('manual-live')))throw new Error('当前没有真实订单资料，请按真实订单人工填写确认信息。');
          if(dynamic&&!order)throw new Error('请进入订单详情，核对资料后调用订单字段。');
          const fields=orderFields(doc),confirm=(t.zh+t.en).includes('{订单确认}')?confirmation(doc):undefined;
          const text={zh:fillTemplate(t.zh,{...fields,'订单确认':confirm?.zh||''}),en:fillTemplate(t.en,{...fields,'订单确认':confirm?.en||''})};
          const rows=t.imageIds.length?await catalogue('list'):[];const selected=t.imageIds.map(id=>{const p=rows.find(p=>p.id===id);if(!p)throw new Error('模板中的商品图片已失效，请在快捷回复设置中重新选择。');return {...p,id:crypto.randomUUID()};});
          if(token!==epoch||startRevision!==revision)return;
          const apply=(replace:boolean)=>{if(token!==epoch||startRevision!==revision){say('草稿已更新，请重新选择快捷回复。');return;}if(pictures.length+selected.length>6){say('待发图片最多 6 张，请先移除多余图片。');return;}revision++;backTranslation.textContent='快捷回复已填入中英文，可继续编辑或重新翻译。';if(replace){zh.value='';en.value='';stale=false;}zh.value+=(zh.value?'\n':'')+text.zh;en.value+=(en.value?'\n':'')+text.en;pictures.push(...selected);render();say(stale?'原中文草稿有修改，请同步核对英文。':'已填入中英文，请核对后发送。');zh.focus();};
          if(zh.value.trim()||en.value.trim()){const d=dialog(doc,'调用快捷回复');d.body.textContent='当前已有草稿，请选择替换文字或追加。已选图片保留。';for(const [label,replace] of [['替换文字',true],['追加内容',false]] as const){const action=doc.createElement('button');action.textContent=label;action.onclick=()=>{apply(replace);d.el.close();};d.footer.prepend(action);}d.el.showModal();}else apply(false);
        }catch(e){say((e as Error).message);}
      };list.append(b);
    }}catch(e){say((e as Error).message);}
  }
  paintShortcuts();
  const toggle=rail.querySelector<HTMLButtonElement>('.reply-rail-toggle')!;
  let collapsed=window.localStorage.getItem('liaodan.quick-replies.collapsed')==='true';
  let floatingOpen=false;
  const paintRail=()=>{const small=win.innerWidth<1180,closed=small?!floatingOpen:collapsed;root.classList.toggle('reply-floating',small&&floatingOpen);root.classList.toggle('reply-rail-collapsed',closed);toggle.textContent=closed?'回复 ›':'‹';toggle.setAttribute('aria-expanded',String(!closed));toggle.setAttribute('aria-label',closed?'展开回复区':'收起回复区');root.dispatchEvent(new Event('reply-rail-change'));};
  toggle.onclick=()=>{if(win.innerWidth<1180)floatingOpen=!floatingOpen;else{collapsed=!collapsed;try{window.localStorage.setItem('liaodan.quick-replies.collapsed',String(collapsed));}catch{}}paintRail();};
  win.addEventListener('resize',paintRail);paintRail();
  chatUI=installManualChat(doc,root,{draft:()=>({text:en.value,chinese:zh.value,pictures:[...pictures],stale}),say,edit:value=>{en.value=value;en.dispatchEvent(new Event('input'));},
    clear:draft=>{if(en.value===draft.text)en.value='';if(zh.value===draft.chinese)zh.value='';const ids=new Set(draft.pictures.map(p=>p.id));pictures=pictures.filter(p=>!ids.has(p.id));revision++;stale=Boolean(zh.value.trim()&&!en.value.trim());backTranslation.textContent='翻译后显示中文对照，方便核对。';render();},
    bound:phone=>{zh.value='';en.value='';pictures=[];stale=false;revision++;epoch++;const label=root.querySelector('.cw-contact-phone,.od-contact strong');if(label)label.textContent='+'+phone;current=contact();const subtitle=root.querySelector('.cw-contact-order,.od-contact small');if(subtitle)subtitle.textContent=orderId?'当前订单已核对的真实客户':'已核对的真实客户';render();}},{orderId});
  const phoneInput=root.querySelector<HTMLTextAreaElement>('#phone-english')!;phoneInput.addEventListener('focus',()=>{active=phoneInput;});
  const watch=new MutationObserver(()=>{if(order)return;const next=contact();if(next===current)return;drafts.set(current,{zh:zh.value,en:en.value,pictures:[...pictures],stale});current=next;epoch++;revision++;chatUI?.reset();backTranslation.textContent='翻译后显示中文对照，方便核对。';doc.querySelectorAll<HTMLDialogElement>('.reply-dialog').forEach(d=>d.close());const draft=drafts.get(next);zh.value=draft?.zh||'';en.value=draft?.en||'';pictures=draft?.pictures||[];stale=draft?.stale||false;render();say('已切换客户，发送前请关联并核对真实聊天');});
  const identity=root.querySelector('.cw-phone-contact');if(identity)watch.observe(identity,{subtree:true,childList:true,characterData:true});
  return ()=>{disposed=true;epoch++;clearTimeout(undoTimer);chatUI?.dispose();disposeTranslation();watch.disconnect();win.removeEventListener('resize',paintRail);};
}
