import { useState, useEffect, useCallback, useRef } from "react";
import confetti from "canvas-confetti";
import { useParams, Link } from "wouter";
import { 
  useGetDeck, 
  useListDeckCards, 
  useUpdateCard, 
  useDeleteCard, 
  getListDeckCardsQueryKey,
  getGetDeckQueryKey
} from "@workspace/api-client-react";
import { MindMapGallery } from "@/components/mind-map-panel";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card as CardUI, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  ArrowLeft, Download, Trash2, Edit2, Check, X, 
  FileText, BookOpen, Shuffle, ChevronLeft, ChevronRight,
  RotateCcw, GraduationCap, Eye, Bookmark, Play, Sparkles, Loader2,
  Brain, ClipboardList, Stethoscope, ListChecks, ChevronDown, FileJson, Package, ImageIcon, ZoomIn, XCircle, Search, HelpCircle, Plus, Network, CheckCircle2, CalendarClock, Zap,
  Lightbulb, Activity, Copy, BookmarkPlus, StickyNote, Clock, Tag, Library, Star, RefreshCw
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { apiUrl } from "@/lib/utils";
import { saveSession, getSavePoint, saveSavePoint, clearSavePoint, type StudySavePoint } from "@/lib/study-stats";
import { getDeckTags, addDeckTag, removeDeckTag } from "@/lib/deck-tags";
import {
  getSrsState, saveSrsState, getDefaultSrsState, computeNextState,
  getNextInterval, intervalLabel, getDueCardIds, getDaysUntilDue,
  partitionCardsByDue,
  type SrsRating,
} from "@/lib/srs";
import type { Card, Deck } from "@workspace/api-client-react/src/generated/api.schemas";
import { Drawer } from "vaul";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CropCompare, parseBbox } from "@/components/crop-compare";
import { motion, AnimatePresence } from "framer-motion";
import { SourcePageModal, type VisualCardRef } from "@/components/source-page-modal";
import { AmbientOrbs } from "@/components/ambient-orbs";
import { PageHeader } from "@/components/page-header";

type DeckWithSubDecks = Deck & { subDecks?: Deck[] };

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const LETTER_COLORS: Record<string, string> = {
  A: "bg-sky-500",
  B: "bg-orange-500",
  C: "bg-purple-500",
  D: "bg-pink-500",
  E: "bg-teal-500",
  F: "bg-amber-600",
};

function parseBriefText(text: string) {
  const correctMatch = text.match(/✅\s*Correct answer:\s*([A-F])\.?\s+(.+?)(?:\n)([\s\S]*?)(?=\n?❌|$)/i);
  const hasWrongSection = /❌/.test(text);
  const wrongSection = hasWrongSection ? text.split(/❌[^\n]*\n?/)[1] ?? "" : "";

  const correctLetter = correctMatch?.[1]?.toUpperCase() ?? "";
  const correctText = correctMatch?.[2]?.trim() ?? "";
  const correctReason = correctMatch?.[3]?.trim() ?? "";

  const wrongItems = wrongSection
    .split("\n")
    .map(l => l.trim())
    .filter(l => /^[A-F][.)]/i.test(l))
    .map(l => {
      const full = l.match(/^([A-F])[.)]\s+(.+?)\s+—\s+(.+)/i);
      if (full) return { letter: full[1].toUpperCase(), text: full[2].trim(), reason: full[3].trim() };
      const partial = l.match(/^([A-F])[.)]\s+(.+)/i);
      if (partial) return { letter: partial[1].toUpperCase(), text: partial[2].trim(), reason: "" };
      return null;
    })
    .filter((x): x is { letter: string; text: string; reason: string } => x !== null);

  return { correctLetter, correctText, correctReason, wrongItems };
}

