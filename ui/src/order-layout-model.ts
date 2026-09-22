export const STORAGE_KEY = 'liaodan.order-detail.layout.v1';
export const PHONE_RATIO = 2.1;
export type LayoutPreferences = {
  navWidth:number; phoneWidth:number; phoneHeight:number; ratio:number; locked:boolean;
  navFont:number; contentFont:number; chatFont:number; composerHeight:number; replyWidth:number;
};
export type DisplayProfile = {id:string; label:string; workArea?:{width:number;height:number}; scaleFactor?:number};
export const clamp = (value:number,min:number,max:number) => Math.min(max,Math.max(min,value));
export function defaults(width:number,height:number):LayoutPreferences {
  const phoneWidth=Math.round(clamp(Math.min(width*.33,(height-260)/PHONE_RATIO),333,480));
  return {navWidth:Math.round(clamp(width*.15,151,260)),phoneWidth,phoneHeight:Math.round(phoneWidth*PHONE_RATIO),
    ratio:PHONE_RATIO,locked:true,navFont:15,contentFont:15,chatFont:13,composerHeight:280,replyWidth:300};
}
export function sanitize(value:unknown,fallback:LayoutPreferences):LayoutPreferences {
  const v=value&&typeof value==='object'?value as Record<string,unknown>:{};
  const number=(key:keyof LayoutPreferences,min:number,max:number)=>typeof v[key]==='number'&&Number.isFinite(v[key])?clamp(v[key] as number,min,max):fallback[key] as number;
  return {navWidth:number('navWidth',120,340),phoneWidth:number('phoneWidth',280,650),phoneHeight:number('phoneHeight',560,1500),
    ratio:number('ratio',1,3),locked:typeof v.locked==='boolean'?v.locked:fallback.locked,
    navFont:number('navFont',13,22),contentFont:number('contentFont',13,22),chatFont:number('chatFont',12,20),composerHeight:number('composerHeight',180,1200),replyWidth:number('replyWidth',280,420)};
}
export function geometry(p:LayoutPreferences,width:number,railWidth=0){
  const compact=width<980;
  const contentMin=width<(railWidth>200?1440:1100)?300:380;
  const nav=compact?64:Math.round(clamp(p.navWidth,144,Math.max(144,Math.min(340,width-720,width-84-contentMin-railWidth-280))));
  // Main padding, column gap and the right-column scroll gutter.
  const available=Math.max(280,width-nav-36-18-30-contentMin-railWidth);
  const phoneWidth=Math.round(clamp(p.phoneWidth,280,Math.min(650,available)));
  const phoneHeight=Math.round(p.locked?phoneWidth*p.ratio:p.phoneHeight);
  return {nav,phoneWidth,phoneHeight,compact,contentMin};
}
export function replyGeometry(requested:number,available:number){
  const min=180,max=Math.max(min,Math.floor(available-100));
  return {min,max,height:Math.round(clamp(requested,min,max))};
}
export function resizePhone(p:LayoutPreferences,width:number,height:number,axis:'width'|'height'|'both'):LayoutPreferences {
  let w=clamp(width,280,650),h=clamp(height,560,1500);
  if(p.locked){
    if(axis==='height')w=clamp(height/p.ratio,280,650);
    h=w*p.ratio;
  }
  return {...p,phoneWidth:Math.round(w),phoneHeight:Math.round(h)};
}
