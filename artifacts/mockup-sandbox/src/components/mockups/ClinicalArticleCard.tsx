import { useState, useEffect, useRef, useCallback, type ReactNode } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  clinicalArticleData,
  type ClinicalArticleData,
  type ClinicalSection,
  type HighlightBox,
} from "./data/fixtures";

// ── Color maps ──
const SECTION_COLORS: Record<
  string,
  { border: string; bg: string; headerBg: string; text: string; leftBorder: string; glow: string }
> = {
  blue:    { border: "border-blue-200 dark:border-blue-800",    bg: "bg-blue-50/40 dark:bg-blue-950/30",    headerBg: "bg-blue-100/50 dark:bg-blue-900/40",    text: "text-blue-800 dark:text-blue-200",    leftBorder: "border-l-blue-500",    glow: "shadow-blue-500/20" },
  amber:   { border: "border-amber-200 dark:border-amber-800",  bg: "bg-amber-50/40 dark:bg-amber-950/30",  headerBg: "bg-amber-100/50 dark:bg-amber-900/40",  text: "text-amber-800 dark:text-amber-200",  leftBorder: "border-l-amber-500",  glow: "shadow-amber-500/20" },
  rose:    { border: "border-rose-200 dark:border-rose-800",    bg: "bg-rose-50/40 dark:bg-rose-950/30",    headerBg: "bg-rose-100/50 dark:bg-rose-900/40",    text: "text-rose-800 dark:text-rose-200",    leftBorder: "border-l-rose-500",    glow: "shadow-rose-500/20" },
  emerald: { border: "border-emerald-200 dark:border-emerald-800", bg: "bg-emerald-50/40 dark:bg-emerald-950/30", headerBg: "bg-emerald-100/50 dark:bg-emerald-900/40", text: "text-emerald-800 dark:text-emerald-200", leftBorder: "border-l-emerald-500", glow: "shadow-emerald-500/20" },
  sky:     { border: "border-sky-200 dark:border-sky-800",      bg: "bg-sky-50/40 dark:bg-sky-950/30",      headerBg: "bg-sky-100/50 dark:bg-sky-900/40",      text: "text-sky-800 dark:text-sky-200",      leftBorder: "border-l-sky-500",      glow: "shadow-sky-500/20" },
  violet:  { border: "border-violet-200 dark:border-violet-800", bg: "bg-violet-50/40 dark:bg-violet-950/30", headerBg: "bg-violet-100/50 dark:bg-violet-900/40", text: "text-violet-800 dark:text-violet-200", leftBorder: "border-l-violet-500", glow: "shadow-violet-500/20" },
  red:     { border: "border-red-200 dark:border-red-800",      bg: "bg-red-50/40 dark:bg-red-950/30",      headerBg: "bg-red-100/50 dark:bg-red-900/40",      text: "text-red-800 dark:text-red-200",      leftBorder: "border-l-red-500",      glow: "shadow-red-500/20" },
  teal:    { border: "border-teal-200 dark:border-teal-800",    bg: "bg-teal-50/40 dark:bg-teal-950/30",    headerBg: "bg-teal-100/50 dark:bg-teal-900/40",    text: "text-teal-800 dark:text-teal-200",    leftBorder: "border-l-teal-500",    glow: "shadow-teal-500/20" },
  indigo:  { border: "border-indigo-200 dark:border-indigo-800", bg: "bg-indigo-50/40 dark:bg-indigo-950/30", headerBg: "bg-indigo-100/50 dark:bg-indigo-900/40", text: "text-indigo-800 dark:text-indigo-200", leftBorder: "border-l-indigo-500", glow: "shadow-indigo-500/20" },
  green:   { border: "border-green-200 dark:border-green-800",  bg: "bg-green-50/40 dark:bg-green-950/30",  headerBg: "bg-green-100/50 dark:bg-green-900/40",  text: "text-green-800 dark:text-green-200",  leftBorder: "border-l-green-500",  glow: "shadow-green-500/20" },
  yellow:  { border: "border-yellow-200 dark:border-yellow-800", bg: "bg-yellow-50/40 dark:bg-yellow-950/30", headerBg: "bg-yellow-100/50 dark:bg-yellow-900/40", text: "text-yellow-800 dark:text-yellow-200", leftBorder: "border-l-yellow-500", glow: "shadow-yellow-500/20" },
  purple:  { border: "border-purple-200 dark:border-purple-800", bg: "bg-purple-50/40 dark:bg-purple-950/30", headerBg: "bg-purple-100/50 dark:bg-purple-900/40", text: "text-purple-800 dark:text-purple-200", leftBorder: "border-l-purple-500", glow: "shadow-purple-500/20" },
  slate:   { border: "border-slate-200 dark:border-slate-700",  bg: "bg-slate-50/40 dark:bg-slate-900/30",  headerBg: "bg-slate-100/50 dark:bg-slate-800/40",  text: "text-slate-800 dark:text-slate-200",  leftBorder: "border-l-slate-500",  glow: "shadow-slate-500/20" },
};

