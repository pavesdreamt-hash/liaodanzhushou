const requiredCustomerFields=Object.freeze([
  ['customer_last_name','姓'],['customer_phone','电话'],['customer_email','邮箱'],['country','国家/地区'],['province','省/州'],['city','城市'],['street','街道']
]);
const canceledStatuses=new Set(['cancelled_before_outbound','cancelled_after_outbound']);
const present=value=>value!==null&&value!==undefined&&String(value).trim()!=='';
const safeName=value=>{const result=String(value??'').normalize('NFKC').replace(/[^A-Za-z0-9._-]+/g,'_').replace(/^_+|_+$/g,'').slice(0,100);return result||'order';};
export const formatAed=fils=>{if(!Number.isSafeInteger(Number(fils)))throw new TypeError('报单金额超出安全范围');const value=Number(fils),whole=Math.trunc(value/100),fraction=Math.abs(value%100);return fraction?`${whole}.${String(fraction).padStart(2,'0')}`:String(whole);};
const clean=value=>present(value)?String(value).trim():'';

export function validateRecipientForTxt(order){const problems=[],warnings=[];for(const [field,label] of requiredCustomerFields)if(!(Boolean(order.draft_request_id)&&present(order.customer_full_name)&&field==='customer_last_name')&&!present(order[field]))problems.push({code:'CUSTOMER_FIELD_MISSING',field,label:`缺少${label}`});if(!present(order.customer_first_name)&&!(Boolean(order.draft_request_id)&&present(order.customer_full_name))){if(present(order.customer_full_name))problems.push({code:'FULL_NAME_CONFIRMATION_REQUIRED',field:'customer_first_name',label:'Name未提供，需要明确确认使用原始Full name'});else problems.push({code:'CUSTOMER_FIELD_MISSING',field:'customer_first_name',label:'缺少名和完整姓名'});}if(!present(order.residence))warnings.push({code:'RESIDENCE_MISSING',field:'residence',label:'Residence未提供，请确认Street中已有足够的详细地址。'});return {problems,warnings};}

export function buildPackageTxt({order,package:parcel,items}={}){
  if(!order||!parcel||!Array.isArray(items))throw new TypeError('报单数据不完整');const recipient=validateRecipientForTxt(order),problems=[...recipient.problems],warnings=[...recipient.warnings];
  if(!order.order_confirmed)problems.push({code:'ORDER_NOT_CONFIRMED',label:'订单尚未人工确认'});if(canceledStatuses.has(parcel.package_status))problems.push({code:'PACKAGE_CANCELLED',label:'包裹已经取消'});
  if(!items.length)problems.push({code:'PACKAGE_ITEMS_MISSING',label:'包裹没有商品'});
  let totalFils=0;for(const item of items){if(!present(item.sku_code))problems.push({code:'ITEM_SKU_MISSING',itemId:item.id,label:'缺少商品编号'});const price=Number(item.unit_actual_price),quantity=Number(item.quantity),line=Number(item.line_revenue);if(!Number.isSafeInteger(price)||price<0||!Number.isSafeInteger(quantity)||quantity<=0||!Number.isSafeInteger(line)||line<0||price*quantity!==line)problems.push({code:'REPORT_PRICE_NOT_EXACT',itemId:item.id,label:'成交单价×数量无法精确表达包裹应收金额'});else totalFils+=line;}
  if(problems.length)return {ok:false,problems,warnings,filename:`${safeName(order.shopplus_order_no)}_${safeName(parcel.series_code)}.txt`,content:null,totalFils:null};
  const streetResidence=[clean(order.street),clean(order.residence)].filter(Boolean).join('-'),locality=[clean(order.city),clean(order.province),clean(order.country)].filter(Boolean).join('/'),billingAddress=[streetResidence,locality].filter(Boolean).join(' - '),lines=[`Surname: ${order.customer_last_name||''}`,`Name: ${Boolean(order.draft_request_id)&&order.customer_full_name?order.customer_full_name:order.customer_first_name}`,`Telephone: ${order.customer_phone}`,`Email: ${order.customer_email}`,`Country/Region: ${order.country}`,`Province: ${order.province}`,`City: ${order.city}`,`Street: ${order.street}`,`Residence:${present(order.residence)?` ${order.residence}`:''}`,'', 'Billing address',billingAddress,'','Order Price Details：',''];
  for(const item of items)lines.push(`${item.sku_code}      AED${formatAed(Number(item.unit_actual_price))} x ${Number(item.quantity)}`);
  return {ok:true,problems:[],warnings,filename:`${safeName(order.shopplus_order_no)}_${safeName(parcel.series_code)}.txt`,content:lines.join('\n')+'\n',totalFils};
}

