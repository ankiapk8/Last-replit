import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useListDecks, getListDecksQueryKey } from "@workspace/api-client-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";
import { BatteryProgress } from "@/components/ui/battery-progress";
import {
  UploadCloud, X, CheckCircle2, AlertCircle, Loader2, FileText, Sparkles,
  FolderOpen, ImageIcon, Type, Layers, StopCircle, Eye,
} from "lucide-react";
import { GenerationStageStepper, stageFromGenerating } from "@/components/generation-stage-stepper";
import { CardReviewModal } from "@/components/card-review-modal";
import { GenerationProgressLog } from "@/components/generation-progress-log";
import { CardPreviewPanel } from "@/components/card-preview-panel";
import { extractPdf, isPdfFile, isTextFile, isImageFile, isPptxFile, isDocxFile, extractImage, extractOffice, type ImageRegion } from "@/lib/pdf-extraction";
import { apiUrl } from "@/lib/utils";
import { GenerationSuccessOverlay } from "@/components/generation-success-overlay";
import type { Deck } from "@workspace/api-client-react/src/generated/api.schemas";
import { useOfflineQueue } from "@/hooks/use-offline-queue";
import { UpgradeBanner } from "@/components/upgrade-gate";

interface LimitReachedBody {
  limitReached: true;
  feature: string;
  message: string;
}

function isLimitReachedBody(v: unknown): v is LimitReachedBody {
  if (typeof v !== "object" || v === null) return false;
  const obj = v as Record<string, unknown>;
  return obj.limitReached === true && typeof obj.feature === "string";
}

class LimitReachedError extends Error {
  readonly limitReached = true as const;
  readonly feature: string;
  constructor(message: string, feature: string) {
    super(message);
    this.name = "LimitReachedError";
    this.feature = feature;
  }
}

const DEFAULT_TARGET_CARDS = 20;
const CHARS_PER_CARD = 220;
const MAX_CAPACITY = 500;

function estimateCardCapacity(text: string, pageImages: number): number {
  const chars = text.trim().length;
  if (chars === 0 && pageImages === 0) return 0;
  const textCards = Math.round(chars / CHARS_PER_CARD);
  const visualCards = Math.min(pageImages, 50);
  return Math.max(3, Math.min(MAX_CAPACITY, textCards + visualCards));
}

function estimatedCards(text: string, pageImages: number, target: number | ""): number {
  const capacity = estimateCardCapacity(text, pageImages);
  if (capacity === 0) return 0;
  const goal = typeof target === "number" && target > 0 ? target : DEFAULT_TARGET_CARDS;
  return Math.min(goal, capacity);
}

function parseProgressPercent(message: string): number | null {
  const match = message.match(/(\d+)\s*\/\s*(\d+)/);
  if (!match) return null;
  const current = parseInt(match[1], 10);
  const total = parseInt(match[2], 10);
  if (!total) return null;
  return Math.round((current / total) * 100);
}

function getProgressPhase(message: string): "text" | "images" | "ocr" | "server" | "other" {
  if (message.startsWith("Extracting page")) return "text";
  if (message.startsWith("Capturing page")) return "images";
  if (message.startsWith("OCR page")) return "ocr";
  if (message.includes("server") || message.includes("Server")) return "server";
  return "other";
}

type FileStatus = "extracting" | "ready" | "error" | "generating" | "done";
type DeckType = "text" | "visual" | "both";

type StagedCard = {
  front: string;
  back: string;
  cardType: string;
  image?: string | null;
  pageNumber?: number | null;
};

type FileEntry = {
  id: string;
  name: string;
  status: FileStatus;
  text: string;
  pageImages: string[];
  pageTexts: string[];
  pageImageRegions: ImageRegion[][];
  pageHasVisuals?: boolean[];
  progress: string;
  deckName: string;
  cardCount: number | "";
  visualCardCount: number | "";
  deckType: DeckType;
  generatedCount?: number;
  generatingPercent?: number;
  generatingMessage?: string;
  generatingStartedAt?: number;
  customPrompt?: string;
  generatedDeckId?: number;
  liveCardCount?: number;
  stagedCards?: StagedCard[];
  generatingStage?: string;
  generatingLog?: string[];
};

function formatEta(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `~${Math.max(5, seconds)}s left`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `~${minutes} min left`;
  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;
  return remMin > 0 ? `~${hours}h ${remMin}m left` : `~${hours}h left`;
}

type DeckWithParent = Deck & { parentId?: number | null };

function buildParentOptions(allDecks: DeckWithParent[]): { id: number; label: string; depth: number }[] {
  const rootDecks = allDecks.filter(d => !d.parentId);
  const byParent = new Map<number, DeckWithParent[]>();
  allDecks.filter(d => d.parentId).forEach(d => {
    const pid = d.parentId!;
    if (!byParent.has(pid)) byParent.set(pid, []);
    byParent.get(pid)!.push(d);
  });

  const result: { id: number; label: string; depth: number }[] = [];

  function walk(deck: DeckWithParent, label: string, depth: number) {
    result.push({ id: deck.id, label, depth });
    const children = byParent.get(deck.id) ?? [];
    for (const child of children.sort((a, b) => a.name.localeCompare(b.name))) {
      walk(child, `${label} › ${child.name}`, depth + 1);
    }
  }

  for (const d of rootDecks.sort((a, b) => a.name.localeCompare(b.name))) {
    walk(d, d.name, 0);
  }

  return result;
}

export interface GenerateFormProps {
  variant?: "sheet" | "page";
  defaultParentId?: number | null;
  prefilledText?: string;
  prefilledDeckName?: string;
  prefilledCustomPrompt?: string;
  onDone?: () => void;
  onClose?: () => void;
  animated?: boolean;
}

