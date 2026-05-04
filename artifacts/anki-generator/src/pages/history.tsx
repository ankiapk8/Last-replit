import { Link, useLocation } from "wouter";
import { useListGenerations, useClearGenerations, getListGenerationsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import { format, formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  ArrowLeft, Trash2, History as HistoryIcon, CheckCircle2, XCircle, Ban,
  Clock, Layers, FileText, Sparkles, Type, Image as ImageIcon, RotateCcw, CloudOff,
} from "lucide-react";
import { useOfflineQueue } from "@/hooks/use-offline-queue";
import { SyncBanner } from "@/components/sync-indicator";
import { useToast } from "@/hooks/use-toast";
import { AmbientOrbs } from "@/components/ambient-orbs";
import { PageHeader } from "@/components/page-header";

function formatDuration(ms: number): string {
  if (ms <= 0) return "—";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remSec = seconds % 60;
  if (minutes < 60) return remSec > 0 ? `${minutes}m ${remSec}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;
  return remMin > 0 ? `${hours}h ${remMin}m` : `${hours}h`;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "success") {
    return (
      <Badge variant="outline" className="gap-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="h-3 w-3" /> Success
      </Badge>
    );
  }
  if (status === "cancelled") {
    return (
      <Badge variant="outline" className="gap-1 border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400">
        <Ban className="h-3 w-3" /> Cancelled
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 border-destructive/30 bg-destructive/10 text-destructive">
      <XCircle className="h-3 w-3" /> Error
    </Badge>
  );
}

function DeckTypeIcon({ type }: { type: string }) {
  if (type === "text") return <Type className="h-3 w-3" />;
  if (type === "visual") return <ImageIcon className="h-3 w-3" />;
  return <Layers className="h-3 w-3" />;
}

export default function History() {
  const { data: generations, isLoading } = useListGenerations({ limit: 200 });
  const clearMutation = useClearGenerations();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [confirmClear, setConfirmClear] = useState(false);
  const { queueCount, isSyncing, dbGetAll } = useOfflineQueue();
  const [queuedItems, setQueuedItems] = useState<import("@/hooks/use-offline-queue").QueuedGeneration[]>([]);

  useEffect(() => {
    dbGetAll().then(setQueuedItems).catch(() => {});
  }, [queueCount, dbGetAll]);

  const stats = useMemo(() => {
    const list = generations ?? [];
    const successes = list.filter(g => g.status === "success");
    const totalCards = successes.reduce((sum, g) => sum + g.cardsGenerated, 0);
    const avgDuration = successes.length > 0
      ? successes.reduce((sum, g) => sum + g.durationMs, 0) / successes.length
      : 0;
    return {
      total: list.length,
      successes: successes.length,
      totalCards,
      avgDuration,
    };
  }, [generations]);

  const handleClear = async () => {
    try {
      await clearMutation.mutateAsync();
      await queryClient.invalidateQueries({ queryKey: getListGenerationsQueryKey() });
      toast({ title: "History cleared" });
    } catch {
      toast({ title: "Failed to clear history", variant: "destructive" });
    } finally {
      setConfirmClear(false);
    }
  };

  return (
    <div className="relative container max-w-4xl mx-auto px-4 py-6 space-y-6">
      <AmbientOrbs color="hsl(199 89% 60% / 0.10)" className="rounded-3xl" />

      <div className="relative">
        <Link href="/decks" className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors mb-3">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to decks
        </Link>
        <PageHeader
          icon={HistoryIcon}
          iconColor="#38bdf8"
          iconGlow="hsl(199 89% 60% / 0.5)"
          gradient="from-sky-400 via-cyan-400 to-blue-500"
          title="Generation History"
          subtitle="Past AI runs with timing and card counts."
          action={
            (generations?.length ?? 0) > 0 ? (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => setConfirmClear(true)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear
              </Button>
            ) : undefined
          }
        />
      </div>

      <SyncBanner queueCount={queueCount} isSyncing={isSyncing} />

      {queuedItems.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <CloudOff className="h-3.5 w-3.5" />
            Queued for sync ({queuedItems.length})
          </p>
          {queuedItems.map((item) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-3 rounded-xl border border-amber-500/25 bg-amber-500/8 px-3.5 py-2.5"
            >
              <CloudOff className="h-4 w-4 text-amber-500/80 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{item.deckName}</p>
                <p className="text-[11px] text-muted-foreground">{item.numCards} cards · queued offline</p>
              </div>
              <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/10 shrink-0">
                Pending
              </Badge>
            </motion.div>
          ))}
        </div>
      )}

      {(generations?.length ?? 0) > 0 && (
        <div className="relative grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Runs", value: stats.total, icon: Sparkles, color: "#38bdf8", glow: "56,189,248" },
            { label: "Successful", value: stats.successes, icon: CheckCircle2, color: "#34d399", glow: "52,211,153" },
            { label: "Cards made", value: stats.totalCards, icon: Layers, color: "#a78bfa", glow: "167,139,250" },
            { label: "Avg duration", value: formatDuration(stats.avgDuration), icon: Clock, color: "#fb923c", glow: "251,146,60" },
          ].map(({ label, value, icon: Icon, color, glow }, idx) => (
            <motion.div
              key={label}
              className="rounded-xl border border-border/40 bg-card/70 p-3.5 relative overflow-hidden backdrop-blur-sm"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.06, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              whileHover={{ y: -2, transition: { duration: 0.15 } }}
              style={{ boxShadow: `inset 0 0 0 1px ${color}18` }}
            >
              <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(circle at 15% 50%, rgba(${glow},0.08) 0%, transparent 70%)` }} />
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium relative">
                <Icon className="h-3 w-3" style={{ color }} /> {label}
              </div>
              <div className="mt-1 text-2xl font-serif font-bold relative" style={{ color }}>{value}</div>
            </motion.div>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
      ) : (generations?.length ?? 0) === 0 ? (
        <div className="text-center py-20 px-6 border-2 border-dashed border-border/60 rounded-2xl bg-gradient-to-b from-card/60 to-muted/20">
          <div className="mx-auto h-16 w-16 rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/20 flex items-center justify-center mb-5">
            <HistoryIcon className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-xl font-serif font-semibold mb-1.5">No generations yet</h3>
          <p className="text-muted-foreground text-sm mb-6 max-w-sm mx-auto">Generate your first deck to start building history.</p>
          <Link href="/decks">
            <Button className="gap-2"><Sparkles className="h-4 w-4" />Go to decks</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {(generations ?? []).map((g, idx) => {
            const startedDate = new Date(g.startedAt);
            return (
              <motion.div
                key={g.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.04, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              >
              <Card className="border-border/50 bg-card/70 backdrop-blur-sm hover:border-sky-500/25 hover:shadow-sm transition-all">
                <CardContent className="p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-medium text-sm truncate">{g.deckName}</h3>
                        <StatusBadge status={g.status} />
                        <Badge variant="outline" className="gap-1 text-[10px] font-normal capitalize">
                          <DeckTypeIcon type={g.deckType} />
                          {g.deckType}
                        </Badge>
                      </div>
                      <div className="mt-1.5 flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1" title={format(startedDate, "PPpp")}>
                          {formatDistanceToNow(startedDate, { addSuffix: true })}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDuration(g.durationMs)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Layers className="h-3 w-3" />
                          {g.cardsGenerated} {g.cardsGenerated === 1 ? "card" : "cards"}
                        </span>
                        {g.pageCount > 0 && (
                          <span className="flex items-center gap-1">
                            <FileText className="h-3 w-3" />
                            {g.pageCount} {g.pageCount === 1 ? "page" : "pages"}
                          </span>
                        )}
                      </div>
                      {g.customPrompt && (
                        <div className="mt-2 text-[11px] text-muted-foreground bg-muted/40 rounded-md px-2 py-1.5 border border-border/40 line-clamp-2">
                          <span className="font-medium text-foreground/70">Prompt:</span> {g.customPrompt}
                        </div>
                      )}
                      {g.errorMessage && g.status === "error" && (
                        <div className="mt-2 text-[11px] text-destructive bg-destructive/10 rounded-md px-2 py-1.5 border border-destructive/20 line-clamp-2">
                          {g.errorMessage}
                        </div>
                      )}
                    </div>
                    {g.status === "success" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 shrink-0 h-7 text-xs mt-0.5"
                        onClick={() => {
                          const p = new URLSearchParams();
                          if (g.deckName) p.set("deckName", g.deckName);
                          if (g.customPrompt) p.set("customPrompt", g.customPrompt);
                          if (g.deckType === "qbank") p.set("mode", "qbank");
                          setLocation(`/generate?${p}`);
                        }}
                      >
                        <RotateCcw className="h-3 w-3" />
                        Re-run
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      <Dialog open={confirmClear} onOpenChange={setConfirmClear}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear all history?</DialogTitle>
            <DialogDescription>
              This deletes the log of past generation runs. Your decks and cards are not affected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmClear(false)} disabled={clearMutation.isPending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleClear} disabled={clearMutation.isPending}>
              {clearMutation.isPending ? "Clearing…" : "Clear history"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
