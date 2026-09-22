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
      sync?: () => Promise<unknown>;
    };
  }
}

declare module '*.html?raw' {
  const value: string;
  export default value;
}
