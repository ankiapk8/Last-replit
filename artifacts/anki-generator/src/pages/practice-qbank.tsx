import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { Link, useRoute } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import { AmbientOrbs } from "@/components/ambient-orbs";
import { useGetQbank, useListQbankQuestions } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft, Check, X, ChevronRight, ChevronLeft, Trophy,
  RotateCcw, Stethoscope, BookOpen, Target, Sparkles,
  Clock, Bookmark, BookmarkCheck, Eye, AlertCircle, Flag,
  Filter, Play, BarChart2, Zap,
} from "lucide-react";
import {
  saveSession,
  saveQBankSession,
  getQBankSessions,
  markSeen,
  getFlaggedIds,
  toggleFlagged,
  getSeenIds,
  getWrongIds,
  getTopicBreakdown,
  type QBankQuestionResult,
} from "@/lib/study-stats";
import type { Question } from "@workspace/api-client-react";

const LETTER = ["A", "B", "C", "D", "E", "F"];

const LETTER_BG: Record<string, string> = {
  A: "bg-sky-500", B: "bg-orange-500", C: "bg-purple-500",
  D: "bg-pink-500", E: "bg-teal-500", F: "bg-amber-500",
};

function parseTags(tags?: string | null): string[] {
  if (!tags) return [];
  try {
    const parsed = JSON.parse(tags);
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
  } catch {}
  return tags.split(",").map(t => t.trim()).filter(Boolean);
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function getGrade(pct: number) {
  if (pct >= 0.9) return { label: "Excellent", color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500" };
  if (pct >= 0.75) return { label: "Good", color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-500" };
  if (pct >= 0.6) return { label: "Fair", color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500" };
  return { label: "Needs Work", color: "text-rose-600 dark:text-rose-400", bg: "bg-rose-500" };
}

const RING_R = 52;
const RING_C = 2 * Math.PI * RING_R;

type FilterMode = "all" | "unseen" | "wrong" | "flagged";

type Answer = {
  questionIndex: number;
  selectedIndex: number;
  correct: boolean;
  timeSeconds: number;
};

type SessionConfig = {
  filterMode: FilterMode;
  timed: boolean;
  secondsPerQuestion: number;
};

const cardVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? 72 : -72, opacity: 0, scale: 0.97 }),
  center: { x: 0, opacity: 1, scale: 1, transition: { type: "spring" as const, stiffness: 340, damping: 30 } },
  exit: (dir: number) => ({ x: dir < 0 ? 72 : -72, opacity: 0, scale: 0.97, transition: { duration: 0.18, ease: "easeIn" as const } }),
};

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.07, delayChildren: 0.1 } } };
const fadeUp = { hidden: { y: 22, opacity: 0 }, show: { y: 0, opacity: 1, transition: { type: "spring" as const, stiffness: 300, damping: 26 } } };

const filterLabel: Record<FilterMode, string> = {
  all: "All Questions",
  unseen: "Unseen Only",
  wrong: "Wrong Answers",
  flagged: "Flagged",
};

// ─── Pre-session Config Screen ─────────────────────────────────────────────

