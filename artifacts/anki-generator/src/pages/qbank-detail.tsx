import { useState, useMemo } from "react";
import { Link, useRoute } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { AmbientOrbs } from "@/components/ambient-orbs";
import { PageHeader } from "@/components/page-header";
import {
  useGetQbank,
  useListQbankQuestions,
  useUpdateQuestion,
  useDeleteQuestion,
  getListQbankQuestionsQueryKey,
  getGetQbankQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import {
  ArrowLeft, Stethoscope, Play, Search, X, Edit2, Trash2,
  Check, ChevronDown, ChevronRight, Tag, FileText,
  BarChart2, Clock, TrendingUp, TrendingDown, Award, AlertCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Question } from "@workspace/api-client-react";
import {
  getQBankSessions,
  getHistoricalTopicBreakdown,
  type QBankSession,
} from "@/lib/study-stats";

const LETTER = ["A", "B", "C", "D", "E", "F"];
const LETTER_COLORS: Record<string, string> = {
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
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ─── Question Card ───────────────────────────────────────────────────────────

function QuestionCard({
  question,
  index,
  onUpdate,
  onDelete,
}: {
  question: Question;
  index: number;
  onUpdate: (id: number, data: { front?: string; back?: string | null; tags?: string | null }) => void;
  onDelete: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [front, setFront] = useState(question.front);
  const [back, setBack] = useState(question.back ?? "");
  const [tagsInput, setTagsInput] = useState(parseTags(question.tags).join(", "));
  const [confirmDelete, setConfirmDelete] = useState(false);

  const choices = question.choices ?? [];
  const correctIndex = question.correctIndex ?? 0;
  const tags = parseTags(question.tags);

  const handleSave = () => {
    onUpdate(question.id, { front: front.trim(), back: back.trim() || null, tags: tagsInput.trim() || null });
    setEditing(false);
  };

  const handleCancel = () => {
    setFront(question.front);
    setBack(question.back ?? "");
    setTagsInput(parseTags(question.tags).join(", "));
    setEditing(false);
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.03, duration: 0.3 }}
      >
        <Card className="border-border/50 group hover:border-violet-500/30 hover:shadow-sm transition-all bg-card/70 backdrop-blur-sm">
          <CardContent className="p-0">
            {editing ? (
              <div className="p-4 space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Question Stem</Label>
                  <Textarea value={front} onChange={e => setFront(e.target.value)} className="min-h-[80px] text-sm" autoFocus />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Explanation</Label>
                  <Textarea value={back} onChange={e => setBack(e.target.value)} className="min-h-[80px] text-sm" placeholder="Answer explanation…" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <Tag className="h-3 w-3" /> Tags (comma-separated)
                  </Label>
                  <Input value={tagsInput} onChange={e => setTagsInput(e.target.value)} placeholder="e.g. cardiology, heart failure" className="text-sm" />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={handleCancel}><X className="h-4 w-4 mr-1" /> Cancel</Button>
                  <Button size="sm" onClick={handleSave} disabled={!front.trim()}><Check className="h-4 w-4 mr-1" /> Save</Button>
                </div>
              </div>
            ) : (
              <>
                <div
                  role="button"
                  tabIndex={0}
                  className="w-full text-left p-4 flex items-start gap-3 cursor-pointer"
                  onClick={() => setExpanded(e => !e)}
                  onKeyDown={e => { if (e.key === "Enter" || e.key === " ") setExpanded(v => !v); }}
                >
                  <div className="h-6 w-6 rounded-md bg-violet-500/10 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-[10px] font-bold text-violet-600">Q{index + 1}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground leading-snug line-clamp-2 text-left">{question.front}</p>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      {choices.length > 0 && (
                        <span className="text-[10px] text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">{choices.length} choices</span>
                      )}
                      {question.pageNumber != null && (
                        <span className="text-[10px] text-muted-foreground">p. {question.pageNumber}</span>
                      )}
                      {tags.map(t => (
                        <Badge key={t} variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-normal">{t}</Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-auto pl-2">
                    <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity" onClick={e => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        onClick={(e) => { e.stopPropagation(); setEditing(true); setExpanded(true); }}>
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                  </div>
                </div>

                <AnimatePresence>
                  {expanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: "easeInOut" }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-4 pt-0 space-y-3 border-t border-border/40 mt-0">
                        {choices.length > 0 && (
                          <div className="space-y-2 pt-3">
                            {choices.map((choice, i) => {
                              const letter = LETTER[i] ?? String(i + 1);
                              const isCorrect = i === correctIndex;
                              return (
                                <div key={i} className={`flex items-start gap-2.5 rounded-lg px-3 py-2.5 ${
                                  isCorrect
                                    ? "bg-emerald-500/8 border border-emerald-200/70 dark:border-emerald-800/50"
                                    : "bg-muted/30 border border-border/40"
                                }`}>
                                  <span className={`h-5 w-5 rounded-md flex items-center justify-center text-[10px] font-bold text-white shrink-0 mt-0.5 ${
                                    isCorrect ? "bg-emerald-500" : (LETTER_COLORS[letter] ?? "bg-muted-foreground/30")
                                  }`}>
                                    {isCorrect ? <Check className="h-3 w-3 stroke-[3]" /> : letter}
                                  </span>
                                  <span className={`text-sm leading-snug ${isCorrect ? "font-medium text-emerald-900 dark:text-emerald-100" : "text-foreground"}`}>
                                    {choice}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {question.back && (
                          <div className="rounded-lg bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-800/40 p-3">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 mb-1.5">Explanation</p>
                            <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{question.back}</p>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this question?</DialogTitle>
            <DialogDescription>This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => { setConfirmDelete(false); onDelete(question.id); }}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Performance Tab ─────────────────────────────────────────────────────────

function PerformanceTab({ qbankId }: { qbankId: number }) {
  const sessions = useMemo(() => getQBankSessions(qbankId), [qbankId]);

  const stats = useMemo(() => {
    if (sessions.length === 0) return null;
    const scores = sessions.map(s => {
      const total = s.results.length;
      const correct = s.results.filter(r => r.correct).length;
      return total > 0 ? correct / total : 0;
    });
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const best = Math.max(...scores);
    const totalTime = sessions.reduce((a, s) => a + s.totalSeconds, 0);
    const n = scores.length;
    let improvementDelta: number | null = null;
    if (n >= 4) {
      const half = Math.min(3, Math.floor(n / 2));
      const recentAvg = scores.slice(-half).reduce((a, b) => a + b, 0) / half;
      const earlyAvg = scores.slice(0, half).reduce((a, b) => a + b, 0) / half;
      improvementDelta = recentAvg - earlyAvg;
    }
    return { avg, best, totalTime, count: sessions.length, improvementDelta };
  }, [sessions]);

  const chartData = useMemo(() => {
    return [...sessions].reverse().slice(-20).map((s, i) => ({
      session: i + 1,
      score: Math.round((s.results.filter(r => r.correct).length / Math.max(s.results.length, 1)) * 100),
      label: new Date(s.completedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    }));
  }, [sessions]);

  const topicBreakdown = useMemo(() => getHistoricalTopicBreakdown(sessions), [sessions]);

  if (sessions.length === 0) {
    return (
      <div className="text-center py-16 border-2 border-dashed border-border/50 rounded-2xl">
        <BarChart2 className="mx-auto h-10 w-10 text-muted-foreground mb-3 opacity-40" />
        <p className="font-medium text-muted-foreground">No sessions yet</p>
        <p className="text-sm text-muted-foreground mt-1">
          Complete a practice session to see your performance history.
        </p>
      </div>
    );
  }

  return (
    <motion.div className="space-y-6" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>

      {/* Summary stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            {
              label: "Sessions",
              value: stats.count,
              icon: <BarChart2 className="h-4 w-4" />,
              color: "text-violet-600 dark:text-violet-400",
              bg: "bg-violet-500/10",
            },
            {
              label: "Avg Score",
              value: `${Math.round(stats.avg * 100)}%`,
              icon: <TrendingUp className="h-4 w-4" />,
              color: stats.avg >= 0.75 ? "text-emerald-600 dark:text-emerald-400" : stats.avg >= 0.5 ? "text-amber-600 dark:text-amber-400" : "text-rose-600 dark:text-rose-400",
              bg: stats.avg >= 0.75 ? "bg-emerald-500/10" : stats.avg >= 0.5 ? "bg-amber-500/10" : "bg-rose-500/10",
            },
            {
              label: "Best Score",
              value: `${Math.round(stats.best * 100)}%`,
              icon: <Award className="h-4 w-4" />,
              color: "text-amber-600 dark:text-amber-400",
              bg: "bg-amber-500/10",
            },
            {
              label: "Total Time",
              value: formatTime(stats.totalTime),
              icon: <Clock className="h-4 w-4" />,
              color: "text-sky-600 dark:text-sky-400",
              bg: "bg-sky-500/10",
            },
          ].map(s => (
            <div key={s.label} className={`rounded-xl border border-border/50 p-3.5 ${s.bg}`}>
              <div className={`flex items-center gap-1.5 mb-1.5 ${s.color}`}>{s.icon}</div>
              <p className={`text-xl font-bold font-serif ${s.color}`}>{s.value}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 font-medium uppercase tracking-wider">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Score trend chart */}
      {chartData.length >= 2 && (
        <div className="rounded-xl border border-border/50 bg-card/60 p-4">
          <div className="flex items-center gap-3 mb-4">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex-1">Score Trend</p>
            {stats?.improvementDelta != null && (
              <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${stats.improvementDelta >= 0 ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-rose-500/10 text-rose-600 dark:text-rose-400"}`}>
                {stats.improvementDelta >= 0
                  ? <TrendingUp className="h-3 w-3" />
                  : <TrendingDown className="h-3 w-3" />}
                {stats.improvementDelta >= 0 ? "+" : ""}{Math.round(stats.improvementDelta * 100)}% recent vs early
              </span>
            )}
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={v => `${v}%`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
                formatter={(val: number) => [`${val}%`, "Score"]}
                labelFormatter={label => `Session: ${label}`}
              />
              <Line
                type="monotone"
                dataKey="score"
                stroke="#8b5cf6"
                strokeWidth={2}
                dot={{ fill: "#8b5cf6", r: 3, strokeWidth: 0 }}
                activeDot={{ r: 5, fill: "#8b5cf6" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Topic breakdown */}
      {topicBreakdown.length > 0 && (
        <div className="rounded-xl border border-border/50 bg-card/60 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex-1">Topic Performance</p>
            <span className="text-[10px] text-muted-foreground">(weakest first)</span>
          </div>
          <div className="space-y-2.5">
            {topicBreakdown.slice(0, 10).map((t, i) => {
              const isWeak = t.pct < 0.6;
              const isMid = t.pct >= 0.6 && t.pct < 0.8;
              return (
                <div key={t.topic} className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {isWeak && <AlertCircle className="h-3 w-3 text-rose-500 shrink-0" />}
                      {!isWeak && !isMid && <TrendingUp className="h-3 w-3 text-emerald-500 shrink-0" />}
                      <span className="text-xs font-medium text-foreground truncate">{t.topic}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] text-muted-foreground">{t.correct}/{t.total}</span>
                      <span className={`text-xs font-bold ${isWeak ? "text-rose-600 dark:text-rose-400" : isMid ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                        {Math.round(t.pct * 100)}%
                      </span>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
                    <motion.div
                      className={`h-full rounded-full ${isWeak ? "bg-rose-500" : isMid ? "bg-amber-500" : "bg-emerald-500"}`}
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.round(t.pct * 100)}%` }}
                      transition={{ duration: 0.6, ease: "easeOut", delay: i * 0.04 }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Session history table */}
      <div className="rounded-xl border border-border/50 bg-card/60 overflow-hidden">
        <div className="px-4 py-3 border-b border-border/40">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Session History</p>
        </div>
        <div className="divide-y divide-border/40">
          {sessions.slice(0, 15).map((s, i) => {
            const total = s.results.length;
            const correct = s.results.filter(r => r.correct).length;
            const pct = total > 0 ? correct / total : 0;
            const scorePct = Math.round(pct * 100);
            const scoreColor = pct >= 0.75 ? "text-emerald-600 dark:text-emerald-400" : pct >= 0.5 ? "text-amber-600 dark:text-amber-400" : "text-rose-600 dark:text-rose-400";
            const filterLabels: Record<string, string> = { all: "All", unseen: "Unseen", wrong: "Wrong", flagged: "Flagged" };
            return (
              <div key={s.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
                <div className="h-7 w-7 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0">
                  <span className="text-[10px] font-bold text-violet-600">#{sessions.length - i}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-sm font-bold ${scoreColor}`}>{scorePct}%</span>
                    <span className="text-xs text-muted-foreground">{correct}/{total} correct</span>
                    {s.timed && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded font-medium">
                        <Clock className="h-2.5 w-2.5" /> {formatTime(s.totalSeconds)}
                      </span>
                    )}
                    {s.filterMode !== "all" && (
                      <Badge variant="secondary" className="text-[10px] h-4 px-1.5 py-0 font-normal">
                        {filterLabels[s.filterMode] ?? s.filterMode}
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{formatDate(s.completedAt)}</p>
                </div>
                <div className="h-8 w-8 relative shrink-0">
                  <svg viewBox="0 0 32 32" className="w-full h-full -rotate-90">
                    <circle cx="16" cy="16" r="12" fill="none" strokeWidth="3" className="stroke-muted/40" />
                    <circle
                      cx="16" cy="16" r="12" fill="none" strokeWidth="3" strokeLinecap="round"
                      strokeDasharray={`${2 * Math.PI * 12}`}
                      strokeDashoffset={`${2 * Math.PI * 12 * (1 - pct)}`}
                      className={pct >= 0.75 ? "stroke-emerald-500" : pct >= 0.5 ? "stroke-amber-500" : "stroke-rose-500"}
                    />
                  </svg>
                </div>
              </div>
            );
          })}
        </div>
        {sessions.length > 15 && (
          <div className="px-4 py-2.5 border-t border-border/40 text-center">
            <p className="text-xs text-muted-foreground">Showing 15 of {sessions.length} sessions</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Main QbankDetail ─────────────────────────────────────────────────────────

export default function QbankDetail() {
  const [, params] = useRoute("/qbanks/:id");
  const id = Number(params?.id);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: qbank, isLoading: loadingQbank } = useGetQbank(id);
  const { data: questions, isLoading: loadingQuestions } = useListQbankQuestions(id);
  const updateQuestion = useUpdateQuestion();
  const deleteQuestion = useDeleteQuestion();

  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("questions");

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return questions ?? [];
    return (questions ?? []).filter(
      qu => qu.front.toLowerCase().includes(q) || (qu.back ?? "").toLowerCase().includes(q)
    );
  }, [questions, search]);

  const handleUpdate = (qId: number, data: { front?: string; back?: string; tags?: string | null }) => {
    updateQuestion.mutate(
      { id: qId, data },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListQbankQuestionsQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getGetQbankQueryKey(id) });
          toast({ title: "Question updated" });
        },
        onError: () => toast({ title: "Failed to update", variant: "destructive" }),
      }
    );
  };

  const handleDelete = (qId: number) => {
    deleteQuestion.mutate(
      { id: qId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListQbankQuestionsQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getGetQbankQueryKey(id) });
          toast({ title: "Question deleted" });
        },
        onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
      }
    );
  };

  if (loadingQbank) {
    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        <Skeleton className="h-8 w-1/2" />
        <div className="space-y-3">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
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

  const totalQuestions = questions?.length ?? 0;

  return (
    <div className="relative space-y-6 animate-in fade-in duration-500 pb-20">
      <AmbientOrbs color="hsl(262 84% 68% / 0.08)" className="rounded-3xl" />

      {/* Header */}
      <div className="relative flex items-start justify-between flex-wrap gap-4">
        <div className="flex-1 min-w-0">
          <Link href="/decks?tab=qbanks" className="inline-flex items-center text-sm text-muted-foreground hover:text-violet-500 mb-3 transition-colors gap-1">
            <ArrowLeft className="h-4 w-4" /> Back to Library
          </Link>
          <PageHeader
            icon={Stethoscope}
            iconColor="#a78bfa"
            iconGlow="hsl(262 84% 68% / 0.5)"
            gradient="from-violet-400 via-purple-400 to-fuchsia-500"
            title={qbank.name}
            subtitle={
              qbank.description
                ? qbank.description
                : `${totalQuestions} question${totalQuestions !== 1 ? "s" : ""} total`
            }
          />
        </div>
        {totalQuestions > 0 && (
          <Link href={`/practice-qbank/${id}`}>
            <Button className="gap-2 bg-violet-600 hover:bg-violet-700 text-white shadow-sm shadow-violet-500/20">
              <Play className="h-4 w-4" /> Practice ({totalQuestions} MCQ{totalQuestions !== 1 ? "s" : ""})
            </Button>
          </Link>
        )}
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-4 flex-wrap text-sm text-muted-foreground border-b pb-3">
        <span className="flex items-center gap-1.5">
          <FileText className="h-4 w-4 text-violet-500" />
          <span className="font-medium text-foreground">{totalQuestions}</span> question{totalQuestions !== 1 ? "s" : ""}
        </span>
        {qbank.subQbanks && qbank.subQbanks.length > 0 && (
          <span className="text-muted-foreground">{qbank.subQbanks.length} sub-bank{qbank.subQbanks.length !== 1 ? "s" : ""}</span>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-9 p-1 bg-muted/60">
          <TabsTrigger value="questions" className="gap-1.5 h-7 px-3 data-[state=active]:shadow-sm text-xs">
            <FileText className="h-3.5 w-3.5" /> Questions
          </TabsTrigger>
          <TabsTrigger value="performance" className="gap-1.5 h-7 px-3 data-[state=active]:shadow-sm text-xs">
            <BarChart2 className="h-3.5 w-3.5" /> Performance
          </TabsTrigger>
        </TabsList>

        {/* Questions tab */}
        <TabsContent value="questions" className="mt-4 space-y-4">
          {totalQuestions > 4 && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search questions…"
                className="pl-9 pr-9"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          )}

          {loadingQuestions ? (
            <div className="space-y-3">{[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
          ) : totalQuestions === 0 ? (
            <div className="text-center py-16 border-2 border-dashed border-border/50 rounded-2xl">
              <Stethoscope className="mx-auto h-10 w-10 text-muted-foreground mb-3 opacity-40" />
              <p className="font-medium text-muted-foreground">No questions yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Generate a question bank from the{" "}
                <Link href="/generate" className="text-violet-600 hover:underline">Generate tab</Link>.
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No questions match "{search}"</p>
              <Button variant="ghost" size="sm" className="mt-2" onClick={() => setSearch("")}>Clear search</Button>
            </div>
          ) : (
            <div className="space-y-2">
              {search && (
                <p className="text-sm text-muted-foreground">
                  {filtered.length} of {totalQuestions} question{totalQuestions !== 1 ? "s" : ""}
                </p>
              )}
              {filtered.map((q, i) => (
                <QuestionCard key={q.id} question={q} index={i} onUpdate={handleUpdate} onDelete={handleDelete} />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Performance tab */}
        <TabsContent value="performance" className="mt-4">
          <PerformanceTab qbankId={id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
