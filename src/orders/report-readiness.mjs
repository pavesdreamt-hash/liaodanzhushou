import {validateRecipientForTxt} from './package-report.mjs';
import {classifySeries} from './series-classifier.mjs';

const passed=(key,label)=>({key,label,ok:true,text:'通过'});
const failed=(key,label,reason)=>({key,label,ok:false,blocking:true,text:reason});
const attention=(key,label,reason)=>({key,label,ok:false,blocking:false,text:reason});
const integer=value=>Number.isSafeInteger(Number(value));

const recipientCheck=order=>{
  const recipient=validateRecipientForTxt(order);
  if(recipient.problems.length)return failed('recipient','用户信息',recipient.problems.map(problem=>problem.label).join('；'));
  if(recipient.warnings.some(warning=>warning.code==='RESIDENCE_MISSING')&&!order.address_detail_confirmed)return failed('recipient','用户信息','Residence缺失，请补全或明确核对Street详细地址');
  return passed('recipient','用户信息');
};
const readiness=checks=>({checks,ok:checks.every(check=>check.ok||check.blocking===false)});

export function packageReportReadiness({order,parcel,items,addressStatus='not_configured'}={}){
  const user=recipientCheck(order);
  const address=addressStatus==='deliverable'&&Boolean(String(order?.street??'').trim())&&(Boolean(String(order?.residence??'').trim())||order?.address_detail_confirmed===true)?passed('address','地址可配送'):failed('address','地址可配送',addressStatus==='out_of_range'?'超出派送范围':addressStatus==='unusable'?'地址不可用，需核对':addressStatus==='failed'?'校验失败，请重试':'地址校验未配置');
  const confirmation=order?.order_confirmed?passed('confirmation','客户确认'):failed('confirmation','客户确认','订单尚未确认');
  const products=Array.isArray(items)&&items.length&&items.every(item=>String(item.sku_code??'').trim()&&Number.isSafeInteger(Number(item.quantity))&&Number(item.quantity)>0&&integer(item.unit_actual_price)&&Number(item.unit_actual_price)>=0&&classifySeries(item.sku_code).seriesCode===parcel?.series_code)?passed('products','商品信息'):failed('products','商品信息','商品编号、数量、金额或系列需要核对');
  const packageInfo=Array.isArray(items)&&items.length&&String(parcel?.series_code??'').trim()&&String(parcel.series_code)!=='REVIEW'&&items.every(item=>item.package_id===parcel.id&&classifySeries(item.sku_code).seriesCode===parcel.series_code)?passed('package','包裹信息'):failed('package','包裹信息','分包未完成或存在异常商品');
  const prices=Array.isArray(items)&&items.length&&items.every(item=>{const unit=Number(item.unit_actual_price),quantity=Number(item.quantity),revenue=Number(item.line_revenue),gross=Number(item.line_gross),discount=item.manual_discount===null||item.manual_discount===undefined?gross-revenue:Number(item.manual_discount);return integer(unit)&&unit>=0&&integer(quantity)&&quantity>0&&integer(revenue)&&revenue>=0&&integer(gross)&&gross>=revenue&&integer(discount)&&discount>=0&&gross-revenue===discount&&unit*quantity===revenue&&item.actual_price_confirmed!==0;})?passed('price','价格信息'):failed('price','价格信息','商品金额或优惠无法精确生成报单');
  return readiness([user,address,confirmation,products,packageInfo,prices]);
}

export function orderReportReadiness({order,packages,items,addressStatus='not_configured'}={}){
  const user=recipientCheck(order);
  const address=addressStatus==='deliverable'&&Boolean(String(order?.street??'').trim())&&(Boolean(String(order?.residence??'').trim())||order?.address_detail_confirmed===true)?passed('address','地址可配送'):failed('address','地址可配送',addressStatus==='out_of_range'?'超出派送范围':addressStatus==='unusable'?'地址不可用，需核对':addressStatus==='failed'?'校验失败，请重试':'地址校验未配置');
  const confirmation=order?.order_confirmed?passed('confirmation','客户确认'):failed('confirmation','客户确认','订单尚未确认');
  const products=Array.isArray(items)&&items.length&&items.every(item=>String(item.sku_code??'').trim()&&Number.isSafeInteger(Number(item.quantity))&&Number(item.quantity)>0&&integer(item.unit_actual_price)&&Number(item.unit_actual_price)>=0)?passed('products','商品信息'):failed('products','商品信息','商品编号、数量或金额需要核对');
  const packageIds=new Set((packages||[]).map(parcel=>parcel.id)),packageInfo=Array.isArray(packages)&&packages.length&&packages.every(parcel=>String(parcel.series_code??'').trim()&&String(parcel.series_code)!=='REVIEW')&&items.every(item=>packageIds.has(item.package_id)&&classifySeries(item.sku_code).seriesCode===packages.find(parcel=>parcel.id===item.package_id)?.series_code)?passed('package','包裹信息'):failed('package','包裹信息','分包未完成或存在异常商品');
  const prices=Array.isArray(items)&&items.length&&items.every(item=>{const unit=Number(item.unit_actual_price),quantity=Number(item.quantity),revenue=Number(item.line_revenue),gross=Number(item.line_gross),discount=item.manual_discount===null||item.manual_discount===undefined?gross-revenue:Number(item.manual_discount);return integer(unit)&&unit>=0&&integer(quantity)&&quantity>0&&integer(revenue)&&revenue>=0&&integer(gross)&&gross>=revenue&&integer(discount)&&discount>=0&&gross-revenue===discount&&unit*quantity===revenue&&item.actual_price_confirmed!==0;})?passed('price','价格信息'):failed('price','价格信息','客户确认的商品总价或优惠需要核对');
  return readiness([user,address,confirmation,products,packageInfo,prices]);
}
