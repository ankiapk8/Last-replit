import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play, Pause, SkipForward, RotateCcw, X,
  Volume2, VolumeX, Timer, Settings2, ChevronUp, ChevronDown,
  Target, Flame,
} from "lucide-react";

/* ─────────────────────────────────────────────
   localStorage keys
───────────────────────────────────────────── */
const LS_SETTINGS = "pomo-settings";
const LS_SESSIONS = "pomo-sessions";
const LS_LABEL    = "pomo-last-label";

/* ─────────────────────────────────────────────
   Settings / cycle helpers
───────────────────────────────────────────── */
interface PomoSettings {
  focusMin:      number;
  shortBreakMin: number;
  longBreakMin:  number;
  dailyGoal:     number;
  soundOn:       boolean;
}

const DEFAULT_SETTINGS: PomoSettings = {
  focusMin:      40,
  shortBreakMin: 5,
  longBreakMin:  15,
  dailyGoal:     4,
  soundOn:       true,
};

function loadSettings(): PomoSettings {
  try {
    const raw = localStorage.getItem(LS_SETTINGS);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT_SETTINGS };
}

function saveSettings(s: PomoSettings) {
  try { localStorage.setItem(LS_SETTINGS, JSON.stringify(s)); } catch { /* ignore */ }
}

interface PhaseConfig {
  label: string;
  tag: string;
  emoji: string;
  minutes: number;
  accent: string;
  track: string;
  isFocus: boolean;
}

function buildCycle(s: PomoSettings): PhaseConfig[] {
  return [
    { label: "Focus",       tag: "FOCUS",      emoji: "🎯", minutes: s.focusMin,      accent: "#10b981", track: "#10b98130", isFocus: true  },
    { label: "Short Break", tag: "BREAK",      emoji: "☕", minutes: s.shortBreakMin, accent: "#3b82f6", track: "#3b82f630", isFocus: false },
    { label: "Focus",       tag: "FOCUS",      emoji: "🎯", minutes: s.focusMin,      accent: "#10b981", track: "#10b98130", isFocus: true  },
    { label: "Short Break", tag: "BREAK",      emoji: "☕", minutes: s.shortBreakMin, accent: "#3b82f6", track: "#3b82f630", isFocus: false },
    { label: "Focus",       tag: "FOCUS",      emoji: "🎯", minutes: s.focusMin,      accent: "#10b981", track: "#10b98130", isFocus: true  },
    { label: "Long Break",  tag: "LONG BREAK", emoji: "🌿", minutes: s.longBreakMin,  accent: "#8b5cf6", track: "#8b5cf630", isFocus: false },
  ];
}

/* ─────────────────────────────────────────────
   Session history helpers
───────────────────────────────────────────── */
interface Session {
  ts: string;      // ISO string
  minutes: number; // duration of the focus phase
}

