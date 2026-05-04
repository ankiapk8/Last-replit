import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Crown, ChevronDown, ChevronUp, RotateCcw, Lock, Unlock,
  FlaskConical, X, RefreshCw, CheckCircle2, XCircle,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { devSidHeaders } from "@/lib/dev-sid";

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/+$/, "") ?? "";
const LS_KEY = "dev-pro-override";
const LS_SIM_KEY = "dev-simulated";

function devHeaders(): HeadersInit {
  return devSidHeaders();
}

interface DevStatus {
  authenticated: boolean;
  userId: string | null;
  devIsPro: boolean | null;
  simulated: boolean;
}

interface DevUsage {
  decks: { count: number; max: number };
  exportsToday: { count: number; max: number };
}

const FEATURES: { label: string; pro: boolean }[] = [
  { label: "Unlimited decks", pro: true },
  { label: "Up to 2 decks", pro: false },
  { label: "Unlimited cards/deck", pro: true },
  { label: "Up to 20 cards/deck", pro: false },
  { label: "Unlimited exports/day", pro: true },
  { label: "1 .apkg export/day", pro: false },
  { label: "Question Bank (MCQ)", pro: true },
  { label: "AI Mind Maps", pro: true },
  { label: "Visual / image cards", pro: true },
  { label: "AI mnemonics", pro: true },
];

async function fetchDevStatus(): Promise<DevStatus> {
  try {
    const res = await fetch(`${API_BASE}/api/dev/status`, { credentials: "include", cache: "no-store", headers: devHeaders() });
    if (!res.ok) return { authenticated: false, userId: null, devIsPro: null, simulated: false };
    return res.json();
  } catch {
    return { authenticated: false, userId: null, devIsPro: null, simulated: false };
  }
}

async function fetchDevUsage(): Promise<DevUsage | null> {
  try {
    const res = await fetch(`${API_BASE}/api/dev/usage`, { credentials: "include", cache: "no-store", headers: devHeaders() });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function setDevPro(isPro: boolean): Promise<void> {
  await fetch(`${API_BASE}/api/dev/set-pro`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...devHeaders() },
    credentials: "include",
    body: JSON.stringify({ isPro }),
  });
}

async function clearDevOverride(): Promise<void> {
  await fetch(`${API_BASE}/api/dev/set-pro`, { method: "DELETE", credentials: "include", headers: devHeaders() });
}

async function simulateSubscribe(): Promise<void> {
  await fetch(`${API_BASE}/api/dev/simulate-subscribe`, { method: "POST", credentials: "include", headers: devHeaders() });
}

async function cancelSimulatedSubscribe(): Promise<void> {
  await fetch(`${API_BASE}/api/dev/simulate-subscribe`, { method: "DELETE", credentials: "include", headers: devHeaders() });
}

async function resetQuota(): Promise<void> {
  await fetch(`${API_BASE}/api/dev/reset-quota`, { method: "POST", credentials: "include", headers: devHeaders() });
}

interface DevSubStatus {
  isPro: boolean;
  devOverride?: boolean;
  simulated?: boolean;
}

async function fetchSubStatus(): Promise<DevSubStatus> {
  try {
    const res = await fetch(`${API_BASE}/api/subscription/status`, { credentials: "include", cache: "no-store", headers: devHeaders() });
    if (!res.ok) return { isPro: false };
    return res.json();
  } catch {
    return { isPro: false };
  }
}

