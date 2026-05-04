import { useState, useRef, useEffect, useMemo } from "react";
import { ChevronLeft, Camera, CalendarIcon, Flag, FlagOff, CheckCircle2, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  type SubjectGroup, type Topic,
  computeSchedule, isoDate, PARENT_DOT_COLORS, STATUS_COLORS, PRIORITY_COLORS,
  CUSTOM_DOT_COLORS,
  writeStudyActivity, getDateOverrides,
  getDailyCheckState, toggleDailyCheck,
} from "@/lib/study-planner/topics";
import { useStudyTopicsContext } from "@/context/study-topics-context";

interface Props {
  groups: SubjectGroup[];
  topicsMap: Record<string, Topic[]>;
  startDate: Date;
  endDate: Date;
  spacing: number;
  weightByDifficulty: boolean;
  onStartDateChange?: (d: Date) => void;
  onEndDateChange?: (d: Date) => void;
}

const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function getDotColor(parentLabel: string): string {
  return PARENT_DOT_COLORS[parentLabel] ?? CUSTOM_DOT_COLORS["blue"] ?? "bg-gray-400";
}

function addMonths(d: Date, n: number): Date {
  const r = new Date(d); r.setMonth(r.getMonth() + n); return r;
}
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function daysInMonth(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

export function CalendarView({
  groups, topicsMap, startDate, endDate, spacing, weightByDifficulty,
  onStartDateChange, onEndDateChange,
}: Props) {
  const { upsertTopics } = useStudyTopicsContext();
  const calRef = useRef<HTMLDivElement>(null);
  const todayStr = isoDate(new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(todayStr);
  const [visibleMonth, setVisibleMonth] = useState(0);
  const [selectMode, setSelectMode] = useState<"start" | "end" | null>(null);
  const [overridesTick, setOverridesTick] = useState(0);
  const [checkedItems, setCheckedItems] = useState<Set<string>>(() => getDailyCheckState());

  useEffect(() => {
    const handler = () => setOverridesTick(t => t + 1);
    window.addEventListener("sp-overrides-updated", handler);
    return () => window.removeEventListener("sp-overrides-updated", handler);
  }, []);

  const scheduled = useMemo(
    () => computeSchedule(groups, topicsMap, startDate, endDate, spacing, weightByDifficulty),
    [groups, topicsMap, startDate, endDate, spacing, weightByDifficulty],
  );

  const byDay = useMemo(() => {
    const map: Record<string, typeof scheduled> = {};
    const overrides = getDateOverrides();
    for (const item of scheduled) {
      const override = overrides[item.topic.id];
      const k1 = override ?? isoDate(item.firstDate);
      const k2 = isoDate(item.secondDate);
      if (!map[k1]) map[k1] = [];
      map[k1].push(item);
      if (k2 !== k1) {
        if (!map[k2]) map[k2] = [];
        map[k2].push(item);
      }
    }
    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduled, overridesTick]);

  const startStr = isoDate(startDate);
  const endStr   = isoDate(endDate);

  const months = useMemo(() => {
    const list: Date[] = [];
    const s = startOfMonth(startDate);
    const e = startOfMonth(endDate);
    let cur = new Date(s);
    while (cur <= e) { list.push(new Date(cur)); cur = addMonths(cur, 1); }
    return list;
  }, [startDate, endDate]);

  const monthRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (months.length <= 1) return;
    const obs = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const idx = parseInt(entry.target.getAttribute("data-month-idx") ?? "0", 10);
          setVisibleMonth(idx);
        }
      }
    }, { threshold: 0.3 });
    monthRefs.current.forEach(r => r && obs.observe(r));
    return () => obs.disconnect();
  }, [months.length]);

  const scrollToMonth = (idx: number) =>
    monthRefs.current[idx]?.scrollIntoView({ behavior: "smooth", block: "start" });

  const scrollToToday = () => {
    const idx = months.findIndex(m =>
      m.getFullYear() === new Date().getFullYear() && m.getMonth() === new Date().getMonth()
    );
    if (idx >= 0) scrollToMonth(idx);
  };

  const saveAsImage = async () => {
    if (!calRef.current) return;
    const { default: html2canvas } = await import("html2canvas");
    const canvas = await html2canvas(calRef.current, { scale: 2, useCORS: true });
    const link = document.createElement("a");
    link.download = "study-calendar.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  const selectedItems = selectedDay ? (byDay[selectedDay] ?? []) : [];
  const todayItems = byDay[todayStr] ?? [];

  const cycleStatus = (item: typeof scheduled[0]) => {
    const statuses = ["Not Started","In Progress","Done","Revised"] as const;
    const topics = topicsMap[item.storageKey] ?? [];
    const t = topics.find(x => x.id === item.topic.id);
    if (!t) return;
    const idx = (statuses.indexOf(t.status) + 1) % statuses.length;
    const newStatus = statuses[idx];
    upsertTopics(item.storageKey, topics.map(x => x.id === t.id ? { ...x, status: newStatus } : x));
    if (newStatus === "Done" || newStatus === "Revised") writeStudyActivity();
  };

  const handleToggleCheck = (topicId: string) => {
    const next = toggleDailyCheck(topicId);
    setCheckedItems(new Set(next));
  };

  const handleDayClick = (dateStr: string) => {
    if (selectMode === "start") {
      const d = new Date(dateStr + "T00:00:00");
      onStartDateChange?.(d);
      setSelectMode(null);
    } else if (selectMode === "end") {
      const d = new Date(dateStr + "T00:00:00");
      onEndDateChange?.(d);
      setSelectMode(null);
    } else {
      setSelectedDay(prev => prev === dateStr ? null : dateStr);
    }
  };

  const todayCheckedCount = todayItems.filter(item => checkedItems.has(item.topic.id)).length;

  return (
    <div className="space-y-3">
      {/* Today's checklist panel — always visible if today has items */}
      {todayItems.length > 0 && (
        <div className="rounded-xl border border-orange-200/60 dark:border-orange-800/40 bg-orange-50/60 dark:bg-orange-950/20 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-md bg-orange-500/20 flex items-center justify-center">
                <CalendarIcon className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
              </div>
              <span className="text-sm font-semibold text-orange-900 dark:text-orange-200">Today's Topics</span>
              <span className="text-[11px] font-medium text-orange-600 dark:text-orange-400 bg-orange-100 dark:bg-orange-900/40 px-1.5 py-0.5 rounded-full">
                {todayCheckedCount}/{todayItems.length}
              </span>
            </div>
            {todayCheckedCount === todayItems.length && todayItems.length > 0 && (
              <span className="text-[11px] font-semibold text-orange-600 dark:text-orange-400 flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" /> All done!
              </span>
            )}
          </div>
          {/* Progress bar */}
          <div className="h-1.5 w-full bg-orange-200/60 dark:bg-orange-900/40 rounded-full overflow-hidden mb-3">
            <div
              className="h-full bg-orange-500 rounded-full transition-all duration-500"
              style={{ width: `${todayItems.length > 0 ? (todayCheckedCount / todayItems.length) * 100 : 0}%` }}
            />
          </div>
          <div className="space-y-1.5">
            {todayItems.map((item, i) => {
              const live = (topicsMap[item.storageKey] ?? []).find(t => t.id === item.topic.id) ?? item.topic;
              const isChecked = checkedItems.has(item.topic.id);
              return (
                <div key={i} className={`flex items-center gap-2.5 rounded-lg p-2 transition-all ${isChecked ? "opacity-60 bg-orange-50/60 dark:bg-orange-950/20" : "bg-white/70 dark:bg-black/20 border border-orange-100/60 dark:border-orange-900/30"}`}>
                  <button onClick={() => handleToggleCheck(item.topic.id)} className="shrink-0 text-orange-600 dark:text-orange-400 hover:scale-110 transition-transform">
                    {isChecked
                      ? <CheckCircle2 className="h-4 w-4 text-orange-500" />
                      : <Circle className="h-4 w-4" />
                    }
                  </button>
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${getDotColor(item.parentLabel)}`} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-semibold truncate ${isChecked ? "line-through text-muted-foreground" : ""}`}>{live.name}</p>
                    <p className="text-[10px] text-muted-foreground">{item.subjectLabel}</p>
                  </div>
                  <button
                    onClick={() => cycleStatus(item)}
                    className={`shrink-0 px-1.5 py-0.5 rounded-md text-[10px] font-medium transition-colors ${STATUS_COLORS[live.status]}`}
                  >
                    {live.status}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="outline" size="sm" onClick={scrollToToday} className="h-8 text-xs gap-1">
          <CalendarIcon className="h-3.5 w-3.5" /> Today
        </Button>
        {(onStartDateChange || onEndDateChange) && (
          <>
            <Button
              variant={selectMode === "start" ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectMode(m => m === "start" ? null : "start")}
              className="h-8 text-xs gap-1"
            >
              <Flag className="h-3.5 w-3.5 text-orange-500" />
              {selectMode === "start" ? "Click a date..." : "Set Start"}
            </Button>
            <Button
              variant={selectMode === "end" ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectMode(m => m === "end" ? null : "end")}
              className="h-8 text-xs gap-1"
            >
              <FlagOff className="h-3.5 w-3.5 text-orange-700" />
              {selectMode === "end" ? "Click a date..." : "Set End"}
            </Button>
          </>
        )}
        <Button variant="outline" size="sm" onClick={saveAsImage} className="h-8 text-xs gap-1 ml-auto">
          <Camera className="h-3.5 w-3.5" /> Save Image
        </Button>
        <span className="text-xs text-muted-foreground">
          {scheduled.length} scheduled
        </span>
      </div>

      {/* Range legend */}
      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm ring-2 ring-orange-500 bg-orange-50 dark:bg-orange-950/30" />
          Start {startStr}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm ring-2 ring-orange-700 bg-orange-950/30" />
          End {endStr}
        </span>
      </div>

      {/* Month tab strip */}
      {months.length > 1 && (
        <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
          {months.map((m, i) => (
            <button key={i} onClick={() => scrollToMonth(i)}
              className={`shrink-0 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                i === visibleMonth
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent"
              }`}>
              {MONTHS_SHORT[m.getMonth()]} {m.getFullYear() !== startDate.getFullYear() ? m.getFullYear() : ""}
            </button>
          ))}
        </div>
      )}

      {/* Calendar grid */}
      <div ref={calRef} className="space-y-6">
        {months.map((month, mi) => {
          const firstDay = month.getDay();
          const totalDays = daysInMonth(month);
          const cells = Array(firstDay).fill(null).concat(
            Array.from({ length: totalDays }, (_, i) => i + 1)
          );

          return (
            <div key={mi} ref={el => { monthRefs.current[mi] = el; }} data-month-idx={mi}>
              {mi > 0 && (
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-xs text-muted-foreground font-semibold">
                    {MONTHS[month.getMonth()].toUpperCase()} {month.getFullYear()}
                  </span>
                  <div className="h-px flex-1 bg-border" />
                </div>
              )}
              {mi === 0 && (
                <h3 className="text-sm font-semibold text-center mb-3">
                  {MONTHS[month.getMonth()].toUpperCase()} {month.getFullYear()}
                </h3>
              )}

              <div className="grid grid-cols-7 mb-1">
                {DAYS.map(d => (
                  <div key={d} className="text-center text-[10px] font-medium text-muted-foreground py-1">{d}</div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-px">
                {cells.map((day, ci) => {
                  if (!day) return <div key={ci} />;
                  const y = month.getFullYear();
                  const m2 = String(month.getMonth() + 1).padStart(2, "0");
                  const d2 = String(day).padStart(2, "0");
                  const dateStr = `${y}-${m2}-${d2}`;
                  const dayItems = byDay[dateStr] ?? [];
                  const isToday    = dateStr === todayStr;
                  const isSelected = dateStr === selectedDay;
                  const isStart    = dateStr === startStr;
                  const isEnd      = dateStr === endStr;
                  const isInRange  = dateStr > startStr && dateStr < endStr;
                  const isSelecting = !!selectMode;
                  const dayChecked = isToday ? dayItems.filter(i => checkedItems.has(i.topic.id)).length : 0;

                  return (
                    <button
                      key={ci}
                      onClick={() => handleDayClick(dateStr)}
                      title={isSelecting ? `Set as ${selectMode} date: ${dateStr}` : dateStr}
                      className={`relative aspect-square rounded-lg flex flex-col items-center justify-start pt-1 transition-colors text-xs
                        ${isStart    ? "ring-2 ring-orange-500 bg-orange-50 dark:bg-orange-950/30 z-10" :
                          isEnd      ? "ring-2 ring-orange-700 bg-orange-950/30 z-10" :
                          isSelected ? "bg-primary/15 border border-primary/40" :
                          isToday    ? "bg-orange-50 dark:bg-orange-950/20 border border-orange-300/50 dark:border-orange-700/40" :
                          isInRange  ? "bg-orange-50/60 dark:bg-orange-950/10" :
                          "hover:bg-accent"}
                        ${isSelecting ? "cursor-crosshair" : "cursor-pointer"}
                      `}
                    >
                      <span className={`font-medium text-[11px] leading-none ${
                        isStart    ? "text-orange-700 dark:text-orange-400 font-bold" :
                        isEnd      ? "text-orange-900 dark:text-orange-200 font-bold" :
                        isToday    ? "text-orange-700 dark:text-orange-400 font-bold" :
                        isSelected ? "text-primary" :
                        "text-foreground/70"
                      }`}>
                        {day}
                      </span>
                      {isStart && <span className="text-[7px] text-orange-600 dark:text-orange-400 font-bold leading-none mt-0.5">START</span>}
                      {isEnd   && <span className="text-[7px] text-orange-800 dark:text-orange-200 font-bold leading-none mt-0.5">END</span>}
                      {isToday && dayItems.length > 0 && (
                        <span className="text-[7px] text-orange-600 dark:text-orange-400 font-bold leading-none mt-0.5">
                          {dayChecked}/{dayItems.length}
                        </span>
                      )}
                      {dayItems.length > 0 && !isStart && !isEnd && !isToday && (
                        <div className="flex flex-wrap gap-0.5 mt-0.5 justify-center">
                          {dayItems.slice(0, 3).map((item, di) => (
                            <div
                              key={di}
                              className={`w-4 h-1.5 rounded-full ${getDotColor(item.parentLabel)}`}
                            />
                          ))}
                          {dayItems.length > 3 && (
                            <span className="text-[8px] text-muted-foreground">+{dayItems.length - 3}</span>
                          )}
                        </div>
                      )}
                      {dayItems.length > 0 && (isStart || isEnd) && (
                        <div className="flex flex-wrap gap-0.5 justify-center">
                          {dayItems.slice(0, 2).map((item, di) => (
                            <div
                              key={di}
                              className={`w-4 h-1.5 rounded-full ${getDotColor(item.parentLabel)}`}
                            />
                          ))}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Day detail panel */}
      {selectedDay && selectedDay !== todayStr && !selectMode && (
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">{selectedDay}</h3>
            <button onClick={() => setSelectedDay(null)} className="text-muted-foreground hover:text-foreground">
              <ChevronLeft className="h-4 w-4 rotate-180" />
            </button>
          </div>
          {selectedItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">No topics scheduled.</p>
          ) : (
            <div className="space-y-2">
              {selectedItems.map((item, i) => {
                const live = (topicsMap[item.storageKey] ?? []).find(t => t.id === item.topic.id) ?? item.topic;
                return (
                  <div key={i} className="flex items-center gap-2 rounded-lg border bg-background p-2">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${getDotColor(item.parentLabel)}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate">{live.name}</p>
                      <p className="text-[10px] text-muted-foreground">{item.subjectLabel}</p>
                    </div>
                    <button
                      onClick={() => cycleStatus(item)}
                      className={`shrink-0 px-1.5 py-0.5 rounded-md text-[10px] font-medium transition-colors ${STATUS_COLORS[live.status]}`}
                    >
                      {live.status}
                    </button>
                    <span className={`shrink-0 px-1.5 py-0.5 rounded-md text-[10px] font-medium ${PRIORITY_COLORS[live.priority]}`}>
                      {live.priority}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
