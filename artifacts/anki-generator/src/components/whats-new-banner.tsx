import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles, X, CalendarDays, MessageSquarePlus,
  FileImage, Network, FlaskConical,
  Target, LayoutDashboard, Download, BookOpen,
  Image, Check, Layers3,
} from "lucide-react";
import { useDarkMode } from "@/hooks/use-dark-mode";

// ─── Versioned changelog ─────────────────────────────────────────────────────
// Bump APP_VERSION whenever you ship a new release. The banner will show once
// for any user who hasn't seen this version yet.

export const APP_VERSION = "1.5";

interface ChangelogEntry {
  icon: React.ElementType;
  color: string;
  title: string;
  desc: string;
  badge?: string;
  critical?: boolean;
}

const CHANGELOG: Record<string, { headline: string; entries: ChangelogEntry[] }> = {
  "1.5": {
    headline: "Study Planner & 3D Feature Showcase",
    entries: [
      {
        icon: CalendarDays,
        color: "#34d399",
        title: "Final Year Study Planner",
        desc: "Plan all 14 medical subjects across months, track topics, streaks, and export your schedule as CSV or ZIP.",
        badge: "New",
        critical: true,
      },
      {
        icon: Layers3,
        color: "#4ade80",
        title: "3D Feature Showcase",
        desc: "The features carousel now auto-advances with a live progress bar, 3D flip transitions, and mouse-tracking tilt.",
        badge: "Improved",
      },
      {
        icon: MessageSquarePlus,
        color: "#2dd4bf",
        title: "Feedback & Support",
        desc: "Send bug reports, feature ideas, or kind words right from the app. Every response is read and actioned.",
        critical: true,
      },
    ],
  },
  "1.4": {
    headline: "Feedback & Support",
    entries: [
      {
        icon: MessageSquarePlus,
        color: "#34d399",
        title: "Feedback & Support",
        desc: "Send bug reports, feature ideas, or kind words right from the app. Every response is read and actioned.",
        badge: "New",
      },
    ],
  },
  "1.3": {
    headline: "Mind Map Export & Desktop App",
    entries: [
      {
        icon: FileImage,
        color: "#2dd4bf",
        title: "Mind Map Export",
        desc: "Download any mind map as a crisp 2× PNG or scalable SVG.",
      },
      {
        icon: LayoutDashboard,
        color: "#4ade80",
        title: "Progress Dashboard",
        desc: "Study streaks, 7-day activity charts, and deck progress bars — all at a glance.",
      },
      {
        icon: Download,
        color: "#34d399",
        title: "Export & Desktop App",
        desc: "Export decks as .apkg or download the native Mac app for offline study.",
      },
    ],
  },
  "1.2": {
    headline: "AI Mind Maps",
    entries: [
      {
        icon: Network,
        color: "#a78bfa",
        title: "AI Mind Maps",
        desc: "Study with a live mind map. AI builds a topic hierarchy and highlights your current card.",
      },
    ],
  },
  "1.1": {
    headline: "MCQ & Question Banks",
    entries: [
      {
        icon: Target,
        color: "#fb923c",
        title: "MCQ Practice Mode",
        desc: "Exam-style multiple choice questions with AI-generated distractors.",
      },
      {
        icon: FlaskConical,
        color: "#f472b6",
        title: "Question Banks",
        desc: "Medical-grade QBanks with detailed AI explanations for every answer.",
      },
    ],
  },
  "1.0": {
    headline: "Welcome to AnkiGen",
    entries: [
      {
        icon: Sparkles,
        color: "#34d399",
        title: "AI Flashcard Generation",
        desc: "Upload PDFs, slides, or images. AI creates perfectly structured flashcards in seconds.",
      },
      {
        icon: Image,
        color: "#818cf8",
        title: "Visual Card Detection",
        desc: "AI detects diagrams, radiology images & figures — generating rich visual cards.",
      },
      {
        icon: BookOpen,
        color: "#38bdf8",
        title: "Immersive Study Mode",
        desc: "Flip cards, track progress, and review at your own pace.",
      },
    ],
  },
};

const STORAGE_KEY = "ankigen-whats-new-seen";
const CRITICAL_FEATURES_STORAGE_KEY = "ankigen-critical-feature-seen";

// ─── Component ────────────────────────────────────────────────────────────────

