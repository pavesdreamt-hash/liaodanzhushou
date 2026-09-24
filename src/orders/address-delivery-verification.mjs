import {createHash} from 'node:crypto';
import path from 'node:path';
import {readJSON} from '../core/files.mjs';

const ADDRESS_FIELDS=Object.freeze(['residence','street','city','province','country']);
const RELIABLE_LOCATION_TYPES=new Set(['ROOFTOP','RANGE_INTERPOLATED']);
const normalized=value=>String(value??'').trim().replace(/\s+/gu,' ').toLocaleLowerCase('en-US');
const finiteLatitude=value=>typeof value==='number'&&Number.isFinite(value)&&value>=-90&&value<=90;
const finiteLongitude=value=>typeof value==='number'&&Number.isFinite(value)&&value>=-180&&value<=180;

export function buildGeocodingAddress(recipient={}){
  return ADDRESS_FIELDS.map(field=>String(recipient[field]??'').trim()).filter(Boolean).join(', ');
}

export function addressFingerprint(recipient={}){
  return createHash('sha256').update(JSON.stringify(ADDRESS_FIELDS.map(field=>normalized(recipient[field])))).digest('hex');
}

function cityNames(result){
  const names=[];for(const component of result?.address_components||[]){if(component.types?.some(type=>['locality','administrative_area_level_1','administrative_area_level_2'].includes(type))){names.push(component.long_name,component.short_name);}}
  return new Set(names.filter(Boolean).map(normalized));
}

export function pointInPolygon(latitude,longitude,points=[]){
  let inside=false;for(let index=0,last=points.length-1;index<points.length;last=index++){
    const [latA,lngA]=points[index]||[],[latB,lngB]=points[last]||[];if(!finiteLatitude(latA)||!finiteLongitude(lngA)||!finiteLatitude(latB)||!finiteLongitude(lngB))return false;
    const intersects=(lngA>longitude)!==(lngB>longitude)&&latitude<(latB-latA)*(longitude-lngA)/(lngB-lngA)+latA;if(intersects)inside=!inside;
  }return inside;
}

export function normalizeDeliveryRange(value={}){
  const cities=Array.isArray(value.cities)?value.cities.map(normalized).filter(Boolean):[],blockedCities=Array.isArray(value.blockedCities)?value.blockedCities.map(normalized).filter(Boolean):[],polygons=Array.isArray(value.polygons)?value.polygons.filter(entry=>entry&&typeof entry.name==='string'&&Array.isArray(entry.points)&&entry.points.length>=3).map(entry=>({name:entry.name.trim(),points:entry.points.map(point=>[Number(point?.[0]),Number(point?.[1])])})).filter(entry=>entry.name&&entry.points.every(([lat,lng])=>finiteLatitude(lat)&&finiteLongitude(lng))):[];
  return {cities:[...new Set(cities)].filter(city=>!blockedCities.includes(city)),blockedCities:[...new Set(blockedCities)],polygons};
}

export async function loadAddressVerificationConfiguration(userDataPath,{environment=process.env}={}){
  const rangeFile=path.join(userDataPath,'orders','delivery-zones.json'),range=normalizeDeliveryRange(await readJSON(rangeFile,{}));
  return {apiKey:String(environment.KDOCS_GOOGLE_GEOCODING_API_KEY||'').trim(),range,rangeFile};
}

export class AddressDeliveryVerifier{
  constructor({apiKey='',range={},fetchImpl=globalThis.fetch,clock=()=>new Date(),timeoutMs=10000}={}){this.apiKey=String(apiKey).trim();this.range=normalizeDeliveryRange(range);this.fetchImpl=fetchImpl;this.clock=clock;this.timeoutMs=timeoutMs;}
  get configured(){return Boolean(this.apiKey&&(this.range.polygons.length||this.range.cities.length||this.range.blockedCities.length));}
  configurationStatus(){if(!this.apiKey)return {status:'not_configured',reason:'尚未配置Google Geocoding API'};if(!this.range.polygons.length&&!this.range.cities.length&&!this.range.blockedCities.length)return {status:'not_configured',reason:'尚未配置物流派送范围'};return {status:'ready',reason:null};}
  async verify(recipient={}){
    const configuration=this.configurationStatus(),fingerprint=addressFingerprint(recipient);if(configuration.status!=='ready')return {...configuration,addressFingerprint:fingerprint};
    const address=buildGeocodingAddress(recipient);if(!address)return {status:'unusable',reason:'地址信息为空',addressFingerprint:fingerprint,checkedAt:this.clock().toISOString()};
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),this.timeoutMs);let response,payload;
    try{const parameters=new URLSearchParams({address,key:this.apiKey});response=await this.fetchImpl(`https://maps.googleapis.com/maps/api/geocode/json?${parameters}`,{signal:controller.signal});payload=await response.json();}
    catch(error){return {status:'failed',reason:error?.name==='AbortError'?'地址校验超时，请重试':'地址校验失败，请重试',addressFingerprint:fingerprint,checkedAt:this.clock().toISOString()};}
    finally{clearTimeout(timer);}
    const checkedAt=this.clock().toISOString();if(!response.ok||!['OK','ZERO_RESULTS'].includes(payload?.status))return {status:'failed',reason:'地址校验失败，请重试',addressFingerprint:fingerprint,checkedAt};
    if(payload.status==='ZERO_RESULTS'||!Array.isArray(payload.results)||payload.results.length!==1)return {status:'unusable',reason:'Google未能唯一定位该地址',addressFingerprint:fingerprint,checkedAt};
    const result=payload.results[0],location=result?.geometry?.location,locationType=result?.geometry?.location_type,latitude=Number(location?.lat),longitude=Number(location?.lng);
    if(result.partial_match||!RELIABLE_LOCATION_TYPES.has(locationType)||!finiteLatitude(latitude)||!finiteLongitude(longitude))return {status:'unusable',reason:'Google定位结果不够明确',addressFingerprint:fingerprint,checkedAt};
    let inRange=false,matchBasis='';if(this.range.polygons.length){const polygon=this.range.polygons.find(entry=>pointInPolygon(latitude,longitude,entry.points));inRange=Boolean(polygon);matchBasis=polygon?`polygon:${polygon.name}`:'polygon:none';}
    else{const names=cityNames(result),blocked=this.range.blockedCities.find(value=>names.has(value)),city=this.range.cities.find(value=>names.has(value));inRange=Boolean(city)&&!blocked;matchBasis=blocked?`blocked-city:${blocked}`:city?`city:${city}`:'city:none';}
    return {status:inRange?'deliverable':'out_of_range',reason:inRange?'地址在已配置派送范围内':'地址不在已配置派送范围内',normalizedAddress:String(result.formatted_address||'').trim()||null,latitudeE7:Math.round(latitude*1e7),longitudeE7:Math.round(longitude*1e7),matchBasis,addressFingerprint:fingerprint,checkedAt};
  }
}
