import { Router, type IRouter } from "express";
import { createReadStream, statSync } from "node:fs";
import {
  apkMatchesHost,
  computeSourceHash,
  ensureApkForSlot,
  getAllBuildStates,
  getApkPath,
  getBuildHistory,
  getBuildState,
  getStoredTargetHost,
  readApkMeta,
  resolveHostForSlot,
  setStoredTargetHost,
  startRebuild,
  SLOTS,
  type Slot,
} from "../lib/apk-builder";

const router: IRouter = Router();

function isPublicHost(host: string | null): host is string {
  if (!host) return false;
  if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0") return false;
  if (host.startsWith("172.") || host.startsWith("10.") || host.startsWith("192.168.")) return false;
  return host.includes(".");
}

function parseSlot(value: unknown, fallback: Slot = "dev"): Slot {
  return value === "published" || value === "dev" ? value : fallback;
}

function slotSummary(slot: Slot) {
  const host = resolveHostForSlot(slot);
  const meta = readApkMeta(slot);
  const sourceHash = computeSourceHash();
  return {
    slot,
    host,
    apk: meta,
    matches: host ? apkMatchesHost(slot, host) : false,
    upToDate: !!meta?.sourceHash && meta.sourceHash === sourceHash && (!host || meta?.host === host),
    build: getBuildState(slot),
    history: getBuildHistory(3, slot),
  };
}

router.get("/download-apk/status", (_req, res) => {
  res.json({
    sourceHash: computeSourceHash(),
    publishedHost: getStoredTargetHost("published"),
    devHost: getStoredTargetHost("dev"),
    builds: getAllBuildStates(),
    slots: SLOTS.reduce((acc, s) => {
      acc[s] = slotSummary(s);
      return acc;
    }, {} as Record<Slot, ReturnType<typeof slotSummary>>),
  });
});

router.post("/download-apk/configure", (req, res) => {
  const body = (req.body ?? {}) as { host?: unknown; slot?: unknown };
  const slot = parseSlot(body.slot, "published");
  let raw = typeof body.host === "string" ? body.host.trim() : "";
  raw = raw.replace(/^https?:\/\//i, "").replace(/\/.*$/, "").replace(/:\d+$/, "");
  if (!isPublicHost(raw)) {
    res.status(400).json({ error: "Please provide a public hostname like myapp.replit.app" });
    return;
  }
  setStoredTargetHost(raw, slot);
  const build = startRebuild(slot, raw);
  res.status(202).json({ slot, host: raw, publishedHost: getStoredTargetHost("published"), devHost: getStoredTargetHost("dev"), build });
});

router.post("/download-apk/rebuild", (req, res) => {
  const slot = parseSlot((req.body as Record<string, unknown> | undefined)?.slot ?? req.query?.slot, "dev");
  const host = resolveHostForSlot(slot);
  if (!host) {
    res.status(400).json({ error: `No host configured for slot "${slot}"` });
    return;
  }
  const state = startRebuild(slot, host);
  res.status(202).json({ slot, host, build: state });
});

router.get("/download-apk", (req, res) => {
  const slot = parseSlot(req.query?.slot, "published");
  const host = resolveHostForSlot(slot);

  if (host) ensureApkForSlot(slot, host);

  const buildState = getBuildState(slot);
  const apkPath = getApkPath(slot);
  const matches = host ? apkMatchesHost(slot, host) : true;

  if (host && !matches && buildState.status === "building") {
    res.status(202).json({
      status: "building",
      slot,
      message: "APK is being prepared. Try again in a minute.",
      build: buildState,
    });
    return;
  }

  if (!apkPath) {
    res.status(404).json({ error: `APK not found for slot "${slot}"` });
    return;
  }

  const stat = statSync(apkPath);
  res.setHeader("Content-Type", "application/vnd.android.package-archive");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="anki-cards-${slot}.apk"`,
  );
  res.setHeader("Content-Length", String(stat.size));
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (host && !matches) res.setHeader("X-APK-Host-Mismatch", "true");
  createReadStream(apkPath).pipe(res);
});

export default router;
