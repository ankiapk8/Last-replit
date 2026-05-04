import { motion, AnimatePresence } from "framer-motion";
import { Check } from "lucide-react";

export type GenStage = 0 | 1 | 2 | 3;

const STAGES = [
  { label: "Extracting text" },
  { label: "Detecting figures" },
  { label: "Generating cards" },
  { label: "Done" },
] as const;

function getStageFromMessage(message: string, percent: number): GenStage {
  const msg = message.toLowerCase();
  if (percent >= 100) return 3;
  if (msg.includes("saving") || msg.includes("database")) return 2;
  if (msg.includes("generating") || msg.includes("writing") || msg.includes("cards") || percent >= 12) return 2;
  if (msg.includes("analyzing") || msg.includes("cropping") || msg.includes("image") || msg.includes("visual") || msg.includes("figure") || msg.includes("detecting")) return 1;
  return 0;
}

export function stageFromGenerating(percent: number, message: string): GenStage {
  return getStageFromMessage(message, percent);
}

export function GenerationStageStepper({
  activeStage,
  accentColor = "emerald",
}: {
  activeStage: GenStage;
  accentColor?: "emerald" | "violet";
}) {
  const activeClass = accentColor === "violet"
    ? "bg-violet-500 border-violet-500 text-white shadow-[0_0_8px_2px_hsl(270_80%_60%/0.35)]"
    : "bg-emerald-500 border-emerald-500 text-white shadow-[0_0_8px_2px_hsl(150_60%_50%/0.35)]";
  const doneClass = accentColor === "violet"
    ? "bg-violet-500/20 border-violet-500/60 text-violet-600 dark:text-violet-400"
    : "bg-emerald-500/20 border-emerald-500/60 text-emerald-600 dark:text-emerald-400";
  const lineActive = accentColor === "violet" ? "bg-violet-500/50" : "bg-emerald-500/50";

  return (
    <div className="flex items-center gap-0.5">
      {STAGES.map((stage, i) => {
        const isDone = i < activeStage;
        const isActive = i === activeStage;
        const isFuture = i > activeStage;
        return (
          <div key={stage.label} className="flex items-center gap-0.5 flex-1 min-w-0">
            <div className="flex flex-col items-center gap-0.5 shrink-0">
              <motion.div
                layout
                className={`h-5 w-5 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${
                  isDone ? doneClass :
                  isActive ? activeClass :
                  "bg-muted border-border text-muted-foreground"
                }`}
              >
                <AnimatePresence mode="wait" initial={false}>
                  {isDone ? (
                    <motion.div
                      key="check"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0 }}
                      transition={{ duration: 0.2, type: "spring", stiffness: 400 }}
                    >
                      <Check className="h-2.5 w-2.5 stroke-[3]" />
                    </motion.div>
                  ) : isActive ? (
                    <motion.div
                      key="dot"
                      initial={{ scale: 0 }}
                      animate={{ scale: [1, 1.3, 1] }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                      className="h-2 w-2 rounded-full bg-current"
                    />
                  ) : (
                    <motion.span
                      key="num"
                      className="text-[8px] font-bold leading-none"
                    >
                      {i + 1}
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.div>
              <span className={`text-[9px] font-medium whitespace-nowrap transition-colors ${
                isDone ? (accentColor === "violet" ? "text-violet-600 dark:text-violet-400" : "text-emerald-600 dark:text-emerald-400") :
                isActive ? "text-foreground" :
                "text-muted-foreground/50"
              }`}>
                {stage.label}
              </span>
            </div>
            {i < STAGES.length - 1 && (
              <div className={`flex-1 h-px mx-0.5 transition-all duration-500 ${isDone ? lineActive : "bg-border/50"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
