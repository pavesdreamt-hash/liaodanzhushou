type NoticeMessage={type?:string;subtype?:string;body?:string;text?:string;metadata?:{messageType?:string;notificationSubtype?:string}};
export const BUSINESS_SECURITY_TEXT:string;
export const ENCRYPTION_TEXT:string;
export function whatsappSystemNotice(message:NoticeMessage):{text:string;kind:'business'|'encryption'|'system';subtype?:string}|null;
export function normalizeChatNotice<T extends NoticeMessage>(message:T):T;