function loadSessions(): Session[] {
  try {
    const raw = localStorage.getItem(LS_SESSIONS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    /* tolerate legacy ISO-string-only format */
    return (parsed as Array<unknown>).map(item =>
      typeof item === "string"
        ? { ts: item, minutes: 0 }
        : (item as Session)
    );
  } catch { /* ignore */ }
  return [];
}

function saveSessions(sessions: Session[]) {
  try { localStorage.setItem(LS_SESSIONS, JSON.stringify(sessions)); } catch { /* ignore */ }
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function getTodaySessions(sessions: Session[]): Session[] {
  const key = todayKey();
  return sessions.filter(s => {
    const d = new Date(s.ts);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` === key;
  });
}

/* ─────────────────────────────────────────────
   Utility
───────────────────────────────────────────── */
function toSec(m: number) { return m * 60; }
function fmt(s: number) {
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }

/* ─────────────────────────────────────────────
   Web Audio chimes
───────────────────────────────────────────── */
function playChime(type: "end" | "start" | "tick") {
  try {
    const ctx = new AudioContext();
    const schedule: [number, number, number][] =
      type === "end"   ? [[523.25, 0, 0.16], [659.25, 0.22, 0.16], [783.99, 0.44, 0.16]] :
      type === "start" ? [[523.25, 0, 0.12]] :
                         [[880, 0, 0.06], [880, 0.12, 0.06]];

    schedule.forEach(([freq, delay, vol]) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = freq;
      const t = ctx.currentTime + delay;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(vol, t + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);
      osc.start(t);
      osc.stop(t + 0.75);
    });
  } catch { /* AudioContext unavailable */ }
}

/* ─────────────────────────────────────────────
   Circular arc clock SVG
───────────────────────────────────────────── */
const R  = 54;
const SW = 6.5;
const SZ = (R + SW + 2) * 2;
const C  = 2 * Math.PI * R;

function ArcClock({ progress, accent, track, children }: {
  progress: number; accent: string; track: string; children: React.ReactNode;
}) {
  return (
    <div className="relative" style={{ width: SZ, height: SZ }}>
      <svg width={SZ} height={SZ} style={{ transform: "rotate(-90deg)", display: "block" }}>
        <circle cx={SZ / 2} cy={SZ / 2} r={R} fill="none"
          stroke={track} strokeWidth={SW} />
        <circle cx={SZ / 2} cy={SZ / 2} r={R} fill="none"
          stroke={accent} strokeWidth={SW} strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - Math.max(0, Math.min(1, progress)))}
          style={{ transition: "stroke-dashoffset 1s linear, stroke 0.5s ease" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        {children}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Phase sequence pills
───────────────────────────────────────────── */
function PhaseBar({ current, cycle }: { current: number; cycle: PhaseConfig[] }) {
  return (
    <div className="flex items-center justify-center gap-1.5 flex-wrap">
      {cycle.map((p, i) => {
        const done   = i < current;
        const active = i === current;
        return (
          <div key={i} className="flex flex-col items-center gap-0.5">
            <motion.div
              animate={{ width: active ? 24 : 8, opacity: active ? 1 : done ? 0.45 : 0.2 }}
              transition={{ duration: 0.3 }}
              className="h-1.5 rounded-full"
              style={{ backgroundColor: p.accent, minWidth: 8 }}
            />
            <span className="text-[9px] font-mono text-muted-foreground/60"
              style={{ color: active ? p.accent : undefined }}>
              {p.minutes}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Settings panel section
───────────────────────────────────────────── */
function SettingsSection({
  settings, onChange, onClose,
}: {
  settings: PomoSettings;
  onChange: (s: PomoSettings) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(settings);

  function num(field: keyof PomoSettings, label: string, lo: number, hi: number) {
    return (
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">{label}</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setDraft(d => ({ ...d, [field]: clamp((d[field] as number) - 1, lo, hi) }))}
            className="h-5 w-5 flex items-center justify-center rounded border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          ><ChevronDown className="h-3 w-3" /></button>
          <span className="w-6 text-center text-xs font-mono font-medium tabular-nums">
            {draft[field] as number}
          </span>
          <button
            onClick={() => setDraft(d => ({ ...d, [field]: clamp((d[field] as number) + 1, lo, hi) }))}
            className="h-5 w-5 flex items-center justify-center rounded border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          ><ChevronUp className="h-3 w-3" /></button>
        </div>
      </div>
    );
  }

  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2, ease: "easeInOut" }}
      className="overflow-hidden"
    >
      <div className="mx-3 mb-3 rounded-xl border border-border/40 bg-muted/30 p-3 space-y-2.5">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-1">Durations (min)</p>
        {num("focusMin",      "Focus",       5, 90)}
        {num("shortBreakMin", "Short Break", 1, 30)}
        {num("longBreakMin",  "Long Break",  5, 60)}

        <div className="border-t border-border/30 pt-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-1.5">Daily goal</p>
          {num("dailyGoal", "Sessions", 1, 20)}
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            className="flex-1 h-7 rounded-lg border border-border/60 text-[11px] text-muted-foreground hover:bg-muted transition-colors"
          >Cancel</button>
          <button
            disabled={!dirty}
            onClick={() => { onChange(draft); onClose(); }}
            className={`flex-1 h-7 rounded-lg text-[11px] font-medium transition-colors disabled:opacity-40 ${dirty ? "text-white" : "text-muted-foreground bg-muted"}`}
            style={dirty ? { backgroundColor: "#10b981" } : {}}
          >Save</button>
        </div>
      </div>
    </motion.div>
  );
}

/* ─────────────────────────────────────────────
   Daily goal progress bar
───────────────────────────────────────────── */
function DailyGoalBar({ done, goal }: { done: number; goal: number }) {
  const pct = Math.min(1, done / goal);
  return (
    <div className="px-4 pb-3">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Target className="h-3 w-3" />
          <span>Daily goal</span>
        </div>
        <span className="text-[10px] font-mono font-medium" style={{ color: pct >= 1 ? "#10b981" : undefined }}>
          {done}/{goal}
        </span>
      </div>
      <div className="h-1 rounded-full bg-muted overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: pct >= 1 ? "#10b981" : "#f59e0b" }}
          initial={{ width: 0 }}
          animate={{ width: `${pct * 100}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Session stats row
───────────────────────────────────────────── */
function StatsRow({ sessions }: { sessions: Session[] }) {
  const today   = getTodaySessions(sessions);
  const count   = today.length;
  const minutes = today.reduce((acc, s) => acc + s.minutes, 0);
  return (
    <div className="flex items-center justify-center gap-3 px-4 pb-2">
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
        <Flame className={`h-3 w-3 ${count > 0 ? "text-orange-400" : "text-muted-foreground/40"}`} />
        <span>
          <span className="font-semibold text-foreground/80">{count}</span>
          {" "}session{count !== 1 ? "s" : ""} today
        </span>
      </div>
      <span className="text-muted-foreground/30 text-[10px]">·</span>
      <div className="text-[10px] text-muted-foreground">
        <span className="font-semibold text-foreground/80">{minutes}</span> min focused
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Main component
───────────────────────────────────────────── */
export function PomodoroTimer() {
  const [settings,   setSettings]   = useState<PomoSettings>(() => loadSettings());
  const [cycle,      setCycle]      = useState<PhaseConfig[]>(() => buildCycle(loadSettings()));
  const [sessions,   setSessions]   = useState<Session[]>(() => loadSessions());
  const [label,      setLabel]      = useState<string>(() => {
    try { return localStorage.getItem(LS_LABEL) ?? ""; } catch { return ""; }
  });

  const [open,       setOpen]       = useState(false);
  const [phaseIdx,   setPhaseIdx]   = useState(0);
  const [timeLeft,   setTimeLeft]   = useState(() => toSec(buildCycle(loadSettings())[0].minutes));
  const [running,    setRunning]    = useState(false);
  const [flash,      setFlash]      = useState<string | null>(null);
  const [started,    setStarted]    = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const stateRef = useRef({ phaseIdx, soundOn: settings.soundOn, cycle, settings, sessions });
  stateRef.current = { phaseIdx, soundOn: settings.soundOn, cycle, settings, sessions };

  /* persist label */
  useEffect(() => {
    try { localStorage.setItem(LS_LABEL, label); } catch { /* ignore */ }
  }, [label]);

  /* ── timer tick ── */
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setTimeLeft(prev => {
        if (prev === 61 && stateRef.current.soundOn) playChime("tick");

        if (prev <= 1) {
          const { phaseIdx: pi, soundOn: so, cycle: cy } = stateRef.current;

          /* record completed focus session */
          if (cy[pi].isFocus) {
            const newSessions = [
              ...stateRef.current.sessions,
              { ts: new Date().toISOString(), minutes: cy[pi].minutes },
            ];
            saveSessions(newSessions);
            setSessions(newSessions);
          }

          if (so) playChime("end");
          const next = (pi + 1) % cy.length;
          setPhaseIdx(next);
          setFlash(cy[next].label);
          setTimeout(() => {
            setFlash(null);
            if (so) playChime("start");
          }, 2200);
          return toSec(cy[next].minutes);
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  const handleSaveSettings = useCallback((newSettings: PomoSettings) => {
    const newCycle = buildCycle(newSettings);
    setSettings(newSettings);
    setCycle(newCycle);
    saveSettings(newSettings);
    /* reset timer to new durations */
    setRunning(false);
    setStarted(false);
    setPhaseIdx(0);
    setTimeLeft(toSec(newCycle[0].minutes));
  }, []);

  const phase    = cycle[phaseIdx] ?? cycle[0];
  const duration = toSec(phase.minutes);
  const progress = timeLeft / duration;

  const todaySessions = getTodaySessions(sessions);

  const toggle = () => {
    if (!started) {
      setStarted(true);
      if (settings.soundOn) playChime("start");
    }
    setRunning(r => !r);
  };

  const skip = () => {
    const next = (phaseIdx + 1) % cycle.length;
    setPhaseIdx(next);
    setTimeLeft(toSec(cycle[next].minutes));
  };

  const reset = () => {
    setRunning(false);
    setStarted(false);
    setPhaseIdx(0);
    setTimeLeft(toSec(cycle[0].minutes));
  };

  const toggleSound = () => {
    const next = { ...settings, soundOn: !settings.soundOn };
    setSettings(next);
    saveSettings(next);
  };

  /* ─ Header badge ─ */
  const badge = (
    <motion.button
      whileHover={{ scale: 1.06 }}
      whileTap={{ scale: 0.94 }}
      onClick={() => setOpen(o => !o)}
      className={`relative flex items-center gap-1.5 h-8 rounded-full border transition-all select-none ${
        running
          ? "pl-2.5 pr-3 font-mono text-xs font-bold"
          : "w-8 justify-center"
      } ${
        running
          ? "border-transparent shadow-sm"
          : "border-border/60 bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted"
      }`}
      style={running ? {
        backgroundColor: phase.accent + "1a",
        borderColor: phase.accent + "55",
        color: phase.accent,
      } : {}}
      title="Pomodoro timer"
    >
      {running ? (
        <>
          <span className="text-[10px]">{phase.emoji}</span>
          {label ? (
            <span className="max-w-[72px] truncate text-[10px]">{label}</span>
          ) : (
            <span>{fmt(timeLeft)}</span>
          )}
          {label && <span className="text-[9px] opacity-70">{fmt(timeLeft)}</span>}
        </>
      ) : started ? (
        <>
          <Timer className="h-4 w-4" />
          <span className="text-[10px] font-mono ml-0.5 text-muted-foreground/70">{fmt(timeLeft)}</span>
        </>
      ) : (
        <Timer className="h-4 w-4" />
      )}
      {running && (
        <motion.span
          className="absolute inset-0 rounded-full"
          style={{ border: `1.5px solid ${phase.accent}` }}
          animate={{ scale: [1, 1.18], opacity: [0.6, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
        />
      )}
    </motion.button>
  );

  /* ─ Panel ─ */
  const panel = (
    <motion.div
      initial={{ opacity: 0, y: -10, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.96 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      className="fixed top-[58px] right-3 z-[60] w-[268px] rounded-2xl border border-border/60 bg-background/95 backdrop-blur-xl shadow-2xl overflow-hidden"
    >
      {/* Phase flash overlay */}
      <AnimatePresence>
        {flash && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-2xl"
            style={{ backgroundColor: phase.accent + "22" }}
          >
            <span className="text-3xl mb-1">{phase.emoji}</span>
            <span className="text-sm font-bold" style={{ color: phase.accent }}>{flash}</span>
            <span className="text-[11px] text-muted-foreground mt-0.5">Starting now…</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header row */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-base">{phase.emoji}</span>
          <span className="text-xs font-bold tracking-widest uppercase truncate"
            style={{ color: phase.accent }}>
            {running && label ? label : phase.tag}
          </span>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={() => { setShowSettings(s => !s); }}
            className={`h-6 w-6 flex items-center justify-center rounded transition-colors ${
              showSettings ? "text-foreground bg-muted" : "text-muted-foreground hover:text-foreground"
            }`}
            title="Settings"
          >
            <Settings2 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={toggleSound}
            className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors"
            title={settings.soundOn ? "Mute sounds" : "Enable sounds"}
          >
            {settings.soundOn ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={() => setOpen(false)}
            className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Settings panel */}
      <AnimatePresence>
        {showSettings && (
          <SettingsSection
            settings={settings}
            onChange={handleSaveSettings}
            onClose={() => setShowSettings(false)}
          />
        )}
      </AnimatePresence>

      {!showSettings && (
        <>
          {/* Task label input (shown when stopped) */}
          {!running && (
            <div className="px-4 pb-1">
              <input
                type="text"
                value={label}
                onChange={e => setLabel(e.target.value)}
                placeholder="What are you working on?"
                maxLength={40}
                className="w-full h-7 px-2.5 rounded-lg border border-border/50 bg-muted/40 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-border focus:bg-muted/60 transition-colors"
              />
            </div>
          )}

          {/* Clock */}
          <div className="flex flex-col items-center py-3 gap-1">
            <ArcClock progress={progress} accent={phase.accent} track={phase.track}>
              <span className="text-2xl font-mono font-bold tabular-nums tracking-tight">
                {fmt(timeLeft)}
              </span>
              <span className="text-[10px] text-muted-foreground font-medium mt-0.5">
                {`${Math.ceil(timeLeft / 60)} min left`}
              </span>
            </ArcClock>
          </div>

          {/* Phase bar */}
          <div className="px-4 pb-3">
            <PhaseBar current={phaseIdx} cycle={cycle} />
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-2 px-4 pb-3">
            <button
              onClick={reset}
              className="h-8 w-8 flex items-center justify-center rounded-full border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
              title="Reset"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>

            <motion.button
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
              onClick={toggle}
              className="h-12 w-12 flex items-center justify-center rounded-full text-white shadow-lg transition-colors"
              style={{ backgroundColor: phase.accent }}
              title={running ? "Pause" : "Start"}
            >
              {running
                ? <Pause className="h-5 w-5 fill-white" />
                : <Play  className="h-5 w-5 fill-white ml-0.5" />
              }
            </motion.button>

            <button
              onClick={skip}
              className="h-8 w-8 flex items-center justify-center rounded-full border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
              title="Skip to next phase"
            >
              <SkipForward className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Daily goal progress */}
          <DailyGoalBar done={todaySessions.length} goal={settings.dailyGoal} />

          {/* Session stats */}
          <StatsRow sessions={sessions} />

          {/* Cycle label */}
          <div className="pb-3 text-center text-[10px] text-muted-foreground/50 font-mono tracking-wide">
            Round {Math.floor(phaseIdx / cycle.length) + 1} · Phase {phaseIdx + 1} of {cycle.length}
          </div>
        </>
      )}
    </motion.div>
  );

  return (
    <>
      {badge}
      <AnimatePresence>
        {open && panel}
      </AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[55]" onClick={() => setOpen(false)} />
      )}
    </>
  );
}
