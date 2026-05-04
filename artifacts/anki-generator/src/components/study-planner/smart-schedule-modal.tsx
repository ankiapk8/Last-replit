import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import type { Deck } from "@workspace/api-client-react/src/generated/api.schemas";
import { apiUrl } from "@/lib/utils";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Wand2, ChevronLeft, Trash2, CalendarCheck, Loader2,
  Check, RefreshCw, BookOpen,
} from "lucide-react";
import {
  generateSmartSchedule, saveSmartSchedule, clearSmartSchedule, getSmartSchedule,
  isoDateSS,
  type SmartSchedule, type SmartScheduleDay, type SmartScheduleDeckSlot, type DeckInfo,
} from "@/lib/smart-schedule";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON_FIRST = [1, 2, 3, 4, 5, 6, 0];

function fmtDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function isoToday(): string {
  return isoDateSS(new Date());
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

interface WeekRow {
  weekLabel: string;
  cells: { date: string; day: SmartScheduleDay | null; available: boolean }[];
}

function buildWeekRows(days: SmartScheduleDay[], availableDays: number[]): WeekRow[] {
  if (days.length === 0) return [];
  const dayMap = new Map<string, SmartScheduleDay>();
  days.forEach(d => dayMap.set(d.date, d));

  const first = new Date(days[0].date + "T00:00:00");
  const last = new Date(days[days.length - 1].date + "T00:00:00");
  const dayOfWeek = first.getDay();
  const mondayOffset = (dayOfWeek + 6) % 7;
  const weekStart = addDays(first, -mondayOffset);

  const rows: WeekRow[] = [];
  const availSet = new Set(availableDays);

  let cur = new Date(weekStart);
  while (cur <= last) {
    const cells = MON_FIRST.map(dow => {
      const idx = MON_FIRST.indexOf(dow);
      const d = addDays(cur, idx);
      const iso = isoDateSS(d);
      return { date: iso, day: dayMap.get(iso) ?? null, available: availSet.has(d.getDay()) };
    });
    const hasAny = cells.some(c => c.day !== null);
    if (hasAny) {
      rows.push({
        weekLabel: cur.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        cells,
      });
    }
    cur = addDays(cur, 7);
  }
  return rows;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onScheduleChange?: () => void;
}

type Step = "setup" | "schedule";

export function SmartScheduleModal({ open, onOpenChange, onScheduleChange }: Props) {
  const today = isoToday();

  const { data: rawDecks, isLoading: decksLoading } = useQuery<Deck[]>({
    queryKey: ["/api/decks"],
    queryFn: async () => {
      const r = await fetch(apiUrl("api/decks"));
      if (!r.ok) return [];
      return r.json();
    },
    staleTime: 1000 * 60 * 5,
    enabled: open,
  });

  const availableDecks = useMemo(() => {
    if (!rawDecks) return [];
    return rawDecks
      .filter(d => !d.parentId && d.kind === "deck" && d.cardCount > 0)
      .sort((a, b) => b.cardCount - a.cardCount);
  }, [rawDecks]);

  const [step, setStep] = useState<Step>("setup");

  const defaultExamDate = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 2);
    return isoDateSS(d);
  }, []);

  const [examDate, setExamDate] = useState(defaultExamDate);
  const [availableDays, setAvailableDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [selectedDeckIds, setSelectedDeckIds] = useState<Set<number>>(new Set());
  const [editedDays, setEditedDays] = useState<SmartScheduleDay[]>([]);
  const [currentSchedule, setCurrentSchedule] = useState<SmartSchedule | null>(null);

  const [dragging, setDragging] = useState<{ fromDate: string; slotId: string } | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);

  useEffect(() => {
    if (availableDecks.length > 0 && selectedDeckIds.size === 0) {
      setSelectedDeckIds(new Set(availableDecks.map(d => d.id)));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableDecks]);

  useEffect(() => {
    if (!open) return;
    const saved = getSmartSchedule();
    if (saved) {
      setCurrentSchedule(saved);
      setEditedDays(saved.days.map(d => ({ ...d, slots: [...d.slots] })));
      setExamDate(saved.config.examDate);
      setAvailableDays(saved.config.availableDays);
      setStep("schedule");
    } else {
      setCurrentSchedule(null);
      setEditedDays([]);
      setStep("setup");
    }
  }, [open]);

  function handleGenerate() {
    const selected = availableDecks.filter(d => selectedDeckIds.has(d.id));
    if (selected.length === 0 || !examDate || examDate <= today) return;
    const deckInfos: DeckInfo[] = selected.map(d => ({
      id: d.id, name: d.name, cardCount: d.cardCount,
    }));
    const generated = generateSmartSchedule(
      deckInfos,
      new Date(examDate + "T00:00:00"),
      availableDays,
      new Date(today + "T00:00:00"),
    );
    setCurrentSchedule(generated);
    setEditedDays(generated.days.map(d => ({ ...d, slots: [...d.slots] })));
    setStep("schedule");
  }

  function handleSave() {
    if (!currentSchedule) return;
    const toSave: SmartSchedule = { ...currentSchedule, days: editedDays };
    saveSmartSchedule(toSave);
    onScheduleChange?.();
    onOpenChange(false);
  }

  function handleClear() {
    clearSmartSchedule();
    setCurrentSchedule(null);
    setEditedDays([]);
    onScheduleChange?.();
    setStep("setup");
  }

  function handleDragStart(fromDate: string, slotId: string) {
    setDragging({ fromDate, slotId });
  }

  function handleDragOver(e: React.DragEvent, date: string) {
    e.preventDefault();
    setDragOverDate(date);
  }

  function handleDrop(e: React.DragEvent, toDate: string) {
    e.preventDefault();
    if (!dragging) { setDragOverDate(null); return; }
    if (dragging.fromDate !== toDate) {
      setEditedDays(prev => {
        const next = prev.map(d => ({ ...d, slots: [...d.slots] }));
        const from = next.find(d => d.date === dragging.fromDate);
        let to = next.find(d => d.date === toDate);
        if (!from) return prev;
        if (!to) {
          next.push({ date: toDate, slots: [] });
          to = next[next.length - 1];
          next.sort((a, b) => a.date.localeCompare(b.date));
        }
        const idx = from.slots.findIndex(s => s.slotId === dragging.slotId);
        if (idx === -1) return prev;
        const [moved] = from.slots.splice(idx, 1);
        to!.slots.push(moved);
        return next;
      });
    }
    setDragging(null);
    setDragOverDate(null);
  }

  function handleDragEnd() {
    setDragging(null);
    setDragOverDate(null);
  }

  const weekRows = useMemo(() => buildWeekRows(editedDays, availableDays), [editedDays, availableDays]);

  const totalSessions = useMemo(() => editedDays.reduce((s, d) => s + d.slots.length, 0), [editedDays]);
  const activeDays = useMemo(() => editedDays.filter(d => d.slots.length > 0).length, [editedDays]);

  const canGenerate = examDate > today && availableDays.length > 0 && selectedDeckIds.size > 0;

  const toggleDayOfWeek = (day: number) => {
    setAvailableDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day],
    );
  };

  const toggleDeck = (id: number) => {
    setSelectedDeckIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-full max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden rounded-2xl">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border/60 shrink-0">
          <div
            className="flex items-center justify-center h-9 w-9 rounded-xl shrink-0"
            style={{ background: "hsl(38 95% 60% / 0.15)", boxShadow: "0 0 12px hsl(38 95% 60% / 0.22)" }}
          >
            <Wand2 className="h-4 w-4" style={{ color: "#fb923c" }} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-base leading-tight">Smart Schedule</h2>
            <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
              {step === "setup"
                ? "Configure your exam date and available study days"
                : "Drag sessions between days to adjust · Save when ready"}
            </p>
          </div>
          {step === "schedule" && (
            <Button
              variant="ghost" size="sm"
              className="text-xs gap-1 h-8 shrink-0 text-muted-foreground"
              onClick={() => setStep("setup")}
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Back
            </Button>
          )}
        </div>

        <AnimatePresence mode="wait" initial={false}>
          {step === "setup" ? (
            <motion.div
              key="setup"
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col flex-1 min-h-0 overflow-hidden"
            >
              <ScrollArea className="flex-1">
                <div className="space-y-5 px-5 py-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Exam / Target Date</Label>
                    <Input
                      type="date"
                      value={examDate}
                      min={today}
                      onChange={e => setExamDate(e.target.value)}
                      className="h-9 text-sm"
                    />
                    {examDate && examDate <= today && (
                      <p className="text-[11px] text-destructive">Exam date must be in the future.</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-semibold">Available Study Days</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {MON_FIRST.map(day => (
                        <button
                          key={day}
                          type="button"
                          onClick={() => toggleDayOfWeek(day)}
                          className={`h-8 px-3 rounded-lg text-xs font-semibold transition-all border ${
                            availableDays.includes(day)
                              ? "bg-orange-500 text-white border-orange-500 shadow-sm"
                              : "bg-muted text-muted-foreground border-border hover:border-orange-400/70"
                          }`}
                        >
                          {DAY_LABELS[day]}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold">Decks to Include</Label>
                      {availableDecks.length > 0 && (
                        <button
                          type="button"
                          className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                          onClick={() => {
                            setSelectedDeckIds(
                              selectedDeckIds.size === availableDecks.length
                                ? new Set()
                                : new Set(availableDecks.map(d => d.id)),
                            );
                          }}
                        >
                          {selectedDeckIds.size === availableDecks.length ? "Deselect all" : "Select all"}
                        </button>
                      )}
                    </div>

                    {decksLoading ? (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Loading decks…
                      </div>
                    ) : availableDecks.length === 0 ? (
                      <div className="flex items-center gap-2 rounded-xl border border-dashed p-4 text-center">
                        <BookOpen className="h-4 w-4 text-muted-foreground mx-auto" />
                        <p className="text-xs text-muted-foreground">
                          No flashcard decks found. Generate some decks first.
                        </p>
                      </div>
                    ) : (
                      <div className="rounded-xl border overflow-hidden">
                        {availableDecks.map((deck, idx) => (
                          <label
                            key={deck.id}
                            className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer select-none transition-colors hover:bg-muted/50 ${
                              idx < availableDecks.length - 1 ? "border-b border-border/50" : ""
                            } ${selectedDeckIds.has(deck.id) ? "bg-orange-50/50 dark:bg-orange-950/15" : ""}`}
                          >
                            <Checkbox
                              checked={selectedDeckIds.has(deck.id)}
                              onCheckedChange={() => toggleDeck(deck.id)}
                              className="data-[state=checked]:bg-orange-500 data-[state=checked]:border-orange-500 shrink-0"
                            />
                            <span className="flex-1 text-sm font-medium leading-snug line-clamp-1">{deck.name}</span>
                            <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
                              {deck.cardCount} cards
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </ScrollArea>

              <div className="px-5 py-3.5 border-t border-border/60 flex items-center justify-between shrink-0 bg-background">
                <p className="text-[11px] text-muted-foreground">
                  {selectedDeckIds.size} deck{selectedDeckIds.size !== 1 ? "s" : ""} ·{" "}
                  {availableDays.length} day{availableDays.length !== 1 ? "s" : ""}/week
                </p>
                <Button
                  onClick={handleGenerate}
                  disabled={!canGenerate || decksLoading}
                  className="gap-2 h-9 text-sm"
                  style={canGenerate ? { background: "#f97316", color: "#fff", border: "none" } : {}}
                >
                  <Wand2 className="h-3.5 w-3.5" />
                  Generate Schedule
                </Button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="schedule"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 16 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col flex-1 min-h-0 overflow-hidden"
            >
              <div className="px-5 py-2 bg-orange-50/70 dark:bg-orange-950/20 border-b border-orange-200/60 dark:border-orange-800/40 flex flex-wrap gap-x-4 gap-y-1 shrink-0">
                {[
                  { label: "study days", value: activeDays },
                  { label: "sessions", value: totalSessions },
                  { label: "decks", value: currentSchedule?.config.deckIds.length ?? 0 },
                ].map(s => (
                  <span key={s.label} className="flex items-baseline gap-1">
                    <span className="text-xs font-bold text-orange-700 dark:text-orange-400 tabular-nums">{s.value}</span>
                    <span className="text-[10px] text-muted-foreground">{s.label}</span>
                  </span>
                ))}
                {currentSchedule && (
                  <span className="flex items-baseline gap-1 ml-auto">
                    <CalendarCheck className="h-3 w-3 text-red-400 self-center" />
                    <span className="text-[10px] font-medium text-red-500">Exam {fmtDate(currentSchedule.config.examDate)}</span>
                  </span>
                )}
              </div>

              <ScrollArea className="flex-1">
                <div className="px-4 py-3 space-y-4">
                  {editedDays.length === 0 ? (
                    <div className="text-center py-10 space-y-2">
                      <p className="text-sm text-muted-foreground">No study days found.</p>
                      <p className="text-xs text-muted-foreground">Try selecting more available days or extending the exam date.</p>
                    </div>
                  ) : (
                    weekRows.map((week, wi) => (
                      <div key={wi} className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                            Week {wi + 1}
                          </span>
                          <span className="text-[10px] text-muted-foreground">· {week.weekLabel}</span>
                          <div className="flex-1 h-px bg-border/40" />
                        </div>

                        <div className="grid grid-cols-7 gap-px">
                          {["M", "T", "W", "T", "F", "S", "S"].map((lbl, i) => (
                            <div key={i} className="text-center text-[9px] text-muted-foreground font-medium pb-0.5 select-none">
                              {lbl}
                            </div>
                          ))}

                          {week.cells.map((cell, ci) => {
                            const isToday = cell.date === today;
                            const isOver = dragOverDate === cell.date;
                            const hasSessions = (cell.day?.slots.length ?? 0) > 0;
                            const dayNum = new Date(cell.date + "T00:00:00").getDate();

                            return (
                              <div
                                key={ci}
                                className={`min-h-[60px] rounded-lg border transition-all duration-150 p-1 overflow-hidden ${
                                  isOver
                                    ? "border-orange-400 bg-orange-50 dark:bg-orange-950/40 scale-[1.03] shadow-sm"
                                    : isToday && cell.available
                                    ? "border-orange-300 bg-orange-50/50 dark:bg-orange-950/20"
                                    : cell.available
                                    ? "border-border/60 bg-card/60"
                                    : "border-border/20 bg-muted/20"
                                }`}
                                onDragOver={e => handleDragOver(e, cell.date)}
                                onDrop={e => handleDrop(e, cell.date)}
                                onDragLeave={() => setDragOverDate(null)}
                              >
                                <div className={`text-[9px] font-semibold leading-none mb-1 ${
                                  isToday ? "text-orange-600" : cell.available ? "text-foreground/70" : "text-muted-foreground/40"
                                }`}>
                                  {dayNum}
                                </div>
                                <div className="flex flex-col gap-[2px]">
                                  {(cell.day?.slots ?? []).map(slot => (
                                    <div
                                      key={slot.slotId}
                                      draggable
                                      onDragStart={() => handleDragStart(cell.date, slot.slotId)}
                                      onDragEnd={handleDragEnd}
                                      title={`${slot.deckName} · ${slot.isReview ? "Review" : "Study"} · ${slot.cardCount} cards`}
                                      className={`rounded text-[7px] font-semibold px-0.5 py-[1px] cursor-grab active:cursor-grabbing truncate leading-tight transition-opacity select-none ${
                                        slot.isReview
                                          ? "bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300 border border-orange-200/80 dark:border-orange-700/40"
                                          : "bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 border border-blue-200/80 dark:border-blue-700/40"
                                      } ${dragging?.slotId === slot.slotId ? "opacity-30" : ""}`}
                                    >
                                      {slot.isReview ? "↩ " : ""}{slot.deckName.slice(0, 7)}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))
                  )}

                  <div className="flex items-center gap-3 pt-1 pb-2">
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-2.5 rounded-[3px] bg-blue-100 dark:bg-blue-900/50 border border-blue-200/80 dark:border-blue-700/40" />
                      <span className="text-[10px] text-muted-foreground">Initial study</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-2.5 rounded-[3px] bg-orange-100 dark:bg-orange-900/50 border border-orange-200/80 dark:border-orange-700/40" />
                      <span className="text-[10px] text-muted-foreground">Review</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground ml-auto">Drag chips to reschedule</span>
                  </div>
                </div>
              </ScrollArea>

              <div className="px-5 py-3 border-t border-border/60 flex items-center gap-2 shrink-0 bg-background">
                <Button
                  variant="ghost" size="sm"
                  className="h-8 text-xs gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/8"
                  onClick={handleClear}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Clear
                </Button>
                <div className="flex-1" />
                <Button
                  variant="outline" size="sm"
                  className="h-8 text-xs gap-1.5"
                  onClick={() => setStep("setup")}
                >
                  <RefreshCw className="h-3 w-3" />
                  Regenerate
                </Button>
                <Button
                  size="sm"
                  className="h-8 text-xs gap-1.5"
                  style={{ background: "#f97316", color: "#fff", border: "none" }}
                  onClick={handleSave}
                >
                  <Check className="h-3.5 w-3.5" />
                  Save Schedule
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
