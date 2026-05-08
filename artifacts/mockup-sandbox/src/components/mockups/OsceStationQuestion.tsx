import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from "framer-motion";
import { cn } from "@/lib/utils";
import { osceStationData, type OsceStation } from "./data/fixtures";

// ── SVG Countdown Timer ──
function CountdownTimer({
  totalSeconds,
  isRunning,
  onComplete,
}: {
  totalSeconds: number;
  isRunning: boolean;
  onComplete: () => void;
}) {
  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!isRunning) {
      setElapsed(0);
      return;
    }
    const interval = setInterval(() => {
      setElapsed((prev) => {
        const next = prev + 1;
        if (next >= totalSeconds) {
          clearInterval(interval);
          onComplete();
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isRunning, totalSeconds, onComplete]);

  const remaining = Math.max(0, totalSeconds - elapsed);
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const progress = remaining / totalSeconds;
  const offset = circumference * (1 - progress);
  const isUrgent = remaining <= 30;

  return (
    <div className="relative w-24 h-24 flex items-center justify-center">
      <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full -rotate-90">
        {/* Track */}
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth="7"
          className="dark:stroke-gray-700"
        />
        {/* Progress arc */}
        <motion.circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke={isUrgent ? "#ef4444" : "#E55A2B"}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={circumference}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.5, ease: "linear" }}
        />
      </svg>
      <span
        className={cn(
          "text-lg font-bold tabular-nums z-10",
          isUrgent ? "text-red-500" : "text-gray-900 dark:text-white"
        )}
      >
        {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
      </span>
    </div>
  );
}

// ── Ripple Button ──
function RippleOption({
  option,
  index,
  isSelected,
  isCorrect,
  isRevealed,
  isWrong,
  onSelect,
}: {
  option: { id: string; label: string; text: string };
  index: number;
  isSelected: boolean;
  isCorrect: boolean;
  isRevealed: boolean;
  isWrong: boolean;
  onSelect: () => void;
}) {
  const [ripples, setRipples] = useState<{ x: number; y: number; id: number }[]>([]);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const id = Date.now();
    setRipples((prev) => [...prev, { x, y, id }]);
    setTimeout(() => setRipples((prev) => prev.filter((r) => r.id !== id)), 600);
    onSelect();
  };

  return (
    <motion.button
      initial={{ opacity: 0, x: -20 }}
      animate={
        isRevealed && isWrong ? { x: [-10, 10, -10, 0], opacity: 0.4 } : { opacity: 1, x: 0 }
      }
      transition={{ delay: index * 0.08, duration: 0.3 }}
      onClick={handleClick}
      disabled={isRevealed}
      className={cn(
        "relative w-full text-left px-4 py-3 rounded-xl border-2 overflow-hidden transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E55A2B] focus-visible:ring-offset-2",
        !isRevealed && "hover:border-[#E55A2B]/50 hover:bg-[#E55A2B]/5 cursor-pointer",
        isRevealed && isCorrect && "border-green-500 bg-green-50 dark:bg-green-950/30",
        isRevealed && isWrong && "border-red-300 dark:border-red-800",
        !isRevealed && isSelected && "border-[#E55A2B] bg-[#E55A2B]/5",
        !isRevealed && !isSelected && "border-gray-200 dark:border-gray-700"
      )}
    >
      {/* Ripple effects */}
      {ripples.map((ripple) => (
        <motion.span
          key={ripple.id}
          initial={{ scale: 0, opacity: 0.4 }}
          animate={{ scale: 4, opacity: 0 }}
          transition={{ duration: 0.6 }}
          className="absolute rounded-full bg-[#E55A2B]/20"
          style={{
            left: ripple.x - 10,
            top: ripple.y - 10,
            width: 20,
            height: 20,
          }}
        />
      ))}

      <div className="flex items-start gap-3 relative z-10">
        <span
          className={cn(
            "w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5",
            isRevealed && isCorrect && "border-green-500 bg-green-500 text-white",
            isRevealed && isWrong && "border-red-400 bg-red-400 text-white",
            !isRevealed && isSelected && "border-[#E55A2B] text-[#E55A2B]",
            !isRevealed && !isSelected && "border-gray-300 dark:border-gray-600 text-gray-500"
          )}
        >
          {option.label}
        </span>
        <span
          className={cn(
            "text-sm leading-relaxed",
            isRevealed && isCorrect && "text-green-800 dark:text-green-200 font-medium",
            isRevealed && isWrong && "text-gray-400",
            !isRevealed && "text-gray-700 dark:text-gray-300"
          )}
        >
          {option.text}
        </span>
      </div>

      {/* Correct answer glow */}
      <AnimatePresence>
        {isRevealed && isCorrect && (
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: [0.8, 1.05, 1], opacity: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            className="absolute inset-0 rounded-xl ring-2 ring-green-400 pointer-events-none"
          />
        )}
      </AnimatePresence>
    </motion.button>
  );
}