function getSectionColors(color: string) {
  return SECTION_COLORS[color] ?? SECTION_COLORS.slate;
}

const HIGHLIGHT_STYLES: Record<HighlightBox["type"], { border: string; bg: string; icon: string; label: string }> = {
  "high-yield":  { border: "border-l-yellow-400 dark:border-l-yellow-500", bg: "bg-yellow-50 dark:bg-yellow-950/40",  icon: "⭐", label: "High-Yield" },
  "exam-pearl":  { border: "border-l-purple-400 dark:border-l-purple-500", bg: "bg-purple-50 dark:bg-purple-950/40",  icon: "💡", label: "Exam Pearl" },
  "warning":     { border: "border-l-orange-400 dark:border-l-orange-500", bg: "bg-orange-50 dark:bg-orange-950/40",  icon: "⚠️", label: "Warning" },
  "emergency":   { border: "border-l-red-400 dark:border-l-red-500",     bg: "bg-red-50 dark:bg-red-950/40",      icon: "🚨", label: "Emergency" },
  "pitfall":     { border: "border-l-amber-400 dark:border-l-amber-500", bg: "bg-amber-50 dark:bg-amber-950/40",  icon: "🕳️", label: "Pitfall" },
};

const SEVERITY_STYLES: Record<string, string> = {
  low:      "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300",
  moderate: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300",
  high:     "bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300",
  critical: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300",
};

// ── Highlight Box ──
function HighlightBoxCard({ box }: { box: HighlightBox }) {
  const s = HIGHLIGHT_STYLES[box.type];
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
      className={cn("border-l-4 rounded-r-lg p-3 my-3", s.border, s.bg)}
      role="note"
      aria-label={s.label}
    >
      <div className="flex items-start gap-2">
        <span className="text-base shrink-0" aria-hidden="true">{s.icon}</span>
        <div>
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground block mb-1">
            {s.label}
          </span>
          <p className="text-sm text-foreground leading-relaxed">{box.content}</p>
        </div>
      </div>
    </motion.div>
  );
}

// ── Typewriter hook ──
function useTypewriter(text: string, speed: number = 12, active: boolean = true) {
  const [displayed, setDisplayed] = useState(active ? 0 : text.length);
  const shouldReduce = useReducedMotion();

  useEffect(() => {
    if (shouldReduce || !active) {
      setDisplayed(text.length);
      return;
    }
    setDisplayed(0);
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setDisplayed(i);
      if (i >= text.length) clearInterval(interval);
    }, speed);
    return () => clearInterval(interval);
  }, [text, speed, active, shouldReduce]);

  return text.slice(0, displayed);
}

