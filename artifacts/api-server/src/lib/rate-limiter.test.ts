import { describe, it, expect, beforeEach } from "vitest";
import { createRateLimiter } from "./rate-limiter";

describe("createRateLimiter", () => {
  describe("basic rate limiting", () => {
    it("allows requests within the limit", () => {
      const limiter = createRateLimiter(3, 60_000);
      expect(limiter("192.168.1.1")).toBe(true);
      expect(limiter("192.168.1.1")).toBe(true);
      expect(limiter("192.168.1.1")).toBe(true);
    });

    it("blocks requests exceeding the limit", () => {
      const limiter = createRateLimiter(2, 60_000);
      expect(limiter("192.168.1.1")).toBe(true);
      expect(limiter("192.168.1.1")).toBe(true);
      expect(limiter("192.168.1.1")).toBe(false);
    });

    it("tracks different IPs independently", () => {
      const limiter = createRateLimiter(2, 60_000);
      expect(limiter("192.168.1.1")).toBe(true);
      expect(limiter("192.168.1.1")).toBe(true);
      expect(limiter("192.168.1.1")).toBe(false);
      // Different IP should still be allowed
      expect(limiter("192.168.1.2")).toBe(true);
    });
  });

  describe("window expiration", () => {
    it("resets count after window expires", () => {
      const limiter = createRateLimiter(2, 100); // 100ms window
      expect(limiter("192.168.1.1")).toBe(true);
      expect(limiter("192.168.1.1")).toBe(true);
      expect(limiter("192.168.1.1")).toBe(false);

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          // After window expires, should allow again
          expect(limiter("192.168.1.1")).toBe(true);
          resolve();
        }, 110);
      });
    });
  });

  describe("edge cases", () => {
    it("handles maxRequests of 1", () => {
      const limiter = createRateLimiter(1, 60_000);
      expect(limiter("10.0.0.1")).toBe(true);
      expect(limiter("10.0.0.1")).toBe(false);
    });

    it("handles many different IPs", () => {
      const limiter = createRateLimiter(5, 60_000);
      for (let i = 0; i < 100; i++) {
        expect(limiter(`10.0.0.${i}`)).toBe(true);
      }
    });

    it("returns a function", () => {
      const limiter = createRateLimiter(10, 60_000);
      expect(typeof limiter).toBe("function");
    });
  });
});
