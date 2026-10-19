export const WEBSITE_PRICE_RULE_ID='cost200-suggested20-v1';
export const WEBSITE_PRICE_MARGIN_FILS=2000;
export const WEBSITE_COST_MARGIN_FILS=20000;
export const toPriceFils=value=>{
  if(typeof value!=='number'&&typeof value!=='string')return null;
  if(typeof value==='string'&&!/^\d+(?:\.\d{1,2})?$/.test(value.trim()))return null;
  const amount=Number(value),fils=Math.round((amount+Number.EPSILON)*100);
  return Number.isFinite(amount)&&amount>=0&&Number.isSafeInteger(fils)?fils:null;
};
const aed=fils=>`AED ${(fils/100).toFixed(2)}`;
export function websitePriceGuard(product){
  const websiteFils=toPriceFils(product.websitePriceAed),suggestedFils=toPriceFils(product.suggestedPriceAed),costFils=toPriceFils(product.costPriceAed),costMinimumFils=costFils===null?null:costFils+WEBSITE_COST_MARGIN_FILS,suggestedMinimumFils=suggestedFils===null?null:suggestedFils+WEBSITE_PRICE_MARGIN_FILS,minimumFils=costMinimumFils===null||suggestedMinimumFils===null?null:Math.max(costMinimumFils,suggestedMinimumFils);
  const base={ruleId:WEBSITE_PRICE_RULE_ID,websiteFils,costFils,suggestedFils,costMinimumFils,suggestedMinimumFils,minimumFils,shortfallFils:null};
  if(websiteFils===null||minimumFils===null||!Number.isSafeInteger(minimumFils)||product.priceComplete===false)return {...base,status:'unknown',minimumFils:Number.isSafeInteger(minimumFils)?minimumFils:null,message:`${costFils===null?'成本价':suggestedFils===null?'建议售价':product.priceComplete===false?'网站规格售价':'网站售价'}缺失或无效，价格待核对；必须同时确认成本 + 200 AED与建议售价 + 20 AED两项要求。`};
  const shortfallFils=Math.max(0,minimumFils-websiteFils),low=shortfallFils>0;
  return {...base,status:low?'low':'ok',shortfallFils,message:`网站售价 ${aed(websiteFils)}，成本价 ${aed(costFils)}，建议售价 ${aed(suggestedFils)}；成本 + 200 AED为 ${aed(costMinimumFils)}，建议售价 + 20 AED为 ${aed(suggestedMinimumFils)}，最低应为 ${aed(minimumFils)}。${low?`低 ${aed(shortfallFils)}；请到网站后台修改。`:'已同时符合两项最低售价要求。'}聊天优惠不参与网站售价核验。`};
}
export function websitePriceEvidence(raw){
  const variants=Array.isArray(raw?.productVariantDTOs)?raw.productVariantDTOs:Array.isArray(raw?.variants)?raw.variants:[];
  const values=variants.length?variants.map(v=>toPriceFils(v?.salePrice??v?.price)):[toPriceFils(raw?.salePrice??raw?.price)];
  const complete=values.length>0&&values.every(v=>v!==null),minimum=complete?Math.min(...values):null;
  return {complete,variantCount:variants.length,pricesFils:values,minimumFils:minimum,websitePriceAed:minimum===null?null:minimum/100};
}