function BriefBreakdownView({ text, isStreaming }: { text: string; isStreaming: boolean }) {
  const { correctLetter, correctText, correctReason, wrongItems } = parseBriefText(text);
  const hasCorrect = correctLetter || correctText;
  const hasWrong = wrongItems.length > 0;

  if (!hasCorrect && isStreaming) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-8 text-muted-foreground">
        <div className="h-8 w-8 rounded-full border-2 border-violet-200 border-t-violet-500 animate-spin" />
        <p className="text-sm">Building answer breakdown…</p>
      </div>
    );
  }

  if (!hasCorrect && !isStreaming && text.length > 0) {
    return <p className="text-sm text-muted-foreground whitespace-pre-wrap">{text}</p>;
  }

  return (
    <div className="space-y-5 pb-2">
      {/* ── Correct answer card ─────────────────────────────── */}
      {hasCorrect && (
        <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800/60 bg-gradient-to-br from-emerald-50 via-emerald-50/60 to-white dark:from-emerald-950/40 dark:via-emerald-950/20 dark:to-transparent overflow-hidden shadow-sm">
          {/* Header strip */}
          <div className="px-4 pt-3.5 pb-2 flex items-center gap-2.5">
            <div className="h-6 w-6 rounded-full bg-emerald-500 flex items-center justify-center shrink-0 shadow-sm">
              <Check className="h-3.5 w-3.5 text-white stroke-[3]" />
            </div>
            <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-widest">
              Correct Answer
            </span>
            {correctLetter && (
              <span className={`ml-auto h-7 w-7 rounded-lg ${LETTER_COLORS[correctLetter] ?? "bg-emerald-500"} flex items-center justify-center text-white text-xs font-bold shadow-sm`}>
                {correctLetter}
              </span>
            )}
          </div>
          {/* Body */}
          <div className="px-4 pb-4 space-y-2">
            {correctText && (
              <p className="text-[15px] font-semibold text-foreground leading-snug">{correctText}</p>
            )}
            {correctReason ? (
              <p className="text-sm text-emerald-800/80 dark:text-emerald-300/80 leading-relaxed border-t border-emerald-200/60 dark:border-emerald-800/40 pt-2 mt-2">
                {correctReason}
              </p>
            ) : isStreaming ? (
              <span className="inline-block w-1.5 h-3.5 bg-emerald-500/60 rounded-sm animate-pulse align-middle mt-1" />
            ) : null}
          </div>
        </div>
      )}

      {/* ── Wrong answers ────────────────────────────────────── */}
      {hasWrong && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-border/50" />
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground px-2">
              Why the others are wrong
            </span>
            <div className="h-px flex-1 bg-border/50" />
          </div>

          {wrongItems.map((item, i) => (
            <div
              key={i}
              className="group rounded-xl border border-rose-100 dark:border-rose-900/40 bg-rose-50/50 dark:bg-rose-950/15 p-3.5 flex gap-3 transition-colors hover:bg-rose-50 dark:hover:bg-rose-950/25"
            >
              <div className="flex flex-col items-center gap-1.5 shrink-0 pt-0.5">
                <span className={`h-5 w-5 rounded-md ${LETTER_COLORS[item.letter] ?? "bg-muted"} flex items-center justify-center text-white text-[10px] font-bold`}>
                  {item.letter}
                </span>
                <div className="h-4 w-4 rounded-full bg-rose-200 dark:bg-rose-800/60 flex items-center justify-center">
                  <X className="h-2.5 w-2.5 text-rose-600 dark:text-rose-400 stroke-[2.5]" />
                </div>
              </div>
              <div className="min-w-0 flex-1">
                {item.text && (
                  <p className="text-sm font-semibold text-foreground leading-snug mb-1">{item.text}</p>
                )}
                {item.reason ? (
                  <p className="text-xs text-muted-foreground leading-relaxed">{item.reason}</p>
                ) : isStreaming && i === wrongItems.length - 1 ? (
                  <span className="inline-block w-1 h-3 bg-muted-foreground/40 rounded-sm animate-pulse align-middle" />
                ) : null}
              </div>
            </div>
          ))}

          {isStreaming && (
            <div className="h-10 rounded-xl border border-dashed border-rose-100 dark:border-rose-900/30 bg-rose-50/20 dark:bg-rose-950/10 flex items-center justify-center gap-2">
              <div className="h-3 w-3 rounded-full border border-rose-300 border-t-rose-500 animate-spin" />
              <span className="text-[11px] text-muted-foreground">Loading more…</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StudyMode({ cards, deckId, deckName, deckKind, onExit, savePoint, srsMode = false }: {
  cards: Card[];
  deckId: number;
  deckName: string;
  deckKind?: string;
  onExit: () => void;
  savePoint?: StudySavePoint | null;
  srsMode?: boolean;
}) {
  const isQbank = deckKind === "qbank";
  const { toast } = useToast();

  const buildInitialDeck = () => {
    if (savePoint) {
      const byId = new Map(cards.map(c => [c.id, c]));
      const ordered = savePoint.cardIds.map(id => byId.get(id)).filter(Boolean) as Card[];
      return ordered.length === cards.length ? ordered : cards;
    }
    if (srsMode && cards.length > 0) {
      const { due, unseen, future } = partitionCardsByDue(cards.map(c => c.id));
      const byId = new Map(cards.map(c => [c.id, c]));
      const pick = (ids: number[]) => ids.map(id => byId.get(id)).filter(Boolean) as Card[];
      return [...pick(due), ...pick(unseen), ...pick(future)];
    }
    return cards;
  };

  const [shuffled, setShuffled] = useState(false);
  const [deck, setDeck] = useState<Card[]>(buildInitialDeck);
  const [index, setIndex] = useState(savePoint ? Math.min(savePoint.index, Math.max(0, cards.length - 1)) : 0);
  const [revealed, setRevealed] = useState(false);
  const [known, setKnown] = useState<Set<number>>(new Set(savePoint?.knownIds ?? []));
  const [unknown, setUnknown] = useState<Set<number>>(new Set(savePoint?.unknownIds ?? []));
  const [done, setDone] = useState(false);
  const [flipping, setFlipping] = useState(false);
  const [mcqSelected, setMcqSelected] = useState<number | null>(null);
  const savedRef = useRef(false);

  const [sourceModalCardId, setSourceModalCardId] = useState<number | null>(null);
  const sourceVisualCards: VisualCardRef[] = cards
    .filter(c => !!(c as Card & { sourceImage?: string | null }).sourceImage)
    .map(c => {
      const cx = c as Card & { sourceImage?: string | null; bbox?: string | null; pageNumber?: number | null; figureType?: string | null };
      return {
        id: cx.id,
        sourceImage: cx.sourceImage!,
        bbox: parseBbox(cx.bbox),
        pageNumber: cx.pageNumber,
        figureType: cx.figureType,
        front: cx.front,
      };
    });
  const sourceModalActiveIndex = sourceVisualCards.findIndex(v => v.id === sourceModalCardId);

  const current = deck[index];
  const total = deck.length;
  const progress = total > 0 ? Math.round(((known.size + unknown.size) / total) * 100) : 0;
  const isMcq =
    current?.cardType === "mcq" &&
    Array.isArray(current?.choices) &&
    (current.choices?.length ?? 0) > 0 &&
    typeof current.correctIndex === "number";
  const hasImage = !!(current as Card & { image?: string | null })?.image;
  const isCurrentCorrect = revealed && isMcq && mcqSelected === (current?.correctIndex ?? -1);

  type ExplainMode = "full" | "revision" | "osce" | "brief" | "mnemonic" | "clinical";

  // ── Explain drawer state ──────────────────────────────────────────────────
  const [displayText, setDisplayText] = useState<string | null>(null); // typed text shown in drawer
  const [explainMode, setExplainMode] = useState<ExplainMode | null>(null);
  const [isExplaining, setIsExplaining] = useState(false);
  const isExplainingRef = useRef(false);

  // Streaming animation refs
  const streamedRef = useRef("");        // full text from stream
  const revealPosRef = useRef(0);        // how many chars are currently shown
  const revealTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // History: last 5 explanations for current card (reset on card change)
  const [explainHistory, setExplainHistory] = useState<{ mode: ExplainMode; text: string }[]>([]);
  const [historyIdx, setHistoryIdx] = useState<number | null>(null); // null = live, 0-4 = past entry

  // Last-used mode (persisted per deck)
  const [lastMode, setLastMode] = useState<ExplainMode | null>(
    () => localStorage.getItem(`ankigen-last-mode-${deckId}`) as ExplainMode | null
  );

  // Copy / save-to-notes
  const [copied, setCopied] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);
  const [showCardNotes, setShowCardNotes] = useState(false);

  // Touch-swipe for history navigation in drawer
  const swipeStartXRef = useRef(0);

  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  const EXPLAIN_LABELS: Record<ExplainMode, string> = {
    full: "Full Explanation",
    revision: "Revision Sheet",
    osce: "OSCE Questions",
    brief: "Answer Breakdown",
    mnemonic: "Mnemonic",
    clinical: "Clinical Pearls",
  };

  // Cleanup reveal timer on unmount
  useEffect(() => {
    return () => { if (revealTimerRef.current) clearInterval(revealTimerRef.current); };
  }, []);

  const handleExplain = useCallback(async (mode: ExplainMode) => {
    if (!current || isExplaining) return;

    // Stop any running reveal animation
    if (revealTimerRef.current) { clearInterval(revealTimerRef.current); revealTimerRef.current = null; }

    streamedRef.current = "";
    revealPosRef.current = 0;
    setDisplayText("");
    setExplainMode(mode);
    setHistoryIdx(null);
    setIsExplaining(true);
    isExplainingRef.current = true;

    // Persist last-used mode
    localStorage.setItem(`ankigen-last-mode-${deckId}`, mode);
    setLastMode(mode);

    // Word-by-word reveal: one word per 20ms; records history once animation catches up
    const recordHistory = (text: string) => {
      if (text && !text.startsWith("Failed") && !text.startsWith("Could not")) {
        setExplainHistory(prev => [{ mode, text }, ...prev.filter((_, i) => i < 4)]);
      }
    };
    revealTimerRef.current = setInterval(() => {
      const target = streamedRef.current;
      let pos = revealPosRef.current;
      // All text already visible
      if (pos >= target.length) {
        if (!isExplainingRef.current) {
          clearInterval(revealTimerRef.current!);
          revealTimerRef.current = null;
          recordHistory(target);
        }
        return;
      }
      // Skip any leading whitespace at current position
      while (pos < target.length && /\s/.test(target[pos])) pos++;
      // Advance through one word (non-whitespace)
      while (pos < target.length && !/\s/.test(target[pos])) pos++;
      // Consume trailing whitespace so next tick starts at a clean word boundary
      while (pos < target.length && /\s/.test(target[pos])) pos++;
      revealPosRef.current = pos;
      setDisplayText(target.slice(0, pos));
      // Animation just caught up to end of completed stream — record history once
      if (!isExplainingRef.current && pos >= target.length) {
        clearInterval(revealTimerRef.current!);
        revealTimerRef.current = null;
        recordHistory(streamedRef.current);
      }
    }, 20);

    try {
      const resp = await fetch(apiUrl("api/explain"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          front: current.front,
          back: current.back,
          mode,
          ...(mode === "brief" && Array.isArray(current.choices) ? {
            choices: current.choices,
            correctIndex: current.correctIndex,
          } : {}),
        }),
      });
      if (!resp.ok || !resp.body) {
        const err = await resp.json().catch(() => ({}));
        const errMsg = err.error ?? "Could not get an explanation.";
        streamedRef.current = errMsg;
        setDisplayText(errMsg);
        return;
      }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let text = "";
      while (true) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;
        text += decoder.decode(value, { stream: true });
        streamedRef.current = text;
      }
    } catch {
      const errMsg = "Failed to get an explanation. Please try again.";
      streamedRef.current = errMsg;
      setDisplayText(errMsg);
    } finally {
      isExplainingRef.current = false;
      setIsExplaining(false);
      // Let the reveal timer naturally finish the word-by-word animation and
      // record history once it reaches the end of streamedRef.current
    }
  }, [current, isExplaining, deckId]);

  // Auto-save progress whenever position or results change
  useEffect(() => {
    if (done) return;
    saveSavePoint({
      deckId,
      cardIds: deck.map(c => c.id),
      index,
      knownIds: Array.from(known),
      unknownIds: Array.from(unknown),
      savedAt: new Date().toISOString(),
    });
  }, [deckId, deck, index, known, unknown, done]);

  useEffect(() => {
    if (done && !savedRef.current && (known.size + unknown.size) > 0) {
      savedRef.current = true;
      clearSavePoint(deckId);
      saveSession({
        deckId,
        deckName,
        total: known.size + unknown.size,
        known: known.size,
        unknown: unknown.size,
        completedAt: new Date().toISOString(),
      });
      const pct = (known.size + unknown.size) > 0 ? known.size / (known.size + unknown.size) : 0;
      const colors = pct >= 0.8
        ? ["#22c55e", "#10b981", "#84cc16", "#16a34a", "#4ade80"]
        : ["#16a34a", "#84cc16", "#facc15", "#a3a3a3"];
      const burst = (originX: number) => {
        confetti({
          particleCount: pct >= 0.8 ? 80 : 50,
          spread: 75,
          startVelocity: 45,
          origin: { x: originX, y: 0.7 },
          colors,
          scalar: 1.05,
          ticks: 220,
        });
      };
      burst(0.2);
      setTimeout(() => burst(0.8), 120);
      if (pct >= 0.9) {
        setTimeout(() => confetti({
          particleCount: 120, spread: 100, startVelocity: 55,
          origin: { x: 0.5, y: 0.5 }, colors, scalar: 1.2, ticks: 260,
        }), 280);
      }
    }
  }, [done, known.size, unknown.size, deckId, deckName]);

  const handleSaveAndExit = useCallback(() => {
    saveSavePoint({
      deckId,
      cardIds: deck.map(c => c.id),
      index,
      knownIds: Array.from(known),
      unknownIds: Array.from(unknown),
      savedAt: new Date().toISOString(),
    });
    onExit();
  }, [deckId, deck, index, known, unknown, onExit]);

  const handleShuffle = useCallback(() => {
    const next = shuffled ? cards : shuffleArray(cards);
    setShuffled(!shuffled);
    setDeck(next);
    setIndex(0);
    setRevealed(false);
    setMcqSelected(null);
    setKnown(new Set());
    setUnknown(new Set());
    setDone(false);
  }, [shuffled, cards]);

  const handleRestart = useCallback(() => {
    clearSavePoint(deckId);
    let ordered: Card[];
    if (srsMode && !shuffled) {
      const { due, unseen, future } = partitionCardsByDue(cards.map(c => c.id));
      const byId = new Map(cards.map(c => [c.id, c]));
      const pick = (ids: number[]) => ids.map(id => byId.get(id)).filter(Boolean) as Card[];
      ordered = [...pick(due), ...pick(unseen), ...pick(future)];
    } else {
      ordered = shuffled ? shuffleArray(cards) : cards;
    }
    setDeck(ordered);
    setIndex(0);
    setRevealed(false);
    setMcqSelected(null);
    setKnown(new Set());
    setUnknown(new Set());
    setDone(false);
  }, [shuffled, cards, deckId, srsMode]);

  const transition = useCallback((fn: () => void) => {
    setFlipping(true);
    setDisplayText(null);
    setExplainMode(null);
    setExplainHistory([]);
    setHistoryIdx(null);
    setNoteSaved(false);
    setShowCardNotes(false);
    if (revealTimerRef.current) { clearInterval(revealTimerRef.current); revealTimerRef.current = null; }
    streamedRef.current = "";
    revealPosRef.current = 0;
    setTimeout(() => { fn(); setFlipping(false); }, 150);
  }, []);

  const goNext = useCallback(() => {
    if (index + 1 >= total) { setDone(true); return; }
    transition(() => { setIndex(i => i + 1); setRevealed(false); setMcqSelected(null); });
  }, [index, total, transition]);

  const goPrev = useCallback(() => {
    if (index === 0) return;
    transition(() => { setIndex(i => i - 1); setRevealed(false); setMcqSelected(null); });
  }, [index, transition]);

  const markKnown = useCallback(() => {
    setKnown(prev => new Set([...prev, current.id]));
    setUnknown(prev => { const s = new Set(prev); s.delete(current.id); return s; });
    goNext();
  }, [current?.id, goNext]);

  const markUnknown = useCallback(() => {
    setUnknown(prev => new Set([...prev, current.id]));
    setKnown(prev => { const s = new Set(prev); s.delete(current.id); return s; });
    goNext();
  }, [current?.id, goNext]);

  const rateCard = useCallback((rating: SrsRating) => {
    if (!current) return;
    const existing = getSrsState(current.id);
    const state = existing ?? getDefaultSrsState(current.id, deckId);
    const next = computeNextState(state, rating);
    saveSrsState(next);
    const days = next.interval;
    const reviewLabel =
      days <= 0 ? "today" :
      days === 1 ? "tomorrow" :
      days < 7 ? `in ${days} days` :
      days < 30 ? `in ${Math.round(days / 7)} week${Math.round(days / 7) !== 1 ? "s" : ""}` :
      `in ${Math.round(days / 30)} month${Math.round(days / 30) !== 1 ? "s" : ""}`;
    toast({ description: `⏱ Next review ${reviewLabel}`, duration: 1800 });
    if (rating >= 3) {
      setKnown(prev => new Set([...prev, current.id]));
      setUnknown(prev => { const s = new Set(prev); s.delete(current.id); return s; });
    } else {
      setUnknown(prev => new Set([...prev, current.id]));
      setKnown(prev => { const s = new Set(prev); s.delete(current.id); return s; });
    }
    goNext();
  }, [current, deckId, goNext, toast]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (sourceModalCardId !== null) return;
      if (e.key === "Escape") { setLightboxSrc(null); return; }
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); if (!revealed) setRevealed(true); else rateCard(3); }
      if (e.key === "ArrowRight") { e.preventDefault(); goNext(); }
      if (e.key === "ArrowLeft") { e.preventDefault(); goPrev(); }
      if (e.key === "1" && revealed) rateCard(1);
      if (e.key === "2" && revealed) rateCard(2);
      if (e.key === "3" && revealed) rateCard(3);
      if (e.key === "4" && revealed) rateCard(4);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [revealed, goNext, goPrev, rateCard, sourceModalCardId]);

  if (done) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-8 animate-in fade-in duration-500">
        <div className="text-center space-y-3">
          <div className="text-5xl mb-4">🎉</div>
          <h2 className="text-2xl font-serif font-bold text-primary">Study session complete!</h2>
          <p className="text-muted-foreground">You went through all {total} cards.</p>
          {srsMode && <p className="text-xs text-muted-foreground mt-1">Cards scheduled for review based on your ratings.</p>}
        </div>
        <div className="flex gap-8 text-center">
          <div className="space-y-1">
            <p className="text-3xl font-bold text-green-600">{known.size}</p>
            <p className="text-sm text-muted-foreground">Good / Easy</p>
          </div>
          <div className="w-px bg-border" />
          <div className="space-y-1">
            <p className="text-3xl font-bold text-red-500">{unknown.size}</p>
            <p className="text-sm text-muted-foreground">Again / Hard</p>
          </div>
        </div>
        {total > 0 && (
          <div className="w-full max-w-xs">
            <Progress value={Math.round((known.size / total) * 100)} className="h-2" />
            <p className="text-xs text-center text-muted-foreground mt-1">{Math.round((known.size / total) * 100)}% known</p>
          </div>
        )}
        <div className="flex gap-3 flex-wrap justify-center">
          <Button variant="outline" onClick={handleRestart} className="gap-2">
            <RotateCcw className="h-4 w-4" /> Study again
          </Button>
          {unknown.size > 0 && (
            <Button onClick={() => {
              const struggling = deck.filter(c => unknown.has(c.id));
              setDeck(struggling);
              setIndex(0);
              setRevealed(false);
              setMcqSelected(null);
              setKnown(new Set());
              setUnknown(new Set());
              setDone(false);
            }} className="gap-2">
              <RotateCcw className="h-4 w-4" /> Review {unknown.size} missed
            </Button>
          )}
          <Button variant="ghost" onClick={onExit} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Back to deck
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
    {lightboxSrc && (
      <div
        className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 animate-in fade-in duration-150"
        onClick={() => setLightboxSrc(null)}
      >
        <button
          className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors"
          onClick={() => setLightboxSrc(null)}
        >
          <XCircle className="h-8 w-8" />
        </button>
        <img
          src={lightboxSrc}
          alt="Expanded view"
          className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
          onClick={e => e.stopPropagation()}
        />
      </div>
    )}
    <SourcePageModal
      open={sourceModalCardId !== null && sourceModalActiveIndex !== -1}
      onClose={() => setSourceModalCardId(null)}
      cards={sourceVisualCards}
      activeIndex={Math.max(0, sourceModalActiveIndex)}
      onNavigate={(i) => setSourceModalCardId(sourceVisualCards[i]?.id ?? null)}
    />
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={handleSaveAndExit} className="gap-1.5 text-muted-foreground">
          <Bookmark className="h-4 w-4" /> Save & Exit
        </Button>
        <div className="flex items-center gap-2">
          <Button
            variant={shuffled ? "secondary" : "ghost"}
            size="sm"
            onClick={handleShuffle}
            className="gap-1.5 h-8 text-xs"
          >
            <Shuffle className="h-3.5 w-3.5" />
            {shuffled ? "Shuffled" : "Shuffle"}
          </Button>
          <Button variant="ghost" size="sm" onClick={handleRestart} className="gap-1.5 h-8 text-xs text-muted-foreground">
            <RotateCcw className="h-3.5 w-3.5" /> Restart
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                <HelpCircle className="h-3.5 w-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-3" align="end">
              <p className="text-xs font-semibold mb-2 text-foreground">Keyboard shortcuts</p>
              <div className="space-y-1.5">
                {[
                  ["Space", "Flip card"],
                  ["→ / ←", "Next / Prev"],
                  ["1", "Again"],
                  ["2", "Hard"],
                  ["3", "Good"],
                  ["4", "Easy"],
                ].map(([key, action]) => (
                  <div key={key} className="flex items-center justify-between">
                    <kbd className="text-[10px] bg-muted border border-border rounded px-1.5 py-0.5 font-mono">{key}</kbd>
                    <span className="text-xs text-muted-foreground">{action}</span>
                  </div>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Card {index + 1} of {total}</span>
          <span className="flex gap-3">
            {known.size > 0 && <span className="text-green-600 font-medium">✓ {known.size} known</span>}
            {unknown.size > 0 && <span className="text-red-500 font-medium">✗ {unknown.size} learning</span>}
          </span>
        </div>
        <Progress value={progress} className="h-1.5" />
      </div>

      {!isMcq && !hasImage ? (
        /* ── Regular flashcard: polished 3D flip ── */
        <motion.div
          style={{ perspective: "1100px" }}
          animate={{ opacity: flipping ? 0 : 1, scale: flipping ? 0.97 : 1 }}
          transition={{ duration: 0.15 }}
        >
          <motion.div
            animate={{ rotateY: revealed ? 180 : 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            style={{ transformStyle: "preserve-3d", position: "relative" }}
            onClick={() => !revealed && setRevealed(true)}
            className="cursor-pointer"
          >
            {/* Front face */}
            <div
              style={{ backfaceVisibility: "hidden" }}
              className="rounded-2xl border border-border/50 shadow-lg bg-card overflow-hidden flex flex-col min-h-[300px] sm:min-h-[340px]"
            >
              <div className="flex items-center justify-between px-5 pt-4">
                <span className="text-[10px] font-mono text-muted-foreground/50 tabular-nums">{index + 1} / {total}</span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border text-sky-600 dark:text-sky-400 bg-sky-500/8 border-sky-500/25 dark:border-sky-400/30">Flashcard</span>
              </div>
              <div className="flex-1 flex items-center justify-center p-6 sm:p-8">
                <p className="text-lg sm:text-xl font-medium text-foreground leading-relaxed text-center">{current?.front}</p>
              </div>
              <div className="border-t border-dashed border-border/25 px-5 py-3 flex justify-center">
                <motion.span
                  className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground/60 select-none pointer-events-none"
                  animate={{ opacity: [0.4, 1, 0.4] }}
                  transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
                >
                  <Eye className="h-3.5 w-3.5" /> tap to flip
                </motion.span>
              </div>
            </div>
            {/* Back face */}
            <div
              style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
              className="absolute inset-0 rounded-2xl border border-sky-400/25 dark:border-sky-400/20 shadow-xl bg-card overflow-hidden flex flex-col"
            >
              <div aria-hidden className="pointer-events-none absolute inset-0 rounded-2xl bg-[radial-gradient(ellipse_at_25%_20%,rgba(56,189,248,0.08)_0%,rgba(34,197,94,0.04)_55%,transparent_100%)] dark:bg-[radial-gradient(ellipse_at_25%_20%,rgba(56,189,248,0.18)_0%,rgba(34,197,94,0.07)_55%,transparent_100%)]" />
              <div className="flex items-center justify-between px-5 pt-4 relative">
                <span className="text-[10px] font-mono text-muted-foreground/50 tabular-nums">{index + 1} / {total}</span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border text-emerald-600 dark:text-emerald-400 bg-emerald-500/8 border-emerald-500/25 dark:border-emerald-400/30">Answer</span>
              </div>
              <div className="flex-1 flex items-center justify-center p-6 sm:p-8 relative">
                <p className="text-base sm:text-lg font-semibold leading-relaxed text-center whitespace-pre-wrap text-sky-600 dark:text-sky-400">{current?.back}</p>
              </div>
            </div>
          </motion.div>
        </motion.div>

      ) : isMcq ? (
        /* ── MCQ: 3D flip verdict + colored letter badges ── */
        <motion.div
          animate={{ opacity: flipping ? 0 : 1, scale: flipping ? 0.97 : 1 }}
          transition={{ duration: 0.15 }}
          className="space-y-3"
        >
          {/* Flip card — front: question, back: correct/incorrect verdict */}
          <div style={{ perspective: "1100px" }}>
            <motion.div
              animate={{ rotateY: revealed ? 180 : 0 }}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              style={{ transformStyle: "preserve-3d", position: "relative" }}
            >
              {/* Front: question (+ image if any) */}
              <div
                style={{ backfaceVisibility: "hidden" }}
                className="rounded-2xl border border-border/50 bg-card shadow-sm p-5"
              >
                {(() => {
                  const c = current as Card & { image?: string | null; sourceImage?: string | null; bbox?: string | null };
                  if (!c?.image) return null;
                  return (
                    <div className="mb-4">
                      <CropCompare image={c.image} sourceImage={c.sourceImage} bbox={parseBbox(c.bbox)} onLightbox={setLightboxSrc} />
                    </div>
                  );
                })()}
                <p className="text-base sm:text-lg font-medium text-foreground leading-relaxed">{current?.front}</p>
              </div>
              {/* Back: verdict */}
              <div
                style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
                className={`absolute inset-0 rounded-2xl border p-5 flex items-center justify-center gap-4 ${
                  isCurrentCorrect
                    ? "bg-emerald-500/10 border-emerald-400/60 dark:bg-emerald-950/20"
                    : "bg-rose-500/10 border-rose-400/60 dark:bg-rose-950/20"
                }`}
              >
                <div className={`h-12 w-12 rounded-full flex items-center justify-center shrink-0 shadow-lg ${
                  isCurrentCorrect ? "bg-emerald-500 shadow-emerald-500/30" : "bg-rose-500 shadow-rose-500/30"
                }`}>
                  {isCurrentCorrect
                    ? <Check className="h-6 w-6 text-white stroke-[3]" />
                    : <X className="h-6 w-6 text-white stroke-[3]" />}
                </div>
                <div className="min-w-0">
                  <p className={`font-bold text-xl font-serif leading-tight ${
                    isCurrentCorrect ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"
                  }`}>
                    {isCurrentCorrect ? "Correct!" : "Incorrect"}
                  </p>
                  {current?.choices && typeof current?.correctIndex === "number" && (
                    <p className="text-sm text-muted-foreground mt-0.5 leading-snug line-clamp-2">
                      {String.fromCharCode(65 + current.correctIndex)}. {current.choices[current.correctIndex]}
                    </p>
                  )}
                </div>
              </div>
            </motion.div>
          </div>

          {/* Colored letter choice buttons */}
          <ul className="space-y-2.5">
            {current?.choices?.map((choice, i) => {
              const letter = String.fromCharCode(65 + i);
              const isCorrect = i === current.correctIndex;
              const isSelected = mcqSelected === i;
              let cardCls = "border-border/50 bg-background hover:border-violet-400/50 hover:bg-violet-500/5";
              let letterBg = LETTER_COLORS[letter] ?? "bg-slate-500";
              let textCls = "text-foreground";
              let icon: React.ReactNode = null;
              if (revealed) {
                if (isCorrect) {
                  cardCls = "border-emerald-400/70 bg-emerald-500/8 dark:bg-emerald-950/30 shadow-sm";
                  letterBg = "bg-emerald-500";
                  textCls = "text-emerald-900 dark:text-emerald-100";
                  icon = <Check className="h-3.5 w-3.5 text-white stroke-[3]" />;
                } else if (isSelected) {
                  cardCls = "border-rose-400/70 bg-rose-500/8 dark:bg-rose-950/30";
                  letterBg = "bg-rose-500";
                  textCls = "text-rose-900 dark:text-rose-100";
                  icon = <X className="h-3.5 w-3.5 text-white stroke-[3]" />;
                } else {
                  cardCls = "border-border/30 bg-muted/30";
                  textCls = "text-muted-foreground";
                  letterBg = "bg-muted-foreground/20";
                }
              } else if (isSelected) {
                cardCls = "border-violet-500/60 bg-violet-500/8 shadow-sm shadow-violet-500/10";
                letterBg = "bg-violet-600";
                textCls = "text-violet-900 dark:text-violet-100";
              }
              return (
                <motion.li
                  key={i}
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.06 + 0.08, type: "spring", stiffness: 320, damping: 26 }}
                >
                  <button
                    type="button"
                    disabled={revealed}
                    onClick={() => setMcqSelected(i)}
                    className={`w-full flex items-start gap-3 text-left px-4 py-3.5 rounded-xl border-2 transition-all duration-200 ${cardCls} ${revealed ? "cursor-default" : "cursor-pointer"}`}
                  >
                    <span className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold text-white transition-colors duration-200 ${letterBg}`}>
                      {icon ?? letter}
                    </span>
                    <span className={`flex-1 text-sm sm:text-base leading-relaxed font-medium transition-colors duration-200 ${textCls}`}>{choice}</span>
                  </button>
                </motion.li>
              );
            })}
          </ul>

          {/* Explanation panel */}
          <AnimatePresence>
            {revealed && current?.back && (
              <motion.div
                initial={{ opacity: 0, y: 14, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ type: "spring", stiffness: 280, damping: 26 }}
                className="rounded-2xl border p-4 relative overflow-hidden bg-violet-500/5 dark:bg-violet-400/5 border-violet-400/25 dark:border-violet-400/35"
              >
                <div aria-hidden className="pointer-events-none absolute inset-0 rounded-2xl bg-[radial-gradient(ellipse_at_0%_0%,rgba(167,139,250,0.1)_0%,transparent_60%)] dark:bg-[radial-gradient(ellipse_at_0%_0%,rgba(167,139,250,0.15)_0%,transparent_60%)]" />
                <div className="relative">
                  <div className="flex items-center gap-2 mb-2.5">
                    <div className="h-5 w-5 rounded-lg flex items-center justify-center shrink-0 bg-violet-500/15 dark:bg-violet-400/20 border border-violet-500/30 dark:border-violet-400/35">
                      <span className="text-[9px] font-bold text-violet-600 dark:text-violet-400">E</span>
                    </div>
                    <span className="text-[11px] font-bold uppercase tracking-widest text-violet-600 dark:text-violet-400">Explanation</span>
                  </div>
                  <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{current.back}</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Show answer button */}
          {!revealed && (
            <div className="flex justify-center pt-1">
              <Button
                onClick={() => setRevealed(true)}
                className="gap-2"
                size="lg"
                disabled={mcqSelected === null}
              >
                <Eye className="h-4 w-4" />
                {mcqSelected === null ? "Pick an answer" : "Show Answer"}
              </Button>
            </div>
          )}
        </motion.div>

      ) : (
        /* ── Image card: flat reveal ── */
        <div className={`relative transition-opacity duration-150 ${flipping ? "opacity-0" : "opacity-100"}`}>
          {revealed && (
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-px rounded-xl opacity-60 blur-xl animate-in fade-in duration-500"
              style={{ background: "linear-gradient(135deg, rgba(255,60,0,0.18), rgba(34,197,94,0.18))", zIndex: -1 }}
            />
          )}
          <CardUI className="min-h-[280px] sm:min-h-[320px] border-border/50 shadow-lg overflow-hidden relative">
            <CardContent className="p-0 flex flex-col h-full min-h-[280px] sm:min-h-[320px]">
              <div className="flex-1 flex flex-col p-6 sm:p-8">
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-4 flex items-center gap-2">
                  <span className="h-5 w-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[9px] font-bold">Q</span>
                  Front
                </div>
                {(() => {
                  const c = current as Card & { image?: string | null; sourceImage?: string | null; bbox?: string | null };
                  if (!c?.image) return null;
                  return (
                    <div className="mb-4">
                      <CropCompare image={c.image} sourceImage={c.sourceImage} bbox={parseBbox(c.bbox)} onLightbox={setLightboxSrc} />
                    </div>
                  );
                })()}
                <p className="text-lg sm:text-xl font-medium text-foreground leading-relaxed">{current?.front}</p>
              </div>
              {revealed ? (
                <div className="border-t border-dashed border-border/60 bg-muted/30 flex flex-col p-6 sm:p-8 animate-in slide-in-from-bottom-2 duration-200">
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-4 flex items-center gap-2">
                    <span className="h-5 w-5 rounded-full bg-green-500/10 text-green-600 flex items-center justify-center text-[9px] font-bold">A</span>
                    Back
                  </div>
                  <p className="text-base sm:text-lg text-foreground leading-relaxed whitespace-pre-wrap">{current?.back}</p>
                </div>
              ) : (
                <div className="border-t border-dashed border-border/30 p-4 sm:p-6 flex justify-center">
                  <Button onClick={() => setRevealed(true)} className="gap-2" size="lg">
                    <Eye className="h-4 w-4" /> Reveal Answer
                  </Button>
                </div>
              )}
            </CardContent>
          </CardUI>
        </div>
      )}

      {revealed && (
        <motion.div
          className="flex flex-col gap-2"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 28, delay: !isMcq && !hasImage ? 0.45 : isMcq ? 0.5 : 0.1 }}
        >
          <p className="text-[10px] font-bold uppercase tracking-widest text-center text-muted-foreground">How well did you know this?</p>
          <div className="grid grid-cols-4 gap-2">
            {(
              [
                { rating: 1 as SrsRating, label: "Again", cls: "border-rose-200 dark:border-rose-800/50 text-rose-600 dark:text-rose-400 bg-rose-500/5 hover:bg-rose-500/12", kbd: "1" },
                { rating: 2 as SrsRating, label: "Hard",  cls: "border-orange-200 dark:border-orange-800/50 text-orange-600 dark:text-orange-400 bg-orange-500/5 hover:bg-orange-500/12", kbd: "2" },
                { rating: 3 as SrsRating, label: "Good",  cls: "border-sky-200 dark:border-sky-800/50 text-sky-600 dark:text-sky-400 bg-sky-500/5 hover:bg-sky-500/12", kbd: "3" },
                { rating: 4 as SrsRating, label: "Easy",  cls: "border-emerald-200 dark:border-emerald-800/50 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5 hover:bg-emerald-500/12", kbd: "4" },
              ] as Array<{ rating: SrsRating; label: string; cls: string; kbd: string }>
            ).map(({ rating, label, cls, kbd }) => {
              const srsState = getSrsState(current?.id ?? 0);
              const days = getNextInterval(rating, srsState);
              const lbl = intervalLabel(days);
              return (
                <motion.button
                  key={rating}
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.96 }}
                  className={`flex flex-col items-center justify-center gap-1 py-3 rounded-2xl border-2 transition-all font-semibold text-sm ${cls}`}
                  onClick={() => rateCard(rating)}
                >
                  <span>{label}</span>
                  <span className="text-[10px] font-medium opacity-60">{lbl}</span>
                  <span className="text-[9px] opacity-35 font-normal">{kbd}</span>
                </motion.button>
              );
            })}
          </div>
        </motion.div>
      )}

      <div className="flex justify-between items-center">
        <Button
          variant="ghost"
          size="sm"
          onClick={goPrev}
          disabled={index === 0}
          className="gap-1 text-muted-foreground"
        >
          <ChevronLeft className="h-4 w-4" /> Previous
        </Button>
        {!revealed && (
          <span className="text-xs text-muted-foreground">Press Space to reveal</span>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={goNext}
          className="gap-1 text-muted-foreground"
        >
          Skip <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {(() => {
        const c = current as Card & { sourceImage?: string | null };
        if (!c?.sourceImage) return null;
        return (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => setSourceModalCardId(current.id)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-violet-500/30 bg-violet-500/5 text-violet-600 dark:text-violet-400 text-xs font-medium hover:bg-violet-500/15 hover:border-violet-500/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
            >
              <BookOpen className="h-3.5 w-3.5" />
              View Source Page
              {(current as Card & { pageNumber?: number | null }).pageNumber != null && (
                <span className="opacity-70">· p.{(current as Card & { pageNumber?: number | null }).pageNumber}</span>
              )}
            </button>
          </div>
        );
      })()}

      {revealed && (() => {
        type AiBtn = { mode: ExplainMode; icon: React.ReactNode; label: string; accent?: string };
        const aiButtons: AiBtn[] = [
          { mode: "full",     icon: <Brain      className="h-5 w-5" />, label: "Full Explanation" },
          { mode: "revision", icon: <ClipboardList className="h-5 w-5" />, label: "Revision Sheet" },
          { mode: "osce",     icon: <Stethoscope className="h-5 w-5" />, label: "OSCE Questions" },
          { mode: "mnemonic", icon: <Lightbulb  className="h-5 w-5" />, label: "Mnemonic",           accent: "amber" },
          { mode: "clinical", icon: <Activity   className="h-5 w-5" />, label: "Clinical Pearls",    accent: "rose" },
          ...(isMcq ? [{ mode: "brief" as ExplainMode, icon: <ListChecks className="h-5 w-5" />, label: "Answer Breakdown", accent: "violet" }] : []),
        ];

        const cardNotesKey = `ankigen-card-notes-${current?.id ?? 0}`;
        const cardNotesVal = localStorage.getItem(cardNotesKey) ?? "";

        return (
          <div className="rounded-xl border border-border/40 bg-muted/20 p-3 space-y-3">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
              <Sparkles className="h-3 w-3" /> AI Tools
            </p>
            <div className="grid grid-cols-3 gap-2">
              {aiButtons.map(({ mode, icon, label, accent }) => {
                const isLast = lastMode === mode;
                const accentMap: Record<string, string> = {
                  amber:  "border-amber-500/50 hover:border-amber-500/80 hover:bg-amber-500/5",
                  rose:   "border-rose-500/50  hover:border-rose-500/80  hover:bg-rose-500/5",
                  violet: "border-violet-500/50 hover:border-violet-500/80 hover:bg-violet-500/5",
                };
                const accentIcon: Record<string, string> = {
                  amber: "text-amber-500", rose: "text-rose-500", violet: "text-violet-500",
                };
                const lastClass = isLast
                  ? "ring-2 ring-primary/40 border-primary/60 bg-primary/5"
                  : (accent ? accentMap[accent] : "border-border/60 hover:bg-primary/5 hover:border-primary/30");
                const iconColor = accent ? accentIcon[accent] : "text-primary";
                return (
                  <button
                    key={mode}
                    onClick={() => handleExplain(mode)}
                    disabled={isExplaining}
                    className={`relative flex flex-col items-center gap-1.5 rounded-lg border p-3 transition-all text-center disabled:opacity-50 disabled:cursor-not-allowed group bg-background ${lastClass}`}
                  >
                    {isLast && (
                      <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-primary" />
                    )}
                    <span className={`${iconColor} group-hover:scale-110 transition-transform`}>{icon}</span>
                    <span className="text-[11px] font-medium leading-tight text-foreground">{label}</span>
                  </button>
                );
              })}
            </div>

            {/* Card notes section */}
            <div className="border-t border-border/30 pt-2.5">
              <button
                onClick={() => setShowCardNotes(v => !v)}
                className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors w-full"
              >
                <StickyNote className="h-3.5 w-3.5 shrink-0" />
                <span>Card Notes</span>
                {cardNotesVal && <span className="ml-auto text-[10px] text-primary">• saved</span>}
                <ChevronDown className={`h-3 w-3 ml-auto transition-transform ${showCardNotes ? "rotate-180" : ""}`} />
              </button>
              {showCardNotes && (
                <textarea
                  className="mt-1.5 w-full h-20 rounded-lg border border-border/60 bg-background px-2.5 py-2 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-primary/40"
                  placeholder="Personal notes for this card…"
                  defaultValue={cardNotesVal}
                  onBlur={(e) => {
                    const val = e.target.value.trim();
                    if (val) localStorage.setItem(cardNotesKey, val);
                    else localStorage.removeItem(cardNotesKey);
                  }}
                />
              )}
            </div>
          </div>
        );
      })()}

      {(() => {
        // Derived content: live text or selected history entry
        const activeMode  = historyIdx !== null ? explainHistory[historyIdx]?.mode  ?? explainMode : explainMode;
        const activeText  = historyIdx !== null ? (explainHistory[historyIdx]?.text ?? "") : (displayText ?? "");
        const modeIconMap: Record<string, React.ReactNode> = {
          full:     <Brain       className="h-3.5 w-3.5 text-primary" />,
          revision: <ClipboardList className="h-3.5 w-3.5 text-primary" />,
          osce:     <Stethoscope className="h-3.5 w-3.5 text-primary" />,
          mnemonic: <Lightbulb  className="h-3.5 w-3.5 text-amber-500" />,
          clinical: <Activity   className="h-3.5 w-3.5 text-rose-500" />,
          brief:    <ListChecks  className="h-3.5 w-3.5 text-violet-500" />,
        };
        const isViolet = activeMode === "brief";
        const isAmber  = activeMode === "mnemonic";
        const isRose   = activeMode === "clinical";

        const handleCopy = () => {
          if (!activeText) return;
          navigator.clipboard.writeText(activeText).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          });
        };
        const handleSaveNote = () => {
          if (!activeText || !current) return;
          const key = `ankigen-card-notes-${current.id}`;
          const existing = localStorage.getItem(key) ?? "";
          const stamp = new Date().toLocaleString();
          const appended = existing
            ? `${existing}\n\n--- ${activeMode ? EXPLAIN_LABELS[activeMode] : "AI"} · ${stamp} ---\n${activeText}`
            : `--- ${activeMode ? EXPLAIN_LABELS[activeMode] : "AI"} · ${stamp} ---\n${activeText}`;
          localStorage.setItem(key, appended);
          setNoteSaved(true);
          setTimeout(() => setNoteSaved(false), 2500);
        };

        return (
          <Drawer.Root
            open={displayText !== null}
            onOpenChange={(open) => {
              if (!open) {
                setDisplayText(null);
                setExplainMode(null);
                // historyIdx reset but history entries preserved until card changes
                setHistoryIdx(null);
              }
            }}
          >
            <Drawer.Portal>
              <Drawer.Overlay className="fixed inset-0 bg-black/40 z-40" />
              <Drawer.Content
                className="fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-2xl bg-background shadow-2xl outline-none"
                style={{ maxHeight: "88vh" }}
                onTouchStart={(e) => { swipeStartXRef.current = e.touches[0].clientX; }}
                onTouchEnd={(e) => {
                  if (explainHistory.length === 0) return;
                  const dx = e.changedTouches[0].clientX - swipeStartXRef.current;
                  if (Math.abs(dx) < 60) return;
                  if (dx < 0) {
                    // Swipe left → go to older history entry
                    setHistoryIdx(prev =>
                      prev === null ? 0 : Math.min(prev + 1, explainHistory.length - 1)
                    );
                  } else {
                    // Swipe right → go to newer entry / back to live
                    setHistoryIdx(prev =>
                      prev === null || prev === 0 ? null : prev - 1
                    );
                  }
                }}
              >
                <div className="mx-auto mt-3 mb-1 h-1 w-10 rounded-full bg-muted-foreground/20 shrink-0" />

                {/* Drawer header */}
                <div className={`px-4 py-3 border-b flex items-center justify-between shrink-0 ${
                  isViolet ? "border-violet-200/60 dark:border-violet-800/40 bg-gradient-to-r from-violet-500/5 to-transparent"
                  : isAmber ? "border-amber-200/60 dark:border-amber-800/40 bg-gradient-to-r from-amber-500/5 to-transparent"
                  : isRose  ? "border-rose-200/60 dark:border-rose-800/40 bg-gradient-to-r from-rose-500/5 to-transparent"
                  : "border-border/50"
                }`}>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 ${
                      isViolet ? "bg-violet-500/15" : isAmber ? "bg-amber-500/15" : isRose ? "bg-rose-500/15" : "bg-primary/10"
                    }`}>
                      {activeMode && modeIconMap[activeMode]}
                    </div>
                    <div className="min-w-0">
                      <p className={`font-semibold text-sm leading-none truncate ${
                        isViolet ? "text-violet-700 dark:text-violet-300"
                        : isAmber ? "text-amber-700 dark:text-amber-300"
                        : isRose  ? "text-rose-700 dark:text-rose-300"
                        : "text-foreground"
                      }`}>
                        {activeMode ? EXPLAIN_LABELS[activeMode] : "AI Explanation"}
                      </p>
                      {historyIdx !== null && (
                        <p className="text-[10px] text-muted-foreground mt-0.5 leading-none flex items-center gap-1">
                          <Clock className="h-2.5 w-2.5" /> History entry {historyIdx + 1}
                        </p>
                      )}
                    </div>
                    {isExplaining && historyIdx === null && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground ml-1 shrink-0">
                        <Loader2 className="h-3 w-3 animate-spin" /> Generating…
                      </div>
                    )}
                  </div>

                  {/* Header actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    {!isExplaining && activeText && (
                      <>
                        <button
                          onClick={handleCopy}
                          title="Copy to clipboard"
                          className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        >
                          {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                        <button
                          onClick={handleSaveNote}
                          title="Save to card notes"
                          className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        >
                          {noteSaved ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <BookmarkPlus className="h-3.5 w-3.5" />}
                        </button>
                      </>
                    )}
                    {/* Mode switcher chips */}
                    {!isExplaining && (["full", "revision", "osce", "mnemonic", "clinical"] as ExplainMode[])
                      .filter(m => !(m === "brief"))
                      .map(m => (
                        <button
                          key={m}
                          onClick={() => { setHistoryIdx(null); handleExplain(m); }}
                          className={`hidden sm:flex h-7 px-2.5 rounded-md text-[11px] font-medium transition-colors ${
                            m === activeMode && historyIdx === null
                              ? "bg-primary/10 text-primary"
                              : "text-muted-foreground hover:text-foreground hover:bg-muted"
                          }`}
                        >
                          {m === "full" ? "Full" : m === "revision" ? "Rev" : m === "osce" ? "OSCE" : m === "mnemonic" ? "Mnem" : "Clinical"}
                        </button>
                      ))
                    }
                    <button
                      onClick={() => { setDisplayText(null); setExplainMode(null); setExplainHistory([]); setHistoryIdx(null); }}
                      className="ml-1 h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* History strip — last 5 entries; prev/next buttons + swipe gesture */}
                {explainHistory.length > 0 && (
                  <div className="px-3 py-1.5 flex items-center gap-1 shrink-0 border-b border-border/30">
                    <Clock className="h-3 w-3 text-muted-foreground shrink-0 mr-0.5" />

                    {/* ← Prev (older) */}
                    <button
                      onClick={() => setHistoryIdx(prev =>
                        prev === null ? 0 : Math.min(prev + 1, explainHistory.length - 1)
                      )}
                      disabled={historyIdx === explainHistory.length - 1}
                      className="h-6 w-6 flex items-center justify-center rounded shrink-0 text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-25 transition-colors"
                      title="Older entry"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>

                    {/* Scrollable chip row */}
                    <div className="flex items-center gap-1.5 overflow-x-auto flex-1 min-w-0">
                      <button
                        onClick={() => setHistoryIdx(null)}
                        className={`shrink-0 text-[10px] px-2.5 py-1 rounded-full border transition-all ${
                          historyIdx === null
                            ? "bg-primary text-primary-foreground border-primary"
                            : "border-border/50 text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        Live
                      </button>
                      {explainHistory.map((h, i) => (
                        <button
                          key={i}
                          onClick={() => setHistoryIdx(i)}
                          className={`shrink-0 text-[10px] px-2.5 py-1 rounded-full border transition-all ${
                            historyIdx === i
                              ? "bg-primary text-primary-foreground border-primary"
                              : "border-border/50 text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          {EXPLAIN_LABELS[h.mode]}
                        </button>
                      ))}
                    </div>

                    {/* → Next (newer / back to live) */}
                    <button
                      onClick={() => setHistoryIdx(prev =>
                        prev === null || prev === 0 ? null : prev - 1
                      )}
                      disabled={historyIdx === null}
                      className="h-6 w-6 flex items-center justify-center rounded shrink-0 text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-25 transition-colors"
                      title="Newer entry"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}

                {/* Drawer body */}
                <div className="px-5 py-5 overflow-y-auto flex-1">
                  {isExplaining && historyIdx === null && (!activeText || activeText.length === 0) ? (
                    <div className="flex flex-col items-center justify-center gap-3 py-12 text-muted-foreground">
                      <div className={`h-10 w-10 rounded-full border-2 animate-spin ${
                        isViolet ? "border-violet-200 border-t-violet-500"
                        : isAmber ? "border-amber-200 border-t-amber-500"
                        : isRose  ? "border-rose-200 border-t-rose-500"
                        : "border-primary/20 border-t-primary"
                      }`} />
                      <p className="text-sm">Generating {activeMode ? EXPLAIN_LABELS[activeMode] : "explanation"}…</p>
                    </div>
                  ) : activeMode === "brief" ? (
                    <BriefBreakdownView text={activeText} isStreaming={isExplaining && historyIdx === null} />
                  ) : (
                    <div className="prose prose-sm dark:prose-invert max-w-none
                      prose-headings:font-semibold prose-headings:text-foreground
                      prose-h1:text-xl prose-h1:mt-6 prose-h1:mb-3
                      prose-h2:text-lg prose-h2:mt-5 prose-h2:mb-2 prose-h2:border-b prose-h2:border-border/40 prose-h2:pb-1
                      prose-h3:text-base prose-h3:mt-4 prose-h3:mb-1.5
                      prose-p:text-foreground prose-p:leading-relaxed prose-p:my-2
                      prose-strong:text-foreground prose-strong:font-semibold
                      prose-ul:my-2 prose-li:my-0.5 prose-ol:my-2
                      prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs
                      prose-blockquote:border-primary/40 prose-blockquote:text-muted-foreground
                      prose-hr:border-border/40
                    ">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {activeText}
                      </ReactMarkdown>
                      {isExplaining && historyIdx === null && (
                        <span className="inline-block w-1.5 h-4 bg-primary/60 ml-0.5 animate-pulse rounded-sm align-middle" />
                      )}
                    </div>
                  )}
                </div>
              </Drawer.Content>
            </Drawer.Portal>
          </Drawer.Root>
        );
      })()}
    </div>
    </>
  );
}

export default function DeckDetail() {
  const { id } = useParams();
  const deckId = Number(id);
  const { data: deck, isLoading: isLoadingDeck } = useGetDeck(deckId);
  const { data: cards, isLoading: isLoadingCards } = useListDeckCards(deckId);
  
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const updateCard = useUpdateCard();
  const deleteCard = useDeleteCard();
  const [isExporting, setIsExporting] = useState(false);
  const [studyMode, setStudyMode] = useState(false);
  const [activeSavePoint, setActiveSavePoint] = useState<StudySavePoint | null>(null);
  const [resumePrompt, setResumePrompt] = useState<StudySavePoint | null>(null);
  const [cardFilter, setCardFilter] = useState<"all" | "text" | "visual" | "starred">("all");
  const [cardSearch, setCardSearch] = useState("");
  const [addCardOpen, setAddCardOpen] = useState(false);
  const [addFront, setAddFront] = useState("");
  const [addBack, setAddBack] = useState("");
  const [addingCard, setAddingCard] = useState(false);
  const [deckSourceModalCardId, setDeckSourceModalCardId] = useState<number | null>(null);
  const [deckTags, setDeckTagsLocal] = useState<string[]>(() => getDeckTags(deckId));
  const [tagAddInput, setTagAddInput] = useState("");
  const [tagAddOpen, setTagAddOpen] = useState(false);

  useEffect(() => { setDeckTagsLocal(getDeckTags(deckId)); }, [deckId]);
  useEffect(() => {
    const onTagsChanged = () => setDeckTagsLocal(getDeckTags(deckId));
    window.addEventListener("storage", onTagsChanged);
    window.addEventListener("deck-tags-changed", onTagsChanged);
    return () => {
      window.removeEventListener("storage", onTagsChanged);
      window.removeEventListener("deck-tags-changed", onTagsChanged);
    };
  }, [deckId]);

  const handleAddDeckTag = (tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed) return;
    addDeckTag(deckId, trimmed);
    setDeckTagsLocal(getDeckTags(deckId));
    setTagAddInput("");
    setTagAddOpen(false);
  };
  const handleRemoveDeckTag = (tag: string) => {
    removeDeckTag(deckId, tag);
    setDeckTagsLocal(getDeckTags(deckId));
  };

  const handleAddCard = async () => {
    if (!addFront.trim() || !addBack.trim() || !deck) return;
    setAddingCard(true);
    try {
      const resp = await fetch(apiUrl("api/cards"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deckId, front: addFront.trim(), back: addBack.trim() }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Failed to create card.");
      }
      queryClient.invalidateQueries({ queryKey: getListDeckCardsQueryKey(deckId) });
      queryClient.invalidateQueries({ queryKey: getGetDeckQueryKey(deckId) });
      toast({ title: "Card added" });
      setAddFront("");
      setAddBack("");
      setAddCardOpen(false);
    } catch (err) {
      toast({ title: "Failed to add card", description: err instanceof Error ? err.message : "Something went wrong.", variant: "destructive" });
    } finally {
      setAddingCard(false);
    }
  };

  const handleStudyClick = useCallback(() => {
    const sp = getSavePoint(deckId);
    if (sp && sp.index > 0) {
      setResumePrompt(sp);
    } else {
      setActiveSavePoint(null);
      setStudyMode(true);
    }
  }, [deckId]);

  const deckWithSubs = deck as DeckWithSubDecks | undefined;
  const subDecks = [...(deckWithSubs?.subDecks ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  const hasSubDecks = subDecks.length > 0;
  const [studyDueOnly, setStudyDueOnly] = useState(false);

  const handleExportJson = async () => {
    if (!deck) return;
    setIsExporting(true);
    try {
      const resp = await fetch(apiUrl(`api/decks/${deckId}/export-json`));
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error ?? "Export failed.");
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement("a"), {
        href: url,
        download: `${deck.name.replace(/[^a-z0-9_\-]/gi, "_")}.ankigen.json`,
      });
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ title: "Exported", description: `Saved ${deck.name}.ankigen.json — import it on any device from the Library page.` });
    } catch (err) {
      toast({ title: "Export failed", description: err instanceof Error ? err.message : "Something went wrong.", variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };

  const handleExport = async () => {
    if (!deck) return;
    setIsExporting(true);
    try {
      const resp = await fetch(apiUrl("api/export-apkg"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deckIds: [deckId], exportName: deck.name }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error ?? "Export failed.");
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement("a"), {
        href: url,
        download: `${deck.name.replace(/[^a-z0-9_\-]/gi, "_")}.apkg`,
      });
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ title: "Export complete", description: `Downloaded ${deck.name}.apkg — ready to import into Anki.` });
    } catch (err) {
      toast({ title: "Export failed", description: err instanceof Error ? err.message : "Something went wrong.", variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };

  if (isLoadingDeck) {
    return (
      <div className="space-y-8">
        <Skeleton className="h-10 w-1/3" />
        <div className="grid gap-4"><Skeleton className="h-40 w-full" /></div>
      </div>
    );
  }

  if (!deck) {
    return <div className="text-center py-20">Deck not found</div>;
  }

  const cardList = cards ?? [];
  const dueCardIds = getDueCardIds(cardList.map(c => c.id));
  const dueCount = dueCardIds.length;
  const visualCount = cardList.filter(c => (c as Card & { image?: string | null }).image).length;
  const textCount = cardList.length - visualCount;
  const hasMixedCards = visualCount > 0 && textCount > 0;

  const deckVisualCards: VisualCardRef[] = cardList
    .filter(c => !!(c as Card & { sourceImage?: string | null }).sourceImage)
    .map(c => {
      const cx = c as Card & { sourceImage?: string | null; bbox?: string | null; pageNumber?: number | null; figureType?: string | null };
      return {
        id: cx.id,
        sourceImage: cx.sourceImage!,
        bbox: parseBbox(cx.bbox),
        pageNumber: cx.pageNumber,
        figureType: cx.figureType,
        front: cx.front,
      };
    });
  const deckSourceModalActiveIndex = deckVisualCards.findIndex(v => v.id === deckSourceModalCardId);
  const isQbank = (deck as Deck & { kind?: string } | undefined)?.kind === "qbank";
  const showTabs = !isQbank && cardList.length > 0;
  const starredCount = cardList.filter(c => isCardStarred(c)).length;
  const tabFilteredCards = !showTabs
    ? cardList
    : cardFilter === "visual"
      ? cardList.filter(c => (c as Card & { image?: string | null }).image)
      : cardFilter === "text"
        ? cardList.filter(c => !(c as Card & { image?: string | null }).image)
        : cardFilter === "starred"
          ? cardList.filter(c => isCardStarred(c))
          : cardList;
  const filteredCards = cardSearch.trim()
    ? tabFilteredCards.filter(c => {
        const q = cardSearch.toLowerCase();
        return c.front.toLowerCase().includes(q) || c.back.toLowerCase().includes(q);
      })
    : tabFilteredCards;

  const studyCards = studyDueOnly
    ? cardList.filter(c => dueCardIds.includes(c.id))
    : filteredCards;

  if (studyMode && studyCards.length > 0) {
    return (
      <div className="space-y-6 animate-in fade-in duration-300 pb-20">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-serif font-bold text-primary tracking-tight">{deck.name}</h1>
          {(deck as Deck & { kind?: string }).kind === "qbank" ? (
            <Badge className="gap-1.5 bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/20 hover:bg-violet-500/10">
              <Stethoscope className="h-3.5 w-3.5" /> Question Bank
            </Badge>
          ) : studyDueOnly ? (
            <Badge className="gap-1.5 bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20 hover:bg-amber-500/10">
              <CalendarClock className="h-3.5 w-3.5" /> Due Review
            </Badge>
          ) : (
            <Badge className="gap-1.5 bg-primary/10 text-primary border-primary/20 hover:bg-primary/10">
              <GraduationCap className="h-3.5 w-3.5" /> Study Mode
            </Badge>
          )}
        </div>
        <StudyMode
          cards={studyCards}
          deckId={deck.id}
          deckName={deck.name}
          deckKind={(deck as Deck & { kind?: string }).kind}
          savePoint={studyDueOnly ? null : activeSavePoint}
          srsMode={true}
          onExit={() => { setStudyMode(false); setActiveSavePoint(null); setStudyDueOnly(false); }}
        />
      </div>
    );
  }

  if (resumePrompt) {
    const savedTime = new Date(resumePrompt.savedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
    const progress = resumePrompt.cardIds.length > 0
      ? Math.round(((resumePrompt.knownIds.length + resumePrompt.unknownIds.length) / resumePrompt.cardIds.length) * 100)
      : 0;
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-6 animate-in fade-in duration-300 px-4">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 mb-2">
              <Bookmark className="h-7 w-7 text-primary" />
            </div>
            <h2 className="text-xl font-serif font-bold text-primary">Resume where you left off?</h2>
            <p className="text-sm text-muted-foreground">You saved a study session on {savedTime}</p>
          </div>

          <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Card</span>
              <span className="font-medium">{resumePrompt.index + 1} / {resumePrompt.cardIds.length}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Got it</span>
              <span className="font-medium text-green-600">{resumePrompt.knownIds.length}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Still learning</span>
              <span className="font-medium text-red-500">{resumePrompt.unknownIds.length}</span>
            </div>
            <Progress value={progress} className="h-1.5 mt-1" />
            <p className="text-xs text-center text-muted-foreground">{progress}% answered</p>
          </div>

          <div className="flex flex-col gap-3">
            <Button
              className="w-full gap-2"
              onClick={() => {
                setActiveSavePoint(resumePrompt);
                setResumePrompt(null);
                setStudyMode(true);
              }}
            >
              <Play className="h-4 w-4" /> Continue from card {resumePrompt.index + 1}
            </Button>
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={() => {
                clearSavePoint(deckId);
                setActiveSavePoint(null);
                setResumePrompt(null);
                setStudyMode(true);
              }}
            >
              <RotateCcw className="h-4 w-4" /> Start fresh
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => setResumePrompt(null)}>
              <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to deck
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative space-y-8 animate-in fade-in duration-500 pb-20">
      <AmbientOrbs color="hsl(239 84% 68% / 0.08)" className="rounded-3xl" />

      <SourcePageModal
        open={deckSourceModalCardId !== null && deckSourceModalActiveIndex !== -1}
        onClose={() => setDeckSourceModalCardId(null)}
        cards={deckVisualCards}
        activeIndex={Math.max(0, deckSourceModalActiveIndex)}
        onNavigate={(i) => setDeckSourceModalCardId(deckVisualCards[i]?.id ?? null)}
      />

      <Dialog open={addCardOpen} onOpenChange={open => { setAddCardOpen(open); if (!open) { setAddFront(""); setAddBack(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-4 w-4 text-primary" /> Add Card
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Front</label>
              <Textarea
                value={addFront}
                onChange={e => setAddFront(e.target.value)}
                placeholder="Question or term…"
                className="min-h-[80px]"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Back</label>
              <Textarea
                value={addBack}
                onChange={e => setAddBack(e.target.value)}
                placeholder="Answer or definition…"
                className="min-h-[80px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddCardOpen(false)} disabled={addingCard}>Cancel</Button>
            <Button onClick={handleAddCard} disabled={!addFront.trim() || !addBack.trim() || addingCard} className="gap-2">
              {addingCard ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {addingCard ? "Adding…" : "Add Card"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="relative flex items-start justify-between flex-wrap gap-4">
        <div className="flex-1 min-w-0">
          <Link href="/decks" className="inline-flex items-center text-sm text-muted-foreground hover:text-indigo-500 mb-3 transition-colors gap-1">
            <ArrowLeft className="h-4 w-4" /> Back to Library
          </Link>
          <PageHeader
            icon={Library}
            iconColor="#818cf8"
            iconGlow="hsl(239 84% 68% / 0.5)"
            gradient="from-indigo-400 via-violet-400 to-purple-500"
            title={deck.name}
            subtitle={
              deck.description
                ? deck.description
                : `${cardList.length} card${cardList.length !== 1 ? "s" : ""}${dueCount > 0 ? ` · ${dueCount} due` : ""}`
            }
          />
          <div className="flex items-center gap-2 flex-wrap mt-2 ml-[52px]">
            {(deck as Deck & { kind?: string }).kind === "qbank" && (
              <Badge className="gap-1.5 bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/20 hover:bg-violet-500/10">
                <Stethoscope className="h-3.5 w-3.5" /> Question Bank
              </Badge>
            )}
            {hasSubDecks && (
              <Badge variant="outline" className="text-sm">
                {subDecks.length} sub-topic{subDecks.length !== 1 ? "s" : ""}
              </Badge>
            )}
            {deckTags.map(tag => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 text-xs bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/25 px-2.5 py-0.5 rounded-full font-medium"
              >
                <Tag className="h-2.5 w-2.5 opacity-60" />
                {tag}
                <button
                  onClick={() => handleRemoveDeckTag(tag)}
                  className="ml-0.5 opacity-50 hover:opacity-100 hover:text-destructive transition-opacity"
                  aria-label={`Remove tag ${tag}`}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            ))}
            {tagAddOpen ? (
              <input
                autoFocus
                value={tagAddInput}
                onChange={e => setTagAddInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter") handleAddDeckTag(tagAddInput);
                  if (e.key === "Escape") { setTagAddOpen(false); setTagAddInput(""); }
                }}
                onBlur={() => { if (!tagAddInput.trim()) { setTagAddOpen(false); } }}
                placeholder="Tag name…"
                className="h-6 w-24 px-2 text-xs rounded-full border border-indigo-500/30 bg-background/80 outline-none focus:ring-1 focus:ring-indigo-500/30"
              />
            ) : (
              <button
                onClick={() => setTagAddOpen(true)}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground/60 border border-dashed border-muted-foreground/25 hover:border-indigo-400/40 hover:text-indigo-500 px-2 py-0.5 rounded-full transition-colors"
              >
                <Tag className="h-2.5 w-2.5" />
                {deckTags.length > 0 ? "+ tag" : "Add tags"}
              </button>
            )}
          </div>
        </div>
        <div className="flex gap-2 shrink-0 flex-wrap">
          {isQbank && cardList.filter(c => c.cardType === "mcq" && Array.isArray((c as { choices?: unknown[] }).choices) && (c as { choices?: unknown[] }).choices!.length >= 2).length > 0 && (
            <Link href={`/practice/${deckId}`}>
              <Button className="gap-2 bg-violet-600 hover:bg-violet-700 text-white shadow-sm shadow-violet-500/20">
                <Play className="h-4 w-4" /> Practice Mode
              </Button>
            </Link>
          )}
          {!isQbank && dueCount > 0 && (
            <Button
              variant="outline"
              onClick={() => { setStudyDueOnly(true); setActiveSavePoint(null); setStudyMode(true); }}
              className="gap-2 border-amber-400/50 text-amber-700 dark:text-amber-300 hover:bg-amber-500/8 hover:border-amber-500/60"
            >
              <CalendarClock className="h-4 w-4" />
              Review Due
              <Badge className="ml-0.5 h-4 px-1.5 text-[10px] bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 hover:bg-amber-500/15">
                {dueCount}
              </Badge>
            </Button>
          )}
          {filteredCards.length > 0 && (
            <Button 
              variant="outline" 
              onClick={handleStudyClick} 
              className="gap-2"
            >
              <BookOpen className="h-4 w-4" />
              Study{showTabs && cardFilter !== "all" ? ` ${cardFilter === "visual" ? "Visual" : "Text"}` : ""}
              {getSavePoint(deckId)?.index ? (
                <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-[10px]">resume</Badge>
              ) : null}
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button disabled={isExporting} className="gap-2">
                <Download className="h-4 w-4" />
                {isExporting ? "Exporting…" : "Export"}
                <ChevronDown className="h-3.5 w-3.5 opacity-70" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuItem className="gap-2.5 cursor-pointer" onClick={handleExport}>
                <Package className="h-4 w-4 text-primary" />
                <div>
                  <div className="text-sm font-medium">Anki package (.apkg)</div>
                  <div className="text-xs text-muted-foreground">Import into Anki desktop/mobile</div>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-2.5 cursor-pointer" onClick={handleExportJson}>
                <FileJson className="h-4 w-4 text-blue-500" />
                <div>
                  <div className="text-sm font-medium">AnkiGen file (.json)</div>
                  <div className="text-xs text-muted-foreground">Move this deck to another device</div>
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {hasSubDecks && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight border-b pb-2">Sub-Decks</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {subDecks.map(sub => (
              <Link key={sub.id} href={`/decks/${sub.id}`}>
                <CardUI className="hover:border-primary/40 hover:shadow-md transition-all cursor-pointer border-border/40">
                  <CardContent className="flex items-center gap-3 py-3 px-4">
                    <div className="h-8 w-8 rounded-md bg-blue-500/10 flex items-center justify-center shrink-0">
                      <FileText className="h-4 w-4 text-blue-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{sub.name}</p>
                    </div>
                    <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded shrink-0">
                      {sub.cardCount} card{sub.cardCount !== 1 ? "s" : ""}
                    </span>
                  </CardContent>
                </CardUI>
              </Link>
            ))}
          </div>
        </div>
      )}

      {cardList.length > 0 && (
        <MindMapGallery deckId={deckId} cards={cardList} deckName={deck.name} />
      )}

      <div className="space-y-6">
        <div className="flex flex-col gap-3 border-b pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-medium tracking-tight">
                Cards ({cardSearch.trim() ? `${filteredCards.length} of ${cardList.length}` : (showTabs ? tabFilteredCards.length : cardList.length)})
                {hasSubDecks && cardList.length > 0 && (
                  <span className="text-sm font-normal text-muted-foreground ml-2">across all sub-topics</span>
                )}
              </h2>
              <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs" onClick={() => setAddCardOpen(true)}>
                <Plus className="h-3 w-3" /> Add card
              </Button>
            </div>
            {showTabs && (
              <Tabs value={cardFilter} onValueChange={(v) => { setCardFilter(v as "all" | "text" | "visual" | "starred"); setCardSearch(""); }}>
                <TabsList className="h-9">
                  <TabsTrigger value="all" className="text-xs gap-1.5">
                    All <span className="text-[10px] opacity-70">{cardList.length}</span>
                  </TabsTrigger>
                  <TabsTrigger value="text" className="text-xs gap-1.5">
                    <FileText className="h-3 w-3" /> Text <span className="text-[10px] opacity-70">{textCount}</span>
                  </TabsTrigger>
                  <TabsTrigger value="visual" className="text-xs gap-1.5">
                    <ImageIcon className="h-3 w-3" /> Visual <span className="text-[10px] opacity-70">{visualCount}</span>
                  </TabsTrigger>
                  {starredCount > 0 && (
                    <TabsTrigger value="starred" className="text-xs gap-1.5">
                      <Star className="h-3 w-3 fill-amber-400 text-amber-400" /> Starred <span className="text-[10px] opacity-70">{starredCount}</span>
                    </TabsTrigger>
                  )}
                </TabsList>
              </Tabs>
            )}
          </div>
          {cardList.length > 6 && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                value={cardSearch}
                onChange={e => setCardSearch(e.target.value)}
                placeholder="Search cards…"
                className="pl-9 pr-9 h-9 text-sm"
              />
              {cardSearch && (
                <button onClick={() => setCardSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
        </div>

        {isLoadingCards ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 w-full" />)}
          </div>
        ) : cardList.length === 0 ? (
          <div className="text-center py-12 bg-card rounded-lg border border-dashed">
            <p className="text-muted-foreground">No cards in this deck yet.</p>
          </div>
        ) : filteredCards.length === 0 ? (
          <div className="text-center py-12 bg-card rounded-lg border border-dashed">
            <p className="text-muted-foreground">
              No {cardFilter} cards in this deck.
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {filteredCards.map((card, idx) => (
              <EditableCard 
                key={card.id} 
                card={card}
                subDeckName={hasSubDecks ? subDecks.find(s => s.id === card.deckId)?.name : undefined}
                index={idx}
                onViewSource={(id) => setDeckSourceModalCardId(id)}
                onLightbox={(src) => setLightboxSrc(src)}
                onStar={async (id, starred) => {
                  const c = cardList.find(x => x.id === id);
                  if (!c) return;
                  const newTags = toggleStarInTags(c, starred);
                  await fetch(apiUrl(`api/cards/${id}`), {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ tags: newTags }),
                  });
                  queryClient.invalidateQueries({ queryKey: getListDeckCardsQueryKey(deckId) });
                }}
                onRegenerate={async (id) => {
                  const resp = await fetch(apiUrl(`api/cards/${id}/regenerate`), { method: "POST" });
                  if (resp.ok) {
                    queryClient.invalidateQueries({ queryKey: getListDeckCardsQueryKey(deckId) });
                    toast({ title: "Card regenerated", description: "AI rewrote this card." });
                  } else {
                    toast({ title: "Regeneration failed", variant: "destructive" });
                  }
                }}
                onUpdate={(id, data) => updateCard.mutate(
                  { id, data },
                  {
                    onSuccess: () => {
                      queryClient.invalidateQueries({ queryKey: getListDeckCardsQueryKey(deckId) });
                      toast({ title: "Card updated" });
                    }
                  }
                )}
                onDelete={(id) => {
                  if (confirm("Delete this card?")) {
                    deleteCard.mutate({ id }, {
                      onSuccess: () => {
                        queryClient.invalidateQueries({ queryKey: getListDeckCardsQueryKey(deckId) });
                        queryClient.invalidateQueries({ queryKey: getGetDeckQueryKey(deckId) });
                        toast({ title: "Card deleted" });
                      }
                    });
                  }
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function isCardStarred(card: Card): boolean {
  const tags = (card as Card & { tags?: string | null }).tags ?? "";
  try { const arr = JSON.parse(tags); if (Array.isArray(arr)) return arr.includes("starred"); } catch { /* */ }
  return tags.split(",").map(t => t.trim()).includes("starred");
}

function toggleStarInTags(card: Card, star: boolean): string | null {
  const existing = (card as Card & { tags?: string | null }).tags ?? "";
  let tags: string[] = [];
  try { const arr = JSON.parse(existing); if (Array.isArray(arr)) tags = arr; else tags = existing ? [existing] : []; }
  catch { tags = existing ? existing.split(",").map(t => t.trim()).filter(Boolean) : []; }
  tags = tags.filter(t => t !== "starred");
  if (star) tags.push("starred");
  return tags.length ? tags.join(",") : null;
}

function EditableCard({ 
  card, 
  index,
  subDeckName,
  onViewSource,
  onUpdate, 
  onDelete,
  onStar,
  onLightbox,
  onRegenerate,
}: { 
  card: Card;
  index: number;
  subDeckName?: string;
  onViewSource?: (id: number) => void;
  onUpdate: (id: number, data: { front: string; back: string }) => void; 
  onDelete: (id: number) => void;
  onStar?: (id: number, starred: boolean) => void;
  onLightbox?: (src: string) => void;
  onRegenerate?: (id: number) => void;
}) {
  const daysUntilDue = getDaysUntilDue(card.id);
  const cardSrs = getSrsState(card.id);
  const [isEditing, setIsEditing] = useState(false);
  const [front, setFront] = useState(card.front);
  const [back, setBack] = useState(card.back);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const isStarred = isCardStarred(card);

  const handleSave = () => {
    if (front !== card.front || back !== card.back) {
      onUpdate(card.id, { front, back });
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setFront(card.front);
    setBack(card.back);
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <CardUI className="border-primary/40 shadow-md ring-1 ring-primary/20">
        <CardContent className="p-4 space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Front</label>
            <Textarea 
              value={front} 
              onChange={e => setFront(e.target.value)} 
              className="min-h-[80px] font-medium"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Back</label>
            <Textarea 
              value={back} 
              onChange={e => setBack(e.target.value)} 
              className="min-h-[100px]"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={handleCancel}>
              <X className="h-4 w-4 mr-1" /> Cancel
            </Button>
            <Button size="sm" onClick={handleSave}>
              <Check className="h-4 w-4 mr-1" /> Save Changes
            </Button>
          </div>
        </CardContent>
      </CardUI>
    );
  }

  return (
    <CardUI 
      className="group hover-elevate transition-all duration-300 border-border/40 bg-card/70 backdrop-blur-sm animate-in fade-in slide-in-from-bottom-2 hover:border-indigo-500/30 hover:shadow-sm"
      style={{ animationDelay: `${Math.min(index, 12) * 30}ms` }}
    >
      {subDeckName && (
        <div className="px-4 pt-3 pb-0">
          <span className="text-[10px] font-semibold text-blue-500 bg-blue-500/10 px-2 py-0.5 rounded-sm uppercase tracking-wider">
            {subDeckName}
          </span>
        </div>
      )}
      <CardContent className="p-0 flex flex-col sm:flex-row relative">
        <div className="flex-1 p-4 sm:p-5 border-b sm:border-b-0 sm:border-r border-border/40">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5 flex-wrap">
            Front
            {daysUntilDue !== null && (
              <span className={`inline-flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${
                daysUntilDue <= 0
                  ? "bg-amber-500/12 text-amber-700 dark:text-amber-400 border border-amber-500/30"
                  : daysUntilDue <= 2
                  ? "bg-sky-500/10 text-sky-700 dark:text-sky-400 border border-sky-500/20"
                  : "bg-muted text-muted-foreground border border-border/40"
              }`}>
                <CalendarClock className="h-2.5 w-2.5" />
                {daysUntilDue <= 0 ? "Due now" : `Due in ${daysUntilDue}d`}
              </span>
            )}
            {cardSrs !== null && cardSrs.reps > 0 && (
              <span className="inline-flex items-center gap-0.5 text-[9px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full border border-border/40">
                EF {cardSrs.easeFactor.toFixed(2)}
              </span>
            )}
            {(card as Card & { image?: string | null }).image && (
              <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                <ImageIcon className="h-2.5 w-2.5" /> Visual
              </span>
            )}
            {card.cardType === "mcq" && Array.isArray(card.choices) && card.choices.length > 0 && (
              <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-purple-600 bg-purple-500/10 px-1.5 py-0.5 rounded-full">
                <ClipboardList className="h-2.5 w-2.5" /> MCQ
              </span>
            )}
            {(() => {
              const cx = card as Card & { image?: string | null; sourceImage?: string | null; pageNumber?: number | null };
              if (cx.sourceImage && onViewSource) {
                return (
                  <button
                    type="button"
                    onClick={() => onViewSource(card.id)}
                    className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-violet-600 dark:text-violet-400 bg-violet-500/10 hover:bg-violet-500/20 px-1.5 py-0.5 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                  >
                    <BookOpen className="h-2.5 w-2.5" />
                    View Source{cx.pageNumber != null ? ` · p.${cx.pageNumber}` : ""}
                  </button>
                );
              }
              if (!cx.image && cx.pageNumber != null) {
                return (
                  <span className="inline-flex items-center gap-0.5 text-[9px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                    Page {cx.pageNumber}
                  </span>
                );
              }
              return null;
            })()}
          </div>
          {(() => {
            const c = card as Card & { image?: string | null; sourceImage?: string | null; bbox?: string | null };
            if (!c.image) return null;
            return (
              <div className="mb-3">
                <CropCompare
                  image={c.image}
                  sourceImage={c.sourceImage}
                  bbox={parseBbox(c.bbox)}
                  onLightbox={onLightbox}
                />
              </div>
            );
          })()}
          <p className="font-medium text-foreground whitespace-pre-wrap leading-relaxed">{card.front}</p>
        </div>
        <div className="flex-1 p-4 sm:p-5">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Back</div>
          <p className="text-muted-foreground whitespace-pre-wrap leading-relaxed">{card.back}</p>
        </div>
        
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-1 bg-background/80 backdrop-blur-sm rounded-md shadow-sm p-1">
          <Button
            variant="ghost" size="icon"
            className={`h-8 w-8 transition-colors ${isStarred ? "text-amber-400 hover:text-amber-500" : "text-muted-foreground hover:text-amber-400"}`}
            title={isStarred ? "Unstar card" : "Star card"}
            onClick={() => onStar?.(card.id, !isStarred)}
          >
            <Star className={`h-4 w-4 ${isStarred ? "fill-amber-400" : ""}`} />
          </Button>
          <Button
            variant="ghost" size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-emerald-500"
            title="Regenerate card with AI"
            disabled={isRegenerating}
            onClick={async () => {
              if (!onRegenerate) return;
              setIsRegenerating(true);
              try { await onRegenerate(card.id); } finally { setIsRegenerating(false); }
            }}
          >
            {isRegenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={() => setIsEditing(true)}>
            <Edit2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => onDelete(card.id)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </CardUI>
  );
}
