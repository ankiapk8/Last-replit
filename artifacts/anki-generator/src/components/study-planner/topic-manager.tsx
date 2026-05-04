import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Plus, Pencil, Trash2, Clock, X, Search, Download,
  ExternalLink, FileText, Video, BookOpen, StickyNote, ChevronDown, ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useStudyTopicsContext } from "@/context/study-topics-context";
import {
  type Topic, type Status, type Difficulty, type Priority,
  DEFAULT_TOPIC, STATUS_COLORS, PRIORITY_COLORS, DIFFICULTY_COLORS,
  generateId, formatMinutes, writeStudyActivity, generateSubjectCSV, downloadCSV,
  getScheduleStartDate, getScheduleEndDate, getSpacingDays,
} from "@/lib/study-planner/topics";
import { getQBankSessions, getHistoricalTopicBreakdown } from "@/lib/study-stats";

const STATUS_CYCLE: Status[] = ["Not Started", "In Progress", "Done", "Revised"];
const PRIORITY_CYCLE: Priority[] = ["High", "Medium", "Low"];

function lsGet(k: string) { try { return localStorage.getItem(k); } catch { return null; } }

interface TopicManagerProps {
  storageKey: string;
  subjectLabel: string;
  parentLabel: string;
  accentClass?: string;
}

interface TopicFormData {
  name: string;
  status: Status;
  priority: Priority;
  difficultyLevel: Difficulty;
  estimatedMinutes: number;
  universityLecturer: string;
  filesAndMedia: string;
  videoLink: string;
  amboss: string;
  from: string;
  notes: string;
}

function blankForm(): TopicFormData {
  return {
    name: "",
    status: (lsGet("sp-settings-default-status") as Status) ?? "Not Started",
    priority: (lsGet("sp-settings-default-priority") as Priority) ?? "Medium",
    difficultyLevel: "Medium",
    estimatedMinutes: 0,
    universityLecturer: "",
    filesAndMedia: "",
    videoLink: "",
    amboss: "",
    from: "",
    notes: "",
  };
}

function hasDetails(t: Topic): boolean {
  return !!(t.universityLecturer || t.from || t.filesAndMedia || t.videoLink || t.amboss || t.notes);
}

