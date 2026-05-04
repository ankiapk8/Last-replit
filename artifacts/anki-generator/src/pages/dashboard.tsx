import { useMemo, useState, useEffect } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useListDecks, useListQbanks } from "@workspace/api-client-react";
import { format, isThisWeek } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Layers, FileText, Sparkles, ChevronRight, PlusCircle,
  Clock, Flame, Brain, CheckCircle2, BookOpen, Stethoscope, CalendarClock,
  LayoutDashboard, Target, TrendingUp, TrendingDown, Compass, Timer,
  Trophy, Play, X, Search, Tag, Crown, Settings,
} from "lucide-react";
import {
  getSessions,
  getStudyStreak,
  getLast7Days,
  getDeckStats,
  getLastStudiedByDeck,
  getTodayStats,
  getWeeklyGoal,
  setWeeklyGoal,
  getThisWeekCards,
  getLast14DaysTotals,
  getLast8Weeks,
} from "@/lib/study-stats";
import { getDashboardPlannerDueTodayCount } from "@/lib/study-planner/topics";
import { getAllDeckTags, addDeckTag, removeDeckTag } from "@/lib/deck-tags";
import { getTotalScheduledDueCount, getDueCountByDeckId, getReviewedCountByDeckId } from "@/lib/srs";
import type { Qbank } from "@workspace/api-client-react";
import { AppDownloads } from "@/components/app-downloads";
import { FeaturesShowcase } from "@/components/features-showcase";
import { ModelBadge } from "@/components/model-badge";
import { AmbientOrbs } from "@/components/ambient-orbs";
import { PageHeader } from "@/components/page-header";
import { useSubscription } from "@/hooks/useSubscription";

const RING_R = 36;
const RING_C = 2 * Math.PI * RING_R; // ≈ 226.2

function relativeDate(iso: string): string {
  const diffDays = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}

function masteryColor(pct: number | null): { chip: string; dot: string } {
  if (pct === null) return { chip: "bg-muted/60 border-border/40 text-muted-foreground", dot: "bg-muted-foreground/40" };
  if (pct >= 80) return { chip: "bg-emerald-500/15 border-emerald-400/30 text-emerald-700 dark:text-emerald-300", dot: "bg-emerald-500" };
  if (pct >= 40) return { chip: "bg-amber-500/15 border-amber-400/30 text-amber-700 dark:text-amber-300", dot: "bg-amber-500" };
  return { chip: "bg-red-500/15 border-red-400/30 text-red-700 dark:text-red-300", dot: "bg-red-500" };
}

