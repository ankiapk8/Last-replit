export function createRateLimiter(maxRequests: number, windowMs: number) {
  const map = new Map<string, number[]>();
  return (ip: string): boolean => {
    const now = Date.now();
    const times = (map.get(ip) ?? []).filter(t => now - t < windowMs);
    if (times.length >= maxRequests) return false;
    times.push(now);
    map.set(ip, times);
    return true;
  };
}