export function buildOrderTxt({order,packages,items}={}){
  if(!order||!Array.isArray(packages)||!Array.isArray(items))throw new TypeError('报单数据不完整');
  const recipient=validateRecipientForTxt(order),problems=[...recipient.problems],warnings=[...recipient.warnings];
  if(!order.order_confirmed)problems.push({code:'ORDER_NOT_CONFIRMED',label:'订单尚未人工确认'});
  if(!packages.length)problems.push({code:'ORDER_PACKAGES_MISSING',label:'订单没有包裹'});
  if(packages.some(parcel=>canceledStatuses.has(parcel.package_status)))problems.push({code:'PACKAGE_CANCELLED',label:'订单包含已取消包裹'});
  if(!items.length)problems.push({code:'ORDER_ITEMS_MISSING',label:'订单没有商品'});
  let totalFils=0;
  for(const item of items){
    if(!present(item.sku_code))problems.push({code:'ITEM_SKU_MISSING',itemId:item.id,label:'缺少商品编号'});
    const price=Number(item.unit_actual_price),quantity=Number(item.quantity),line=Number(item.line_revenue);
    if(!Number.isSafeInteger(price)||price<0||!Number.isSafeInteger(quantity)||quantity<=0||!Number.isSafeInteger(line)||line<0||price*quantity!==line)problems.push({code:'REPORT_PRICE_NOT_EXACT',itemId:item.id,label:'成交单价×数量无法精确表达订单应收金额'});else totalFils+=line;
  }
  const reportNumber=clean(order.report_number),phone=clean(order.customer_phone).replace(/[\u0009\u0020\u00a0]+/gu,''),displayNumber=reportNumber&&phone?`${reportNumber}（${phone}）`:reportNumber;
  if(!reportNumber)problems.push({code:'REPORT_NUMBER_MISSING',label:'缺少报单编号'});
  const filename=`${safeName(order.shopplus_order_no)}_${safeName(reportNumber||'report')}.txt`;
  if(problems.length)return {ok:false,problems,warnings,filename,content:null,totalFils:null,reportNumber:displayNumber||null};
  const streetResidence=[clean(order.street),clean(order.residence)].filter(Boolean).join('-'),locality=[clean(order.city),clean(order.province),clean(order.country)].filter(Boolean).join('/'),billingAddress=[streetResidence,locality].filter(Boolean).join(' - '),lines=[`Report No: ${displayNumber}`,`Surname: ${order.customer_last_name||''}`,`Name: ${Boolean(order.draft_request_id)&&order.customer_full_name?order.customer_full_name:order.customer_first_name}`,`Telephone: ${order.customer_phone}`,`Email: ${order.customer_email}`,`Country/Region: ${order.country}`,`Province: ${order.province}`,`City: ${order.city}`,`Street: ${order.street}`,`Residence:${present(order.residence)?` ${order.residence}`:''}`,'','Billing address',billingAddress,'','Order Price Details：',''];
  for(const item of items)lines.push(`${item.sku_code}      AED${formatAed(Number(item.unit_actual_price))} x ${Number(item.quantity)}`);
  return {ok:true,problems:[],warnings,filename,content:lines.join('\n')+'\n',totalFils,reportNumber:displayNumber};
}
