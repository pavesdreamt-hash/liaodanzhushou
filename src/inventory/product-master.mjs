export const plainText=value=>String(value??'').replace(/<br\s*\/?\s*>|<\/p>|<\/div>/gi,'\n').replace(/<[^>]*>/g,'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').trim();
export function sellingText(value){
  if(typeof value==='string'){try{return sellingText(JSON.parse(value));}catch{return plainText(value);}}
  if(Array.isArray(value))return value.map(v=>typeof v==='string'?v:[v?.key,v?.value].filter(Boolean).join('：')).join('\n');
  return value&&typeof value==='object'?Object.entries(value).map(([k,v])=>k+'：'+v).join('\n'):plainText(value);
}
export const minimumLocalPrice=cost=>cost===null||cost===undefined||cost===''?null:Math.round((Number(cost)+220)*100)/100;
export function checkLocalPrice(price,cost,approval){
  const n=Number(price);if(price===null||price===undefined||String(price).trim()===''||typeof price==='boolean'||!Number.isFinite(n)||n<0||n>10000000||Math.abs(n*100-Math.round(n*100))>0.00001)throw Error('请填写有效本机售价，最多两位小数');
  const minimum=minimumLocalPrice(cost);
  if(minimum!==null&&Math.round(n*100)<Math.round(minimum*100)&&!(approval?.price===n&&approval?.cost===Number(cost)&&approval?.minimum===minimum))throw Error(`本机售价低于成本价格 + 220 AED（${minimum} AED），请确认低价提醒后保存`);
  return n;
}
export function localMaster(row){
  const p=row.local,w=row.website;
  return {name:p?.name??w?.localName??row.code,salePriceAed:p?p.salePriceAed:row.priceAed,availability:p?.availability??row.sourceStock??p?.sourceStock??'待核对',sellingPoints:p?.sellingPoints??sellingText(w?.sourceShortDescription),description:p?.description??row.description??'',minimumPriceAed:minimumLocalPrice(row.costPriceAed)};
}
