import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Star, ChevronUp, ChevronDown, ChevronsUpDown,
  Search, Download, RefreshCw, Shield,
} from "lucide-react";
import { apiUrl } from "@/lib/utils";
import { format, formatDistanceToNow } from "date-fns";

interface FeedbackEntry {
  id: number;
  type: string;
  rating: number | null;
  message: string;
  email: string | null;
  userId: string | null;
  page: string | null;
  createdAt: string;
}

type SortDir = "asc" | "desc";

const TYPE_CONFIG: Record<string, { label: string; emoji: string; color: string; bg: string }> = {
  bug:        { label: "Bug",        emoji: "🐛", color: "text-red-500",    bg: "bg-red-500/10 border-red-500/20"       },
  suggestion: { label: "Idea",       emoji: "💡", color: "text-blue-500",   bg: "bg-blue-500/10 border-blue-500/20"     },
  compliment: { label: "Compliment", emoji: "🙏", color: "text-green-500",  bg: "bg-green-500/10 border-green-500/20"   },
  general:    { label: "General",    emoji: "💬", color: "text-violet-500", bg: "bg-violet-500/10 border-violet-500/20" },
};

function StarRating({ rating }: { rating: number | null }) {
  if (!rating) return <span className="text-xs text-muted-foreground/30">—</span>;
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <Star key={n} style={{ width: 11, height: 11 }}
          fill={n <= rating ? "#f59e0b" : "transparent"}
          stroke={n <= rating ? "#f59e0b" : "currentColor"}
          strokeOpacity={n <= rating ? 1 : 0.2} />
      ))}
    </div>
  );
}

function SortIcon({ col, sortKey, sortDir }: { col: string; sortKey: string; sortDir: SortDir }) {
  if (col !== sortKey) return <ChevronsUpDown style={{ width: 11, height: 11, opacity: 0.3 }} />;
  return sortDir === "asc"
    ? <ChevronUp style={{ width: 11, height: 11 }} />
    : <ChevronDown style={{ width: 11, height: 11 }} />;
}

const COLS = [
  { key: "id",        label: "#",       cols: "2.5rem" },
  { key: "type",      label: "Type",    cols: "7.5rem" },
  { key: "rating",    label: "Rating",  cols: "6.5rem" },
  { key: "message",   label: "Message", cols: "1fr"    },
  { key: "email",     label: "Contact", cols: "10rem"  },
  { key: "page",      label: "Page",    cols: "9rem"   },
  { key: "createdAt", label: "Date",    cols: "9.5rem" },
];

const GRID = COLS.map(c => c.cols).join(" ");

