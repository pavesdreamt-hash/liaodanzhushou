const TARGET='button,[role="button"],[data-tooltip],.card[aria-label],section[aria-label]';

const source=(element:HTMLElement)=>element.dataset.tooltip?.trim()||element.getAttribute('title')?.trim()||element.getAttribute('aria-label')?.trim()||'';

export function installHoverHints(doc:Document){
  const win=doc.defaultView;if(!win)return()=>{};
  const tip=doc.createElement('div');tip.className='app-hover-tip';tip.id='app-hover-tip';tip.setAttribute('role','tooltip');tip.hidden=true;doc.body.append(tip);
  let current:HTMLElement|undefined,restoreTitle:string|undefined;
  const position=()=>{if(!current||tip.hidden)return;const rect=current.getBoundingClientRect(),gap=8,maxLeft=win.innerWidth-tip.offsetWidth-8;let left=Math.max(8,Math.min(maxLeft,rect.left+rect.width/2-tip.offsetWidth/2));let top=rect.bottom+gap,above=false;if(top+tip.offsetHeight>win.innerHeight-8){top=Math.max(8,rect.top-tip.offsetHeight-gap);above=true;}tip.classList.toggle('is-above',above);tip.style.left=`${Math.round(left)}px`;tip.style.top=`${Math.round(top)}px`;};
  const hide=()=>{if(!current)return;if(restoreTitle!==undefined)current.setAttribute('title',restoreTitle);current.removeAttribute('aria-describedby');current=undefined;restoreTitle=undefined;tip.hidden=true;tip.textContent='';};
  const show=(element:HTMLElement)=>{if(current===element)return;hide();const text=source(element);if(!text)return;current=element;const nativeTitle=element.getAttribute('title');if(nativeTitle!==null){restoreTitle=nativeTitle;element.removeAttribute('title');}element.setAttribute('aria-describedby',tip.id);tip.textContent=text;tip.hidden=false;position();};
  const find=(node:EventTarget|null)=>typeof (node as Element|null)?.closest==='function'?(node as Element).closest<HTMLElement>(TARGET):null;
  const onOver=(event:PointerEvent)=>{const next=find(event.target);if(next)show(next);};
  const onOut=(event:PointerEvent)=>{if(!current)return;const next=find(event.relatedTarget);if(next===current)return;hide();};
  const onFocus=(event:FocusEvent)=>{const next=find(event.target);if(next)show(next);};
  const onBlur=()=>hide();
  doc.addEventListener('pointerover',onOver);doc.addEventListener('pointerout',onOut);doc.addEventListener('focusin',onFocus);doc.addEventListener('focusout',onBlur);win.addEventListener('resize',position);win.addEventListener('scroll',position,true);
  return()=>{hide();tip.remove();doc.removeEventListener('pointerover',onOver);doc.removeEventListener('pointerout',onOut);doc.removeEventListener('focusin',onFocus);doc.removeEventListener('focusout',onBlur);win.removeEventListener('resize',position);win.removeEventListener('scroll',position,true);};
}
