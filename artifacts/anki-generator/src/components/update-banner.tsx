import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RefreshCw, Sparkles, X } from "lucide-react";

const POLL_MS = 60_000;

function currentScriptHash(): string | null {
  if (typeof document === "undefined") return null;
  const scripts = Array.from(document.querySelectorAll("script[src]")) as HTMLScriptElement[];
  const main =
    scripts.find((s) => /assets\/.*\.js$/.test(s.src)) ??
    scripts.find((s) => /\.(js|mjs)$/.test(s.src));
  return main ? main.src.split("/").pop() ?? null : null;
}

function parseScriptHash(html: string): string | null {
  const match = html.match(/<script[^>]+src=["']([^"']*assets\/[^"']+\.js)["']/i);
  if (match) return match[1].split("/").pop() ?? null;
  const fallback = html.match(/<script[^>]+src=["']([^"']+\.(?:js|mjs))["']/i);
  return fallback ? fallback[1].split("/").pop() ?? null : null;
}

export function UpdateBanner() {
  const [available, setAvailable] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!import.meta.env.PROD) return; // dev uses HMR, no need to poll

    const baseHash = currentScriptHash();
    if (!baseHash) return;

    let cancelled = false;
    let timer: number | null = null;

    const indexUrl = `${import.meta.env.BASE_URL}index.html`;

    const check = async () => {
      try {
        const res = await fetch(`${indexUrl}?_=${Date.now()}`, {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (!res.ok) return;
        const html = await res.text();
        const newHash = parseScriptHash(html);
        if (cancelled) return;
        if (newHash && newHash !== baseHash) {
          setAvailable(true);
        }
      } catch {
        /* network hiccup — ignore */
      }
    };

    const schedule = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(async () => {
        if (cancelled || available) return;
        await check();
        if (!cancelled && !available) schedule();
      }, POLL_MS);
    };

    const onFocus = () => {
      if (!available) check();
    };
    const onVisibility = () => {
      if (!available && document.visibilityState === "visible") check();
    };

    // Quick initial check + interval + focus/visibility hooks.
    window.setTimeout(check, 5_000);
    schedule();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [available]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.update().catch(() => null)));
      }
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k).catch(() => null)));
      }
    } catch {
      /* ignore */
    }
    window.location.reload();
  };

  const show = available && !dismissed;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="update-banner"
          className="fixed left-1/2 -translate-x-1/2 z-[70] px-3 w-full max-w-md"
          style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 18px)" }}
          initial={{ opacity: 0, y: 24, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.95 }}
          transition={{ type: "spring", stiffness: 300, damping: 24 }}
          role="status"
          aria-live="polite"
          data-testid="update-banner"
        >
          <div
            className="relative flex items-center gap-3 rounded-2xl shadow-2xl shadow-emerald-900/40 px-3 py-2.5 text-white overflow-hidden border border-white/15"
            style={{
              background:
                "linear-gradient(120deg, #16A34A 0%, #15803D 60%, #064E3B 100%)",
            }}
          >
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(60% 100% at 20% 0%, rgba(167,243,208,0.35), transparent 60%)",
              }}
            />
            <motion.div
              className="relative shrink-0 w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur"
              animate={{ rotate: [0, 8, -8, 0] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
            >
              <Sparkles className="w-5 h-5" />
            </motion.div>
            <div className="relative flex-1 min-w-0">
              <div className="text-sm font-semibold leading-tight">
                A new version is available
              </div>
              <div className="text-[11px] text-white/85 leading-tight">
                Refresh to get the latest features and fixes.
              </div>
            </div>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              className="relative inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-white text-emerald-700 text-xs font-bold shadow-md hover:scale-[1.04] active:scale-[0.97] transition disabled:opacity-70"
              data-testid="update-banner-refresh"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="relative shrink-0 w-7 h-7 rounded-lg hover:bg-white/15 flex items-center justify-center transition"
              aria-label="Dismiss"
              data-testid="update-banner-dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