export function TopicManager({ storageKey, subjectLabel, parentLabel, accentClass = "text-primary" }: TopicManagerProps) {
  const { topicsMap, upsertTopics } = useStudyTopicsContext();
  const topics = topicsMap[storageKey] ?? [];

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<Status[]>([]);
  const [priorityFilter, setPriorityFilter] = useState<Priority[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TopicFormData>(blankForm());
  const [bulkStatus, setBulkStatus] = useState<Status | "">("");
  const [bulkPriority, setBulkPriority] = useState<Priority | "">("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);

  // QBank performance data for this subject
  const qbankMastery = useMemo(() => {
    const sessions = getQBankSessions();
    if (!sessions.length) return null;
    const breakdown = getHistoricalTopicBreakdown(sessions);
    const subjectLower = subjectLabel.toLowerCase();
    const match = breakdown.find(b => b.topic.toLowerCase() === subjectLower)
      ?? breakdown.find(b => subjectLower.includes(b.topic.toLowerCase()) || b.topic.toLowerCase().includes(subjectLower));
    return match ? { pct: Math.round(match.pct * 100), correct: match.correct, total: match.total } : null;
  }, [subjectLabel]);

  const filtered = useMemo(() => {
    return topics.filter(t => {
      if (search && !t.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (statusFilter.length && !statusFilter.includes(t.status)) return false;
      if (priorityFilter.length && !priorityFilter.includes(t.priority)) return false;
      return true;
    });
  }, [topics, search, statusFilter, priorityFilter]);

  const totalMinutes = topics.filter(t => t.status !== "Done" && t.status !== "Revised")
    .reduce((s, t) => s + (t.estimatedMinutes ?? 0), 0);
  const notStarted = topics.filter(t => t.status === "Not Started").length;
  const highPriority = topics.filter(t => t.priority === "High").length;

  const openAdd = () => { setEditingId(null); setForm(blankForm()); setDialogOpen(true); };
  const openEdit = (t: Topic) => {
    setEditingId(t.id);
    setForm({
      name: t.name, status: t.status, priority: t.priority,
      difficultyLevel: t.difficultyLevel, estimatedMinutes: t.estimatedMinutes ?? 0,
      universityLecturer: t.universityLecturer, filesAndMedia: t.filesAndMedia,
      videoLink: t.videoLink, amboss: t.amboss, from: t.from, notes: t.notes,
    });
    setDialogOpen(true);
  };

  const saveTopic = () => {
    if (!form.name.trim()) return;
    const updated = editingId
      ? topics.map(t => t.id === editingId ? { ...t, ...form, subject: subjectLabel } : t)
      : [...topics, { ...DEFAULT_TOPIC, ...form, id: generateId(), subject: subjectLabel }];
    upsertTopics(storageKey, updated);
    if (form.status === "Done" || form.status === "Revised") writeStudyActivity();
    setDialogOpen(false);
  };

  const deleteTopic = (id: string) => {
    upsertTopics(storageKey, topics.filter(t => t.id !== id));
    setSelected(prev => { const n = new Set(prev); n.delete(id); return n; });
    setDeleteConfirmId(null);
  };

  const deleteSelected = () => {
    upsertTopics(storageKey, topics.filter(t => !selected.has(t.id)));
    setSelected(new Set());
    setBulkDeleteConfirm(false);
  };

  const cycleStatus = (t: Topic) => {
    const idx = (STATUS_CYCLE.indexOf(t.status) + 1) % STATUS_CYCLE.length;
    const newStatus = STATUS_CYCLE[idx];
    upsertTopics(storageKey, topics.map(x => x.id === t.id ? { ...x, status: newStatus } : x));
    if (newStatus === "Done" || newStatus === "Revised") writeStudyActivity();
  };

  const cyclePriority = (t: Topic) => {
    const idx = (PRIORITY_CYCLE.indexOf(t.priority) + 1) % PRIORITY_CYCLE.length;
    upsertTopics(storageKey, topics.map(x => x.id === t.id ? { ...x, priority: PRIORITY_CYCLE[idx] } : x));
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const applyBulkStatus = (s: Status) => {
    const updated = topics.map(t => selected.has(t.id) ? { ...t, status: s } : t);
    upsertTopics(storageKey, updated);
    if (s === "Done" || s === "Revised") writeStudyActivity();
    setBulkStatus("");
  };

  const applyBulkPriority = (p: Priority) => {
    const updated = topics.map(t => selected.has(t.id) ? { ...t, priority: p } : t);
    upsertTopics(storageKey, updated);
    setBulkPriority("");
  };

  const handleExportCSV = () => {
    const start = getScheduleStartDate();
    const end = getScheduleEndDate(start);
    const spacing = getSpacingDays();
    const csv = generateSubjectCSV(topics, subjectLabel, parentLabel, end, spacing);
    downloadCSV(csv, `${storageKey}.csv`);
  };

  const anyFilter = search || statusFilter.length > 0 || priorityFilter.length > 0;

  const toggleStatusFilter = (s: Status) =>
    setStatusFilter(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);

  const togglePriorityFilter = (p: Priority) =>
    setPriorityFilter(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="space-y-2">
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Total", value: topics.length, color: "text-primary" },
            { label: "Not Started", value: notStarted, color: "text-gray-500" },
            { label: "High Priority", value: highPriority, color: "text-red-500" },
          ].map(s => (
            <div key={s.label} className="rounded-lg border border-border/50 bg-card/70 backdrop-blur-sm p-2 text-center">
              <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-[10px] text-muted-foreground">{s.label}</div>
            </div>
          ))}
        </div>
        {topics.length > 0 && (() => {
          const done = topics.filter(t => t.status === "Done").length;
          const revised = topics.filter(t => t.status === "Revised").length;
          const inProgress = topics.filter(t => t.status === "In Progress").length;
          const completionPct = Math.round(((done + revised) / topics.length) * 100);
          return (
            <div className="space-y-2">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-muted-foreground font-medium">Completion</span>
                  <span className={`text-[10px] font-bold ${completionPct >= 80 ? "text-emerald-600" : completionPct >= 40 ? "text-orange-500" : "text-red-500"}`}>
                    {completionPct}%
                  </span>
                </div>
                <div className="h-2 w-full bg-muted rounded-full overflow-hidden flex">
                  <div className="h-full bg-emerald-500 transition-all" style={{ width: `${(done / topics.length) * 100}%` }} title={`Done: ${done}`} />
                  <div className="h-full bg-green-400 transition-all" style={{ width: `${(revised / topics.length) * 100}%` }} title={`Revised: ${revised}`} />
                  <div className="h-full bg-orange-400 transition-all" style={{ width: `${(inProgress / topics.length) * 100}%` }} title={`In Progress: ${inProgress}`} />
                </div>
                <div className="flex gap-3 mt-1 flex-wrap">
                  {[
                    { label: "Done", val: done, cls: "bg-emerald-500" },
                    { label: "Revised", val: revised, cls: "bg-green-400" },
                    { label: "In Progress", val: inProgress, cls: "bg-orange-400" },
                  ].filter(x => x.val > 0).map(x => (
                    <span key={x.label} className="flex items-center gap-1 text-[9px] text-muted-foreground">
                      <span className={`w-1.5 h-1.5 rounded-full ${x.cls}`} />
                      {x.label} ({x.val})
                    </span>
                  ))}
                </div>
              </div>

              {qbankMastery !== null && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-muted-foreground font-medium">
                      QBank Mastery
                      <span className="ml-1 text-[9px] text-muted-foreground/60">({qbankMastery.correct}/{qbankMastery.total} correct)</span>
                    </span>
                    <span className={`text-[10px] font-bold ${qbankMastery.pct >= 70 ? "text-emerald-600" : qbankMastery.pct >= 50 ? "text-orange-500" : "text-red-500"}`}>
                      {qbankMastery.pct}%
                    </span>
                  </div>
                  <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all ${qbankMastery.pct >= 70 ? "bg-emerald-500" : qbankMastery.pct >= 50 ? "bg-orange-400" : "bg-red-400"}`}
                      style={{ width: `${qbankMastery.pct}%` }}
                    />
                  </div>
                  <p className="text-[9px] text-muted-foreground mt-0.5">Based on QBank questions tagged "{subjectLabel}"</p>
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {totalMinutes > 0 && (
        <div className="rounded-lg bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 px-3 py-2 text-xs text-violet-700 dark:text-violet-300 flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          Time remaining: <strong>{formatMinutes(totalMinutes)}</strong> across{" "}
          {topics.filter(t => t.status !== "Done" && t.status !== "Revised").length} topics
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search topics…"
            className="pl-8 h-8 text-sm"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <Button size="sm" variant="outline" onClick={handleExportCSV} title="Export CSV" className="h-8 px-2.5 shrink-0">
          <Download className="h-3.5 w-3.5" />
        </Button>
        <Button size="sm" onClick={openAdd} className="h-8 px-2.5 shrink-0">
          <Plus className="h-3.5 w-3.5 mr-1" /> Add
        </Button>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-1.5">
        {(["Not Started", "In Progress", "Done", "Revised"] as Status[]).map(s => (
          <button
            key={s}
            onClick={() => toggleStatusFilter(s)}
            className={`px-2 py-0.5 rounded-full text-[10px] font-medium border transition-all ${
              statusFilter.includes(s) ? STATUS_COLORS[s] + " border-current" : "border-border text-muted-foreground hover:bg-accent"
            }`}
          >
            {s}
          </button>
        ))}
        {(["High", "Medium", "Low"] as Priority[]).map(p => (
          <button
            key={p}
            onClick={() => togglePriorityFilter(p)}
            className={`px-2 py-0.5 rounded-full text-[10px] font-medium border transition-all ${
              priorityFilter.includes(p) ? PRIORITY_COLORS[p] + " border-current" : "border-border text-muted-foreground hover:bg-accent"
            }`}
          >
            {p}
          </button>
        ))}
        {anyFilter && (
          <button
            onClick={() => { setSearch(""); setStatusFilter([]); setPriorityFilter([]); }}
            className="px-2 py-0.5 rounded-full text-[10px] font-medium border border-red-200 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
          >
            Clear filters
          </button>
        )}
      </div>
      <div className="text-xs text-muted-foreground">
        {anyFilter ? `Showing ${filtered.length} of ${topics.length}` : `${topics.length} topic${topics.length !== 1 ? "s" : ""}`}
      </div>

      {/* Topic list */}
      {filtered.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground text-sm">
          {topics.length === 0 ? (
            <><p className="font-medium">No topics yet</p><p className="text-xs mt-1">Click "Add" to get started.</p></>
          ) : (
            <p>No topics match your filters.</p>
          )}
        </div>
      ) : (
        <motion.div
          className="space-y-1.5"
          initial="hidden"
          animate="visible"
          variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.055 } } }}
        >
          {filtered.map(t => {
            const isExpanded = expanded.has(t.id);
            const hasExtra = hasDetails(t);
            const isDeleteConfirm = deleteConfirmId === t.id;
            return (
              <motion.div
                key={t.id}
                variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] } } }}
                className={`rounded-xl border backdrop-blur-sm transition-colors ${
                  selected.has(t.id) ? "border-primary/50 bg-primary/5" : "border-border/50 bg-card/70 hover:bg-accent/30"
                }`}
              >
                {/* Main row */}
                <div className="flex items-start gap-2.5 p-3">
                  <Checkbox
                    checked={selected.has(t.id)}
                    onCheckedChange={() => toggleSelect(t.id)}
                    className="mt-0.5 shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm leading-tight">{t.name}</p>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      <button
                        onClick={() => cycleStatus(t)}
                        title="Click to cycle status"
                        className={`px-1.5 py-0.5 rounded-md text-[10px] font-medium transition-colors ${STATUS_COLORS[t.status]}`}
                      >
                        {t.status}
                      </button>
                      <button
                        onClick={() => cyclePriority(t)}
                        title="Click to cycle priority"
                        className={`px-1.5 py-0.5 rounded-md text-[10px] font-medium transition-colors ${PRIORITY_COLORS[t.priority]}`}
                      >
                        {t.priority}
                      </button>
                      <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-medium ${DIFFICULTY_COLORS[t.difficultyLevel]}`}>
                        {t.difficultyLevel}
                      </span>
                      {(t.estimatedMinutes ?? 0) > 0 && (
                        <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                          <Clock className="h-2.5 w-2.5" />
                          {formatMinutes(t.estimatedMinutes ?? 0)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {hasExtra && (
                      <button
                        onClick={() => toggleExpand(t.id)}
                        title={isExpanded ? "Collapse details" : "Expand details"}
                        className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-accent text-muted-foreground hover:text-foreground"
                      >
                        {isExpanded
                          ? <ChevronUp className="h-3.5 w-3.5" />
                          : <ChevronDown className="h-3.5 w-3.5" />
                        }
                      </button>
                    )}
                    <button
                      onClick={() => openEdit(t)}
                      className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-accent text-muted-foreground hover:text-foreground"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    {isDeleteConfirm ? (
                      <>
                        <button
                          onClick={() => deleteTopic(t.id)}
                          className="h-7 px-2 rounded-lg text-[10px] font-medium bg-red-500 text-white hover:bg-red-600"
                        >
                          Delete?
                        </button>
                        <button
                          onClick={() => setDeleteConfirmId(null)}
                          className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-accent text-muted-foreground"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirmId(t.id)}
                        className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-red-50 dark:hover:bg-red-950/30 text-muted-foreground hover:text-red-500"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Expandable detail row */}
                {isExpanded && hasExtra && (
                  <div className="px-3 pb-3 pt-0 border-t mx-3 mb-1">
                    <div className="flex flex-wrap gap-x-4 gap-y-1 pt-2">
                      {t.universityLecturer && (
                        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <BookOpen className="h-3 w-3 shrink-0" />
                          {t.universityLecturer}
                        </span>
                      )}
                      {t.from && (
                        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <FileText className="h-3 w-3 shrink-0" />
                          From: {t.from}
                        </span>
                      )}
                      {t.filesAndMedia && (
                        <a
                          href={t.filesAndMedia} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 text-[11px] text-primary hover:underline"
                          onClick={e => e.stopPropagation()}
                        >
                          <ExternalLink className="h-3 w-3 shrink-0" /> Files
                        </a>
                      )}
                      {t.videoLink && (
                        <a
                          href={t.videoLink} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 text-[11px] text-primary hover:underline"
                          onClick={e => e.stopPropagation()}
                        >
                          <Video className="h-3 w-3 shrink-0" /> Video
                        </a>
                      )}
                      {t.amboss && (
                        <a
                          href={t.amboss} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 text-[11px] text-primary hover:underline"
                          onClick={e => e.stopPropagation()}
                        >
                          <ExternalLink className="h-3 w-3 shrink-0" /> Amboss
                        </a>
                      )}
                    </div>
                    {t.notes && (
                      <div className="flex items-start gap-1.5 mt-2">
                        <StickyNote className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
                        <p className="text-[11px] text-muted-foreground leading-relaxed">{t.notes}</p>
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-20 md:bottom-4 left-1/2 -translate-x-1/2 z-[60] w-full max-w-sm px-4">
          <div className="rounded-2xl border bg-popover shadow-2xl p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">{selected.size} selected</span>
              <div className="flex gap-2 text-xs">
                <button onClick={() => setSelected(new Set(filtered.map(t => t.id)))} className="text-primary hover:underline">All</button>
                <button onClick={() => setSelected(new Set())} className="text-muted-foreground hover:underline">None</button>
              </div>
            </div>
            <div className="flex gap-2">
              <Select value={bulkStatus} onValueChange={v => { setBulkStatus(v as Status); applyBulkStatus(v as Status); }}>
                <SelectTrigger className="h-8 text-xs flex-1">
                  <SelectValue placeholder="Set Status →" />
                </SelectTrigger>
                <SelectContent>
                  {(["Not Started", "In Progress", "Done", "Revised"] as Status[]).map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={bulkPriority} onValueChange={v => { setBulkPriority(v as Priority); applyBulkPriority(v as Priority); }}>
                <SelectTrigger className="h-8 text-xs flex-1">
                  <SelectValue placeholder="Set Priority →" />
                </SelectTrigger>
                <SelectContent>
                  {(["High", "Medium", "Low"] as Priority[]).map(p => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              {bulkDeleteConfirm ? (
                <>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="flex-1 h-8 text-xs"
                    onClick={deleteSelected}
                  >
                    Confirm Delete {selected.size}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setBulkDeleteConfirm(false)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 h-8 text-xs text-red-500 border-red-200 hover:bg-red-50 dark:hover:bg-red-950/30"
                  onClick={() => setBulkDeleteConfirm(true)}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                  Delete Selected
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={v => { setDialogOpen(v); if (!v) setEditingId(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Topic" : `Add Topic — ${subjectLabel}`}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <div className="space-y-1.5">
              <Label>Topic Name *</Label>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Acne Vulgaris"
                autoFocus
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as Status }))}>
                  <SelectTrigger className="text-xs h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(["Not Started","In Progress","Done","Revised"] as Status[]).map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v as Priority }))}>
                  <SelectTrigger className="text-xs h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(["Low","Medium","High"] as Priority[]).map(p => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Difficulty</Label>
                <Select value={form.difficultyLevel} onValueChange={v => setForm(f => ({ ...f, difficultyLevel: v as Difficulty }))}>
                  <SelectTrigger className="text-xs h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(["Easy","Medium","Hard"] as Difficulty[]).map(d => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Est. Study Time (mins)</Label>
              <Input
                type="number" min={0} max={300}
                value={form.estimatedMinutes}
                onChange={e => setForm(f => ({ ...f, estimatedMinutes: parseInt(e.target.value) || 0 }))}
                className="h-8"
              />
            </div>
            {[
              { key: "universityLecturer", label: "University Lecturer", placeholder: "Dr. Smith" },
              { key: "filesAndMedia", label: "Files & Media (URL)", placeholder: "https://notability.com/…" },
              { key: "videoLink", label: "Video Link (URL)", placeholder: "https://youtube.com/…" },
              { key: "amboss", label: "Amboss Link", placeholder: "https://amboss.com/…" },
              { key: "from", label: "From / Source", placeholder: "Lecture / Textbook / Online" },
            ].map(({ key, label, placeholder }) => (
              <div key={key} className="space-y-1.5">
                <Label>{label}</Label>
                <Input
                  value={(form as unknown as Record<string, string>)[key]}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="h-8 text-sm"
                />
              </div>
            ))}
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                rows={3}
                className="text-sm resize-none"
                placeholder="Any additional notes…"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button className="flex-1" disabled={!form.name.trim()} onClick={saveTopic}>
                {editingId ? "Save Changes" : "Add Topic"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
