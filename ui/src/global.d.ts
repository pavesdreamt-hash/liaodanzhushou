export {};

declare global {
  interface Window {
    inventoryApp?: {
      orders?: Record<string, (...args: any[]) => Promise<{ok: boolean; data?: any; error?: {message?: string}}>>;
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
      onProgress?: (callback: (value: {stage?: string; message?: string; currentRow?: number; endRow?: number}) => void) => () => void;
      mappingStatus?: () => Promise<{ok: boolean; data?: unknown; error?: {message?: string}}>;
      submitMapping?: (answers: unknown, confirmFirstSync: boolean) => Promise<{ok: boolean; data?: unknown; error?: {message?: string}}>;
    };
    shopPlusProductPilot?: {
      catalog: () => Promise<{ok: boolean; data?: unknown; error?: {message?: string}}>;
      collect: (payload?: unknown) => Promise<{ok: boolean; data?: unknown; error?: {message?: string}}>;
      syncMappingCatalog: () => Promise<{ok: boolean; data?: unknown; error?: {message?: string}}>;
      refresh: () => Promise<{ok: boolean; data?: unknown; error?: {message?: string}}>;
      collectMedia: () => Promise<{ok: boolean; data?: unknown; error?: {message?: string}}>;
      collectSourcePricing: () => Promise<{ok: boolean; data?: unknown; error?: {message?: string}}>;
      reconcileSourceData: () => Promise<{ok: boolean; data?: unknown; error?: {message?: string}}>;
      applySourceReconciliation: () => Promise<{ok: boolean; data?: unknown; error?: {message?: string}}>;
      update: (payload: unknown) => Promise<{ok: boolean; data?: unknown; error?: {message?: string}}>;
      listingReview?: () => Promise<{ok: boolean; data?: unknown; error?: {message?: string}}>;
      setListingLock?: (payload: unknown) => Promise<{ok: boolean; data?: unknown; error?: {message?: string}}>;
      updatePublishStatus?: (payload: unknown) => Promise<{ok: boolean; data?: unknown; error?: {message?: string}}>;
      applyListingReview?: (payload: unknown) => Promise<{ok: boolean; data?: unknown; error?: {message?: string}}>;
      updateVariantInventory?: (payload: unknown) => Promise<{ok: boolean; data?: unknown; error?: {message?: string}}>;
    };
  }
}

declare module '*.html?raw' {
  const value: string;
  export default value;
}
