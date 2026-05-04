import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Download,
  Smartphone,
  Apple,
  Loader2,
  ChevronDown,
  Globe,
  Rocket,
  Check,
  RefreshCw,
  Hourglass,
} from "lucide-react";
import { apiUrl } from "@/lib/utils";
import { IosInstallModal } from "@/components/ios-install-modal";

const APK_URL = apiUrl("api/download-apk");
const STATUS_URL = apiUrl("api/download-apk/status");
const REBUILD_URL = apiUrl("api/download-apk/rebuild");

type Slot = "dev" | "published";

type SlotSummary = {
  slot: Slot;
  host: string | null;
  apk: { host?: string; sourceHash?: string } | null;
  matches: boolean;
  upToDate: boolean;
  build: {
    status: "idle" | "queued" | "building" | "ready" | "failed" | "unsupported";
    targetHost: string | null;
    error: string | null;
  };
};

type StatusResponse = {
  sourceHash: string;
  publishedHost: string | null;
  slots: Record<Slot, SlotSummary>;
};

type TargetState = {
  host: string | null;
  hasApk: boolean;
  building: boolean;
  upToDate: boolean;
  unsupported: boolean;
  failed: boolean;
};

const initialTarget: TargetState = {
  host: null,
  hasApk: false,
  building: false,
  upToDate: false,
  unsupported: false,
  failed: false,
};

function summaryToTargetState(s: SlotSummary | undefined): TargetState {
  if (!s) return initialTarget;
  const status = s.build.status;
  return {
    host: s.host,
    hasApk: !!s.apk,
    building: status === "building" || status === "queued",
    upToDate: s.upToDate,
    unsupported: status === "unsupported",
    failed: status === "failed",
  };
}

