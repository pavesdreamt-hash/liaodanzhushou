export function normalizeSku(value){return String(value??'').trim().toUpperCase();}

export function classifySeries(sku){
  const normalizedSku=normalizeSku(sku);
  if(/^\d+$/.test(normalizedSku))return {normalizedSku,seriesCode:'NUMERIC',needsReview:false};
  const prefix=/^[A-Z]+/.exec(normalizedSku)?.[0];
  if(prefix)return {normalizedSku,seriesCode:prefix,needsReview:false};
  return {normalizedSku,seriesCode:`UNCLASSIFIED:${normalizedSku||'<EMPTY>'}`,needsReview:true};
}

export function groupItemsBySeries(items){
  const groups=new Map();
  items.forEach((item,index)=>{
    const classification=classifySeries(item.sku_code);
    // Unknown SKUs must not be silently combined. Each stays in a separate
    // review package until a person assigns a reliable series.
    const seriesCode=classification.needsReview?`${classification.seriesCode}|ITEM:${index+1}`:classification.seriesCode;
    if(!groups.has(seriesCode))groups.set(seriesCode,{seriesCode,needsReview:classification.needsReview,items:[]});
    groups.get(seriesCode).items.push({...item,sourceIndex:index,normalizedSku:classification.normalizedSku,seriesCode});
  });
  return [...groups.values()];
}
