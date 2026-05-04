import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Loader2 } from "lucide-react";

interface GenerationProgressLogProps {
  messages: string[];
  isComplete?: boolean;
  accentColor?: "emerald" | "violet";
  maxHeight?: string;
}

export function GenerationProgressLog({
  messages,
  isComplete = false,
  accentColor = "emerald",
  maxHeight = "6.5rem",
}: GenerationProgressLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, isComplete]);

  if (messages.length === 0 && !isComplete) return null;

  const dotColor = accentColor === "violet" ? "bg-violet-500" : "bg-emerald-500";
  const textColor =
    accentColor === "violet"
      ? "text-violet-600 dark:text-violet-400"
      : "text-emerald-600 dark:text-emerald-400";
  const spinColor =
    accentColor === "violet" ? "text-violet-500" : "text-emerald-500";

  return (
    <div
      ref={scrollRef}
      className="overflow-y-auto rounded-lg bg-muted/40 border border-border/50 px-2.5 py-2 space-y-1 scroll-smooth"
      style={{ maxHeight }}
    >
      <AnimatePresence initial={false}>
        {messages.map((msg, i) => {
          const isLast = i === messages.length - 1 && !isComplete;
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className={`flex items-start gap-2 text-[11px] font-mono leading-snug ${
                isLast ? "text-foreground" : "text-muted-foreground/70"
              }`}
            >
              {isLast ? (
                <Loader2
                  className={`h-3 w-3 mt-0.5 shrink-0 animate-spin ${spinColor}`}
                />
              ) : (
                <div
                  className={`h-1.5 w-1.5 rounded-full mt-1 shrink-0 ${
                    isComplete && i === messages.length - 1
                      ? dotColor
                      : "bg-muted-foreground/30"
                  }`}
                />
              )}
              <span>{msg}</span>
            </motion.div>
          );
        })}
        {isComplete && (
          <motion.div
            key="done-line"
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.25 }}
            className={`flex items-center gap-2 text-[11px] font-mono font-medium ${textColor}`}
          >
            <CheckCircle2 className="h-3 w-3 shrink-0" />
            <span>Complete — reviewing cards…</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
