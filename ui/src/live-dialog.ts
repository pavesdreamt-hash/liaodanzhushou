export function dialog(doc:Document,title:string){
  const box=doc.createElement('dialog');box.className='shared-dialog live-dialog';
  const heading=doc.createElement('h2');heading.textContent=title;
  const result=doc.createElement('output');result.setAttribute('aria-live','polite');
  box.append(heading,result);doc.body.append(box);box.onclose=()=>box.remove();
  return {box,result};
}

export function trapDialogFocus(box:HTMLDialogElement){
  const doc=box.ownerDocument;
  const keydown=(event:KeyboardEvent)=>{
    if(event.key!=='Tab'||[...doc.querySelectorAll('dialog[open]')].at(-1)!==box)return;
    const items=[...box.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]')].filter(e=>e.getClientRects().length&&!e.closest('[inert]'));
    if(!items.length){event.preventDefault();box.focus();return;}
    const first=items[0],last=items.at(-1)!,active=doc.activeElement;
    if(!box.contains(active)||!event.shiftKey&&active===last||event.shiftKey&&active===first){event.preventDefault();(event.shiftKey?last:first).focus();}
  };
  doc.addEventListener('keydown',keydown,true);
  box.addEventListener('close',()=>doc.removeEventListener('keydown',keydown,true),{once:true});
}