export function GenerateForm({
  variant = "sheet",
  defaultParentId,
  prefilledText,
  prefilledDeckName,
  prefilledCustomPrompt,
  onDone,
  onClose,
  animated = false,
}: GenerateFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { enqueue } = useOfflineQueue();
  const { data: allDecks } = useListDecks();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<FileEntry[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [limitReachedFeature, setLimitReachedFeature] = useState<string | null>(null);
  const [successOverlay, setSuccessOverlay] = useState<{ open: boolean; decks: number; cards: number }>({ open: false, decks: 0, cards: 0 });
  const pendingDoneRef = useRef<(() => void) | null>(null);
  const [reviewState, setReviewState] = useState<{ deckId?: number; deckName: string; autoClose?: () => void; stagedCards?: StagedCard[]; onCommit?: (cards: StagedCard[]) => Promise<void> } | null>(null);
  const [inlinePreview, setInlinePreview] = useState<{ cards: StagedCard[]; deckName: string; onSave: (cards: StagedCard[]) => Promise<void> } | null>(null);
  const [manualGeneratingLog, setManualGeneratingLog] = useState<string[]>([]);
  const [autoGeneratePending, setAutoGeneratePending] = useState(false);
  const [manualText, setManualText] = useState("");
  const [manualDeckName, setManualDeckName] = useState("");
  const [manualCardCount, setManualCardCount] = useState<number | "">("");
  const [manualCustomPrompt, setManualCustomPrompt] = useState("");
  const [sharedCustomPrompt, setSharedCustomPrompt] = useState("");
  const [applySharedPrompt, setApplySharedPrompt] = useState(true);
  const [parentId, setParentId] = useState<string>(defaultParentId?.toString() ?? "none");

  const isAnyGenerating = files.some(f => f.status === "generating");
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    if (!isAnyGenerating) return;
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isAnyGenerating]);

  useEffect(() => {
    if (prefilledText || prefilledDeckName || prefilledCustomPrompt) {
      if (prefilledText) setManualText(prev => prev || prefilledText);
      if (prefilledDeckName) setManualDeckName(prev => prev || prefilledDeckName);
      if (prefilledCustomPrompt) {
        // Seed both the shared prompt (applies to all file entries in file-upload flow)
        // and the manual text prompt, so History re-run restores settings for either mode.
        setSharedCustomPrompt(prev => prev || prefilledCustomPrompt);
        setManualCustomPrompt(prev => prev || prefilledCustomPrompt);
      }
    }
  }, [prefilledText, prefilledDeckName, prefilledCustomPrompt]);

  const isExtracting = files.some(f => f.status === "extracting");
  const readyFiles = files.filter(f => f.status === "ready");
  const hasManual = manualText.trim().length > 0 && manualDeckName.trim().length > 0;
  const canGenerate = !isExtracting && !isGeneratingAll && (readyFiles.length > 0 || hasManual);

  const parentOptions = useMemo(
    () => buildParentOptions(((allDecks as DeckWithParent[]) ?? []).filter(d => (d.kind ?? "deck") !== "qbank")),
    [allDecks]
  );

  const updateFile = useCallback((id: string, patch: Partial<FileEntry>) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, ...patch } : f));
  }, []);

  const progressThrottleRef = useRef<Map<string, number>>(new Map());
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const cancelledIdsRef = useRef<Set<string>>(new Set());
  const manualCancelKey = "__manual__";
  const [isCancelling, setIsCancelling] = useState(false);

  const throttledProgressUpdate = useCallback((id: string, progress: string) => {
    const now = Date.now();
    const last = progressThrottleRef.current.get(id) ?? 0;
    if (now - last >= 150) {
      progressThrottleRef.current.set(id, now);
      setFiles(prev => prev.map(f => f.id === id ? { ...f, progress } : f));
    }
  }, []);

  const processFile = useCallback(async (file: File) => {
    const isTxt = isTextFile(file);
    const isPdf = isPdfFile(file);
    const isImg = isImageFile(file);
    const isPptx = isPptxFile(file);
    const isDocx = isDocxFile(file);
    if (!isTxt && !isPdf && !isImg && !isPptx && !isDocx) {
      toast({ title: "Unsupported file", description: `${file.name} is not a supported format (.pdf, .txt, .pptx, .docx, image)`, variant: "destructive" });
      return;
    }
    const id = `${file.name}-${Date.now()}-${Math.random()}`;
    const baseName = file.name.replace(/\.[^.]+$/, "");
    setFiles(prev => [...prev, { id, name: file.name, status: "extracting", text: "", pageImages: [], pageTexts: [], pageImageRegions: [], pageHasVisuals: [], progress: "Reading…", deckName: baseName, cardCount: "", visualCardCount: "", deckType: "both" }]);
    try {
      if (isTxt) {
        const text = await file.text();
        updateFile(id, { status: "ready", text, pageImages: [], pageTexts: [], pageImageRegions: [], pageHasVisuals: [], progress: "" });
      } else if (isImg) {
        throttledProgressUpdate(id, "Reading image…");
        const { text, pageImages, pageTexts, pageImageRegions } = await extractImage(file);
        updateFile(id, { status: "ready", text, pageImages, pageTexts, pageImageRegions, pageHasVisuals: [true], progress: "", deckType: "visual" });
      } else if (isPptx || isDocx) {
        throttledProgressUpdate(id, "Sending to server…");
        const { text, pageImages, pageTexts, pageImageRegions } = await extractOffice(file, (progress) => throttledProgressUpdate(id, progress));
        updateFile(id, { status: "ready", text, pageImages, pageTexts, pageImageRegions, pageHasVisuals: [], progress: "", deckType: "text" });
      } else {
        const buffer = await file.arrayBuffer();
        const { text, pageImages, pageTexts, pageImageRegions, pageHasVisuals } = await extractPdf(buffer, (progress) => throttledProgressUpdate(id, progress));
        const hasAnyEmbeddedImage = pageImageRegions.some(r => r.length > 0);
        updateFile(id, { status: "ready", text, pageImages, pageTexts, pageImageRegions, pageHasVisuals: pageHasVisuals ?? [], progress: "", deckType: hasAnyEmbeddedImage ? "both" : "text" });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Extraction failed";
      updateFile(id, { status: "error", progress: message });
    }
  }, [updateFile, throttledProgressUpdate, toast]);

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []);
    e.target.value = "";
    await Promise.all(selected.map(f => processFile(f)));
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    await Promise.all(Array.from(e.dataTransfer.files).map(f => processFile(f)));
  };

  const resolvedParentId = parentId === "none" ? null : parseInt(parentId, 10);

  const pauseBetweenFiles = () => new Promise(resolve => setTimeout(resolve, 1500));

  const getGenerationErrorMessage = (error: unknown) => {
    if (error && typeof error === "object") {
      const data = (error as { data?: unknown }).data;
      if (data && typeof data === "object") {
        const apiError = (data as { error?: unknown }).error;
        if (typeof apiError === "string" && apiError.trim()) return apiError;
      }
      const message = (error as { message?: unknown }).message;
      if (typeof message === "string" && message.trim()) {
        return message.replace(/^HTTP \d+\s+[^:]+:\s*/, "");
      }
    }
    return "Generation failed";
  };

  const generateOne = (
    text: string,
    deckName: string,
    cardCount: number | "",
    pid: number | null,
    pageImages?: string[],
    fileId?: string,
    deckType: DeckType = "text",
    visualCardCount: number | "" = "",
    customPrompt?: string,
    pageTexts?: string[],
    pageImageRegions?: ImageRegion[][],
    usePreview = false,
    onProgressMsg?: (msg: string) => void,
  ): Promise<{ count: number; deckId?: number; stagedCards?: StagedCard[] }> =>
    new Promise((resolve, reject) => {
      const trimmedPrompt = (customPrompt ?? "").trim();
      const body = JSON.stringify({
        text, deckName,
        cardCount: cardCount ? Number(cardCount) : undefined,
        visualCardCount: visualCardCount ? Number(visualCardCount) : undefined,
        deckType,
        parentId: pid,
        pageImages: pageImages && pageImages.length > 0 ? pageImages : undefined,
        pageTexts: pageTexts && pageTexts.length > 0 ? pageTexts : undefined,
        pageImageRegions: pageImageRegions && pageImageRegions.length > 0 ? pageImageRegions : undefined,
        customPrompt: trimmedPrompt || undefined,
        ...(usePreview ? { preview: true } : {}),
      });

      const controller = new AbortController();
      abortControllersRef.current.set(fileId ?? manualCancelKey, controller);

      fetch(apiUrl("api/generate/stream"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: controller.signal,
      }).then(async resp => {
        if (!resp.ok || !resp.body) {
          const body = await resp.json().catch(() => ({})) as Record<string, unknown>;
          if (isLimitReachedBody(body)) {
            reject(new LimitReachedError(body.message, body.feature));
          } else {
            reject(new Error(typeof body.error === "string" ? body.error : "Generation failed"));
          }
          return;
        }

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            try {
              const event = JSON.parse(line.slice(5).trim()) as {
                type: string; percent?: number; message?: string; generatedCount?: number;
                deck?: { id?: number }; cardsCreated?: number; cards?: StagedCard[]; stage?: string;
              };
              if (event.type === "progress") {
                const msg = event.message;
                if (fileId) {
                  setFiles(prev => prev.map(f =>
                    f.id === fileId
                      ? {
                          ...f,
                          generatingPercent: event.percent,
                          generatingMessage: msg,
                          liveCardCount: event.cardsCreated ?? f.liveCardCount,
                          generatingStage: event.stage ?? f.generatingStage,
                          generatingLog: msg ? [...(f.generatingLog ?? []), msg] : (f.generatingLog ?? []),
                        }
                      : f
                  ));
                }
                if (msg) onProgressMsg?.(msg);
              } else if (event.type === "done") {
                resolve({ count: event.generatedCount ?? 0, deckId: event.deck?.id, stagedCards: event.cards });
                return;
              } else if (event.type === "error") {
                reject(new Error(event.message ?? "Generation failed"));
                return;
              }
            } catch { continue; }
          }
        }
        reject(new Error(
          "Connection dropped before generation finished. Your network may have changed (Wi-Fi ↔ mobile) or the app was backgrounded. Please try again — the AI run was not saved.",
        ));
      }).catch(err => {
        if (err && typeof err === "object" && (err as { name?: string }).name === "AbortError") {
          reject(new Error("Cancelled"));
        } else {
          reject(err);
        }
      }).finally(() => {
        abortControllersRef.current.delete(fileId ?? manualCancelKey);
      });
    });

  const cancelOne = (fileId: string | undefined) => {
    const key = fileId ?? manualCancelKey;
    cancelledIdsRef.current.add(key);
    abortControllersRef.current.get(key)?.abort();
  };

  const cancelAll = () => {
    setIsCancelling(true);
    for (const [key, c] of abortControllersRef.current.entries()) {
      cancelledIdsRef.current.add(key);
      c.abort();
    }
  };

  const handleRegenerate = () => {
    setInlinePreview(null);
    setManualGeneratingLog([]);
    setFiles(prev => prev.map(f =>
      f.status === "done"
        ? { ...f, status: "ready", generatedCount: undefined, generatedDeckId: undefined, stagedCards: undefined, generatingLog: [], generatingPercent: 0, generatingMessage: undefined, liveCardCount: undefined }
        : f
    ));
    setAutoGeneratePending(true);
  };

  const handleDiscard = () => {
    setInlinePreview(null);
    setManualGeneratingLog([]);
    setFiles(prev => prev.map(f =>
      f.status === "done"
        ? { ...f, status: "ready", generatedCount: undefined, generatedDeckId: undefined, stagedCards: undefined, generatingLog: [], generatingPercent: 0, generatingMessage: undefined, liveCardCount: undefined }
        : f
    ));
  };

  useEffect(() => {
    if (!autoGeneratePending || isGeneratingAll) return;
    setAutoGeneratePending(false);
    handleGenerateAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoGeneratePending, isGeneratingAll]);

  const resetState = () => {
    setFiles([]);
    setManualText(""); setManualDeckName(""); setManualCardCount("");
    setParentId(defaultParentId?.toString() ?? "none");
  };

  const handleGenerateAll = async () => {
    setIsGeneratingAll(true);
    setIsCancelling(false);
    cancelledIdsRef.current.clear();
    setManualGeneratingLog([]);
    setInlinePreview(null);
    let ok = 0, fail = 0, cancelled = 0, totalCards = 0;
    let lastDoneId: number | undefined;
    let lastDoneName = "";
    let lastStagedCards: StagedCard[] | undefined;
    let lastDoneFileId: string | undefined;
    const sharedTrim = sharedCustomPrompt.trim();
    const fileEffectivePrompt = (f: FileEntry) => {
      const own = (f.customPrompt ?? "").trim();
      if (own) return own;
      return applySharedPrompt && sharedTrim ? sharedTrim : "";
    };
    const manualEffectivePrompt = () => {
      const own = manualCustomPrompt.trim();
      if (own) return own;
      return applySharedPrompt && sharedTrim ? sharedTrim : "";
    };
    const targets = [
      ...readyFiles.map(f => ({ id: f.id, text: f.text, deckName: f.deckName, cardCount: f.cardCount, pageImages: f.pageImages, pageTexts: f.pageTexts, pageImageRegions: f.pageImageRegions, deckType: f.deckType, visualCardCount: f.visualCardCount, customPrompt: fileEffectivePrompt(f) })),
      ...(hasManual ? [{ id: undefined, text: manualText, deckName: manualDeckName, cardCount: manualCardCount, pageImages: [] as string[], pageTexts: [] as string[], pageImageRegions: [] as ImageRegion[][], deckType: "text" as DeckType, visualCardCount: "" as number | "", customPrompt: manualEffectivePrompt() }] : []),
    ];
    // Only use pre-commit review flow for single-target runs; multi-file runs
    // persist to DB normally so no data is lost if anything goes wrong.
    const usePreview = targets.length === 1;

    if (!navigator.onLine) {
      const textTargets = targets.filter(t => t.id === undefined);
      if (textTargets.length > 0) {
        for (const t of textTargets) {
          await enqueue({
            deckName: t.deckName,
            text: t.text,
            numCards: typeof t.cardCount === "number" ? t.cardCount : 20,
            type: "deck",
            customPrompt: t.customPrompt || undefined,
          });
        }
        toast({
          title: `${textTargets.length} deck${textTargets.length > 1 ? "s" : ""} queued`,
          description: "Will generate automatically when you reconnect.",
        });
      } else {
        toast({ title: "No internet connection", description: "File-based generation requires internet.", variant: "destructive" });
      }
      setIsGeneratingAll(false);
      return;
    }

    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      if (!t.deckName.trim()) {
        toast({ title: "Deck name required", variant: "destructive" });
        setIsGeneratingAll(false);
        return;
      }

      const key = t.id ?? manualCancelKey;
      if (cancelledIdsRef.current.has(manualCancelKey)) {
        if (t.id) updateFile(t.id, { status: "ready", progress: "Cancelled", generatingPercent: 0, generatingMessage: undefined });
        cancelled++;
        continue;
      }

      if (t.id) updateFile(t.id, { status: "generating", progress: "Generating…", generatingPercent: 0, generatingMessage: "Starting…", generatingStartedAt: Date.now(), generatingLog: [] });
      try {
        const onProgressMsg = t.id === undefined
          ? (msg: string) => setManualGeneratingLog(prev => [...prev, msg])
          : undefined;
        const { count, deckId: doneId, stagedCards } = await generateOne(t.text, t.deckName, t.cardCount, resolvedParentId, t.pageImages, t.id, t.deckType, t.visualCardCount, t.customPrompt, t.pageTexts, t.pageImageRegions, usePreview, onProgressMsg);
        if (t.id) updateFile(t.id, { status: "done", progress: "", generatedCount: count, generatedDeckId: doneId, stagedCards });
        ok++;
        totalCards += count;
        lastDoneId = doneId;
        lastDoneName = t.deckName;
        lastStagedCards = stagedCards;
        lastDoneFileId = t.id;
      } catch (error) {
        const wasCancelled = cancelledIdsRef.current.has(key) || cancelledIdsRef.current.has(manualCancelKey);
        if (wasCancelled) {
          if (t.id) updateFile(t.id, { status: "ready", progress: "Cancelled", generatingPercent: 0, generatingMessage: undefined });
          cancelled++;
        } else if (error instanceof LimitReachedError) {
          if (t.id) updateFile(t.id, { status: "error", progress: "Pro feature required" });
          setLimitReachedFeature(error.feature);
          fail++;
        } else {
          const message = getGenerationErrorMessage(error);
          if (t.id) updateFile(t.id, { status: "error", progress: message });
          toast({ title: `Could not generate ${t.deckName}`, description: message, variant: "destructive" });
          fail++;
        }
      }
      if (i < targets.length - 1 && !cancelledIdsRef.current.has(manualCancelKey)) await pauseBetweenFiles();
    }

    setIsGeneratingAll(false);
    setIsCancelling(false);
    queryClient.invalidateQueries({ queryKey: getListDecksQueryKey() });

    if (cancelled > 0 && ok === 0) {
      toast({ title: "Generation cancelled", description: `${cancelled} ${cancelled === 1 ? "deck" : "decks"} were not generated.` });
      return;
    }

    if (ok > 0) {
      const cleanRun = fail === 0 && cancelled === 0;
      if (cleanRun && ok === 1) {
        const capturedName = lastDoneName;
        const capturedCards = totalCards;
        const capturedFileId = lastDoneFileId;

        if (lastStagedCards && lastStagedCards.length > 0) {
          // Pre-commit: cards not yet in DB — show inline preview, commit on save
          const commitAndFinish = async (editedCards: StagedCard[]) => {
            try {
              const resp = await fetch(apiUrl("api/generate/commit"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ deckName: capturedName, parentId: resolvedParentId, cards: editedCards }),
              });
              if (!resp.ok) throw new Error("Save failed");
              const data = await resp.json() as { deck: { id: number }; cardCount: number };
              if (capturedFileId) updateFile(capturedFileId, { generatedDeckId: data.deck.id, generatedCount: data.cardCount });
              queryClient.invalidateQueries({ queryKey: getListDecksQueryKey() });
              setInlinePreview(null);
              setSuccessOverlay({ open: true, decks: 1, cards: data.cardCount });
              pendingDoneRef.current = () => { resetState(); onDone?.(); };
            } catch {
              toast({ title: "Failed to save deck", description: "Please try again.", variant: "destructive" });
            }
          };
          setInlinePreview({ cards: lastStagedCards, deckName: capturedName, onSave: commitAndFinish });
        } else if (lastDoneId) {
          // Already saved: open post-save review before navigating
          const capturedId = lastDoneId;
          setReviewState({
            deckId: capturedId,
            deckName: capturedName,
            autoClose: () => {
              setSuccessOverlay({ open: true, decks: 1, cards: capturedCards });
              pendingDoneRef.current = () => { resetState(); onDone?.(); };
            },
          });
        } else {
          setSuccessOverlay({ open: true, decks: 1, cards: capturedCards });
          pendingDoneRef.current = () => { resetState(); onDone?.(); };
        }
      } else {
        setSuccessOverlay({ open: true, decks: ok, cards: totalCards });
        if (cleanRun) {
          pendingDoneRef.current = () => { resetState(); onDone?.(); };
        } else {
          toast({
            title: ok === 1 ? "Deck generated!" : `${ok} decks generated!`,
            description: `${fail > 0 ? `${fail} failed` : ""}${fail > 0 && cancelled > 0 ? ", " : ""}${cancelled > 0 ? `${cancelled} cancelled` : ""}.`,
          });
        }
      }
    } else {
      toast({ title: "Generation failed", variant: "destructive" });
    }
  };

  const totalTargets = readyFiles.length + (hasManual ? 1 : 0);

  const ParentSelector = () => {
    const selected = parentOptions.find(o => o.id.toString() === parentId);
    return (
      <div className="space-y-1.5">
        <Label className="text-sm flex items-center gap-1.5">
          <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
          Parent Topic <span className="text-muted-foreground font-normal">(optional)</span>
        </Label>
        <Select value={parentId} onValueChange={setParentId}>
          <SelectTrigger className="h-8 text-sm">
            {parentId === "none" || !selected
              ? <span className="text-muted-foreground">No parent — standalone topic</span>
              : <span className="truncate">{selected.label}</span>
            }
          </SelectTrigger>
          <SelectContent className="max-h-64">
            <SelectItem value="none">No parent — standalone topic</SelectItem>
            {parentOptions.map(opt => (
              <SelectItem key={opt.id} value={opt.id.toString()} className="py-1.5">
                <span className="flex items-center gap-1 min-w-0">
                  {opt.depth > 0 && (
                    <span className="text-muted-foreground shrink-0 text-xs font-mono">
                      {"  ".repeat(opt.depth - 1)}{"└─"}
                    </span>
                  )}
                  <span className="truncate">{opt.label.split(" › ").pop()}</span>
                  {opt.depth === 0 && (
                    <span className="text-xs text-muted-foreground ml-1 shrink-0">(topic)</span>
                  )}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selected && selected.depth > 0 && (
          <p className="text-xs text-muted-foreground">
            Cards will be added inside <span className="font-medium">{selected.label}</span>
          </p>
        )}
      </div>
    );
  };

  const Wrapper = animated ? motion.div : "div";
  const wrapperAnim = animated
    ? { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } }
    : {};

  const stickyClass = variant === "sheet"
    ? "sticky bottom-0 -mx-6 px-6 pt-3 pb-1 bg-gradient-to-t from-background via-background to-background/80 backdrop-blur-sm"
    : "sticky bottom-0 px-4 -mx-4 pt-3 pb-3 bg-gradient-to-t from-background via-background to-background/85 backdrop-blur-sm rounded-b-xl";

  return (
    <Wrapper className="space-y-5" {...(wrapperAnim as object)}>
      {limitReachedFeature && (
        <div className="relative">
          <UpgradeBanner feature={limitReachedFeature} compact={false} />
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setLimitReachedFeature(null)}
            className="absolute top-2 right-2 rounded p-0.5 text-amber-600 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-200 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      <GenerationSuccessOverlay
        open={successOverlay.open}
        deckCount={successOverlay.decks}
        cardCount={successOverlay.cards}
        onClose={() => {
          setSuccessOverlay((s) => ({ ...s, open: false }));
          const fn = pendingDoneRef.current;
          pendingDoneRef.current = null;
          if (fn) fn();
        }}
      />
      {reviewState && reviewState.deckId && (
        <CardReviewModal
          deckId={reviewState.deckId}
          deckName={reviewState.deckName}
          isOpen={!!reviewState}
          onClose={() => {
            const autoClose = reviewState.autoClose;
            setReviewState(null);
            autoClose?.();
          }}
        />
      )}

      <AnimatePresence mode="wait">
        {inlinePreview ? (
          <motion.div
            key="preview"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            <CardPreviewPanel
              cards={inlinePreview.cards}
              deckName={inlinePreview.deckName}
              accentColor="emerald"
              onSave={inlinePreview.onSave}
              onRegenerate={handleRegenerate}
              onDiscard={handleDiscard}
            />
          </motion.div>
        ) : (
          <motion.div
            key="form"
            className="space-y-5"
            initial={false}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
      <ParentSelector />

      {/* Shared custom instructions */}
      <div className="space-y-1.5 rounded-lg border border-border/60 bg-muted/30 p-3">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs font-medium flex items-center gap-1.5">
            <Sparkles className="h-3 w-3 text-primary" />
            Shared instructions <span className="text-muted-foreground font-normal">(optional)</span>
          </Label>
          {sharedCustomPrompt.trim().length > 0 && (
            <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={applySharedPrompt}
                onChange={e => setApplySharedPrompt(e.target.checked)}
                disabled={isGeneratingAll}
                className="h-3 w-3 rounded border-border accent-primary"
              />
              Apply to all
            </label>
          )}
        </div>
        <Textarea
          placeholder={`Tell the AI how to write your cards. e.g. "USMLE Step 1 high-yield style", "rewrite questions as MCQs with 4 options", "answers in Spanish".`}
          value={sharedCustomPrompt}
          onChange={e => setSharedCustomPrompt(e.target.value)}
          className="min-h-[56px] resize-none text-xs leading-snug bg-background/80"
          disabled={isGeneratingAll}
        />
        <p className="text-[10px] text-muted-foreground">
          Applied to every deck below unless overridden per-file.
        </p>
      </div>

      {/* Drop zone */}
      <motion.div
        whileHover={animated ? { scale: 1.005 } : undefined}
        className={`relative border-2 border-dashed rounded-xl p-7 text-center cursor-pointer transition-all duration-200 group ${
          isDragging
            ? "border-primary bg-primary/5 scale-[1.01] shadow-sm"
            : "border-border/70 hover:border-primary/60 hover:bg-primary/[0.02]"
        }`}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileInput} accept=".txt,.pdf,.pptx,.docx,.jpg,.jpeg,.png,.webp,.gif" multiple disabled={isGeneratingAll} />
        <motion.div
          animate={isDragging ? { y: [-2, 2, -2] } : {}}
          transition={{ duration: 1.2, repeat: isDragging ? Infinity : 0 }}
          className={`h-12 w-12 mx-auto mb-3 rounded-full flex items-center justify-center transition-all ${
            isDragging
              ? "bg-primary/15 text-primary"
              : "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary"
          }`}
        >
          <UploadCloud className="h-6 w-6" />
        </motion.div>
        <p className="text-sm font-semibold text-foreground">
          {isDragging ? "Release to upload" : "Drop files or click to browse"}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          PDF, TXT, PPTX, DOCX, Images · Upload multiple at once
        </p>
      </motion.div>

      {/* File entries */}
      <AnimatePresence initial={false}>
        {files.map(f => {
          const extractPercent = f.status === "extracting" ? parseProgressPercent(f.progress) : null;
          const extractPhase = f.status === "extracting" ? getProgressPhase(f.progress) : null;
          const phaseLabel =
            extractPhase === "text" ? "Reading text" :
            extractPhase === "images" ? "Capturing screenshots" :
            extractPhase === "ocr" ? "Running OCR" :
            extractPhase === "server" ? "Server extraction" :
            f.progress || "Processing…";

          const accentClass =
            f.status === "error" ? "border-l-destructive/70"
            : f.status === "done" ? "border-l-green-500/70"
            : f.status === "ready" ? "border-l-primary/50"
            : "border-l-muted-foreground/30";

          return (
          <motion.div
            key={f.id}
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.18 } }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            layout
          >
          <Card className={`border-border/60 border-l-[3px] ${accentClass} shadow-sm bg-card/80 backdrop-blur-sm transition-shadow hover:shadow-md`}>
            <CardContent className="p-3.5 space-y-2.5">
              <div className="flex items-center gap-2.5">
                <div className={`h-7 w-7 rounded-md flex items-center justify-center shrink-0 ${
                  f.status === "error" ? "bg-destructive/10" :
                  f.status === "done" ? "bg-green-500/10" :
                  f.status === "ready" ? "bg-primary/10" :
                  "bg-muted"
                }`}>
                  {f.status === "extracting" && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
                  {f.status === "ready"      && <FileText className="h-3.5 w-3.5 text-primary" />}
                  {f.status === "generating" && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
                  {f.status === "done"       && <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />}
                  {f.status === "error"      && <AlertCircle className="h-3.5 w-3.5 text-destructive" />}
                </div>
                <span className="text-sm font-medium flex-1 truncate">{f.name}</span>
                {f.status === "ready" && (
                  <div className="flex items-center gap-1 shrink-0">
                    <Badge variant="secondary" className="text-[10px] font-normal px-1.5 py-0 h-5">{(f.text.length / 1000).toFixed(1)}k chars</Badge>
                    {f.pageImages.length > 0 && (
                      <Badge variant="outline" className="text-[10px] gap-1 px-1.5 py-0 h-5 font-normal">
                        <ImageIcon className="h-2.5 w-2.5" />{f.pageImages.length} pg
                      </Badge>
                    )}
                    {(f.pageHasVisuals ?? []).filter(Boolean).length > 0 && (
                      <Badge variant="outline" className="text-[10px] gap-1 px-1.5 py-0 h-5 font-normal border-primary/40 text-primary">
                        <Sparkles className="h-2.5 w-2.5" />{(f.pageHasVisuals ?? []).filter(Boolean).length} visual
                      </Badge>
                    )}
                  </div>
                )}
                {f.status === "generating" && <span className="text-xs text-primary font-medium shrink-0">Generating…</span>}
                {f.status === "done" && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Badge className="text-[10px] bg-green-600 hover:bg-green-600 px-1.5 py-0 h-5">{f.generatedCount} cards</Badge>
                    {f.generatedDeckId && (
                      <Button size="sm" variant="outline" className="h-5 px-1.5 text-[10px] gap-0.5 font-medium" onClick={() => setReviewState({ deckId: f.generatedDeckId!, deckName: f.deckName })}>
                        <Eye className="h-2.5 w-2.5" />Review
                      </Button>
                    )}
                  </div>
                )}
                {f.status === "error"      && <span className="text-xs text-destructive shrink-0 max-w-[140px] truncate">{f.progress}</span>}
                <button onClick={() => setFiles(p => p.filter(x => x.id !== f.id))} className="text-muted-foreground hover:text-foreground ml-0.5 shrink-0 p-0.5 rounded hover:bg-muted transition-colors" disabled={isGeneratingAll || f.status === "generating"}>
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {f.status === "extracting" && (
                <div className="space-y-1 pt-0.5">
                  <div className="flex justify-between items-center">
                    <span className="text-[11px] text-muted-foreground">{phaseLabel}</span>
                    {extractPercent !== null && (
                      <span className="text-[11px] text-muted-foreground font-medium">{extractPercent}%</span>
                    )}
                  </div>
                  {extractPercent !== null ? (
                    <Progress value={extractPercent} className="h-1.5" />
                  ) : (
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full w-1/3 rounded-full bg-primary/50"
                        style={{ animation: "shimmer 1.2s ease-in-out infinite", backgroundImage: "linear-gradient(90deg, transparent 0%, hsl(var(--primary)/0.5) 50%, transparent 100%)", backgroundSize: "200% 100%" }}
                      />
                    </div>
                  )}
                </div>
              )}

              {f.status === "generating" && (() => {
                const pct = f.generatingPercent ?? 0;
                const startedAt = f.generatingStartedAt;
                let etaLabel = "";
                if (startedAt && pct >= 8 && pct < 99) {
                  const elapsed = nowTick - startedAt;
                  if (elapsed > 4000) {
                    const total = (elapsed / pct) * 100;
                    etaLabel = formatEta(total - elapsed);
                  }
                } else if (startedAt && pct < 8 && nowTick - startedAt > 4000) {
                  etaLabel = "estimating…";
                }
                const liveCount = f.liveCardCount ?? 0;
                return (
                <div className="space-y-2 pt-0.5">
                  <GenerationStageStepper activeStage={
                    f.generatingStage === "extracting" ? 0
                    : f.generatingStage === "detecting" ? 1
                    : f.generatingStage === "generating" ? 2
                    : f.generatingStage === "done" ? 3
                    : stageFromGenerating(pct, f.generatingMessage ?? "")
                  } />
                  <div className="flex justify-between items-center gap-2 mt-0.5">
                    <span className="text-[11px] text-muted-foreground truncate pr-2">
                      {f.generatingMessage ?? "Generating…"}
                    </span>
                    <span className="flex items-center gap-1.5 shrink-0">
                      {liveCount > 0 && (
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium tabular-nums">~{liveCount} cards</span>
                      )}
                      {etaLabel && (
                        <span className="text-[10px] text-muted-foreground/80 tabular-nums">{etaLabel}</span>
                      )}
                      <span className="text-[11px] font-medium text-primary tabular-nums">
                        {pct}%
                      </span>
                    </span>
                  </div>
                  <BatteryProgress value={pct} />
                  {(f.generatingLog ?? []).length > 0 && (
                    <GenerationProgressLog
                      messages={f.generatingLog ?? []}
                      isComplete={false}
                      accentColor="emerald"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => cancelOne(f.id)}
                    disabled={cancelledIdsRef.current.has(f.id)}
                    className="mt-1 inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                  >
                    <StopCircle className="h-3 w-3" />
                    {cancelledIdsRef.current.has(f.id) ? "Cancelling…" : "Cancel this deck"}
                  </button>
                </div>
                );
              })()}

              {(f.status === "ready" || f.status === "error") && (
                <div className="space-y-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Deck Name</Label>
                    <Input value={f.deckName} onChange={e => updateFile(f.id, { deckName: e.target.value })} className="h-7 text-xs" placeholder="e.g. Chapter 1" disabled={isGeneratingAll} />
                  </div>

                  {f.pageImages.length > 0 && (
                    <div className="space-y-1">
                      <Label className="text-xs">Deck Type</Label>
                      <div className="grid grid-cols-3 gap-1 p-0.5 rounded-md bg-muted/60">
                        {([
                          { value: "text" as DeckType, label: "Text only", icon: Type },
                          { value: "visual" as DeckType, label: "Visual", icon: ImageIcon },
                          { value: "both" as DeckType, label: "Both", icon: Layers },
                        ]).map(opt => {
                          const Icon = opt.icon;
                          const active = f.deckType === opt.value;
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              disabled={isGeneratingAll}
                              onClick={() => updateFile(f.id, { deckType: opt.value })}
                              className={`flex items-center justify-center gap-1 h-7 rounded text-[11px] font-medium transition-colors disabled:opacity-50 ${
                                active
                                  ? "bg-background shadow-sm text-foreground"
                                  : "text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              <Icon className="h-3 w-3" />
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                      {f.deckType === "both" && (
                        <p className="text-[10px] text-muted-foreground">
                          Creates two decks: <span className="font-medium">"{f.deckName} – Text"</span> and <span className="font-medium">"{f.deckName} – Visual"</span>.
                        </p>
                      )}
                    </div>
                  )}

                  <div className={`grid gap-2 ${f.pageImages.length > 0 && f.deckType === "both" ? "grid-cols-2" : "grid-cols-1"}`}>
                    {(f.deckType === "text" || f.deckType === "both") && (
                      <div className="space-y-1">
                        <Label className="text-xs flex items-center justify-between gap-1">
                          <span className="flex items-center gap-1"><Type className="h-3 w-3" />Text Cards</span>
                          <span className="text-[10px] font-normal text-muted-foreground">
                            ~{estimatedCards(f.text, 0, f.cardCount)} likely
                          </span>
                        </Label>
                        <Input type="number" value={f.cardCount} onChange={e => updateFile(f.id, { cardCount: e.target.value ? Math.min(Number(e.target.value), 1000) : "" })} className="h-7 text-xs" placeholder={`e.g. ${DEFAULT_TARGET_CARDS}`} min="1" max="1000" disabled={isGeneratingAll} />
                      </div>
                    )}
                    {(f.deckType === "visual" || f.deckType === "both") && f.pageImages.length > 0 && (
                      <div className="space-y-1">
                        <Label className="text-xs flex items-center justify-between gap-1">
                          <span className="flex items-center gap-1"><ImageIcon className="h-3 w-3" />Visual Cards</span>
                          <span className="text-[10px] font-normal text-muted-foreground">
                            up to {Math.min(f.pageImages.length * 3, 500)}
                          </span>
                        </Label>
                        <Input type="number" value={f.visualCardCount} onChange={e => updateFile(f.id, { visualCardCount: e.target.value ? Math.min(Number(e.target.value), 1000) : "" })} className="h-7 text-xs" placeholder={`e.g. ${Math.min(f.pageImages.length * 2, 30)}`} min="1" max="1000" disabled={isGeneratingAll} />
                      </div>
                    )}
                  </div>

                  {(() => {
                    if (f.deckType === "visual") return null;
                    const capacity = estimateCardCapacity(f.text, 0);
                    const target = typeof f.cardCount === "number" ? f.cardCount : DEFAULT_TARGET_CARDS;
                    if (target > capacity && capacity > 0) {
                      return (
                        <p className="text-[10px] text-emerald-600 dark:text-emerald-500">
                          Text content likely only supports ~{capacity} cards — target will be capped.
                        </p>
                      );
                    }
                    return null;
                  })()}

                  <div className="space-y-1">
                    <Label className="text-xs flex items-center justify-between gap-1">
                      <span>Custom instructions <span className="text-muted-foreground font-normal">(optional)</span></span>
                      {!(f.customPrompt ?? "").trim() && applySharedPrompt && sharedCustomPrompt.trim() && (
                        <span className="text-[10px] text-muted-foreground italic">using shared</span>
                      )}
                    </Label>
                    <Textarea
                      placeholder={
                        applySharedPrompt && sharedCustomPrompt.trim() && !(f.customPrompt ?? "").trim()
                          ? `Override shared: e.g. "make MCQs with 4 options"`
                          : `e.g. "focus on drug dosages", "Year 1 medical student", "use Spanish on the back"`
                      }
                      value={f.customPrompt ?? ""}
                      onChange={e => updateFile(f.id, { customPrompt: e.target.value })}
                      className="min-h-[44px] resize-none text-xs leading-snug"
                      disabled={isGeneratingAll}
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          </motion.div>
          );
        })}
      </AnimatePresence>

      {/* Manual text */}
      <div className="relative pt-1">
        <div className="absolute inset-x-0 top-0 flex items-center" aria-hidden>
          <div className="flex-1 h-px bg-border/70" />
          <span className="px-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            {files.length > 0 ? "Or add text" : "Or paste text"}
          </span>
          <div className="flex-1 h-px bg-border/70" />
        </div>
        <div className="space-y-1.5 pt-5">
          <Textarea placeholder="Paste study material, notes, or an article here…" className="min-h-[100px] resize-none text-sm bg-background/80" value={manualText} onChange={e => setManualText(e.target.value)} disabled={isGeneratingAll} />
        </div>
      </div>
      <AnimatePresence>
        {manualText.trim().length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="space-y-1.5 overflow-hidden"
          >
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Deck Name</Label>
                <Input value={manualDeckName} onChange={e => setManualDeckName(e.target.value)} className="h-7 text-xs" placeholder="e.g. Notes" disabled={isGeneratingAll} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs flex items-center justify-between gap-1">
                  <span>Target Cards</span>
                  <span className="text-[10px] font-normal text-muted-foreground">
                    ~{estimatedCards(manualText, 0, manualCardCount)} likely
                  </span>
                </Label>
                <Input type="number" value={manualCardCount} onChange={e => setManualCardCount(e.target.value ? Math.min(Number(e.target.value), 1000) : "")} className="h-7 text-xs" placeholder={`e.g. ${DEFAULT_TARGET_CARDS}`} min="1" max="1000" disabled={isGeneratingAll} />
              </div>
            </div>
            {(() => {
              const capacity = estimateCardCapacity(manualText, 0);
              const target = typeof manualCardCount === "number" ? manualCardCount : DEFAULT_TARGET_CARDS;
              if (target > capacity && capacity > 0) {
                return (
                  <p className="text-[10px] text-emerald-600 dark:text-emerald-500">
                    Content likely only supports ~{capacity} cards — target will be capped.
                  </p>
                );
              }
              return null;
            })()}
            <div className="space-y-1">
              <Label className="text-xs flex items-center justify-between gap-1">
                <span>Custom instructions <span className="text-muted-foreground font-normal">(optional)</span></span>
                {!manualCustomPrompt.trim() && applySharedPrompt && sharedCustomPrompt.trim() && (
                  <span className="text-[10px] text-muted-foreground italic">using shared</span>
                )}
              </Label>
              <Textarea
                placeholder={
                  applySharedPrompt && sharedCustomPrompt.trim() && !manualCustomPrompt.trim()
                    ? `Override shared: e.g. "make MCQs with 4 options"`
                    : `e.g. "phrase as MCQs", "answers in Spanish", "Year 1 medical student"`
                }
                value={manualCustomPrompt}
                onChange={e => setManualCustomPrompt(e.target.value)}
                className="min-h-[44px] resize-none text-xs leading-snug"
                disabled={isGeneratingAll}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isGeneratingAll && manualGeneratingLog.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <GenerationProgressLog
              messages={manualGeneratingLog}
              isComplete={false}
              accentColor="emerald"
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div className={stickyClass}>
        {totalTargets > 0 && !isGeneratingAll && !isExtracting && (
          <div className="flex items-center justify-between mb-2 px-0.5 text-xs">
            <span className="text-muted-foreground">Ready to generate</span>
            <span className="font-medium text-foreground">
              {totalTargets} {totalTargets === 1 ? "deck" : "decks"}
            </span>
          </div>
        )}
        <Button
          className="w-full h-11 shadow-sm font-medium"
          onClick={handleGenerateAll}
          disabled={!canGenerate}
          size="lg"
        >
          {isGeneratingAll
            ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Generating…</>
            : isExtracting
            ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Processing files…</>
            : <><Sparkles className="mr-2 h-4 w-4" />{totalTargets > 1 ? `Generate ${totalTargets} Decks` : "Generate Deck"}</>
          }
        </Button>
        {isGeneratingAll && (
          <Button
            variant="outline"
            className="w-full h-9 mt-2 text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
            onClick={cancelAll}
            disabled={isCancelling}
          >
            <StopCircle className="mr-2 h-4 w-4" />
            {isCancelling ? "Cancelling…" : "Cancel generation"}
          </Button>
        )}
        {variant === "sheet" && onClose && !isGeneratingAll && (
          <button
            type="button"
            onClick={onClose}
            className="hidden"
            aria-hidden
          />
        )}
      </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Wrapper>
  );
}