export function DevPlanBadge() {
  const { data, isLoading } = useQuery<DevSubStatus>({
    queryKey: ["subscription/status"],
    queryFn: fetchSubStatus,
    staleTime: 0,
    gcTime: 1000 * 60 * 10,
    retry: 1,
  });

  function openPanel() {
    window.dispatchEvent(new Event("dev-panel-open"));
  }

  const isPro = data?.isPro ?? false;
  const isSimulated = data?.simulated ?? false;
  const hasOverride = data?.devOverride ?? false;

  function badgeLabel() {
    if (isLoading) return "DEV …";
    if (isPro && isSimulated) return "SIMULATED PRO";
    if (isPro && hasOverride) return "OVERRIDE PRO";
    if (isPro) return "REAL PRO";
    return "DEV FREE";
  }

  return (
    <button
      type="button"
      onClick={openPanel}
      title="Click to open Dev Mode panel"
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold font-mono tracking-wide border cursor-pointer transition-opacity hover:opacity-80 ${
        isPro
          ? isSimulated
            ? "bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 border-violet-300/50"
            : "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border-amber-300/50"
          : "bg-muted text-muted-foreground border-border"
      }`}
    >
      {isPro ? <Unlock className="h-2.5 w-2.5" /> : <Lock className="h-2.5 w-2.5" />}
      {badgeLabel()}
    </button>
  );
}

function syncToLocalStorage(isPro: boolean | null, simulated: boolean) {
  if (isPro === null) {
    localStorage.removeItem(LS_KEY);
    localStorage.removeItem(LS_SIM_KEY);
  } else {
    localStorage.setItem(LS_KEY, String(isPro));
    if (simulated) localStorage.setItem(LS_SIM_KEY, "true");
    else localStorage.removeItem(LS_SIM_KEY);
  }
  window.dispatchEvent(new Event("dev-plan-changed"));
}

function UsageBar({ count, max, label }: { count: number; max: number; label: string }) {
  const pct = Math.min(count / Math.max(max, 1), 1);
  const near = pct >= 0.8;
  const full = pct >= 1;
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-[10px]">
        <span className="text-muted-foreground/60">{label}</span>
        <span className={full ? "text-red-400" : near ? "text-amber-400" : "text-foreground/50"}>
          {count}/{max}
        </span>
      </div>
      <div className="h-1 rounded-full bg-border overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${full ? "bg-red-400" : near ? "bg-amber-400" : "bg-emerald-400"}`}
          style={{ width: `${pct * 100}%` }}
        />
      </div>
    </div>
  );
}

