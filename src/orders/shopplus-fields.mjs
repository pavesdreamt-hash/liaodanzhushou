import {moneyToFils} from './profit-calculation.mjs';

export const normalizeHeader=value=>String(value??'').normalize('NFKC').replace(/[\s\u00a0]+/g,'').replace(/[：:]/g,'').toLowerCase();

const GROUPS={
  order:['订单信息基础信息','订单基础信息','订单信息'],shipping:['收货信息','配送信息'],product:['商品信息'],logistics:['物流信息'],billing:['账单信息']
};
const FIELDS={
  order:{siteId:['站点ID'],orderNo:['订单号'],orderSequence:['订单序号'],subOrderId:['子订单ID','子订单 ID'],createdAt:['创建时间'],paidAt:['支付时间'],shippedAt:['发货时间'],cancelledAt:['取消时间'],orderStatus:['订单状态'],aftersaleStatus:['售后状态'],repaidStatus:['是否再次支付'],channelSource:['渠道来源'],paymentMethod:['支付方式'],currency:['货币单位'],orderTotal:['订单总价'],productTotal:['商品总价'],discountAmount:['优惠金额'],customerShippingFee:['物流费用'],taxAmount:['税费'],shippingInsurance:['运费险'],tipAmount:['小费'],fixedDiscountAmount:['订单一口价优惠'],buyerNote:['买家备注'],orderNote:['订单备注'],websiteDomain:['网站域名']},
  shipping:{firstName:['名(firstName)','名'],lastName:['姓(lastName)','姓'],fullName:['姓名'],phone:['联系电话'],email:['联系邮箱'],country:['国家'],province:['省/州','省州'],city:['城市'],street:['街道'],residence:['寓所'],postalCode:['邮编'],doorNumber:['门牌号']},
  billing:{firstName:['名(firstName)','名'],lastName:['姓(lastName)','姓'],fullName:['姓名'],phone:['联系电话'],email:['联系邮箱'],country:['国家'],province:['省/州','省州'],city:['城市'],street:['街道'],residence:['寓所'],postalCode:['邮编'],doorNumber:['门牌号']},
  product:{skuId:['SKU ID','SKU ID'],spuId:['商品SPU'],spuCode:['SPU编码'],productSku:['商品SKU'],productName:['商品名称'],attribute1:['属性1'],attribute2:['属性2'],attribute3:['属性3'],skuCustomAttribute:['sku自定义属性'],unitPrice:['商品售价'],quantity:['售出数量'],paymentStatus:['商品支付状态'],fulfillmentStatus:['商品配送状态'],virtualProduct:['虚拟商品']},
  logistics:{trackingNumber:['物流单号'],logisticsCompany:['物流商']}
};

const groupMap=new Map(Object.entries(GROUPS).flatMap(([key,values])=>values.map(value=>[normalizeHeader(value),key])));
const fieldMaps=Object.fromEntries(Object.entries(FIELDS).map(([group,fields])=>[group,new Map(Object.entries(fields).flatMap(([key,values])=>values.map(value=>[normalizeHeader(value),key])))]));

export function canonicalGroup(value){const normalized=normalizeHeader(value);for(const [alias,key] of groupMap)if(normalized===alias||normalized.includes(alias))return key;return null;}
export function canonicalField(group,value){return fieldMaps[group]?.get(normalizeHeader(value))||null;}

const BUSINESS_CODE=/^(?:[A-Z]{1,8}\d[A-Z0-9-]*|\d{3})$/;
export function normalizeBusinessCode(value){const text=String(value??'').trim().toUpperCase();return BUSINESS_CODE.test(text)?text:null;}
export function leadingBusinessCode(productName){const text=String(productName??'').trim().normalize('NFKC'),match=/^(?:([A-Za-z]{1,8}\d[A-Za-z0-9-]*)|(\d{3}))(?=\s|[^A-Za-z0-9-]|$)/.exec(text);return match?normalizeBusinessCode(match[1]||match[2]):null;}
export function businessCodeCandidates(row){return [
  {source:'product_sku',value:normalizeBusinessCode(row.productSku)},
  {source:'spu_code',value:normalizeBusinessCode(row.spuCode)},
  {source:'product_name_prefix',value:leadingBusinessCode(row.productName)}
].filter(candidate=>candidate.value);}

export function mapShopPlusStatus(value){
  const raw=String(value??''),status=normalizeHeader(raw);
  if(/已发货|shipped|fulfilled/.test(status))return {packageStatus:'shipped_pending',needsReview:false,warning:null};
  if(/待发货|未发货|pending|unfulfilled|new|paid/.test(status))return {packageStatus:'unshipped',needsReview:false,warning:null};
  if(/取消|cancel/.test(status))return {packageStatus:'unshipped',needsReview:true,warning:'CANCEL_STAGE_UNKNOWN'};
  return {packageStatus:'unshipped',needsReview:true,warning:'ORDER_STATUS_UNKNOWN'};
}

function pad(value){return String(value).padStart(2,'0');}
export function excelSerialToSourceTime(serial,{date1904=false}={}){
  if(!Number.isFinite(serial))return null;const whole=Math.floor(serial),fraction=serial-whole,epoch=date1904?Date.UTC(1904,0,1):Date.UTC(1899,11,30),date=new Date(epoch+whole*86400000+Math.round(fraction*86400000));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth()+1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}
export function sourceDate(value,{date1904=false}={}){
  if(value===null||value===undefined||value==='')return {value:null,warning:null};
  if(value instanceof Date)return {value:`${value.getUTCFullYear()}-${pad(value.getUTCMonth()+1)}-${pad(value.getUTCDate())}T${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}:${pad(value.getUTCSeconds())}`,warning:null};
  if(typeof value==='number'){const parsed=excelSerialToSourceTime(value,{date1904});return parsed?{value:parsed,warning:null}:{value:String(value),warning:'DATE_PARSE_FAILED'};}
  const text=String(value);if(/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(text))return {value:text.replaceAll('/','-'),warning:null};return {value:text,warning:'DATE_PARSE_FAILED'};
}
export function amountToFils(value,{allowNull=true}={}){
  if(value===null||value===undefined||String(value).trim()===''){if(allowNull)return null;throw new TypeError('金额为空');}
  const text=String(value).trim().replace(/,/g,'').replace(/^(?:AED|د\.إ)\s*/i,'');return Number(moneyToFils(text));
}
export function integerQuantity(value){const text=String(value??'').trim(),number=Number(text);if(!/^\d+$/.test(text)||!Number.isSafeInteger(number)||number<=0)throw new TypeError('售出数量必须是正整数');return number;}
