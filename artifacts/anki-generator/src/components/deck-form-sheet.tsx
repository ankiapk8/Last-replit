import { useState, useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateDeck, useUpdateDeck, useListDecks, getListDecksQueryKey,
  useCreateQbank, useUpdateQbank, useListQbanks, getListQbanksQueryKey,
} from "@workspace/api-client-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, FolderOpen, Layers, FileText, Plus, X, Stethoscope } from "lucide-react";
import type { Deck } from "@workspace/api-client-react/src/generated/api.schemas";
import type { Qbank } from "@workspace/api-client-react";

type DeckWithParent = Deck & { parentId?: number | null };

export type DeckFormMode =
  | { type: "new-topic" }
  | { type: "new-subdeck"; parentId?: number }
  | { type: "new-qbank-topic" }
  | { type: "new-qbank"; parentId?: number }
  | { type: "edit"; deck: DeckWithParent }
  | { type: "edit-qbank"; qbank: Qbank };

interface DeckFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: DeckFormMode;
  onDone?: () => void;
}

function buildParentOptions(
  allDecks: DeckWithParent[],
  excludeId?: number,
): { id: number; label: string; depth: number }[] {
  const filtered = allDecks.filter(d => (d.kind ?? "deck") !== "qbank");
  const rootDecks = filtered.filter(d => !d.parentId && d.id !== excludeId);
  const byParent = new Map<number, DeckWithParent[]>();
  filtered.filter(d => d.parentId).forEach(d => {
    const pid = d.parentId!;
    if (!byParent.has(pid)) byParent.set(pid, []);
    byParent.get(pid)!.push(d);
  });

  const result: { id: number; label: string; depth: number }[] = [];

  function walk(deck: DeckWithParent, label: string, depth: number) {
    if (deck.id === excludeId) return;
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

function buildQbankParentOptions(
  allQbanks: Qbank[],
  excludeId?: number,
): { id: number; label: string; depth: number }[] {
  const rootQbanks = allQbanks.filter(q => !q.parentId && q.id !== excludeId);
  const byParent = new Map<number, Qbank[]>();
  allQbanks.filter(q => q.parentId).forEach(q => {
    const pid = q.parentId!;
    if (!byParent.has(pid)) byParent.set(pid, []);
    byParent.get(pid)!.push(q);
  });

  const result: { id: number; label: string; depth: number }[] = [];

  function walk(qbank: Qbank, label: string, depth: number) {
    if (qbank.id === excludeId) return;
    result.push({ id: qbank.id, label, depth });
    const children = byParent.get(qbank.id) ?? [];
    for (const child of children.sort((a, b) => a.name.localeCompare(b.name))) {
      walk(child, `${label} › ${child.name}`, depth + 1);
    }
  }

  for (const q of rootQbanks.sort((a, b) => a.name.localeCompare(b.name))) {
    walk(q, q.name, 0);
  }

  return result;
}

export function DeckFormSheet({ open, onOpenChange, mode, onDone }: DeckFormSheetProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createDeck = useCreateDeck();
  const updateDeck = useUpdateDeck();
  const createQbank = useCreateQbank();
  const updateQbank = useUpdateQbank();
  const { data: allDecks } = useListDecks();
  const { data: allQbanks } = useListQbanks();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [parentId, setParentId] = useState<string>("none");
  const [isSaving, setIsSaving] = useState(false);
  const [subSlots, setSubSlots] = useState<{ id: string; name: string }[]>([]);

  const isQbankMode = mode.type === "new-qbank-topic" || mode.type === "new-qbank" || mode.type === "edit-qbank";
  const excludeId = mode.type === "edit" ? mode.deck.id : mode.type === "edit-qbank" ? mode.qbank.id : undefined;

  const parentOptions = useMemo(() => {
    if (mode.type === "new-subdeck" || mode.type === "edit") {
      return buildParentOptions((allDecks as DeckWithParent[]) ?? [], excludeId);
    }
    if (mode.type === "new-qbank" || mode.type === "edit-qbank") {
      return buildQbankParentOptions((allQbanks as Qbank[]) ?? [], excludeId);
    }
    return [];
  }, [allDecks, allQbanks, excludeId, mode.type]);

  useEffect(() => {
    if (!open) return;
    if (mode.type === "new-topic" || mode.type === "new-qbank-topic") {
      setName(""); setDescription(""); setParentId("none"); setSubSlots([]);
    } else if (mode.type === "new-subdeck") {
      setName(""); setDescription("");
      setParentId(mode.parentId?.toString() ?? "none");
      setSubSlots([]);
    } else if (mode.type === "new-qbank") {
      setName(""); setDescription("");
      setParentId(mode.parentId?.toString() ?? "none");
      setSubSlots([]);
    } else if (mode.type === "edit") {
      setName(mode.deck.name);
      setDescription(mode.deck.description ?? "");
      setParentId(mode.deck.parentId?.toString() ?? "none");
      setSubSlots([]);
    } else if (mode.type === "edit-qbank") {
      setName(mode.qbank.name);
      setDescription(mode.qbank.description ?? "");
      setParentId(mode.qbank.parentId?.toString() ?? "none");
      setSubSlots([]);
    }
  }, [open, mode.type]);

  const resolvedParentId = parentId === "none" ? null : parseInt(parentId, 10);

  const addSubSlot = () => {
    if (subSlots.length >= 8) return;
    setSubSlots(prev => [...prev, { id: `${Date.now()}-${Math.random()}`, name: "" }]);
  };
  const removeSubSlot = (id: string) => setSubSlots(prev => prev.filter(s => s.id !== id));
  const updateSubSlot = (id: string, name: string) =>
    setSubSlots(prev => prev.map(s => s.id === id ? { ...s, name } : s));

  const handleSave = async () => {
    if (!name.trim()) return;
    setIsSaving(true);
    try {
      if (mode.type === "edit") {
        await updateDeck.mutateAsync({
          id: mode.deck.id,
          data: { name: name.trim(), description: description.trim() || null, parentId: resolvedParentId },
        });
        queryClient.invalidateQueries({ queryKey: getListDecksQueryKey() });
        toast({ title: "Updated." });

      } else if (mode.type === "edit-qbank") {
        await updateQbank.mutateAsync({
          id: mode.qbank.id,
          data: { name: name.trim(), description: description.trim() || null, parentId: resolvedParentId },
        });
        queryClient.invalidateQueries({ queryKey: getListQbanksQueryKey() });
        toast({ title: "Updated." });

      } else if (mode.type === "new-topic") {
        const created = await createDeck.mutateAsync({
          data: { name: name.trim(), description: description.trim() || null, parentId: null, kind: "deck" } as Parameters<typeof createDeck.mutateAsync>[0]["data"],
        }) as DeckWithParent;
        const validSlots = subSlots.filter(s => s.name.trim());
        for (const s of validSlots) {
          await createDeck.mutateAsync({
            data: { name: s.name.trim(), parentId: created.id, kind: "deck" } as Parameters<typeof createDeck.mutateAsync>[0]["data"],
          });
        }
        toast({
          title: "Topic created!",
          description: validSlots.length > 0
            ? `"${name}" created with ${validSlots.length} sub-topic${validSlots.length !== 1 ? "s" : ""}.`
            : undefined,
        });
        queryClient.invalidateQueries({ queryKey: getListDecksQueryKey() });

      } else if (mode.type === "new-subdeck") {
        await createDeck.mutateAsync({
          data: { name: name.trim(), description: description.trim() || null, parentId: resolvedParentId, kind: "deck" } as Parameters<typeof createDeck.mutateAsync>[0]["data"],
        });
        queryClient.invalidateQueries({ queryKey: getListDecksQueryKey() });
        toast({ title: "Deck created!" });

      } else if (mode.type === "new-qbank-topic") {
        const created = await createQbank.mutateAsync({
          data: { name: name.trim(), description: description.trim() || null, parentId: null },
        });
        const validSlots = subSlots.filter(s => s.name.trim());
        for (const s of validSlots) {
          await createQbank.mutateAsync({
            data: { name: s.name.trim(), parentId: created.id },
          });
        }
        toast({
          title: "QBank topic created!",
          description: validSlots.length > 0
            ? `"${name}" created with ${validSlots.length} question bank${validSlots.length !== 1 ? "s" : ""}.`
            : undefined,
        });
        queryClient.invalidateQueries({ queryKey: getListQbanksQueryKey() });

      } else if (mode.type === "new-qbank") {
        await createQbank.mutateAsync({
          data: { name: name.trim(), description: description.trim() || null, parentId: resolvedParentId },
        });
        queryClient.invalidateQueries({ queryKey: getListQbanksQueryKey() });
        toast({ title: "Question bank created!" });
      }

      onDone?.();
      onOpenChange(false);
    } catch {
      toast({ title: "Something went wrong.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const config = {
    "new-topic": {
      title: "New Main Topic",
      desc: "Create a topic folder to organise related flashcard decks.",
      icon: FolderOpen,
      accent: "primary" as const,
      namePlaceholder: "e.g. Biology, Machine Learning…",
      subLabel: "Sub-topics",
      subPlaceholder: (i: number) => `Sub-topic ${i + 1} name…`,
      subNote: (n: number) => `${n} sub-topic${n !== 1 ? "s" : ""} will be created.`,
      badgeLabel: (n: number) => `${n} sub-topic${n !== 1 ? "s" : ""}`,
      btnLabel: (subs: number) => subs > 0 ? `Create Topic + ${subs} Sub-topic${subs !== 1 ? "s" : ""}` : "Create Topic",
    },
    "new-qbank-topic": {
      title: "New QBank Topic",
      desc: "Create a main topic to organise related question banks under one folder.",
      icon: FolderOpen,
      accent: "violet" as const,
      namePlaceholder: "e.g. Cardiology, Renal, Pharmacology…",
      subLabel: "Question Banks",
      subPlaceholder: (i: number) => `Question bank ${i + 1} name…`,
      subNote: (n: number) => `${n} question bank${n !== 1 ? "s" : ""} will be created.`,
      badgeLabel: (n: number) => `${n} question bank${n !== 1 ? "s" : ""}`,
      btnLabel: (subs: number) => subs > 0 ? `Create Topic + ${subs} QBank${subs !== 1 ? "s" : ""}` : "Create QBank Topic",
    },
    "new-subdeck": {
      title: "New Sub-Topic",
      desc: "Create a sub-topic inside an existing main topic.",
      icon: FileText,
      accent: "primary" as const,
      namePlaceholder: "e.g. Chapter 1, Week 3 Notes…",
      subLabel: "",
      subPlaceholder: () => "",
      subNote: () => "",
      badgeLabel: () => "",
      btnLabel: () => "Create Sub-Topic",
    },
    "new-qbank": {
      title: "New Question Bank",
      desc: "Create an empty question bank inside a QBank topic.",
      icon: Stethoscope,
      accent: "violet" as const,
      namePlaceholder: "e.g. Heart Failure, AKI Questions…",
      subLabel: "",
      subPlaceholder: () => "",
      subNote: () => "",
      badgeLabel: () => "",
      btnLabel: () => "Create Question Bank",
    },
    "edit": {
      title: "Edit Deck",
      desc: "Update this deck's name, description, or parent assignment.",
      icon: Layers,
      accent: "primary" as const,
      namePlaceholder: "Deck name…",
      subLabel: "",
      subPlaceholder: () => "",
      subNote: () => "",
      badgeLabel: () => "",
      btnLabel: () => "Save Changes",
    },
    "edit-qbank": {
      title: "Edit Question Bank",
      desc: "Update this question bank's name, description, or parent topic.",
      icon: Stethoscope,
      accent: "violet" as const,
      namePlaceholder: "Question bank name…",
      subLabel: "",
      subPlaceholder: () => "",
      subNote: () => "",
      badgeLabel: () => "",
      btnLabel: () => "Save Changes",
    },
  }[mode.type];

  const isTopicMode = mode.type === "new-topic" || mode.type === "new-qbank-topic";
  const isNewWithParent = mode.type === "new-subdeck" || mode.type === "new-qbank";
  const isEditWithParent = mode.type === "edit" || mode.type === "edit-qbank";
  const validSubCount = subSlots.filter(s => s.name.trim()).length;
  const Icon = config.icon;
  const isViolet = config.accent === "violet";
  const selectedParentOpt = parentOptions.find(o => o.id.toString() === parentId);

  const parentLabel = (mode.type === "new-qbank" || mode.type === "edit-qbank") ? "QBank Topic" : "Parent Topic";
  const parentRequired = isNewWithParent;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${isViolet ? "bg-violet-500/10" : "bg-primary/10"}`}>
              <Icon className={`h-5 w-5 ${isViolet ? "text-violet-600" : "text-primary"}`} />
            </div>
            <SheetTitle className="font-serif text-2xl">{config.title}</SheetTitle>
          </div>
          <SheetDescription>{config.desc}</SheetDescription>
        </SheetHeader>

        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="deck-name">
              {isTopicMode ? "Topic Name" : (mode.type === "new-qbank" || mode.type === "edit-qbank") ? "Question Bank Name" : mode.type === "new-subdeck" ? "Sub-Topic Name" : "Deck Name"}{" "}
              <span className="text-destructive">*</span>
            </Label>
            <Input
              id="deck-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={config.namePlaceholder}
              autoFocus
              disabled={isSaving}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="deck-desc">Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Textarea
              id="deck-desc"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What is this for?"
              rows={2}
              className="resize-none"
              disabled={isSaving}
            />
          </div>

          {(isNewWithParent || isEditWithParent) && (
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                {isViolet
                  ? <Stethoscope className="h-3.5 w-3.5 text-muted-foreground" />
                  : <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />}
                {parentLabel}{" "}
                {parentRequired && <span className="text-destructive">*</span>}
                {mode.type === "edit" && <span className="text-muted-foreground font-normal">(optional)</span>}
              </Label>
              <Select value={parentId} onValueChange={setParentId} disabled={isSaving}>
                <SelectTrigger>
                  {parentId === "none" || !selectedParentOpt
                    ? <span className="text-muted-foreground text-sm">
                        {isNewWithParent
                          ? mode.type === "new-qbank" ? "Select a QBank topic…" : "Select a main topic…"
                          : "No parent — standalone"}
                      </span>
                    : <span className="text-sm truncate">{selectedParentOpt.label}</span>
                  }
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  {isEditWithParent && <SelectItem value="none">No parent — standalone topic</SelectItem>}
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
                  {parentOptions.length === 0 && isNewWithParent && (
                    <div className="px-2 py-3 text-sm text-muted-foreground text-center">
                      {mode.type === "new-qbank"
                        ? "No QBank topics yet. Create a QBank topic first."
                        : "No topics yet. Create a main topic first."}
                    </div>
                  )}
                </SelectContent>
              </Select>
              {selectedParentOpt && selectedParentOpt.depth >= 1 && (
                <p className="text-xs text-muted-foreground">
                  This will be nested inside <span className="font-medium">{selectedParentOpt.label}</span>.
                </p>
              )}
            </div>
          )}

          {isTopicMode && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5">
                  {isViolet
                    ? <Stethoscope className="h-3.5 w-3.5 text-muted-foreground" />
                    : <FileText className="h-3.5 w-3.5 text-muted-foreground" />}
                  {config.subLabel} <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                {subSlots.length < 8 && (
                  <button
                    onClick={addSubSlot}
                    className={`text-xs hover:underline flex items-center gap-0.5 ${isViolet ? "text-violet-600" : "text-primary"}`}
                    disabled={isSaving}
                  >
                    <Plus className="h-3 w-3" /> Add
                  </button>
                )}
              </div>

              {subSlots.length === 0 ? (
                <button
                  onClick={addSubSlot}
                  className={`w-full flex items-center justify-center gap-2 border-2 border-dashed rounded-lg py-3 text-sm text-muted-foreground transition-colors ${isViolet ? "hover:border-violet-500/40 hover:text-violet-600" : "hover:border-primary/40 hover:text-primary"}`}
                  disabled={isSaving}
                >
                  <Plus className="h-4 w-4" />
                  Add {isViolet ? "question banks" : "sub-topics"} inside this topic
                </button>
              ) : (
                <div className="space-y-2">
                  {subSlots.map((slot, idx) => (
                    <div key={slot.id} className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-5 text-right shrink-0">{idx + 1}.</span>
                      <Input
                        value={slot.name}
                        onChange={e => updateSubSlot(slot.id, e.target.value)}
                        placeholder={config.subPlaceholder(idx)}
                        className="h-8 text-sm flex-1"
                        disabled={isSaving}
                      />
                      <button
                        onClick={() => removeSubSlot(slot.id)}
                        className="text-muted-foreground hover:text-destructive shrink-0"
                        disabled={isSaving}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {validSubCount > 0 && (
                <p className="text-xs text-muted-foreground">{config.subNote(validSubCount)}</p>
              )}
            </div>
          )}

          {isTopicMode && name.trim() && (
            <div className={`rounded-lg border p-3 space-y-1.5 ${isViolet ? "border-violet-500/30 bg-violet-500/5" : "border-border/50 bg-muted/30"}`}>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Preview</p>
              <div className="flex items-center gap-2">
                <FolderOpen className={`h-4 w-4 shrink-0 ${isViolet ? "text-violet-600" : "text-primary"}`} />
                <span className="text-sm font-medium">{name.trim()}</span>
                {validSubCount > 0 && (
                  <Badge variant="outline" className="text-xs ml-auto">{config.badgeLabel(validSubCount)}</Badge>
                )}
              </div>
              {subSlots.filter(s => s.name.trim()).map((s) => (
                <div key={s.id} className={`flex items-center gap-2 ml-4 border-l-2 pl-3 ${isViolet ? "border-violet-500/20" : "border-primary/20"}`}>
                  {isViolet
                    ? <Stethoscope className="h-3.5 w-3.5 text-violet-500 shrink-0" />
                    : <FileText className="h-3.5 w-3.5 text-blue-500 shrink-0" />}
                  <span className="text-xs text-muted-foreground">{name.trim()}::{s.name.trim()}</span>
                </div>
              ))}
            </div>
          )}

          <Button
            className={`w-full ${isViolet ? "bg-violet-600 hover:bg-violet-700 text-white" : ""}`}
            onClick={handleSave}
            disabled={
              !name.trim() ||
              isSaving ||
              (isNewWithParent && parentId === "none" && parentOptions.length > 0)
            }
          >
            {isSaving
              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</>
              : config.btnLabel(validSubCount)
            }
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
