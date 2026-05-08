export function createRateLimiter(maxRequests: number, windowMs: number) {
  const map = new Map<string, number[]>();
  const MAX_IPS = 10_000;

  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [ip, times] of map) {
      const fresh = times.filter((t) => now - t < windowMs);
      if (fresh.length === 0) {
        map.delete(ip);
      } else {
        map.set(ip, fresh);
      }
    }
  }, 60_000);
  cleanupTimer.unref?.();

  return (ip: string): boolean => {
    const now = Date.now();
    const times = (map.get(ip) ?? []).filter((t) => now - t < windowMs);
    if (times.length >= maxRequests) return false;
    times.push(now);
    if (map.size >= MAX_IPS && !map.has(ip)) {
      const first = map.keys().next().value;
      if (first) map.delete(first);
    }
    map.set(ip, times);
    return true;
  };
}
