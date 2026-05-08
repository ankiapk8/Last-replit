import crypto from "node:crypto";

interface CacheEntry {
  result: string;
  expires: number;
}

/**
 * LRU cache for AI responses with memory bounds and periodic cleanup.
 * Keyed by content hash + model + prompt fingerprint.
 * TTL defaults to 5 minutes, max 50 entries, max 10MB total response size.
 */
export class ResponseCache {
  private cache = new Map<string, CacheEntry>();
  private maxSize: number;
  private ttlMs: number;
  private maxTotalSizeBytes: number;
  private currentSizeBytes = 0;
  private hits = 0;
  private misses = 0;

  constructor(
    maxSize = 50,
    ttlMs = 300_000,
    maxTotalSizeBytes = 10 * 1024 * 1024,
  ) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
    this.maxTotalSizeBytes = maxTotalSizeBytes;

    // Periodic cleanup every 60s to prevent memory leak
    const cleanupTimer = setInterval(() => this.cleanup(), 60_000);
    cleanupTimer.unref?.();
  }

  static hash(content: string): string {
    return crypto.createHash("sha256").update(content).digest("hex").slice(0, 16);
  }

  /** Remove all expired entries. Called periodically and on set(). */
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now > entry.expires) {
        this.currentSizeBytes -= Buffer.byteLength(entry.result, "utf8");
        this.cache.delete(key);
      }
    }
  }

  get(key: string): string | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      this.misses++;
      return undefined;
    }
    if (Date.now() > entry.expires) {
      this.currentSizeBytes -= Buffer.byteLength(entry.result, "utf8");
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
    const resultSize = Buffer.byteLength(result, "utf8");

    // Evict expired entries first
    this.cleanup();

    // Evict LRU entries if we're over count or size limit
    while (
      this.cache.size > 0 &&
      (this.cache.size >= this.maxSize ||
        this.currentSizeBytes + resultSize > this.maxTotalSizeBytes)
    ) {
      const firstKey = this.cache.keys().next().value;
      if (!firstKey) break;
      const evicted = this.cache.get(firstKey)!;
      this.currentSizeBytes -= Buffer.byteLength(evicted.result, "utf8");
      this.cache.delete(firstKey);
    }

    this.cache.set(key, { result, expires: Date.now() + this.ttlMs });
    this.currentSizeBytes += resultSize;
  }

  clear(): void {
    this.cache.clear();
    this.currentSizeBytes = 0;
  }

  getStats(): { hits: number; misses: number; size: number; sizeBytes: number } {
    return {
      hits: this.hits,
      misses: this.misses,
      size: this.cache.size,
      sizeBytes: this.currentSizeBytes,
    };
  }
}

// Shared singleton for all generation endpoints
export const generationCache = new ResponseCache();
