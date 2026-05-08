import { describe, it, expect, beforeEach } from "vitest";
import {
  logError,
  startGeneration,
  completeGeneration,
  failGeneration,
  logRequest,
  logAiCall,
  getMonitorSnapshot,
} from "./monitor";

describe("monitor", () => {
  describe("logError", () => {
    it("adds an error to the log", () => {
      const before = getMonitorSnapshot();
      logError("test error", "stack trace", "/api/test");
      const after = getMonitorSnapshot();
      expect(after.errors.total).toBeGreaterThanOrEqual(1);
      expect(after.errors.recent[0].message).toBe("test error");
      expect(after.errors.recent[0].endpoint).toBe("/api/test");
    });
  });

  describe("generation tracking", () => {
    it("starts a generation as running", () => {
      startGeneration("gen-1", "deck");
      const snap = getMonitorSnapshot();
      expect(snap.generations.active).toBeGreaterThanOrEqual(1);
      const gen = snap.generations.recent.find((g) => g.id === "gen-1");
      expect(gen).toBeDefined();
      expect(gen!.status).toBe("running");
      expect(gen!.type).toBe("deck");
    });

    it("completes a generation", () => {
      startGeneration("gen-2", "qbank");
      completeGeneration("gen-2", 42);
      const snap = getMonitorSnapshot();
      const gen = snap.generations.recent.find((g) => g.id === "gen-2");
      expect(gen).toBeDefined();
      expect(gen!.status).toBe("completed");
      expect(gen!.deckId).toBe(42);
      expect(gen!.completedAt).toBeDefined();
    });

    it("fails a generation", () => {
      startGeneration("gen-3", "deck");
      failGeneration("gen-3", "AI timeout");
      const snap = getMonitorSnapshot();
      const gen = snap.generations.recent.find((g) => g.id === "gen-3");
      expect(gen).toBeDefined();
      expect(gen!.status).toBe("failed");
      expect(gen!.errorMessage).toBe("AI timeout");
    });

    it("handles completing a non-existent generation gracefully", () => {
      expect(() => completeGeneration("nonexistent", 1)).not.toThrow();
    });

    it("handles failing a non-existent generation gracefully", () => {
      expect(() => failGeneration("nonexistent")).not.toThrow();
    });
  });

  describe("logRequest", () => {
    it("tracks request metrics", () => {
      logRequest("/api/generate", "POST", 200, 150);
      const snap = getMonitorSnapshot();
      expect(snap.requests.total).toBeGreaterThanOrEqual(1);
      expect(snap.requests.recent[0].endpoint).toBe("/api/generate");
      expect(snap.requests.recent[0].method).toBe("POST");
      expect(snap.requests.recent[0].statusCode).toBe(200);
      expect(snap.requests.recent[0].durationMs).toBe(150);
    });

    it("calculates average duration", () => {
      logRequest("/api/test1", "GET", 200, 100);
      logRequest("/api/test2", "GET", 200, 200);
      const snap = getMonitorSnapshot();
      expect(snap.requests.avgDurationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("logAiCall", () => {
    it("tracks successful AI calls", () => {
      logAiCall("qwen3-coder:480b", "/api/generate", 500, true);
      const snap = getMonitorSnapshot();
      expect(snap.aiCalls.total).toBeGreaterThanOrEqual(1);
      expect(snap.aiCalls.recent[0].model).toBe("qwen3-coder:480b");
      expect(snap.aiCalls.recent[0].success).toBe(true);
    });

    it("tracks failed AI calls", () => {
      logAiCall("qwen3-coder:480b", "/api/generate", 100, false, "timeout");
      const snap = getMonitorSnapshot();
      expect(snap.aiCalls.failures).toBeGreaterThanOrEqual(1);
      const recent = snap.aiCalls.recent[0];
      expect(recent.success).toBe(false);
      expect(recent.error).toBe("timeout");
    });
  });

  describe("getMonitorSnapshot", () => {
    it("returns a valid snapshot structure", () => {
      const snap = getMonitorSnapshot();
      expect(snap).toHaveProperty("status");
      expect(snap).toHaveProperty("uptimeSeconds");
      expect(snap).toHaveProperty("memory");
      expect(snap).toHaveProperty("errors");
      expect(snap).toHaveProperty("generations");
      expect(snap).toHaveProperty("requests");
      expect(snap).toHaveProperty("aiCalls");
      expect(snap).toHaveProperty("cache");
      expect(snap).toHaveProperty("rateLimiter");
      expect(snap).toHaveProperty("timestamp");
    });

    it("reports healthy status by default", () => {
      const snap = getMonitorSnapshot();
      expect(["healthy", "degraded", "error"]).toContain(snap.status);
    });

    it("includes memory metrics", () => {
      const snap = getMonitorSnapshot();
      expect(snap.memory).toHaveProperty("rssMb");
      expect(snap.memory).toHaveProperty("heapUsedMb");
      expect(snap.memory).toHaveProperty("heapTotalMb");
      expect(snap.memory).toHaveProperty("externalMb");
      expect(typeof snap.memory.rssMb).toBe("number");
    });

    it("includes cache stats", () => {
      const snap = getMonitorSnapshot();
      expect(snap.cache).toHaveProperty("hits");
      expect(snap.cache).toHaveProperty("misses");
      expect(snap.cache).toHaveProperty("size");
      expect(snap.cache).toHaveProperty("sizeBytes");
    });

    it("timestamp is a valid ISO string", () => {
      const snap = getMonitorSnapshot();
      expect(() => new Date(snap.timestamp)).not.toThrow();
      expect(new Date(snap.timestamp).toISOString()).toBe(snap.timestamp);
    });
  });
});
