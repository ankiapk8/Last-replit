import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  Edit2,
  Loader2,
  RefreshCw,
  Save,
  Sparkles,
  Stethoscope,
  Trash2,
  X,
} from "lucide-react";

export type StagedCard = {
  front: string;
  back: string;
  cardType: string;
  image?: string | null;
  pageNumber?: number | null;
};

interface CardPreviewPanelProps {
  cards: StagedCard[];
  deckName: string;
  isSaving?: boolean;
  accentColor?: "emerald" | "violet";
  onSave: (cards: StagedCard[]) => Promise<void>;
  onRegenerate: () => void;
  onDiscard?: () => void;
}

export function CardPreviewPanel({
  cards: initialCards,
  deckName,
  isSaving: externalSaving,
  accentColor = "emerald",
  onSave,
  onRegenerate,
  onDiscard,
}: CardPreviewPanelProps) {
  const [localCards, setLocalCards] = useState<StagedCard[]>(initialCards);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editFront, setEditFront] = useState("");
  const [editBack, setEditBack] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [pendingDiscard, setPendingDiscard] = useState(false);

  const isViolet = accentColor === "violet";
  const accent = isViolet
    ? {
        headerGrad: "from-violet-500/10 to-fuchsia-500/5",
        border: "border-violet-500/20",
        iconBg: "bg-gradient-to-br from-violet-500 to-fuchsia-500",
        badge: "bg-violet-600 hover:bg-violet-600",
        saveBtn: "bg-violet-600 hover:bg-violet-700",
        cardBorder: "border-l-violet-400/60",
        editRing: "ring-violet-400/40",
        dot: "bg-violet-500",
      }
    : {
        headerGrad: "from-primary/10 to-emerald-500/5",
        border: "border-primary/20",
        iconBg: "bg-gradient-to-br from-primary to-emerald-500",
        badge: "bg-emerald-600 hover:bg-emerald-600",
        saveBtn: "bg-primary hover:bg-primary/90",
        cardBorder: "border-l-primary/50",
        editRing: "ring-primary/40",
        dot: "bg-emerald-500",
      };

  const startEdit = useCallback(
    (idx: number) => {
      setEditingIdx(idx);
      setEditFront(localCards[idx].front);
      setEditBack(localCards[idx].back);
    },
    [localCards]
  );

  const commitEdit = useCallback(() => {
    if (editingIdx === null) return;
    setLocalCards((prev) =>
      prev.map((c, i) =>
        i === editingIdx
          ? { ...c, front: editFront.trim() || c.front, back: editBack.trim() || c.back }
          : c
      )
    );
    setEditingIdx(null);
  }, [editingIdx, editFront, editBack]);

  const cancelEdit = useCallback(() => {
    setEditingIdx(null);
  }, []);

  const deleteCard = useCallback((idx: number) => {
    setLocalCards((prev) => prev.filter((_, i) => i !== idx));
    setEditingIdx(null);
  }, []);

  const handleSave = async () => {
    if (localCards.length === 0) return;
    setIsSaving(true);
    try {
      await onSave(localCards);
    } finally {
      setIsSaving(false);
    }
  };

  const saving = isSaving || !!externalSaving;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="space-y-3"
    >
      {/* Header */}
      <div
        className={`flex items-center gap-3 p-3.5 rounded-xl border ${accent.border} bg-gradient-to-r ${accent.headerGrad}`}
      >
        <div
          className={`h-9 w-9 rounded-xl ${accent.iconBg} flex items-center justify-center shrink-0 shadow-sm`}
        >
          {isViolet ? (
            <Stethoscope className="h-4.5 w-4.5 text-white" />
          ) : (
            <Sparkles className="h-4 w-4 text-white" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-serif text-sm font-semibold leading-tight truncate">
            {deckName}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Review and edit before saving
          </p>
        </div>
        <Badge className={`${accent.badge} text-white shrink-0 text-xs`}>
          {localCards.length} {localCards.length === 1 ? "card" : "cards"}
        </Badge>
      </div>

      {/* Card list */}
      <div className="rounded-xl border border-border/60 overflow-hidden">
        {localCards.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 px-4 text-center bg-muted/20">
            <p className="text-sm font-medium">All cards deleted</p>
            <p className="text-xs text-muted-foreground mt-1">
              Save the empty deck or regenerate.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/50 max-h-[420px] overflow-y-auto">
            <AnimatePresence initial={false}>
              {localCards.map((card, idx) => {
                const isEditing = editingIdx === idx;
                const isImage = !!card.image;

                return (
                  <motion.div
                    key={`card-${idx}-${card.front.slice(0, 20)}`}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0, overflow: "hidden" }}
                    transition={{ duration: 0.22, ease: "easeInOut" }}
                    layout
                  >
                    <div
                      className={`border-l-[3px] ${accent.cardBorder} bg-card transition-colors ${
                        isEditing ? "bg-muted/30" : "hover:bg-muted/10"
                      }`}
                    >
                      {isEditing ? (
                        /* Edit mode */
                        <div className="p-3 space-y-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                              Card {idx + 1} — editing
                            </span>
                            <button
                              onClick={cancelEdit}
                              className="text-muted-foreground hover:text-foreground p-0.5 rounded hover:bg-muted transition-colors"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                              Front
                            </label>
                            <Textarea
                              value={editFront}
                              onChange={(e) => setEditFront(e.target.value)}
                              className={`min-h-[64px] resize-none text-xs leading-snug ring-1 ${accent.editRing}`}
                              autoFocus
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                              Back
                            </label>
                            <Textarea
                              value={editBack}
                              onChange={(e) => setEditBack(e.target.value)}
                              className="min-h-[64px] resize-none text-xs leading-snug"
                            />
                          </div>
                          <div className="flex items-center gap-2 pt-0.5">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 gap-1.5 text-xs"
                              onClick={commitEdit}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Done
                            </Button>
                            <button
                              onClick={cancelEdit}
                              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* Compact view */
                        <div className="flex items-start gap-2 px-3 py-2.5 group">
                          <span className="text-[10px] font-mono text-muted-foreground/60 pt-0.5 w-6 shrink-0 tabular-nums select-none">
                            {String(idx + 1).padStart(2, "0")}
                          </span>
                          <div className="flex-1 min-w-0 grid grid-cols-2 gap-x-3">
                            {isImage ? (
                              <>
                                <div className="col-span-2 mb-0.5">
                                  <Badge
                                    variant="outline"
                                    className="text-[9px] px-1.5 h-4 font-normal border-muted-foreground/30"
                                  >
                                    image card
                                  </Badge>
                                </div>
                                <p className="text-[11px] leading-snug line-clamp-2 text-foreground">
                                  {card.front}
                                </p>
                                <p className="text-[11px] leading-snug line-clamp-2 text-muted-foreground">
                                  {card.back}
                                </p>
                              </>
                            ) : (
                              <>
                                <p className="text-[11px] leading-snug line-clamp-2 text-foreground">
                                  {card.front}
                                </p>
                                <p className="text-[11px] leading-snug line-clamp-2 text-muted-foreground">
                                  {card.back}
                                </p>
                              </>
                            )}
                          </div>
                          <div className="flex items-center gap-0.5 shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => startEdit(idx)}
                              title="Edit card"
                              className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                            >
                              <Edit2 className="h-3 w-3" />
                            </button>
                            <button
                              onClick={() => deleteCard(idx)}
                              title="Delete card"
                              className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="flex items-center gap-2">
        {pendingDiscard ? (
          <>
            <span className="flex-1 text-[11px] text-destructive font-medium">
              Discard these cards?
            </span>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              onClick={() => setPendingDiscard(false)}
            >
              Keep reviewing
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="h-8 text-xs"
              onClick={() => {
                setPendingDiscard(false);
                onDiscard?.();
              }}
            >
              Discard
            </Button>
          </>
        ) : (
          <>
            <Button
              size="sm"
              variant="outline"
              className="h-9 gap-1.5 text-xs"
              onClick={onRegenerate}
              disabled={saving}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Regenerate
            </Button>
            <div className="flex-1" />
            <button
              onClick={() => setPendingDiscard(true)}
              disabled={saving}
              className="text-xs text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
            >
              Discard
            </button>
            <Button
              size="sm"
              className={`h-9 gap-1.5 text-xs text-white ${accent.saveBtn}`}
              onClick={handleSave}
              disabled={saving || localCards.length === 0}
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              {saving
                ? "Saving…"
                : `Save ${localCards.length} card${localCards.length !== 1 ? "s" : ""}`}
            </Button>
          </>
        )}
      </div>
    </motion.div>
  );
}
