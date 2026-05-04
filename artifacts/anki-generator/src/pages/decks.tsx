import { Link, useSearch } from "wouter";
import {
  useListDecks, useDeleteDeck, getListDecksQueryKey,
  useListQbanks, useDeleteQbank, getListQbanksQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { AmbientOrbs } from "@/components/ambient-orbs";
import { PageHeader } from "@/components/page-header";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GenerateSheet } from "@/components/generate-sheet";
import { DeckFormSheet, type DeckFormMode } from "@/components/deck-form-sheet";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Trash2, Layers, Plus, Download, CheckSquare, X, Search,
  FileText, FolderOpen, ChevronDown, ChevronRight, Pencil,
  Sparkles, BookOpen, Upload, Combine, History as HistoryIcon,
  Stethoscope, Play, CalendarClock, Library, Tag, FolderPlus,
  FolderX, ArrowUpDown, SlidersHorizontal, Folder, PanelLeft,
  ChevronLeft, MoreHorizontal, FolderOutput,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Package } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiUrl } from "@/lib/utils";
import type { Deck } from "@workspace/api-client-react/src/generated/api.schemas";
import type { Qbank } from "@workspace/api-client-react";
import { getDueCountByDeckId } from "@/lib/srs";
import { getSessions, getDeckStats } from "@/lib/study-stats";

type DeckWithParent = Deck & { parentId?: number | null };
type SortOption = "name" | "created" | "cards" | "lastStudied" | "mastery";
type MasteryFilter = "all" | "mastered" | "needs-review";
type LibFolder = { id: string; name: string; deckIds: number[] };

const TAG_PALETTE = [
  { bg: "bg-red-500/15",    text: "text-red-700 dark:text-red-400",       border: "border-red-500/30"    },
  { bg: "bg-orange-500/15", text: "text-orange-700 dark:text-orange-400", border: "border-orange-500/30" },
  { bg: "bg-amber-500/15",  text: "text-amber-700 dark:text-amber-400",   border: "border-amber-500/30"  },
  { bg: "bg-lime-500/15",   text: "text-lime-700 dark:text-lime-400",     border: "border-lime-500/30"   },
  { bg: "bg-green-500/15",  text: "text-green-700 dark:text-green-400",   border: "border-green-500/30"  },
  { bg: "bg-teal-500/15",   text: "text-teal-700 dark:text-teal-400",     border: "border-teal-500/30"   },
  { bg: "bg-sky-500/15",    text: "text-sky-700 dark:text-sky-400",       border: "border-sky-500/30"    },
  { bg: "bg-blue-500/15",   text: "text-blue-700 dark:text-blue-400",     border: "border-blue-500/30"   },
  { bg: "bg-indigo-500/15", text: "text-indigo-700 dark:text-indigo-400", border: "border-indigo-500/30" },
  { bg: "bg-violet-500/15", text: "text-violet-700 dark:text-violet-400", border: "border-violet-500/30" },
  { bg: "bg-pink-500/15",   text: "text-pink-700 dark:text-pink-400",     border: "border-pink-500/30"   },
  { bg: "bg-rose-500/15",   text: "text-rose-700 dark:text-rose-400",     border: "border-rose-500/30"   },
];

function getTagColor(tag: string) {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) >>> 0;
  return TAG_PALETTE[h % TAG_PALETTE.length];
}

const DECK_TAGS_KEY = "ankigen_deck_tags";
const FOLDERS_KEY   = "ankigen_folders";

function loadDeckTags(): Record<number, string[]> {
  try { return JSON.parse(localStorage.getItem(DECK_TAGS_KEY) ?? "{}"); } catch { return {}; }
}
function persistDeckTags(t: Record<number, string[]>) {
  localStorage.setItem(DECK_TAGS_KEY, JSON.stringify(t));
}
function loadFolders(): LibFolder[] {
  try { return JSON.parse(localStorage.getItem(FOLDERS_KEY) ?? "[]"); } catch { return []; }
}
function persistFolders(f: LibFolder[]) {
  localStorage.setItem(FOLDERS_KEY, JSON.stringify(f));
}

function getAllDescendants(deckId: number, childrenMap: Map<number, DeckWithParent[]>): DeckWithParent[] {
  const direct = childrenMap.get(deckId) ?? [];
  return [...direct, ...direct.flatMap(d => getAllDescendants(d.id, childrenMap))];
}

function getAllQbankDescendants(qbankId: number, childrenMap: Map<number, Qbank[]>): Qbank[] {
  const direct = childrenMap.get(qbankId) ?? [];
  return [...direct, ...direct.flatMap(q => getAllQbankDescendants(q.id, childrenMap))];
}

function useDebouncedValue<T>(value: T, delay = 180) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(handle);
  }, [value, delay]);
  return debounced;
}

type QbankRowProps = {
  qbank: Qbank;
  depth: number;
  collapsedIds: Set<number>;
  toggleCollapse: (id: number, e: React.MouseEvent) => void;
  qbankChildrenMap: Map<number, Qbank[]>;
  openDeckForm: (mode: DeckFormMode) => void;
  handleDeleteQbank: (id: number, e: React.MouseEvent) => void;
};

