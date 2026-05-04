import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCreateDeck, useListDecks, getListDecksQueryKey } from "@workspace/api-client-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, FileText, FolderOpen, Loader2, Sparkles, Stethoscope } from "lucide-react";
import { GenerateForm } from "@/components/generate-form";
import { GenerateQbankForm } from "@/components/generate-qbank-form";
import type { Deck } from "@workspace/api-client-react/src/generated/api.schemas";

type DeckWithParent = Deck & { parentId?: number | null };

interface GenerateSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone?: () => void;
  defaultParentId?: number | null;
  prefilledText?: string;
  prefilledDeckName?: string;
  mode?: "deck" | "qbank";
}

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

export function GenerateSheet({ open, onOpenChange, onDone, defaultParentId, prefilledText, prefilledDeckName, mode = "deck" }: GenerateSheetProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createDeck = useCreateDeck();
  const { data: allDecks } = useListDecks();

  const [emptyName, setEmptyName] = useState("");
  const [emptyDesc, setEmptyDesc] = useState("");
  const [emptyParentId, setEmptyParentId] = useState<string>(defaultParentId?.toString() ?? "none");
  const [isCreating, setIsCreating] = useState(false);

  const parentOptions = buildParentOptions((allDecks as DeckWithParent[]) ?? []);
  const isQbank = mode === "qbank";

  const handleCreateEmpty = async () => {
    if (!emptyName.trim()) return;
    setIsCreating(true);
    const pid = emptyParentId === "none" ? null : parseInt(emptyParentId, 10);
    try {
      await createDeck.mutateAsync({ data: { name: emptyName, description: emptyDesc, parentId: pid, kind: isQbank ? "qbank" : "deck" } });
      queryClient.invalidateQueries({ queryKey: getListDecksQueryKey() });
      toast({ title: isQbank ? "Question bank created." : "Deck created." });
      setEmptyName(""); setEmptyDesc(""); setEmptyParentId("none");
      onDone?.(); onOpenChange(false);
    } catch {
      toast({ title: isQbank ? "Failed to create question bank" : "Failed to create deck", variant: "destructive" });
    } finally {
      setIsCreating(false);
    }
  };

  const selectedEmptyParent = parentOptions.find(o => o.id.toString() === emptyParentId);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto p-0 bg-gradient-to-b from-background to-muted/20">
        <div className="px-6 pt-5 pb-4 border-b bg-background/60 backdrop-blur-sm sticky top-0 z-10">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors mb-3 -ml-1 px-1 py-0.5 rounded hover:bg-muted"
            aria-label="Back"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </button>
          <SheetHeader>
            <div className="flex items-center gap-3">
              <div className={`h-10 w-10 rounded-xl border flex items-center justify-center shrink-0 ${
                isQbank
                  ? "bg-gradient-to-br from-violet-500/20 to-violet-500/5 border-violet-500/20"
                  : "bg-gradient-to-br from-primary/20 to-primary/5 border-primary/20"
              }`}>
                {isQbank
                  ? <Stethoscope className="h-5 w-5 text-violet-600" />
                  : <Sparkles className="h-5 w-5 text-primary" />
                }
              </div>
              <div className="flex-1 min-w-0 text-left">
                <SheetTitle className="font-serif text-2xl leading-tight">
                  {isQbank ? "New Question Bank" : "New Deck"}
                </SheetTitle>
                <SheetDescription className="text-xs mt-0.5">
                  {isQbank
                    ? "Generate UWorld-style MCQs with explanations, or start with an empty bank."
                    : "Generate AI flashcards or start from scratch."}
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>
        </div>

        <div className="px-6 py-5">
          <Tabs defaultValue="generate" className="w-full">
            <TabsList className="w-full mb-6 h-10 p-1 bg-muted/60">
              <TabsTrigger value="generate" className="flex-1 gap-1.5 h-8 data-[state=active]:shadow-sm">
                {isQbank ? <Stethoscope className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
                {isQbank ? "Generate MCQs" : "Generate with AI"}
              </TabsTrigger>
              <TabsTrigger value="empty" className="flex-1 gap-1.5 h-8 data-[state=active]:shadow-sm">
                <FileText className="h-3.5 w-3.5" /> {isQbank ? "Empty Bank" : "Empty Deck"}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="generate" className="mt-0">
              {isQbank ? (
                <GenerateQbankForm
                  defaultParentId={defaultParentId}
                  prefilledText={prefilledText}
                  prefilledDeckName={prefilledDeckName}
                  onDone={() => { onDone?.(); onOpenChange(false); }}
                />
              ) : (
                <GenerateForm
                  variant="sheet"
                  defaultParentId={defaultParentId}
                  prefilledText={prefilledText}
                  prefilledDeckName={prefilledDeckName}
                  onDone={() => { onDone?.(); onOpenChange(false); }}
                />
              )}
            </TabsContent>

            <TabsContent value="empty" className="space-y-4 mt-0">
              <div className="space-y-1.5">
                <Label className="text-sm flex items-center gap-1.5">
                  <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
                  Parent Deck <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <Select value={emptyParentId} onValueChange={setEmptyParentId}>
                  <SelectTrigger className="h-8 text-sm">
                    {emptyParentId === "none" || !selectedEmptyParent
                      ? <span className="text-muted-foreground">No parent — standalone deck</span>
                      : <span className="truncate">{selectedEmptyParent.label}</span>
                    }
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                    <SelectItem value="none">No parent — standalone deck</SelectItem>
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
              </div>
              <div className="space-y-2">
                <Label htmlFor="emptyName">{isQbank ? "Question Bank Name" : "Deck Name"}</Label>
                <Input id="emptyName" value={emptyName} onChange={e => setEmptyName(e.target.value)} placeholder={isQbank ? "e.g. Cardiology QBank" : "e.g. Spanish Vocabulary"} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="emptyDesc">Description <span className="text-muted-foreground">(optional)</span></Label>
                <Textarea id="emptyDesc" value={emptyDesc} onChange={e => setEmptyDesc(e.target.value)} placeholder={isQbank ? "What is this question bank for?" : "What is this deck for?"} className="resize-none" rows={3} />
              </div>
              <Button className="w-full h-11 shadow-sm font-medium" size="lg" onClick={handleCreateEmpty} disabled={!emptyName.trim() || isCreating}>
                {isCreating
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating…</>
                  : isQbank
                    ? <><Stethoscope className="mr-2 h-4 w-4" />Create Empty Question Bank</>
                    : <><FileText className="mr-2 h-4 w-4" />Create Empty Deck</>
                }
              </Button>
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
}
