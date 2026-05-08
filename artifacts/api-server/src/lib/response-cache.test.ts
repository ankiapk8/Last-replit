import { describe, it, expect, beforeEach, vi } from "vitest";
import { ResponseCache } from "./response-cache";

describe("ResponseCache", () => {
  let cache: ResponseCache;

  beforeEach(() => {
    // Small cache with short TTL for testing
    cache = new ResponseCache(3, 1000, 1024 * 1024);
  });

  describe("hash", () => {
    it("returns a consistent SHA-256 based hash", () => {
      const hash1 = ResponseCache.hash("hello world");
      const hash2 = ResponseCache.hash("hello world");
      expect(hash1).toBe(hash2);
    });

    it("returns different hashes for different inputs", () => {
      const hash1 = ResponseCache.hash("hello");
      const hash2 = ResponseCache.hash("world");
      expect(hash1).not.toBe(hash2);
    });

    it("returns a 16-character hex string", () => {
      const hash = ResponseCache.hash("test");
      expect(hash).toMatch(/^[a-f0-9]{16}$/);
    });
  });

  describe("set / get", () => {
    it("stores and retrieves a value", () => {
      cache.set("key1", "result1");
      expect(cache.get("key1")).toBe("result1");
    });

    it("returns undefined for missing key", () => {
      expect(cache.get("nonexistent")).toBeUndefined();
    });

    it("tracks hits and misses", () => {
      cache.set("key1", "result1");
      cache.get("key1"); // hit
      cache.get("key1"); // hit
      cache.get("missing"); // miss
      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
    });

    it("overwrites existing key", () => {
      cache.set("key1", "old");
      cache.set("key1", "new");
      expect(cache.get("key1")).toBe("new");
    });
  });

  describe("LRU eviction", () => {
    it("evicts oldest entry when max size exceeded", () => {
      cache.set("a", "1");
      cache.set("b", "2");
      cache.set("c", "3");
      // Cache is full (maxSize=3). Adding 'd' should evict 'a'.
      cache.set("d", "4");
      expect(cache.get("a")).toBeUndefined();
      expect(cache.get("d")).toBe("4");
    });

    it("keeps recently accessed entries", () => {
      cache.set("a", "1");
      cache.set("b", "2");
      cache.set("c", "3");
      // Access 'a' to make it recently used
      cache.get("a");
      // Now 'b' is the oldest. Adding 'd' should evict 'b'.
      cache.set("d", "4");
      expect(cache.get("b")).toBeUndefined();
      expect(cache.get("a")).toBe("1");
    });
  });

  describe("TTL expiration", () => {
    it("returns undefined for expired entries", () => {
      const shortCache = new ResponseCache(10, 50, 1024 * 1024); // 50ms TTL
      shortCache.set("key1", "result1");
      // Wait for expiry
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(shortCache.get("key1")).toBeUndefined();
          resolve();
        }, 60);
      });
    });

    it("does not return expired entries even if not evicted", () => {
      const shortCache = new ResponseCache(10, 30, 1024 * 1024);
      shortCache.set("key1", "result1");
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(shortCache.get("key1")).toBeUndefined();
          const stats = shortCache.getStats();
          expect(stats.misses).toBe(1);
          resolve();
        }, 40);
      });
    });
  });

  describe("cleanup", () => {
    it("removes all expired entries", () => {
      const shortCache = new ResponseCache(10, 50, 1024 * 1024);
      shortCache.set("a", "1");
      shortCache.set("b", "2");
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          shortCache.cleanup();
          const stats = shortCache.getStats();
          expect(stats.size).toBe(0);
          resolve();
        }, 60);
      });
    });

    it("keeps non-expired entries during cleanup", () => {
      const shortCache = new ResponseCache(10, 200, 1024 * 1024);
      shortCache.set("a", "1");
      shortCache.cleanup();
      expect(shortCache.get("a")).toBe("1");
    });
  });

  describe("clear", () => {
    it("removes all entries", () => {
      cache.set("a", "1");
      cache.set("b", "2");
      cache.clear();
      expect(cache.get("a")).toBeUndefined();
      expect(cache.get("b")).toBeUndefined();
      const stats = cache.getStats();
      expect(stats.size).toBe(0);
      expect(stats.sizeBytes).toBe(0);
    });
  });

  describe("getStats", () => {
    it("returns correct stats", () => {
      cache.set("a", "hello");
      cache.set("b", "world");
      cache.get("a"); // hit
      cache.get("c"); // miss
      const stats = cache.getStats();
      expect(stats.size).toBe(2);
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.sizeBytes).toBe(10); // "hello" + "world" = 5 + 5 bytes
    });
  });

  describe("size-based eviction", () => {
    it("evicts when total size exceeds maxTotalSizeBytes", () => {
      // Cache with max 20 bytes total
      const tinyCache = new ResponseCache(100, 10000, 20);
      tinyCache.set("a", "1234567890"); // 10 bytes
      tinyCache.set("b", "1234567890"); // 10 bytes — total 20
      // Adding 1 more byte should evict 'a'
      tinyCache.set("c", "1234567890"); // 10 bytes — need to evict
      expect(tinyCache.get("a")).toBeUndefined();
      expect(tinyCache.get("c")).toBe("1234567890");
    });
  });
});
