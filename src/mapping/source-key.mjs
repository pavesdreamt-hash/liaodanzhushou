import {coreText} from '../../shared/text.mjs';
const normalize=value=>coreText(value).normalize('NFKC').replace(/[（）]/g,c=>c==='（'?'(':')').replace(/[，]/g,',').replace(/\s+/g,' ').trim();
export function sourceModel(value){
  const name=normalize(value),tokens=[];
  for(const match of name.matchAll(/\(([^()]*)\)/g))for(const token of match[1].match(/[A-Za-z]{1,8}\d[A-Za-z0-9-]*/g)||[])tokens.push(token.toUpperCase());
  const leading=/^(?:\d{1,3}[\s,、.-]*)?([A-Za-z]{1,8}\d[A-Za-z0-9-]*)\b/.exec(name)?.[1];if(leading)tokens.push(leading.toUpperCase());
  return tokens.find(token=>!/^(?:ML|CM)\d/i.test(token))||'';
}
export function normalizedSourceName(value){
  const name=normalize(value).replace(/^\d{3}\s*/, '').replace(/^\d{1,2}(?=[\s,、])\s*[,、]?\s*/,'');
  return name.toLocaleLowerCase('zh-CN');
}
export function baseSourceKey(value){const model=sourceModel(value);return model?`MODEL:${model}`:`NAME:${normalizedSourceName(value)}`;}
export function assignSourceKeys(records){
  const baseFor=record=>{const model=sourceModel(record.sourceName);if(model)return `MODEL:${model}`;const name=normalizedSourceName(record.sourceName);
    return coreText(record.imageFingerprint)?`NAME:${name}|IMG:${coreText(record.imageFingerprint)}`:`NAME:${name}`;};
  const groups=new Map();for(const record of records){const base=baseFor(record);if(!groups.has(base))groups.set(base,[]);groups.get(base).push(record);}
  return records.map(record=>{const base=baseFor(record),group=groups.get(base),index=group.indexOf(record);return {...record,sourceKey:group.length===1?base:`${base}|OCC:${index+1}`,sourceKeyBase:base,duplicateIndex:index+1,duplicateCount:group.length};});
}
export function visibleBusinessPrefix(value){
  const name=normalize(value);const three=/^(\d{3})(?=\D|$)/.exec(name);if(three)return Number(three[1]);
  const short=/^(\d{1,2})(?=[\s,，、])/.exec(name);return short?Number(short[1]):null;
}
