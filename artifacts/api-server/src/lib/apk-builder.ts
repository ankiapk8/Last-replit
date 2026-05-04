import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { logger } from "./logger";

const PROJECT_ROOT_CANDIDATES = [
  process.cwd(),
  path.resolve(process.cwd(), ".."),
  path.resolve(process.cwd(), "../.."),
];

function findProjectRoot(): string {
  for (const root of PROJECT_ROOT_CANDIDATES) {
    if (existsSync(path.join(root, "build-apk", "build-bundled.sh"))) {
      return root;
    }
  }
  return process.cwd();
}

const PROJECT_ROOT = findProjectRoot();
const PUBLIC_DIR = path.join(PROJECT_ROOT, "artifacts/anki-generator/public");
const BUILD_SCRIPT = path.join(PROJECT_ROOT, "build-apk", "build-bundled.sh");
const TARGET_CONFIG_PATH = path.join(PUBLIC_DIR, "apk-target.json");
const HISTORY_PATH = path.join(PUBLIC_DIR, "apk-history.json");
const HISTORY_MAX = 20;

export type Slot = "dev" | "published";
export const SLOTS: readonly Slot[] = ["dev", "published"] as const;

const SLOT_FILES: Record<Slot, { apk: string; meta: string }> = {
  dev: {
    apk: path.join(PUBLIC_DIR, "anki-cards-dev.apk"),
    meta: path.join(PUBLIC_DIR, "anki-cards-dev.apk.json"),
  },
  published: {
    apk: path.join(PUBLIC_DIR, "anki-cards.apk"),
    meta: path.join(PUBLIC_DIR, "anki-cards.apk.json"),
  },
};

export type BuildHistoryEntry = {
  slot: Slot;
  host: string;
  status: "ready" | "failed";
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  error: string | null;
  sizeBytes: number | null;
};

function readHistory(): BuildHistoryEntry[] {
  try {
    if (!existsSync(HISTORY_PATH)) return [];
    const data = JSON.parse(readFileSync(HISTORY_PATH, "utf8"));
    return Array.isArray(data) ? (data as BuildHistoryEntry[]) : [];
  } catch {
    return [];
  }
}

function appendHistory(entry: BuildHistoryEntry): void {
  const list = readHistory();
  list.unshift(entry);
  while (list.length > HISTORY_MAX) list.pop();
  try {
    mkdirSync(path.dirname(HISTORY_PATH), { recursive: true });
    writeFileSync(HISTORY_PATH, JSON.stringify(list, null, 2));
  } catch (err) {
    logger.warn({ err }, "Failed to persist APK build history");
  }
}

export function getBuildHistory(limit = 5, slot?: Slot): BuildHistoryEntry[] {
  const all = readHistory();
  return (slot ? all.filter(e => e.slot === slot) : all).slice(0, limit);
}

type TargetConfig = {
  host?: string;
  hosts?: Partial<Record<Slot, string>>;
  updatedAt: string;
};

function readTargetConfig(): TargetConfig | null {
  try {
    if (!existsSync(TARGET_CONFIG_PATH)) return null;
    return JSON.parse(readFileSync(TARGET_CONFIG_PATH, "utf8")) as TargetConfig;
  } catch {
    return null;
  }
}

export function getStoredTargetHost(slot: Slot = "published"): string | null {
  const cfg = readTargetConfig();
  if (!cfg) return null;
  const fromMap = cfg.hosts?.[slot];
  if (fromMap) return fromMap;
  // Backwards compat: legacy single-host config means published.
  if (slot === "published" && cfg.host) return cfg.host;
  return null;
}

export function setStoredTargetHost(host: string, slot: Slot = "published"): void {
  mkdirSync(path.dirname(TARGET_CONFIG_PATH), { recursive: true });
  const existing = readTargetConfig();
  const hosts: Partial<Record<Slot, string>> = { ...(existing?.hosts ?? {}) };
  if (existing?.host && !hosts.published) hosts.published = existing.host;
  hosts[slot] = host;
  const data: TargetConfig = { hosts, updatedAt: new Date().toISOString() };
  writeFileSync(TARGET_CONFIG_PATH, JSON.stringify(data, null, 2));
}

export type BuildState = {
  status: "idle" | "queued" | "building" | "ready" | "failed" | "unsupported";
  slot: Slot;
  targetHost: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  logTail: string[];
};

const slotStates: Record<Slot, BuildState> = {
  dev: { status: "idle", slot: "dev", targetHost: null, startedAt: null, finishedAt: null, error: null, logTail: [] },
  published: { status: "idle", slot: "published", targetHost: null, startedAt: null, finishedAt: null, error: null, logTail: [] },
};

let currentChild: ChildProcess | null = null;
let currentSlot: Slot | null = null;
const queue: Array<{ slot: Slot; host: string }> = [];

export function getBuildState(slot: Slot): BuildState {
  const s = slotStates[slot];
  return { ...s, logTail: [...s.logTail] };
}

export function getAllBuildStates(): Record<Slot, BuildState> {
  return { dev: getBuildState("dev"), published: getBuildState("published") };
}

