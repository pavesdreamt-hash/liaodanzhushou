// UI dismissal is separate from the source task's business completion/reminder.
export function inventoryNoticeTokens(pending:any[],pendingNew:any[]):string[]{
  return [...pending.map(t=>{const p=t.current||t.after||t.before||{};return JSON.stringify(['task',t.id||t.remoteProductId,t.kind,t.action,p.sourceKey,p.sourceName,p.stock,p.cost,p.suggestedPrice,(t.fields||[]).map((f:any)=>[f.field,f.before,f.after]).sort((a:any,b:any)=>String(a[0]).localeCompare(String(b[0])))]);}),...pendingNew.map(p=>JSON.stringify(['new',p.key,p.sourceName,p.stock,p.cost,p.suggestedPrice]))];
}
export function inventoryNoticePreference(storage:Pick<Storage,'getItem'|'setItem'>){
  const key='liaodan-inventory-dismissed-notices-v1';let dismissed=new Set<string>();
  try{const saved=JSON.parse(storage.getItem(key)||'[]');if(Array.isArray(saved))dismissed=new Set(saved.filter(v=>typeof v==='string'));}catch{}
  return {
    hidden:(tokens:string[])=>tokens.length>0&&tokens.every(t=>dismissed.has(t)),
    dismiss(tokens:string[]){const next=[...new Set(tokens)];storage.setItem(key,JSON.stringify(next));dismissed=new Set(next);},
    restore(){storage.setItem(key,'[]');dismissed.clear();}
  };
}
