import OpenAI from "openai";
export declare const isConfigured: boolean;
export declare const openai: OpenAI;
export declare const FALLBACK_MODEL = "gpt-4o-mini";
/**
 * Fallback client using a secondary provider.
 * Evaluated lazily so process.env is read at call-time, not module-load time.
 * Returns null if no fallback key is available.
 */
export declare function getFallbackOpenAI(): OpenAI | null;
/** @deprecated Use getFallbackOpenAI() instead */
export declare const fallbackOpenai: OpenAI | null;
//# sourceMappingURL=client.d.ts.map