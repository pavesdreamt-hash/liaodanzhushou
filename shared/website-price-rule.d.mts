export const WEBSITE_PRICE_RULE_ID:string;
export const WEBSITE_PRICE_MARGIN_FILS:number;
export const WEBSITE_COST_MARGIN_FILS:number;
export function toPriceFils(value:unknown):number|null;
export type WebsitePriceCheck={ruleId:string;status:'ok'|'low'|'unknown';websiteFils:number|null;costFils:number|null;suggestedFils:number|null;costMinimumFils:number|null;suggestedMinimumFils:number|null;minimumFils:number|null;shortfallFils:number|null;message:string};
export function websitePriceGuard(product:{websitePriceAed?:unknown;costPriceAed?:unknown;suggestedPriceAed?:unknown;priceComplete?:boolean}):WebsitePriceCheck;
export function websitePriceEvidence(raw:unknown):{complete:boolean;variantCount:number;pricesFils:(number|null)[];minimumFils:number|null;websitePriceAed:number|null};
