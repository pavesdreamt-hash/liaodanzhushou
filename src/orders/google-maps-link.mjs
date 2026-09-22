const clean=value=>String(value??'').trim();

export function googleMapsSearchUrl(address={}){
  const query=[address.street,address.residence,address.doorNumber,address.city,address.province,address.postalCode,address.country].map(clean).filter(Boolean).join(', ');
  if(!query)throw new TypeError('没有可用于地图核对的地址');
  const url=new URL('https://www.google.com/maps/search/');url.searchParams.set('api','1');url.searchParams.set('query',query);
  if(url.href.length>2048)throw new RangeError('地址过长，无法安全打开Google Maps');
  return url.href;
}