function QbankRow({
  qbank, depth, collapsedIds, toggleCollapse,
  qbankChildrenMap, openDeckForm, handleDeleteQbank,
}: QbankRowProps) {
  const children = (qbankChildrenMap.get(qbank.id) ?? []).sort(
    (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })
  );
  const hasChildren = children.length > 0;
  const isCollapsed = collapsedIds.has(qbank.id);
  const allDescendants = getAllQbankDescendants(qbank.id, qbankChildrenMap);
  const totalQuestions = qbank.questionCount + allDescendants.reduce((s, q) => s + q.questionCount, 0);
  const clampedDepth = Math.min(depth, 2);

  const cardClass = [
    "cursor-pointer transition-all border",
    clampedDepth === 0
      ? "border-border/50 bg-card/70 backdrop-blur-sm shadow-sm hover:border-violet-500/40 hover:shadow-md hover:shadow-violet-500/5"
      : clampedDepth === 1
      ? "border-border/30 bg-muted/20 hover:border-violet-500/30 hover:shadow-sm"
      : "border-border/20 bg-muted/30 hover:border-violet-500/20",
  ].join(" ");

  const iconBg = clampedDepth === 0 ? hasChildren ? "bg-violet-600/15" : "bg-violet-600/10" : "bg-violet-500/10";
  const iconColor = clampedDepth === 0 ? "text-violet-600" : "text-violet-500";
  const iconBoxSize = clampedDepth === 0 ? "h-9 w-9" : clampedDepth === 1 ? "h-7 w-7" : "h-6 w-6";
  const iconSize = clampedDepth === 0 ? "h-4 w-4" : clampedDepth === 1 ? "h-3.5 w-3.5" : "h-3 w-3";
  const cardPadding = clampedDepth === 0 ? "p-4" : clampedDepth === 1 ? "py-2.5 px-3" : "py-2 px-3";
  const nameClass = clampedDepth === 0 ? "font-semibold" : clampedDepth === 1 ? "text-sm font-medium" : "text-xs font-medium";
  const chevronClass = clampedDepth === 0 ? "h-4 w-4" : "h-3.5 w-3.5";
  const btnSize = clampedDepth === 0 ? "h-8 w-8" : "h-7 w-7";
  const btnIconSize = clampedDepth === 0 ? "h-3.5 w-3.5" : "h-3 w-3";
  const questionCount = hasChildren ? totalQuestions : qbank.questionCount;
  const countClass = clampedDepth === 0
    ? "text-sm font-medium text-violet-600 bg-violet-500/10 px-2.5 py-1 rounded-md"
    : "text-xs font-medium text-violet-600 bg-violet-500/10 px-2 py-0.5 rounded";
  const indentClass = depth === 0 ? ""
    : depth === 1 ? "ml-3 sm:ml-6 mt-1.5 space-y-1 border-l-2 pl-2 sm:pl-4 border-violet-500/20"
    : "ml-2 sm:ml-5 mt-1 space-y-1 border-l-2 pl-2 sm:pl-3 border-violet-300/30";

  return (
    <div>
      <div className="relative group">
        <Link href={`/qbanks/${qbank.id}`}>
          <Card className={cardClass}>
            <CardContent className={cardPadding}>
              <div className="flex items-center gap-2.5">
                {hasChildren && (
                  <button className="text-muted-foreground hover:text-foreground shrink-0" onClick={e => toggleCollapse(qbank.id, e)}>
                    {isCollapsed ? <ChevronRight className={chevronClass} /> : <ChevronDown className={chevronClass} />}
                  </button>
                )}
                <div className={`${iconBoxSize} rounded-md flex items-center justify-center shrink-0 ${iconBg}`}>
                  {hasChildren ? <FolderOpen className={`${iconSize} ${iconColor}`} /> : <Stethoscope className={`${iconSize} ${iconColor}`} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className={`${nameClass} truncate`}>{qbank.name}</p>
                    {hasChildren && <Badge variant="outline" className="text-xs shrink-0 py-0 px-1.5">{children.length} question bank{children.length !== 1 ? "s" : ""}</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {format(new Date(qbank.createdAt), "MMM d, yyyy")}
                    {depth === 0 && qbank.description ? ` · ${qbank.description}` : ""}
                  </p>
                  {hasChildren && isCollapsed && (
                    <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                      {children.slice(0, 4).map(child => (
                        <span key={child.id} className="inline-flex items-center gap-1 text-[11px] bg-muted/60 text-muted-foreground border border-border/40 rounded px-1.5 py-0.5 font-medium">
                          <Stethoscope className="h-2.5 w-2.5 shrink-0 text-violet-500" />
                          <span className="truncate max-w-[80px]">{child.name}</span>
                          <span className="shrink-0 font-semibold text-violet-600">{child.questionCount}</span>
                        </span>
                      ))}
                      {children.length > 4 && <span className="text-[11px] text-muted-foreground">+{children.length - 4} more</span>}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-0.5 sm:gap-1.5 shrink-0 ml-auto">
                  <span className={countClass}>{questionCount}<span className="hidden xs:inline sm:inline"> MCQ{questionCount !== 1 ? "s" : ""}</span></span>
                  <div className="flex items-center gap-0.5">
                    {qbank.questionCount > 0 && (
                      <Link href={`/practice-qbank/${qbank.id}`} onClick={e => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className={`${btnSize} text-violet-500 hover:text-violet-700 hover:bg-violet-500/10`} title="Practice">
                          <Play className={btnIconSize} />
                        </Button>
                      </Link>
                    )}
                    <Button variant="ghost" size="icon" className={`${btnSize} text-muted-foreground hover:text-foreground`} title="Edit"
                      onClick={e => { e.preventDefault(); e.stopPropagation(); openDeckForm({ type: "edit-qbank", qbank }); }}>
                      <Pencil className={btnIconSize} />
                    </Button>
                    <Button variant="ghost" size="icon" className={`${btnSize} text-muted-foreground hover:text-destructive hover:bg-destructive/10`} title="Delete"
                      onClick={e => handleDeleteQbank(qbank.id, e)}>
                      <Trash2 className={btnIconSize} />
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>
      {hasChildren && !isCollapsed && (
        <div className={indentClass}>
          {children.map(child => (
            <QbankRow key={child.id} qbank={child} depth={depth + 1} collapsedIds={collapsedIds} toggleCollapse={toggleCollapse}
              qbankChildrenMap={qbankChildrenMap} openDeckForm={openDeckForm} handleDeleteQbank={handleDeleteQbank} />
          ))}
          <button className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground transition-colors rounded-md hover:text-violet-600 hover:bg-violet-500/5"
            onClick={() => openDeckForm({ type: "new-qbank", parentId: qbank.id })}>
            <Plus className="h-3 w-3" />
            Add question bank to <span className="font-medium ml-0.5">{qbank.name}</span>
          </button>
        </div>
      )}
    </div>
  );
}

type DeckRowProps = {
  deck: DeckWithParent;
  depth: number;
  collapsedIds: Set<number>;
  toggleCollapse: (id: number, e: React.MouseEvent) => void;
  deckChildrenMap: Map<number, DeckWithParent[]>;
  selectMode: boolean;
  selectedIds: Set<number>;
  toggleSelect: (id: number, e: React.MouseEvent) => void;
  openDeckForm: (mode: DeckFormMode) => void;
  handleDelete: (id: number, e: React.MouseEvent) => void;
  isQbank?: boolean;
  deckTags?: string[];
  onEditTags?: () => void;
  folders?: LibFolder[];
  onMoveToFolder?: (folderId: string | null) => void;
  activeFolderForDeck?: string | null;
};

function DeckRow({
  deck, depth, collapsedIds, toggleCollapse,
  deckChildrenMap, selectMode, selectedIds, toggleSelect,
  openDeckForm, handleDelete, isQbank = false,
  deckTags = [], onEditTags, folders = [], onMoveToFolder, activeFolderForDeck,
}: DeckRowProps) {
  const children = (deckChildrenMap.get(deck.id) ?? []).sort(
    (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })
  );
  const hasChildren = children.length > 0;
  const isCollapsed = collapsedIds.has(deck.id);
  const isSelected = selectedIds.has(deck.id);
  const allDescendants = getAllDescendants(deck.id, deckChildrenMap);
  const totalCards = deck.cardCount + allDescendants.reduce((s, d) => s + d.cardCount, 0);
  const dueCount = !isQbank && depth === 0 ? getDueCountByDeckId(deck.id) : 0;
  const clampedDepth = Math.min(depth, 2);

  const cardClass = [
    "cursor-pointer transition-all border",
    clampedDepth === 0
      ? isQbank
        ? "border-border/50 border-l-2 border-l-violet-500/40 bg-card/70 backdrop-blur-sm shadow-sm hover:border-violet-500/50 hover:border-l-violet-500/70 hover:shadow-md hover:shadow-violet-500/5"
        : "border-border/50 border-l-2 border-l-indigo-500/40 bg-card/70 backdrop-blur-sm shadow-sm hover:border-indigo-500/50 hover:border-l-indigo-500/70 hover:shadow-md hover:shadow-indigo-500/5"
      : clampedDepth === 1
      ? isQbank
        ? "border-border/30 border-l-2 border-l-violet-500/25 bg-muted/20 hover:border-violet-500/35 hover:shadow-sm"
        : "border-border/30 border-l-2 border-l-blue-500/25 bg-muted/20 hover:border-primary/35 hover:shadow-sm"
      : isQbank ? "border-border/20 bg-muted/30 hover:border-violet-500/20" : "border-border/20 bg-muted/30 hover:border-primary/20",
    selectMode ? isSelected ? isQbank ? "border-violet-500 ring-1 ring-violet-500/20 bg-violet-500/5" : "border-primary ring-1 ring-primary/20 bg-primary/5" : "opacity-80" : "",
  ].join(" ");

  const iconBg = isQbank
    ? clampedDepth === 0 ? (hasChildren ? "bg-violet-600/15" : "bg-violet-600/10") : "bg-violet-500/10"
    : clampedDepth === 0 ? (hasChildren ? "bg-primary/15" : "bg-primary/10")
    : clampedDepth === 1 ? (hasChildren ? "bg-blue-500/15" : "bg-blue-500/10") : (hasChildren ? "bg-violet-500/15" : "bg-violet-500/10");
  const iconColor = isQbank
    ? clampedDepth === 0 ? "text-violet-600" : "text-violet-500"
    : clampedDepth === 0 ? "text-primary" : clampedDepth === 1 ? "text-blue-500" : "text-violet-500";
  const iconBoxSize = clampedDepth === 0 ? "h-9 w-9" : clampedDepth === 1 ? "h-7 w-7" : "h-6 w-6";
  const iconSize = clampedDepth === 0 ? "h-4 w-4" : clampedDepth === 1 ? "h-3.5 w-3.5" : "h-3 w-3";
  const cardPadding = clampedDepth === 0 ? "p-4" : clampedDepth === 1 ? "py-2.5 px-3" : "py-2 px-3";
  const nameClass = clampedDepth === 0 ? "font-semibold" : clampedDepth === 1 ? "text-sm font-medium" : "text-xs font-medium";
  const chevronClass = clampedDepth === 0 ? "h-4 w-4" : "h-3.5 w-3.5";
  const checkboxClass = clampedDepth === 0 ? "h-5 w-5" : "h-4 w-4";
  const btnSize = clampedDepth === 0 ? "h-8 w-8" : "h-7 w-7";
  const btnIconSize = clampedDepth === 0 ? "h-3.5 w-3.5" : "h-3 w-3";
  const cardCount = hasChildren ? totalCards : deck.cardCount;
  const cardCountClass = isQbank
    ? clampedDepth === 0 ? "text-sm font-medium text-violet-600 bg-violet-500/10 px-2.5 py-1 rounded-md" : "text-xs font-medium text-violet-600 bg-violet-500/10 px-2 py-0.5 rounded"
    : clampedDepth === 0 ? "text-sm font-medium text-primary bg-primary/10 px-2.5 py-1 rounded-md" : "text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded";
  const indentClass = depth === 0 ? ""
    : depth === 1 ? `ml-3 sm:ml-6 mt-1.5 space-y-1 border-l-2 pl-2 sm:pl-4 ${isQbank ? "border-violet-500/20" : "border-primary/20"}`
    : `ml-2 sm:ml-5 mt-1 space-y-1 border-l-2 pl-2 sm:pl-3 ${isQbank ? "border-violet-300/30" : "border-blue-200/40"}`;
  const addBtnHover = isQbank ? "hover:text-violet-600 hover:bg-violet-500/5" : depth <= 1 ? "hover:text-primary hover:bg-primary/5" : "hover:text-violet-500 hover:bg-violet-500/5";
  const subLabel = isQbank ? "question bank" : "sub-topic";
  const subFormType = isQbank ? "new-qbank" : "new-subdeck";

  const showTagsRow = !isQbank && depth === 0 && deckTags.length > 0;

  return (
    <div>
      <div className="relative group">
        {selectMode && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10" onClick={e => toggleSelect(deck.id, e)}>
            <Checkbox checked={isSelected} className={`${checkboxClass} bg-background border-2 shadow-sm`} />
          </div>
        )}
        <Link href={selectMode ? "#" : `/decks/${deck.id}`}>
          <Card className={cardClass} onClick={selectMode ? e => toggleSelect(deck.id, e as React.MouseEvent) : undefined}>
            <CardContent className={cardPadding}>
              <div className="flex items-center gap-2.5">
                {hasChildren && !selectMode && (
                  <button className="text-muted-foreground hover:text-foreground shrink-0" onClick={e => toggleCollapse(deck.id, e)}>
                    {isCollapsed ? <ChevronRight className={chevronClass} /> : <ChevronDown className={chevronClass} />}
                  </button>
                )}
                <div className={`${iconBoxSize} rounded-md flex items-center justify-center shrink-0 ${iconBg}`}>
                  {hasChildren ? <FolderOpen className={`${iconSize} ${iconColor}`} />
                    : isQbank ? <Stethoscope className={`${iconSize} ${iconColor}`} />
                    : depth === 0 ? <Layers className={`${iconSize} ${iconColor}`} />
                    : <FileText className={`${iconSize} ${iconColor}`} />}
                </div>
                <div className={`flex-1 min-w-0 ${selectMode ? "pl-5" : ""}`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className={`${nameClass} truncate`}>{deck.name}</p>
                    {hasChildren && (
                      <Badge variant="outline" className="text-xs shrink-0 py-0 px-1.5">
                        {children.length} {isQbank ? "question bank" : "sub-topic"}{children.length !== 1 ? "s" : ""}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {format(new Date(deck.createdAt), "MMM d, yyyy")}
                    {depth === 0 && deck.description ? ` · ${deck.description}` : ""}
                  </p>
                  {showTagsRow && (
                    <div className="flex items-center gap-1 flex-wrap mt-1.5">
                      {deckTags.map(tag => {
                        const c = getTagColor(tag);
                        return (
                          <span key={tag} className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${c.bg} ${c.text} ${c.border}`}>
                            <Tag className="h-2 w-2 shrink-0" />{tag}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {hasChildren && isCollapsed && !selectMode && (
                    <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                      {children.slice(0, 4).map(child => (
                        <span key={child.id} className="inline-flex items-center gap-1 text-[11px] bg-muted/60 text-muted-foreground border border-border/40 rounded px-1.5 py-0.5 font-medium">
                          {isQbank ? <Stethoscope className="h-2.5 w-2.5 shrink-0 text-violet-500" /> : <FileText className="h-2.5 w-2.5 shrink-0" />}
                          <span className="truncate max-w-[80px]">{child.name}</span>
                          <span className={`shrink-0 font-semibold ${isQbank ? "text-violet-600" : "text-primary"}`}>{child.cardCount}</span>
                        </span>
                      ))}
                      {children.length > 4 && <span className="text-[11px] text-muted-foreground">+{children.length - 4} more</span>}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-0.5 sm:gap-1.5 shrink-0 ml-auto">
                  {dueCount > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-500/12 border border-amber-500/30 px-1.5 py-0.5 rounded">
                      <CalendarClock className="h-2.5 w-2.5" />{dueCount} due
                    </span>
                  )}
                  <span className={cardCountClass}>
                    {cardCount}<span className="hidden xs:inline sm:inline"> {isQbank ? "MCQ" : "card"}{cardCount !== 1 ? "s" : ""}</span>
                  </span>
                  {!selectMode && (
                    <div className="flex items-center gap-0.5">
                      {isQbank && deck.cardCount > 0 && (
                        <Link href={`/practice/${deck.id}`} onClick={e => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className={`${btnSize} text-violet-500 hover:text-violet-700 hover:bg-violet-500/10`} title="Practice">
                            <Play className={btnIconSize} />
                          </Button>
                        </Link>
                      )}
                      <Button variant="ghost" size="icon" className={`${btnSize} text-muted-foreground hover:text-foreground`} title="Edit"
                        onClick={e => { e.preventDefault(); e.stopPropagation(); openDeckForm({ type: "edit", deck }); }}>
                        <Pencil className={btnIconSize} />
                      </Button>
                      {/* Tags + folders via "more" dropdown at depth 0 */}
                      {!isQbank && depth === 0 && (onEditTags || (folders.length > 0 && onMoveToFolder)) && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className={`${btnSize} text-muted-foreground hover:text-foreground`} title="More actions"
                              onClick={e => { e.preventDefault(); e.stopPropagation(); }}>
                              <MoreHorizontal className={btnIconSize} />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48" onClick={e => e.stopPropagation()}>
                            {onEditTags && (
                              <DropdownMenuItem className="gap-2 cursor-pointer" onClick={e => { e.stopPropagation(); onEditTags(); }}>
                                <Tag className="h-3.5 w-3.5 text-primary" /> Edit tags
                              </DropdownMenuItem>
                            )}
                            {folders.length > 0 && onMoveToFolder && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuSub>
                                  <DropdownMenuSubTrigger className="gap-2 cursor-pointer">
                                    <FolderOutput className="h-3.5 w-3.5 text-amber-500" /> Move to folder
                                  </DropdownMenuSubTrigger>
                                  <DropdownMenuSubContent className="w-44">
                                    <DropdownMenuItem className="gap-2 cursor-pointer text-muted-foreground"
                                      onClick={() => onMoveToFolder(null)}>
                                      <FolderX className="h-3.5 w-3.5" /> No folder
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    {folders.map(f => (
                                      <DropdownMenuItem key={f.id} className="gap-2 cursor-pointer"
                                        onClick={() => onMoveToFolder(f.id)}>
                                        <Folder className={`h-3.5 w-3.5 ${activeFolderForDeck === f.id ? "text-amber-500" : "text-muted-foreground"}`} />
                                        <span className="truncate flex-1">{f.name}</span>
                                        {activeFolderForDeck === f.id && <span className="text-[10px] text-amber-500">✓</span>}
                                      </DropdownMenuItem>
                                    ))}
                                  </DropdownMenuSubContent>
                                </DropdownMenuSub>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                      <Button variant="ghost" size="icon" className={`${btnSize} text-muted-foreground hover:text-destructive hover:bg-destructive/10`} title="Delete"
                        onClick={e => handleDelete(deck.id, e)}>
                        <Trash2 className={btnIconSize} />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {hasChildren && !isCollapsed && (
        <div className={indentClass}>
          {children.map(child => (
            <DeckRow key={child.id} deck={child} depth={depth + 1} collapsedIds={collapsedIds} toggleCollapse={toggleCollapse}
              deckChildrenMap={deckChildrenMap} selectMode={selectMode} selectedIds={selectedIds} toggleSelect={toggleSelect}
              openDeckForm={openDeckForm} handleDelete={handleDelete} isQbank={isQbank} />
          ))}
          {!selectMode && (
            <button className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground transition-colors rounded-md ${addBtnHover}`}
              onClick={() => openDeckForm({ type: subFormType, parentId: deck.id })}>
              <Plus className="h-3 w-3" />
              Add {subLabel} to <span className="font-medium ml-0.5">{deck.name}</span>
            </button>
          )}
        </div>
      )}

      {!hasChildren && !selectMode && depth > 0 && (
        <div className="ml-5 mt-0.5">
          <button className={`flex items-center gap-1.5 px-3 py-1 text-xs text-muted-foreground transition-colors rounded ${addBtnHover}`}
            onClick={() => openDeckForm({ type: subFormType, parentId: deck.id })}>
            <Plus className="h-3 w-3" />
            Add {subLabel}
          </button>
        </div>
      )}
    </div>
  );
}

export default function Decks() {
  const { data: decks, isLoading } = useListDecks();
  const { data: qbanks, isLoading: isLoadingQbanks } = useListQbanks();
  const deleteDeck = useDeleteDeck();
  const deleteQbankMutation = useDeleteQbank();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [generateSheetOpen, setGenerateSheetOpen] = useState(false);
  const [sharedText, setSharedText] = useState<string | undefined>(undefined);
  const [sharedTitle, setSharedTitle] = useState<string | undefined>(undefined);
  const search_ = useSearch();
  useEffect(() => {
    const params = new URLSearchParams(search_);
    const wantsNew = params.get("new") === "1";
    const t = params.get("shared_text") ?? undefined;
    const u = params.get("shared_url") ?? undefined;
    const title = params.get("shared_title") ?? undefined;
    const combined = [t, u].filter(Boolean).join("\n\n") || undefined;
    if (wantsNew || combined || title) {
      setGenerateSheetOpen(true);
      if (combined) setSharedText(combined);
      if (title) setSharedTitle(title);
      const url = new URL(window.location.href);
      ["new", "shared_text", "shared_url", "shared_title"].forEach(k => url.searchParams.delete(k));
      window.history.replaceState({}, "", url.pathname + (url.search || ""));
    }
  }, [search_]);

  const [deckFormOpen, setDeckFormOpen] = useState(false);
  const [deckFormMode, setDeckFormMode] = useState<DeckFormMode>({ type: "new-topic" });
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exportingAll, setExportingAll] = useState(false);
  const [exportingApkgAll, setExportingApkgAll] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeName, setMergeName] = useState("");
  const [mergeDeleteOriginals, setMergeDeleteOriginals] = useState(false);
  const [merging, setMerging] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [collapsedIds, setCollapsedIds] = useState<Set<number>>(new Set());
  const initializedRef = useRef(false);
  const [libraryTab, setLibraryTab] = useState<"decks" | "qbanks">("decks");
  const [generateMode, setGenerateMode] = useState<"deck" | "qbank">("deck");
  const [masteryFilter, setMasteryFilter] = useState<MasteryFilter>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "flashcards" | "qbanks">("all");

  const [deckTags, setDeckTagsState] = useState<Record<number, string[]>>(loadDeckTags);
  const [tagEditDeckId, setTagEditDeckId] = useState<number | null>(null);
  const [tagInput, setTagInput] = useState("");
  const tagInputRef = useRef<HTMLInputElement>(null);

  const updateDeckTags = useCallback((deckId: number, tags: string[]) => {
    setDeckTagsState(prev => {
      const next = { ...prev, [deckId]: tags };
      persistDeckTags(next);
      return next;
    });
  }, []);

  const addTag = (deckId: number, tag: string) => {
    const t = tag.trim();
    if (!t) return;
    const current = deckTags[deckId] ?? [];
    if (!current.includes(t)) updateDeckTags(deckId, [...current, t]);
    setTagInput("");
  };

  const removeTag = (deckId: number, tag: string) => {
    updateDeckTags(deckId, (deckTags[deckId] ?? []).filter(t => t !== tag));
  };

  const allTags = useMemo(() => {
    const set = new Set<string>();
    Object.values(deckTags).forEach(tags => tags.forEach(t => set.add(t)));
    return Array.from(set).sort();
  }, [deckTags]);

  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);

  const [sortBy, setSortBy] = useState<SortOption>("name");

  const { lastStudiedMap, masteryMap } = useMemo(() => {
    const sessions = getSessions();
    const lsMap = new Map<number, number>();
    for (const s of sessions) {
      const d = new Date(s.completedAt).getTime();
      if (!lsMap.has(s.deckId) || d > lsMap.get(s.deckId)!) lsMap.set(s.deckId, d);
    }
    const stats = getDeckStats(sessions);
    const mMap = new Map<number, number>();
    stats.forEach((v, k) => mMap.set(k, v.total > 0 ? v.known / v.total : 0));
    return { lastStudiedMap: lsMap, masteryMap: mMap };
  }, []);

  const [folders, setFoldersState] = useState<LibFolder[]>(loadFolders);
  const [showFoldersSidebar, setShowFoldersSidebar] = useState(false);
  const [activeFolderFilter, setActiveFolderFilter] = useState<string | null>(null);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [folderEditId, setFolderEditId] = useState<string | null>(null);
  const [folderName, setFolderName] = useState("");

  const updateFolders = (f: LibFolder[]) => { setFoldersState(f); persistFolders(f); };

  const createFolder = () => {
    const name = folderName.trim();
    if (!name) return;
    const id = `folder_${Date.now()}`;
    const next = [...folders, { id, name, deckIds: [] }];
    updateFolders(next);
    setFolderName(""); setFolderDialogOpen(false);
    toast({ title: `Folder "${name}" created` });
  };

  const renameFolder = () => {
    if (!folderEditId) return;
    const name = folderName.trim();
    if (!name) return;
    updateFolders(folders.map(f => f.id === folderEditId ? { ...f, name } : f));
    setFolderEditId(null); setFolderName(""); setFolderDialogOpen(false);
  };

  const deleteFolder = (folderId: string) => {
    updateFolders(folders.filter(f => f.id !== folderId));
    if (activeFolderFilter === folderId) setActiveFolderFilter(null);
  };

  const moveDeckToFolder = (deckId: number, folderId: string | null) => {
    const next = folders.map(f => ({
      ...f,
      deckIds: f.id === folderId
        ? [...new Set([...f.deckIds, deckId])]
        : f.deckIds.filter(id => id !== deckId),
    }));
    updateFolders(next);
  };

  const getDeckFolder = (deckId: number): string | null => {
    return folders.find(f => f.deckIds.includes(deckId))?.id ?? null;
  };

  useEffect(() => {
    if (!decks || initializedRef.current) return;
    const all = decks as DeckWithParent[];
    const parentIds = all.filter(d => d.parentId).map(d => d.parentId!);
    const parentSet = new Set(parentIds);
    const toCollapse = all.filter(d => parentSet.has(d.id)).map(d => d.id);
    if (toCollapse.length > 0) { setCollapsedIds(new Set(toCollapse)); initializedRef.current = true; }
  }, [decks]);

  // Auto-switch tab
  useEffect(() => {
    if ((decks as DeckWithParent[] | undefined)?.length === 0 && (qbanks?.length ?? 0) > 0) setLibraryTab("qbanks");
  }, [(decks as DeckWithParent[] | undefined)?.length, qbanks?.length]);

  const totalCards = (decks as DeckWithParent[] | undefined)?.reduce((sum, d) => sum + d.cardCount, 0) ?? 0;

  const { rootDecks, rootFlashcardDecks, deckChildrenMap, flashcardChildrenCount, flashcardTotalCards } = useMemo(() => {
    const all = (decks as DeckWithParent[] | undefined) ?? [];
    const root = all.filter(d => !d.parentId).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
    const flashcards = root.filter(d => (d.kind ?? "deck") !== "qbank");
    const byParent = new Map<number, DeckWithParent[]>();
    all.filter(d => d.parentId && (d.kind ?? "deck") !== "qbank").forEach(d => {
      const pid = d.parentId!;
      if (!byParent.has(pid)) byParent.set(pid, []);
      byParent.get(pid)!.push(d);
    });
    const flashcardChildren = all.filter(d => d.parentId && (d.kind ?? "deck") !== "qbank").length;
    const fcCards = all.filter(d => (d.kind ?? "deck") !== "qbank").reduce((s, d) => s + d.cardCount, 0);
    return { rootDecks: root, rootFlashcardDecks: flashcards, deckChildrenMap: byParent, flashcardChildrenCount: flashcardChildren, flashcardTotalCards: fcCards };
  }, [decks]);

  const { rootQbankDecks, qbankChildrenMap, qbankChildrenCount, qbankTotalMcqs } = useMemo(() => {
    const all = (qbanks as Qbank[] | undefined) ?? [];
    const root = all.filter(q => !q.parentId).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
    const byParent = new Map<number, Qbank[]>();
    all.filter(q => q.parentId).forEach(q => {
      const pid = q.parentId!;
      if (!byParent.has(pid)) byParent.set(pid, []);
      byParent.get(pid)!.push(q);
    });
    return { rootQbankDecks: root, qbankChildrenMap: byParent, qbankChildrenCount: all.filter(q => q.parentId).length, qbankTotalMcqs: all.reduce((s, q) => s + q.questionCount, 0) };
  }, [qbanks]);

  const sortDecks = useCallback((list: DeckWithParent[]) => {
    return [...list].sort((a, b) => {
      switch (sortBy) {
        case "name": return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
        case "created": return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case "cards": {
          const ac = a.cardCount + getAllDescendants(a.id, deckChildrenMap).reduce((s, d) => s + d.cardCount, 0);
          const bc = b.cardCount + getAllDescendants(b.id, deckChildrenMap).reduce((s, d) => s + d.cardCount, 0);
          return bc - ac;
        }
        case "lastStudied": return (lastStudiedMap.get(b.id) ?? 0) - (lastStudiedMap.get(a.id) ?? 0);
        case "mastery": return (masteryMap.get(b.id) ?? 0) - (masteryMap.get(a.id) ?? 0);
        default: return 0;
      }
    });
  }, [sortBy, lastStudiedMap, masteryMap, deckChildrenMap]);

  const filterBySearch = useCallback((list: DeckWithParent[]) => {
    if (!debouncedSearch.trim()) return list;
    const q = debouncedSearch.toLowerCase();
    function matchesSearch(d: DeckWithParent): boolean {
      if (
        d.name.toLowerCase().includes(q) ||
        d.description?.toLowerCase().includes(q) ||
        (deckTags[d.id] ?? []).some(tag => tag.toLowerCase().includes(q))
      ) return true;
      return (deckChildrenMap.get(d.id) ?? []).some(child => matchesSearch(child));
    }
    return list.filter(d => matchesSearch(d));
  }, [debouncedSearch, deckChildrenMap, deckTags]);

  const filterQbanksBySearch = useCallback((list: Qbank[]) => {
    if (!debouncedSearch.trim()) return list;
    const q = debouncedSearch.toLowerCase();
    function matchesSearch(qb: Qbank): boolean {
      if (qb.name.toLowerCase().includes(q) || qb.description?.toLowerCase().includes(q)) return true;
      return (qbankChildrenMap.get(qb.id) ?? []).some(child => matchesSearch(child));
    }
    return list.filter(qb => matchesSearch(qb));
  }, [debouncedSearch, qbankChildrenMap]);

  const filteredFlashcards = useMemo(() => {
    let list = filterBySearch(rootFlashcardDecks);
    if (activeTagFilter) list = list.filter(d => (deckTags[d.id] ?? []).includes(activeTagFilter));
    if (activeFolderFilter) {
      const folder = folders.find(f => f.id === activeFolderFilter);
      if (folder) list = list.filter(d => folder.deckIds.includes(d.id));
    }
    if (masteryFilter !== "all") {
      list = list.filter(d => {
        const pct = masteryMap.get(d.id);
        if (masteryFilter === "mastered") return (pct ?? 0) >= 0.8;
        return (pct ?? 0) < 0.8;
      });
    }
    return sortDecks(list);
  }, [rootFlashcardDecks, filterBySearch, activeTagFilter, activeFolderFilter, folders, deckTags, masteryFilter, masteryMap, sortDecks]);

  const filteredQbanks = useMemo(() => filterQbanksBySearch(rootQbankDecks), [rootQbankDecks, filterQbanksBySearch]);

  const allSelectableIds = useMemo(() => ((decks as DeckWithParent[] | undefined) ?? []).map(d => d.id), [decks]);
  const openDeckForm = (mode: DeckFormMode) => { setDeckFormMode(mode); setDeckFormOpen(true); };
  const openGenerateSheet = (mode: "deck" | "qbank") => { setGenerateMode(mode); setGenerateSheetOpen(true); };
  const exitSelectMode = () => { setSelectMode(false); setSelectedIds(new Set()); };
  const toggleSelectAll = () => { if (selectedIds.size === allSelectableIds.length) setSelectedIds(new Set()); else setSelectedIds(new Set(allSelectableIds)); };
  const toggleCollapse = (id: number, e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); setCollapsedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; }); };
  const toggleSelect = (id: number, e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; }); };

  // Bulk delete
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    if (!confirm(`Delete ${count} selected deck${count !== 1 ? "s" : ""}? This cannot be undone.`)) return;
    setBulkDeleting(true);
    try {
      for (const id of Array.from(selectedIds)) {
        await new Promise<void>((resolve, reject) =>
          deleteDeck.mutate({ id }, { onSuccess: () => resolve(), onError: (e) => reject(e) })
        );
      }
      queryClient.invalidateQueries({ queryKey: getListDecksQueryKey() });
      toast({ title: `Deleted ${count} deck${count !== 1 ? "s" : ""}` });
      exitSelectMode();
    } catch {
      toast({ title: "Some deletions failed", variant: "destructive" });
    } finally {
      setBulkDeleting(false);
    }
  };

  // Bulk tag-assign
  const [bulkTagOpen, setBulkTagOpen] = useState(false);
  const [bulkTagInput, setBulkTagInput] = useState("");
  const handleBulkAddTag = () => {
    const t = bulkTagInput.trim();
    if (!t) return;
    for (const id of selectedIds) {
      const current = deckTags[id] ?? [];
      if (!current.includes(t)) updateDeckTags(id, [...current, t]);
    }
    setBulkTagInput(""); setBulkTagOpen(false);
    toast({ title: `Tag "${t}" added to ${selectedIds.size} deck${selectedIds.size !== 1 ? "s" : ""}` });
  };

  // Merge
  const openMergeDialog = () => {
    if (selectedIds.size < 2) return;
    const selectedDecks = (decks as DeckWithParent[] | undefined)?.filter(d => selectedIds.has(d.id)) ?? [];
    setMergeName(selectedDecks.length > 0 ? `${selectedDecks[0].name} + ${selectedDecks.length - 1} more` : "Merged Deck");
    setMergeDeleteOriginals(false); setMergeOpen(true);
  };

  const handleMerge = async () => {
    const name = mergeName.trim();
    if (!name) { toast({ title: "Name required", description: "Give the merged deck a name.", variant: "destructive" }); return; }
    setMerging(true);
    try {
      const resp = await fetch(apiUrl("api/decks/merge"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deckIds: Array.from(selectedIds), newDeckName: name, deleteOriginals: mergeDeleteOriginals }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error ?? "Merge failed.");
      queryClient.invalidateQueries({ queryKey: getListDecksQueryKey() });
      toast({
        title: "Decks merged",
        description: `"${data.name}" created with ${data.cardCount} card${data.cardCount === 1 ? "" : "s"}${mergeDeleteOriginals ? `. ${selectedIds.size} original deck${selectedIds.size === 1 ? "" : "s"} removed.` : "."}`,
      });
      setMergeOpen(false); exitSelectMode();
    } catch (err) {
      toast({ title: "Merge failed", description: err instanceof Error ? err.message : "Something went wrong.", variant: "destructive" });
    } finally { setMerging(false); }
  };

  const handleDeleteQbank = (id: number, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    const all = (qbanks as Qbank[] | undefined) ?? [];
    function collectDescendants(pid: number): Qbank[] {
      const direct = all.filter(q => q.parentId === pid);
      return [...direct, ...direct.flatMap(q => collectDescendants(q.id))];
    }
    const descendants = collectDescendants(id);
    const target = all.find(q => q.id === id);
    const totalMcqs = (target?.questionCount ?? 0) + descendants.reduce((s, q) => s + q.questionCount, 0);
    const msg = descendants.length > 0
      ? `Delete "${target?.name}" and ALL ${descendants.length} question bank${descendants.length !== 1 ? "s" : ""} inside it?\n\nThis will permanently remove ${totalMcqs} MCQ${totalMcqs !== 1 ? "s" : ""}. This cannot be undone.`
      : `Delete "${target?.name}"? This will permanently remove ${totalMcqs} MCQ${totalMcqs !== 1 ? "s" : ""}. This cannot be undone.`;
    if (!confirm(msg)) return;
    deleteQbankMutation.mutate({ id }, {
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListQbanksQueryKey() }); toast({ title: "Question bank deleted." }); },
    });
  };

  const handleDelete = (id: number, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    const all = (decks as DeckWithParent[] | undefined) ?? [];
    function collectDescendants(pid: number): DeckWithParent[] {
      const direct = all.filter(d => d.parentId === pid);
      return [...direct, ...direct.flatMap(d => collectDescendants(d.id))];
    }
    const descendants = collectDescendants(id);
    const target = all.find(d => d.id === id);
    const tc = (target?.cardCount ?? 0) + descendants.reduce((s, d) => s + d.cardCount, 0);
    const msg = descendants.length > 0
      ? `Delete "${target?.name}" and ALL ${descendants.length} sub-topic${descendants.length !== 1 ? "s" : ""} inside it?\n\nThis will permanently remove ${tc} card${tc !== 1 ? "s" : ""}. This cannot be undone.`
      : `Delete "${target?.name}"? This will permanently remove ${tc} card${tc !== 1 ? "s" : ""}. This cannot be undone.`;
    if (!confirm(msg)) return;
    deleteDeck.mutate({ id }, {
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListDecksQueryKey() }); setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n; }); toast({ title: "Deck deleted." }); },
    });
  };

  const handleExportApkg = async () => {
    if (selectedIds.size === 0) return;
    setExporting(true);
    try {
      const deckIds = Array.from(selectedIds);
      const selectedDecks = (decks as DeckWithParent[] | undefined)?.filter(d => selectedIds.has(d.id)) ?? [];
      const exportName = selectedDecks.length === 1 ? selectedDecks[0].name : `${selectedDecks.length} Decks`;
      const resp = await fetch(apiUrl("api/export-apkg"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deckIds, exportName }),
      });
      if (!resp.ok) throw new Error((await resp.json().catch(() => ({}))).error ?? "Export failed.");
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement("a"), { href: url, download: `${exportName.replace(/[^a-z0-9_\-]/gi, "_")}.apkg` });
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      toast({ title: "Export complete", description: `Downloaded ${exportName}.apkg` });
    } catch (err) {
      toast({ title: "Export failed", description: err instanceof Error ? err.message : "Something went wrong.", variant: "destructive" });
    } finally { setExporting(false); }
  };

  const handleExportLibraryApkg = async () => {
    const all = (decks as DeckWithParent[] | undefined) ?? [];
    const rootIds = all.filter(d => !d.parentId).map(d => d.id);
    if (rootIds.length === 0) { toast({ title: "Nothing to export", description: "Create a deck first.", variant: "destructive" }); return; }
    setExportingApkgAll(true);
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      const exportName = `AnkiGen Library ${stamp}`;
      const resp = await fetch(apiUrl("api/export-apkg"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deckIds: rootIds, exportName }) });
      if (!resp.ok) { const err = await resp.json().catch(() => ({})); throw new Error(err.error ?? "Export failed."); }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement("a"), { href: url, download: `${exportName.replace(/[^a-z0-9_\-]/gi, "_")}.apkg` });
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      toast({ title: "Library exported", description: `Downloaded ${exportName}.apkg` });
    } catch (err) {
      toast({ title: "Export failed", description: err instanceof Error ? err.message : "Something went wrong.", variant: "destructive" });
    } finally { setExportingApkgAll(false); }
  };

  const handleExportAllJson = async () => {
    setExportingAll(true);
    try {
      const resp = await fetch(apiUrl("api/export-all-json"));
      if (!resp.ok) { const err = await resp.json().catch(() => ({})); throw new Error(err.error ?? "Export failed."); }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const stamp = new Date().toISOString().slice(0, 10);
      const a = Object.assign(document.createElement("a"), { href: url, download: `ankigen-library-${stamp}.ankigen.json` });
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      toast({ title: "Library exported", description: "All topics, MCQs & page numbers in one file." });
    } catch (err) {
      toast({ title: "Export failed", description: err instanceof Error ? err.message : "Something went wrong.", variant: "destructive" });
    } finally { setExportingAll(false); }
  };

  const handleImportJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      let parsed: unknown;
      try { parsed = JSON.parse(text); } catch { throw new Error("That file isn't valid JSON."); }
      const resp = await fetch(apiUrl("api/import-deck-json"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed) });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error ?? "Import failed.");
      queryClient.invalidateQueries({ queryKey: getListDecksQueryKey() });
      toast({ title: "Deck imported", description: `"${data.importedName}" added — ${data.deckCount} deck${data.deckCount !== 1 ? "s" : ""}, ${data.cardCount} card${data.cardCount !== 1 ? "s" : ""}.` });
    } catch (err) {
      toast({ title: "Import failed", description: err instanceof Error ? err.message : "Something went wrong.", variant: "destructive" });
    } finally { setImporting(false); }
  };

  const allDecksCount = (decks as DeckWithParent[])?.length ?? 0;

  const sharedRowProps = {
    collapsedIds, toggleCollapse, deckChildrenMap,
    selectMode, selectedIds, toggleSelect,
    openDeckForm, handleDelete,
    folders,
    onMoveToFolder: moveDeckToFolder,
  };

  const SORT_LABELS: Record<SortOption, string> = {
    name: "Name (A→Z)",
    created: "Date created",
    cards: "Card count",
    lastStudied: "Last studied",
    mastery: "Mastery %",
  };

  return (
      <div className="relative space-y-6 animate-in fade-in duration-500 pb-32">
      <AmbientOrbs color="hsl(239 84% 68% / 0.10)" className="rounded-3xl" />

      <div className="relative flex items-start justify-between flex-wrap gap-4">
        <PageHeader
          icon={Library} iconColor="#818cf8" iconGlow="hsl(239 84% 68% / 0.5)"
          gradient="from-indigo-400 via-violet-400 to-purple-500"
          title="Library"
          subtitle={isLoading ? "Loading…"
            : allDecksCount === 0 ? "Your topics and flashcard decks will appear here."
            : `${allDecksCount} deck${allDecksCount !== 1 ? "s" : ""} · ${totalCards} card${totalCards !== 1 ? "s" : ""} total`}
        />
        <div className="flex items-center gap-2">
          {!selectMode ? (
            <>
              {(allDecksCount > 0) && (
                <Button
                  variant={showFoldersSidebar ? "secondary" : "outline"}
                  size="icon"
                  className="h-9 w-9"
                  title={showFoldersSidebar ? "Hide folders" : "Show folders"}
                  onClick={() => setShowFoldersSidebar(v => !v)}
                >
                  <PanelLeft className="h-4 w-4" />
                </Button>
              )}
              {((decks as DeckWithParent[])?.length ?? 0) > 0 && (
                <Button variant="outline" className="gap-2" onClick={() => setSelectMode(true)}>
                  <CheckSquare className="h-4 w-4" /> Select
                </Button>
              )}
              <DropdownMenu open={transferOpen} onOpenChange={setTransferOpen}>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="gap-2 relative overflow-hidden group" disabled={importing || exportingAll || exportingApkgAll}>
                    <motion.span aria-hidden className="absolute inset-0 bg-gradient-to-r from-primary/0 via-primary/10 to-primary/0"
                      initial={{ x: "-120%" }} animate={transferOpen ? { x: "120%" } : { x: "-120%" }} transition={{ duration: 0.9, ease: "easeOut" }} />
                    <motion.span className="relative inline-flex items-center"
                      animate={importing || exportingAll || exportingApkgAll ? { rotate: [0, -8, 8, 0], y: [0, -2, 0, 0] } : transferOpen ? { y: -2, scale: 1.08 } : { y: 0, scale: 1 }}
                      transition={importing || exportingAll || exportingApkgAll ? { duration: 1, repeat: Infinity, ease: "easeInOut" } : { type: "spring", stiffness: 320, damping: 18 }}>
                      <Upload className="h-4 w-4" />
                    </motion.span>
                    <span className="relative">Transfer</span>
                    <motion.span className="relative" animate={{ rotate: transferOpen ? 180 : 0 }} transition={{ type: "spring", stiffness: 320, damping: 22 }}>
                      <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                    </motion.span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-72 p-1.5">
                  <AnimatePresence>
                    {transferOpen && (
                      <motion.div key="transfer-items" initial="hidden" animate="visible"
                        variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.05, delayChildren: 0.04 } } }}>
                        <motion.div variants={{ hidden: { opacity: 0, x: -10 }, visible: { opacity: 1, x: 0 } }} transition={{ type: "spring", stiffness: 400, damping: 28 }}>
                          <div className="px-2 pt-1 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Bring in</div>
                          <DropdownMenuItem className="gap-3 cursor-pointer rounded-md py-2.5 group/item focus:bg-primary/5" onClick={() => importInputRef.current?.click()}>
                            <motion.span className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0" whileHover={{ y: -3, scale: 1.06 }} transition={{ type: "spring", stiffness: 320, damping: 18 }}>
                              <Upload className="h-4 w-4" />
                            </motion.span>
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium">{importing ? "Importing…" : "Import deck file"}</div>
                              <div className="text-xs text-muted-foreground truncate">Upload a .ankigen.json backup</div>
                            </div>
                          </DropdownMenuItem>
                        </motion.div>
                        <DropdownMenuSeparator />
                        <motion.div variants={{ hidden: { opacity: 0, x: -10 }, visible: { opacity: 1, x: 0 } }} transition={{ type: "spring", stiffness: 400, damping: 28 }}>
                          <div className="px-2 pt-1 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Send out</div>
                          <DropdownMenuItem className="gap-3 cursor-pointer rounded-md py-2.5 group/item focus:bg-emerald-500/5" onClick={handleExportLibraryApkg} disabled={exportingApkgAll || ((decks as DeckWithParent[])?.length ?? 0) === 0}>
                            <motion.span className="h-9 w-9 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0" whileHover={{ y: 3, scale: 1.06 }}
                              animate={exportingApkgAll ? { rotate: [0, 360] } : {}} transition={exportingApkgAll ? { duration: 1.2, repeat: Infinity, ease: "linear" } : { type: "spring", stiffness: 320, damping: 18 }}>
                              <Package className="h-4 w-4" />
                            </motion.span>
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium">{exportingApkgAll ? "Building .apkg…" : "Export library as .apkg"}</div>
                              <div className="text-xs text-muted-foreground truncate">One Anki package — opens in Anki / AnkiMobile</div>
                            </div>
                          </DropdownMenuItem>
                        </motion.div>
                        <motion.div variants={{ hidden: { opacity: 0, x: -10 }, visible: { opacity: 1, x: 0 } }} transition={{ type: "spring", stiffness: 400, damping: 28 }}>
                          <DropdownMenuItem className="gap-3 cursor-pointer rounded-md py-2.5 group/item focus:bg-blue-500/5" onClick={handleExportAllJson} disabled={exportingAll || ((decks as DeckWithParent[])?.length ?? 0) === 0}>
                            <motion.span className="h-9 w-9 rounded-lg bg-blue-500/10 text-blue-600 flex items-center justify-center shrink-0" whileHover={{ y: 3, scale: 1.06 }}
                              animate={exportingAll ? { y: [0, 4, 0] } : {}} transition={exportingAll ? { duration: 0.9, repeat: Infinity, ease: "easeInOut" } : { type: "spring", stiffness: 320, damping: 18 }}>
                              <Download className="h-4 w-4" />
                            </motion.span>
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium">{exportingAll ? "Exporting…" : "Backup library as JSON"}</div>
                              <div className="text-xs text-muted-foreground truncate">All topics, MCQs &amp; page numbers in one file</div>
                            </div>
                          </DropdownMenuItem>
                        </motion.div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </DropdownMenuContent>
              </DropdownMenu>
              <input ref={importInputRef} type="file" accept=".json,application/json" className="hidden" onChange={handleImportJson} />
              <Link href="/history">
                <Button variant="ghost" size="icon" title="Generation history"><HistoryIcon className="h-4 w-4" /></Button>
              </Link>
              <Button variant="outline" className="gap-2" onClick={() => openDeckForm({ type: "new-topic" })}>
                <FolderOpen className="h-4 w-4" /> New Topic
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button className="gap-2"><Plus className="h-4 w-4" /> New <ChevronDown className="h-3.5 w-3.5 ml-0.5 opacity-70" /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                  <DropdownMenuItem className="gap-2.5 cursor-pointer" onClick={() => openGenerateSheet("deck")}>
                    <Sparkles className="h-4 w-4 text-primary" />
                    <div><div className="text-sm font-medium">Generate Deck with AI</div><div className="text-xs text-muted-foreground">Flashcards from files or text</div></div>
                  </DropdownMenuItem>
                  <DropdownMenuItem className="gap-2.5 cursor-pointer" onClick={() => openGenerateSheet("qbank")}>
                    <Stethoscope className="h-4 w-4 text-violet-500" />
                    <div><div className="text-sm font-medium">Generate Question Bank</div><div className="text-xs text-muted-foreground">UWorld-style MCQs only</div></div>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="gap-2.5 cursor-pointer" onClick={() => openDeckForm({ type: "new-subdeck" })}>
                    <FileText className="h-4 w-4 text-blue-500" />
                    <div><div className="text-sm font-medium">Empty Sub-Topic</div><div className="text-xs text-muted-foreground">Flashcard sub-topic inside a main topic</div></div>
                  </DropdownMenuItem>
                  <DropdownMenuItem className="gap-2.5 cursor-pointer" onClick={() => openDeckForm({ type: "new-topic" })}>
                    <FolderOpen className="h-4 w-4 text-primary" />
                    <div><div className="text-sm font-medium">New Main Topic</div><div className="text-xs text-muted-foreground">With optional sub-topics</div></div>
                  </DropdownMenuItem>
                  <DropdownMenuItem className="gap-2.5 cursor-pointer" onClick={() => openDeckForm({ type: "new-qbank-topic" })}>
                    <FolderOpen className="h-4 w-4 text-violet-600" />
                    <div><div className="text-sm font-medium">New QBank Topic</div><div className="text-xs text-muted-foreground">Organise question banks</div></div>
                  </DropdownMenuItem>
                  <DropdownMenuItem className="gap-2.5 cursor-pointer" onClick={() => openDeckForm({ type: "new-qbank" })}>
                    <Stethoscope className="h-4 w-4 text-violet-600" />
                    <div><div className="text-sm font-medium">New Question Bank</div><div className="text-xs text-muted-foreground">Empty MCQ bank inside a topic</div></div>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={toggleSelectAll} className="text-muted-foreground">
                {selectedIds.size === allSelectableIds.length ? "Deselect all" : "Select all"}
              </Button>
              <Button variant="ghost" size="icon" onClick={exitSelectMode} className="text-muted-foreground"><X className="h-4 w-4" /></Button>
            </>
          )}
        </div>
      </div>

      {allDecksCount > 0 && libraryTab === "decks" && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Topics",     value: rootFlashcardDecks.length, icon: FolderOpen, hex: "#818cf8", glow: "129,140,248", bg: "bg-indigo-500/10" },
            { label: "Sub-topics", value: flashcardChildrenCount,    icon: FileText,   hex: "#60a5fa", glow: "96,165,250",  bg: "bg-blue-500/10"  },
            { label: "Total cards",value: flashcardTotalCards,       icon: Layers,     hex: "#818cf8", glow: "129,140,248", bg: "bg-indigo-500/10" },
          ].map(({ label, value, icon: Icon, hex, glow, bg }, idx) => (
            <motion.div
              key={label}
              className="rounded-xl border bg-card/70 backdrop-blur-sm shadow-sm overflow-hidden relative"
              style={{ boxShadow: `inset 0 0 0 1px rgba(${glow},0.14)` }}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.07, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            >
              <motion.div aria-hidden className="absolute inset-0 pointer-events-none"
                style={{ background: "linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.11) 50%, transparent 70%)" }}
                initial={{ x: "-120%" }} animate={{ x: "160%" }}
                transition={{ delay: 0.35 + idx * 0.1, duration: 0.65, ease: "easeOut" }}
              />
              <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(circle at 15% 50%, rgba(${glow},0.10) 0%, transparent 65%)` }} />
              <div className="p-3.5 relative">
                <div className={`h-7 w-7 rounded-lg ${bg} flex items-center justify-center mb-2`} style={{ boxShadow: `0 0 10px rgba(${glow},0.22)` }}>
                  <Icon className="h-3.5 w-3.5" style={{ color: hex }} />
                </div>
                <div className="text-2xl font-serif font-bold text-foreground">{value}</div>
                <div className="text-[11px] text-muted-foreground font-medium mt-0.5 uppercase tracking-wider">{label}</div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
      {(qbanks?.length ?? 0) > 0 && libraryTab === "qbanks" && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "QBank Topics",   value: rootQbankDecks.length, icon: FolderOpen,   hex: "#a78bfa", glow: "167,139,250", bg: "bg-violet-500/10" },
            { label: "Question Banks", value: qbankChildrenCount,    icon: Stethoscope,  hex: "#a78bfa", glow: "167,139,250", bg: "bg-violet-500/10" },
            { label: "Total MCQs",     value: qbankTotalMcqs,        icon: Layers,       hex: "#c084fc", glow: "192,132,252", bg: "bg-purple-500/10" },
          ].map(({ label, value, icon: Icon, hex, glow, bg }, idx) => (
            <motion.div
              key={label}
              className="rounded-xl border bg-card/70 backdrop-blur-sm shadow-sm overflow-hidden relative"
              style={{ boxShadow: `inset 0 0 0 1px rgba(${glow},0.16)` }}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.07, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            >
              <motion.div aria-hidden className="absolute inset-0 pointer-events-none"
                style={{ background: "linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.11) 50%, transparent 70%)" }}
                initial={{ x: "-120%" }} animate={{ x: "160%" }}
                transition={{ delay: 0.35 + idx * 0.1, duration: 0.65, ease: "easeOut" }}
              />
              <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(circle at 15% 50%, rgba(${glow},0.10) 0%, transparent 65%)` }} />
              <div className="p-3.5 relative">
                <div className={`h-7 w-7 rounded-lg ${bg} flex items-center justify-center mb-2`} style={{ boxShadow: `0 0 10px rgba(${glow},0.22)` }}>
                  <Icon className="h-3.5 w-3.5" style={{ color: hex }} />
                </div>
                <div className="text-2xl font-serif font-bold text-foreground">{value}</div>
                <div className="text-[11px] text-muted-foreground font-medium mt-0.5 uppercase tracking-wider">{label}</div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {(allDecksCount > 0 || (qbanks?.length ?? 0) > 0) && (
        <div className="space-y-2.5">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search decks, cards, and tags…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-10 pr-10 h-11 rounded-xl bg-card/60 backdrop-blur-sm border-border/60 shadow-sm focus-visible:ring-primary/30 focus-visible:border-primary/40"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted transition-colors">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            {libraryTab === "decks" && (
              <Select value={sortBy} onValueChange={v => setSortBy(v as SortOption)}>
                <SelectTrigger className="h-11 w-auto min-w-[9rem] rounded-xl bg-card/60 backdrop-blur-sm border-border/60 shadow-sm gap-1.5">
                  <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(SORT_LABELS) as [SortOption, string][]).map(([val, label]) => (
                    <SelectItem key={val} value={val}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {libraryTab === "decks" && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <SlidersHorizontal className="h-3 w-3" /> Type:
              </span>
              {([
                { key: "all", label: "All" },
                { key: "flashcards", label: "Flashcards" },
                { key: "qbanks", label: "QBanks" },
              ] as const).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setTypeFilter(key)}
                  className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full border transition-all ${
                    typeFilter === key
                      ? "bg-foreground text-background border-foreground"
                      : key === "flashcards"
                      ? "bg-card/60 text-indigo-700 dark:text-indigo-300 border-indigo-500/30 hover:bg-indigo-500/10"
                      : "bg-card/60 text-violet-700 dark:text-violet-300 border-violet-500/30 hover:bg-violet-500/10"
                  }`}
                >
                  {label}
                </button>
              ))}
              <div className="mx-1 h-4 w-px bg-border" />
              {allTags.length > 0 && (
                <>
                  <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    <Tag className="h-3 w-3" /> Tags:
                  </span>
                  <button
                    onClick={() => setActiveTagFilter(null)}
                    className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full border transition-all ${!activeTagFilter ? "bg-foreground text-background border-foreground" : "bg-card/60 text-muted-foreground border-border/60 hover:border-border"}`}
                  >
                    All
                  </button>
                  {allTags.map(tag => {
                    const c = getTagColor(tag);
                    const active = activeTagFilter === tag;
                    return (
                      <button key={tag}
                        onClick={() => setActiveTagFilter(active ? null : tag)}
                        className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full border transition-all ${active ? `${c.bg} ${c.text} ${c.border} ring-1 ring-offset-1 ring-current` : `bg-card/60 ${c.text} ${c.border} hover:${c.bg}`}`}>
                        <Tag className="h-2.5 w-2.5 shrink-0" />{tag}
                      </button>
                    );
                  })}
                </>
              )}
              <div className="ml-2 flex items-center gap-1">
                {([
                  { key: "all", label: "All" },
                  { key: "mastered", label: "Mastered" },
                  { key: "needs-review", label: "Needs review" },
                ] as const).map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setMasteryFilter(key)}
                    className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full border transition-all ${
                      masteryFilter === key
                        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                        : "bg-card/60 text-muted-foreground border-border/60 hover:border-border"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Content: optional folders sidebar + deck list */}
      {(isLoading || isLoadingQbanks) ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
      ) : rootDecks.length === 0 && (qbanks?.length ?? 0) === 0 ? (
        <div className="text-center py-20 px-6 border-2 border-dashed border-border/60 rounded-2xl bg-gradient-to-b from-card/60 to-muted/20">
          <div className="mx-auto h-16 w-16 rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/20 flex items-center justify-center mb-5 shadow-sm">
            <BookOpen className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-xl font-serif font-semibold mb-1.5">Your library is empty</h3>
          <p className="text-muted-foreground text-sm mb-6 max-w-sm mx-auto">Start by creating a main topic, generating AI flashcards, or building a question bank from your study material.</p>
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <Button variant="outline" className="gap-2 h-10" onClick={() => openDeckForm({ type: "new-topic" })}><FolderOpen className="h-4 w-4" /> New Topic</Button>
            <Button className="gap-2 h-10 shadow-sm" onClick={() => openGenerateSheet("deck")}><Sparkles className="h-4 w-4" /> Generate Deck</Button>
            <Button variant="secondary" className="gap-2 h-10 shadow-sm" onClick={() => openGenerateSheet("qbank")}><Stethoscope className="h-4 w-4" /> Generate Question Bank</Button>
          </div>
        </div>
      ) : (
        <div className={showFoldersSidebar ? "flex gap-4 items-start" : ""}>

          <AnimatePresence>
            {showFoldersSidebar && (
              <motion.aside
                key="folders-sidebar"
                initial={{ opacity: 0, x: -16, width: 0 }}
                animate={{ opacity: 1, x: 0, width: 220 }}
                exit={{ opacity: 0, x: -16, width: 0 }}
                transition={{ type: "spring", stiffness: 340, damping: 30 }}
                className="shrink-0 overflow-hidden"
                style={{ minWidth: 0 }}
              >
                <div className="rounded-xl border border-border/60 bg-card/60 backdrop-blur-sm shadow-sm overflow-hidden" style={{ width: 220 }}>
                  <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/50">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Folder className="h-3.5 w-3.5 text-amber-500" /> Folders
                    </span>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground"
                      onClick={() => { setFolderEditId(null); setFolderName(""); setFolderDialogOpen(true); }}>
                      <FolderPlus className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  <div className="px-2 py-1.5 space-y-0.5">
                    <button
                      onClick={() => setActiveFolderFilter(null)}
                      className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm transition-colors ${!activeFolderFilter ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"}`}
                    >
                      <Layers className="h-3.5 w-3.5 shrink-0" />
                      <span className="flex-1 truncate text-left">All decks</span>
                      <span className="text-[10px] opacity-60 shrink-0">{rootFlashcardDecks.length}</span>
                    </button>

                    {folders.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground px-2.5 py-3 text-center leading-relaxed">
                        Create a folder to organise your decks
                      </p>
                    ) : (
                      folders.map(folder => {
                        const count = rootFlashcardDecks.filter(d => folder.deckIds.includes(d.id)).length;
                        const active = activeFolderFilter === folder.id;
                        return (
                          <div key={folder.id} className={`group flex items-center gap-1 rounded-lg transition-colors ${active ? "bg-amber-500/10" : "hover:bg-muted/50"}`}>
                            <button
                              className={`flex-1 flex items-center gap-2 px-2.5 py-2 text-sm ${active ? "text-amber-700 dark:text-amber-400 font-medium" : "text-muted-foreground hover:text-foreground"}`}
                              onClick={() => setActiveFolderFilter(active ? null : folder.id)}
                            >
                              <Folder className={`h-3.5 w-3.5 shrink-0 ${active ? "text-amber-500" : ""}`} />
                              <span className="flex-1 truncate text-left">{folder.name}</span>
                              <span className="text-[10px] opacity-60 shrink-0">{count}</span>
                            </button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground mr-1">
                                  <MoreHorizontal className="h-3 w-3" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-36">
                                <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => { setFolderEditId(folder.id); setFolderName(folder.name); setFolderDialogOpen(true); }}>
                                  <Pencil className="h-3.5 w-3.5" /> Rename
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="gap-2 cursor-pointer text-destructive focus:text-destructive" onClick={() => deleteFolder(folder.id)}>
                                  <Trash2 className="h-3.5 w-3.5" /> Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </motion.aside>
            )}
          </AnimatePresence>

          <div className="flex-1 min-w-0">
            <Tabs value={libraryTab} onValueChange={(v) => setLibraryTab(v as "decks" | "qbanks")} className="w-full">
              <TabsList className="w-full sm:w-auto h-10 p-1 rounded-xl bg-muted/40 border border-border/50 backdrop-blur-sm">
                <TabsTrigger value="decks" className="flex-1 sm:flex-none gap-1.5 h-8 px-4 rounded-lg text-sm font-medium transition-all duration-200 data-[state=active]:bg-indigo-500/15 data-[state=active]:text-indigo-400 data-[state=active]:shadow-none data-[state=active]:[box-shadow:0_0_0_1px_hsl(239_84%_68%_/_0.3),inset_0_0_12px_hsl(239_84%_68%_/_0.08)]">
                  <BookOpen className="h-3.5 w-3.5" /> Decks <span className="ml-1 text-xs opacity-60">{rootFlashcardDecks.length}</span>
                </TabsTrigger>
                <TabsTrigger value="qbanks" className="flex-1 sm:flex-none gap-1.5 h-8 px-4 rounded-lg text-sm font-medium transition-all duration-200 data-[state=active]:bg-violet-500/15 data-[state=active]:text-violet-400 data-[state=active]:shadow-none data-[state=active]:[box-shadow:0_0_0_1px_hsl(262_84%_68%_/_0.3),inset_0_0_12px_hsl(262_84%_68%_/_0.08)]">
                  <Stethoscope className="h-3.5 w-3.5" /> Question Banks <span className="ml-1 text-xs opacity-60">{rootQbankDecks.length}</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="decks" className="mt-4">
                {filteredFlashcards.length === 0 ? (
                  <div className="text-center py-16 px-6 border-2 border-dashed border-border/60 rounded-2xl bg-card/60">
                    <div className="mx-auto h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4"><BookOpen className="h-5 w-5 text-primary" /></div>
                    <p className="font-medium">No flashcard decks yet</p>
                    <p className="text-sm text-muted-foreground mt-1 mb-4">Generate a deck of flashcards from your notes or PDFs.</p>
                    <Button className="gap-2" onClick={() => openGenerateSheet("deck")}><Sparkles className="h-4 w-4" /> Generate Deck</Button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm text-muted-foreground">
                        {filteredFlashcards.length !== rootFlashcardDecks.length
                          ? `${filteredFlashcards.length} of ${rootFlashcardDecks.length} topic${rootFlashcardDecks.length !== 1 ? "s" : ""}`
                          : `${rootFlashcardDecks.length} main topic${rootFlashcardDecks.length !== 1 ? "s" : ""}${flashcardChildrenCount > 0 ? ` · ${flashcardChildrenCount} sub-topic${flashcardChildrenCount !== 1 ? "s" : ""}` : ""}`}
                      </p>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" className="gap-1.5 h-8 text-primary border-primary/30 hover:bg-primary/5 hover:border-primary/50" onClick={() => openDeckForm({ type: "new-topic" })}>
                          <FolderOpen className="h-3.5 w-3.5" /> New Topic
                        </Button>
                        <Button size="sm" className="gap-1.5 h-8" onClick={() => openGenerateSheet("deck")}><Sparkles className="h-3.5 w-3.5" /> Generate</Button>
                      </div>
                    </div>
                    <div className="space-y-3">
                      {filteredFlashcards.map((deck, idx) => (
                        <div key={deck.id} className="animate-in fade-in slide-in-from-bottom-2" style={{ animationDelay: `${Math.min(idx, 12) * 40}ms` }}>
                          <DeckRow
                            deck={deck} depth={0}
                            {...sharedRowProps}
                            deckTags={deckTags[deck.id] ?? []}
                            onEditTags={() => { setTagEditDeckId(deck.id); setTagInput(""); }}
                            activeFolderForDeck={getDeckFolder(deck.id)}
                            onMoveToFolder={(folderId) => moveDeckToFolder(deck.id, folderId)}
                          />
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </TabsContent>

              <TabsContent value="qbanks" className="mt-4">
                {filteredQbanks.length === 0 ? (
                  <div className="text-center py-16 px-6 border-2 border-dashed border-violet-500/20 rounded-2xl bg-violet-500/5">
                    <div className="mx-auto h-12 w-12 rounded-xl bg-violet-500/10 flex items-center justify-center mb-4"><Stethoscope className="h-5 w-5 text-violet-500" /></div>
                    <p className="font-medium">No question banks yet</p>
                    <p className="text-sm text-muted-foreground mt-1 mb-4">Create a main topic to organise question banks, or generate MCQs directly.</p>
                    <div className="flex items-center justify-center gap-2 flex-wrap">
                      <Button variant="outline" className="gap-2 border-violet-500/30 text-violet-600 hover:bg-violet-500/5" onClick={() => openDeckForm({ type: "new-qbank-topic" })}><FolderOpen className="h-4 w-4" /> New Topic</Button>
                      <Button variant="outline" className="gap-2 border-violet-500/30 text-violet-600 hover:bg-violet-500/5" onClick={() => openDeckForm({ type: "new-qbank" })}><Stethoscope className="h-4 w-4" /> New Question Bank</Button>
                      <Button className="gap-2 bg-violet-600 hover:bg-violet-700 text-white" onClick={() => openGenerateSheet("qbank")}><Stethoscope className="h-4 w-4" /> Generate Question Bank</Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm text-muted-foreground">
                        {rootQbankDecks.length} topic{rootQbankDecks.length !== 1 ? "s" : ""}{qbankChildrenCount > 0 ? ` · ${qbankChildrenCount} question bank${qbankChildrenCount !== 1 ? "s" : ""}` : ""}
                      </p>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" className="gap-1.5 h-8 text-violet-600 border-violet-500/30 hover:bg-violet-500/5 hover:border-violet-500/50" onClick={() => openDeckForm({ type: "new-qbank-topic" })}><FolderOpen className="h-3.5 w-3.5" /> New Topic</Button>
                        <Button variant="outline" size="sm" className="gap-1.5 h-8 text-violet-600 border-violet-500/30 hover:bg-violet-500/5 hover:border-violet-500/50" onClick={() => openDeckForm({ type: "new-qbank" })}><Stethoscope className="h-3.5 w-3.5" /> New Question Bank</Button>
                        <Button size="sm" className="gap-1.5 h-8 bg-violet-600 hover:bg-violet-700 text-white" onClick={() => openGenerateSheet("qbank")}><Stethoscope className="h-3.5 w-3.5" /> Generate</Button>
                      </div>
                    </div>
                    {filteredQbanks.length === 0 ? (
                      <div className="text-center py-16 px-6 border-2 border-dashed border-border/60 rounded-2xl bg-card/60">
                        <p className="font-medium">No question banks match "{search}"</p>
                        <Button variant="ghost" className="mt-3" onClick={() => setSearch("")}>Clear search</Button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {filteredQbanks.map((qb, idx) => (
                          <div key={qb.id} className="animate-in fade-in slide-in-from-bottom-2" style={{ animationDelay: `${Math.min(idx, 12) * 40}ms` }}>
                            <QbankRow qbank={qb} depth={0} collapsedIds={collapsedIds} toggleCollapse={toggleCollapse}
                              qbankChildrenMap={qbankChildrenMap} openDeckForm={openDeckForm} handleDeleteQbank={handleDeleteQbank} />
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>
      )}

      <GenerateSheet
        open={generateSheetOpen} mode={generateMode}
        onOpenChange={(o) => { setGenerateSheetOpen(o); if (!o) { setSharedText(undefined); setSharedTitle(undefined); } }}
        onDone={() => setLibraryTab(generateMode === "qbank" ? "qbanks" : "decks")}
        prefilledText={sharedText} prefilledDeckName={sharedTitle}
      />
      <DeckFormSheet open={deckFormOpen} onOpenChange={setDeckFormOpen} mode={deckFormMode} />

      {selectMode && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 duration-200">
          <div className="flex items-center gap-2 bg-card/95 backdrop-blur-md border border-border shadow-2xl rounded-2xl px-4 py-2.5">
            <div className="flex items-center gap-2 pr-2">
              <div className={`h-7 w-7 rounded-full flex items-center justify-center ${selectedIds.size > 0 ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
                <CheckSquare className="h-3.5 w-3.5" />
              </div>
              <span className="text-sm font-medium whitespace-nowrap">
                {selectedIds.size === 0 ? "Select decks" : `${selectedIds.size} selected`}
              </span>
            </div>
            <div className="h-5 w-px bg-border" />
            {selectedIds.size > 0 && (
              <Button variant="outline" size="sm" className="gap-1.5 h-8 text-primary border-primary/30 hover:bg-primary/5"
                onClick={() => { setBulkTagInput(""); setBulkTagOpen(true); }}>
                <Tag className="h-3.5 w-3.5" /> Add tag
              </Button>
            )}
            <Button variant="outline" onClick={openMergeDialog} disabled={selectedIds.size < 2 || merging} className="gap-1.5 h-8">
              <Combine className="h-3.5 w-3.5" /> Merge
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 h-8" disabled={selectedIds.size === 0 || folders.length === 0}>
                  <FolderOutput className="h-3.5 w-3.5" /> Move to folder
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="w-44">
                <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => { for (const id of selectedIds) moveDeckToFolder(id, null); }}>
                  <FolderX className="h-3.5 w-3.5" /> No folder
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {folders.map(folder => (
                  <DropdownMenuItem key={folder.id} className="gap-2 cursor-pointer" onClick={() => { for (const id of selectedIds) moveDeckToFolder(id, folder.id); }}>
                    <Folder className="h-3.5 w-3.5 text-amber-500" />
                    <span className="truncate flex-1">{folder.name}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button onClick={handleExportApkg} disabled={selectedIds.size === 0 || exporting} className="gap-1.5 h-8 shadow-sm">
              <Download className="h-3.5 w-3.5" />
              {exporting ? "Exporting…" : "Export"}
            </Button>
            {selectedIds.size > 0 && (
              <Button variant="destructive" size="sm" className="gap-1.5 h-8" onClick={handleBulkDelete} disabled={bulkDeleting}>
                <Trash2 className="h-3.5 w-3.5" />
                {bulkDeleting ? "Deleting…" : "Delete"}
              </Button>
            )}
          </div>
        </div>
      )}

      <Dialog open={tagEditDeckId !== null} onOpenChange={open => { if (!open) setTagEditDeckId(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Tag className="h-4 w-4 text-primary" /> Edit Tags</DialogTitle>
            <DialogDescription>
              {tagEditDeckId !== null && (decks as DeckWithParent[] | undefined)?.find(d => d.id === tagEditDeckId)?.name}
            </DialogDescription>
          </DialogHeader>
          {tagEditDeckId !== null && (
            <div className="space-y-4 py-1">
              <div className="flex items-center gap-1.5 flex-wrap min-h-[2rem]">
                {(deckTags[tagEditDeckId] ?? []).length === 0 ? (
                  <p className="text-xs text-muted-foreground">No tags yet. Add one below.</p>
                ) : (
                  (deckTags[tagEditDeckId] ?? []).map(tag => {
                    const c = getTagColor(tag);
                    return (
                      <span key={tag} className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full border ${c.bg} ${c.text} ${c.border}`}>
                        {tag}
                        <button onClick={() => removeTag(tagEditDeckId, tag)} className="ml-0.5 hover:opacity-70 transition-opacity"><X className="h-2.5 w-2.5" /></button>
                      </span>
                    );
                  })
                )}
              </div>
              <div className="flex gap-2">
                <Input
                  ref={tagInputRef}
                  placeholder="e.g. Cardiology, Pharmacology…"
                  value={tagInput}
                  onChange={e => setTagInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addTag(tagEditDeckId, tagInput); } }}
                  className="flex-1 h-9 text-sm"
                />
                <Button size="sm" className="h-9" onClick={() => addTag(tagEditDeckId, tagInput)} disabled={!tagInput.trim()}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
              {allTags.length > 0 && (
                <div>
                  <p className="text-[11px] text-muted-foreground mb-1.5 font-medium uppercase tracking-wider">Quick add</p>
                  <div className="flex gap-1.5 flex-wrap">
                    {allTags.filter(t => !(deckTags[tagEditDeckId] ?? []).includes(t)).slice(0, 10).map(tag => {
                      const c = getTagColor(tag);
                      return (
                        <button key={tag} onClick={() => addTag(tagEditDeckId, tag)}
                          className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full border ${c.bg} ${c.text} ${c.border} opacity-60 hover:opacity-100 transition-opacity`}>
                          <Plus className="h-2.5 w-2.5" />{tag}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTagEditDeckId(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkTagOpen} onOpenChange={setBulkTagOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Tag className="h-4 w-4 text-primary" /> Add Tag to {selectedIds.size} Deck{selectedIds.size !== 1 ? "s" : ""}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <Input
              placeholder="Tag name, e.g. Cardiology"
              value={bulkTagInput}
              onChange={e => setBulkTagInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleBulkAddTag(); }}
              autoFocus
              className="h-9 text-sm"
            />
            {allTags.length > 0 && (
              <div className="flex gap-1.5 flex-wrap">
                {allTags.map(tag => {
                  const c = getTagColor(tag);
                  return (
                    <button key={tag} onClick={() => setBulkTagInput(tag)}
                      className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full border ${c.bg} ${c.text} ${c.border} hover:opacity-80 transition-opacity`}>
                      {tag}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBulkTagOpen(false)}>Cancel</Button>
            <Button onClick={handleBulkAddTag} disabled={!bulkTagInput.trim()}>Add tag</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderPlus className="h-4 w-4 text-amber-500" />
              {folderEditId ? "Rename Folder" : "New Folder"}
            </DialogTitle>
          </DialogHeader>
          <div className="py-1">
            <Input
              placeholder="e.g. Year 1, Anatomy, Exam Prep…"
              value={folderName}
              onChange={e => setFolderName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") folderEditId ? renameFolder() : createFolder(); }}
              autoFocus
              className="h-9 text-sm"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setFolderDialogOpen(false); setFolderEditId(null); setFolderName(""); }}>Cancel</Button>
            <Button onClick={folderEditId ? renameFolder : createFolder} disabled={!folderName.trim()}>
              {folderEditId ? "Rename" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={mergeOpen} onOpenChange={setMergeOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Combine className="h-5 w-5 text-primary" />
              Merge {selectedIds.size} deck{selectedIds.size !== 1 ? "s" : ""}
            </DialogTitle>
            <DialogDescription>Combines every card from the selected topics (and their sub-topics) into one new topic.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="mergeName">New deck name</Label>
              <Input id="mergeName" value={mergeName} onChange={e => setMergeName(e.target.value)} placeholder="e.g. Combined Study Deck" disabled={merging} />
            </div>
            <div className="rounded-lg border bg-muted/30 p-3 max-h-40 overflow-y-auto">
              <p className="text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">Sources</p>
              <ul className="text-sm space-y-1">
                {((decks as DeckWithParent[] | undefined) ?? []).filter(d => selectedIds.has(d.id)).map(d => (
                  <li key={d.id} className="flex items-center justify-between gap-2">
                    <span className="truncate">{d.name}</span>
                    <span className="text-xs text-muted-foreground shrink-0">{d.cardCount} card{d.cardCount !== 1 ? "s" : ""}</span>
                  </li>
                ))}
              </ul>
            </div>
            <label className="flex items-start gap-2.5 text-sm cursor-pointer rounded-lg border p-3 hover:bg-muted/30 transition-colors">
              <Checkbox checked={mergeDeleteOriginals} onCheckedChange={v => setMergeDeleteOriginals(v === true)} disabled={merging} className="mt-0.5" />
              <span>
                <span className="font-medium block">Delete original decks after merging</span>
                <span className="text-xs text-muted-foreground">Removes the source topics and any sub-topics they contain. Cannot be undone.</span>
              </span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMergeOpen(false)} disabled={merging}>Cancel</Button>
            <Button onClick={handleMerge} disabled={merging || !mergeName.trim()}>{merging ? "Merging…" : "Merge decks"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
