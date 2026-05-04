import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Sparkles } from "lucide-react";

type Props = {
  open: boolean;
  deckCount: number;
  cardCount: number;
  onClose: () => void;
  durationMs?: number;
};

export function GenerationSuccessOverlay({
  open,
  deckCount,
  cardCount,
  onClose,
  durationMs = 3000,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(onClose, durationMs);
    return () => window.clearTimeout(t);
  }, [open, durationMs, onClose]);

  const sparkles = useMemo(
    () =>
      Array.from({ length: 14 }).map((_, i) => ({
        id: i,
        angle: (i / 14) * Math.PI * 2,
        distance: 80 + Math.random() * 60,
        delay: Math.random() * 0.25,
        size: 6 + Math.random() * 10,
        hue: [180, 200, 260, 290, 330, 40][i % 6],
      })),
    [open],
  );

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="gen-success"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/55 backdrop-blur-sm"
          style={{ height: "100dvh" }}
          aria-live="polite"
          role="status"
        >
          <motion.div
            initial={{ scale: 0.6, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.85, opacity: 0, y: -10 }}
            transition={{ type: "spring", stiffness: 260, damping: 20 }}
            onClick={(e) => e.stopPropagation()}
            className="relative mx-4 flex w-[min(420px,calc(100vw-2rem))] flex-col items-center gap-4 rounded-3xl border border-white/15 bg-gradient-to-br from-emerald-500/20 via-background/95 to-violet-500/20 p-8 text-center shadow-2xl backdrop-blur-xl"
          >
            {/* radial sparkles */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl">
              {sparkles.map((s) => (
                <motion.span
                  key={s.id}
                  initial={{ x: 0, y: 0, opacity: 0, scale: 0 }}
                  animate={{
                    x: Math.cos(s.angle) * s.distance,
                    y: Math.sin(s.angle) * s.distance,
                    opacity: [0, 1, 0],
                    scale: [0, 1, 0.4],
                  }}
                  transition={{ duration: 1.4, delay: s.delay, ease: "easeOut" }}
                  className="absolute left-1/2 top-1/2"
                  style={{
                    width: s.size,
                    height: s.size,
                    marginLeft: -s.size / 2,
                    marginTop: -s.size / 2,
                    borderRadius: "9999px",
                    background: `hsl(${s.hue} 90% 65%)`,
                    boxShadow: `0 0 ${s.size}px hsl(${s.hue} 90% 65% / 0.8)`,
                  }}
                />
              ))}
            </div>

            {/* glowing check */}
            <motion.div
              initial={{ scale: 0, rotate: -90 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: 0.05, type: "spring", stiffness: 280, damping: 14 }}
              className="relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-[0_0_40px_rgba(16,185,129,0.55)]"
            >
              <motion.span
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: [0, 1.3, 1], opacity: 1 }}
                transition={{ delay: 0.2, duration: 0.5 }}
              >
                <Check className="h-10 w-10 text-white" strokeWidth={3} />
              </motion.span>
              <motion.span
                aria-hidden
                initial={{ scale: 1, opacity: 0.6 }}
                animate={{ scale: 1.6, opacity: 0 }}
                transition={{ duration: 1.1, repeat: 1, ease: "easeOut" }}
                className="absolute inset-0 rounded-full border-2 border-emerald-300"
              />
            </motion.div>

            <motion.div
              initial={{ y: 8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.25, duration: 0.3 }}
              className="space-y-1"
            >
              <h2 className="flex items-center justify-center gap-2 text-2xl font-bold tracking-tight">
                <Sparkles className="h-5 w-5 text-amber-400" />
                All done!
                <Sparkles className="h-5 w-5 text-amber-400" />
              </h2>
              <p className="text-sm text-muted-foreground">
                {deckCount === 1
                  ? "Generated 1 deck"
                  : `Generated ${deckCount} decks`}
                {cardCount > 0 && (
                  <>
                    {" · "}
                    <span className="font-semibold text-foreground">{cardCount}</span>{" "}
                    {cardCount === 1 ? "card" : "cards"} ready to study
                  </>
                )}
              </p>
            </motion.div>

            {/* shrinking timer bar */}
            <motion.div
              initial={{ scaleX: 1 }}
              animate={{ scaleX: 0 }}
              transition={{ duration: durationMs / 1000, ease: "linear" }}
              className="absolute bottom-0 left-0 h-1 w-full origin-left rounded-b-3xl bg-gradient-to-r from-emerald-400 via-cyan-400 to-violet-400"
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
