import {coreText} from '../../shared/text.mjs';
export function numericDelta(before,after){
  const parse=value=>{const m=/^([+-]?)(\d+)(?:\.(\d+))?$/.exec(coreText(value));if(!m)return null;return {sign:m[1]==='-'?-1n:1n,int:m[2],frac:m[3]||''};};
  const a=parse(before),b=parse(after);if(!a||!b)return coreText(before)===coreText(after)?'':`${coreText(before)}→${coreText(after)}`;
  const scale=Math.max(a.frac.length,b.frac.length),pow=10n**BigInt(scale);
  const toInt=x=>x.sign*(BigInt(x.int)*pow+BigInt((x.frac+'0'.repeat(scale)).slice(0,scale)||'0'));
  const difference=toInt(b)-toInt(a);if(!difference)return '';
  const sign=difference>0n?'+':'-',absolute=difference<0n?-difference:difference,whole=absolute/pow,fraction=String(absolute%pow).padStart(scale,'0').replace(/0+$/,'');
  return `${sign}${whole}${fraction?'.'+fraction:''}`;
}
export function textDelta(before,after){const a=coreText(before),b=coreText(after);return a===b?'':`${a||'空白'} → ${b||'空白'}`;}
export function compareBusiness(previous,current){
  const fields={cost:0,suggestedPrice:0,stock:0,additionalInfo:0,name:0},changes=[];
  if(!previous)return {kind:'added',costChange:'',priceChange:'',stockChange:'',additionalInfoChange:'',changed:true,fields,details:[{field:'added'}]};
  if(current.removed){return {kind:'removed',costChange:'',priceChange:'',stockChange:textDelta(previous.stock,'来源已移除'),additionalInfoChange:'',changed:previous.stock!=='来源已移除',fields:{...fields,stock:1},details:[{field:'removed',before:previous.stock,after:'来源已移除'}]};}
  const costChange=numericDelta(previous.cost,current.cost),priceChange=numericDelta(previous.suggestedPrice,current.suggestedPrice);
  if(coreText(previous.cost)!==coreText(current.cost)){fields.cost++;changes.push({field:'cost',before:previous.cost,after:current.cost});}
  if(coreText(previous.suggestedPrice)!==coreText(current.suggestedPrice)){fields.suggestedPrice++;changes.push({field:'suggestedPrice',before:previous.suggestedPrice,after:current.suggestedPrice});}
  if(coreText(previous.stock)!==coreText(current.stock)){fields.stock++;changes.push({field:'stock',before:previous.stock,after:current.stock});}
  if(coreText(previous.additionalInfo)!==coreText(current.additionalInfo)){fields.additionalInfo++;changes.push({field:'additionalInfo',before:previous.additionalInfo,after:current.additionalInfo});}
  if(coreText(previous.sourceName)!==coreText(current.sourceName)){fields.name++;changes.push({field:'sourceName',before:previous.sourceName,after:current.sourceName});}
  return {kind:changes.length?'modified':'unchanged',costChange,priceChange,stockChange:textDelta(previous.stock,current.stock),additionalInfoChange:textDelta(previous.additionalInfo,current.additionalInfo),changed:changes.length>0,fields,details:changes};
}
