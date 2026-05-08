/**
 * Server health monitoring — error tracking, performance metrics, generation status.
 * Access via GET /api/monitor
 */

import { generationCache } from "./response-cache";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MonitorError {
  message: string;
  stack?: string;
  endpoint?: string;
  timestamp: number;
}

export interface GenerationMetric {
  id: string;
  type: "deck" | "qbank";
  status: "running" | "completed" | "failed";
  startedAt: number;
  completedAt?: number;
  deckId?: number;
  errorMessage?: string;
}

export interface RequestMetric {
  endpoint: string;
  method: string;
  statusCode: number;
  durationMs: number;
  timestamp: number;
}

export interface AiCallMetric {
  model: string;
  endpoint: string;
  durationMs: number;
  success: boolean;
  error?: string;
  timestamp: number;
}

export interface MonitorSnapshot {
  status: "healthy" | "degraded" | "error";
  uptimeSeconds: number;
  memory: {
    rssMb: number;
    heapUsedMb: number;
    heapTotalMb: number;
    externalMb: number;
  };
  errors: {
    total: number;
    recent: MonitorError[];
  };
  generations: {
    active: number;
    completed: number;
    failed: number;
    recent: GenerationMetric[];
  };
  requests: {
    total: number;
    avgDurationMs: number;
    recent: RequestMetric[];
  };
  aiCalls: {
    total: number;
    avgDurationMs: number;
    failures: number;
    recent: AiCallMetric[];
  };
  cache: {
    hits: number;
    misses: number;
    size: number;
    sizeBytes: number;
  };
  rateLimiter: {
    trackedIps: number;
  };
  timestamp: string;
}

// ─── State ───────────────────────────────────────────────────────────────────

const MAX_RECENT_ERRORS = 50;
const MAX_RECENT_GENERATIONS = 20;
const MAX_RECENT_REQUESTS = 100;
const MAX_RECENT_AI_CALLS = 50;

const errors: MonitorError[] = [];
const generations = new Map<string, GenerationMetric>();
const requests: RequestMetric[] = [];
const aiCalls: AiCallMetric[] = [];

let totalRequests = 0;
let totalRequestDuration = 0;
let totalAiCalls = 0;
let totalAiCallDuration = 0;
let totalAiFailures = 0;

// ─── Error tracking ──────────────────────────────────────────────────────────

export function logError(message: string, stack?: string, endpoint?: string): void {
  errors.push({ message, stack, endpoint, timestamp: Date.now() });
  if (errors.length > MAX_RECENT_ERRORS) errors.shift();
}

// ─── Generation tracking ─────────────────────────────────────────────────────

export function startGeneration(id: string, type: "deck" | "qbank"): void {
  generations.set(id, { id, type, status: "running", startedAt: Date.now() });
}

export function completeGeneration(id: string, deckId?: number): void {
  const gen = generations.get(id);
  if (gen) {
    gen.status = "completed";
    gen.deckId = deckId;
    gen.completedAt = Date.now();
  }
}

export function failGeneration(id: string, errorMessage?: string): void {
  const gen = generations.get(id);
  if (gen) {
    gen.status = "failed";
    gen.errorMessage = errorMessage;
    gen.completedAt = Date.now();
  }
}

// ─── Request tracking ────────────────────────────────────────────────────────

export function logRequest(endpoint: string, method: string, statusCode: number, durationMs: number): void {
  totalRequests++;
  totalRequestDuration += durationMs;
  requests.push({ endpoint, method, statusCode, durationMs, timestamp: Date.now() });
  if (requests.length > MAX_RECENT_REQUESTS) requests.shift();
}

// ─── AI call tracking ────────────────────────────────────────────────────────

export function logAiCall(model: string, endpoint: string, durationMs: number, success: boolean, error?: string): void {
  totalAiCalls++;
  totalAiCallDuration += durationMs;
  if (!success) totalAiFailures++;
  aiCalls.push({ model, endpoint, durationMs, success, error, timestamp: Date.now() });
  if (aiCalls.length > MAX_RECENT_AI_CALLS) aiCalls.shift();
}

// ─── Snapshot ────────────────────────────────────────────────────────────────

export function getMonitorSnapshot(): MonitorSnapshot {
  const mem = process.memoryUsage();
  const now = Date.now();

  const activeGens: GenerationMetric[] = [];
  const completedGens: GenerationMetric[] = [];
  const failedGens: GenerationMetric[] = [];

  for (const gen of generations.values()) {
    if (gen.status === "running") activeGens.push(gen);
    else if (gen.status === "completed") completedGens.push(gen);
    else if (gen.status === "failed") failedGens.push(gen);
  }

  // Sort by most recent
  const sortByTime = (a: { timestamp?: number; startedAt?: number }, b: { timestamp?: number; startedAt?: number }) =>
    (b.timestamp ?? b.startedAt ?? 0) - (a.timestamp ?? a.startedAt ?? 0);

  const recentGens = [...activeGens, ...completedGens, ...failedGens]
    .sort(sortByTime)
    .slice(0, MAX_RECENT_GENERATIONS);

  const recentErrors = [...errors].sort((a, b) => b.timestamp - a.timestamp).slice(0, 20);
  const recentRequests = [...requests].sort((a, b) => b.timestamp - a.timestamp).slice(0, 20);
  const recentAiCalls = [...aiCalls].sort((a, b) => b.timestamp - a.timestamp).slice(0, 20);

  const cacheStats = generationCache.getStats();

  // Determine overall status
  let status: "healthy" | "degraded" | "error" = "healthy";
  if (failedGens.length > 5 || recentErrors.length > 10) status = "error";
  else if (activeGens.length > 3 || totalAiFailures > 10) status = "degraded";

  return {
    status,
    uptimeSeconds: Math.round(process.uptime()),
    memory: {
      rssMb: Math.round(mem.rss / 1024 / 1024),
      heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
      externalMb: Math.round((mem.external || 0) / 1024 / 1024),
    },
    errors: {
      total: errors.length,
      recent: recentErrors,
    },
    generations: {
      active: activeGens.length,
      completed: completedGens.length,
      failed: failedGens.length,
      recent: recentGens,
    },
    requests: {
      total: totalRequests,
      avgDurationMs: totalRequests > 0 ? Math.round(totalRequestDuration / totalRequests) : 0,
      recent: recentRequests,
    },
    aiCalls: {
      total: totalAiCalls,
      avgDurationMs: totalAiCalls > 0 ? Math.round(totalAiCallDuration / totalAiCalls) : 0,
      failures: totalAiFailures,
      recent: recentAiCalls,
    },
    cache: {
      hits: cacheStats.hits,
      misses: cacheStats.misses,
      size: cacheStats.size,
      sizeBytes: (cacheStats as any).sizeBytes || 0,
    },
    rateLimiter: {
      trackedIps: 0, // Will be populated if rate limiter exposes stats
    },
    timestamp: new Date().toISOString(),
  };
}
