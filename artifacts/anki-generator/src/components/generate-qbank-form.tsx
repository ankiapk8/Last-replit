import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useListQbanks, getListQbanksQueryKey } from "@workspace/api-client-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useOfflineQueue } from "@/hooks/use-offline-queue";
import { Progress } from "@/components/ui/progress";
import { apiUrl } from "@/lib/utils";
import { extractPdf, isPdfFile, isTextFile } from "@/lib/pdf-extraction";
import {
  Loader2, Stethoscope, FolderOpen, FileText, ListOrdered, Wand2,
  UploadCloud, X, CheckCircle2, AlertCircle, StopCircle,
} from "lucide-react";
import { GenerationStageStepper, stageFromGenerating } from "@/components/generation-stage-stepper";
import type { Qbank } from "@workspace/api-client-react";
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

const DEFAULT_TARGET_QUESTIONS = 20;

interface GenerateQbankFormProps {
  defaultParentId?: number | null;
  prefilledText?: string;
  prefilledDeckName?: string;
  prefilledCustomPrompt?: string;
  onDone?: (newQbankId?: number) => void;
}

type FileStatus = "extracting" | "ready" | "error" | "generating" | "done";

type FileEntry = {
  id: string;
  name: string;
  status: FileStatus;
  text: string;
  progress: string;
  qbankName: string;
  questionCount: number | "";
  customPrompt: string;
  generatedCount?: number;
  generatingPercent?: number;
  generatingMessage?: string;
};

function buildParentOptions(allQbanks: Qbank[]): { id: number; label: string; depth: number }[] {
  const rootQbanks = allQbanks.filter(d => !d.parentId);
  const byParent = new Map<number, Qbank[]>();
  allQbanks.filter(d => d.parentId).forEach(d => {
    const pid = d.parentId!;
    if (!byParent.has(pid)) byParent.set(pid, []);
    byParent.get(pid)!.push(d);
  });
  const result: { id: number; label: string; depth: number }[] = [];
  function walk(qbank: Qbank, label: string, depth: number) {
    result.push({ id: qbank.id, label, depth });
    const children = byParent.get(qbank.id) ?? [];
    for (const child of children.sort((a, b) => a.name.localeCompare(b.name))) {
      walk(child, `${label} › ${child.name}`, depth + 1);
    }
  }
  for (const d of rootQbanks.sort((a, b) => a.name.localeCompare(b.name))) {
    walk(d, d.name, 0);
  }
  return result;
}

function parseProgressPercent(message: string): number | null {
  const match = message.match(/(\d+)\s*\/\s*(\d+)/);
  if (!match) return null;
  const total = parseInt(match[2], 10);
  if (!total) return null;
  return Math.round((parseInt(match[1], 10) / total) * 100);
}

