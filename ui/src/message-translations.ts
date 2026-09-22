type Entry={id:string;text:string;translation?:string;error?:string;pending?:boolean};
type Bridge={request:(value:unknown)=>Promise<{ok:boolean;data?:{translations:{id:string;text:string}[]};error?:string}>};
const bridge=(window as Window&{manualReplyTranslation?:Bridge}).manualReplyTranslation;
export function installMessageTranslations(doc:Document,root:HTMLElement,binding:()=>{token:string}|null){
 const messages=root.querySelector<HTMLElement>('.od-messages')!,toolbar=doc.createElement('div');toolbar.className='od-phone-toolbar message-translation-toolbar';toolbar.innerHTML='<label><input type="checkbox" checked>显示中文译文</label><button type="button" title="翻译当前聊天中尚未翻译的文字，每次最多 20 条">翻译未译消息</button>';
 root.querySelector('.od-phone-toolbar')!.replaceWith(toolbar);
 const toggle=toolbar.querySelector('input')!,batch=toolbar.querySelector('button')!,entries=new Map<string,Entry>();let disposed=false,busy=false,generation=0;
 toggle.onchange=()=>root.classList.toggle('hide-message-translations',!toggle.checked);
 function paint(){
  batch.disabled=busy;batch.textContent=busy?'翻译中…':'翻译未译消息';
  messages.querySelectorAll<HTMLElement>('.manual-translation').forEach(note=>{const entry=entries.get(note.dataset.key!);if(!entry)return;note.replaceChildren();if(entry.translation){note.textContent=entry.translation;return;}const button=doc.createElement('button');button.type='button';button.textContent=entry.pending?'翻译中…':entry.error?'重试翻译':'翻译成中文';button.disabled=busy;button.onclick=()=>void translate([entry]);note.append(button);if(entry.error){const error=doc.createElement('span');error.textContent=' '+entry.error;note.append(error);}});
 }
 async function translate(selected:Entry[]){
  if(busy||!selected.length)return;busy=true;const current=generation,target=binding();selected.forEach(e=>{e.pending=true;e.error=undefined;});paint();
  try{if(!bridge)throw new Error('请在桌面 App 中配置翻译服务');if(!target)throw new Error('请先关联并核对客户聊天');const result=await bridge.request({action:'chat-translate',payload:{token:target.token,messages:selected.map(({id,text})=>({id,text}))}});if(!result.ok)throw new Error(result.error||'翻译失败');const rows=result.data?.translations;if(!rows||selected.some(e=>!rows.find(r=>r.id===e.id)?.text))throw new Error('翻译结果不完整');if(!disposed&&generation===current)for(const e of selected)e.translation=rows.find(r=>r.id===e.id)!.text;
  }catch(e){if(!disposed&&generation===current)selected.forEach(entry=>{entry.error=(e as Error).message;});}finally{selected.forEach(e=>e.pending=false);busy=false;if(!disposed&&generation===current)paint();}
 }
 async function hydrate(){
  const target=binding(),current=generation;if(!bridge||!target)return;
  const selected=Array.from(entries.values()).filter(entry=>!entry.translation).slice(0,100);if(!selected.length)return;
  try{const result=await bridge.request({action:'chat-cache',payload:{token:target.token,messages:selected.map(({id,text})=>({id,text}))}});
   if(!result.ok||disposed||generation!==current)return;
   for(const row of result.data?.translations||[]){const entry=selected.find(item=>item.id===row.id);if(entry&&!entry.translation)entry.translation=row.text;}
   paint();
  }catch{/* Cache lookup is optional; the translation button remains available. */}
 }
 batch.onclick=()=>{toggle.checked=true;root.classList.remove('hide-message-translations');let size=0;const selected:Entry[]=[];messages.querySelectorAll<HTMLElement>('.manual-translation').forEach(note=>{const entry=entries.get(note.dataset.key!);if(entry&&!entry.translation&&!entry.pending&&selected.length<20&&size+entry.text.length<=12000){selected.push(entry);size+=entry.text.length;}});void translate(selected);};
 return {attach:(row:HTMLElement,text:string,id:string)=>{if(!text.trim()||/^\[.*\]$/.test(text.trim()))return;const key=JSON.stringify([binding()?.token,id,text]);if(!entries.has(key))entries.set(key,{id,text});const note=doc.createElement('div');note.className='manual-translation od-translation';note.dataset.key=key;row.after(note);paint();},hydrate:()=>void hydrate(),reset:()=>{generation++;entries.clear();},dispose:()=>{disposed=true;generation++;entries.clear();}};
}
