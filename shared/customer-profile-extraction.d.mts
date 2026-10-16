export type CustomerProfileClaim={value:string;evidence:{id:string;sentAt:string}[]};
export function extractCustomerProfile(messages:{id:string;direction:string;text:string;sentAt:string;metadata?:{messageType?:string}}[]):{fields:Record<string,CustomerProfileClaim>;issues:{field:string;reason:string}[]};
