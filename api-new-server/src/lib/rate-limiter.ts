/**
 * Rate limiter — in-memory with optional DB backing for multi-instance support.
 * Uses a sliding window approach.
 */

interface RateLimitEntry {
  timestamps: number[];
}

const windows = new Map<string, RateLimitEntry>();
const MAX_IPS = 10_000;

// Periodic cleanup of expired entries
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of windows) {
    const fresh = entry.timestamps.filter((t) => now - t < 60_000);
    if (fresh.length === 0) {
      windows.delete(key);
    } else {
      entry.timestamps = fresh;
    }
  }
}, 60_000);
cleanupTimer.unref?.();

export function createRateLimiter(maxRequests: number, windowMs: number) {
  return (key: string): boolean => {
    const now = Date.now();
    const entry = windows.get(key);
    const timestamps = (entry?.timestamps ?? []).filter((t) => now - t < windowMs);

    if (timestamps.length >= maxRequests) {
      if (entry) entry.timestamps = timestamps;
      return false;
    }

    timestamps.push(now);

    // Evict oldest IP if we're at capacity and this is a new key
    if (windows.size >= MAX_IPS && !windows.has(key)) {
      const first = windows.keys().next().value;
      if (first) windows.delete(first);
    }

    windows.set(key, { timestamps });
    return true;
  };
}