export function GenerateQbankForm({ defaultParentId, prefilledText, prefilledDeckName, prefilledCustomPrompt, onDone }: GenerateQbankFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { enqueue } = useOfflineQueue();
  const { data: allQbanks } = useListQbanks();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<FileEntry[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [limitReachedFeature, setLimitReachedFeature] = useState<string | null>(null);

  // Manual text section
  const [manualText, setManualText] = useState(prefilledText ?? "");
  const [manualName, setManualName] = useState(prefilledDeckName ?? "");
  const [manualCount, setManualCount] = useState<number | "">(DEFAULT_TARGET_QUESTIONS);
  const [manualPrompt, setManualPrompt] = useState("");

  // Shared
  const [sharedPrompt, setSharedPrompt] = useState(prefilledCustomPrompt ?? "");
  const [parentId, setParentId] = useState<string>(defaultParentId?.toString() ?? "none");
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [lastResultDeckId, setLastResultDeckId] = useState<number | undefined>(undefined);

  const parentOptions = useMemo(
    () => buildParentOptions((allQbanks as Qbank[]) ?? []),
    [allQbanks]
  );
  const selectedParent = parentOptions.find(o => o.id.toString() === parentId);

  const isExtracting = files.some(f => f.status === "extracting");
  const readyFiles = files.filter(f => f.status === "ready");
  const hasManual = manualText.trim().length >= 10 && manualName.trim().length > 0;
  const totalTargets = readyFiles.length + (hasManual ? 1 : 0);
  const canGenerate = !isExtracting && !isGeneratingAll && totalTargets > 0;

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
    if (!isTxt && !isPdf) {
      toast({ title: "Unsupported file", description: `${file.name} is not .txt or .pdf`, variant: "destructive" });
      return;
    }
    const id = `${file.name}-${Date.now()}-${Math.random()}`;
    const baseName = file.name.replace(/\.[^.]+$/, "");
    setFiles(prev => [...prev, {
      id, name: file.name, status: "extracting", text: "", progress: "Reading…",
      qbankName: baseName, questionCount: DEFAULT_TARGET_QUESTIONS, customPrompt: "",
    }]);
    try {
      if (isTxt) {
        const text = await file.text();
        updateFile(id, { status: "ready", text, progress: "" });
      } else {
        const buffer = await file.arrayBuffer();
        // Question banks are text-only — skip page screenshots, but keep OCR
        // fallback so scanned PDFs still produce usable text.
        const { text } = await extractPdf(buffer, (progress) => throttledProgressUpdate(id, progress));
        updateFile(id, { status: "ready", text, progress: "" });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Extraction failed";
      updateFile(id, { status: "error", progress: message });
    }
  }, [updateFile, throttledProgressUpdate, toast]);

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []);
    e.target.value = "";
    for (const f of selected) await processFile(f);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    for (const f of Array.from(e.dataTransfer.files)) await processFile(f);
  };

  useEffect(() => {
    if (prefilledText) setManualText(prev => prev || prefilledText);
    if (prefilledDeckName) setManualName(prev => prev || prefilledDeckName);
  }, [prefilledText, prefilledDeckName]);

  const resolvedParentId = parentId === "none" ? null : parseInt(parentId, 10);

  const generateOne = (
    text: string,
    qbankName: string,
    questionCount: number | "",
    pid: number | null,
    customPrompt: string,
    fileId?: string,
  ): Promise<{ generatedCount: number; deckId: number }> =>
    new Promise((resolve, reject) => {
      const trimmed = (customPrompt ?? "").trim();
      const sharedTrim = sharedPrompt.trim();
      const effectivePrompt = trimmed || sharedTrim;
      const controller = new AbortController();
      abortControllersRef.current.set(fileId ?? manualCancelKey, controller);

      fetch(apiUrl("api/generate-qbank/stream"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          text,
          deckName: qbankName,
          questionCount: typeof questionCount === "number" ? questionCount : DEFAULT_TARGET_QUESTIONS,
          parentId: pid,
          customPrompt: effectivePrompt || undefined,
        }),
      }).then(async resp => {
        if (!resp.ok || !resp.body) {
          const body = await resp.json().catch(() => ({})) as Record<string, unknown>;
          if (isLimitReachedBody(body)) {
            reject(new LimitReachedError(body.message, body.feature));
          } else {
            reject(new Error(typeof body.error === "string" ? body.error : `Generation failed (${resp.status})`));
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
                type: string; percent?: number; message?: string;
                generatedCount?: number; qbank?: { id: number };
              };
              if (event.type === "progress" && fileId) {
                setFiles(prev => prev.map(f =>
                  f.id === fileId
                    ? { ...f, generatingPercent: event.percent, generatingMessage: event.message }
                    : f
                ));
              } else if (event.type === "done") {
                if (event.qbank) {
                  resolve({ generatedCount: event.generatedCount ?? 0, deckId: event.qbank.id });
                } else {
                  reject(new Error("Generation finished without a question bank"));
                }
                return;
              } else if (event.type === "error") {
                reject(new Error(event.message ?? "Generation failed"));
                return;
              }
            } catch { continue; }
          }
        }
        reject(new Error(
          "Connection dropped before generation finished. Please try again — nothing was saved.",
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

  const resetState = () => {
    setFiles([]);
    setManualText(""); setManualName(""); setManualCount(DEFAULT_TARGET_QUESTIONS); setManualPrompt("");
  };

  const pauseBetween = () => new Promise(resolve => setTimeout(resolve, 1500));

  const handleGenerateAll = async () => {
    setIsGeneratingAll(true);
    setIsCancelling(false);
    cancelledIdsRef.current.clear();
    let ok = 0, fail = 0, cancelled = 0, totalQuestions = 0;
    let lastDeckId: number | undefined;

    const targets: Array<{
      id?: string; text: string; name: string; count: number | ""; prompt: string;
    }> = [
      ...readyFiles.map(f => ({ id: f.id, text: f.text, name: f.qbankName, count: f.questionCount, prompt: f.customPrompt })),
      ...(hasManual ? [{ id: undefined, text: manualText, name: manualName, count: manualCount, prompt: manualPrompt }] : []),
    ];

    if (!navigator.onLine) {
      const textTargets = targets.filter(t => t.id === undefined);
      if (textTargets.length > 0) {
        for (const t of textTargets) {
          await enqueue({
            deckName: t.name,
            text: t.text,
            numCards: typeof t.count === "number" ? t.count : 20,
            type: "qbank",
            customPrompt: t.prompt || undefined,
          });
        }
        toast({
          title: `${textTargets.length} question bank${textTargets.length > 1 ? "s" : ""} queued`,
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
      if (!t.name.trim()) {
        toast({ title: "Question bank name required", variant: "destructive" });
        setIsGeneratingAll(false);
        return;
      }
      const key = t.id ?? manualCancelKey;
      if (cancelledIdsRef.current.has(manualCancelKey)) {
        if (t.id) updateFile(t.id, { status: "ready", progress: "Cancelled", generatingPercent: 0, generatingMessage: undefined });
        cancelled++;
        continue;
      }
      if (t.id) updateFile(t.id, { status: "generating", progress: "", generatingPercent: 0, generatingMessage: "Starting…" });
      try {
        const { generatedCount, deckId } = await generateOne(t.text, t.name, t.count, resolvedParentId, t.prompt, t.id);
        if (t.id) updateFile(t.id, { status: "done", progress: "", generatedCount });
        ok++;
        totalQuestions += generatedCount;
        lastDeckId = deckId;
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
          const message = error instanceof Error ? error.message : "Generation failed";
          if (t.id) updateFile(t.id, { status: "error", progress: message });
          toast({ title: `Could not generate ${t.name}`, description: message, variant: "destructive" });
          fail++;
        }
      }
      if (i < targets.length - 1 && !cancelledIdsRef.current.has(manualCancelKey)) await pauseBetween();
    }

    setIsGeneratingAll(false);
    setIsCancelling(false);
    queryClient.invalidateQueries({ queryKey: getListQbanksQueryKey() });
    setLastResultDeckId(lastDeckId);

    if (cancelled > 0 && ok === 0) {
      toast({ title: "Generation cancelled", description: `${cancelled} ${cancelled === 1 ? "question bank" : "question banks"} were not generated.` });
      return;
    }
    if (ok > 0) {
      toast({
        title: ok === 1 ? "Question bank ready" : `${ok} question banks ready`,
        description: `${totalQuestions} MCQ${totalQuestions === 1 ? "" : "s"} created${fail > 0 ? `, ${fail} failed` : ""}${cancelled > 0 ? `, ${cancelled} cancelled` : ""}.`,
      });
      const cleanRun = fail === 0 && cancelled === 0;
      if (cleanRun && lastDeckId !== undefined) {
        resetState();
        onDone?.(lastDeckId);
      }
    } else {
      toast({ title: "Generation failed", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-5">
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
      <div className="rounded-lg border border-violet-500/30 bg-violet-500/5 p-3 flex items-start gap-2.5">
        <div className="h-7 w-7 rounded-md bg-violet-500/15 text-violet-600 flex items-center justify-center shrink-0">
          <Stethoscope className="h-3.5 w-3.5" />
        </div>
        <div className="text-xs leading-snug">
          <div className="font-semibold text-violet-700 dark:text-violet-300 mb-0.5">UWorld-style Question Bank</div>
          <span className="text-muted-foreground">Generates MCQs only with full distractors and detailed explanations. Drop PDFs or notes — each file becomes its own question bank.</span>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-sm flex items-center gap-1.5">
          <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
          Parent Topic <span className="text-muted-foreground font-normal">(optional)</span>
        </Label>
        <Select value={parentId} onValueChange={setParentId}>
          <SelectTrigger className="h-8 text-sm">
            {parentId === "none" || !selectedParent
              ? <span className="text-muted-foreground">No parent — standalone question bank</span>
              : <span className="truncate">{selectedParent.label}</span>
            }
          </SelectTrigger>
          <SelectContent className="max-h-64">
            <SelectItem value="none">No parent — standalone question bank</SelectItem>
            {parentOptions.map(opt => (
              <SelectItem key={opt.id} value={opt.id.toString()} className="py-1.5">
                <span className="flex items-center gap-1 min-w-0">
                  {opt.depth > 0 && (
                    <span className="text-muted-foreground shrink-0 text-xs font-mono">
                      {"  ".repeat(opt.depth - 1)}{"└─"}
                    </span>
                  )}
                  <span className="truncate">{opt.label.split(" › ").pop()}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Shared instructions */}
      <div className="space-y-1.5 rounded-lg border border-violet-500/20 bg-violet-500/5 p-3">
        <Label className="text-xs font-medium flex items-center gap-1.5">
          <Wand2 className="h-3 w-3 text-violet-500" />
          Shared style instructions <span className="text-muted-foreground font-normal">(optional)</span>
        </Label>
        <Textarea
          placeholder={`e.g. "USMLE Step 1 high-yield style", "include lab values", "vignette must be ≤4 sentences"`}
          value={sharedPrompt}
          onChange={e => setSharedPrompt(e.target.value)}
          className="min-h-[56px] resize-none text-xs leading-snug bg-background/80"
          disabled={isGeneratingAll}
        />
        <p className="text-[10px] text-muted-foreground">
          Applied to every question bank below unless overridden per-file.
        </p>
      </div>

      {/* Drop zone */}
      <motion.div
        whileHover={{ scale: 1.005 }}
        className={`relative border-2 border-dashed rounded-xl p-7 text-center cursor-pointer transition-all duration-200 group ${
          isDragging
            ? "border-violet-500 bg-violet-500/5 scale-[1.01] shadow-sm"
            : "border-border/70 hover:border-violet-500/60 hover:bg-violet-500/[0.03]"
        }`}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileInput}
          accept=".txt,.pdf"
          multiple
          disabled={isGeneratingAll}
        />
        <motion.div
          animate={isDragging ? { y: [-2, 2, -2] } : {}}
          transition={{ duration: 1.2, repeat: isDragging ? Infinity : 0 }}
          className={`h-12 w-12 mx-auto mb-3 rounded-full flex items-center justify-center transition-all ${
            isDragging
              ? "bg-violet-500/15 text-violet-500"
              : "bg-muted text-muted-foreground group-hover:bg-violet-500/10 group-hover:text-violet-500"
          }`}
        >
          <UploadCloud className="h-6 w-6" />
        </motion.div>
        <p className="text-sm font-semibold text-foreground">
          {isDragging ? "Release to upload" : "Drop PDFs or click to browse"}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          PDF and TXT · One question bank per file
        </p>
      </motion.div>

      {/* File entries */}
      <AnimatePresence initial={false}>
        {files.map(f => {
          const extractPercent = f.status === "extracting" ? parseProgressPercent(f.progress) : null;
          const accentClass =
            f.status === "error" ? "border-l-destructive/70"
            : f.status === "done" ? "border-l-green-500/70"
            : f.status === "ready" ? "border-l-violet-500/50"
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
                  f.status === "ready" ? "bg-violet-500/10" :
                  "bg-muted"
                }`}>
                  {f.status === "extracting" && <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-500" />}
                  {f.status === "ready"      && <FileText className="h-3.5 w-3.5 text-violet-500" />}
                  {f.status === "generating" && <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-500" />}
                  {f.status === "done"       && <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />}
                  {f.status === "error"      && <AlertCircle className="h-3.5 w-3.5 text-destructive" />}
                </div>
                <span className="text-sm font-medium flex-1 truncate">{f.name}</span>
                {f.status === "ready" && (
                  <Badge variant="secondary" className="text-[10px] font-normal px-1.5 py-0 h-5">
                    {(f.text.length / 1000).toFixed(1)}k chars
                  </Badge>
                )}
                {f.status === "generating" && <span className="text-xs text-violet-600 font-medium shrink-0">Generating…</span>}
                {f.status === "done"       && <Badge className="text-[10px] shrink-0 bg-violet-600 hover:bg-violet-600 px-1.5 py-0 h-5">{f.generatedCount} MCQs</Badge>}
                {f.status === "error"      && <span className="text-xs text-destructive shrink-0 max-w-[140px] truncate">{f.progress}</span>}
                <button
                  onClick={() => setFiles(p => p.filter(x => x.id !== f.id))}
                  className="text-muted-foreground hover:text-foreground ml-0.5 shrink-0 p-0.5 rounded hover:bg-muted transition-colors"
                  disabled={isGeneratingAll || f.status === "generating"}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {f.status === "extracting" && (
                <div className="space-y-1 pt-0.5">
                  <div className="flex justify-between items-center">
                    <span className="text-[11px] text-muted-foreground">{f.progress || "Processing…"}</span>
                    {extractPercent !== null && (
                      <span className="text-[11px] text-muted-foreground font-medium">{extractPercent}%</span>
                    )}
                  </div>
                  {extractPercent !== null ? (
                    <Progress value={extractPercent} className="h-1.5" />
                  ) : (
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full w-1/3 rounded-full bg-violet-500/50 animate-pulse" />
                    </div>
                  )}
                </div>
              )}

              {f.status === "generating" && (
                <div className="space-y-2 pt-0.5">
                  <GenerationStageStepper activeStage={stageFromGenerating(f.generatingPercent ?? 0, f.generatingMessage ?? "")} accentColor="violet" />
                  <div className="flex justify-between items-center gap-2 mt-0.5">
                    <span className="text-[11px] text-muted-foreground truncate pr-2">
                      {f.generatingMessage ?? "Generating…"}
                    </span>
                    <span className="text-[11px] font-medium text-violet-600 tabular-nums shrink-0">
                      {f.generatingPercent ?? 0}%
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-violet-500/10 overflow-hidden">
                    <div
                      className="h-full bg-violet-500 transition-all duration-500 ease-out"
                      style={{ width: `${Math.max(2, f.generatingPercent ?? 0)}%` }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => cancelOne(f.id)}
                    disabled={cancelledIdsRef.current.has(f.id)}
                    className="mt-1 inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                  >
                    <StopCircle className="h-3 w-3" />
                    {cancelledIdsRef.current.has(f.id) ? "Cancelling…" : "Cancel this question bank"}
                  </button>
                </div>
              )}

              {(f.status === "ready" || f.status === "error") && (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Question Bank Name</Label>
                      <Input
                        value={f.qbankName}
                        onChange={e => updateFile(f.id, { qbankName: e.target.value })}
                        className="h-7 text-xs"
                        placeholder="e.g. Cardiology MCQs"
                        disabled={isGeneratingAll}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs flex items-center gap-1">
                        <ListOrdered className="h-3 w-3" />
                        Target MCQs
                      </Label>
                      <Input
                        type="number"
                        min={1}
                        max={200}
                        value={f.questionCount}
                        onChange={e => {
                          const v = e.target.value;
                          updateFile(f.id, { questionCount: v === "" ? "" : Math.max(1, Math.min(200, parseInt(v, 10) || 1)) });
                        }}
                        className="h-7 text-xs"
                        placeholder={`e.g. ${DEFAULT_TARGET_QUESTIONS}`}
                        disabled={isGeneratingAll}
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs flex items-center justify-between gap-1">
                      <span>Custom instructions <span className="text-muted-foreground font-normal">(optional)</span></span>
                      {!f.customPrompt.trim() && sharedPrompt.trim() && (
                        <span className="text-[10px] text-muted-foreground italic">using shared</span>
                      )}
                    </Label>
                    <Textarea
                      value={f.customPrompt}
                      onChange={e => updateFile(f.id, { customPrompt: e.target.value })}
                      placeholder={
                        sharedPrompt.trim() && !f.customPrompt.trim()
                          ? `Override shared: e.g. "include lab values"`
                          : `e.g. "high-yield only", "ECG-based vignettes"`
                      }
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

      {/* Manual paste section */}
      <div className="relative pt-1">
        <div className="absolute inset-x-0 top-0 flex items-center" aria-hidden>
          <div className="flex-1 h-px bg-border/70" />
          <span className="px-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            {files.length > 0 ? "Or add text" : "Or paste text"}
          </span>
          <div className="flex-1 h-px bg-border/70" />
        </div>
        <div className="space-y-1.5 pt-5">
          <Textarea
            placeholder="Paste textbook chapters, lecture notes, or guideline excerpts. The AI will turn this into vignette-style MCQs."
            className="min-h-[100px] resize-none text-sm bg-background/80"
            value={manualText}
            onChange={e => setManualText(e.target.value)}
            disabled={isGeneratingAll}
          />
          <div className="text-[11px] text-muted-foreground">{manualText.length.toLocaleString()} characters</div>
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
                <Label className="text-xs">Question Bank Name</Label>
                <Input value={manualName} onChange={e => setManualName(e.target.value)} className="h-7 text-xs" placeholder="e.g. Notes QBank" disabled={isGeneratingAll} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs flex items-center gap-1">
                  <ListOrdered className="h-3 w-3" />
                  Target MCQs
                </Label>
                <Input
                  type="number"
                  min={1}
                  max={200}
                  value={manualCount}
                  onChange={e => {
                    const v = e.target.value;
                    setManualCount(v === "" ? "" : Math.max(1, Math.min(200, parseInt(v, 10) || 1)));
                  }}
                  className="h-7 text-xs"
                  placeholder={`e.g. ${DEFAULT_TARGET_QUESTIONS}`}
                  disabled={isGeneratingAll}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Custom instructions <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Textarea
                value={manualPrompt}
                onChange={e => setManualPrompt(e.target.value)}
                placeholder={
                  sharedPrompt.trim() && !manualPrompt.trim()
                    ? `Override shared: e.g. "ECG vignettes only"`
                    : `e.g. "USMLE Step 2 style", "include reference ranges"`
                }
                className="min-h-[44px] resize-none text-xs leading-snug"
                disabled={isGeneratingAll}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="sticky bottom-0 -mx-1 px-1 pt-3 pb-1 bg-gradient-to-t from-background via-background to-background/85 backdrop-blur-sm">
        {totalTargets > 0 && !isGeneratingAll && !isExtracting && (
          <div className="flex items-center justify-between mb-2 px-0.5 text-xs">
            <span className="text-muted-foreground">Ready to generate</span>
            <span className="font-medium text-foreground">
              {totalTargets} question bank{totalTargets === 1 ? "" : "s"}
            </span>
          </div>
        )}
        <Button
          className="w-full h-11 shadow-sm font-medium gap-2 bg-violet-600 hover:bg-violet-700 text-white"
          size="lg"
          onClick={handleGenerateAll}
          disabled={!canGenerate}
        >
          {isGeneratingAll
            ? <><Loader2 className="h-4 w-4 animate-spin" />Generating…</>
            : isExtracting
            ? <><Loader2 className="h-4 w-4 animate-spin" />Processing files…</>
            : <><Stethoscope className="h-4 w-4" />{totalTargets > 1 ? `Generate ${totalTargets} Question Banks` : "Generate Question Bank"}</>
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
        {lastResultDeckId !== undefined && !isGeneratingAll && files.every(f => f.status !== "generating") && (
          <Button
            variant="outline"
            className="w-full h-9 mt-2 border-violet-500/30 text-violet-700 hover:bg-violet-500/10"
            onClick={() => onDone?.(lastResultDeckId)}
          >
            Open question bank →
          </Button>
        )}
      </div>
    </div>
  );
}