export function WhatsNewBanner() {
  const [isDark] = useDarkMode();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    try {
      const seen = localStorage.getItem(STORAGE_KEY);
      if (seen !== APP_VERSION) {
        const t = setTimeout(() => setVisible(true), 600);
        cleanup = () => clearTimeout(t);
      }
    } catch {
      /* localStorage blocked */
    }
    return cleanup;
  }, []);

  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [visible]);

  const dismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, APP_VERSION);
    } catch { /* ignore */ }
    setVisible(false);
  };

  const changelog = CHANGELOG[APP_VERSION];
  if (!changelog) return null;
  const criticalEntries = changelog.entries.filter((entry) => entry.critical);

  const overlayBg = isDark ? "rgba(0,0,0,0.65)" : "rgba(0,0,0,0.40)";
  const cardBg = isDark
    ? "bg-zinc-900 border-emerald-500/20"
    : "bg-white border-emerald-500/25";
  const headingColor = isDark ? "text-white" : "text-zinc-900";
  const subColor = isDark ? "text-white/50" : "text-zinc-500";
  const divider = isDark ? "bg-white/8" : "bg-black/6";
  const entryBg = isDark ? "bg-white/4 hover:bg-white/7" : "bg-black/3 hover:bg-black/5";
  const entryDesc = isDark ? "text-white/55" : "text-zinc-500";
  const criticalSeen = (() => {
    try {
      return localStorage.getItem(CRITICAL_FEATURES_STORAGE_KEY) === APP_VERSION;
    } catch {
      return false;
    }
  })();

  return (
    <AnimatePresence>
      {visible && (
        <>
          {/* Backdrop */}
          <motion.div
            key="whats-new-backdrop"
            className="fixed inset-0 z-[200]"
            style={{ background: overlayBg, backdropFilter: "blur(4px)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={dismiss}
            aria-hidden
          />

          {/* Sheet */}
          <motion.div
            key="whats-new-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="What's New"
            className={`fixed left-1/2 -translate-x-1/2 z-[201] w-full max-w-sm rounded-2xl border shadow-2xl overflow-hidden ${cardBg}`}
            style={{
              bottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
              boxShadow: isDark
                ? "0 24px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(52,211,153,0.15), 0 0 40px rgba(52,211,153,0.08)"
                : "0 24px 64px rgba(0,0,0,0.12), 0 0 0 1px rgba(52,211,153,0.2), 0 0 40px rgba(52,211,153,0.06)",
            }}
            initial={{ opacity: 0, y: 60, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Green gradient accent bar */}
            <div
              className="h-1 w-full"
              style={{
                background: "linear-gradient(90deg, #059669 0%, #34d399 40%, #4ade80 70%, #2dd4bf 100%)",
              }}
            />

            <div className="px-4 pt-4 pb-3">
              {/* Header */}
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-2.5">
                  <motion.div
                    className="flex items-center justify-center w-9 h-9 rounded-xl shadow shrink-0"
                    style={{
                      background: "linear-gradient(135deg, #059669 0%, #34d399 100%)",
                    }}
                    animate={{ boxShadow: ["0 0 0px #34d39900", "0 0 18px #34d39955", "0 0 0px #34d39900"] }}
                    transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                  >
                    <Sparkles className="text-white" style={{ width: 18, height: 18 }} />
                  </motion.div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className={`text-sm font-bold leading-tight ${headingColor}`}>
                        What&apos;s New
                      </h2>
                      <span
                        className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded-full"
                        style={{
                          background: "rgba(52,211,153,0.12)",
                          color: "#34d399",
                          border: "1px solid rgba(52,211,153,0.28)",
                        }}
                      >
                        v{APP_VERSION}
                      </span>
                    </div>
                    <p className={`text-[11px] leading-tight mt-0.5 ${subColor}`}>
                      {changelog.headline}
                    </p>
                  </div>
                </div>
                <button
                  onClick={dismiss}
                  className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                    isDark ? "hover:bg-white/10 text-white/40 hover:text-white/70" : "hover:bg-black/6 text-black/35 hover:text-black/60"
                  }`}
                  aria-label="Dismiss"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Divider */}
              <div className={`h-px w-full mb-3 ${divider}`} />

              {/* Feature entries */}
              <div className="flex flex-col gap-1.5">
                {changelog.entries.sort((a, b) => Number(b.critical ?? false) - Number(a.critical ?? false)).map((entry, i) => {
                  const Icon = entry.icon;
                  return (
                    <motion.div
                      key={entry.title}
                      className={`flex items-start gap-3 px-2.5 py-2 rounded-xl transition-colors ${entryBg}`}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: 0.08 * i }}
                    >
                      <div
                        className="flex items-center justify-center w-7 h-7 rounded-lg shrink-0 mt-0.5"
                        style={{
                          background: `${entry.color}18`,
                          border: `1px solid ${entry.color}35`,
                        }}
                      >
                        <Icon className="h-3.5 w-3.5" style={{ color: entry.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[12px] font-semibold leading-tight ${headingColor}`}>
                            {entry.title}
                          </span>
                          {entry.badge && (
                            <span
                              className="text-[9px] font-bold px-1 py-0.5 rounded-md"
                              style={{
                                background: "rgba(52,211,153,0.12)",
                                color: "#34d399",
                                border: "1px solid rgba(52,211,153,0.28)",
                              }}
                            >
                              {entry.badge}
                            </span>
                          )}
                        </div>
                        <p className={`text-[10.5px] leading-snug mt-0.5 ${entryDesc}`}>
                          {entry.desc}
                        </p>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {!criticalSeen && criticalEntries.length > 0 && (
                <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/8 px-3 py-2">
                  <p className={`text-[10px] font-semibold uppercase tracking-wider ${headingColor}`}>Critical updates</p>
                  <p className={`text-[10px] mt-0.5 ${entryDesc}`}>
                    {criticalEntries.map((entry) => entry.title).join(" · ")}
                  </p>
                </div>
              )}

              {/* Dismiss button */}
              <motion.button
                onClick={dismiss}
                className="mt-3 w-full flex items-center justify-center gap-1.5 h-9 rounded-xl text-sm font-semibold text-white shadow transition-opacity hover:opacity-90 active:scale-[0.98]"
                style={{
                  background: "linear-gradient(120deg, #059669 0%, #34d399 60%, #2dd4bf 100%)",
                }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
              >
                <Check className="h-4 w-4" />
                Got it
              </motion.button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
