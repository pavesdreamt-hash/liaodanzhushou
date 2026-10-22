import css from './pagination.css?raw';
type Options={container?:HTMLElement;previous?:HTMLButtonElement;current?:HTMLElement;next?:HTMLButtonElement;label:string;onPrevious?:()=>void;onNext?:()=>void};
export function createPagination(doc:Document,o:Options){
  if(!doc.getElementById('shared-pagination-style')){const style=doc.createElement('style');style.id='shared-pagination-style';style.textContent=css;doc.head.append(style);}
  const element=o.container||doc.createElement('nav'),previous=o.previous||doc.createElement('button'),current=o.current||doc.createElement('span'),next=o.next||doc.createElement('button');
  element.classList.add('ld-pagination');element.setAttribute('aria-label',o.label);current.classList.add('ld-page-current');current.setAttribute('aria-live','polite');current.setAttribute('aria-atomic','true');
  for(const [button,label,shape]of [[previous,'上一页','m15 18-6-6 6-6'],[next,'下一页','m9 18 6-6-6-6']] as const){
    button.type='button';button.setAttribute('aria-label',label);button.title=label;const svg=doc.createElementNS('http://www.w3.org/2000/svg','svg'),path=doc.createElementNS('http://www.w3.org/2000/svg','path');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');svg.setAttribute('aria-hidden','true');path.setAttribute('d',shape);svg.append(path);button.replaceChildren(svg);
  }
  if(o.onPrevious)previous.onclick=o.onPrevious;if(o.onNext)next.onclick=o.onNext;element.replaceChildren(previous,current,next);
  const update=({page,pages,empty=false,busy=false}:{page:number;pages:number;empty?:boolean;busy?:boolean})=>{current.textContent=empty?'0 / 0':`${page} / ${pages}`;previous.disabled=busy||empty||page<=1;next.disabled=busy||empty||page>=pages;element.setAttribute('aria-busy',String(busy));};
  return {element,previous,current,next,update};
}
