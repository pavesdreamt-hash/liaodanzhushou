type Page='workbench'|'orders'|'inventory'|'profit'|'assistant'|'settings'|'product'|'order'|'profit-detail';

const titles:Record<Exclude<Page,'workbench'|'order'>,string>={
  orders:'订单管理',inventory:'商品库存',profit:'利润核算',assistant:'助手配置',
  settings:'连接与设置',product:'产品详情','profit-detail':'每日利润详情'
};

export function installEmptyWorkspace(doc:Document,page:Page){
  const root=doc.querySelector<HTMLElement>('#chat-workbench-aligned,#ui008-order-detail')||doc.querySelector<HTMLElement>('.app')!;
  root.dataset.emptyData='true';
  if(page==='workbench')return;
  if(page==='order'){
    const setText=(selector:string,text:string)=>{const element=root.querySelector<HTMLElement>(selector);if(element)element.textContent=text;};
    setText('.od-phone-meta > span','--:--');
    root.querySelector<HTMLElement>('.od-heading-copy h1')!.textContent='尚未选择订单';
    root.querySelector<HTMLElement>('.od-status-actions')!.hidden=true;
    root.querySelector<HTMLElement>('.od-content')!.replaceChildren(emptyCard(doc,'暂无真实订单','先在工作台关联并核对 WhatsApp 聊天。此空白版本不使用示例订单信息。'));
    setText('.od-contact strong','未关联客户');
    setText('.od-contact small','连接并核对 WhatsApp 聊天');
    setText('.od-avatar','?');
    root.querySelector<HTMLElement>('.od-messages')?.replaceChildren(emptyCard(doc,'暂无聊天记录','关联真实聊天后，仅显示已确认范围内的消息。'));
    return;
  }
  const side=root.querySelector<HTMLElement>('.connection,.wa');
  if(side)side.textContent='● WhatsApp · 待核对连接';
  const main=root.querySelector<HTMLElement>('.main')!;
  main.replaceChildren(emptyCard(doc,titles[page],page==='settings'?'当前是独立空白资料目录。请到工作台的客户聊天区连接 WhatsApp 并扫码。':'暂无真实资料。示例订单、商品、利润和客户不会显示在这个空白版本中。'));
}

function emptyCard(doc:Document,title:string,message:string){
  const section=doc.createElement('section');section.className='live-empty-state';section.setAttribute('role','status');
  const heading=doc.createElement('h1');heading.textContent=title;
  const note=doc.createElement('p');note.textContent=message;
  section.append(heading,note);return section;
}
