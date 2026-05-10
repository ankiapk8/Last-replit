/**
 * Server health monitoring — in-memory metrics + DB-persisted snapshots.
 */

import { generationCache } from "./response-cache";

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
  cache: {
    hits: number;
    misses: number;
    size: number;
    sizeBytes: number;
  };
  timestamp: string;
}

const MAX_RECENT_ERRORS = 50;
const MAX_RECENT_GENERATIONS = 20;

const errors: MonitorError[] = [];
const generations = new Map<string, GenerationMetric>();

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

// ─── Snapshot ────────────────────────────────────────────────────────────────

export function getMonitorSnapshot(): MonitorSnapshot {
  const mem = process.memoryUsage();

  const activeGens: GenerationMetric[] = [];
  const completedGens: GenerationMetric[] = [];
  const failedGens: GenerationMetric[] = [];

  for (const gen of generations.values()) {
    if (gen.status === "running") activeGens.push(gen);
    else if (gen.status === "completed") completedGens.push(gen);
    else if (gen.status === "failed") failedGens.push(gen);
  }

  const sortByTime = (
    a: { timestamp?: number; startedAt?: number },
    b: { timestamp?: number; startedAt?: number }
  ) => (b.timestamp ?? b.startedAt ?? 0) - (a.timestamp ?? a.startedAt ?? 0);

  const recentGens = [...activeGens, ...completedGens, ...failedGens]
    .sort(sortByTime)
    .slice(0, MAX_RECENT_GENERATIONS);

  const recentErrors = [...errors].sort((a, b) => b.timestamp - a.timestamp).slice(0, 20);
  const cacheStats = generationCache.getStats();

  let status: "healthy" | "degraded" | "error" = "healthy";
  if (failedGens.length > 5 || recentErrors.length > 10) status = "error";
  else if (activeGens.length > 3) status = "degraded";

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
    cache: {
      hits: cacheStats.hits,
      misses: cacheStats.misses,
      size: cacheStats.size,
      sizeBytes: cacheStats.sizeBytes,
    },
    timestamp: new Date().toISOString(),
  };
}
