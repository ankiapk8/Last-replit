import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useEffect } from "react";
import { cn } from "@/lib/utils";

interface BatteryProgressProps {
  value: number;
  className?: string;
  showSparks?: boolean;
}

export function BatteryProgress({ value, className, showSparks = true }: BatteryProgressProps) {
  const clamped = Math.max(0, Math.min(100, value));

  const mv = useMotionValue(clamped);
  const spring = useSpring(mv, { stiffness: 90, damping: 22, mass: 0.6 });
  const widthPct = useTransform(spring, (v) => `${v}%`);

  useEffect(() => {
    mv.set(clamped);
  }, [clamped, mv]);

  const fillColor =
    clamped >= 80
      ? "from-emerald-400 to-emerald-500"
      : clamped >= 40
      ? "from-lime-400 to-emerald-500"
      : clamped >= 15
      ? "from-amber-400 to-orange-500"
      : "from-rose-400 to-rose-500";

  const segmentCount = 12;

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <div className="relative flex-1 h-3 rounded-[4px] border border-border/80 bg-muted/40 overflow-hidden shadow-inner">
        <motion.div
          className={cn(
            "absolute inset-y-0 left-0 bg-gradient-to-r rounded-[3px]",
            fillColor,
          )}
          style={{ width: widthPct }}
        >
          <motion.div
            className="absolute inset-0 opacity-60"
            style={{
              backgroundImage:
                "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.55) 50%, transparent 100%)",
              backgroundSize: "200% 100%",
            }}
            animate={{ backgroundPosition: ["200% 0%", "-200% 0%"] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "linear" }}
          />
          {showSparks && clamped > 4 && clamped < 99 && (
            <motion.div
              className="absolute inset-y-0 right-0 w-1 bg-white/80 rounded-r"
              animate={{ opacity: [0.2, 1, 0.2] }}
              transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut" }}
            />
          )}
        </motion.div>

        <div className="absolute inset-0 flex pointer-events-none">
          {Array.from({ length: segmentCount - 1 }).map((_, i) => (
            <div
              key={i}
              className="flex-1 border-r border-background/35 last:border-r-0"
            />
          ))}
          <div className="flex-1" />
        </div>
      </div>

      <div className="h-1.5 w-1 rounded-r-sm bg-border/80" />
    </div>
  );
}