export function DevPanel() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"plan" | "features">("plan");
  const [status, setStatus] = useState<DevStatus | null>(null);
  const [usage, setUsage] = useState<DevUsage | null>(null);
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

  const refresh = useCallback(async () => {
    const [s, u] = await Promise.all([fetchDevStatus(), fetchDevUsage()]);
    setStatus(s);
    setUsage(u);
    syncToLocalStorage(s.devIsPro, s.simulated);
  }, []);

  useEffect(() => {
    refresh();
    const stored = localStorage.getItem(LS_KEY);
    if (stored !== null) {
      const isPro = stored === "true";
      const wasSimulated = localStorage.getItem(LS_SIM_KEY) === "true";
      if (wasSimulated && isPro) {
        simulateSubscribe().then(() => refresh());
      } else {
        setDevPro(isPro).then(() => refresh());
      }
    }
  }, [refresh]);

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("dev-panel-open", handler);
    return () => window.removeEventListener("dev-panel-open", handler);
  }, []);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["subscription/status"] });
    queryClient.invalidateQueries({ queryKey: ["subscription/usage"] });
  }

  async function handleSet(isPro: boolean) {
    setLoading(true);
    await setDevPro(isPro);
    await refresh();
    invalidate();
    setLoading(false);
  }

  async function handleClear() {
    setLoading(true);
    await clearDevOverride();
    await refresh();
    invalidate();
    setLoading(false);
  }

  async function handleSimulateSubscribe() {
    setLoading(true);
    await simulateSubscribe();
    await refresh();
    invalidate();
    setLoading(false);
  }

  async function handleCancelSimulated() {
    setLoading(true);
    await cancelSimulatedSubscribe();
    await refresh();
    invalidate();
    setLoading(false);
  }

  async function handleResetQuota() {
    setLoading(true);
    await resetQuota();
    await refresh();
    invalidate();
    setLoading(false);
  }

  const devIsPro = status?.devIsPro;
  const isSimulated = status?.simulated ?? false;
  const hasOverride = devIsPro !== null && devIsPro !== undefined;

  function headerBadgeLabel() {
    if (!hasOverride) return "REAL";
    if (devIsPro && isSimulated) return "SIMULATED PRO";
    if (devIsPro) return "PRO";
    return "FREE";
  }

  function headerBadgeClass() {
    if (!hasOverride) return "bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400";
    if (devIsPro && isSimulated) return "bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400";
    if (devIsPro) return "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300";
    return "bg-muted text-muted-foreground";
  }

  const effectiveIsPro = hasOverride ? !!devIsPro : false;

  return (
    <div className="fixed bottom-4 left-4 z-[9999] font-mono text-xs">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-violet-400/40 bg-background/95 backdrop-blur shadow-xl shadow-violet-500/10 overflow-hidden"
        style={{ width: "18rem" }}
      >
        {/* Header */}
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-violet-50 dark:hover:bg-violet-950/20 transition-colors"
        >
          <span className="h-2 w-2 rounded-full bg-violet-500 animate-pulse shrink-0" />
          <span className="text-violet-600 dark:text-violet-400 font-bold tracking-wide uppercase">Dev Mode</span>
          <span className={`ml-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${headerBadgeClass()}`}>
            {headerBadgeLabel()}
          </span>
          <span className="ml-auto text-muted-foreground">
            {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
          </span>
        </button>

        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              {/* Tabs */}
              <div className="flex border-t border-border/40">
                <button
                  type="button"
                  onClick={() => setTab("plan")}
                  className={`flex-1 py-1.5 text-[10px] font-bold tracking-wide uppercase transition-colors ${
                    tab === "plan"
                      ? "text-violet-600 dark:text-violet-400 border-b-2 border-violet-500"
                      : "text-muted-foreground hover:text-foreground border-b-2 border-transparent"
                  }`}
                >
                  Plan Controls
                </button>
                <button
                  type="button"
                  onClick={() => setTab("features")}
                  className={`flex-1 py-1.5 text-[10px] font-bold tracking-wide uppercase transition-colors ${
                    tab === "features"
                      ? "text-violet-600 dark:text-violet-400 border-b-2 border-violet-500"
                      : "text-muted-foreground hover:text-foreground border-b-2 border-transparent"
                  }`}
                >
                  Feature Access
                </button>
              </div>

              {tab === "plan" && (
                <div className="px-3 pb-3 pt-2 space-y-2.5">

                  {/* Override buttons */}
                  <div>
                    <div className="text-muted-foreground/70 text-[10px] uppercase tracking-widest mb-1.5">
                      Subscription override
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => handleSet(false)}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md border transition-all ${
                          hasOverride && !devIsPro
                            ? "border-foreground/50 bg-foreground text-background"
                            : "border-border hover:border-foreground/30 hover:bg-muted text-muted-foreground"
                        }`}
                      >
                        <Lock className="h-3 w-3" />
                        Free
                      </button>
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => handleSet(true)}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md border transition-all ${
                          hasOverride && devIsPro && !isSimulated
                            ? "border-amber-500 bg-amber-500 text-white"
                            : "border-border hover:border-amber-400/50 hover:bg-amber-50 dark:hover:bg-amber-950/20 text-muted-foreground hover:text-amber-600"
                        }`}
                      >
                        <Crown className="h-3 w-3" />
                        Pro
                      </button>
                    </div>
                  </div>

                  {/* Simulate Stripe */}
                  <div className="border-t border-border/40 pt-2">
                    <div className="text-muted-foreground/70 text-[10px] uppercase tracking-widest mb-1.5">
                      Simulate Stripe (no key needed)
                    </div>
                    {!isSimulated ? (
                      <button
                        type="button"
                        disabled={loading}
                        onClick={handleSimulateSubscribe}
                        className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-md border border-dashed border-violet-400/60 hover:border-violet-500 hover:bg-violet-50 dark:hover:bg-violet-950/20 text-violet-600 dark:text-violet-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        title=""
                      >
                        <FlaskConical className="h-3 w-3" />
                        Simulate Subscribe
                      </button>
                    ) : (
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-violet-50 dark:bg-violet-950/20 border border-violet-200/50 dark:border-violet-800/30 text-violet-700 dark:text-violet-300">
                          <FlaskConical className="h-3 w-3 shrink-0" />
                          <span className="text-[10px] font-bold uppercase tracking-wide">Simulated Pro active</span>
                        </div>
                        <button
                          type="button"
                          disabled={loading}
                          onClick={handleCancelSimulated}
                          title="Forces plan to Free. Use 'Reset to real subscription' to restore DB-backed status."
                          className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-md border border-dashed border-red-400/60 hover:border-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 text-red-500 dark:text-red-400 transition-colors"
                        >
                          <X className="h-3 w-3" />
                          Cancel Simulated Sub
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Usage stats */}
                  {usage && status?.authenticated && (
                    <div className="border-t border-border/40 pt-2 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground/70 text-[10px] uppercase tracking-widest">
                          Current Usage
                        </span>
                        <button
                          type="button"
                          disabled={loading}
                          onClick={handleResetQuota}
                          title="Reset daily export quota to 0 (for testing the limit)"
                          className="flex items-center gap-1 text-[10px] text-muted-foreground/50 hover:text-amber-500 transition-colors"
                        >
                          <RefreshCw className="h-2.5 w-2.5" />
                          reset quota
                        </button>
                      </div>
                      <UsageBar count={usage.decks.count} max={usage.decks.max} label="Decks" />
                      <UsageBar count={usage.exportsToday.count} max={usage.exportsToday.max} label="Exports today" />
                    </div>
                  )}

                  {/* Reset to real */}
                  {hasOverride && (
                    <button
                      type="button"
                      disabled={loading}
                      onClick={handleClear}
                      className="w-full flex items-center justify-center gap-1.5 py-1 text-muted-foreground hover:text-foreground border border-dashed border-border hover:border-foreground/30 rounded-md transition-colors"
                    >
                      <RotateCcw className="h-3 w-3" />
                      Reset to real subscription
                    </button>
                  )}

                  {/* Debug info */}
                  <div className="border-t border-border/40 pt-2 space-y-1 text-[10px] text-muted-foreground/60">
                    <div className="flex justify-between">
                      <span>Authenticated</span>
                      <span className={status?.authenticated ? "text-emerald-500" : "text-red-400"}>
                        {status?.authenticated ? "yes" : "no"}
                      </span>
                    </div>
                    {status?.userId && (
                      <div className="flex justify-between">
                        <span>User ID</span>
                        <span className="text-foreground/50 truncate max-w-[110px]">{status.userId.slice(0, 8)}…</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span>Override</span>
                      <span>
                        {!hasOverride
                          ? "none (real DB)"
                          : devIsPro && isSimulated
                            ? "Simulated Pro"
                            : devIsPro
                              ? "Pro forced"
                              : "Free forced"}
                      </span>
                    </div>
                  </div>

                  <div className="border-t border-border/40 pt-1.5 text-[9px] text-muted-foreground/40 leading-relaxed">
                    Dev panel only — hidden in production builds.
                    Override persists across refreshes.
                  </div>
                </div>
              )}

              {tab === "features" && (
                <div className="px-3 pb-3 pt-2 space-y-1.5">
                  <div className="text-muted-foreground/70 text-[10px] uppercase tracking-widest mb-2">
                    Access at current plan ({effectiveIsPro ? "Pro" : "Free"})
                  </div>
                  {FEATURES.filter(f => f.pro === effectiveIsPro || !f.pro === !effectiveIsPro).map((f) => {
                    const available = f.pro ? effectiveIsPro : !effectiveIsPro;
                    return (
                      <div
                        key={f.label}
                        className={`flex items-center gap-2 text-[10px] ${available ? "text-foreground/80" : "text-muted-foreground/40 line-through"}`}
                      >
                        {available
                          ? <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                          : <XCircle className="h-3 w-3 text-muted-foreground/30 shrink-0" />}
                        {f.label}
                        {f.pro && <span className="ml-auto text-[9px] text-amber-500 font-bold">PRO</span>}
                      </div>
                    );
                  })}
                  <div className="border-t border-border/40 pt-2 text-[9px] text-muted-foreground/40">
                    Switch plan in the Plan Controls tab.
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