// ── CountUp Score ──
function CountUpScore({ value, label }: { value: number; label: string }) {
  const motionVal = useMotionValue(0);
  const display = useTransform(motionVal, (v) => Math.round(v));

  useEffect(() => {
    const controls = animate(motionVal, value, { duration: 1.2, ease: "easeOut" });
    return controls.stop;
  }, [value, motionVal]);

  const [displayValue, setDisplayValue] = useState(0);
  useEffect(() => {
    const unsubscribe = display.on("change", (v) => setDisplayValue(v));
    return unsubscribe;
  }, [display]);

  return (
    <div className="text-center">
      <div className="text-3xl font-bold text-[#E55A2B]">{displayValue}</div>
      <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
    </div>
  );
}

// ── Main Component ──
export function OsceStationQuestion() {
  const data = osceStationData;
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isRevealed, setIsRevealed] = useState(false);
  const [isTimerRunning, setIsTimerRunning] = useState(true);
  const [score, setScore] = useState(0);
  const [hasAnswered, setHasAnswered] = useState(false);

  const handleReveal = () => {
    if (selectedOption === null) return;
    setIsRevealed(true);
    setIsTimerRunning(false);
    setHasAnswered(true);
    if (selectedOption === data.options[data.correctIndex].id) {
      setScore(1);
    }
  };

  const handleReset = () => {
    setSelectedOption(null);
    setIsRevealed(false);
    setIsTimerRunning(true);
    setHasAnswered(false);
  };

  const handleTimerComplete = useCallback(() => {
    setIsTimerRunning(false);
    if (!hasAnswered) {
      setIsRevealed(true);
      setHasAnswered(true);
    }
  }, [hasAnswered]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-amber-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 p-4 md:p-8">
      <div className="max-w-3xl mx-auto">
        {/* Station Badge + Timer */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-6"
        >
          <div>
            <span className="inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-[#E55A2B] text-white mb-2">
              Station {data.stationNumber} — {data.specialty}
            </span>
            <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">
              {data.title}
            </h1>
          </div>
          <div className="flex flex-col items-center gap-1">
            <CountdownTimer
              totalSeconds={data.timeSeconds}
              isRunning={isTimerRunning}
              onComplete={handleTimerComplete}
            />
            <span className="text-xs text-gray-500 dark:text-gray-400">remaining</span>
          </div>
        </motion.div>

        {/* Score */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex justify-end mb-4"
        >
          <div className="bg-white dark:bg-gray-800 rounded-xl px-5 py-3 shadow-sm border border-gray-100 dark:border-gray-700">
            <CountUpScore value={score} label="Score" />
          </div>
        </motion.div>

        {/* Scenario Card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg shadow-[#E55A2B]/5 border border-orange-100 dark:border-orange-900/30 p-5 md:p-6 mb-6"
        >
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[#E55A2B] mb-3">
            Clinical Scenario
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            {data.scenario}
          </p>
        </motion.div>

        {/* Question */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-4"
        >
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3">
            {data.question}
          </h2>
        </motion.div>

        {/* Options */}
        <div className="space-y-3 mb-6" role="radiogroup" aria-label="Answer options">
          {data.options.map((option, index) => (
            <RippleOption
              key={option.id}
              option={option}
              index={index}
              isSelected={selectedOption === option.id}
              isCorrect={isRevealed && index === data.correctIndex}
              isRevealed={isRevealed}
              isWrong={isRevealed && selectedOption === option.id && index !== data.correctIndex}
              onSelect={() => !isRevealed && setSelectedOption(option.id)}
            />
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <AnimatePresence mode="wait">
            {!isRevealed ? (
              <motion.button
                key="reveal"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                onClick={handleReveal}
                disabled={selectedOption === null}
                className={cn(
                  "px-6 py-2.5 rounded-xl font-semibold text-sm transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E55A2B] focus-visible:ring-offset-2",
                  selectedOption !== null
                    ? "bg-[#E55A2B] text-white hover:bg-[#d14a1b] cursor-pointer"
                    : "bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed"
                )}
              >
                Reveal Answer
              </motion.button>
            ) : (
              <motion.button
                key="reset"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                onClick={handleReset}
                className="px-6 py-2.5 rounded-xl font-semibold text-sm bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 focus-visible:ring-offset-2"
              >
                Try Again
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {/* Explanation */}
        <AnimatePresence>
          {isRevealed && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              className="overflow-hidden"
            >
              <div className="mt-6 p-5 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                <h3 className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-2">
                  Explanation
                </h3>
                <p className="text-sm text-blue-700 dark:text-blue-400 leading-relaxed">
                  {data.explanation}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default OsceStationQuestion;