export default function AdminFeedback() {
  const [entries, setEntries]     = useState<FeedbackEntry[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [sortKey, setSortKey]     = useState("createdAt");
  const [sortDir, setSortDir]     = useState<SortDir>("desc");
  const [filterType, setFilter]   = useState("all");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState<Set<number>>(new Set());

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiUrl("api/feedback"));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setEntries(await res.json());
    } catch (e: any) {
      setError(e.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const toggleExpand = (id: number) =>
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const stats = useMemo(() => {
    const total = entries.length;
    const rated = entries.filter(e => e.rating);
    const avg = rated.length
      ? (rated.reduce((s, e) => s + (e.rating ?? 0), 0) / rated.length).toFixed(1)
      : null;
    const byType: Record<string, number> = {};
    entries.forEach(e => { byType[e.type] = (byType[e.type] ?? 0) + 1; });
    return { total, avg, byType };
  }, [entries]);

  const filtered = useMemo(() => {
    let list = entries;
    if (filterType !== "all") list = list.filter(e => e.type === filterType);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(e =>
        e.message.toLowerCase().includes(q) ||
        (e.email ?? "").toLowerCase().includes(q) ||
        (e.page ?? "").toLowerCase().includes(q),
      );
    }
    return [...list].sort((a, b) => {
      const av = (a as any)[sortKey] ?? "";
      const bv = (b as any)[sortKey] ?? "";
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [entries, filterType, search, sortKey, sortDir]);

  const exportCsv = () => {
    const headers = ["ID", "Type", "Rating", "Message", "Email", "Page", "Date"];
    const rows = filtered.map(e => [
      e.id, e.type, e.rating ?? "",
      `"${e.message.replace(/"/g, '""')}"`,
      e.email ?? "", e.page ?? "", e.createdAt,
    ]);
    const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })),
      download: `feedback-${Date.now()}.csv`,
    });
    a.click();
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-6xl mx-auto px-4 py-6 md:px-8 md:py-10">

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0">
              <Shield className="text-violet-500" style={{ width: 18, height: 18 }} />
            </div>
            <div>
              <h1 className="font-bold text-lg leading-tight">Feedback Admin</h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                {stats.total} total · avg {stats.avg ? `${stats.avg} ★` : "no ratings yet"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} disabled={loading}
              className="h-8 px-3 rounded-lg border border-border/50 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors flex items-center gap-1.5 disabled:opacity-40">
              <RefreshCw style={{ width: 12, height: 12 }} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
            <button onClick={exportCsv} disabled={!filtered.length}
              className="h-8 px-3 rounded-lg border border-border/50 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors flex items-center gap-1.5 disabled:opacity-40">
              <Download style={{ width: 12, height: 12 }} />
              Export CSV
            </button>
          </div>
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-5">
          {[
            { label: "Total",       value: stats.total,                  color: "text-foreground"  },
            { label: "Avg Rating",  value: stats.avg ? `${stats.avg} ★` : "—", color: "text-amber-500"  },
            { label: "Bugs",        value: stats.byType.bug ?? 0,        color: "text-red-500"     },
            { label: "Ideas",       value: stats.byType.suggestion ?? 0, color: "text-blue-500"    },
            { label: "Compliments", value: stats.byType.compliment ?? 0, color: "text-green-500"   },
          ].map(s => (
            <div key={s.label} className="rounded-xl border border-border/40 bg-muted/20 px-3 py-2.5">
              <div className={`text-xl font-bold leading-tight ${s.color}`}>{s.value}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Filter + search bar */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <div className="flex flex-wrap gap-1 flex-1">
            {["all", "bug", "suggestion", "compliment", "general"].map(t => {
              const tc = TYPE_CONFIG[t];
              return (
                <button key={t} onClick={() => setFilter(t)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${
                    filterType === t
                      ? "bg-violet-500/10 border-violet-500/25 text-violet-500"
                      : "border-border/40 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  }`}>
                  {t === "all"
                    ? `All (${stats.total})`
                    : `${tc.emoji} ${tc.label} (${stats.byType[t] ?? 0})`}
                </button>
              );
            })}
          </div>
          <div className="relative">
            <Search style={{ width: 12, height: 12 }} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/40 pointer-events-none" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search…"
              className="h-7 pl-7 pr-3 rounded-lg border border-border/50 bg-muted/30 text-xs placeholder:text-muted-foreground/35 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500/30 transition-colors w-44" />
          </div>
        </div>

        {/* Table */}
        <div className="rounded-xl border border-border/50 overflow-hidden">

          {/* Column headers */}
          <div className="grid bg-muted/25 border-b border-border/40 px-3 gap-2"
            style={{ gridTemplateColumns: GRID }}>
            {COLS.map(col => (
              <button key={col.key} onClick={() => handleSort(col.key)}
                className="flex items-center gap-1 py-2.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors text-left">
                {col.label}
                <SortIcon col={col.key} sortKey={sortKey} sortDir={sortDir} />
              </button>
            ))}
          </div>

          {/* Rows */}
          {loading ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              <RefreshCw className="animate-spin mx-auto mb-2" style={{ width: 18, height: 18 }} />
              Loading…
            </div>
          ) : error ? (
            <div className="py-16 text-center text-sm text-destructive">{error}</div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">No entries found</div>
          ) : (
            <div className="divide-y divide-border/25">
              {filtered.map((entry, idx) => {
                const isExp = expanded.has(entry.id);
                const tc = TYPE_CONFIG[entry.type] ?? TYPE_CONFIG.general;
                const date = new Date(entry.createdAt);
                return (
                  <motion.div key={entry.id}
                    initial={{ opacity: 0, y: 3 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(idx * 0.012, 0.3), duration: 0.2 }}
                    className="grid items-start px-3 py-2.5 gap-2 hover:bg-muted/20 transition-colors cursor-pointer"
                    style={{ gridTemplateColumns: GRID }}
                    onClick={() => toggleExpand(entry.id)}>

                    <div className="text-[11px] text-muted-foreground/40 pt-0.5 tabular-nums">{entry.id}</div>

                    <div className="pt-0.5">
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold border ${tc.bg} ${tc.color}`}>
                        <span>{tc.emoji}</span>{tc.label}
                      </span>
                    </div>

                    <div className="pt-0.5"><StarRating rating={entry.rating} /></div>

                    <div className="pr-2 min-w-0">
                      <p className={`text-xs leading-relaxed text-foreground/80 break-words ${isExp ? "" : "line-clamp-2"}`}>
                        {entry.message}
                      </p>
                      {!isExp && entry.message.length > 120 && (
                        <span className="text-[10px] text-violet-500/60 mt-0.5 block">tap to expand</span>
                      )}
                    </div>

                    <div className="text-[11px] text-muted-foreground/65 truncate pt-0.5">
                      {entry.email
                        ? <span title={entry.email}>{entry.email}</span>
                        : <span className="opacity-25">—</span>}
                    </div>

                    <div className="text-[11px] text-muted-foreground/55 truncate pt-0.5"
                      title={entry.page ?? ""}>
                      {entry.page ?? <span className="opacity-25">—</span>}
                    </div>

                    <div className="text-[11px] text-muted-foreground/60 pt-0.5">
                      <div>{format(date, "MMM d, yyyy")}</div>
                      <div className="text-[10px] opacity-55 mt-0.5">
                        {formatDistanceToNow(date, { addSuffix: true })}
                      </div>
                    </div>

                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

        <p className="text-center text-[11px] text-muted-foreground/25 mt-5">
          Showing {filtered.length} of {stats.total} · AnkiGen Admin
        </p>
      </div>
    </div>
  );
}