export function HeaderApkButton() {
  const [mounted, setMounted] = useState(false);
  const [isInApk, setIsInApk] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [showIos, setShowIos] = useState(false);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [dev, setDev] = useState<TargetState>(initialTarget);
  const [pub, setPub] = useState<TargetState>(initialTarget);
  const popRef = useRef<HTMLDivElement | null>(null);

  // Platform detection
  useEffect(() => {
    setMounted(true);
    if (typeof window === "undefined") return;
    const w = window as unknown as {
      Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string };
    };
    const inApk =
      !!w.Capacitor?.isNativePlatform?.() ||
      w.Capacitor?.getPlatform?.() === "android" ||
      w.Capacitor?.getPlatform?.() === "ios" ||
      document.referrer.startsWith("android-app://") ||
      window.matchMedia?.("(display-mode: standalone)").matches ||
      window.matchMedia?.("(display-mode: fullscreen)").matches ||
      // @ts-expect-error iOS only
      window.navigator.standalone === true ||
      /\bwv\b|AnkiGen/.test(navigator.userAgent);
    setIsInApk(inApk);
    const ua = navigator.userAgent;
    const iOS =
      /iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === "MacIntel" &&
        (navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints! > 1);
    setIsIos(iOS);
  }, []);

  // Click-outside / ESC close
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const fetchStatus = async (): Promise<StatusResponse | null> => {
    try {
      const r = await fetch(STATUS_URL, { cache: "no-store" });
      if (!r.ok) return null;
      return (await r.json()) as StatusResponse;
    } catch {
      return null;
    }
  };

  const applyStatus = (s: StatusResponse) => {
    setDev(summaryToTargetState(s.slots?.dev));
    setPub(summaryToTargetState(s.slots?.published));
  };

  // Initial load
  useEffect(() => {
    if (!mounted || isInApk) return;
    let cancelled = false;
    (async () => {
      const s = await fetchStatus();
      if (!cancelled && s) applyStatus(s);
    })();
    return () => {
      cancelled = true;
    };
  }, [mounted, isInApk]);

  // Poll while either target is building, OR every 30s while popover is open.
  useEffect(() => {
    const anyBuilding = dev.building || pub.building;
    const interval = anyBuilding ? 4000 : open ? 15000 : 0;
    if (!interval) return;
    const id = window.setInterval(async () => {
      const s = await fetchStatus();
      if (s) applyStatus(s);
    }, interval);
    return () => window.clearInterval(id);
  }, [dev.building, pub.building, open]);

  // Auto-hide toast
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(id);
  }, [toast]);

  const triggerDownload = (slot: Slot) => {
    const a = document.createElement("a");
    a.href = `${APK_URL}?slot=${slot}&t=${Date.now()}`;
    a.download = `anki-cards-${slot}.apk`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setToast(
      slot === "dev"
        ? "Downloading dev APK… open the file when it's done to install."
        : "Downloading published APK… open the file when it's done to install."
    );
    setOpen(false);
  };

  const triggerRebuild = async (slot: Slot) => {
    try {
      await fetch(REBUILD_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot }),
      });
    } catch {
      /* ignore */
    }
    const setter = slot === "dev" ? setDev : setPub;
    setter((s) => ({ ...s, building: true }));
    const status = await fetchStatus();
    if (status) applyStatus(status);
    setToast(
      slot === "dev"
        ? "Rebuilding the dev APK in the background… takes ~1 minute."
        : "Rebuilding the published APK in the background… takes ~1 minute."
    );
  };

  const handlePrimaryClick = (slot: Slot) => {
    const t = slot === "dev" ? dev : pub;
    if (t.unsupported || !t.host) return;
    if (t.hasApk) {
      triggerDownload(slot);
      return;
    }
    if (!t.building) void triggerRebuild(slot);
  };

  if (!mounted || isInApk) return null;

  const handleMainClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (isIos) {
      setShowIos(true);
      return;
    }
    setOpen((v) => !v);
  };

  const anyBuilding = dev.building || pub.building;
  const mainLabel = isIos ? "Install on iPhone/iPad" : anyBuilding ? "Building APK…" : "Get the App";
  const mainBadge = isIos ? "iOS" : anyBuilding ? "WAIT" : "APK";

  return (
    <>
      <div className="relative" ref={popRef}>
        <button
          type="button"
          onClick={handleMainClick}
          aria-haspopup={!isIos}
          aria-expanded={!isIos && open}
          aria-label={isIos ? "Install on iPhone or iPad" : "Download the Android app"}
          className="group relative inline-flex items-center gap-1.5 sm:gap-2 h-9 px-2.5 sm:px-3.5 rounded-full overflow-hidden text-white text-xs sm:text-sm font-semibold tracking-tight shadow-lg shadow-primary/30 hover:shadow-primary/50 hover:scale-[1.03] active:scale-[0.97] transition-all duration-200"
          style={{
            background:
              "linear-gradient(120deg, hsl(142 71% 38%) 0%, hsl(152 76% 45%) 45%, hsl(142 71% 38%) 100%)",
          }}
          data-testid="header-apk-button"
        >
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-full opacity-70 group-hover:opacity-100 transition-opacity"
            style={{
              background:
                "radial-gradient(60% 80% at 30% 20%, rgba(255,255,255,0.35), transparent 60%)",
            }}
          />
          <span
            aria-hidden
            className="apk-shine pointer-events-none absolute inset-y-0 -inset-x-1/2 w-1/3 skew-x-[-20deg] bg-gradient-to-r from-transparent via-white/55 to-transparent"
          />
          <span
            aria-hidden
            className="apk-pulse pointer-events-none absolute inset-0 rounded-full ring-2 ring-white/40"
          />
          <span className="relative flex items-center justify-center">
            {isIos ? (
              <Apple className="h-4 w-4 transition-transform group-hover:-rotate-6" />
            ) : anyBuilding ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Smartphone className="h-4 w-4 sm:hidden transition-transform group-hover:-rotate-6" />
                <Download className="hidden sm:block h-4 w-4 transition-transform group-hover:translate-y-0.5 group-hover:scale-110" />
              </>
            )}
          </span>
          <span className="relative hidden sm:inline whitespace-nowrap">{mainLabel}</span>
          <span
            aria-hidden
            className="relative hidden sm:inline-flex items-center gap-1 ml-0.5 px-1.5 py-0.5 rounded-full bg-white/20 text-[9px] font-bold uppercase tracking-wider backdrop-blur-sm"
          >
            {mainBadge}
          </span>
          {!isIos && (
            <ChevronDown
              className={`relative h-3.5 w-3.5 ml-0.5 transition-transform ${open ? "rotate-180" : ""}`}
            />
          )}
        </button>

        <AnimatePresence>
          {!isIos && open && (
            <motion.div
              key="apk-popover"
              className="absolute right-0 mt-2 w-[22rem] max-w-[94vw] z-50"
              initial={{ opacity: 0, y: -8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.96 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              role="menu"
              data-testid="apk-popover"
            >
              <div className="rounded-2xl bg-white shadow-2xl border border-emerald-100 overflow-hidden">
                <div className="px-4 py-3 bg-gradient-to-r from-emerald-50 to-green-50 border-b border-emerald-100">
                  <div className="text-sm font-bold text-emerald-900">
                    Choose which build to install
                  </div>
                  <div className="text-[11px] text-emerald-700/80">
                    Each APK loads the chosen URL on launch — pick the one that matches where you want to use it.
                  </div>
                </div>
                <div className="p-2 space-y-1.5">
                  <TargetRow
                    icon={<Globe className="w-4 h-4" />}
                    title="Dev preview build"
                    subtitle="Talks to this development URL"
                    state={dev}
                    onPrimary={() => handlePrimaryClick("dev")}
                    onRebuild={() => void triggerRebuild("dev")}
                    testid="apk-target-dev"
                  />
                  <TargetRow
                    icon={<Rocket className="w-4 h-4" />}
                    title="Published build"
                    subtitle={
                      pub.host
                        ? "Talks to your live deployment"
                        : "Publish your app first to enable this build"
                    }
                    state={pub}
                    onPrimary={() => handlePrimaryClick("published")}
                    onRebuild={() => void triggerRebuild("published")}
                    testid="apk-target-published"
                  />
                </div>
                <div className="px-4 py-2.5 border-t border-emerald-100 bg-emerald-50/40 text-[10.5px] text-emerald-800/80 leading-snug">
                  <strong>Android tip:</strong> after downloading, open the file and accept "Install
                  from unknown sources" when prompted.
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {toast && (
            <motion.div
              key="apk-toast"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.2 }}
              className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[100] max-w-[92vw] px-4 py-2.5 rounded-full bg-emerald-900 text-white text-xs font-medium shadow-2xl shadow-emerald-900/40"
              role="status"
              data-testid="apk-toast"
            >
              {toast}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <IosInstallModal open={showIos} onClose={() => setShowIos(false)} />
    </>
  );
}

function TargetRow({
  icon,
  title,
  subtitle,
  state,
  onPrimary,
  onRebuild,
  testid,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  state: TargetState;
  onPrimary: () => void;
  onRebuild: () => void;
  testid: string;
}) {
  const noHost = !state.host || state.unsupported;
  const canDownload = !noHost && state.hasApk;
  const showRebuildSide = canDownload && !state.upToDate && !state.building;

  let primaryLabel: React.ReactNode;
  let primaryIcon: React.ReactNode;
  let primaryClass = "bg-gradient-to-r from-emerald-500 to-green-600 text-white shadow-md shadow-emerald-600/30 hover:shadow-emerald-600/50 hover:scale-[1.02] active:scale-[0.98]";

  if (noHost) {
    primaryIcon = <Hourglass className="w-4 h-4" />;
    primaryLabel = "Unavailable";
    primaryClass = "bg-slate-100 text-slate-400 cursor-not-allowed";
  } else if (state.building) {
    primaryIcon = <Loader2 className="w-4 h-4 animate-spin" />;
    primaryLabel = "Building…";
    primaryClass = "bg-emerald-100 text-emerald-800 cursor-wait";
  } else if (canDownload) {
    primaryIcon = <Download className="w-4 h-4" />;
    primaryLabel = "Download";
  } else {
    primaryIcon = <RefreshCw className="w-4 h-4" />;
    primaryLabel = "Build APK";
  }

  return (
    <div
      className="flex items-center gap-2 px-2 py-2 rounded-xl hover:bg-emerald-50/50 transition"
      data-testid={testid}
    >
      <div className="shrink-0 w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-500 to-green-600 text-white flex items-center justify-center shadow">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-slate-800 leading-tight truncate">{title}</div>
        <div className="text-[11px] text-slate-500 leading-tight truncate" title={state.host ?? subtitle}>
          {state.host ?? subtitle}
        </div>
        {showRebuildSide && (
          <div className="text-[10px] text-amber-700 mt-0.5 leading-tight">
            App was updated since this build
          </div>
        )}
        {state.upToDate && state.hasApk && !state.building && (
          <div className="text-[10px] text-emerald-700 mt-0.5 leading-tight inline-flex items-center gap-1">
            <Check className="w-2.5 h-2.5" /> Up to date
          </div>
        )}
        {state.failed && !state.building && (
          <div className="text-[10px] text-red-700 mt-0.5 leading-tight">
            Last build failed — tap rebuild to retry
          </div>
        )}
      </div>
      <div className="flex flex-col items-stretch gap-1 shrink-0">
        <button
          type="button"
          onClick={onPrimary}
          disabled={noHost || state.building}
          data-testid={`${testid}-primary`}
          className={`inline-flex items-center justify-center gap-1.5 px-3 h-8 rounded-full text-xs font-semibold transition disabled:opacity-70 disabled:cursor-not-allowed ${primaryClass}`}
        >
          {primaryIcon}
          {primaryLabel}
        </button>
        {showRebuildSide && (
          <button
            type="button"
            onClick={onRebuild}
            data-testid={`${testid}-rebuild`}
            className="inline-flex items-center justify-center gap-1 px-2 h-6 rounded-full text-[10px] font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 transition"
          >
            <RefreshCw className="w-2.5 h-2.5" /> Rebuild
          </button>
        )}
      </div>
    </div>
  );
}