export type ApkMeta = {
  targetUrl?: string;
  host?: string;
  apiBase?: string;
  sizeBytes?: number;
  builtAt?: string;
  versionName?: string;
  sourceHash?: string;
};

export function readApkMeta(slot: Slot): ApkMeta | null {
  try {
    const p = SLOT_FILES[slot].meta;
    if (!existsSync(p)) return null;
    return JSON.parse(readFileSync(p, "utf8")) as ApkMeta;
  } catch (err) {
    logger.warn({ err, slot }, "Failed to read APK metadata");
    return null;
  }
}

export function getApkPath(slot: Slot): string | null {
  try {
    const p = SLOT_FILES[slot].apk;
    const s = statSync(p);
    return s.isFile() ? p : null;
  } catch {
    return null;
  }
}

export function apkMatchesHost(slot: Slot, host: string): boolean {
  const meta = readApkMeta(slot);
  if (!meta?.host) return false;
  return meta.host === host;
}

function appendLog(slot: Slot, line: string) {
  const s = slotStates[slot];
  s.logTail.push(line);
  if (s.logTail.length > 60) s.logTail.shift();
}

function buildSupported(): boolean {
  if (!existsSync(BUILD_SCRIPT)) return false;
  if (!existsSync(path.join(PROJECT_ROOT, "artifacts/anki-generator/android"))) return false;
  const androidHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || "/home/runner/android-sdk";
  if (!existsSync(androidHome)) return false;
  if (!existsSync(path.join(androidHome, "platforms"))) return false;
  return true;
}

function isUsableHost(host: string): boolean {
  if (!host) return false;
  if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0") return false;
  if (host.startsWith("172.") || host.startsWith("10.") || host.startsWith("192.168.")) return false;
  return host.includes(".");
}

// ---- Source hash so we can skip rebuilds when nothing changed -------------

const SOURCE_DIRS = ["artifacts/anki-generator/src", "artifacts/anki-generator/public"];
const SOURCE_FILES = [
  "artifacts/anki-generator/index.html",
  "artifacts/anki-generator/package.json",
  "artifacts/anki-generator/vite.config.ts",
  "artifacts/anki-generator/capacitor.config.ts",
];

function hashFile(hash: ReturnType<typeof createHash>, filePath: string) {
  try {
    const buf = readFileSync(filePath);
    hash.update(filePath);
    hash.update(buf);
  } catch {
    /* ignore */
  }
}

function walk(dir: string, hash: ReturnType<typeof createHash>) {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries.sort()) {
    if (name.startsWith(".")) continue;
    if (name === "node_modules" || name === "dist" || name === "android") continue;
    if (name.startsWith("anki-cards") && (name.endsWith(".apk") || name.endsWith(".apk.json"))) continue;
    if (name === "apk-history.json" || name === "apk-target.json") continue;
    const full = path.join(dir, name);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) walk(full, hash);
    else if (st.isFile()) hashFile(hash, full);
  }
}

let cachedSourceHash: { value: string; computedAt: number } | null = null;

export function computeSourceHash(): string {
  const now = Date.now();
  if (cachedSourceHash && now - cachedSourceHash.computedAt < 5_000) {
    return cachedSourceHash.value;
  }
  const hash = createHash("sha256");
  for (const dir of SOURCE_DIRS) walk(path.join(PROJECT_ROOT, dir), hash);
  for (const file of SOURCE_FILES) hashFile(hash, path.join(PROJECT_ROOT, file));
  const value = hash.digest("hex").slice(0, 16);
  cachedSourceHash = { value, computedAt: now };
  return value;
}

// ---- Build queue ----------------------------------------------------------

function runQueued() {
  if (currentChild || queue.length === 0) return;
  const next = queue.shift()!;
  startBuildNow(next.slot, next.host);
}

