import {normalizeCallNotice} from './whatsapp-call-notice.mjs';

export const BUSINESS_SECURITY_TEXT='此商家正使用 Meta 提供的安全服务来管理此聊天。';
export const ENCRYPTION_TEXT='消息和通话现已进行端到端加密。只有此聊天中的成员可以查看、收听或分享。';
const safeSubtype=value=>typeof value==='string'&&/^[a-z0-9_]{1,120}$/i.test(value)?value:undefined;
const generated=new Set(['WhatsApp 商业账号类型已变更。','WhatsApp 加密通知。','WhatsApp 系统通知。','WhatsApp 安全通知。',BUSINESS_SECURITY_TEXT,ENCRYPTION_TEXT]);
export const generatedNoticeText=value=>!String(value||'').trim()||generated.has(String(value).trim())||/^\[(?:未知类型消息|非文字消息[^\]]*)\]$/.test(String(value).trim());

// Notification direction is a native identity field, not a human sender. Do
// not infer a specific security event from an unrecognized native subtype.
export function whatsappSystemNotice(message){
 const type=String(message?.metadata?.messageType??message?.type??'').toLowerCase();
 if(!['notification_template','e2e_notification'].includes(type))return null;
 const subtype=safeSubtype(message?.metadata?.notificationSubtype??message?.subtype??message?._data?.subtype);
 const body=String(message?.text??message?.body??''),copy=body.trim();
 const legacyHosted=!subtype&&type==='notification_template'&&['WhatsApp 商业账号类型已变更。',BUSINESS_SECURITY_TEXT].includes(copy);
 const hosted=type==='notification_template'&&(subtype==='biz_account_type_changed_to_hosted'||legacyHosted);
 const encrypted=type==='e2e_notification'&&['encrypt','encrypt_now'].includes(subtype);
 const actualBody=copy&&!generated.has(copy)&&!/^\[(?:未知类型消息|非文字消息[^\]]*)\]$/.test(copy);
 const text=actualBody?body:hosted?BUSINESS_SECURITY_TEXT:encrypted?ENCRYPTION_TEXT:type==='e2e_notification'?'WhatsApp 安全通知。':'WhatsApp 系统通知。';
 return {text,kind:hosted?'business':type==='e2e_notification'?'encryption':'system',...(subtype?{subtype}:{})};
}

export function normalizeChatNotice(message){
 const call=normalizeCallNotice(message),notice=whatsappSystemNotice(call);
 if(!notice)return call;
 const {notificationSubtype,...metadata}=call.metadata||{};
 return {...call,text:notice.text,metadata:{...metadata,...(notice.subtype?{notificationSubtype:notice.subtype}:{}),media:[],incomplete:false,note:null}};
}