function PreSessionConfig({
  questions,
  qbankId,
  qbankName,
  onStart,
}: {
  questions: Question[];
  qbankId: number;
  qbankName: string;
  onStart: (config: SessionConfig, filtered: Question[]) => void;
}) {
  const [activeTab, setActiveTab] = useState<"setup" | "history">("setup");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [timed, setTimed] = useState(false);
  const [secondsPerQuestion, setSecondsPerQuestion] = useState(30);
  const pastSessions = useMemo(() => getQBankSessions(qbankId), [qbankId]);

  const { seenIds, wrongIds, flaggedIds } = useMemo(() => ({
    seenIds: getSeenIds(qbankId),
    wrongIds: getWrongIds(qbankId),
    flaggedIds: getFlaggedIds(qbankId),
  }), [qbankId]);

  const counts = useMemo(() => ({
    all: questions.length,
    unseen: questions.filter(q => !seenIds.has(q.id)).length,
    wrong: questions.filter(q => wrongIds.has(q.id)).length,
    flagged: questions.filter(q => flaggedIds.has(q.id)).length,
  }), [questions, seenIds, wrongIds, flaggedIds]);

  const filteredQuestions = useMemo(() => {
    let pool: Question[];
    if (filterMode === "unseen") pool = questions.filter(q => !seenIds.has(q.id));
    else if (filterMode === "wrong") pool = questions.filter(q => wrongIds.has(q.id));
    else if (filterMode === "flagged") pool = questions.filter(q => flaggedIds.has(q.id));
    else pool = [...questions];
    // Shuffle
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool;
  }, [filterMode, questions, seenIds, wrongIds, flaggedIds]);

  const filterOptions: { mode: FilterMode; label: string; icon: React.ReactNode; desc: string }[] = [
    { mode: "all", label: "All Questions", icon: <BarChart2 className="h-4 w-4" />, desc: "Practice the full question bank" },
    { mode: "unseen", label: "Unseen Only", icon: <Eye className="h-4 w-4" />, desc: "Questions you haven't attempted yet" },
    { mode: "wrong", label: "Wrong Answers", icon: <AlertCircle className="h-4 w-4" />, desc: "Questions you got wrong more than right" },
    { mode: "flagged", label: "Flagged", icon: <Flag className="h-4 w-4" />, desc: "Questions you bookmarked for review" },
  ];

  const canStart = filteredQuestions.length > 0;

  return (
    <motion.div
      className="relative min-h-screen flex flex-col pb-10"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <AmbientOrbs color="hsl(262 84% 68% / 0.08)" />
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-md border-b border-border/50">
        <div className="px-4 py-3 flex items-center gap-3">
          <Link href={`/qbanks/${qbankId}`}>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex items-center gap-2 min-w-0">
            <Stethoscope className="h-4 w-4 text-violet-500 shrink-0" />
            <span className="font-semibold text-sm truncate bg-gradient-to-r from-violet-500 to-purple-500 bg-clip-text text-transparent">{qbankName}</span>
          </div>
          <Badge className="ml-auto shrink-0 bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/20">
            {activeTab === "setup" ? <><Filter className="h-3 w-3 mr-1" />Setup</> : <><Clock className="h-3 w-3 mr-1" />History</>}
          </Badge>
        </div>
        <div className="px-4 pb-2.5 flex gap-1.5">
          {(["setup", "history"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                activeTab === tab
                  ? "bg-violet-500 text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              {tab === "setup" ? "Setup" : `History${pastSessions.length > 0 ? ` (${pastSessions.length})` : ""}`}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "history" ? (
        <div className="flex-1 px-4 py-6 max-w-lg mx-auto w-full">
          {pastSessions.length === 0 ? (
            <div className="text-center py-16">
              <Clock className="mx-auto h-10 w-10 text-muted-foreground opacity-30 mb-3" />
              <p className="font-medium text-muted-foreground">No sessions yet</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Complete a practice session to see it here.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {pastSessions.map(session => {
                const correct = session.results.filter(r => r.correct).length;
                const total = session.results.length;
                const pct = total > 0 ? correct / total : 0;
                const grade = getGrade(pct);
                const date = new Date(session.completedAt);
                return (
                  <div key={session.id} className="rounded-xl border border-border/50 bg-card/60 p-3.5 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-xl font-bold font-serif ${grade.color}`}>{Math.round(pct * 100)}%</span>
                          <span className="text-xs text-muted-foreground">{correct}/{total} correct</span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="text-xs text-muted-foreground">{filterLabel[session.filterMode]}</span>
                          {session.timed && session.totalSeconds > 0 && (
                            <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                              <Clock className="h-3 w-3" />{formatTime(session.totalSeconds)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-medium">{date.toLocaleDateString()}</p>
                        <p className="text-xs text-muted-foreground/70">{date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                        <span className={`inline-block text-[10px] font-bold mt-0.5 px-1.5 py-0.5 rounded ${grade.color}`}>{grade.label}</span>
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
                      <div className={`h-full rounded-full ${grade.bg}`} style={{ width: `${Math.round(pct * 100)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
      <div className="flex-1 px-4 py-6 max-w-lg mx-auto w-full space-y-6">
        {/* Title */}
        <div className="text-center space-y-1.5 pt-2">
          <div className="h-14 w-14 rounded-2xl bg-violet-500/10 flex items-center justify-center mx-auto border border-violet-500/20">
            <Stethoscope className="h-7 w-7 text-violet-600 dark:text-violet-400" />
          </div>
          <h1 className="text-xl font-serif font-bold">{qbankName}</h1>
          <p className="text-sm text-muted-foreground">{questions.length} MCQ question{questions.length !== 1 ? "s" : ""} total</p>
        </div>

        {/* Filter */}
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground px-1">Question Filter</p>
          <div className="grid grid-cols-1 gap-2">
            {filterOptions.map(opt => {
              const count = counts[opt.mode];
              const active = filterMode === opt.mode;
              return (
                <button
                  key={opt.mode}
                  onClick={() => setFilterMode(opt.mode)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all duration-150 ${
                    active
                      ? "border-violet-500/60 bg-violet-500/8 shadow-sm"
                      : "border-border/50 bg-card/60 hover:border-violet-400/30 hover:bg-violet-500/4"
                  }`}
                >
                  <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                    active ? "bg-violet-500 text-white" : "bg-muted text-muted-foreground"
                  }`}>
                    {opt.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold ${active ? "text-violet-700 dark:text-violet-300" : "text-foreground"}`}>
                      {opt.label}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                  </div>
                  <span className={`shrink-0 text-sm font-bold px-2 py-0.5 rounded-lg ${
                    active
                      ? count > 0 ? "bg-violet-500/20 text-violet-700 dark:text-violet-300" : "bg-muted text-muted-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Timed mode */}
        <div className="rounded-xl border border-border/50 bg-card/60 p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-sm font-semibold">Timed Exam Mode</p>
                <p className="text-xs text-muted-foreground">Countdown timer with auto-submit</p>
              </div>
            </div>
            <Switch id="timed" checked={timed} onCheckedChange={setTimed} />
          </div>

          <AnimatePresence>
            {timed && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="pt-2 border-t border-border/40">
                  <Label className="text-xs text-muted-foreground mb-2 block">Seconds per question</Label>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline" size="icon" className="h-8 w-8 shrink-0"
                      onClick={() => setSecondsPerQuestion(s => Math.max(10, s - 5))}
                    >−</Button>
                    <div className="flex-1 text-center">
                      <span className="text-2xl font-bold font-serif text-amber-600 dark:text-amber-400">{secondsPerQuestion}</span>
                      <span className="text-sm text-muted-foreground ml-1">sec</span>
                    </div>
                    <Button
                      variant="outline" size="icon" className="h-8 w-8 shrink-0"
                      onClick={() => setSecondsPerQuestion(s => Math.min(180, s + 5))}
                    >+</Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2 text-center">
                    ≈ {filteredQuestions.length > 0
                      ? formatTime(secondsPerQuestion * filteredQuestions.length)
                      : "?"} total for {filteredQuestions.length} question{filteredQuestions.length !== 1 ? "s" : ""}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Start button */}
        {!canStart && (
          <p className="text-center text-sm text-muted-foreground py-2">
            No questions match this filter. Choose a different option.
          </p>
        )}
        <Button
          className="w-full h-13 text-base font-semibold bg-violet-600 hover:bg-violet-700 text-white gap-2.5 shadow-lg shadow-violet-500/20"
          disabled={!canStart}
          onClick={() => onStart({ filterMode, timed, secondsPerQuestion }, filteredQuestions)}
        >
          <Play className="h-5 w-5" />
          Start{timed ? " Timed Exam" : " Practice"} · {filteredQuestions.length} Q{filteredQuestions.length !== 1 ? "s" : ""}
          {timed && <span className="text-violet-200">· {secondsPerQuestion}s/Q</span>}
        </Button>
      </div>
      )}
    </motion.div>
  );
}

// ─── Results View ───────────────────────────────────────────────────────────

function ResultsView({
  questions,
  answers,
  qbankName,
  qbankId,
  totalSeconds,
  filterMode,
  timed,
  onReset,
}: {
  questions: Question[];
  answers: Answer[];
  qbankName: string;
  qbankId: number;
  totalSeconds: number;
  filterMode: FilterMode;
  timed: boolean;
  onReset: () => void;
}) {
  const correct = answers.filter(a => a.correct).length;
  const total = answers.length;
  const pct = total > 0 ? correct / total : 0;
  const grade = getGrade(pct);
  const ringOffset = RING_C * (1 - pct);
  const avgTime = total > 0 ? Math.round(totalSeconds / total) : 0;

  const topicBreakdown = useMemo(() => {
    const results: QBankQuestionResult[] = answers.map(a => ({
      questionId: questions[a.questionIndex]?.id ?? 0,
      selectedIndex: a.selectedIndex,
      correct: a.correct,
      timeSeconds: a.timeSeconds,
      tags: parseTags(questions[a.questionIndex]?.tags),
    }));
    return getTopicBreakdown(results).slice(0, 8);
  }, [answers, questions]);

  const wrongAnswers = answers.filter(a => !a.correct);
  const [wrongsOpen, setWrongsOpen] = useState(true);

  useEffect(() => {
    if (pct >= 0.75) {
      const burst = (x: number) => confetti({
        particleCount: pct >= 0.9 ? 90 : 55,
        spread: 72,
        startVelocity: 42,
        origin: { x, y: 0.55 },
        colors: ["#7c3aed", "#8b5cf6", "#a78bfa", "#c4b5fd", "#ede9fe"],
        scalar: 1.05,
        ticks: 220,
      });
      setTimeout(() => burst(0.25), 300);
      setTimeout(() => burst(0.75), 460);
      if (pct >= 0.9) setTimeout(() => burst(0.5), 650);
    }
  }, []);

  const [showAll, setShowAll] = useState(false);

  return (
    <motion.div
      className="relative min-h-screen flex flex-col pb-10"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35 }}
    >
      <AmbientOrbs color="hsl(262 84% 68% / 0.08)" />
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-md border-b border-border/50 px-4 py-3 flex items-center gap-3">
        <Link href={`/qbanks/${qbankId}`}>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex items-center gap-2 min-w-0">
          <Stethoscope className="h-4 w-4 text-violet-500 shrink-0" />
          <span className="font-semibold text-sm truncate bg-gradient-to-r from-violet-500 to-purple-500 bg-clip-text text-transparent">{qbankName}</span>
        </div>
        <Badge className="ml-auto shrink-0 bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/20">
          Results
        </Badge>
      </div>

      <div className="flex-1 px-4 py-8 max-w-lg mx-auto w-full">
        <motion.div className="space-y-6" variants={stagger} initial="hidden" animate="show">

          {/* Score ring */}
          <motion.div variants={fadeUp} className="flex flex-col items-center gap-3 pt-2">
            <div className="relative">
              <svg viewBox="0 0 120 120" width={148} height={148}>
                <circle cx={60} cy={60} r={RING_R} fill="none" stroke="currentColor" strokeWidth={9} className="text-muted/25" />
                <motion.circle
                  cx={60} cy={60} r={RING_R}
                  fill="none" stroke="currentColor" strokeWidth={9} strokeLinecap="round"
                  strokeDasharray={RING_C}
                  initial={{ strokeDashoffset: RING_C }}
                  animate={{ strokeDashoffset: ringOffset }}
                  transition={{ duration: 1.1, ease: "easeOut", delay: 0.25 }}
                  transform="rotate(-90 60 60)"
                  className={grade.bg.replace("bg-", "text-")}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <motion.span
                  className="text-3xl font-bold font-serif text-foreground leading-none"
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.5, type: "spring", stiffness: 260, damping: 20 }}
                >
                  {Math.round(pct * 100)}%
                </motion.span>
                <span className="text-xs text-muted-foreground mt-0.5">{correct}/{total}</span>
              </div>
            </div>
            <div className="text-center space-y-1">
              <p className={`text-xl font-bold font-serif ${grade.color}`}>{grade.label}</p>
              <p className="text-sm text-muted-foreground">
                {correct} correct · {total - correct} wrong · {total} questions
              </p>
              <div className="flex items-center justify-center gap-2 flex-wrap mt-1">
                {totalSeconds > 0 && (
                  <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${timed ? "text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-200/50 dark:border-amber-700/40" : "text-muted-foreground bg-muted/50"}`}>
                    <Clock className="h-3 w-3" /> {formatTime(totalSeconds)}
                  </span>
                )}
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">
                  {filterLabel[filterMode]}
                </span>
              </div>
            </div>
          </motion.div>

          {/* Stat cards */}
          <motion.div variants={fadeUp} className="grid grid-cols-3 gap-3">
            {[
              { label: "Correct", value: correct, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10 border-emerald-200 dark:border-emerald-800/50" },
              { label: "Wrong", value: total - correct, color: "text-rose-600 dark:text-rose-400", bg: "bg-rose-500/10 border-rose-200 dark:border-rose-800/50" },
              timed
                ? { label: "Avg / Q", value: formatTime(avgTime), color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10 border-amber-200 dark:border-amber-800/50" }
                : { label: "Accuracy", value: `${Math.round(pct * 100)}%`, color: grade.color, bg: "bg-muted/40 border-border/60" },
            ].map(s => (
              <div key={s.label} className={`rounded-xl border p-3.5 text-center ${s.bg}`}>
                <p className={`text-2xl font-bold font-serif ${s.color}`}>{s.value}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5 font-medium uppercase tracking-wider">{s.label}</p>
              </div>
            ))}
          </motion.div>

          {/* Topic breakdown */}
          {topicBreakdown.length > 0 && (
            <motion.div variants={fadeUp} className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-px flex-1 bg-border/50" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-2">Topic Breakdown</span>
                <div className="h-px flex-1 bg-border/50" />
              </div>
              <div className="space-y-2">
                {topicBreakdown.map(t => (
                  <div key={t.topic} className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-foreground truncate max-w-[60%]">{t.topic}</span>
                      <span className={`text-xs font-bold ${t.pct >= 0.75 ? "text-emerald-600 dark:text-emerald-400" : t.pct >= 0.5 ? "text-amber-600 dark:text-amber-400" : "text-rose-600 dark:text-rose-400"}`}>
                        {t.correct}/{t.total} · {Math.round(t.pct * 100)}%
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
                      <motion.div
                        className={`h-full rounded-full ${t.pct >= 0.75 ? "bg-emerald-500" : t.pct >= 0.5 ? "bg-amber-500" : "bg-rose-500"}`}
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.round(t.pct * 100)}%` }}
                        transition={{ duration: 0.7, ease: "easeOut", delay: 0.1 }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Actions */}
          <motion.div variants={fadeUp} className="flex gap-3">
            <Button variant="outline" className="flex-1 gap-2 h-11" onClick={onReset}>
              <RotateCcw className="h-4 w-4" /> Practice Again
            </Button>
            <Link href={`/qbanks/${qbankId}`} className="flex-1">
              <Button className="w-full gap-2 h-11 bg-violet-600 hover:bg-violet-700 text-white">
                <BookOpen className="h-4 w-4" /> Back to QBank
              </Button>
            </Link>
          </motion.div>

          {/* Wrong answer review */}
          {wrongAnswers.length > 0 && (
            <motion.div variants={fadeUp} className="space-y-2">
              <button
                onClick={() => setWrongsOpen(o => !o)}
                className="w-full flex items-center gap-2 py-1 group"
              >
                <div className="h-px flex-1 bg-border/50" />
                <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-2 group-hover:text-foreground transition-colors">
                  Wrong Answers ({wrongAnswers.length})
                  <ChevronRight className={`h-3 w-3 transition-transform ${wrongsOpen ? "rotate-90" : ""}`} />
                </span>
                <div className="h-px flex-1 bg-border/50" />
              </button>
              <AnimatePresence initial={false}>
              {wrongsOpen && wrongAnswers.map((ans, i) => {
                const q = questions[ans.questionIndex];
                if (!q) return null;
                const choices = q.choices ?? [];
                const timedOut = ans.selectedIndex === -1;
                return (
                  <motion.div key={i} variants={fadeUp} className={`rounded-xl border p-3.5 ${timedOut ? "border-amber-200 dark:border-amber-800/50 bg-amber-500/5" : "border-rose-200 dark:border-rose-800/50 bg-rose-500/5"}`}>
                    <div className="flex items-start gap-3">
                      <div className={`h-5 w-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${timedOut ? "bg-amber-500" : "bg-rose-500"}`}>
                        {timedOut ? <Clock className="h-3 w-3 text-white" /> : <X className="h-3 w-3 text-white stroke-[3]" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground leading-snug line-clamp-2">{q.front}</p>
                        <div className="flex flex-col gap-1 mt-1.5">
                          {timedOut ? (
                            <span className="text-xs text-amber-600 dark:text-amber-400">Time expired — no answer given</span>
                          ) : choices[ans.selectedIndex] ? (
                            <span className="text-xs text-rose-600 dark:text-rose-400">
                              Your answer: {LETTER[ans.selectedIndex]}. {choices[ans.selectedIndex]}
                            </span>
                          ) : null}
                          {choices[(q.correctIndex ?? 0)] && (
                            <span className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                              Correct: {LETTER[q.correctIndex ?? 0]}. {choices[q.correctIndex ?? 0]}
                            </span>
                          )}
                          {q.back && (
                            <span className="text-xs text-muted-foreground mt-1 italic leading-relaxed">{q.back}</span>
                          )}
                        </div>
                      </div>
                      <span className={`shrink-0 text-xs font-bold px-1.5 py-0.5 rounded ${timedOut ? "bg-amber-500/15 text-amber-700 dark:text-amber-400" : "bg-rose-500/15 text-rose-700 dark:text-rose-400"}`}>
                        Q{i + 1}
                      </span>
                    </div>
                  </motion.div>
                );
              })}
              </AnimatePresence>
            </motion.div>
          )}

          {/* All-questions breakdown */}
          <motion.div variants={fadeUp} className="space-y-2">
            <button
              onClick={() => setShowAll(o => !o)}
              className="w-full flex items-center gap-2 py-1 group"
            >
              <div className="h-px flex-1 bg-border/50" />
              <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-2 group-hover:text-foreground transition-colors">
                All Questions ({answers.length})
                <ChevronRight className={`h-3 w-3 transition-transform ${showAll ? "rotate-90" : ""}`} />
              </span>
              <div className="h-px flex-1 bg-border/50" />
            </button>
            <AnimatePresence initial={false}>
              {showAll && answers.map((ans, i) => {
                const q = questions[ans.questionIndex];
                if (!q) return null;
                const choices = q.choices ?? [];
                const timedOut = ans.selectedIndex === -1;
                return (
                  <motion.div key={i} variants={fadeUp} className={`rounded-xl border p-3.5 ${
                    ans.correct
                      ? "border-emerald-200 dark:border-emerald-800/50 bg-emerald-500/5"
                      : timedOut
                      ? "border-amber-200 dark:border-amber-800/50 bg-amber-500/5"
                      : "border-rose-200 dark:border-rose-800/50 bg-rose-500/5"
                  }`}>
                    <div className="flex items-start gap-3">
                      <div className={`h-5 w-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${ans.correct ? "bg-emerald-500" : timedOut ? "bg-amber-500" : "bg-rose-500"}`}>
                        {ans.correct
                          ? <Check className="h-3 w-3 text-white stroke-[3]" />
                          : timedOut
                          ? <Clock className="h-3 w-3 text-white" />
                          : <X className="h-3 w-3 text-white stroke-[3]" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground leading-snug line-clamp-2">{q.front}</p>
                        <div className="flex flex-col gap-1 mt-1.5">
                          {ans.correct ? (
                            <span className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                              {LETTER[q.correctIndex ?? 0]}. {choices[q.correctIndex ?? 0]}
                            </span>
                          ) : timedOut ? (
                            <>
                              <span className="text-xs text-amber-600 dark:text-amber-400">Time expired</span>
                              <span className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                                Correct: {LETTER[q.correctIndex ?? 0]}. {choices[q.correctIndex ?? 0]}
                              </span>
                            </>
                          ) : (
                            <>
                              {choices[ans.selectedIndex] && (
                                <span className="text-xs text-rose-600 dark:text-rose-400">
                                  Your answer: {LETTER[ans.selectedIndex]}. {choices[ans.selectedIndex]}
                                </span>
                              )}
                              <span className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                                Correct: {LETTER[q.correctIndex ?? 0]}. {choices[q.correctIndex ?? 0]}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <span className={`shrink-0 text-xs font-bold px-1.5 py-0.5 rounded ${
                        ans.correct ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                        : timedOut ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                        : "bg-rose-500/15 text-rose-700 dark:text-rose-400"
                      }`}>
                        Q{ans.questionIndex + 1}
                      </span>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      </div>
    </motion.div>
  );
}

// ─── Practice Session ────────────────────────────────────────────────────────

function PracticeSession({
  questions,
  qbankName,
  qbankId,
  timed,
  secondsPerQuestion,
  initialFlaggedIds,
  onDone,
}: {
  questions: Question[];
  qbankName: string;
  qbankId: number;
  timed: boolean;
  secondsPerQuestion: number;
  initialFlaggedIds: Set<number>;
  onDone: (answers: Answer[], totalSeconds: number) => void;
}) {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [direction, setDirection] = useState(1);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [wrongFlash, setWrongFlash] = useState(false);
  const [flaggedIds, setFlaggedIds] = useState<Set<number>>(new Set(initialFlaggedIds));
  const [questionTimeLeft, setQuestionTimeLeft] = useState(secondsPerQuestion);
  const [sessionStartTime] = useState(Date.now());
  const questionStartRef = useRef(Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timedOutRef = useRef(false);

  // Mirror mutable state into refs so the timer expiry callback always
  // reads the latest values without stale-closure issues.
  const selectedRef = useRef<number | null>(null);
  const answersRef = useRef<Answer[]>([]);
  const indexRef = useRef(0);
  const revealedRef = useRef(false);
  const onDoneRef = useRef(onDone);

  const current = questions[index];
  const choices = current?.choices ?? [];
  const correctIndex = current?.correctIndex ?? 0;
  const total = questions.length;
  const progress = (index / total) * 100;
  const correctSoFar = answers.filter(a => a.correct).length;
  const wrongSoFar = answers.filter(a => !a.correct).length;
  const isCurrentCorrect = revealed && (answers[index]?.correct === true);
  const isTimedOut = revealed && answers[index]?.selectedIndex === -1;
  const isFlagged = current ? flaggedIds.has(current.id) : false;

  const timerPct = secondsPerQuestion > 0 ? questionTimeLeft / secondsPerQuestion : 1;
  const timerColor = timerPct > 0.5 ? "text-emerald-600 dark:text-emerald-400" : timerPct > 0.25 ? "text-amber-600 dark:text-amber-400" : "text-rose-600 dark:text-rose-400";

  // Keep refs in sync with latest state/props
  useEffect(() => { selectedRef.current = selected; }, [selected]);
  useEffect(() => { answersRef.current = answers; }, [answers]);
  useEffect(() => { indexRef.current = index; }, [index]);
  useEffect(() => { revealedRef.current = revealed; }, [revealed]);
  useEffect(() => { onDoneRef.current = onDone; }, [onDone]);

  // Reset question start time when index changes
  useEffect(() => {
    questionStartRef.current = Date.now();
  }, [index]);

  // Reset per-question timer on each new question
  useEffect(() => {
    if (!timed) return;
    setQuestionTimeLeft(secondsPerQuestion);
    timedOutRef.current = false;
  }, [index, timed, secondsPerQuestion]);

  // Per-question countdown — only ticks while the question is unrevealed
  useEffect(() => {
    if (!timed || revealed || questionTimeLeft <= 0) return;
    timerRef.current = setInterval(() => {
      setQuestionTimeLeft(t => {
        if (t <= 1) { clearInterval(timerRef.current!); timerRef.current = null; return 0; }
        return t - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };
  }, [timed, revealed, index]);

  // Handle per-question timeout — mark wrong (selectedIndex -1) then auto-advance
  useEffect(() => {
    if (!timed || questionTimeLeft !== 0) return;
    if (timedOutRef.current) return;
    timedOutRef.current = true;
    const nextAnswers = [...answersRef.current, {
      questionIndex: indexRef.current,
      selectedIndex: -1,
      correct: false,
      timeSeconds: secondsPerQuestion,
    }];
    answersRef.current = nextAnswers;
    setAnswers(nextAnswers);
    setRevealed(true);
    const advanceTimer = setTimeout(() => {
      if (indexRef.current + 1 >= questions.length) {
        const elapsed = Math.round((Date.now() - sessionStartTime) / 1000);
        onDoneRef.current(answersRef.current, elapsed);
      } else {
        setDirection(1);
        setIndex(i => i + 1);
        setSelected(null);
        setRevealed(false);
      }
    }, 1800);
    return () => clearTimeout(advanceTimer);
  }, [timed, questionTimeLeft]);

  const handleSelect = useCallback((i: number) => {
    if (revealed) return;
    setSelected(i);
  }, [revealed]);

  const handleConfirm = useCallback(() => {
    if (selected === null || revealed) return;
    const isCorrect = selected === correctIndex;
    const timeSpent = Math.round((Date.now() - questionStartRef.current) / 1000);
    setRevealed(true);
    setAnswers(prev => [...prev, { questionIndex: index, selectedIndex: selected, correct: isCorrect, timeSeconds: timeSpent }]);
    if (!isCorrect) {
      setWrongFlash(true);
      setTimeout(() => setWrongFlash(false), 700);
    }
  }, [selected, revealed, correctIndex, index]);

  const handleNext = useCallback(() => {
    if (index + 1 >= total) {
      const elapsed = Math.round((Date.now() - sessionStartTime) / 1000);
      onDone(answers, elapsed);
      return;
    }
    setDirection(1);
    setIndex(i => i + 1);
    setSelected(null);
    setRevealed(false);
    setWrongFlash(false);
  }, [index, total, answers, onDone, sessionStartTime]);

  const handlePrev = useCallback(() => {
    if (index === 0) return;
    setDirection(-1);
    setIndex(i => i - 1);
    setSelected(answers[index - 1]?.selectedIndex ?? null);
    setRevealed(index - 1 < answers.length);
  }, [index, answers]);

  const handleFlag = useCallback(() => {
    if (!current) return;
    const nowFlagged = toggleFlagged(qbankId, current.id);
    setFlaggedIds(prev => {
      const next = new Set(prev);
      if (nowFlagged) next.add(current.id); else next.delete(current.id);
      return next;
    });
  }, [current, qbankId]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key >= "1" && e.key <= "6") {
        const i = parseInt(e.key) - 1;
        if (i < choices.length) handleSelect(i);
      }
      if ((e.key === "Enter" || e.key === " ") && !revealed && selected !== null) {
        e.preventDefault(); handleConfirm();
      }
      if ((e.key === "Enter" || e.key === " ") && revealed) {
        e.preventDefault(); handleNext();
      }
      if (e.key === "ArrowLeft") handlePrev();
      if (e.key === "f" || e.key === "F") handleFlag();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [choices.length, selected, revealed, handleSelect, handleConfirm, handleNext, handlePrev, handleFlag]);

  return (
    <div className="relative min-h-screen flex flex-col">
      <AmbientOrbs color="hsl(262 84% 68% / 0.08)" />
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-md border-b border-border/50">
        <div className="px-4 py-3 flex items-center gap-3">
          <Link href={`/qbanks/${qbankId}`}>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Stethoscope className="h-4 w-4 text-violet-500 shrink-0" />
            <span className="font-semibold text-sm truncate bg-gradient-to-r from-violet-500 to-purple-500 bg-clip-text text-transparent">{qbankName}</span>
          </div>
          {timed && (
            <div className={`flex items-center gap-1 font-mono text-sm font-bold shrink-0 ${timerColor}`}>
              <Clock className="h-3.5 w-3.5" />
              {formatTime(questionTimeLeft)}
            </div>
          )}
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/50">
              <Check className="h-3 w-3 stroke-[2.5]" /> {correctSoFar}
            </span>
            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-200/60 dark:border-rose-800/50">
              <X className="h-3 w-3 stroke-[2.5]" /> {wrongSoFar}
            </span>
          </div>
        </div>

        {/* Timer bar (timed mode) */}
        {timed && (
          <div className="relative h-1 bg-muted/40">
            <motion.div
              className={`absolute inset-y-0 left-0 rounded-r-full transition-colors duration-500 ${
                timerPct > 0.5 ? "bg-emerald-500" : timerPct > 0.25 ? "bg-amber-500" : "bg-rose-500"
              }`}
              animate={{ width: `${timerPct * 100}%` }}
              transition={{ duration: 0.9, ease: "linear" }}
            />
          </div>
        )}

        {/* Progress bar */}
        <div className={`relative ${timed ? "" : "h-1.5"} bg-muted/40`} style={timed ? { height: "6px" } : {}}>
          <motion.div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-violet-500 to-violet-400 rounded-r-full"
            initial={false}
            animate={{ width: `${revealed ? ((index + 1) / total) * 100 : progress}%` }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          />
        </div>
      </div>

      {/* Question counter + dot strip */}
      <div className="px-4 pt-5 pb-2 flex items-center justify-between max-w-lg mx-auto w-full">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-violet-600 dark:text-violet-400 uppercase tracking-wider">
            Question {index + 1}
          </span>
          <span className="text-xs text-muted-foreground">of {total}</span>
        </div>
        <div className="flex items-center gap-1">
          {/* Flag button */}
          <button
            onClick={handleFlag}
            className={`h-7 w-7 rounded-lg flex items-center justify-center transition-colors ${
              isFlagged
                ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                : "text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10"
            }`}
            title={`${isFlagged ? "Unflag" : "Flag"} question (F)`}
          >
            {isFlagged ? <BookmarkCheck className="h-3.5 w-3.5" /> : <Bookmark className="h-3.5 w-3.5" />}
          </button>
          <div className="flex gap-1 ml-1">
            {questions.slice(0, 20).map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i < answers.length
                    ? answers[i]?.correct ? "bg-emerald-500 w-4" : "bg-rose-500 w-4"
                    : i === index ? "bg-violet-500 w-4" : "bg-muted w-2"
                }`}
              />
            ))}
            {total > 20 && <span className="text-[9px] text-muted-foreground ml-1">+{total - 20}</span>}
          </div>
        </div>
      </div>

      {/* Question card */}
      <div className="flex-1 px-4 pb-32 max-w-lg mx-auto w-full overflow-hidden">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={index}
            custom={direction}
            variants={cardVariants}
            initial="enter"
            animate="center"
            exit="exit"
            className="space-y-4"
          >
            {/* 3D flip card */}
            <div style={{ perspective: "1100px" }}>
              <motion.div
                animate={{ rotateY: revealed ? 180 : 0 }}
                transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                style={{ transformStyle: "preserve-3d", position: "relative" }}
              >
                <div
                  className={`rounded-2xl border bg-card shadow-sm p-5 transition-all duration-300 ${
                    wrongFlash ? "border-rose-400/60 shadow-rose-500/10 shadow-lg" : "border-border/50"
                  }`}
                  style={{ backfaceVisibility: "hidden" }}
                >
                  {current?.pageNumber != null && (
                    <p className="text-[10px] text-muted-foreground mb-2 font-medium">Page {current.pageNumber}</p>
                  )}
                  <p className="text-base sm:text-lg font-medium text-foreground leading-relaxed">
                    {current?.front}
                  </p>
                </div>
                <div
                  className={`absolute inset-0 rounded-2xl border p-5 flex items-center justify-center gap-4 ${
                    isCurrentCorrect
                      ? "bg-emerald-500/10 border-emerald-400/60 dark:bg-emerald-950/20"
                      : isTimedOut
                      ? "bg-amber-500/10 border-amber-400/60 dark:bg-amber-950/20"
                      : "bg-rose-500/10 border-rose-400/60 dark:bg-rose-950/20"
                  }`}
                  style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
                >
                  <div className={`h-12 w-12 rounded-full flex items-center justify-center shrink-0 shadow-lg ${
                    isCurrentCorrect ? "bg-emerald-500 shadow-emerald-500/30" : isTimedOut ? "bg-amber-500 shadow-amber-500/30" : "bg-rose-500 shadow-rose-500/30"
                  }`}>
                    {isCurrentCorrect
                      ? <Check className="h-6 w-6 text-white stroke-[3]" />
                      : isTimedOut
                      ? <Clock className="h-6 w-6 text-white" />
                      : <X className="h-6 w-6 text-white stroke-[3]" />}
                  </div>
                  <div className="min-w-0">
                    <p className={`font-bold text-xl font-serif leading-tight ${
                      isCurrentCorrect ? "text-emerald-700 dark:text-emerald-300" : isTimedOut ? "text-amber-700 dark:text-amber-300" : "text-rose-700 dark:text-rose-300"
                    }`}>
                      {isCurrentCorrect ? "Correct!" : isTimedOut ? "Time's up!" : "Incorrect"}
                    </p>
                    <p className="text-sm text-muted-foreground mt-0.5 leading-snug line-clamp-2">
                      {LETTER[correctIndex]}. {choices[correctIndex]}
                    </p>
                  </div>
                </div>
              </motion.div>
            </div>

            {/* Choices */}
            <ul className="space-y-2.5">
              {choices.map((choice, i) => {
                const isCorrect = i === correctIndex;
                const isSelected = selected === i;
                const letter = LETTER[i] ?? String(i + 1);

                let cardCls = "border-border/50 bg-background hover:border-violet-400/50 hover:bg-violet-500/5";
                let letterBg = LETTER_BG[letter] ?? "bg-slate-500";
                let textCls = "text-foreground";
                let icon: React.ReactNode = null;

                if (revealed) {
                  if (isCorrect) {
                    cardCls = "border-emerald-400/70 bg-emerald-500/8 dark:bg-emerald-950/30 shadow-sm";
                    letterBg = "bg-emerald-500";
                    textCls = "text-emerald-900 dark:text-emerald-100";
                    icon = <Check className="h-3.5 w-3.5 text-white stroke-[3]" />;
                  } else if (isSelected) {
                    cardCls = "border-rose-400/70 bg-rose-500/8 dark:bg-rose-950/30";
                    letterBg = "bg-rose-500";
                    textCls = "text-rose-900 dark:text-rose-100";
                    icon = <X className="h-3.5 w-3.5 text-white stroke-[3]" />;
                  } else {
                    cardCls = "border-border/30 bg-muted/30";
                    textCls = "text-muted-foreground";
                    letterBg = "bg-muted-foreground/20";
                  }
                } else if (isSelected) {
                  cardCls = "border-violet-500/60 bg-violet-500/8 shadow-sm shadow-violet-500/10";
                  letterBg = "bg-violet-600";
                  textCls = "text-violet-900 dark:text-violet-100";
                }

                return (
                  <motion.li
                    key={i}
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.06 + 0.1, type: "spring", stiffness: 320, damping: 26 }}
                  >
                    <motion.button
                      type="button"
                      disabled={revealed}
                      onClick={() => handleSelect(i)}
                      whileTap={!revealed ? { scale: 0.985 } : undefined}
                      animate={
                        wrongFlash && isSelected && !isCorrect
                          ? { x: [-5, 5, -4, 4, -2, 2, 0] }
                          : revealed && isCorrect
                          ? { scale: [1, 1.015, 1] }
                          : {}
                      }
                      transition={
                        wrongFlash && isSelected
                          ? { duration: 0.45, ease: "easeInOut" }
                          : revealed && isCorrect
                          ? { duration: 0.4, delay: 0.1 }
                          : undefined
                      }
                      className={`w-full flex items-start gap-3 text-left px-4 py-3.5 rounded-xl border-2 transition-all duration-200 ${cardCls} ${revealed ? "cursor-default" : "cursor-pointer"}`}
                    >
                      <span className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold text-white transition-colors duration-200 ${letterBg}`}>
                        {icon ?? letter}
                      </span>
                      <span className={`flex-1 text-sm sm:text-base leading-relaxed font-medium transition-colors duration-200 ${textCls}`}>
                        {choice}
                      </span>
                    </motion.button>
                  </motion.li>
                );
              })}
            </ul>

            {/* Explanation */}
            <AnimatePresence>
              {revealed && current?.back && (
                <motion.div
                  initial={{ opacity: 0, y: 14, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ type: "spring", stiffness: 280, damping: 26 }}
                  className="rounded-2xl border p-4 relative overflow-hidden bg-violet-500/5 dark:bg-violet-400/5 border-violet-400/25 dark:border-violet-400/35"
                >
                  <div aria-hidden className="pointer-events-none absolute inset-0 rounded-2xl bg-[radial-gradient(ellipse_at_0%_0%,rgba(167,139,250,0.1)_0%,transparent_60%)]" />
                  <div className="relative">
                    <div className="flex items-center gap-2 mb-2.5">
                      <div className="h-5 w-5 rounded-lg flex items-center justify-center shrink-0 bg-violet-500/15 border border-violet-500/30">
                        <Sparkles className="h-3 w-3 text-violet-600 dark:text-violet-400" />
                      </div>
                      <span className="text-[11px] font-bold uppercase tracking-widest text-violet-600 dark:text-violet-400">Explanation</span>
                    </div>
                    <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{current.back}</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom action bar */}
      <div className="fixed bottom-0 inset-x-0 z-30 bg-background/95 backdrop-blur-md border-t border-border/50 p-4 safe-area-bottom">
        <div className="max-w-lg mx-auto space-y-2">
          {!revealed ? (
            <motion.div layout>
              <Button
                className="w-full h-12 text-base font-semibold bg-violet-600 hover:bg-violet-700 text-white gap-2 shadow-lg shadow-violet-500/20 disabled:opacity-40"
                disabled={selected === null}
                onClick={handleConfirm}
              >
                <Target className="h-4 w-4" />
                {selected === null ? "Select an answer" : "Confirm Answer"}
              </Button>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 320, damping: 26 }}
              className="flex gap-3"
            >
              <div className={`flex items-center gap-2 px-4 py-3 rounded-xl flex-1 ${
                answers[answers.length - 1]?.correct
                  ? "bg-emerald-500/12 border border-emerald-300/50 dark:border-emerald-700/50"
                  : answers[answers.length - 1]?.selectedIndex === -1
                  ? "bg-amber-500/10 border border-amber-300/50 dark:border-amber-700/50"
                  : "bg-rose-500/10 border border-rose-300/50 dark:border-rose-700/50"
              }`}>
                {answers[answers.length - 1]?.correct ? (
                  <>
                    <div className="h-6 w-6 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
                      <Check className="h-3.5 w-3.5 text-white stroke-[3]" />
                    </div>
                    <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Correct!</span>
                  </>
                ) : answers[answers.length - 1]?.selectedIndex === -1 ? (
                  <>
                    <div className="h-6 w-6 rounded-full bg-amber-500 flex items-center justify-center shrink-0">
                      <Clock className="h-3.5 w-3.5 text-white" />
                    </div>
                    <span className="text-sm font-semibold text-amber-700 dark:text-amber-400">Time's up!</span>
                  </>
                ) : (
                  <>
                    <div className="h-6 w-6 rounded-full bg-rose-500 flex items-center justify-center shrink-0">
                      <X className="h-3.5 w-3.5 text-white stroke-[3]" />
                    </div>
                    <span className="text-sm font-semibold text-rose-700 dark:text-rose-400">Incorrect</span>
                  </>
                )}
              </div>
              <div className="flex gap-2">
                {index > 0 && !timed && (
                  <Button variant="outline" size="icon" className="h-12 w-12" onClick={handlePrev}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  className="gap-2 px-6 h-12 bg-violet-600 hover:bg-violet-700 text-white font-semibold shadow-lg shadow-violet-500/20"
                  onClick={handleNext}
                >
                  {index + 1 >= total ? (
                    <><Trophy className="h-4 w-4" /> See Results</>
                  ) : (
                    <>Next <ChevronRight className="h-4 w-4" /></>
                  )}
                </Button>
              </div>
            </motion.div>
          )}
          <p className="text-center text-[10px] text-muted-foreground/50 hidden sm:block">
            {!revealed
              ? selected !== null ? "Space/Enter to confirm · F to flag" : "Press 1–4 to select · F to flag"
              : "Space/Enter to continue · F to flag"}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Main Orchestrator ───────────────────────────────────────────────────────

export default function PracticeQbank() {
  const [, params] = useRoute("/practice-qbank/:id");
  const id = Number(params?.id);

  const { data: qbank, isLoading: loadingQbank } = useGetQbank(id);
  const { data: rawQuestions, isLoading: loadingQuestions } = useListQbankQuestions(id);

  const questions = useMemo(() => {
    return (rawQuestions ?? []).filter(
      q => Array.isArray(q.choices) && q.choices.length >= 2 && typeof q.correctIndex === "number"
    );
  }, [rawQuestions]);

  type Phase = "config" | "practice" | "results";
  const [phase, setPhase] = useState<Phase>("config");
  const [sessionConfig, setSessionConfig] = useState<SessionConfig>({ filterMode: "all", timed: false, secondsPerQuestion: 30 });
  const [activeQuestions, setActiveQuestions] = useState<Question[]>([]);
  const [finalAnswers, setFinalAnswers] = useState<Answer[]>([]);
  const [finalTotalSeconds, setFinalTotalSeconds] = useState(0);

  const handleStart = useCallback((config: SessionConfig, filtered: Question[]) => {
    setSessionConfig(config);
    setActiveQuestions(filtered);
    setPhase("practice");
  }, []);

  const handleDone = useCallback((answers: Answer[], totalSeconds: number) => {
    setFinalAnswers(answers);
    setFinalTotalSeconds(totalSeconds);
    setPhase("results");

    if (qbank && answers.length > 0) {
      const now = new Date().toISOString();
      const results: QBankQuestionResult[] = answers.map(a => ({
        questionId: activeQuestions[a.questionIndex]?.id ?? 0,
        selectedIndex: a.selectedIndex,
        correct: a.correct,
        timeSeconds: a.timeSeconds,
        tags: parseTags(activeQuestions[a.questionIndex]?.tags),
      }));

      saveQBankSession({
        qbankId: id,
        qbankName: qbank.name,
        results,
        startedAt: new Date(Date.now() - totalSeconds * 1000).toISOString(),
        completedAt: now,
        totalSeconds,
        filterMode: sessionConfig.filterMode,
        timed: sessionConfig.timed,
        secondsPerQuestion: sessionConfig.timed ? sessionConfig.secondsPerQuestion : undefined,
      });

      saveSession({
        deckId: id,
        deckName: qbank.name,
        total: answers.length,
        known: answers.filter(a => a.correct).length,
        unknown: answers.filter(a => !a.correct).length,
        completedAt: now,
      });

      // Only mark questions that were actually attempted — unanswered questions
      // (e.g. those skipped when the timer expired) stay unseen so they appear
      // correctly in the "Unseen Only" filter next time.
      const attemptedIds = answers
        .filter(a => a.selectedIndex !== -1)
        .map(a => activeQuestions[a.questionIndex]?.id)
        .filter((qid): qid is number => qid != null);
      markSeen(id, attemptedIds);
    }
  }, [qbank, id, activeQuestions, sessionConfig]);

  const handleReset = useCallback(() => {
    setFinalAnswers([]);
    setFinalTotalSeconds(0);
    setPhase("config");
  }, []);

  const qbankName = qbank?.name ?? "Question Bank";

  if (loadingQbank || loadingQuestions) {
    return (
      <div className="p-4 space-y-4 max-w-lg mx-auto">
        <div className="flex items-center gap-3 py-3">
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-5 w-40" />
        </div>
        <Skeleton className="h-2 rounded-full" />
        <Skeleton className="h-32 rounded-2xl" />
        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-14 rounded-xl" />)}
      </div>
    );
  }

  if (!qbank) {
    return (
      <div className="text-center py-20">
        <Stethoscope className="mx-auto h-10 w-10 text-muted-foreground mb-3 opacity-40" />
        <p className="font-medium text-muted-foreground">Question bank not found</p>
        <Link href="/decks">
          <Button variant="outline" className="mt-4 gap-2">
            <ArrowLeft className="h-4 w-4" /> Back to Library
          </Button>
        </Link>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="text-center py-20 space-y-4">
        <div className="h-14 w-14 rounded-2xl bg-violet-500/10 flex items-center justify-center mx-auto">
          <Stethoscope className="h-7 w-7 text-violet-600" />
        </div>
        <p className="text-lg font-serif font-semibold">No MCQ questions yet</p>
        <p className="text-muted-foreground text-sm">This question bank has no multiple-choice questions to practice.</p>
        <Link href={`/qbanks/${id}`}>
          <Button variant="outline" className="gap-2 mt-2">
            <ArrowLeft className="h-4 w-4" /> Back to QBank
          </Button>
        </Link>
      </div>
    );
  }

  if (phase === "results") {
    return (
      <ResultsView
        questions={activeQuestions}
        answers={finalAnswers}
        qbankName={qbankName}
        qbankId={id}
        totalSeconds={finalTotalSeconds}
        filterMode={sessionConfig.filterMode}
        timed={sessionConfig.timed}
        onReset={handleReset}
      />
    );
  }

  if (phase === "practice" && activeQuestions.length > 0) {
    return (
      <PracticeSession
        questions={activeQuestions}
        qbankName={qbankName}
        qbankId={id}
        timed={sessionConfig.timed}
        secondsPerQuestion={sessionConfig.timed ? sessionConfig.secondsPerQuestion : 30}
        initialFlaggedIds={getFlaggedIds(id)}
        onDone={handleDone}
      />
    );
  }

  return (
    <PreSessionConfig
      questions={questions}
      qbankId={id}
      qbankName={qbankName}
      onStart={handleStart}
    />
  );
}
