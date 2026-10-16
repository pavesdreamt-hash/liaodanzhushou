export const WEBSITE_PRICE_MARGIN_FILS=2000;
const toFils=(value:unknown):number|null=>{
  if(typeof value!=='number'&&typeof value!=='string')return null;
  if(typeof value==='string'&&!/^\d+(?:\.\d{1,2})?$/.test(value.trim()))return null;
  const amount=Number(value),fils=Math.round((amount+Number.EPSILON)*100);
  return Number.isFinite(amount)&&amount>=0&&Number.isSafeInteger(fils)?fils:null;
};
const aed=(fils:number)=>`AED ${(fils/100).toFixed(2)}`;
export function websitePriceGuard(product:{websitePriceAed?:unknown;suggestedPriceAed?:unknown}){
  const websiteFils=toFils(product.websitePriceAed),suggestedFils=toFils(product.suggestedPriceAed),minimumFils=suggestedFils===null?null:suggestedFils+WEBSITE_PRICE_MARGIN_FILS;
  if(websiteFils===null||minimumFils===null||!Number.isSafeInteger(minimumFils))return {status:'unknown' as const,websiteFils,suggestedFils,minimumFils:null,shortfallFils:null,message:`${suggestedFils===null?'建议售价':websiteFils===null?'网站售价':'价格'}缺失或无效，价格待核对；无法判断网站售价是否达到建议售价 + 20 AED。`};
  const shortfallFils=Math.max(0,minimumFils-websiteFils),low=shortfallFils>0;
  return {status:low?'low' as const:'ok' as const,websiteFils,suggestedFils,minimumFils,shortfallFils,message:`网站售价 ${aed(websiteFils)}，建议售价 ${aed(suggestedFils!)}，最低应为 ${aed(minimumFils)}（建议售价 + 20 AED）。${low?`低 ${aed(shortfallFils)}；请到网站后台修改。`:'已符合最低售价要求。'}`};
}
