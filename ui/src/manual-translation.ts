type Settings={revision:number;activeProvider:string;usageMode:string;providers:Record<string,{label:string;model:string;hasApiKey:boolean}>};
type Bridge={request:(payload:unknown)=>Promise<{ok:boolean;data?:unknown;error?:string}>};
const bridge=(window as Window&{manualReplyTranslation?:Bridge}).manualReplyTranslation;
async function request(action:string,payload?:unknown){
  if(!bridge)throw new Error('请在桌面 App 中使用翻译服务。');
  const result=await bridge.request({action,payload});if(!result.ok)throw new Error(result.error||'翻译服务暂时不可用，原稿已保留。');return result.data;
}
export function openTranslationSettings(doc:Document){
  const d=doc.createElement('dialog');d.className='shared-dialog reply-dialog translation-settings';
  d.innerHTML='<h2>翻译服务设置</h2><p>沿用本机的 AI 服务配置，仅在点击“转为英文”时提交中文，不开启自动回复。</p><label>服务商<select data-provider></select></label><label>模型名称<input data-model maxlength="120"></label><label>手动调用额度<select data-usage><option value="verification">验证模式 · 共 5 次</option><option value="daily">日常使用 · 每日 20 次</option></select></label><p>翻译使用所选服务商的 API 额度，可能产生费用。密钥通过系统安全输入窗口保存。</p><output aria-live="polite"></output><footer><button data-save>保存服务设置</button><button data-key>设置 / 更换密钥</button><button data-close>关闭</button></footer>';
  doc.body.append(d);d.showModal();d.onclose=()=>d.remove();d.querySelector<HTMLButtonElement>('[data-close]')!.onclick=()=>d.close();
  const provider=d.querySelector<HTMLSelectElement>('[data-provider]')!,model=d.querySelector<HTMLInputElement>('[data-model]')!,usage=d.querySelector<HTMLSelectElement>('[data-usage]')!,status=d.querySelector('output')!;
  const buttons=Array.from(d.querySelectorAll<HTMLButtonElement>('[data-save],[data-key]'));let current:Settings|undefined;
  const busy=(value:boolean)=>{buttons.forEach(b=>b.disabled=value);provider.disabled=model.disabled=usage.disabled=value;};
  const paint=(state:Settings)=>{current=state;provider.replaceChildren();for(const [id,p] of Object.entries(state.providers)){const option=doc.createElement('option');option.value=id;option.textContent=p.label;provider.append(option);}provider.value=state.activeProvider;model.value=state.providers[state.activeProvider].model;usage.value=state.usageMode;status.textContent=state.providers[state.activeProvider].hasApiKey?'已保存本机密钥':'尚未设置此服务商的密钥';};
  provider.onchange=()=>{if(current){model.value=current.providers[provider.value].model;status.textContent=current.providers[provider.value].hasApiKey?'已保存本机密钥':'尚未设置此服务商的密钥';}};
  const save=async()=>{
    if(!current)throw new Error('设置尚未加载');
    let next=await request('save',{provider:provider.value,revision:current.revision,model:model.value.trim()}) as Settings;
    current=next;
    if(usage.value!==next.usageMode)next=await request('usage',{provider:next.activeProvider,revision:next.revision,usageMode:usage.value}) as Settings;
    paint(next);
  };
  const action=async(key:boolean)=>{busy(true);try{await save();if(key){const result=await request('key',{provider:current!.activeProvider,revision:current!.revision}) as {state:Settings;canceled:boolean};paint(result.state);if(result.canceled)status.textContent='已取消密钥输入，原有密钥保留';}else status.textContent='服务设置已保存';}catch(e){status.textContent=(e as Error).message;}finally{busy(false);}};
  buttons[0].onclick=()=>void action(false);buttons[1].onclick=()=>void action(true);
  busy(true);status.textContent='正在读取本机配置…';void request('settings').then(data=>{paint(data as Settings);busy(false);}).catch(e=>{status.textContent=(e as Error).message;});
}
export function installManualTranslation(doc:Document,composer:HTMLElement,options:{revision:()=>number;epoch:()=>number;success:()=>void;say:(message:string)=>void}){
  const zh=composer.querySelector<HTMLTextAreaElement>('#od-chinese')!,en=composer.querySelector<HTMLTextAreaElement>('#od-english')!,button=composer.querySelector<HTMLButtonElement>('#od-convert')!,note=composer.querySelector<HTMLElement>('.od-retranslation')!;
  let disposed=false,pending=false;
  composer.querySelector<HTMLButtonElement>('.translation-settings-button')!.onclick=()=>openTranslationSettings(doc);
  button.onclick=async()=>{
    if(pending)return;
    if(!zh.value.trim()){options.say('请先输入需要翻译的中文。');zh.focus();return;}
    const revision=options.revision(),epoch=options.epoch(),text=zh.value;
    pending=true;button.disabled=true;button.textContent='翻译中…';options.say('正在翻译，请稍候…');
    try{
      const result=await request('translate',{text}) as {text:string;chinese:string};
      if(disposed||options.epoch()!==epoch)return;
      if(options.revision()!==revision){options.say('草稿已修改，本次翻译未覆盖新内容。请重新点击“转为英文”。');return;}
      if(!result?.text?.trim()||!result?.chinese?.trim())throw new Error('翻译结果不完整，原稿已保留。');
      en.value=result.text;note.textContent=`中文对照：${result.chinese}`;options.success();options.say('已转为英文，请核对后继续操作。');
    }catch(e){if(!disposed&&options.epoch()===epoch)options.say(`${(e as Error).message} 原稿已保留。`);}
    finally{pending=false;if(!disposed){button.disabled=false;button.textContent='转为英文';}}
  };
  return ()=>{disposed=true;};
}