// ── Collapsible Section ──
function CollapsibleSection({
  section,
  index,
  isActive,
  isExpanded,
  onToggle,
}: {
  section: ClinicalSection;
  index: number;
  isActive: boolean;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const colors = getSectionColors(section.color);
  const shouldReduce = useReducedMotion();
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);

  useEffect(() => {
    if (contentRef.current) {
      setContentHeight(contentRef.current.scrollHeight);
    }
  }, [isExpanded]);

  return (
    <motion.section
      id={section.id}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: shouldReduce ? 0 : index * 0.06, duration: 0.35 }}
      className={cn(
        "rounded-xl border overflow-hidden mb-4 transition-shadow duration-300",
        colors.border,
        colors.bg,
        isActive && `shadow-lg ${colors.glow}`,
      )}
      aria-labelledby={`section-header-${section.id}`}
    >
      {/* Section Header */}
      <button
        onClick={onToggle}
        className={cn(
          "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors",
          colors.headerBg,
          "hover:brightness-95 dark:hover:brightness-110",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-inset",
        )}
        aria-expanded={isExpanded}
        aria-controls={`section-content-${section.id}`}
        id={`section-header-${section.id}`}
      >
        {/* Colored left border accent */}
        <div className={cn("w-1 h-8 rounded-full shrink-0", colors.leftBorder.replace("border-l-", "bg-"))} />

        <span className="text-xl shrink-0" aria-hidden="true">{section.icon}</span>
        <span className={cn("font-semibold text-base flex-1", colors.text)}>{section.title}</span>

        {section.badge && (
          <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", colors.headerBg, colors.text)}>
            {section.badge}
          </span>
        )}

        <motion.span
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="text-muted-foreground text-lg"
          aria-hidden="true"
        >
          ▾
        </motion.span>
      </button>

      {/* Collapsible Content */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            id={`section-content-${section.id}`}
            role="region"
            aria-labelledby={`section-header-${section.id}`}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div ref={contentRef} className="px-5 py-4 space-y-4">
              {section.subsections.map((sub, si) => (
                <div key={si}>
                  <h4 className="text-sm font-semibold text-foreground mb-1">{sub.heading}</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">{sub.content}</p>
                </div>
              ))}
              {section.highlights.map((h, hi) => (
                <HighlightBoxCard key={hi} box={h} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}

// ── Sticky Header ──
function StickyHeader({
  data,
  progress,
  isBookmarked,
  onBookmark,
  onNavigate,
  activeSectionId,
}: {
  data: ClinicalArticleData;
  progress: number;
  isBookmarked: boolean;
  onBookmark: () => void;
  onNavigate: (dir: "prev" | "next") => void;
  activeSectionId: string;
}) {
  const activeIndex = data.sections.findIndex((s) => s.id === activeSectionId);

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="sticky top-0 z-50 backdrop-blur-xl bg-white/70 dark:bg-gray-950/70 border-b border-border/50 shadow-sm"
    >
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Title */}
          <h1 className="text-lg md:text-xl font-bold text-foreground flex-1 min-w-0 truncate">
            {data.title}
          </h1>

          {/* Specialty Tag */}
          <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-[#6C63FF]/10 text-[#6C63FF] border border-[#6C63FF]/20">
            {data.specialty}
          </span>

          {/* Severity Badge */}
          <span className={cn("text-xs font-semibold px-2.5 py-1 rounded-full", SEVERITY_STYLES[data.severity])}>
            {data.severityLabel}
          </span>

          {/* Bookmark */}
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={onBookmark}
            className={cn(
              "p-2 rounded-lg transition-colors",
              isBookmarked
                ? "bg-[#6C63FF]/10 text-[#6C63FF]"
                : "bg-muted/50 text-muted-foreground hover:text-foreground",
            )}
            aria-label={isBookmarked ? "Remove bookmark" : "Add bookmark"}
            aria-pressed={isBookmarked}
          >
            <span className="text-lg">{isBookmarked ? "★" : "☆"}</span>
          </motion.button>

          {/* Reading Progress */}
          <div className="hidden sm:flex items-center gap-2">
            <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-[#6C63FF] rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
            <span className="text-xs text-muted-foreground">{Math.round(progress)}%</span>
          </div>

          {/* Quick Nav */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => onNavigate("prev")}
              disabled={activeIndex <= 0}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              aria-label="Previous section"
            >
              ◂
            </button>
            <span className="text-xs text-muted-foreground tabular-nums">
              {activeIndex + 1}/{data.sections.length}
            </span>
            <button
              onClick={() => onNavigate("next")}
              disabled={activeIndex >= data.sections.length - 1}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              aria-label="Next section"
            >
              ▸
            </button>
          </div>
        </div>
      </div>
    </motion.header>
  );
}

// ── Section Navigation (Desktop) ──
function SectionNav({
  sections,
  activeId,
  onSelect,
}: {
  sections: ClinicalSection[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <nav aria-label="Section navigation" className="hidden lg:block sticky top-20 self-start w-56 shrink-0">
      <div className="space-y-1 py-4 pr-4 max-h-[calc(100vh-6rem)] overflow-y-auto">
        {sections.map((section) => {
          const colors = getSectionColors(section.color);
          const isActive = section.id === activeId;
          return (
            <button
              key={section.id}
              onClick={() => onSelect(section.id)}
              className={cn(
                "w-full text-left px-3 py-2 rounded-lg text-sm transition-all duration-200 flex items-center gap-2",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6C63FF]",
                isActive
                  ? `${colors.headerBg} ${colors.text} font-semibold shadow-sm ${colors.glow}`
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/40",
              )}
              aria-current={isActive ? "true" : undefined}
            >
              <span className="text-sm" aria-hidden="true">{section.icon}</span>
              <span className="truncate">{section.title}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

// ── Mobile Section Nav ──
function MobileSectionNav({
  sections,
  activeId,
  onSelect,
}: {
  sections: ClinicalSection[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <nav aria-label="Section navigation" className="lg:hidden sticky top-[57px] z-40 backdrop-blur-xl bg-white/70 dark:bg-gray-950/70 border-b border-border/50">
      <div
        ref={scrollRef}
        className="flex gap-2 px-4 py-2.5 overflow-x-auto scrollbar-none"
        style={{ scrollbarWidth: "none" }}
      >
        {sections.map((section) => {
          const colors = getSectionColors(section.color);
          const isActive = section.id === activeId;
          return (
            <button
              key={section.id}
              onClick={() => onSelect(section.id)}
              className={cn(
                "shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6C63FF]",
                isActive
                  ? `${colors.headerBg} ${colors.text} shadow-sm ${colors.glow}`
                  : "bg-muted/40 text-muted-foreground hover:text-foreground",
              )}
              aria-current={isActive ? "true" : undefined}
            >
              {section.icon} {section.title}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

// ── Main Component ──
export function ClinicalArticleCard() {
  const data = clinicalArticleData;
  const shouldReduce = useReducedMotion();
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set([data.sections[0].id]));
  const [activeSectionId, setActiveSectionId] = useState(data.sections[0].id);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [readSections, setReadSections] = useState<Set<string>>(new Set());
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  const toggleSection = useCallback((id: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setReadSections((prev) => new Set(prev).add(id));
  }, []);

  const scrollToSection = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveSectionId(id);
      setExpandedSections((prev) => new Set(prev).add(id));
    }
  }, []);

  const navigateSection = useCallback(
    (dir: "prev" | "next") => {
      const idx = data.sections.findIndex((s) => s.id === activeSectionId);
      const nextIdx = dir === "prev" ? idx - 1 : idx + 1;
      if (nextIdx >= 0 && nextIdx < data.sections.length) {
        scrollToSection(data.sections[nextIdx].id);
      }
    },
    [activeSectionId, data.sections, scrollToSection],
  );

  // Scroll spy
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSectionId(entry.target.id);
            setReadSections((prev) => new Set(prev).add(entry.target.id));
          }
        }
      },
      { rootMargin: "-20% 0px -60% 0px", threshold: 0 },
    );

    data.sections.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [data.sections]);

  const progress = (readSections.size / data.sections.length) * 100;

  return (
    <div
      className="min-h-screen"
      style={{
        background: "linear-gradient(135deg, #f5f3ff 0%, #ede9fe 50%, #e0e7ff 100%)",
      }}
    >
      {/* Dark mode override */}
      <style>{`
        .dark & {
          background: linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #1e3a5f 100%) !important;
        }
      `}</style>

      <StickyHeader
        data={data}
        progress={progress}
        isBookmarked={isBookmarked}
        onBookmark={() => setIsBookmarked(!isBookmarked)}
        onNavigate={navigateSection}
        activeSectionId={activeSectionId}
      />

      <MobileSectionNav sections={data.sections} activeId={activeSectionId} onSelect={scrollToSection} />

      <div className="max-w-7xl mx-auto px-4 py-6 flex gap-6">
        <SectionNav sections={data.sections} activeId={activeSectionId} onSelect={scrollToSection} />

        <main className="flex-1 min-w-0" role="main" aria-label="Clinical article content">
          {data.sections.map((section, i) => (
            <CollapsibleSection
              key={section.id}
              section={section}
              index={i}
              isActive={section.id === activeSectionId}
              isExpanded={expandedSections.has(section.id)}
              onToggle={() => toggleSection(section.id)}
            />
          ))}
        </main>
      </div>
    </div>
  );
}

export default ClinicalArticleCard;
