import { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Smartphone, Download, ShieldCheck, Sparkles, AlertTriangle, Loader2, Hammer, Share2, Check } from "lucide-react";
import { apiUrl } from "@/lib/utils";

const APK_URL = apiUrl("api/download-apk");
const STATUS_URL = apiUrl("api/download-apk/status");
const REBUILD_URL = apiUrl("api/download-apk/rebuild");
const CONFIGURE_URL = apiUrl("api/download-apk/configure");
const META_URL = `${import.meta.env.BASE_URL}anki-cards.apk.json`;

type ApkMeta = {
  targetUrl: string;
  host: string;
  additionalHosts?: string[];
  versionName: string;
  versionCode: number;
  sizeBytes: number;
  builtAt: string;
};

function formatSize(bytes: number) {
  if (!bytes) return "—";
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

type BuildHistoryEntry = {
  host: string;
  status: "ready" | "failed";
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  error: string | null;
  sizeBytes: number | null;
};

type BuildState = {
  status: "idle" | "building" | "ready" | "failed" | "unsupported";
  targetHost: string | null;
  startedAt?: string | null;
  error: string | null;
};

type SlotSummary = {
  slot: "dev" | "published";
  host: string | null;
  apk: ApkMeta | null;
  matches: boolean;
  upToDate?: boolean;
  build: BuildState;
  history?: BuildHistoryEntry[];
};

type BuildStatus = {
  build: BuildState;
  apk: ApkMeta | null;
  matches: boolean;
  upToDate?: boolean;
  publishedHost?: string | null;
  devHost?: string | null;
  history?: BuildHistoryEntry[];
};

type RawStatusResponse = {
  publishedHost?: string | null;
  devHost?: string | null;
  builds?: Partial<Record<"dev" | "published", BuildState>>;
  slots?: Partial<Record<"dev" | "published", SlotSummary>>;
  // Legacy single-slot shape (kept for older servers)
  build?: BuildState;
  apk?: ApkMeta | null;
  matches?: boolean;
  upToDate?: boolean;
  history?: BuildHistoryEntry[];
};

function pickSlotForHost(
  raw: RawStatusResponse,
  currentHost: string,
): "dev" | "published" {
  if (raw.publishedHost && currentHost === raw.publishedHost) return "published";
  if (raw.devHost && currentHost === raw.devHost) return "dev";
  // Heuristic: published deployments use *.replit.app, dev uses *.replit.dev / *.pike.replit.dev
  if (currentHost.endsWith(".replit.app")) return "published";
  if (currentHost.includes(".replit.dev")) return "dev";
  return "published";
}

function adaptStatus(
  raw: RawStatusResponse,
  currentHost: string,
): BuildStatus {
  // New shape: slots + builds
  if (raw.slots && raw.builds) {
    const slot = pickSlotForHost(raw, currentHost);
    const summary = raw.slots[slot];
    const buildState =
      raw.builds[slot] ??
      summary?.build ?? {
        status: "idle",
        targetHost: null,
        error: null,
      };
    return {
      build: buildState,
      apk: summary?.apk ?? null,
      matches: summary?.matches ?? false,
      upToDate: summary?.upToDate,
      publishedHost: raw.publishedHost ?? null,
      devHost: raw.devHost ?? null,
      history: summary?.history ?? [],
    };
  }
  // Legacy shape
  return {
    build: raw.build ?? { status: "idle", targetHost: null, error: null },
    apk: raw.apk ?? null,
    matches: raw.matches ?? false,
    upToDate: raw.upToDate,
    publishedHost: raw.publishedHost ?? null,
    devHost: raw.devHost ?? null,
    history: raw.history ?? [],
  };
}

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

export function DownloadApkCard() {
  const [downloading, setDownloading] = useState(false);
  const [meta, setMeta] = useState<ApkMeta | null>(null);
  const [build, setBuild] = useState<BuildStatus | null>(null);
  const [showConfigure, setShowConfigure] = useState(false);
  const [publishedInput, setPublishedInput] = useState("");
  const [configureError, setConfigureError] = useState<string | null>(null);
  const [configuring, setConfiguring] = useState(false);
  const [showDevConfigure, setShowDevConfigure] = useState(false);
  const [devInput, setDevInput] = useState("");
  const [devConfigureError, setDevConfigureError] = useState<string | null>(null);
  const [devConfiguring, setDevConfiguring] = useState(false);
  const [shareState, setShareState] = useState<"idle" | "copied" | "error">("idle");
  const pollRef = useRef<number | null>(null);

  const isAndroid = typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
  const currentHost = typeof window !== "undefined" ? window.location.host.replace(/:\d+$/, "") : "";
  const liveMeta = build?.apk ?? meta;
  const trustedHosts = liveMeta ? [liveMeta.host, ...(liveMeta.additionalHosts ?? [])] : [];
  const targetMismatch = !!(
    liveMeta && currentHost && !trustedHosts.includes(currentHost)
  );
  const buildStatus = build?.build.status ?? "idle";
  const isBuilding = buildStatus === "building";
  const buildUnsupported = buildStatus === "unsupported";
  const buildFailed = buildStatus === "failed";

  const fetchStatus = async () => {
    try {
      const r = await fetch(STATUS_URL, { cache: "no-store" });
      if (r.ok) {
        const raw: RawStatusResponse = await r.json();
        const host =
          typeof window !== "undefined"
            ? window.location.host.replace(/:\d+$/, "")
            : "";
        const data = adaptStatus(raw, host);
        setBuild(data);
        if (data.apk) setMeta(data.apk);
        return data;
      }
    } catch {
      // ignore
    }
    return null;
  };

  useEffect(() => {
    fetch(META_URL)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setMeta(d); })
      .catch(() => {});
    fetchStatus();
  }, []);

  useEffect(() => {
    if (!isBuilding) return;
    pollRef.current = window.setInterval(fetchStatus, 4000);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [isBuilding]);

  const triggerRebuild = async (host?: string) => {
    try {
      const url = host
        ? `${REBUILD_URL}?host=${encodeURIComponent(host)}`
        : REBUILD_URL;
      await fetch(url, { method: "POST" });
      await fetchStatus();
    } catch {
      // ignore
    }
  };

  const submitConfigure = async () => {
    setConfigureError(null);
    setConfiguring(true);
    try {
      const r = await fetch(CONFIGURE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host: publishedInput, slot: "published" }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        setConfigureError((data as { error?: string }).error ?? "Failed to save");
        return;
      }
      setShowConfigure(false);
      await fetchStatus();
    } catch (err) {
      setConfigureError(err instanceof Error ? err.message : "Network error");
    } finally {
      setConfiguring(false);
    }
  };

  const submitDevConfigure = async () => {
    setDevConfigureError(null);
    setDevConfiguring(true);
    try {
      const r = await fetch(CONFIGURE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host: devInput, slot: "dev" }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        setDevConfigureError((data as { error?: string }).error ?? "Failed to save");
        return;
      }
      setShowDevConfigure(false);
      await fetchStatus();
    } catch (err) {
      setDevConfigureError(err instanceof Error ? err.message : "Network error");
    } finally {
      setDevConfiguring(false);
    }
  };

  const devHost = build?.devHost ?? null;

  const publishedHost = build?.publishedHost ?? null;
  const shareUrl = publishedHost
    ? `https://${publishedHost}/api/download-apk?slot=published`
    : null;

  const handleShare = async () => {
    if (!shareUrl) return;
    const shareData = {
      title: "AnkiGen Android app",
      text: "Install the AnkiGen Android app:",
      url: shareUrl,
    };
    try {
      const nav = navigator as Navigator & {
        share?: (data: ShareData) => Promise<void>;
        canShare?: (data: ShareData) => boolean;
      };
      if (nav.share && (!nav.canShare || nav.canShare(shareData))) {
        await nav.share(shareData);
        return;
      }
      await navigator.clipboard.writeText(shareUrl);
      setShareState("copied");
      window.setTimeout(() => setShareState("idle"), 2000);
    } catch (err) {
      const aborted = err instanceof Error && err.name === "AbortError";
      if (aborted) return;
      try {
        await navigator.clipboard.writeText(shareUrl);
        setShareState("copied");
        window.setTimeout(() => setShareState("idle"), 2000);
      } catch {
        setShareState("error");
        window.setTimeout(() => setShareState("idle"), 2500);
      }
    }
  };

  // Cache-bust the download URL whenever the APK is rebuilt so users always
  // get the latest APK (with the newest features) instead of a cached copy.
  const downloadHref = liveMeta?.builtAt
    ? `${APK_URL}?v=${encodeURIComponent(liveMeta.builtAt)}`
    : APK_URL;

  const isStale = build ? build.upToDate === false : false;

  const handleDownloadClick = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    if ((targetMismatch || isStale) && !isBuilding && !buildUnsupported) {
      e.preventDefault();
      await triggerRebuild(currentHost || undefined);
      return;
    }
    setDownloading(true);
  };

  return (
    <Card className="relative overflow-hidden border-primary/20 bg-gradient-to-br from-primary/10 via-background to-background shadow-sm">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full bg-primary/20 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-20 -left-10 h-44 w-44 rounded-full bg-primary/10 blur-3xl"
      />
      <CardContent className="relative p-5 md:p-6">
        <div className="flex flex-col md:flex-row md:items-center gap-5">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/30">
              <Smartphone className="h-7 w-7" />
            </div>
            <div className="md:hidden">
              <h3 className="text-lg font-serif font-bold tracking-tight">Get the Android app</h3>
              <p className="text-sm text-muted-foreground">Install on your phone — study anywhere.</p>
            </div>
          </div>

          <div className="hidden md:block flex-1 min-w-0">
            <h3 className="text-xl font-serif font-bold tracking-tight">Get the Android app</h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              Native experience — full screen, app icon on your home screen, no browser bar.
            </p>
            <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground flex-wrap">
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                Signed APK
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                Self-contained app
              </span>
              <span className="text-muted-foreground/70">
                v{meta?.versionName ?? "1.0.0"} · {meta ? formatSize(meta.sizeBytes) : "~3 MB"}
              </span>
            </div>
            {meta && (
              <p className="text-[10px] text-muted-foreground/60 mt-1.5 truncate">
                Targets <span className="font-mono">{meta.host}</span>
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2 md:items-end">
            {isBuilding ? (
              <Button size="lg" className="gap-2 shadow-md shadow-primary/20" disabled>
                <Loader2 className="h-4 w-4 animate-spin" />
                Preparing your APK…
              </Button>
            ) : targetMismatch && !buildUnsupported ? (
              <Button
                size="lg"
                className="gap-2 shadow-md shadow-primary/20"
                onClick={() => triggerRebuild()}
              >
                <Sparkles className="h-4 w-4" />
                Build APK for this URL
              </Button>
            ) : (
              <div className="flex flex-col sm:flex-row gap-2 md:items-end">
                <Button
                  asChild
                  size="lg"
                  className="gap-2 shadow-md shadow-primary/20"
                >
                  <a href={downloadHref} download="anki-cards.apk" onClick={handleDownloadClick}>
                    <Download className="h-4 w-4" />
                    Download APK
                  </a>
                </Button>
                {shareUrl && (
                  <Button
                    type="button"
                    size="lg"
                    variant="outline"
                    className="gap-2"
                    onClick={handleShare}
                    data-testid="share-apk-button"
                    title={shareUrl}
                  >
                    {shareState === "copied" ? (
                      <>
                        <Check className="h-4 w-4 text-emerald-600" />
                        Link copied!
                      </>
                    ) : shareState === "error" ? (
                      <>
                        <AlertTriangle className="h-4 w-4 text-destructive" />
                        Couldn't copy
                      </>
                    ) : (
                      <>
                        <Share2 className="h-4 w-4" />
                        Share APK
                      </>
                    )}
                  </Button>
                )}
              </div>
            )}
            {isBuilding && (
              <p className="text-[11px] text-muted-foreground md:text-right">
                Auto-configuring for <span className="font-mono">{currentHost}</span> · usually 1–2 min
              </p>
            )}
            {!isBuilding && !isAndroid && !downloading && !targetMismatch && (
              <p className="text-[11px] text-muted-foreground md:text-right">
                Open this page on Android to install
              </p>
            )}
            {!isBuilding && downloading && (
              <p className="text-[11px] text-primary md:text-right">
                Tap the file to install · enable "Unknown sources" if prompted
              </p>
            )}
            {buildFailed && (
              <p className="text-[11px] text-destructive md:text-right">
                Build failed. Check server logs.
              </p>
            )}
          </div>
        </div>

        {targetMismatch && !isBuilding && !buildUnsupported && (
          <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs">
            <Sparkles className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-emerald-700 dark:text-emerald-500">
                Auto-configure available
              </p>
              <p className="text-emerald-700/80 dark:text-emerald-500/80 mt-0.5 leading-relaxed">
                The cached APK targets <span className="font-mono">{liveMeta?.host}</span>, but you're on{" "}
                <span className="font-mono">{currentHost}</span>. Click "Build APK for this URL" to auto-build a copy that opens this site.
              </p>
            </div>
          </div>
        )}
        <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <p className="font-semibold flex items-center gap-1.5">
                <Hammer className="h-3.5 w-3.5 text-amber-600" />
                Dev URL (test build)
              </p>
              <p className="text-muted-foreground mt-0.5 leading-relaxed">
                {devHost ? (
                  <>
                    Dev APK currently targets{" "}
                    <span className="font-mono">{devHost}</span>. Enter another code/URL below to retarget it.
                  </>
                ) : (
                  <>
                    Enter any host code (e.g. <span className="font-mono">my-branch.replit.dev</span>) to build a dev APK pointing at it. Defaults to this site.
                  </>
                )}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setDevInput(devHost ?? currentHost ?? "");
                setDevConfigureError(null);
                setShowDevConfigure((v) => !v);
              }}
            >
              {devHost ? "Change" : "Enter code"}
            </Button>
          </div>
          {showDevConfigure && (
            <div className="mt-3 flex flex-col gap-2">
              <input
                type="text"
                value={devInput}
                onChange={(e) => setDevInput(e.target.value)}
                placeholder="my-branch.replit.dev"
                className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter" && devInput.trim()) submitDevConfigure(); }}
              />
              <div className="flex items-center gap-2 flex-wrap">
                <Button size="sm" onClick={submitDevConfigure} disabled={devConfiguring || !devInput.trim()}>
                  {devConfiguring ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save & build dev APK"}
                </Button>
                <a
                  href={`${APK_URL}?slot=dev`}
                  className="inline-flex items-center gap-1 text-[11px] underline text-amber-700 dark:text-amber-500 hover:no-underline"
                  download="anki-cards-dev.apk"
                >
                  <Download className="h-3 w-3" /> Download dev APK
                </a>
                <Button size="sm" variant="ghost" onClick={() => setShowDevConfigure(false)}>
                  Cancel
                </Button>
                {devConfigureError && (
                  <span className="text-destructive text-[11px]">{devConfigureError}</span>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground/70">
                The dev APK will call <span className="font-mono">https://{devInput || "&lt;your-host&gt;"}/api</span> for AI, decks, etc. Build takes ~20–30 s.
              </p>
            </div>
          )}
        </div>

        <div className="mt-3 rounded-lg border border-border/60 bg-muted/30 p-3 text-xs">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <p className="font-semibold">Published URL</p>
              <p className="text-muted-foreground mt-0.5 leading-relaxed">
                {publishedHost ? (
                  <>
                    The APK will be auto-built for{" "}
                    <span className="font-mono">{publishedHost}</span> after every publish.
                  </>
                ) : (
                  <>
                    Set this to your <span className="font-mono">.replit.app</span> URL once
                    so each publish ships an APK pointing at your live site.
                  </>
                )}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setPublishedInput(publishedHost ?? "");
                setConfigureError(null);
                setShowConfigure((v) => !v);
              }}
            >
              {publishedHost ? "Change" : "Set published URL"}
            </Button>
          </div>
          {showConfigure && (
            <div className="mt-3 flex flex-col gap-2">
              <input
                type="text"
                value={publishedInput}
                onChange={(e) => setPublishedInput(e.target.value)}
                placeholder="myapp.replit.app"
                className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
                autoFocus
              />
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={submitConfigure} disabled={configuring || !publishedInput.trim()}>
                  {configuring ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save & rebuild"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowConfigure(false)}>
                  Cancel
                </Button>
                {configureError && (
                  <span className="text-destructive text-[11px]">{configureError}</span>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground/70">
                Saved on the server. After every publish, the deployed app reads this and auto-builds the APK targeting that URL.
              </p>
            </div>
          )}
        </div>
        <div className="mt-3 rounded-lg border border-border/60 bg-muted/30 p-3 text-xs">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <p className="font-semibold flex items-center gap-1.5">
                <Hammer className="h-3.5 w-3.5 text-primary" />
                Admin · build APK for this domain
              </p>
              <p className="text-muted-foreground mt-0.5 leading-relaxed">
                Force a fresh APK build targeting{" "}
                <span className="font-mono">{currentHost || "this site"}</span>{" "}
                — useful right after publishing or if the cached APK is stale.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => triggerRebuild(currentHost || undefined)}
              disabled={isBuilding || !currentHost || buildUnsupported}
              className="gap-1.5"
            >
              {isBuilding ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Building…
                </>
              ) : (
                <>
                  <Hammer className="h-3.5 w-3.5" />
                  Build now
                </>
              )}
            </Button>
          </div>
          {buildFailed && build?.build.error && (
            <p className="mt-2 text-[11px] text-destructive break-words">
              Last build failed: {build.build.error}
            </p>
          )}
          {build?.history && build.history.length > 0 && (
            <div className="mt-3 border-t border-border/50 pt-2.5">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Recent builds
              </p>
              <ul className="space-y-1">
                {build.history.map((h, idx) => (
                  <li
                    key={`${h.startedAt}-${idx}`}
                    className="flex items-center gap-2 text-[11px] leading-tight"
                    title={`${new Date(h.startedAt).toLocaleString()} → ${new Date(h.finishedAt).toLocaleString()}${h.error ? ` · ${h.error}` : ""}`}
                  >
                    <span
                      className={`shrink-0 inline-block h-1.5 w-1.5 rounded-full ${
                        h.status === "ready" ? "bg-emerald-500" : "bg-destructive"
                      }`}
                    />
                    <span className="text-muted-foreground tabular-nums w-14 shrink-0">
                      {formatRelative(h.finishedAt)}
                    </span>
                    <span className="font-mono truncate flex-1 min-w-0 text-foreground/80">
                      {h.host}
                    </span>
                    <span className="text-muted-foreground/70 shrink-0 tabular-nums">
                      {formatDuration(h.durationMs)}
                      {h.sizeBytes ? ` · ${formatSize(h.sizeBytes)}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        {buildUnsupported && targetMismatch && (
          <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-amber-700 dark:text-amber-500">
                APK targets a different URL
              </p>
              <p className="text-amber-700/80 dark:text-amber-500/80 mt-0.5 leading-relaxed">
                This APK opens <span className="font-mono">{liveMeta?.host}</span>. To rebuild for{" "}
                <span className="font-mono">{currentHost}</span>, run{" "}
                <span className="font-mono bg-amber-500/15 px-1 py-0.5 rounded">
                  API_BASE=https://{currentHost}/api ./build-apk/build-bundled.sh
                </span>
                {" "}in an environment with the Android SDK installed.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