export default function Dashboard() {
  const { data: decks, isLoading } = useListDecks();
  const { data: qbanks } = useListQbanks();
  const { isPro } = useSubscription();

  const todayStr = new Date().toISOString().slice(0, 10);
  const BANNER_LS_KEY = `ankigen-planner-banner-dismissed-${todayStr}`;
  const [plannerBannerDismissed, setPlannerBannerDismissed] = useState(() => {
    try { return localStorage.getItem(BANNER_LS_KEY) === "1"; } catch { return false; }
  });
  const dismissBanner = () => {
    try { localStorage.setItem(BANNER_LS_KEY, "1"); } catch {}
    setPlannerBannerDismissed(true);
  };

  const [plannerDueTick, setPlannerDueTick] = useState(0);
  const [statsTick, setStatsTick] = useState(0);
  useEffect(() => {
    const refresh = () => { setPlannerDueTick(t => t + 1); setStatsTick(t => t + 1); };
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);
    window.addEventListener("deck-tags-changed", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", refresh);
      window.removeEventListener("deck-tags-changed", refresh);
    };
  }, []);
  const plannerDueToday = useMemo(() => getDashboardPlannerDueTodayCount(), [plannerDueTick]);

  const sessions = useMemo(() => getSessions(), [statsTick]);
  const streak = useMemo(() => getStudyStreak(sessions), [sessions]);
  const last7 = useMemo(() => getLast7Days(), [statsTick]);
  const deckStats = useMemo(() => getDeckStats(sessions), [sessions]);
  const lastStudiedByDeck = useMemo(() => getLastStudiedByDeck(sessions), [sessions]);
  const todayStats = useMemo(() => getTodayStats(sessions), [sessions]);
  const thisWeekCards = useMemo(() => getThisWeekCards(sessions), [sessions]);
  const sparklineDays = useMemo(() => getLast14DaysTotals(), [statsTick]);

  const [weeklyGoal, setWeeklyGoalState] = useState(() => getWeeklyGoal());
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [tagEditDeckId, setTagEditDeckId] = useState<number | null>(null);
  const [tagInput, setTagInput] = useState("");

  // 8-week heatmap grid: 8 cols (oldest→newest) × 7 rows (Mon→Sun)
  const heatmap = useMemo(() => {
    const raw = getLast8Weeks();
    const lookup = new Map(raw.map(d => [d.date, d]));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayDow = (today.getDay() + 6) % 7; // Mon=0..Sun=6
    const monday8WeeksAgo = new Date(today);
    monday8WeeksAgo.setDate(today.getDate() - todayDow - 7 * 7);
    type Cell = { date: string; label: string; total: number; known: number } | null;
    const grid: Cell[][] = Array.from({ length: 8 }, () => Array(7).fill(null));
    const cursor = new Date(monday8WeeksAgo);
    for (let i = 0; i < 56; i++) {
      const dateStr = cursor.toISOString().slice(0, 10);
      const col = Math.floor(i / 7);
      const row = i % 7;
      if (cursor <= today) {
        grid[col][row] = lookup.get(dateStr) ?? { date: dateStr, label: cursor.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }), total: 0, known: 0 };
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return grid;
  }, [statsTick]);

  // Recent 28-day deck stats for Strongest / Weakest
  const recentDeckStatsList = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 28);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const recentSessions = sessions.filter(s => s.date >= cutoffStr);
    const stats = getDeckStats(recentSessions);
    return [...stats.entries()]
      .map(([id, s]) => ({ id, ...s, pct: s.total > 0 ? Math.round((s.known / s.total) * 100) : 0 }))
      .filter(d => d.total >= 1);
  }, [sessions]);

  const totalDecks = (decks ?? []).filter((d: { kind?: string }) => (d.kind ?? "deck") !== "qbank").length;
  const totalCards = (decks ?? []).filter((d: { kind?: string }) => (d.kind ?? "deck") !== "qbank").reduce((sum, d) => sum + d.cardCount, 0);
  const thisWeekDecks = (decks ?? []).filter((d: { kind?: string; createdAt: string }) => (d.kind ?? "deck") !== "qbank" && isThisWeek(new Date(d.createdAt))).length;
  const totalQbanks = (qbanks as Qbank[] | undefined)?.filter((q: Qbank) => !(q as Qbank & { parentId?: number | null }).parentId).length ?? 0;
  const totalQuestions = (qbanks as Qbank[] | undefined)?.reduce((sum: number, q: Qbank) => sum + (q.questionCount ?? 0), 0) ?? 0;

  const totalSessionCards = sessions.reduce((sum, s) => sum + s.total, 0);
  const totalKnown = sessions.reduce((sum, s) => sum + s.known, 0);
  const overallPct = totalSessionCards > 0 ? Math.round((totalKnown / totalSessionCards) * 100) : 0;
  const dueNowCount = useMemo(() => getTotalScheduledDueCount(), []);

  const maxDay = Math.max(...last7.map(d => d.total), 1);

  const allDecks = useMemo(() =>
    [...(decks ?? [])].filter((d: { kind?: string }) => (d.kind ?? "deck") !== "qbank")
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [decks]
  );

  const allDeckTags = useMemo(() => getAllDeckTags(), [statsTick]);

  const allUniqueTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const [deckId, tags] of allDeckTags) {
      if (allDecks.some(d => d.id === deckId)) tags.forEach(t => tagSet.add(t));
    }
    return [...tagSet].sort();
  }, [allDeckTags, allDecks]);

  const filteredDecks = useMemo(() => {
    const q = search.toLowerCase().trim();
    return allDecks.filter(d => {
      const tags = allDeckTags.get(d.id) ?? [];
      const matchesSearch = !q || d.name.toLowerCase().includes(q) || tags.some(t => t.toLowerCase().includes(q));
      const matchesTag = !tagFilter || tags.includes(tagFilter);
      return matchesSearch && matchesTag;
    });
  }, [allDecks, allDeckTags, search, tagFilter]);

  const isFiltering = search.trim() !== "" || tagFilter !== null;
  const displayedDecks = isFiltering ? filteredDecks : filteredDecks.slice(0, 5);

  const recentDeckDueCounts = useMemo(() => {
    const map = new Map<number, number>();
    for (const d of allDecks) {
      const reviewedCount = getReviewedCountByDeckId(d.id);
      if (reviewedCount === 0) continue;
      const reviewedDue = getDueCountByDeckId(d.id);
      const unseenNew = Math.max(0, (d.cardCount ?? 0) - reviewedCount);
      const total = reviewedDue + unseenNew;
      if (total > 0) map.set(d.id, total);
    }
    return map;
  }, [allDecks]);

  const deckStatsList = [...deckStats.entries()]
    .map(([id, s]) => ({ id, ...s, pct: s.total > 0 ? Math.round((s.known / s.total) * 100) : 0 }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  const recentSessions = sessions.slice(0, 5);
  const hasStudied = sessions.length > 0;

  // Knowledge Map: all non-qbank decks with mastery %
  const knowledgeMap = useMemo(() => {
    const deckList = (decks ?? []).filter((d: { kind?: string }) => (d.kind ?? "deck") !== "qbank");
    return deckList
      .map(d => {
        const stats = deckStats.get(d.id);
        const pct = stats && stats.total > 0 ? Math.round((stats.known / stats.total) * 100) : null;
        return { id: d.id, name: d.name, pct, cardCount: d.cardCount };
      })
      .sort((a, b) => {
        if (a.pct === null && b.pct === null) return 0;
        if (a.pct === null) return 1;
        if (b.pct === null) return -1;
        return a.pct - b.pct;
      });
  }, [decks, deckStats]);

  // Recommended next: scored by (days since last reviewed × 0.5) + (low mastery × 0.5)
  const recommendedDeck = useMemo(() => {
    const lastStudied = new Map<number, string>();
    for (const s of sessions) {
      const existing = lastStudied.get(s.deckId);
      if (!existing || s.date > existing) lastStudied.set(s.deckId, s.date);
    }
    const nowMs = new Date().setHours(0, 0, 0, 0);
    const qualified = [...deckStats.entries()]
      .map(([id, s]) => {
        const pct = s.total > 0 ? s.known / s.total : 0;
        const last = lastStudied.get(id);
        const daysSince = last
          ? Math.round((nowMs - new Date(last).setHours(0, 0, 0, 0)) / 86400000)
          : 999;
        const overdueScore = Math.min(daysSince, 30) / 30;
        const masteryScore = 1 - pct;
        const score = overdueScore * 0.5 + masteryScore * 0.5;
        return { id, ...s, pct: Math.round(pct * 100), daysSince, score };
      })
      .filter(d => d.total >= 1)
      .sort((a, b) => b.score - a.score);
    return qualified[0] ?? null;
  }, [sessions, deckStats]);

  // Strongest / weakest decks by recent (28-day) session performance
  const { strongest, weakest } = useMemo(() => {
    const sorted = [...recentDeckStatsList].sort((a, b) => b.pct - a.pct);
    return {
      strongest: sorted.slice(0, 3),
      weakest: [...sorted].reverse().slice(0, 3),
    };
  }, [recentDeckStatsList]);

  // Sparkline SVG points for study time
  const sparkline = useMemo(() => {
    const maxVal = Math.max(...sparklineDays.map(d => d.total), 1);
    const W = 100, H = 28;
    const points = sparklineDays.map((d, i) => {
      const x = ((i / (sparklineDays.length - 1)) * W).toFixed(1);
      const y = (H - (d.total / maxVal) * (H - 4) - 2).toFixed(1);
      return `${x},${y}`;
    }).join(" ");
    const totalMinutes = sparklineDays.reduce((sum, d) => sum + d.estimatedMinutes, 0);
    return { points, totalMinutes };
  }, [sparklineDays]);

  const weeklyPct = Math.min(1, thisWeekCards / weeklyGoal);

  return (
    <div className="relative space-y-8 animate-in fade-in duration-500 pb-10">
      <AmbientOrbs color="hsl(152 72% 55% / 0.12)" className="rounded-3xl" />

      {/* Header */}
      <div className="relative">
        <PageHeader
          icon={LayoutDashboard}
          iconColor="#34d399"
          iconGlow="hsl(152 72% 55% / 0.5)"
          gradient="from-emerald-500 via-teal-400 to-cyan-500"
          title="Dashboard"
          subtitle="Your study progress at a glance."
        />
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Link href="/generate">
            <Button className="gap-2">
              <PlusCircle className="h-4 w-4" />
              Generate Cards
            </Button>
          </Link>
          <Link href="/settings">
            <Button variant="outline" className="gap-2">
              <Settings className="h-4 w-4" />
              Settings
            </Button>
          </Link>
          {!isPro && (
            <Link href="/pricing">
              <Button variant="outline" className="gap-2 border-amber-300/60 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30">
                <Crown className="h-4 w-4" />
                Upgrade to Pro
              </Button>
            </Link>
          )}
        </div>
        {import.meta.env.DEV && <div className="mt-2"><ModelBadge /></div>}
      </div>

      {/* Planner due-today banner */}
      <AnimatePresence>
        {!plannerBannerDismissed && plannerDueToday > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -8, height: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="flex items-center gap-3 rounded-xl border border-amber-300/60 bg-amber-50/80 dark:bg-amber-950/20 dark:border-amber-700/50 px-3 py-2.5 overflow-hidden"
          >
            <CalendarClock className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <p className="text-xs text-amber-800 dark:text-amber-300 flex-1">
              <strong>{plannerDueToday} topic{plannerDueToday !== 1 ? "s" : ""}</strong> scheduled in your Study Planner today.
            </p>
            <Link href="/study-planner">
              <Button size="sm" variant="outline" className="h-7 text-xs shrink-0 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/30">
                Go to Planner
              </Button>
            </Link>
            <button
              onClick={dismissBanner}
              className="text-amber-500 hover:text-amber-700 dark:hover:text-amber-300 transition-colors shrink-0"
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Flashcard Decks", value: totalDecks, icon: Layers, hexColor: "#34d399", bgClass: "bg-emerald-500/10", glowRgb: "52,211,153" },
          { label: "Total Cards", value: totalCards, icon: FileText, hexColor: "#38bdf8", bgClass: "bg-sky-500/10", glowRgb: "56,189,248" },
          { label: "Question Banks", value: totalQbanks, icon: Stethoscope, hexColor: "#a78bfa", bgClass: "bg-violet-500/10", glowRgb: "167,139,250" },
          { label: "Study Streak", value: streak > 0 ? `${streak}d` : "—", icon: Flame, hexColor: "#fb923c", bgClass: "bg-orange-500/10", glowRgb: "251,146,60" },
        ].map(({ label, value, icon: Icon, hexColor, bgClass, glowRgb }, idx) => (
          <motion.div
            key={label}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 * idx, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            whileHover={{ y: -3, transition: { duration: 0.15 } }}
            className="h-full"
          >
            <div
              className="rounded-xl border bg-card/70 backdrop-blur-sm shadow-sm h-full hover:shadow-md transition-all overflow-hidden relative"
              style={{ boxShadow: `inset 0 0 0 1px rgba(${glowRgb},0.12)` }}
            >
              {/* Shimmer sweep on mount */}
              <motion.div
                aria-hidden
                className="absolute inset-0 pointer-events-none"
                style={{ background: "linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.12) 50%, transparent 70%)" }}
                initial={{ x: "-120%" }}
                animate={{ x: "160%" }}
                transition={{ delay: 0.3 + idx * 0.1, duration: 0.7, ease: "easeOut" }}
              />
              {/* Radial glow */}
              <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(circle at 15% 50%, rgba(${glowRgb},0.10) 0%, transparent 65%)` }} />
              <div className="p-4 flex flex-col gap-3 relative">
                <div className={`h-9 w-9 rounded-xl ${bgClass} flex items-center justify-center`} style={{ boxShadow: `0 0 10px rgba(${glowRgb},0.25)` }}>
                  <Icon className="h-4 w-4" style={{ color: hexColor }} />
                </div>
                <div>
                  {isLoading ? <Skeleton className="h-7 w-14" /> : <p className="text-2xl font-bold tracking-tight">{value}</p>}
                  <p className="text-xs text-muted-foreground font-medium mt-0.5">{label}</p>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Study performance stats bar */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.28, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        {hasStudied ? (
          <div className="relative rounded-xl border border-border/50 bg-card/70 backdrop-blur-sm shadow-sm overflow-hidden">
            <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(circle at 5% 50%, rgba(52,211,153,0.07) 0%, transparent 55%)" }} />
            <div className="flex flex-col sm:flex-row sm:items-stretch divide-y sm:divide-y-0 sm:divide-x divide-border/40">
              <div className="flex items-center gap-3 px-5 py-4 flex-1">
                <div className="h-9 w-9 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0" style={{ boxShadow: "0 0 12px rgba(52,211,153,0.25)" }}>
                  <Brain className="h-4 w-4 text-emerald-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold leading-none tabular-nums">{totalSessionCards.toLocaleString()}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">Cards studied all-time</p>
                </div>
              </div>
              <div className="flex items-center gap-3 px-5 py-4 flex-1">
                <div className="h-9 w-9 rounded-lg bg-orange-500/10 flex items-center justify-center shrink-0" style={{ boxShadow: "0 0 12px rgba(251,146,60,0.25)" }}>
                  <Flame className="h-4 w-4 text-orange-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold leading-none tabular-nums">{streak > 0 ? streak : "—"}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">Day streak</p>
                </div>
              </div>
              <div className="flex items-center gap-3 px-5 py-4 flex-1">
                <div className="h-9 w-9 rounded-lg bg-sky-500/10 flex items-center justify-center shrink-0" style={{ boxShadow: "0 0 12px rgba(56,189,248,0.25)" }}>
                  <CheckCircle2 className="h-4 w-4 text-sky-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold leading-none tabular-nums">{overallPct}%</p>
                  <p className="text-[11px] text-muted-foreground mt-1">Overall accuracy</p>
                </div>
              </div>
              <div className="flex flex-col justify-center gap-2 px-5 py-4 sm:min-w-[168px]">
                <p className="text-[11px] text-muted-foreground font-medium">7-day activity</p>
                <div className="flex items-end gap-1 h-8">
                  {last7.map((day, i) => {
                    const barH = day.total > 0 ? Math.max(4, Math.round((day.total / maxDay) * 28)) : 3;
                    const isLast = i === 6;
                    return (
                      <div
                        key={day.date}
                        className="flex-1 rounded-sm"
                        title={`${day.label}: ${day.total} cards`}
                        style={{
                          height: barH,
                          background: day.total > 0
                            ? isLast ? "rgb(52,211,153)" : "rgba(52,211,153,0.45)"
                            : "hsl(var(--border))",
                        }}
                      />
                    );
                  })}
                </div>
                <p className="text-[10px] text-muted-foreground">{last7.reduce((s, d) => s + d.total, 0)} this week</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border/50 bg-card/40 backdrop-blur-sm p-5 flex flex-col sm:flex-row items-center gap-4">
            <div className="h-10 w-10 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
              <Brain className="h-5 w-5 text-emerald-400/60" />
            </div>
            <div className="flex-1 text-center sm:text-left">
              <p className="text-sm font-semibold">Start studying to track your progress</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Your streak, accuracy, and 7-day activity will appear here once you study a deck.
              </p>
            </div>
            <Link href="/decks">
              <Button size="sm" variant="outline" className="gap-1.5 shrink-0">
                <Layers className="h-3.5 w-3.5" />
                Browse decks
              </Button>
            </Link>
          </div>
        )}
      </motion.div>

      {/* Knowledge Map */}
      {!isLoading && knowledgeMap.length > 0 && (
        <Card className="border-border/50 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Compass className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Knowledge Map</CardTitle>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">Mastery level per deck — click any to study</p>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-wrap gap-2">
              {knowledgeMap.map((d, idx) => {
                const { chip, dot } = masteryColor(d.pct);
                return (
                  <motion.div
                    key={d.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: idx * 0.03, duration: 0.25 }}
                  >
                    <Link href={`/decks/${d.id}`}>
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all hover:scale-105 cursor-pointer ${chip}`}>
                        <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dot}`} />
                        <span className="truncate max-w-[140px]">{d.name}</span>
                        {d.pct !== null && <span className="opacity-70 shrink-0">{d.pct}%</span>}
                      </span>
                    </Link>
                  </motion.div>
                );
              })}
            </div>
            <div className="flex items-center gap-4 mt-4 pt-3 border-t border-border/40">
              {[
                { dot: "bg-emerald-500", label: "≥80% mastered" },
                { dot: "bg-amber-500", label: "40–79%" },
                { dot: "bg-red-500", label: "<40%" },
                { dot: "bg-muted-foreground/40", label: "Not yet studied" },
              ].map(({ dot, label }) => (
                <div key={label} className="flex items-center gap-1.5">
                  <div className={`h-2 w-2 rounded-full ${dot}`} />
                  <span className="text-[10px] text-muted-foreground">{label}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Weekly Goal + Recommended Next */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Weekly Goal Ring */}
        <Card className="border-border/50 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                <Target className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold">Weekly Goal</p>
                <p className="text-xs text-muted-foreground">{thisWeekCards} / {weeklyGoal} cards this week</p>
              </div>
            </div>
            <div className="flex items-center gap-5">
              <div className="relative shrink-0">
                <svg width="88" height="88" viewBox="0 0 88 88">
                  <defs>
                    <linearGradient id="goalGradDash" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#34d399" />
                      <stop offset="100%" stopColor="#818cf8" />
                    </linearGradient>
                  </defs>
                  <circle cx="44" cy="44" r={RING_R} fill="none" stroke="currentColor" className="text-border/40" strokeWidth="8" />
                  <motion.circle
                    cx="44" cy="44" r={RING_R}
                    fill="none"
                    stroke="url(#goalGradDash)"
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={RING_C}
                    initial={{ strokeDashoffset: RING_C }}
                    animate={{ strokeDashoffset: RING_C * (1 - weeklyPct) }}
                    transition={{ duration: 1, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
                    transform="rotate(-90 44 44)"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-xl font-bold leading-none">{Math.round(weeklyPct * 100)}%</span>
                </div>
              </div>
              <div className="flex-1 space-y-3">
                <p className="text-sm text-muted-foreground">
                  {weeklyPct >= 1
                    ? "Goal reached this week!"
                    : `${weeklyGoal - thisWeekCards} cards to go`}
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={2000}
                    value={weeklyGoal}
                    onChange={e => {
                      const v = Math.max(1, Math.min(2000, parseInt(e.target.value) || 1));
                      setWeeklyGoalState(v);
                      setWeeklyGoal(v);
                    }}
                    className="h-7 w-20 rounded-md border border-border/60 bg-muted/30 px-2 text-sm text-center focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                  <span className="text-xs text-muted-foreground">cards / week</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Recommended Next */}
        {recommendedDeck ? (
          <Card className="border-border/50 shadow-sm bg-gradient-to-br from-primary/5 to-emerald-500/5">
            <CardContent className="p-5 h-full flex flex-col">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-8 w-8 rounded-md bg-emerald-500/15 flex items-center justify-center shrink-0">
                  <Trophy className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Recommended Next</p>
                  <p className="text-xs text-muted-foreground">Deck needing the most work</p>
                </div>
              </div>
              <div className="flex-1 space-y-3">
                <p className="font-medium text-sm leading-snug line-clamp-2">{recommendedDeck.deckName}</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] bg-red-500/10 text-red-600 dark:text-red-400 border border-red-400/20 rounded-md px-1.5 py-0.5 font-medium">
                    {recommendedDeck.pct}% known
                  </span>
                  {recommendedDeck.daysSince < 999 && (
                    <span className="text-[11px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-400/20 rounded-md px-1.5 py-0.5 font-medium">
                      {recommendedDeck.daysSince === 0 ? "studied today" : `${recommendedDeck.daysSince}d since last study`}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-2 rounded-full bg-border/60 overflow-hidden">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-red-500 to-amber-500"
                      initial={{ width: 0 }}
                      animate={{ width: `${recommendedDeck.pct}%` }}
                      transition={{ duration: 0.8, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
                    />
                  </div>
                </div>
                <Link href={`/study/${recommendedDeck.id}`}>
                  <Button size="sm" className="gap-1.5 mt-1 w-full">
                    <Play className="h-3.5 w-3.5" />
                    Start Study Session
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-border/50 shadow-sm border-dashed">
            <CardContent className="p-5 flex flex-col items-center justify-center text-center h-full min-h-[160px] gap-2">
              <Brain className="h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground font-medium">Study any deck to unlock recommendations</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Study stats section */}
      {hasStudied ? (
        <>
          {/* Today's progress + Overall */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="border-border/50 shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-8 w-8 rounded-md bg-violet-500/10 flex items-center justify-center shrink-0">
                    <Brain className="h-4 w-4 text-violet-500" />
                  </div>
                  <p className="text-sm font-medium text-muted-foreground">Studied Today</p>
                </div>
                <p className="text-3xl font-bold">{todayStats.cardsStudied}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {todayStats.cardsStudied > 0
                    ? `${todayStats.known} known · ${todayStats.cardsStudied - todayStats.known} still learning`
                    : "No cards studied yet today"}
                </p>
              </CardContent>
            </Card>

            <Card className="border-border/50 shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-8 w-8 rounded-md bg-green-500/10 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  </div>
                  <p className="text-sm font-medium text-muted-foreground">Overall Known</p>
                </div>
                <p className="text-3xl font-bold">{overallPct}%</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {totalKnown} of {totalSessionCards} cards across all sessions
                </p>
              </CardContent>
            </Card>

            <Card className="border-border/50 shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-8 w-8 rounded-md bg-blue-500/10 flex items-center justify-center shrink-0">
                    <BookOpen className="h-4 w-4 text-blue-500" />
                  </div>
                  <p className="text-sm font-medium text-muted-foreground">Total Sessions</p>
                </div>
                <p className="text-3xl font-bold">{sessions.length}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {totalSessionCards} cards reviewed in total
                </p>
              </CardContent>
            </Card>
          </div>

          {/* 7-day activity bar chart with hover tooltips */}
          <Card className="border-border/50 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">7-Day Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-2 h-28">
                {last7.map((day, idx) => {
                  const knownH = day.total > 0 ? Math.round((day.known / maxDay) * 96) : 0;
                  const unknownH = day.total > 0 ? Math.round(((day.total - day.known) / maxDay) * 96) : 0;
                  const isEmpty = day.total === 0;
                  const knownPct = day.total > 0 ? Math.round((day.known / day.total) * 100) : 0;
                  return (
                    <div key={day.date} className="flex-1 flex flex-col items-center gap-1 group/bar relative">
                      {/* Hover tooltip */}
                      <div className="absolute -top-14 left-1/2 -translate-x-1/2 z-20 hidden group-hover/bar:block pointer-events-none">
                        <div className="bg-popover border border-border/60 rounded-lg px-2.5 py-2 shadow-lg text-center whitespace-nowrap">
                          <p className="text-[10px] font-semibold">{day.label}</p>
                          {day.total > 0 ? (
                            <>
                              <p className="text-[10px] text-muted-foreground">{day.total} cards</p>
                              <p className="text-[10px] text-emerald-600 dark:text-emerald-400">{knownPct}% known</p>
                            </>
                          ) : (
                            <p className="text-[10px] text-muted-foreground">No activity</p>
                          )}
                        </div>
                        <div className="mx-auto mt-0.5 w-2 h-2 border-r border-b border-border/60 bg-popover rotate-45 -translate-y-1" />
                      </div>

                      <div className="w-full flex flex-col-reverse items-stretch gap-0 cursor-pointer" style={{ height: 96 }}>
                        {isEmpty ? (
                          <div className="w-full rounded-sm bg-border/50" style={{ height: 4 }} />
                        ) : (
                          <>
                            <motion.div
                              className="w-full rounded-b-sm"
                              style={{ background: "linear-gradient(180deg,#4ade80,#16a34a)", minHeight: 2 }}
                              initial={{ height: 0 }}
                              animate={{ height: knownH }}
                              transition={{ duration: 0.6, delay: 0.3 + idx * 0.07, ease: [0.22, 1, 0.36, 1] }}
                            />
                            <motion.div
                              className="w-full rounded-t-sm"
                              style={{ background: "linear-gradient(180deg,#fb923c,#ea580c)", minHeight: 2 }}
                              initial={{ height: 0 }}
                              animate={{ height: unknownH }}
                              transition={{ duration: 0.6, delay: 0.3 + idx * 0.07, ease: [0.22, 1, 0.36, 1] }}
                            />
                          </>
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground leading-none">{day.label}</span>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center gap-4 mt-3">
                <div className="flex items-center gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-sm bg-green-500/80" />
                  <span className="text-xs text-muted-foreground">Known</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-sm bg-orange-500/80" />
                  <span className="text-xs text-muted-foreground">Still learning</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 8-week activity heatmap */}
          <Card className="border-border/50 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">8-Week Heatmap</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-1 overflow-x-auto pb-1">
                {heatmap.map((col, colIdx) => (
                  <div key={colIdx} className="flex flex-col gap-1 flex-1 min-w-[28px]">
                    {col.map((day, rowIdx) => {
                      if (!day) {
                        return <div key={rowIdx} className="aspect-square rounded-sm bg-transparent" />;
                      }
                      const intensity = day.total === 0 ? 0 : day.total <= 5 ? 1 : day.total <= 15 ? 2 : 3;
                      const knownPct = day.total > 0 ? Math.round((day.known / day.total) * 100) : 0;
                      const colorClass =
                        intensity === 0 ? "bg-muted/50 dark:bg-muted/30" :
                        intensity === 1 ? "bg-emerald-200 dark:bg-emerald-900/80" :
                        intensity === 2 ? "bg-emerald-400 dark:bg-emerald-600" :
                        "bg-emerald-600 dark:bg-emerald-400";
                      return (
                        <div key={rowIdx} className={`aspect-square rounded-sm cursor-default group/cell relative ${colorClass} hover:ring-1 hover:ring-emerald-400/60 transition-all`}>
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-20 hidden group-hover/cell:block pointer-events-none">
                            <div className="bg-popover border border-border/60 rounded-lg px-2.5 py-1.5 shadow-lg text-center whitespace-nowrap">
                              <p className="text-[10px] font-semibold">{day.label}</p>
                              {day.total > 0 ? (
                                <>
                                  <p className="text-[10px] text-muted-foreground">{day.total} cards studied</p>
                                  <p className="text-[10px] text-emerald-600 dark:text-emerald-400">{knownPct}% known</p>
                                </>
                              ) : (
                                <p className="text-[10px] text-muted-foreground">No activity</p>
                              )}
                            </div>
                            <div className="mx-auto w-2 h-2 border-r border-b border-border/60 bg-popover rotate-45 -mt-1.5" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 mt-3">
                <span className="text-[10px] text-muted-foreground">Less</span>
                {(["bg-muted/50 dark:bg-muted/30", "bg-emerald-200 dark:bg-emerald-900/80", "bg-emerald-400 dark:bg-emerald-600", "bg-emerald-600 dark:bg-emerald-400"] as const).map((cls, i) => (
                  <div key={i} className={`h-3 w-3 rounded-sm ${cls}`} />
                ))}
                <span className="text-[10px] text-muted-foreground">More</span>
              </div>
            </CardContent>
          </Card>

          {/* Study time sparkline */}
          <Card className="border-border/50 shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-md bg-sky-500/10 flex items-center justify-center shrink-0">
                    <Timer className="h-4 w-4 text-sky-500" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Study Time (14 days)</p>
                    <p className="text-xs text-muted-foreground">~{sparkline.totalMinutes} min estimated total</p>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">≈8 s / card</span>
              </div>
              <div className="w-full h-10">
                <svg width="100%" height="40" viewBox="0 0 100 32" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="sparkGrad" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.6" />
                      <stop offset="100%" stopColor="#34d399" stopOpacity="0.9" />
                    </linearGradient>
                    <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.3" />
                      <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {/* Fill area */}
                  <polyline
                    points={`0,30 ${sparkline.points} 100,30`}
                    fill="url(#sparkFill)"
                    stroke="none"
                  />
                  {/* Line */}
                  <polyline
                    points={sparkline.points}
                    fill="none"
                    stroke="url(#sparkGrad)"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-[10px] text-muted-foreground">14 days ago</span>
                <span className="text-[10px] text-muted-foreground">Today</span>
              </div>
            </CardContent>
          </Card>

          {/* Strongest / Weakest topics */}
          {hasStudied && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Strongest */}
              <Card className="border-border/50 shadow-sm">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-emerald-500" />
                    <CardTitle className="text-sm text-emerald-700 dark:text-emerald-400">Strongest Topics</CardTitle>
                    <span className="text-[10px] text-muted-foreground ml-auto">last 28 days</span>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 space-y-3">
                  {strongest.length > 0 ? strongest.map((d, i) => (
                    <div key={d.id} className="flex items-center gap-3">
                      <span className="text-[11px] font-bold text-muted-foreground/60 w-4 shrink-0">#{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{d.deckName}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <div className="flex-1 h-1.5 rounded-full bg-border/60 overflow-hidden">
                            <div className="h-full rounded-full bg-emerald-500/80" style={{ width: `${d.pct}%` }} />
                          </div>
                          <span className="text-[10px] text-muted-foreground shrink-0">{d.pct}%</span>
                        </div>
                      </div>
                    </div>
                  )) : (
                    <p className="text-xs text-muted-foreground py-2">No recent activity in the last 28 days.</p>
                  )}
                </CardContent>
              </Card>

              {/* Weakest */}
              <Card className="border-border/50 shadow-sm">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <TrendingDown className="h-4 w-4 text-red-500" />
                    <CardTitle className="text-sm text-red-700 dark:text-red-400">Needs Work</CardTitle>
                    <span className="text-[10px] text-muted-foreground ml-auto">last 28 days</span>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 space-y-3">
                  {weakest.length > 0 ? weakest.map((d, i) => (
                    <Link key={d.id} href={`/study/${d.id}`}>
                      <div className="flex items-center gap-3 group cursor-pointer rounded-md p-1 -m-1 hover:bg-muted/50 transition-colors">
                        <span className="text-[11px] font-bold text-muted-foreground/60 w-4 shrink-0">#{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate group-hover:text-primary transition-colors">{d.deckName}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <div className="flex-1 h-1.5 rounded-full bg-border/60 overflow-hidden">
                              <div className="h-full rounded-full bg-red-500/80" style={{ width: `${d.pct}%` }} />
                            </div>
                            <span className="text-[10px] text-muted-foreground shrink-0">{d.pct}%</span>
                          </div>
                        </div>
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0 group-hover:text-primary transition-colors" />
                      </div>
                    </Link>
                  )) : (
                    <p className="text-xs text-muted-foreground py-2">No recent activity in the last 28 days.</p>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Per-deck stats */}
          {deckStatsList.length > 0 && (
            <Card className="border-border/50 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Deck Progress</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {deckStatsList.map(d => (
                  <div key={d.id}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium truncate max-w-[60%]">{d.deckName}</span>
                      <span className="text-sm text-muted-foreground shrink-0">
                        {d.pct}% known · {d.total} cards
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-border/60 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-green-500 transition-all duration-500"
                        style={{ width: `${d.pct}%` }}
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Recent sessions */}
          {recentSessions.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold tracking-tight mb-3">Recent Sessions</h2>
              <div className="space-y-2">
                {recentSessions.map(s => (
                  <Card key={s.id} className="border-border/50 shadow-sm">
                    <CardContent className="flex items-center gap-4 py-3 px-4">
                      <div className="h-9 w-9 rounded-md bg-violet-500/10 flex items-center justify-center shrink-0">
                        <Brain className="h-4 w-4 text-violet-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{s.deckName}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(s.completedAt), "MMM d 'at' h:mm a")}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 text-xs">
                        <span className="font-medium text-green-600 bg-green-500/10 px-2 py-0.5 rounded-md">
                          {s.known} ✓
                        </span>
                        <span className="font-medium text-orange-600 bg-orange-500/10 px-2 py-0.5 rounded-md">
                          {s.unknown} ✗
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <Card className="border-border/50 shadow-sm">
          <CardContent className="text-center py-10">
            <Brain className="mx-auto h-10 w-10 text-muted-foreground opacity-40 mb-3" />
            <p className="font-medium text-muted-foreground">No study sessions yet</p>
            <p className="text-sm text-muted-foreground mt-1 mb-4">
              Open a deck and hit <span className="font-medium text-foreground">Study</span> to start tracking your progress.
            </p>
            <Link href="/decks">
              <Button size="sm" variant="outline" className="gap-2">
                <Layers className="h-4 w-4" />
                Browse Library
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Due today widget */}
      {dueNowCount > 0 && (
        <Link href="/study/due">
          <Card className="border-amber-400/40 dark:border-amber-600/30 bg-amber-500/5 shadow-sm hover:border-amber-500/60 hover:shadow-md transition-all cursor-pointer group">
            <CardContent className="flex items-center gap-4 p-5">
              <div className="h-10 w-10 rounded-full bg-amber-500/15 flex items-center justify-center shrink-0 group-hover:bg-amber-500/25 transition-colors">
                <CalendarClock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-amber-800 dark:text-amber-200">
                  {dueNowCount} card{dueNowCount !== 1 ? "s" : ""} due for review
                </p>
                <p className="text-sm text-amber-700/70 dark:text-amber-400/70">Review due cards across all decks</p>
              </div>
              <ChevronRight className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
            </CardContent>
          </Card>
        </Link>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link href="/generate">
          <Card className="border-border/50 shadow-sm hover:border-primary/40 hover:shadow-md transition-all cursor-pointer group">
            <CardContent className="flex items-center gap-4 p-5">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold">Generate New Decks</p>
                <p className="text-sm text-muted-foreground">Upload files or paste text to create flashcards</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </CardContent>
          </Card>
        </Link>
        <Link href="/decks">
          <Card className="border-border/50 shadow-sm hover:border-primary/40 hover:shadow-md transition-all cursor-pointer group">
            <CardContent className="flex items-center gap-4 p-5">
              <div className="h-10 w-10 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0 group-hover:bg-blue-500/20 transition-colors">
                <Layers className="h-5 w-5 text-blue-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold">Browse Library</p>
                <p className="text-sm text-muted-foreground">View, edit, and export all your decks</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Deck library with search + tag filter */}
      {allDecks.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold tracking-tight">
              {isFiltering ? "Decks" : "Recent Decks"}
            </h2>
            {!isFiltering && totalDecks > 5 && (
              <Link href="/decks">
                <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground">
                  View all <ChevronRight className="h-3 w-3" />
                </Button>
              </Link>
            )}
          </div>

          {/* Search bar */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name or tag…"
              className="pl-9 h-9"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Tag filter chips */}
          {allUniqueTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {allUniqueTags.map(tag => (
                <button
                  key={tag}
                  onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${
                    tagFilter === tag
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "bg-muted/60 border-border/50 text-muted-foreground hover:bg-muted hover:text-foreground hover:border-primary/30"
                  }`}
                >
                  <Tag className="h-2.5 w-2.5" />
                  {tag}
                  {tagFilter === tag && <X className="h-2.5 w-2.5 ml-0.5" />}
                </button>
              ))}
            </div>
          )}

          {displayedDecks.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm rounded-xl border border-dashed border-border/50">
              No decks match your search.
            </div>
          ) : (
            <div className="space-y-2">
              {displayedDecks.map((deck, idx) => {
                const ds = deckStats.get(deck.id);
                const deckPct = ds && ds.total > 0 ? Math.round((ds.known / ds.total) * 100) : null;
                const lastStudied = lastStudiedByDeck.get(deck.id);
                const { chip } = masteryColor(deckPct);
                const tags = allDeckTags.get(deck.id) ?? [];
                const isEditingTags = tagEditDeckId === deck.id;
                return (
                  <Link key={deck.id} href={`/decks/${deck.id}`}>
                    <Card
                      className="border-border/50 shadow-sm hover:border-primary/40 hover:shadow-md transition-all cursor-pointer animate-in fade-in slide-in-from-bottom-2"
                      style={{ animationDelay: `${idx * 40}ms` }}
                    >
                      <CardContent className="flex items-center gap-4 py-3 px-4">
                        <div className="h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                          <Layers className="h-4 w-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{deck.name}</p>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
                            <p className="text-xs text-muted-foreground">
                              {lastStudied ? `Studied ${relativeDate(lastStudied)}` : "Not studied yet"}
                            </p>
                            {deckPct !== null && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${chip}`}>
                                {deckPct}% known
                              </span>
                            )}
                          </div>
                          {/* Tag chips + inline tag editor */}
                          <div
                            className="flex items-center gap-1 flex-wrap mt-1.5"
                            onClick={e => e.preventDefault()}
                          >
                            {tags.map(tag => (
                              <span
                                key={tag}
                                onClick={e => { e.preventDefault(); e.stopPropagation(); setTagFilter(tag === tagFilter ? null : tag); }}
                                className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-primary/8 text-primary border border-primary/20 cursor-pointer hover:bg-primary/15 transition-colors"
                              >
                                {tag}
                                <button
                                  onClick={e => { e.preventDefault(); e.stopPropagation(); removeDeckTag(deck.id, tag); }}
                                  className="ml-0.5 opacity-50 hover:opacity-100 hover:text-destructive transition-opacity"
                                >
                                  <X className="h-2 w-2" />
                                </button>
                              </span>
                            ))}
                            {isEditingTags ? (
                              <input
                                autoFocus
                                value={tagInput}
                                onChange={e => setTagInput(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === "Enter" && tagInput.trim()) {
                                    e.preventDefault();
                                    addDeckTag(deck.id, tagInput.trim());
                                    setTagInput("");
                                  } else if (e.key === "Escape") {
                                    setTagEditDeckId(null);
                                    setTagInput("");
                                  }
                                }}
                                onBlur={() => { setTagEditDeckId(null); setTagInput(""); }}
                                placeholder="Tag name…"
                                className="text-[10px] h-5 w-20 px-1.5 rounded-full border border-primary/30 bg-background/80 outline-none focus:ring-1 focus:ring-primary/30"
                              />
                            ) : (
                              <button
                                onClick={e => { e.preventDefault(); e.stopPropagation(); setTagEditDeckId(deck.id); setTagInput(""); }}
                                className="text-[10px] px-1.5 py-0.5 rounded-full border border-dashed border-muted-foreground/25 text-muted-foreground/60 hover:border-primary/40 hover:text-primary transition-colors"
                              >
                                + tag
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {(recentDeckDueCounts.get(deck.id) ?? 0) > 0 && (
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 shrink-0">
                              {recentDeckDueCounts.get(deck.id)} to review
                            </span>
                          )}
                          <span className="text-sm font-medium text-primary bg-primary/10 px-2.5 py-1 rounded-md">
                            {deck.cardCount} {deck.cardCount === 1 ? "card" : "cards"}
                          </span>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
              {!isFiltering && totalDecks > 5 && (
                <div className="text-center pt-1">
                  <Link href="/decks">
                    <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground">
                      View all {totalDecks} decks <ChevronRight className="h-3 w-3" />
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <FeaturesShowcase />
      <AppDownloads />
    </div>
  );
}
