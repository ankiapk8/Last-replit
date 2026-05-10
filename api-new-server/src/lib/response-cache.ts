/**
 * LRU response cache for AI responses.
 * In-memory with bounded size. Can be extended to DB-backed later.
 */

import crypto from "node:crypto";

interface CacheEntry {
  result: string;
  expires: number;
}

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
    maxTotalSizeBytes = 10 * 1024 * 1024
  ) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
    this.maxTotalSizeBytes = maxTotalSizeBytes;

    const cleanupTimer = setInterval(() => this.cleanup(), 60_000);
    cleanupTimer.unref?.();
  }

  static hash(content: string): string {
    return crypto.createHash("sha256").update(content).digest("hex").slice(0, 16);
  }

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
    this.cleanup();

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

  getStats() {
    return {
      hits: this.hits,
      misses: this.misses,
      size: this.cache.size,
      sizeBytes: this.currentSizeBytes,
    };
  }
}

// Shared singleton
export const generationCache = new ResponseCache();
