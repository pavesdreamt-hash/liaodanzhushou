type Row={id:string;title:string;text:string};
type State={revision:number;items:Row[]};
type Result={ok:boolean;data?:State;error?:{message?:string}|string};
type Bridge={list:()=>Promise<Result>;save:(value:unknown)=>Promise<Result>;remove:(value:unknown)=>Promise<Result>};
type Host=Window&{quickReplies?:Bridge};

export function installQuickReplies(doc:Document,panel:HTMLElement,select:(text:string)=>void,currentText:()=>string){
 const section=doc.createElement('section');section.className='cwb-custom-quick';
 section.innerHTML='<header><strong>我的常用话术</strong><button type="button" data-quick-add>添加常用话术</button></header><output aria-live="polite"></output><button type="button" data-quick-reload hidden>重新读取</button><div class="cwb-custom-quick-list"></div><form hidden><strong data-quick-heading>添加常用话术</strong><label>名称<input name="title" aria-label="常用话术名称" maxlength="80" required></label><label>话术内容<textarea name="text" aria-label="话术内容" maxlength="6000" required></textarea></label><footer><button type="submit">保存话术</button><button type="button" data-quick-cancel>取消</button></footer></form>';
 panel.append(section);
 const add=section.querySelector<HTMLButtonElement>('[data-quick-add]')!,reload=section.querySelector<HTMLButtonElement>('[data-quick-reload]')!,status=section.querySelector<HTMLOutputElement>('output')!,list=section.querySelector<HTMLElement>('.cwb-custom-quick-list')!,form=section.querySelector<HTMLFormElement>('form')!,title=form.querySelector<HTMLInputElement>('input')!,text=form.querySelector<HTMLTextAreaElement>('textarea')!,heading=form.querySelector<HTMLElement>('[data-quick-heading]')!;
 let state:State={revision:0,items:[]},loaded=false,loading=false,busy=false,editing:string|undefined,pendingDelete:string|undefined;
 const message=(value:string)=>{status.textContent=value;};
 const controls=()=>{add.disabled=!loaded||loading||busy;reload.disabled=loading||busy;for(const control of form.querySelectorAll<HTMLInputElement|HTMLTextAreaElement|HTMLButtonElement>('input,textarea,button'))control.disabled=busy;};
 const bridge=()=>{const win=window as Host;let api=win.quickReplies;try{if(!api&&win.parent.location.origin===win.location.origin)api=(win.parent as Host).quickReplies;}catch{}if(!api)throw Error('常用话术服务尚未就绪，请重新打开App。');return api;};
 const request=async(operation:'list'|'save'|'remove',value?:unknown)=>{const result=await (operation==='list'?bridge().list():bridge()[operation](value));if(!result.ok)throw Error(typeof result.error==='string'?result.error:result.error?.message||'常用话术操作失败');if(!result.data||!Array.isArray(result.data.items))throw Error('常用话术返回内容不完整，请重新读取。');return result.data;};
 const edit=(row?:Row)=>{editing=row?.id;pendingDelete=undefined;heading.textContent=row?'编辑常用话术':'添加常用话术';title.value=row?.title||'';text.value=row?.text??currentText();form.hidden=false;render();title.focus();form.scrollIntoView({block:'nearest'});};
 function render(){
  list.replaceChildren();if(!state.items.length){const empty=doc.createElement('p');empty.textContent='还没有自己的常用话术。';list.append(empty);}
  for(const row of state.items){
   const item=doc.createElement('div'),choose=doc.createElement('button'),label=doc.createElement('strong'),preview=doc.createElement('small');item.className='cwb-custom-quick-row';item.dataset.quickId=row.id;choose.type='button';choose.className='cwb-custom-quick-select';choose.title=row.text;label.textContent=row.title;preview.textContent=row.text;choose.append(label,preview);choose.onclick=()=>{select(row.text);panel.hidden=true;};
   const change=doc.createElement('button'),remove=doc.createElement('button');change.type=remove.type='button';change.textContent='编辑';change.setAttribute('aria-label',`编辑话术：${row.title}`);change.onclick=()=>edit(row);remove.textContent='删除';remove.setAttribute('aria-label',`删除话术：${row.title}`);remove.onclick=()=>{pendingDelete=row.id;render();};change.disabled=remove.disabled=!loaded||busy;item.append(choose,change,remove);
   if(pendingDelete===row.id){const confirm=doc.createElement('div'),copy=doc.createElement('span'),yes=doc.createElement('button'),no=doc.createElement('button');confirm.className='cwb-quick-delete';copy.textContent=`确定删除“${row.title}”？`;yes.type=no.type='button';yes.textContent='确认删除';no.textContent='取消删除';yes.disabled=no.disabled=busy;yes.onclick=()=>void removeRow(row);no.onclick=()=>{pendingDelete=undefined;render();};confirm.append(copy,yes,no);item.append(confirm);}list.append(item);
  }controls();
 }
 async function load(){if(loading||busy)return;loading=true;controls();message('正在读取常用话术…');try{state=await request('list');loaded=true;reload.hidden=true;message('');render();}catch(error){loaded=false;reload.hidden=false;message(`读取失败：${(error as Error).message}`);render();}finally{loading=false;controls();}}
 async function removeRow(row:Row){if(busy||!loaded)return;busy=true;render();message('正在删除…');try{state=await request('remove',{id:row.id,revision:state.revision});pendingDelete=undefined;if(editing===row.id){form.hidden=true;editing=undefined;}message('已删除常用话术。');}catch(error){message(`删除失败：${(error as Error).message}`);reload.hidden=false;}finally{busy=false;render();}}
 form.onsubmit=event=>{event.preventDefault();if(busy||!loaded)return;void(async()=>{busy=true;controls();message('正在保存…');try{state=await request('save',{...(editing?{id:editing}:{}),title:title.value,text:text.value,revision:state.revision});form.hidden=true;editing=undefined;reload.hidden=true;message('已保存，可在快捷回复中选用。');}catch(error){message(`保存失败：${(error as Error).message}`);reload.hidden=false;}finally{busy=false;render();}})();};
 add.onclick=()=>edit();reload.onclick=()=>void load();form.querySelector<HTMLButtonElement>('[data-quick-cancel]')!.onclick=()=>{form.hidden=true;editing=undefined;add.focus();};
 for(const button of panel.querySelectorAll<HTMLButtonElement>('button[data-template]'))button.onclick=()=>{select(button.dataset.template||'');panel.hidden=true;};
 panel.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();if(!form.hidden&&!busy){form.hidden=true;editing=undefined;add.focus();}else if(!busy){panel.hidden=true;doc.querySelector<HTMLButtonElement>('.cwb-quick')?.focus();}}});
 section.addEventListener('click',event=>event.stopPropagation());
 render();return {open:load};
}
