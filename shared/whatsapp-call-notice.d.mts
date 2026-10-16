type CallMessage={type?:string;body?:string;text?:string;callLog?:{outcome?:string;isVideo?:boolean};metadata?:{messageType?:string;callLog?:{outcome?:string;isVideo?:boolean}}};
export function whatsappCallNotice(message:CallMessage):{text:string;callLog:{outcome?:string;isVideo?:boolean}}|null;
export function normalizeCallNotice<T extends CallMessage>(message:T):T;