function startBuildNow(slot: Slot, host: string): void {
  const state = slotStates[slot];

  if (!isUsableHost(host)) {
    state.status = "failed";
    state.error = `Refusing to build APK for non-public host "${host}"`;
    state.targetHost = host;
    state.startedAt = new Date().toISOString();
    state.finishedAt = state.startedAt;
    appendLog(slot, state.error);
    logger.warn({ host, slot }, "Refused APK rebuild for non-public host");
    runQueued();
    return;
  }

  if (!buildSupported()) {
    state.status = "unsupported";
    state.targetHost = host;
    state.error = "APK build tooling not available in this environment";
    appendLog(slot, state.error);
    runQueued();
    return;
  }

  const sourceHash = computeSourceHash();
  state.status = "building";
  state.targetHost = host;
  state.startedAt = new Date().toISOString();
  state.finishedAt = null;
  state.error = null;
  state.logTail = [];

  const apiBase = `https://${host}/api`;
  appendLog(slot, `[${slot}] Building APK for ${apiBase} (source ${sourceHash})`);
  logger.info({ host, apiBase, slot, sourceHash }, "Starting APK rebuild");

  const child = spawn("bash", [BUILD_SCRIPT], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      API_BASE: apiBase,
      APK_OUT: SLOT_FILES[slot].apk,
      META_OUT: SLOT_FILES[slot].meta,
      ANKIGEN_SOURCE_HASH: sourceHash,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  currentChild = child;
  currentSlot = slot;

  const onData = (buf: Buffer) => {
    const text = buf.toString("utf8");
    for (const line of text.split(/\r?\n/)) {
      if (line.trim()) appendLog(slot, line.slice(0, 500));
    }
  };
  child.stdout?.on("data", onData);
  child.stderr?.on("data", onData);

  child.on("error", (err) => {
    state.status = "failed";
    state.error = err.message;
    state.finishedAt = new Date().toISOString();
    appendLog(slot, `Spawn error: ${err.message}`);
    logger.error({ err, slot }, "APK rebuild spawn error");
    currentChild = null;
    currentSlot = null;
    runQueued();
  });

  child.on("close", (code) => {
    state.finishedAt = new Date().toISOString();
    let sizeBytes: number | null = null;
    if (code === 0) {
      state.status = "ready";
      appendLog(slot, "Build finished successfully");
      logger.info({ slot }, "APK rebuild succeeded");
      try { sizeBytes = statSync(SLOT_FILES[slot].apk).size; } catch { /* ignore */ }
    } else {
      state.status = "failed";
      state.error = `Build exited with code ${code}`;
      appendLog(slot, state.error);
      logger.error({ code, slot }, "APK rebuild failed");
    }
    appendHistory({
      slot,
      host: state.targetHost ?? host,
      status: state.status === "ready" ? "ready" : "failed",
      startedAt: state.startedAt ?? new Date().toISOString(),
      finishedAt: state.finishedAt,
      durationMs:
        new Date(state.finishedAt).getTime() -
        new Date(state.startedAt ?? state.finishedAt).getTime(),
      error: state.status === "ready" ? null : state.error,
      sizeBytes,
    });
    currentChild = null;
    currentSlot = null;
    runQueued();
  });
}

export function startRebuild(slot: Slot, host: string): BuildState {
  const state = slotStates[slot];
  if (state.status === "building") return getBuildState(slot);
  if (currentChild && currentSlot && currentSlot !== slot) {
    if (!queue.some(q => q.slot === slot)) {
      queue.push({ slot, host });
      state.status = "queued";
      state.targetHost = host;
      appendLog(slot, `Queued behind ${currentSlot} build`);
    }
    return getBuildState(slot);
  }
  startBuildNow(slot, host);
  return getBuildState(slot);
}

export function ensureApkForSlot(slot: Slot, host: string): BuildState {
  const meta = readApkMeta(slot);
  const sourceHash = computeSourceHash();
  const hostMatches = meta?.host === host;
  const sourceMatches = !!meta?.sourceHash && meta.sourceHash === sourceHash;
  if (hostMatches && sourceMatches && getApkPath(slot)) {
    return getBuildState(slot);
  }
  return startRebuild(slot, host);
}

function devHostFromEnv(): string | null {
  return getStoredTargetHost("dev") || process.env.REPLIT_DEV_DOMAIN || null;
}

function publishedHostFromEnv(): string | null {
  return getStoredTargetHost("published") || process.env.REPLIT_DEPLOYMENT_DOMAIN || null;
}

export function resolveHostForSlot(slot: Slot): string | null {
  return slot === "dev" ? devHostFromEnv() : publishedHostFromEnv();
}

export function autoConfigureFromEnv(): void {
  const dev = devHostFromEnv();
  const published = publishedHostFromEnv();

  if (!buildSupported()) {
    for (const slot of SLOTS) {
      const host = slot === "dev" ? dev : published;
      slotStates[slot].status = "unsupported";
      slotStates[slot].targetHost = host;
      slotStates[slot].error = "APK build tooling not available in this environment";
    }
    logger.warn({ dev, published }, "APK build tooling unavailable; serving stale APKs");
    return;
  }

  if (dev) ensureApkForSlot("dev", dev);
  if (published) ensureApkForSlot("published", published);
  if (!dev && !published) {
    logger.info("No REPLIT_*_DOMAIN set; skipping APK auto-configure");
  }

  startSourceHashWatcher();
}

// Periodically re-check the source hash; if it changed since the last build
// for any slot, kick off a fresh build so the served APK never goes stale.
let watcherStarted = false;
let lastSeenHash: string | null = null;
function startSourceHashWatcher(): void {
  if (watcherStarted) return;
  watcherStarted = true;
  lastSeenHash = computeSourceHash();
  setInterval(() => {
    if (!buildSupported()) return;
    let current: string;
    try {
      current = computeSourceHash();
    } catch {
      return;
    }
    if (current === lastSeenHash) return;
    lastSeenHash = current;
    for (const slot of SLOTS) {
      const host = resolveHostForSlot(slot);
      if (!host) continue;
      const meta = readApkMeta(slot);
      if (meta?.sourceHash === current && meta?.host === host) continue;
      const state = slotStates[slot];
      if (state.status === "building") continue;
      logger.info({ slot, host, sourceHash: current }, "Source changed; auto-rebuilding APK");
      startRebuild(slot, host);
    }
  }, 30_000).unref();
}
