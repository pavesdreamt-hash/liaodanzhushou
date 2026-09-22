import {PACKAGE_STATUSES} from './shipping-calculation.mjs';
const SOURCES=new Set(['shopplus_api','shopplus_excel','manual']);
const PACKAGE_STATUS_SET=new Set(PACKAGE_STATUSES);

function requiredText(value,label){if(typeof value!=='string'||!value.trim())throw new TypeError(`${label}不能为空`);return value;}

export function validateOrderInput(input){
  if(!input||typeof input!=='object')throw new TypeError('订单数据不能为空');
  if(!SOURCES.has(input.source))throw new TypeError(`订单来源无效：${input.source}`);
  if(input.shopplus_order_no!==undefined&&input.shopplus_order_no!==null&&typeof input.shopplus_order_no!=='string')throw new TypeError('ShopPlus订单号必须是文本');
  if(input.delivery_status!==undefined&&!PACKAGE_STATUS_SET.has(input.delivery_status))throw new TypeError(`订单配送状态无效：${input.delivery_status}`);
  if(!Array.isArray(input.items)||!input.items.length)throw new TypeError('订单至少需要一条商品明细');
  input.items.forEach((item,index)=>{
    requiredText(item.product_name_snapshot,`第${index+1}条商品名称`);
    if(!Number.isSafeInteger(item.quantity)||item.quantity<=0)throw new TypeError(`第${index+1}条商品数量必须是正整数`);
    if(item.package_status!==undefined&&!PACKAGE_STATUS_SET.has(item.package_status))throw new TypeError(`第${index+1}条商品包裹状态无效`);
  });
  return input;
}

export function validatePackageStatus(status){if(!PACKAGE_STATUS_SET.has(status))throw new TypeError(`包裹状态无效：${status}`);return status;}
