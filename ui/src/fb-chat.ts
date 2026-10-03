import {NAV_COLLAPSED_KEY,resolveUnifiedNavigationMetrics,unifiedNavigationMetrics} from './unified-layout';
import type {OrderLayoutDesktop} from './order-layout';
// @ts-ignore The packaged main process and this local UI intentionally share one static reference set.
import {FB_REFERENCE_SCRIPT_SECTIONS,FB_REFERENCE_SCRIPT_TEXT} from '../../shared/fb-reference-scripts.mjs';

type ApiError={message?:string};
type ApiResult<T>={ok:boolean;data?:T;error?:ApiError|string};
type ScanFragment={id:string;text:string};
type ScanPage={pageId:string;title:string;error?:string;fragments:ScanFragment[]};
type ScanProfile={profileId:string;label:string;status:'scanned'|'skipped'|'failed';detail:string;pages:ScanPage[]};
type ScanResult={token:string;scannedAt:string;profiles:ScanProfile[];limits:{profiles:number;fragmentsPerProfile:number}};
type ScanMemory={scan:ScanResult;translations:Map<string,string>;translating:Set<string>;status:string};
type ReplyDraft={id:string;text:string;language:'英文回复'|'中文回复';selected:boolean};
type AdsPowerApi={scan:()=>Promise<ApiResult<ScanResult>>;translate:(payload:{token:string;messageIds:string[]})=>Promise<ApiResult<{translations:{id:string;text:string}[]}>>;clear:(payload:{token:string})=>Promise<ApiResult<{cleared:boolean}>>};
type ManualReplyApi={request:(request:{action:string;payload?:unknown})=>Promise<ApiResult<{text:string;chinese:string;note?:string}>>};

let remembered:ScanMemory|undefined;
let replyDrafts:ReplyDraft[]=[];
let draftSequence=0;

const host=():Window&{adsPowerInbox?:AdsPowerApi;manualReplyTranslation?:ManualReplyApi}=>{try{return window.parent!==window&&window.parent.location.origin===window.location.origin?window.parent as Window&{adsPowerInbox?:AdsPowerApi;manualReplyTranslation?:ManualReplyApi}:window as Window&{adsPowerInbox?:AdsPowerApi;manualReplyTranslation?:ManualReplyApi};}catch{return window as Window&{adsPowerInbox?:AdsPowerApi;manualReplyTranslation?:ManualReplyApi};}};
const request=async<T>(action:'scan'|'translate'|'clear',payload?:{token:string;messageIds?:string[]})=>{
  const api=host().adsPowerInbox;if(!api)throw new Error('AdsPower 扫描服务尚未就绪');
  const result=action==='scan'?await api.scan():action==='translate'?await api.translate({token:payload?.token||'',messageIds:payload?.messageIds||[]}):await api.clear({token:payload?.token||''});
  if(!result.ok)throw new Error(typeof result.error==='string'?result.error:result.error?.message||'AdsPower 扫描操作失败');
  return result.data as T;
};
const replyService=async<T extends {text:string;chinese:string}>(action:'translate'|'fb-assist-draft',text:string)=>{
  const api=host().manualReplyTranslation;if(!api)throw new Error('AI 与翻译服务尚未就绪，请先在助手配置完成设置');
  const result=await api.request({action,payload:{text}});
  if(!result.ok)throw new Error(typeof result.error==='string'?result.error:result.error?.message||'AI 或翻译未完成');
  return result.data as T;
};
const formatTime=(value:string)=>{const time=new Date(value);return Number.isNaN(time.getTime())?'时间未记录':time.toLocaleString('zh-CN',{hour12:false,month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});};
const stateLabel=(value:ScanProfile['status'])=>value==='scanned'?'已读取':value==='skipped'?'未打开收件箱':'读取失败';
const allFragments=(scan:ScanResult)=>scan.profiles.flatMap(profile=>profile.pages.flatMap(page=>page.fragments));
const newDraftId=()=>`fb-draft-${Date.now()}-${++draftSequence}`;

