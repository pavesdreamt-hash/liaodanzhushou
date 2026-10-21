import {toPriceFils} from './website-price-rule.mjs';
// Interpret only explicit source price labels. Never extract the first number
// from arbitrary notes, choose an endpoint of a range, or add delivery charges.
export function sourcePrice(value,kind='suggested'){
  const exact=toPriceFils(value);
  if(exact!==null)return {value:exact/100,issue:null};
  const raw=String(value??'').normalize('NFKC').trim(),amount='(\\d+(?:\\.\\d{1,2})?)';
  let match;
  if(kind==='cost')match=raw.match(new RegExp(`^${amount}\\s*\\(不单卖\\)$`));
  else match=raw.match(new RegExp(`^(?:库存少[,，]\\s*)?(?:最低销售价|销售价|建议售价|售价)[:：]?\\s*${amount}\\s*(?:AED)?(?:\\s*\\n\\s*运费\\s*\\d+(?:\\.\\d{1,2})?\\s*AED)?$`,'i'));
  if(match&&toPriceFils(match[1])!==null)return {value:Number(match[1]),issue:null};
  const label=kind==='cost'?'成本':'建议售价',range=new RegExp(`^${amount}\\s*[-–—~～至]\\s*${amount}(?:\\s*AED)?$`,'i').test(raw);
  return {value:null,issue:range?`${label}为区间，请人工确认目标价`:`来源${label}缺失或格式待核对`};
}
