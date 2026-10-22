import {trapDialogFocus} from './live-dialog';
import {createSourceMappingPanel} from './source-mapping-panel';
type Options={doc:Document;source:{key:string;sourceName:string;sourceRow?:number};returnLabel?:string;onSaved:()=>Promise<void>;onClose:()=>void};
export function openSourceMappingDialog(o:Options){
  const d=o.doc,box=d.createElement('dialog'),header=d.createElement('header'),title=d.createElement('h2'),copy=d.createElement('p'),content=d.createElement('div'),summary=d.createElement('p'),mapping=d.createElement('div'),message=d.createElement('output'),bar=d.createElement('footer'),retry=d.createElement('button'),close=d.createElement('button');
  box.className='live-dialog source-mapping-dialog';box.setAttribute('aria-label','核对来源资料与网站商品');
  title.textContent='核对来源资料与网站商品';copy.textContent=`${o.source.sourceRow?`第 ${o.source.sourceRow} 行 · `:''}${o.source.sourceName}`;
  content.className='source-mapping-content';mapping.className='mapping';summary.className='mapping-summary';message.setAttribute('aria-live','polite');retry.type=close.type='button';retry.textContent='重新读取本机资料';close.textContent=o.returnLabel||'关闭并返回待上新';
  header.append(title,copy);content.append(summary,mapping);bar.append(retry,close);box.append(header,content,message,bar);d.body.append(box);
  const panel=createSourceMappingPanel({doc:d,mapping,summary,initialSource:o.source,localOnly:true,notify:text=>{message.textContent=text;},onSaved:o.onSaved});
  let loading=false;
  const read=async()=>{if(loading||panel.isSaving())return;loading=true;retry.disabled=true;summary.textContent='正在读取完整人工核对资料，已有确认会原样显示…';try{await panel.reload();message.textContent='';}catch{message.textContent='读取未完成，请点击“重新读取本机资料”重试。';}finally{loading=false;retry.disabled=false;}};
  const requestClose=()=>{if(panel.isSaving())return;box.close();};close.onclick=requestClose;
  retry.onclick=()=>{if(panel.hasDrafts()){message.textContent='当前选择尚未保存，请先保存，或关闭弹窗后重新打开以放弃选择。';return;}void read();};
  box.addEventListener('cancel',e=>{if(panel.isSaving())e.preventDefault();});
  box.addEventListener('close',()=>{panel.dispose();box.remove();o.onClose();},{once:true});
  trapDialogFocus(box);box.showModal();void read();
}
