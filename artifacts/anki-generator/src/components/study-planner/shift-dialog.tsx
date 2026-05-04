import { useState } from "react";
import { CalendarClock, MoveRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isoDate, type ScheduledItem } from "@/lib/study-planner/topics";

interface Props {
  items: ScheduledItem[];
  onShift: (items: ScheduledItem[], targetDate: Date) => void;
  onDismiss: () => void;
  onRedistribute?: (items: ScheduledItem[]) => void;
}

export function ShiftDialog({ items, onShift, onDismiss, onRedistribute }: Props) {
  const [choice, setChoice] = useState<"today" | "tomorrow" | "custom">("today");
  const [customDate, setCustomDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return isoDate(d);
  });

  const getTargetDate = (): Date => {
    if (choice === "today") return new Date();
    if (choice === "tomorrow") { const d = new Date(); d.setDate(d.getDate() + 1); return d; }
    const d = new Date(customDate + "T00:00:00");
    return isNaN(d.getTime()) ? new Date() : d;
  };

  const displayItems = items.slice(0, 8);
  const extra = items.length - displayItems.length;

  return (
    <div className="fixed inset-0 z-[210] flex items-end sm:items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}>
      <div className="w-full max-w-sm bg-background rounded-2xl border shadow-2xl overflow-hidden">
        <div className="h-1 w-full bg-gradient-to-r from-amber-400 via-orange-400 to-red-400" />
        <div className="px-4 pt-4 pb-4 space-y-3">

          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center shrink-0">
                <CalendarClock className="h-4.5 w-4.5 text-orange-600 dark:text-orange-400" style={{ width: 18, height: 18 }} />
              </div>
              <div>
                <p className="text-sm font-bold leading-tight">Unfinished Topics</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {items.length} topic{items.length !== 1 ? "s" : ""} from past days
                </p>
              </div>
            </div>
            <button onClick={onDismiss}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex flex-col gap-1 max-h-36 overflow-y-auto">
            {displayItems.map((item, i) => (
              <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-muted/40 text-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0" />
                <span className="truncate font-medium">{item.topic.name}</span>
                <span className="ml-auto text-muted-foreground shrink-0">{item.subjectLabel}</span>
              </div>
            ))}
            {extra > 0 && (
              <p className="text-[10px] text-muted-foreground text-center py-0.5">+ {extra} more</p>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold">Shift to:</p>
            <div className="flex gap-2">
              {(["today", "tomorrow", "custom"] as const).map(opt => (
                <button key={opt}
                  onClick={() => setChoice(opt)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                    choice === opt
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted/40 text-muted-foreground border-border hover:bg-accent"
                  }`}>
                  {opt.charAt(0).toUpperCase() + opt.slice(1)}
                </button>
              ))}
            </div>
            {choice === "custom" && (
              <Input type="date" value={customDate}
                onChange={e => setCustomDate(e.target.value)}
                className="h-8 text-xs" />
            )}
          </div>

          <div className="flex gap-2 pt-1">
            <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={onDismiss}>
              Skip today
            </Button>
            <Button size="sm" className="flex-1 gap-1.5 text-xs" onClick={() => onShift(items, getTargetDate())}>
              <MoveRight className="h-3.5 w-3.5" />
              Shift {items.length} topic{items.length !== 1 ? "s" : ""}
            </Button>
          </div>

          {onRedistribute && (
            <button
              onClick={() => onRedistribute(items)}
              className="w-full text-center text-[11px] text-muted-foreground hover:text-foreground py-1 transition-colors underline-offset-2 hover:underline"
            >
              Redistribute evenly across remaining schedule days
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