const copyToClipboard=async(doc:Document,text:string)=>{
  const win=doc.defaultView;
  if(!win)throw new Error('复制功能尚未就绪');
  try{if(win.navigator.clipboard?.writeText){await win.navigator.clipboard.writeText(text);return;}}catch{}
  const helper=doc.createElement('textarea');
  helper.value=text;helper.setAttribute('readonly','');helper.style.cssText='position:fixed;opacity:0;pointer-events:none;left:-9999px;top:0';
  doc.body.append(helper);helper.select();const copied=doc.execCommand('copy');helper.remove();
  if(!copied)throw new Error('系统未允许写入剪贴板，请手动复制草稿内容');
};

export function installFacebookChat(doc:Document,desktop?:OrderLayoutDesktop):()=>void{
  const root=doc.querySelector<HTMLElement>('#fb-chat-page')!;
  const scanButton=root.querySelector<HTMLButtonElement>('.fb-scan')!;
  const clearButton=root.querySelector<HTMLButtonElement>('.fb-clear')!;
  const status=root.querySelector<HTMLElement>('[data-fb-status]')!;
  const results=root.querySelector<HTMLElement>('[data-fb-results]')!;
  const navToggle=root.querySelector<HTMLButtonElement>('.fb-nav-toggle')!;
  const replyChinese=root.querySelector<HTMLTextAreaElement>('[data-fb-reply-chinese]')!;
  const replyEnglish=root.querySelector<HTMLTextAreaElement>('[data-fb-reply-english]')!;
  const replyAssist=root.querySelector<HTMLButtonElement>('[data-fb-ai-assist]')!;
  const replyTranslate=root.querySelector<HTMLButtonElement>('[data-fb-reply-translate]')!;
  const replyReference=root.querySelector<HTMLButtonElement>('[data-fb-reference-scripts]')!;
  const replyAdd=root.querySelector<HTMLButtonElement>('[data-fb-add-draft]')!;
  const replyCopySelected=root.querySelector<HTMLButtonElement>('[data-fb-copy-selected]')!;
  const replyStatus=root.querySelector<HTMLElement>('[data-fb-reply-status]')!;
  const replyList=root.querySelector<HTMLElement>('[data-fb-reply-list]')!;
  const referenceDialog=root.querySelector<HTMLDialogElement>('[data-fb-reference-dialog]')!;
  const referenceContent=root.querySelector<HTMLElement>('[data-fb-reference-content]')!;
  const referenceIndex=root.querySelector<HTMLElement>('[data-fb-reference-index]')!;
  const oldNavStorageKey='liaodan.fb-chat.nav-collapsed.v1';
  let closed=false,scanBusy=false,translateBusy=false,replyBusy=false;
  let selectedForTranslation=new Set<string>();
  let navCollapsed=false;
  try{const storage=doc.defaultView?.localStorage,shared=storage?.getItem(NAV_COLLAPSED_KEY);navCollapsed=shared===null?storage?.getItem(oldNavStorageKey)==='true':shared==='true';if(shared===null&&storage?.getItem(oldNavStorageKey)!==null)storage?.setItem(NAV_COLLAPSED_KEY,String(navCollapsed));}catch{}
  let navMetrics=unifiedNavigationMetrics(doc.defaultView||window,navCollapsed);
  const referenceSections=FB_REFERENCE_SCRIPT_SECTIONS as {title:string;anchor:string}[];
  for(const [index,section] of referenceSections.entries()){
    const start=FB_REFERENCE_SCRIPT_TEXT.indexOf(section.anchor),end=index<referenceSections.length-1?FB_REFERENCE_SCRIPT_TEXT.indexOf(referenceSections[index+1].anchor):FB_REFERENCE_SCRIPT_TEXT.length;
    const item=doc.createElement('section'),title=doc.createElement('h4'),content=doc.createElement('pre'),link=doc.createElement('a');
    item.id=`fb-reference-section-${index + 1}`;title.textContent=section.title;content.textContent=FB_REFERENCE_SCRIPT_TEXT.slice(index===0?0:start,end).trim();item.append(title,content);referenceContent.append(item);
    link.href=`#${item.id}`;link.textContent=section.title;referenceIndex.append(link);
  }
  const closeReference=()=>referenceDialog.close();
  referenceDialog.querySelectorAll<HTMLButtonElement>('[data-fb-reference-close]').forEach(button=>button.onclick=closeReference);
  referenceDialog.addEventListener('click',event=>{if(event.target===referenceDialog)closeReference();});
  const add=(parent:Element,tag:string,value:string,className?:string)=>{const node=doc.createElement(tag);if(className)node.className=className;node.textContent=value;parent.append(node);return node;};
  const paintNav=(metrics?:typeof navMetrics)=>{
    navMetrics=metrics||unifiedNavigationMetrics(doc.defaultView||window,navCollapsed);
    const open=!navCollapsed&&!navMetrics.compact;
    root.classList.toggle('up-compact',navMetrics.compact);root.classList.toggle('up-nav-collapsed',navCollapsed);
    root.style.setProperty('--up-nav',`${navMetrics.width}px`);
    navToggle.setAttribute('aria-label',open?'折叠导航栏':'展开导航栏');navToggle.title=open?'折叠导航栏':'展开导航栏';navToggle.innerHTML=`<i data-lucide="${open?'panel-left-close':'panel-left-open'}" aria-hidden="true"></i>`;
  };
  const setNavCollapsed=(value:boolean)=>{
    navCollapsed=value;paintNav();
    (doc.defaultView as (Window&{lucide?:{createIcons:(options:{nodes:Element[]})=>void}})|null)?.lucide?.createIcons({nodes:[navToggle]});
    try{doc.defaultView?.localStorage.setItem(NAV_COLLAPSED_KEY,String(value));}catch{}
  };
  const paintReplyActions=()=>{
    const hasChinese=Boolean(replyChinese.value.trim());
    replyAssist.disabled=replyBusy||!hasChinese;replyTranslate.disabled=replyBusy||!hasChinese;
    replyAssist.classList.toggle('is-loading',replyBusy);replyTranslate.classList.toggle('is-loading',replyBusy);
    replyAssist.querySelector('span')!.textContent=replyBusy?'正在整理…':'AI 整理';
    replyTranslate.querySelector('span')!.textContent=replyBusy?'正在处理…':'翻译为英文';
  };
  const copyDrafts=async(drafts:ReplyDraft[])=>{
    const usable=drafts.filter(draft=>draft.text.trim());
    if(!usable.length){replyStatus.textContent='没有可复制的草稿内容。';return;}
    try{await copyToClipboard(doc,usable.map(draft=>draft.text.trim()).join('\n\n'));replyStatus.textContent=`已复制 ${usable.length} 条回复草稿；请回到原 FB Inbox 粘贴、核对后人工发送。`;}
    catch(error){replyStatus.textContent=`复制未完成：${(error as Error).message}`;}
  };
  const renderReplyList=()=>{
    replyList.replaceChildren();const selected=replyDrafts.filter(draft=>draft.selected);
    replyCopySelected.disabled=!selected.length;replyCopySelected.querySelector('span')!.textContent=selected.length?`复制已选（${selected.length}）`:'复制已选';
    if(!replyDrafts.length){const empty=doc.createElement('p');empty.className='fb-draft-empty';empty.textContent='草稿只保存在当前运行中；加入后可逐条或多条复制。';replyList.append(empty);return;}
    for(const draft of replyDrafts){
      const card=doc.createElement('article'),header=doc.createElement('div'),selectLabel=doc.createElement('label'),checkbox=doc.createElement('input'),selectText=doc.createElement('span'),language=doc.createElement('span'),actions=doc.createElement('div'),copy=doc.createElement('button'),remove=doc.createElement('button'),field=doc.createElement('textarea');
      card.className='fb-draft-card';header.className='fb-draft-card-head';selectLabel.className='fb-draft-select';checkbox.type='checkbox';checkbox.checked=draft.selected;checkbox.setAttribute('aria-label','选择此条草稿');selectText.textContent='加入多条复制';selectLabel.append(checkbox,selectText);
      language.className='fb-draft-language';language.textContent=draft.language;actions.className='fb-draft-actions';copy.type='button';copy.className='fb-draft-copy';copy.innerHTML='<i data-lucide="copy" aria-hidden="true"></i><span>复制此条</span>';remove.type='button';remove.className='fb-draft-remove';remove.title='删除此条草稿';remove.setAttribute('aria-label','删除此条草稿');remove.innerHTML='<i data-lucide="trash-2" aria-hidden="true"></i>';actions.append(copy,remove);header.append(selectLabel,language,actions);
      field.className='fb-draft-text';field.value=draft.text;field.maxLength=4000;field.setAttribute('aria-label','回复草稿内容');
      checkbox.onchange=()=>{draft.selected=checkbox.checked;renderReplyList();};field.oninput=()=>{draft.text=field.value;};
      copy.onclick=()=>void copyDrafts([draft]);remove.onclick=()=>{replyDrafts=replyDrafts.filter(item=>item.id!==draft.id);replyStatus.textContent='已删除该条回复草稿。';renderReplyList();};
      card.append(header,field);replyList.append(card);
    }
  };
  const renderResults=()=>{
    results.replaceChildren();const memory=remembered;
    if(!memory){const empty=doc.createElement('section'),icon=doc.createElement('i'),title=doc.createElement('strong'),copy=doc.createElement('span');empty.className='fb-empty';icon.dataset.lucide='scan-search';title.textContent='等待你的主动扫描';copy.textContent='先在 AdsPower 中手动打开个人号和收件箱；本页不会自行打开档案、读取历史或发送消息。';empty.append(icon,title,copy);results.append(empty);return;}
    for(const profile of memory.scan.profiles){
      const card=doc.createElement('section'),head=doc.createElement('div'),copy=doc.createElement('div'),badge=doc.createElement('span');card.className=`fb-profile is-${profile.status}`;head.className='fb-profile-head';add(copy,'strong',profile.label);add(copy,'small',profile.detail);badge.className='fb-profile-state';badge.textContent=stateLabel(profile.status);head.append(copy,badge);card.append(head);
      for(const page of profile.pages){
        const pageNode=doc.createElement('section'),pageHead=doc.createElement('div');pageNode.className='fb-page';pageHead.className='fb-page-title';add(pageHead,'strong',page.title||'Facebook 收件箱');add(pageHead,'small',`${page.fragments.length} 条当前页面文字`);pageNode.append(pageHead);if(page.error)add(pageNode,'p',page.error,'fb-error');
        if(page.fragments.length){
          const board=doc.createElement('div'),sourcePanel=doc.createElement('section'),toolbar=doc.createElement('div'),toolbarLead=doc.createElement('span'),toolbarSpacer=doc.createElement('span'),chinesePanel=doc.createElement('section');board.className='fb-translation-board';sourcePanel.className='fb-language-panel fb-original-panel';toolbar.className='fb-translation-toolbar';toolbar.setAttribute('aria-label','翻译工具');toolbarLead.className='fb-translation-toolbar-lead';toolbarLead.innerHTML='<i data-lucide="languages" aria-hidden="true"></i><span>翻译工具</span>';toolbarSpacer.className='fb-translation-toolbar-spacer';chinesePanel.className='fb-language-panel fb-chinese-panel';
          const sourceHead=doc.createElement('header'),chineseHead=doc.createElement('header');add(sourceHead,'strong','原文');add(sourceHead,'small','勾选需要翻译的文字');add(chineseHead,'strong','中文');add(chineseHead,'small','只显示你已翻译的结果');sourcePanel.append(sourceHead);chinesePanel.append(chineseHead);
          const pageIds=page.fragments.map(fragment=>fragment.id),selectedCount=pageIds.filter(id=>selectedForTranslation.has(id)).length;
          const selectedButton=doc.createElement('button'),allButton=doc.createElement('button'),hint=doc.createElement('small');selectedButton.type='button';selectedButton.className='fb-translate-selected';selectedButton.innerHTML='<i data-lucide="languages" aria-hidden="true"></i><span></span>';selectedButton.querySelector('span')!.textContent=selectedCount?`翻译已选（${selectedCount}）`:'翻译已选';selectedButton.disabled=translateBusy||!selectedCount;allButton.type='button';allButton.className='fb-translate-all';allButton.innerHTML='<i data-lucide="languages" aria-hidden="true"></i><span>翻译全部</span>';allButton.disabled=translateBusy;hint.textContent='仅翻译本次扫描文字';toolbar.append(toolbarLead,hint,toolbarSpacer,selectedButton,allButton);
          selectedButton.onclick=()=>void translate(pageIds.filter(id=>selectedForTranslation.has(id)),false);allButton.onclick=()=>void translate(pageIds,false);
          for(const fragment of page.fragments){
            const sourceRow=doc.createElement('article'),sourceTop=doc.createElement('div'),select=doc.createElement('label'),checkbox=doc.createElement('input'),originalText=doc.createElement('p'),single=doc.createElement('button');sourceRow.className='fb-source-row';sourceTop.className='fb-row-actions';select.className='fb-translate-select';checkbox.type='checkbox';checkbox.checked=selectedForTranslation.has(fragment.id);checkbox.setAttribute('aria-label','选择这条原文');select.append(checkbox);single.type='button';single.className='fb-row-translate';single.innerHTML='<i data-lucide="languages" aria-hidden="true"></i><span></span>';single.querySelector('span')!.textContent=memory.translations.has(fragment.id)?'重新翻译':'翻译这条';single.disabled=translateBusy;sourceTop.append(select,single);originalText.textContent=fragment.text;sourceRow.append(sourceTop,originalText);sourcePanel.append(sourceRow);
            checkbox.onchange=()=>{if(checkbox.checked)selectedForTranslation.add(fragment.id);else selectedForTranslation.delete(fragment.id);renderResults();};single.onclick=()=>void translate([fragment.id],true);
            const chineseRow=doc.createElement('article'),translated=memory.translations.get(fragment.id),translationText=doc.createElement('p');chineseRow.className='fb-chinese-row';translationText.className=translated?'':'is-pending';translationText.textContent=translated||(memory.translating.has(fragment.id)?'正在翻译…':'尚未翻译');chineseRow.append(translationText);chinesePanel.append(chineseRow);
          }
          board.append(sourcePanel,chinesePanel);pageNode.append(toolbar,board);
        }
        card.append(pageNode);
      }
      results.append(card);
    }
    if(!memory.scan.profiles.length){const empty=doc.createElement('section');empty.className='fb-empty';empty.textContent='没有发现已打开的 AdsPower 档案。请先在 AdsPower 手动打开需要查看的个人号。';results.append(empty);}
  };
  const render=()=>{
    const busy=scanBusy||translateBusy;status.textContent=remembered?.status||'尚未扫描。先在 AdsPower 手动打开需要查看的个人号和收件箱，再点击“主动扫描”。';scanButton.disabled=busy;scanButton.classList.toggle('is-loading',scanBusy);scanButton.querySelector('span')!.textContent=scanBusy?'正在扫描…':remembered?'重新扫描':'主动扫描';clearButton.disabled=busy||!remembered;paintNav();paintReplyActions();renderResults();renderReplyList();(doc.defaultView as (Window&{lucide?:{createIcons:(options:{nodes:Element[]})=>void}})|null)?.lucide?.createIcons({nodes:[root]});
  };
  const translate=async(ids:string[],force:boolean)=>{
    const memory=remembered;if(!memory||scanBusy||translateBusy)return;const available=new Set(allFragments(memory.scan).map(fragment=>fragment.id));const requested=[...new Set(ids)].filter(id=>available.has(id)).filter(id=>force||!memory.translations.has(id));
    if(!requested.length){memory.status='所选文字已经有中文结果；可点击“重新翻译”再次请求。';render();return;}
    translateBusy=true;requested.forEach(id=>memory.translating.add(id));memory.status=`正在翻译 ${requested.length} 条你选择的文字…`;render();let complete=0;
    try{for(let start=0;start<requested.length;start+=20){if(closed||remembered!==memory)return;const batch=requested.slice(start,start+20),rows=await request<{translations:{id:string;text:string}[]}>('translate',{token:memory.scan.token,messageIds:batch});for(const row of rows.translations)memory.translations.set(row.id,row.text);complete+=batch.length;memory.status=`本次扫描：${formatTime(memory.scan.scannedAt)} · 已按需翻译 ${complete}/${requested.length} 条文字。`;render();}}
    catch(error){if(remembered===memory)memory.status=`已保留原文和已完成中文；翻译未完成：${(error as Error).message}`;}
    finally{requested.forEach(id=>memory.translating.delete(id));translateBusy=false;if(!closed)render();}
  };
  const scan=async()=>{
    if(scanBusy||translateBusy)return;scanBusy=true;const prior=remembered;if(prior)prior.status='正在重新扫描；原结果会保留至新结果读取成功。';render();
    try{const result=await request<ScanResult>('scan'),available=allFragments(result).length,next:ScanMemory={scan:result,translations:new Map(),translating:new Set(),status:result.profiles.length?`本次扫描：${formatTime(result.scannedAt)} · 已检查 ${result.profiles.length} 个已打开档案，读取到 ${available} 条当前页面文字。请选择需要翻译的原文。`:'本次扫描没有发现已打开的 AdsPower 档案。请先手动打开需要查看的个人号。'};remembered=next;selectedForTranslation.clear();if(prior?.scan.token&&prior.scan.token!==result.token)void request('clear',{token:prior.scan.token}).catch(()=>{});render();}
    catch(error){if(prior){prior.status=`重新扫描未完成，已保留上次结果：${(error as Error).message}`;remembered=prior;}else remembered=undefined;render();}
    finally{scanBusy=false;if(!closed)render();}
  };
  const clear=async()=>{if(!remembered||scanBusy||translateBusy)return;const current=remembered;scanBusy=true;current.status='正在清空本次扫描内容…';render();try{await request('clear',{token:current.scan.token});if(remembered===current){remembered=undefined;selectedForTranslation.clear();}}catch(error){if(remembered===current)current.status=`清空未完成：${(error as Error).message}`;}finally{scanBusy=false;if(!closed)render();}};
  const createReply=async(action:'translate'|'fb-assist-draft')=>{
    const chinese=replyChinese.value.trim();
    if(!chinese){replyStatus.textContent=action==='translate'?'请先输入需要翻译的中文。':'请先输入需要 AI 整理的中文回复。';replyChinese.focus();return;}
    replyBusy=true;replyStatus.textContent=action==='translate'?'正在将当前中文草稿翻译为英文…':'正在按当前中文意图整理英文回复草稿…';paintReplyActions();
    try{const result=await replyService(action,chinese);if(closed)return;if(action==='fb-assist-draft')replyChinese.value=result.chinese;replyEnglish.value=result.text;replyStatus.textContent=action==='translate'?'英文译文已生成，可继续手动修改后加入待复制列表。':'AI 草稿已生成，请先人工核对中英文后加入待复制列表。';replyEnglish.focus();}
    catch(error){replyStatus.textContent=`${action==='translate'?'翻译':'AI 整理'}未完成：${(error as Error).message}；已有草稿已保留。`;}
    finally{replyBusy=false;if(!closed)paintReplyActions();}
  };
  const resize=()=>paintNav();
  scanButton.onclick=()=>void scan();clearButton.onclick=()=>void clear();navToggle.onclick=()=>setNavCollapsed(!navCollapsed);
  replyChinese.oninput=()=>paintReplyActions();replyReference.onclick=()=>{if(!referenceDialog.open)referenceDialog.showModal();};replyAssist.onclick=()=>void createReply('fb-assist-draft');replyTranslate.onclick=()=>void createReply('translate');
  replyAdd.onclick=()=>{const english=replyEnglish.value.trim(),chinese=replyChinese.value.trim(),text=english||chinese;if(!text){replyStatus.textContent='请先输入中文或英文回复草稿。';replyChinese.focus();return;}replyDrafts=[...replyDrafts,{id:newDraftId(),text,language:english?'英文回复':'中文回复',selected:false}];replyChinese.value='';replyEnglish.value='';replyStatus.textContent=english?'已加入英文回复待复制列表；这里不会发送到 FB。':'未填写英文，已将中文回复加入待复制列表；这里不会发送到 FB。';paintReplyActions();renderReplyList();};replyCopySelected.onclick=()=>void copyDrafts(replyDrafts.filter(draft=>draft.selected));
  const syncDisplay=()=>void resolveUnifiedNavigationMetrics(doc.defaultView||window,navCollapsed,desktop).then(metrics=>{if(!closed){paintNav(metrics);render();}});
  const unsubscribeDisplay=desktop?.onDisplayChanged(syncDisplay);
  doc.defaultView?.addEventListener('resize',resize);paintNav();render();syncDisplay();return()=>{closed=true;if(referenceDialog.open)referenceDialog.close();doc.defaultView?.removeEventListener('resize',resize);unsubscribeDisplay?.();};
}
