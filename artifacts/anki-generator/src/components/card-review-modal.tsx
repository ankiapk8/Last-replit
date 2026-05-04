import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Loader2, Sparkles, RefreshCw, CheckCircle2, ChevronLeft, ChevronRight, X,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiUrl } from "@/lib/utils";

type ReviewCard = {
  id: number;
  front: string;
  back: string;
  cardType: string;
  image?: string | null;
};

type EditState = {
  front: string;
  back: string;
  dirty: boolean;
  saving: boolean;
  regenerating: boolean;
  saved: boolean;
};

function initEdit(card: ReviewCard): EditState {
  return { front: card.front, back: card.back, dirty: false, saving: false, regenerating: false, saved: false };
}

type StagedCardPreview = {
  front: string;
  back: string;
  cardType: string;
  image?: string | null;
};

export function CardReviewModal({
  deckId,
  deckName,
  isOpen,
  onClose,
  preloadedCards,
  onCommit,
}: {
  deckId?: number;
  deckName: string;
  isOpen: boolean;
  onClose: () => void;
  preloadedCards?: StagedCardPreview[];
  onCommit?: (cards: StagedCardPreview[]) => Promise<void>;
}) {
  const { toast } = useToast();
  const [cards, setCards] = useState<ReviewCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [idx, setIdx] = useState(0);
  const [edits, setEdits] = useState<Record<number, EditState>>({});
  const [saving, setSaving] = useState(false);
  const [pendingDiscard, setPendingDiscard] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setIdx(0);
    if (preloadedCards) {
      const reviewCards: ReviewCard[] = preloadedCards.slice(0, 5).map((c, i) => ({
        id: -(i + 1),
        front: c.front,
        back: c.back,
        cardType: c.cardType,
        image: c.image ?? null,
      }));
      setCards(reviewCards);
      const editMap: Record<number, EditState> = {};
      for (const c of reviewCards) editMap[c.id] = initEdit(c);
      setEdits(editMap);
      return;
    }
    setLoading(true);
    fetch(apiUrl(`api/decks/${deckId!}/cards`))
      .then(r => r.json())
      .then((data: ReviewCard[]) => {
        const preview = data.slice(0, 5);
        setCards(preview);
        const editMap: Record<number, EditState> = {};
        for (const c of preview) editMap[c.id] = initEdit(c);
        setEdits(editMap);
      })
      .catch(() => toast({ title: "Could not load cards for review", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [isOpen, deckId, preloadedCards]);

  const current = cards[idx];
  const edit = current ? (edits[current.id] ?? initEdit(current)) : null;

  const updateEdit = useCallback((id: number, patch: Partial<EditState>) => {
    setEdits(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }, []);

  const handleSaveCard = useCallback(async (card: ReviewCard) => {
    const e = edits[card.id];
    if (!e?.dirty) return;
    if (card.id < 0) {
      // Staged card (pre-commit): no DB call — mark clean locally
      updateEdit(card.id, { dirty: false, saved: true });
      setTimeout(() => updateEdit(card.id, { saved: false }), 2000);
      return;
    }
    updateEdit(card.id, { saving: true });
    try {
      const resp = await fetch(apiUrl(`api/cards/${card.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ front: e.front.trim(), back: e.back.trim() }),
      });
      if (!resp.ok) throw new Error("Save failed");
      updateEdit(card.id, { saving: false, dirty: false, saved: true });
      setTimeout(() => updateEdit(card.id, { saved: false }), 2000);
    } catch {
      toast({ title: "Could not save card", variant: "destructive" });
      updateEdit(card.id, { saving: false });
    }
  }, [edits, updateEdit, toast]);

  const handleRegenerateCard = useCallback(async (card: ReviewCard) => {
    updateEdit(card.id, { regenerating: true });
    try {
      let newFront: string;
      let newBack: string;
      if (card.id < 0) {
        // Staged card: use stateless regenerate (no DB ID required)
        const currentFront = edits[card.id]?.front ?? card.front;
        const currentBack = edits[card.id]?.back ?? card.back;
        const resp = await fetch(apiUrl("api/generate/regenerate-card"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ front: currentFront, back: currentBack, deckName }),
        });
        if (!resp.ok) throw new Error("Regeneration failed");
        const data: { front: string; back: string } = await resp.json();
        newFront = data.front;
        newBack = data.back;
      } else {
        const resp = await fetch(apiUrl(`api/cards/${card.id}/regenerate`), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        if (!resp.ok) throw new Error("Regeneration failed");
        const updated: ReviewCard = await resp.json();
        newFront = updated.front;
        newBack = updated.back;
        setCards(prev => prev.map(c => c.id === card.id ? { ...c, ...updated } : c));
      }
      updateEdit(card.id, { front: newFront, back: newBack, dirty: false, regenerating: false, saved: true });
      setTimeout(() => updateEdit(card.id, { saved: false }), 2000);
    } catch {
      toast({ title: "Could not regenerate card", variant: "destructive" });
      updateEdit(card.id, { regenerating: false });
    }
  }, [updateEdit, toast, deckName, edits]);

  const handleSaveAll = async () => {
    setSaving(true);
    if (onCommit) {
      // Pre-commit flow: merge local edits into card list and commit in one request
      const finalCards: StagedCardPreview[] = cards.map(c => ({
        front: (edits[c.id]?.front ?? c.front).trim(),
        back: (edits[c.id]?.back ?? c.back).trim(),
        cardType: c.cardType,
        image: c.image ?? null,
      }));
      try { await onCommit(finalCards); } catch { /* onCommit shows its own toast */ }
      setSaving(false);
      return;
    }
    const dirty = cards.filter(c => edits[c.id]?.dirty);
    for (const card of dirty) {
      await handleSaveCard(card);
    }
    setSaving(false);
    onClose();
  };

  const dirtyCount = cards.filter(c => edits[c.id]?.dirty).length;

  return (
    <Dialog open={isOpen} onOpenChange={v => {
      if (!v && onCommit) { setPendingDiscard(true); return; }
      if (!v) onClose();
    }}>
      <DialogContent className="max-w-lg w-full p-0 overflow-hidden gap-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/50 bg-gradient-to-r from-emerald-500/5 to-primary/5">
          <DialogTitle className="flex items-center gap-2 text-base font-serif">
            <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-primary to-emerald-500 flex items-center justify-center">
              <Sparkles className="h-3.5 w-3.5 text-white" />
            </div>
            Review Generated Cards
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {cards.length > 0
              ? onCommit
                ? `Review first ${cards.length} card${cards.length !== 1 ? "s" : ""} from "${deckName}" — edit, then save.`
                : `Showing ${cards.length} of ${deckName} — edit or regenerate before saving.`
              : "Loading cards…"
            }
          </DialogDescription>
        </DialogHeader>

        <div className="px-5 py-4 min-h-[280px] flex flex-col">
          {loading ? (
            <div className="flex-1 flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : cards.length === 0 ? (
            <div className="flex-1 flex items-center justify-center py-10 text-sm text-muted-foreground">
              No cards to review.
            </div>
          ) : (
            <>
              {/* Card navigation dots */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1.5">
                  {cards.map((c, i) => (
                    <button
                      key={c.id}
                      onClick={() => setIdx(i)}
                      className={`h-2 rounded-full transition-all ${
                        i === idx ? "w-5 bg-primary" : "w-2 bg-muted-foreground/30 hover:bg-muted-foreground/50"
                      }`}
                    />
                  ))}
                </div>
                <span className="text-[11px] text-muted-foreground font-medium">
                  {idx + 1} / {cards.length}
                </span>
              </div>

              {/* Card editor */}
              {current && edit && (
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={current.id}
                    initial={{ opacity: 0, x: 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -16 }}
                    transition={{ duration: 0.2 }}
                    className="flex-1 space-y-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Front</label>
                        {edits[current.id]?.dirty && (
                          <Badge variant="outline" className="text-[9px] h-4 px-1.5 py-0 border-amber-400/60 text-amber-600 bg-amber-50/50 dark:bg-amber-900/20">edited</Badge>
                        )}
                      </div>
                      <Textarea
                        value={edit.front}
                        onChange={e => updateEdit(current.id, { front: e.target.value, dirty: true, saved: false })}
                        className="min-h-[72px] resize-none text-sm leading-snug"
                        disabled={edit.regenerating || edit.saving}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Back</label>
                      <Textarea
                        value={edit.back}
                        onChange={e => updateEdit(current.id, { back: e.target.value, dirty: true, saved: false })}
                        className="min-h-[72px] resize-none text-sm leading-snug"
                        disabled={edit.regenerating || edit.saving}
                      />
                    </div>

                    {current.image && (
                      <div className="text-[10px] text-muted-foreground italic">
                        Visual card — image cannot be edited here.
                      </div>
                    )}

                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 h-8 text-xs"
                        onClick={() => handleRegenerateCard(current)}
                        disabled={edit.regenerating || edit.saving}
                      >
                        {edit.regenerating
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <RefreshCw className="h-3.5 w-3.5" />}
                        {edit.regenerating ? "Regenerating…" : "Regenerate"}
                      </Button>
                      {edit.dirty && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 h-8 text-xs border-primary/40 text-primary hover:bg-primary/5"
                          onClick={() => handleSaveCard(current)}
                          disabled={edit.saving || edit.regenerating}
                        >
                          {edit.saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                          {edit.saving ? "Saving…" : "Save this card"}
                        </Button>
                      )}
                      {edit.saved && !edit.dirty && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Saved
                        </span>
                      )}
                    </div>
                  </motion.div>
                </AnimatePresence>
              )}
            </>
          )}
        </div>

        {/* Navigation + footer */}
        {!loading && cards.length > 0 && (
          <div className="flex items-center gap-2 px-5 py-3 border-t border-border/50 bg-muted/20">
            {pendingDiscard ? (
              <>
                <span className="text-[11px] text-destructive font-medium flex-1">Discard generated cards?</span>
                <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setPendingDiscard(false)}>
                  Keep reviewing
                </Button>
                <Button size="sm" variant="destructive" className="h-7 text-[11px]" onClick={() => { setPendingDiscard(false); onClose(); }}>
                  Discard
                </Button>
              </>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 w-8 p-0"
                  onClick={() => setIdx(i => Math.max(0, i - 1))}
                  disabled={idx === 0}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 w-8 p-0"
                  onClick={() => setIdx(i => Math.min(cards.length - 1, i + 1))}
                  disabled={idx === cards.length - 1}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <div className="flex-1" />
                {onCommit ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 gap-1.5 text-xs text-muted-foreground"
                    onClick={() => setPendingDiscard(true)}
                    disabled={saving}
                  >
                    <X className="h-3.5 w-3.5" />
                    Discard
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5 text-xs"
                    onClick={onClose}
                  >
                    <X className="h-3.5 w-3.5" />
                    Close
                  </Button>
                )}
                <Button
                  size="sm"
                  className="h-8 gap-1.5 text-xs bg-primary hover:bg-primary/90"
                  onClick={handleSaveAll}
                  disabled={saving}
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  {saving
                    ? "Saving…"
                    : onCommit
                      ? "Looks good, save all"
                      : dirtyCount > 0
                        ? `Save ${dirtyCount} edit${dirtyCount !== 1 ? "s" : ""} & close`
                        : "Done"
                  }
                </Button>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
