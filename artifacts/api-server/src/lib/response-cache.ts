import crypto from "node:crypto";

interface CacheEntry {
  result: string;
  expires: number;
}

/**
 * Simple LRU cache for AI responses.
 * Keyed by content hash + model + prompt fingerprint.
 * TTL defaults to 10 minutes, max 100 entries.
 */
export class ResponseCache {
  private cache = new Map<string, CacheEntry>();
  private maxSize: number;
  private ttlMs: number;
  private hits = 0;
  private misses = 0;

  constructor(maxSize = 100, ttlMs = 600_000) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  static hash(content: string): string {
    return crypto.createHash("sha256").update(content).digest("hex").slice(0, 16);
  }

  get(key: string): string | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      this.misses++;
      return undefined;
    }
    if (Date.now() > entry.expires) {
      this.cache.delete(key);
      this.misses++;
      return undefined;
    }
    // Move to end (LRU)
    this.cache.delete(key);
    this.cache.set(key, entry);
    this.hits++;
    return entry.result;
  }

  set(key: string, result: string): void {
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(key, { result, expires: Date.now() + this.ttlMs });
  }

  getStats(): { hits: number; misses: number; size: number } {
    return { hits: this.hits, misses: this.misses, size: this.cache.size };
  }
}

// Shared singleton for all generation endpoints
export const generationCache = new ResponseCache();
