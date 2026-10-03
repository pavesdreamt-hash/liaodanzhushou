export {};

type ChatProductCatalogPayload={token:string;query?:string;remoteProductId?:string;includeImage?:boolean};
type ChatProductCatalogItem={remoteProductId:string;name:string;productNumber:string|null;sourceSpu:string|null;stockKnown:boolean;stockQuantity:number|null;sourceStock:'有货'|'无货'|null;websitePriceAed:number|null;costPriceAed:number|null;suggestedPriceAed:number|null;floorPriceAed:number|null;image?:{status:'cached'|'unavailable'|'manual_review'|'none';dataUrl?:string;mimetype?:string;filename?:string}};
type ChatProductCatalogResult={products:ChatProductCatalogItem[];lastSuccessfulReadAt:string|null};
type AdsPowerScanFragment={id:string;text:string};
type AdsPowerScanPage={pageId:string;title:string;error?:string;fragments:AdsPowerScanFragment[]};
type AdsPowerScanProfile={profileId:string;label:string;status:'scanned'|'skipped'|'failed';detail:string;pages:AdsPowerScanPage[]};
type AdsPowerScanResult={token:string;scannedAt:string;profiles:AdsPowerScanProfile[];limits:{profiles:number;fragmentsPerProfile:number}};

declare global {
  interface Window {
    adsPowerInbox?: {
      scan: () => Promise<{ok:boolean;data?:AdsPowerScanResult;error?:{message?:string}|string}>;
      translate: (payload:{token:string;messageIds:string[]}) => Promise<{ok:boolean;data?:{translations:{id:string;text:string}[]};error?:{message?:string}|string}>;
      clear: (payload:{token:string}) => Promise<{ok:boolean;data?:{cleared:boolean};error?:{message?:string}|string}>;
    };
    inventoryApp?: {
      orders?: Record<string, (...args: any[]) => Promise<{ok: boolean; data?: any; error?: {message?: string}}>> & {
        chatProductCatalog?: (payload?:ChatProductCatalogPayload) => Promise<{ok:boolean;data?:ChatProductCatalogResult;error?:{message?:string}}>;
      };
      localInventory?: () => Promise<{ok: boolean; data?: unknown; error?: {message?: string}}>;
      status?: () => Promise<{ok: boolean; data?: unknown; error?: {message?: string}}>;
      assistantSettings?: {
        get: () => Promise<{ok: boolean; data?: unknown; error?: {message?: string}}>;
        save: (payload: unknown) => Promise<{ok: boolean; data?: unknown; error?: {message?: string}}>;
        changeKey: (payload: unknown) => Promise<{ok: boolean; data?: unknown; error?: {message?: string}}>;
        test: (payload: unknown) => Promise<{ok: boolean; data?: unknown; error?: {message?: string}}>;
      };
      openKdocs?: () => Promise<unknown>;
      openShopPlusProduct?: (payload: {remoteProductId: string}) => Promise<{ok: boolean; data?: unknown; error?: {message?: string}}>;
      loginKdocs?: () => Promise<{ok: boolean; data?: unknown; error?: {message?: string}}>;
      kdocsLoginStatus?: () => Promise<{ok: boolean; data?: unknown; error?: {message?: string}}>;
      sync?: () => Promise<unknown>;
      syncSourceLocal?: () => Promise<{ok: boolean; data?: unknown; error?: {message?: string}}>;
      dailySourceSync?: () => Promise<{ok: boolean; data?: unknown; error?: {message?: string}}>;
      onProgress?: (callback: (value: {stage?: string; message?: string; currentRow?: number; endRow?: number}) => void) => () => void;
      mappingStatus?: () => Promise<{ok: boolean; data?: unknown; error?: {message?: string}}>;
      submitMapping?: (answers: unknown, confirmFirstSync: boolean) => Promise<{ok: boolean; data?: unknown; error?: {message?: string}}>;
    };
    shopPlusProductPilot?: {
      catalog: () => Promise<{ok: boolean; data?: unknown; error?: {message?: string}}>;
      collect: (payload?: unknown) => Promise<{ok: boolean; data?: unknown; error?: {message?: string}}>;
      syncMappingCatalog: () => Promise<{ok: boolean; data?: unknown; error?: {message?: string}}>;
      refresh: () => Promise<{ok: boolean; data?: unknown; error?: {message?: string}}>;
      collectMedia: (payload?: {remoteProductIds?:string[]}) => Promise<{ok: boolean; data?: unknown; error?: {message?: string}}>;
      importMedia: (payload: {remoteProductId:string}) => Promise<{ok: boolean; data?: unknown; error?: {message?: string}}>;
      collectSourcePricing: () => Promise<{ok: boolean; data?: unknown; error?: {message?: string}}>;
      reconcileSourceData: () => Promise<{ok: boolean; data?: unknown; error?: {message?: string}}>;
      applySourceReconciliation: () => Promise<{ok: boolean; data?: unknown; error?: {message?: string}}>;
      update: (payload: unknown) => Promise<{ok: boolean; data?: unknown; error?: {message?: string}}>;
      updatePublishStatus?: (payload: unknown) => Promise<{ok: boolean; data?: unknown; error?: {message?: string}}>;
      updateVariantInventory?: (payload: unknown) => Promise<{ok: boolean; data?: unknown; error?: {message?: string}}>;
    };
  }
}

declare module '*.html?raw' {
  const value: string;
  export default value;
}
