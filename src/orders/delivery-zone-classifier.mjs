const URBAN=new Map([
  ['dubai','Dubai'],['emirate of dubai','Dubai'],['dubai emirate','Dubai'],
  ['sharjah','Sharjah'],['emirate of sharjah','Sharjah'],['sharjah emirate','Sharjah']
]);
const REMOTE=new Map([
  ['ajman','Ajman'],['emirate of ajman','Ajman'],['ajman emirate','Ajman'],
  ['abu dhabi','Abu Dhabi'],['abudhabi','Abu Dhabi'],['emirate of abu dhabi','Abu Dhabi'],['abu dhabi emirate','Abu Dhabi'],
  ['ras al khaimah','Ras Al Khaimah'],['ras al khaimah emirate','Ras Al Khaimah'],['rak','Ras Al Khaimah'],
  ['umm al quwain','Umm Al Quwain'],['umm al qaiwain','Umm Al Quwain'],['uaq','Umm Al Quwain'],
  ['al ain','Al Ain'],['alain','Al Ain'],
  ['fujairah','Fujairah'],['al fujairah','Fujairah'],['fujairah emirate','Fujairah']
]);

export function normalizePlace(value){return String(value??'').trim().toLowerCase().replace(/[‐‑‒–—_-]+/g,' ').replace(/[.,]+/g,' ').replace(/\s+/g,' ');}

function classifyOne(value){
  const normalized=normalizePlace(value);
  if(URBAN.has(normalized))return {zone:'urban',matchedPlace:URBAN.get(normalized)};
  if(REMOTE.has(normalized))return {zone:'remote',matchedPlace:REMOTE.get(normalized)};
  return {zone:'unclassified',matchedPlace:null};
}

export function classifyDeliveryZone({city,province,state,override}={}){
  if(override!==undefined&&override!==null&&override!==''){
    const normalized=normalizePlace(override);if(!['urban','remote'].includes(normalized))throw new TypeError('人工配送区域只能是urban或remote');
    return {zone:normalized,source:'manual',matchedPlace:null};
  }
  const cityResult=classifyOne(city);if(cityResult.zone!=='unclassified')return {...cityResult,source:'city'};
  const provinceResult=classifyOne(province||state);if(provinceResult.zone!=='unclassified')return {...provinceResult,source:'province'};
  return {zone:'unclassified',source:'unclassified',matchedPlace:null};
}
