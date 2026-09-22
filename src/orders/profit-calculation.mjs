import {convertAedFilsToRmbFen} from './financial-rules.mjs';
import {isPendingPackageStatus,isRealizedPackageStatus,requirePackageStatus} from './shipping-calculation.mjs';

const DECIMAL=/^([+-]?)(\d+)(?:\.(\d{1,2}))?$/;

export function moneyToFils(value,{allowNull=false}={}){
  if(value===null||value===undefined||value===''){
    if(allowNull)return null;
    throw new TypeError('金额不能为空');
  }
  if(typeof value==='bigint')return value;
  if(typeof value==='number')throw new TypeError('金额必须以字符串或整数fils传入，不能使用JavaScript浮点数');
  const text=String(value).trim(),match=DECIMAL.exec(text);if(!match)throw new TypeError(`金额格式无效：${text}`);
  const sign=match[1]==='-'?-1n:1n,whole=BigInt(match[2]),fraction=BigInt((match[3]||'').padEnd(2,'0'));return sign*(whole*100n+fraction);
}

export function filsToDecimal(value){
  if(value===null||value===undefined)return null;const amount=BigInt(value),sign=amount<0n?'-':'',absolute=amount<0n?-amount:amount;
  return `${sign}${absolute/100n}.${String(absolute%100n).padStart(2,'0')}`;
}

function roundRatio(numerator,denominator){if(denominator<=0n)throw new RangeError('分摊分母必须大于0');return (numerator+denominator/2n)/denominator;}

export function allocateShippingFee(items,shippingFeeFils){
  const fee=BigInt(shippingFeeFils);if(fee<0n)throw new RangeError('运费不能为负数');
  if(!items.length){if(fee!==0n)throw new RangeError('没有商品时不能分摊运费');return [];}
  const revenues=items.map(item=>BigInt(item.lineRevenueFils)),total=revenues.reduce((sum,value)=>sum+value,0n);
  if(total===0n)return items.map((_item,index)=>index===items.length-1?fee:0n);
  let allocated=0n;return items.map((_item,index)=>{if(index===items.length-1)return fee-allocated;const rounded=roundRatio(fee*revenues[index],total),share=rounded>fee-allocated?fee-allocated:rounded;allocated+=share;return share;});
}

function prepareItems(items){return items.map((item,index)=>{
  const quantity=BigInt(item.quantity),unitActualPriceFils=moneyToFils(item.unit_actual_price),unitListPriceFils=moneyToFils(item.unit_list_price??item.unit_actual_price),unitCostFils=moneyToFils(item.unit_cost_snapshot,{allowNull:true}),lineRevenueFils=item.line_actual_revenue===undefined?unitActualPriceFils*quantity:moneyToFils(item.line_actual_revenue);
  if(quantity<=0n||quantity>BigInt(Number.MAX_SAFE_INTEGER))throw new RangeError(`第${index+1}条商品数量无效`);
  return {...item,quantity:Number(quantity),unitActualPriceFils,unitListPriceFils,unitCostFils,lineRevenueFils,lineCostFils:unitCostFils===null?null:unitCostFils*quantity};
});}

const feeTotal=fee=>fee===null||fee===undefined?null:BigInt(fee.totalFeeFils);

export function calculatePackage({items,status,projectedFee=null,realizedFee=null,feeFinalized=false,packageNeedsReview=false}){
  requirePackageStatus(status);const prepared=prepareItems(items),missingSignedCost=prepared.some(item=>item.lineCostFils===null),projectedTotal=feeTotal(projectedFee),realizedTotal=feeTotal(realizedFee);
  const projectedAllocations=projectedTotal===null?prepared.map(()=>null):allocateShippingFee(prepared,projectedTotal),projectedAvailable=projectedTotal!==null&&!missingSignedCost;
  const completed=isRealizedPackageStatus(status),signed=status==='signed',zeroRevenueFee=(projectedTotal||realizedTotal||0n)>0n&&prepared.every(item=>item.lineRevenueFils===0n);
  const realizedAvailable=completed&&feeFinalized&&realizedTotal!==null&&(!signed||!missingSignedCost),realizedAllocations=realizedTotal===null?prepared.map(()=>null):allocateShippingFee(prepared,realizedTotal);
  const calculatedItems=prepared.map((item,index)=>{
    const projectedAllocatedShippingFeeFils=projectedAllocations[index],projectedLineProfitFils=projectedAvailable?item.lineRevenueFils-item.lineCostFils-projectedAllocatedShippingFeeFils:null;
    let realizedLineRevenueFils=null,realizedLineCostFils=null,realizedLineProfitFils=null,realizedAllocatedShippingFeeFils=realizedAllocations[index];
    if(realizedAvailable){
      if(signed){realizedLineRevenueFils=item.lineRevenueFils;realizedLineCostFils=item.lineCostFils;realizedLineProfitFils=realizedLineRevenueFils-realizedLineCostFils-realizedAllocatedShippingFeeFils;}
      else{realizedLineRevenueFils=0n;realizedLineCostFils=0n;realizedLineProfitFils=-realizedAllocatedShippingFeeFils;}
    }else realizedAllocatedShippingFeeFils=null;
    return {...item,projectedAllocatedShippingFeeFils,projectedLineProfitFils,realizedAllocatedShippingFeeFils,realizedLineRevenueFils,realizedLineCostFils,realizedLineProfitFils,
      needsReview:Boolean(item.needs_review)||(signed&&missingSignedCost)||zeroRevenueFee};
  });
  const projectedProfitFils=projectedAvailable?calculatedItems.reduce((sum,item)=>sum+item.projectedLineProfitFils,0n):null,realizedProfitFils=realizedAvailable?calculatedItems.reduce((sum,item)=>sum+item.realizedLineProfitFils,0n):null;
  const incomplete=packageNeedsReview||prepared.some(item=>Boolean(item.needs_review))||(signed&&missingSignedCost)||zeroRevenueFee,profitStatus=incomplete?'incomplete':realizedAvailable?'final':isPendingPackageStatus(status)||completed?'pending':'pending';
  return {status,projectedFeeFils:projectedTotal,realizedFeeFils:realizedTotal,shippingFeeFinalized:Boolean(feeFinalized),items:calculatedItems,projectedProfitFils,realizedProfitFils,profitStatus,needsReview:incomplete};
}

export function calculateOrder(packages,{exchangeRate=null}={}){
  const projectedComplete=packages.every(value=>value.projectedProfitFils!==null),realizedComplete=packages.every(value=>value.profitStatus==='final'&&value.realizedProfitFils!==null),incomplete=packages.some(value=>value.profitStatus==='incomplete');
  const projectedProfitFils=projectedComplete?packages.reduce((sum,value)=>sum+value.projectedProfitFils,0n):null,realizedProfitFils=realizedComplete?packages.reduce((sum,value)=>sum+value.realizedProfitFils,0n):null;
  const profitStatus=incomplete?'incomplete':realizedComplete?'final':'pending',projectedRmbFen=projectedProfitFils!==null&&exchangeRate?convertAedFilsToRmbFen(projectedProfitFils,exchangeRate):null,
    realizedRmbFen=realizedProfitFils!==null&&exchangeRate?convertAedFilsToRmbFen(realizedProfitFils,exchangeRate):null,rmbSettlementStatus=!exchangeRate?'pending':profitStatus==='final'?'final':profitStatus==='incomplete'?'incomplete':'pending';
  return {packages,items:packages.flatMap(value=>value.items),projectedProfitFils,realizedProfitFils,profitStatus,projectedRmbFen,realizedRmbFen,rmbSettlementStatus};
}
