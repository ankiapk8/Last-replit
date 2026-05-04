import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Smartphone, X, Home, Zap, BookOpen } from "lucide-react";

const STORAGE_KEY = "ankigen.apk-welcome-seen.v1";

function detectInApk() {
  if (typeof window === "undefined") return false;
  const w = window as unknown as {
    Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string };
  };
  return (
    !!w.Capacitor?.isNativePlatform?.() ||
    w.Capacitor?.getPlatform?.() === "android" ||
    w.Capacitor?.getPlatform?.() === "ios" ||
    document.referrer.startsWith("android-app://") ||
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.matchMedia?.("(display-mode: fullscreen)").matches ||
    // @ts-expect-error iOS only
    window.navigator.standalone === true ||
    /\bwv\b|AnkiGen/.test(navigator.userAgent)
  );
}

export function ApkWelcomeBanner() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!detectInApk()) return;
    try {
      if (localStorage.getItem(STORAGE_KEY)) return;
    } catch {
      // localStorage may be unavailable; show anyway
    }
    const t = setTimeout(() => setOpen(true), 600);
    return () => clearTimeout(t);
  }, []);

  const dismiss = () => {
    setOpen(false);
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          {/* Backdrop */}
          <motion.button
            type="button"
            aria-label="Dismiss welcome"
            onClick={dismiss}
            className="absolute inset-0 bg-black/55 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* Banner */}
          <motion.div
            role="dialog"
            aria-labelledby="apk-welcome-title"
            initial={{ y: 60, scale: 0.94, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 40, scale: 0.96, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 28, mass: 0.8 }}
            className="relative w-full max-w-md rounded-3xl overflow-hidden shadow-2xl"
          >
            {/* Animated gradient background */}
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500 via-primary to-lime-500" />
            <motion.div
              aria-hidden
              className="absolute -inset-20 opacity-60"
              style={{
                background:
                  "conic-gradient(from 0deg, hsl(150 60% 55% / 0.55), transparent 25%, hsl(95 65% 50% / 0.55), transparent 50%, hsl(160 70% 45% / 0.55), transparent 75%, hsl(150 60% 55% / 0.55))",
                filter: "blur(28px)",
              }}
              animate={{ rotate: 360 }}
              transition={{ duration: 14, repeat: Infinity, ease: "linear" }}
            />

            {/* Floating sparkle particles */}
            {Array.from({ length: 12 }).map((_, i) => (
              <motion.span
                key={i}
                aria-hidden
                className="absolute rounded-full bg-white"
                style={{
                  width: 3 + (i % 3) * 2,
                  height: 3 + (i % 3) * 2,
                  left: `${(i * 41) % 100}%`,
                  top: `${10 + ((i * 53) % 75)}%`,
                  opacity: 0.6,
                }}
                animate={{
                  y: [0, -14, 0],
                  opacity: [0.2, 0.85, 0.2],
                  scale: [0.8, 1.3, 0.8],
                }}
                transition={{
                  duration: 3 + (i % 4),
                  repeat: Infinity,
                  delay: i * 0.18,
                  ease: "easeInOut",
                }}
              />
            ))}

            {/* Subtle radial highlight */}
            <div
              aria-hidden
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  "radial-gradient(120% 60% at 50% 0%, rgba(255,255,255,0.45) 0%, transparent 60%)",
              }}
            />

            {/* Close */}
            <motion.button
              type="button"
              onClick={dismiss}
              aria-label="Close"
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
              className="absolute top-3 right-3 z-10 h-9 w-9 rounded-full bg-white/15 backdrop-blur-md border border-white/25 text-white flex items-center justify-center shadow-lg"
            >
              <X className="h-4 w-4" />
            </motion.button>

            {/* Content */}
            <div className="relative px-6 pt-8 pb-6 text-white">
              {/* Hero icon */}
              <motion.div
                initial={{ scale: 0, rotate: -25 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{
                  delay: 0.15,
                  type: "spring",
                  stiffness: 280,
                  damping: 16,
                }}
                className="mx-auto relative w-20 h-20 mb-4"
              >
                <motion.div
                  className="absolute inset-0 rounded-2xl bg-white/20 backdrop-blur-md border border-white/40 shadow-xl"
                  animate={{
                    boxShadow: [
                      "0 10px 30px rgba(0,0,0,0.25), 0 0 0 0 rgba(255,255,255,0.5)",
                      "0 10px 30px rgba(0,0,0,0.25), 0 0 0 14px rgba(255,255,255,0)",
                    ],
                  }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
                />
                <div className="relative w-full h-full flex items-center justify-center">
                  <BookOpen className="h-10 w-10" />
                </div>
                <motion.div
                  className="absolute -top-1 -right-1 h-7 w-7 rounded-full bg-white text-primary flex items-center justify-center shadow-md"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1, rotate: [0, 18, -12, 0] }}
                  transition={{
                    delay: 0.55,
                    type: "spring",
                    stiffness: 320,
                    damping: 14,
                    rotate: {
                      duration: 2.4,
                      repeat: Infinity,
                      repeatDelay: 1,
                      ease: "easeInOut",
                    },
                  }}
                >
                  <Sparkles className="h-4 w-4" />
                </motion.div>
              </motion.div>

              <motion.h2
                id="apk-welcome-title"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.45 }}
                className="text-center font-serif text-2xl font-bold tracking-tight"
              >
                Welcome to AnkiGen
              </motion.h2>
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.45 }}
                className="text-center text-white/90 text-sm mt-1.5 leading-relaxed"
              >
                Your study companion is now on your phone. Pin it to your home
                screen for one-tap access.
              </motion.p>

              {/* Tips */}
              <div className="mt-5 space-y-2">
                {[
                  { icon: Home, text: "Pin to home screen for one-tap access" },
                  { icon: Zap, text: "Generate decks from any PDF or notes" },
                  { icon: Smartphone, text: "Study offline-friendly, anytime" },
                ].map(({ icon: Icon, text }, idx) => (
                  <motion.div
                    key={text}
                    initial={{ opacity: 0, x: -16 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{
                      delay: 0.55 + idx * 0.1,
                      duration: 0.4,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                    className="flex items-center gap-3 rounded-xl bg-white/12 backdrop-blur-sm border border-white/20 px-3.5 py-2.5"
                  >
                    <div className="h-8 w-8 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
                      <Icon className="h-4 w-4" />
                    </div>
                    <p className="text-sm font-medium leading-snug">{text}</p>
                  </motion.div>
                ))}
              </div>

              <motion.button
                type="button"
                onClick={dismiss}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.95, duration: 0.4 }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                className="relative mt-6 w-full h-12 rounded-2xl bg-white text-primary font-semibold tracking-tight shadow-lg shadow-black/20 overflow-hidden group"
              >
                <motion.span
                  aria-hidden
                  className="absolute inset-0"
                  style={{
                    background:
                      "linear-gradient(110deg, transparent 30%, rgba(34,197,94,0.18) 50%, transparent 70%)",
                  }}
                  animate={{ x: ["-120%", "120%"] }}
                  transition={{
                    duration: 2.4,
                    repeat: Infinity,
                    ease: "easeInOut",
                    repeatDelay: 1.2,
                  }}
                />
                <span className="relative inline-flex items-center justify-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  Let's go
                </span>
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
