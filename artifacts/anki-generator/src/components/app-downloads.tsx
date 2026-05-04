import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Smartphone, Apple, Monitor, Laptop2, Download, Loader2, Hammer, Check } from "lucide-react";
import { apiUrl } from "@/lib/utils";
import { IosInstallModal } from "@/components/ios-install-modal";

const APK_URL    = apiUrl("api/download-apk");
const STATUS_URL = apiUrl("api/download-apk/status");
const REBUILD_URL = apiUrl("api/download-apk/rebuild");

type ApkState = "idle" | "building" | "ready" | "failed";

function useApkStatus() {
  const [state, setState]   = useState<ApkState>("idle");
  const [builtAt, setBuiltAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(STATUS_URL, { cache: "no-store" });
        if (!r.ok || cancelled) return;
        const data = await r.json() as {
          slots?: Record<string, { apk?: { builtAt?: string } | null; build?: { status?: string } }>;
        };
        const slot = data.slots?.published ?? data.slots?.dev;
        const status = slot?.build?.status;
        if (slot?.apk?.builtAt) setBuiltAt(slot.apk.builtAt);
        if (status === "building" || status === "queued") setState("building");
        else if (slot?.apk) setState("ready");
        else if (status === "failed") setState("failed");
        else setState("idle");
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const build = async () => {
    setState("building");
    try { await fetch(REBUILD_URL, { method: "POST" }); } catch { /* ignore */ }
  };

  const download = () => {
    const a = document.createElement("a");
    a.href = builtAt ? `${APK_URL}?v=${encodeURIComponent(builtAt)}` : APK_URL;
    a.download = "ankigen.apk";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return { state, build, download };
}

/* ─────────────────────────────────────────────────────── */

export function AppDownloads() {
  const [mounted, setMounted]   = useState(false);
  const [isInApk, setIsInApk]   = useState(false);
  const [isIos, setIsIos]       = useState(false);
  const [showIos, setShowIos]   = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const apk = useApkStatus();

  useEffect(() => {
    setMounted(true);
    const w = window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string } };
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
    setIsIos(/iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && (navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints! > 1));
  }, []);

  if (!mounted || isInApk) return null;

  const handleAndroid = () => {
    if (apk.state === "ready") {
      apk.download();
      setDownloaded(true);
      setTimeout(() => setDownloaded(false), 3000);
    } else if (apk.state === "idle" || apk.state === "failed") {
      void apk.build();
    }
  };

  const platforms = [
    {
      id: "android",
      label: "Android",
      sub: "APK · sideload install",
      Icon: Smartphone,
      gradient: "from-emerald-500/15 to-green-500/5",
      border: "border-emerald-500/25",
      iconColor: "#22c55e",
      badge: null,
      action: handleAndroid,
      btnContent:
        apk.state === "building" ? (
          <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Building…</>
        ) : apk.state === "ready" && downloaded ? (
          <><Check className="h-3.5 w-3.5" /> Downloading</>
        ) : apk.state === "ready" ? (
          <><Download className="h-3.5 w-3.5" /> Download APK</>
        ) : apk.state === "failed" ? (
          <><Hammer className="h-3.5 w-3.5" /> Retry Build</>
        ) : (
          <><Hammer className="h-3.5 w-3.5" /> Build APK</>
        ),
      disabled: apk.state === "building",
      btnClass: "bg-emerald-600 hover:bg-emerald-700 text-white",
    },
    {
      id: "ios",
      label: isIos ? "iPhone / iPad" : "iOS / iPadOS",
      sub: "Add to Home Screen",
      Icon: Apple,
      gradient: "from-slate-500/12 to-slate-400/5",
      border: "border-slate-400/25",
      iconColor: "currentColor",
      badge: null,
      action: () => setShowIos(true),
      btnContent: isIos
        ? <><Apple className="h-3.5 w-3.5" /> Install Guide</>
        : <><Apple className="h-3.5 w-3.5" /> View Guide</>,
      disabled: false,
      btnClass: "bg-foreground text-background hover:opacity-90",
    },
    {
      id: "windows",
      label: "Windows",
      sub: ".exe installer",
      Icon: Monitor,
      gradient: "from-blue-500/10 to-blue-400/5",
      border: "border-blue-400/20",
      iconColor: "#3b82f6",
      badge: "Soon",
      action: null,
      btnContent: <><Monitor className="h-3.5 w-3.5" /> Coming soon</>,
      disabled: true,
      btnClass: "bg-muted text-muted-foreground cursor-not-allowed",
    },
    {
      id: "mac",
      label: "macOS",
      sub: ".dmg package",
      Icon: Laptop2,
      gradient: "from-violet-500/10 to-violet-400/5",
      border: "border-violet-400/20",
      iconColor: "#8b5cf6",
      badge: "Soon",
      action: null,
      btnContent: <><Laptop2 className="h-3.5 w-3.5" /> Coming soon</>,
      disabled: true,
      btnClass: "bg-muted text-muted-foreground cursor-not-allowed",
    },
  ];

  return (
    <>
      <IosInstallModal open={showIos} onClose={() => setShowIos(false)} />

      <section className="border-t border-border/40 pt-8 space-y-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Get the App</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Study anywhere — install AnkiGen on your device.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {platforms.map((p, i) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className={`relative flex flex-col gap-3 rounded-xl border bg-gradient-to-br p-4 ${p.gradient} ${p.border} ${p.disabled ? "opacity-60" : ""}`}
            >
              {p.badge && (
                <span className="absolute top-2.5 right-2.5 text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full border border-border/50 text-muted-foreground bg-muted/60">
                  {p.badge}
                </span>
              )}

              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: p.iconColor + "1a" }}>
                  <p.Icon className="h-4.5 w-4.5 h-[18px] w-[18px]" style={{ color: p.iconColor }} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-tight truncate">{p.label}</p>
                  <p className="text-[11px] text-muted-foreground leading-tight truncate">{p.sub}</p>
                </div>
              </div>

              <button
                onClick={p.action ?? undefined}
                disabled={p.disabled}
                className={`inline-flex items-center justify-center gap-1.5 w-full h-8 rounded-lg text-xs font-semibold transition-all ${p.btnClass}`}
              >
                {p.btnContent}
              </button>
            </motion.div>
          ))}
        </div>
      </section>
    </>
  );
}
