import {installMessageTranslations} from './message-translations';
type Picture={id:string;name:string;dataUrl:string};
type Draft={text:string;chinese:string;pictures:Picture[];stale:boolean};
type Message={id:string;direction:string;text:string;sentAt:string;sender?:string;metadata?:{sender?:string;origin?:string}};
type Candidate={token:string;accountId:string;chatId:string;accountPhone:string;targetPhone:string};
type Binding={token:string;phone:string;accountId:string;messages:Message[]};
type Bridge={request:(value:unknown)=>Promise<{ok:boolean;data?:unknown;error?:string}>};
const bridge=(window as Window&{manualChat?:Bridge}).manualChat;
async function request(action:string,payload?:unknown){if(!bridge)throw new Error('请在桌面 App 中连接 WhatsApp 后发送');const result=await bridge.request({action,payload});if(!result.ok)throw new Error(result.error||'聊天操作失败');return result.data;}

export function installManualChat(doc:Document,root:HTMLElement,options:{draft:()=>Draft;clear:(draft:Draft)=>void;say:(value:string)=>void;bound:(phone:string)=>void;edit:(value:string)=>void},{orderId}:{orderId?:string}={}){
  const messages=root.querySelector<HTMLElement>('.od-messages')!,send=root.querySelector<HTMLButtonElement>('#od-send-preview')!;
  let binding:Binding|undefined,pending=false,uncertain=false,disposed=false,historyPending=false;
  const translations=installMessageTranslations(doc,root,()=>binding?{token:binding.token}:null);
  const preview=doc.createElement('div');preview.className='phone-draft';preview.innerHTML='<label for="phone-english">英文回复</label><textarea id="phone-english" aria-label="手机英文输入框" placeholder="英文回复会同步到这里，也可以直接输入"></textarea><div class="phone-draft-images"></div><small aria-live="polite">待发送</small>';
  const phoneInput=preview.querySelector<HTMLTextAreaElement>('textarea')!,draftImages=preview.querySelector<HTMLElement>('.phone-draft-images')!,draftLabel=preview.querySelector('small')!;
  root.querySelector('.od-phone')!.append(preview);phoneInput.oninput=()=>options.edit(phoneInput.value);
  const link=doc.createElement('button');link.type='button';link.className='manual-link';link.textContent='关联真实聊天';
  const refresh=doc.createElement('button');refresh.type='button';refresh.className='manual-refresh';refresh.textContent='刷新消息';refresh.hidden=true;
  const chatTitle=root.querySelector('.od-chat-title')!;chatTitle.querySelectorAll('button').forEach(b=>{if(b.textContent?.replace(/\s+/g,'')==='聊天关联')b.remove();});chatTitle.append(link,refresh);
  const sidebar=root.querySelector<HTMLElement>('.od-connection');if(sidebar){sidebar.textContent='WhatsApp · 待核对连接';sidebar.style.color='#80758f';}
  const connection=doc.createElement('div');connection.className='manual-connection';connection.textContent='尚未关联真实客户';root.querySelector('.ol-phone-box,.od-phone')!.before(connection);
  const sentImages=new Map<string,Picture[]>();
  const bubble=(text:string,images:Picture[],direction:string,sender:string,time:string)=>{
    const wrapper=doc.createElement('div');wrapper.className='manual-message'+(direction==='merchant'?' outgoing':'');
    const row=doc.createElement('div');row.className='manual-bubble'+(direction==='merchant'?' outgoing':'');
    const body=doc.createElement('div');body.className='manual-message-text';body.textContent=text;row.append(body);
    for(const p of images){const img=doc.createElement('img');img.src=p.dataUrl;img.alt=p.name;row.append(img);}
    const meta=doc.createElement('div');meta.className='od-message-meta manual-message-meta';
    const who=doc.createElement('span'),icon=doc.createElement('i');icon.dataset.lucide=sender==='AI自动发送'?'bot':'user-round';icon.setAttribute('aria-hidden','true');who.append(icon,doc.createTextNode(sender));
    const clock=doc.createElement('span');clock.className='od-time';clock.textContent=time;meta.append(who,clock);row.append(meta);wrapper.append(row);
    (doc.defaultView as (Window&{lucide?:{createIcons:(options:{nodes:Element[];attrs:Record<string,number>})=>void}})|null)?.lucide?.createIcons({nodes:[meta],attrs:{width:13,height:13}});
    return wrapper;
  };
  const senderOf=(message:Message)=>{
    if(message.direction!=='merchant')return '客户';
    const source=message.sender||message.metadata?.sender||message.metadata?.origin;
    if(source==='AI自动发送'||source==='ai'||source==='auto')return 'AI自动发送';
    if(source==='人工发送'||source==='manual'||source==='human')return '人工发送';
    return '我方发送';
  };
  function update(scroll=true){
    if(disposed)return;const draft=options.draft();
    if(phoneInput.value!==draft.text)phoneInput.value=draft.text;
    const signature=draft.pictures.map(p=>p.id).join(',');if(draftImages.dataset.ids!==signature){draftImages.dataset.ids=signature;draftImages.replaceChildren();for(const p of draft.pictures){const img=doc.createElement('img');img.src=p.dataUrl;img.alt=p.name;draftImages.append(img);}}
    draftLabel.textContent=pending?'发送中…':uncertain?'发送结果待核实':draft.stale?'待核对英文 · 未发送':'待发送';
    const clear=root.querySelector<HTMLButtonElement>('.reply-clear');if(clear)clear.disabled=pending;
    send.textContent=pending?'发送中…':'发送';send.disabled=pending||uncertain||!binding||draft.stale||(!draft.text.trim()&&!draft.pictures.length);send.title=!binding?'请先关联真实客户聊天':draft.stale?'请先翻译或核对英文':uncertain?'请在 WhatsApp 核对上次发送结果':'';
    if(scroll&&pending)messages.scrollTop=messages.scrollHeight;
  }
  function renderHistory(rows:Message[]){
    const nearBottom=messages.scrollHeight-messages.scrollTop-messages.clientHeight<60,scroll=messages.scrollTop;
    messages.replaceChildren();for(const m of rows){const images=sentImages.get(m.id)||[];const row=bubble(m.text,images,m.direction,senderOf(m),new Date(m.sentAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}));row.dataset.messageId=m.id;messages.append(row);translations.attach(row.querySelector<HTMLElement>('.manual-bubble')!,m.text,m.id);}translations.hydrate();update(false);if(nearBottom)messages.scrollTop=messages.scrollHeight;else messages.scrollTop=scroll;
  }
  async function loadHistory(){if(!binding||historyPending||disposed)return;const token=binding.token;historyPending=true;try{const rows=await request('history',{token,...(orderId?{orderId}:{})}) as Message[];if(!disposed&&binding?.token===token)renderHistory(rows);}catch(e){if(!disposed&&binding?.token===token)connection.textContent=`消息刷新失败：${(e as Error).message}`;}finally{historyPending=false;}}
  link.onclick=()=>{if(pending){options.say('发送进行中，请等待当前操作结束。');return;}
    const modal=doc.createElement('dialog');modal.className='shared-dialog reply-dialog manual-chat-dialog';modal.innerHTML='<h2>关联真实聊天</h2><p>核对发送账号和客户号码后，只读取这位客户最近 24 小时的消息。关联客户会清空当前临时草稿，请先保留需要的文字。</p><output aria-live="polite"></output><img class="manual-qr" hidden alt="WhatsApp 登录二维码"><button data-connect>连接 WhatsApp</button><label>客户号码<input data-phone type="tel" placeholder="包含国家区号，例如 +971…"></label><button data-inspect>核对号码</button><p data-candidate></p><button data-bind disabled>确认关联并读取最近 24 小时</button><footer><button data-close>关闭</button></footer>';doc.body.append(modal);modal.showModal();
    const output=modal.querySelector('output')!,qr=modal.querySelector<HTMLImageElement>('img')!,inspect=modal.querySelector<HTMLButtonElement>('[data-inspect]')!,confirm=modal.querySelector<HTMLButtonElement>('[data-bind]')!,input=modal.querySelector<HTMLInputElement>('input')!,connect=modal.querySelector<HTMLButtonElement>('[data-connect]')!;
    let candidate:Candidate|undefined,timer:ReturnType<typeof setInterval>|undefined,checking=false;
    const status=async()=>{if(checking)return;checking=true;try{const s=await request('status') as {status:string;message:string;qr?:string};if(!modal.open)return;output.textContent=s.message;inspect.disabled=s.status!=='online';qr.hidden=!s.qr;if(s.qr)qr.src=s.qr;connect.disabled=['online','connecting','qr','authenticated'].includes(s.status);}catch(e){output.textContent=(e as Error).message;}finally{checking=false;}};
    connect.onclick=async()=>{connect.disabled=true;try{await request('connect');await status();timer??=setInterval(()=>void status(),1500);}catch(e){output.textContent=(e as Error).message;connect.disabled=false;}};
    input.oninput=()=>{candidate=undefined;confirm.disabled=true;modal.querySelector('[data-candidate]')!.textContent='';};
    inspect.onclick=async()=>{inspect.disabled=true;confirm.disabled=true;candidate=undefined;const phone=input.value;try{const value=await request('inspect',{phone}) as Candidate;if(input.value!==phone||!modal.open)return;candidate=value;modal.querySelector('[data-candidate]')!.textContent=`发送账号：+${value.accountPhone}\n客户号码：+${value.targetPhone}`;confirm.disabled=false;}catch(e){output.textContent=(e as Error).message;}finally{inspect.disabled=false;}};
    confirm.onclick=async()=>{if(!candidate)return;confirm.disabled=true;try{const result=await request('bind',{candidateToken:candidate.token,accountId:candidate.accountId,chatId:candidate.chatId,...(orderId?{orderId}:{})}) as Binding;if(!modal.open||disposed)return;translations.reset();binding=result;sentImages.clear();uncertain=false;if(sidebar){sidebar.textContent='WhatsApp · 已核对连接';sidebar.style.color='#008e65';}root.classList.add('manual-live');options.bound(result.phone);renderHistory(result.messages);connection.textContent=`已关联 +${result.phone} · 发送账号 ${result.accountId.replace('wa-phone:','+')}`;link.textContent='更换关联';refresh.hidden=false;options.say('已关联真实聊天，请核对收件人与英文后发送。');update();modal.close();}catch(e){output.textContent=(e as Error).message;confirm.disabled=false;}};
    modal.querySelector<HTMLButtonElement>('[data-close]')!.onclick=()=>modal.close();modal.onclose=()=>{if(timer)clearInterval(timer);modal.remove();};inspect.disabled=true;void status();
  };
  refresh.onclick=()=>void loadHistory();
  send.onclick=async()=>{
    const draft=options.draft();if(pending||uncertain||draft.stale||!binding||(!draft.text.trim()&&!draft.pictures.length))return;
    const target=binding;pending=true;update();options.say('正在发送，请勿重复点击。');
    try{
      const result=await request('send',{token:target.token,requestId:crypto.randomUUID(),text:draft.text,images:draft.pictures.map(p=>p.dataUrl),...(orderId?{orderId}:{})}) as {status:string;message?:string;parts:Array<{status:string;id?:string;kind:string;imageIndex?:number}>};
      if(disposed||binding?.token!==target.token)return;
      for(const part of result.parts.filter(p=>p.status==='sent')){if(part.id&&Array.from(messages.querySelectorAll('[data-message-id]')).some(el=>(el as HTMLElement).dataset.messageId===part.id))continue;const row=bubble(part.kind==='text'?draft.text:'',part.kind==='image'?[draft.pictures[part.imageIndex!]]:[],'merchant','人工发送','刚刚 ✓');if(part.id){row.dataset.messageId=part.id;if(part.kind==='image')sentImages.set(part.id,[draft.pictures[part.imageIndex!]]);}messages.append(row);if(part.kind==='text'&&part.id)translations.attach(row.querySelector<HTMLElement>('.manual-bubble')!,draft.text,part.id);messages.scrollTop=messages.scrollHeight;}
      if(result.status==='sent'){options.clear(draft);options.say('已发送');}else{uncertain=true;options.say(result.message||'发送结果待核实，请在 WhatsApp 核对，原稿保留。');}
    }catch(e){if(!disposed&&binding?.token===target.token)options.say(`${(e as Error).message} 原稿已保留。`);}
    finally{pending=false;if(!disposed)update();}
  };
  // Reading is activated only after the user confirms this one customer and the visible time window.
  const guard=(event:Event)=>{if(pending&&(event.target as Element).closest('.cw-task-row,[data-detail],.od-back,.od-nav-item')){event.preventDefault();event.stopImmediatePropagation();options.say('发送进行中，请等待当前操作结束再切换页面或客户。');}};doc.addEventListener('click',guard,true);
  if(orderId)void request('restore',{orderId}).then(value=>{if(disposed)return;const result=value as Binding;binding=result;sentImages.clear();uncertain=false;root.classList.add('manual-live');options.bound(result.phone);renderHistory(result.messages);connection.textContent=`已关联 +${result.phone} · 发送账号 ${result.accountId.replace('wa-phone:','+')}`;link.textContent='更换关联';refresh.hidden=false;update(false);}).catch(()=>{});
  const poll=setInterval(()=>void loadHistory(),10000);update(false);
  return {update,isSending:()=>pending,reset:()=>{translations.reset();binding=undefined;sentImages.clear();uncertain=false;root.classList.remove('manual-live');connection.textContent='尚未关联真实客户';if(sidebar){sidebar.textContent='WhatsApp · 待核对连接';sidebar.style.color='#80758f';}link.textContent='关联真实聊天';refresh.hidden=true;update(false);},dispose:()=>{disposed=true;translations.dispose();clearInterval(poll);doc.removeEventListener('click',guard,true);}};
}
