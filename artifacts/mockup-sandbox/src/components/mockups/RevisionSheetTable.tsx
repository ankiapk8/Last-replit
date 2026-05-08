import { useState, useMemo } from "react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { cn } from "@/lib/utils";
import { revisionSheetData, type RevisionRow } from "./data/fixtures";

type SortKey = "finding" | "significance" | "action";
type SortDir = "asc" | "desc";

export function RevisionSheetTable() {
  const [checkedRows, setCheckedRows] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [flipKey, setFlipKey] = useState(0);

  const toggleRow = (id: string) => {
    setCheckedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setFlipKey((k) => k + 1);
  };

  const sortedRows = useMemo(() => {
    if (!sortKey) return revisionSheetData;
    const sorted = [...revisionSheetData].sort((a, b) => {
      const aVal = a[sortKey].toLowerCase();
      const bVal = b[sortKey].toLowerCase();
      return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    });
    return sorted;
  }, [sortKey, sortDir]);

  const reviewedCount = checkedRows.size;
  const totalCount = revisionSheetData.length;
  const progressPercent = (reviewedCount / totalCount) * 100;

  const columns: { key: SortKey; label: string }[] = [
    { key: "finding", label: "Finding" },
    { key: "significance", label: "Significance" },
    { key: "action", label: "Action" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-green-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        {/* Title */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-1">
            Revision Sheet — Acute Myocardial Infarction
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Check off each row as you review. Track your progress below.
          </p>
        </motion.div>

        {/* Table Container */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg shadow-emerald-500/5 border border-emerald-100 dark:border-emerald-900/50 overflow-hidden">
          {/* Sticky Header */}
          <div
            className="sticky top-0 z-10 grid grid-cols-[auto_1fr_1fr_1fr] gap-0"
            style={{ backgroundColor: "#00A878" }}
          >
            <div className="px-4 py-3" /> {/* checkbox column */}
            {columns.map((col) => (
              <button
                key={col.key}
                onClick={() => handleSort(col.key)}
                className={cn(
                  "px-4 py-3 text-left text-sm font-semibold text-white transition-colors",
                  "hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50",
                  sortKey === col.key && "bg-white/10",
                )}
                aria-label={`Sort by ${col.label}`}
              >
                <LayoutGroup>
                  <motion.span
                    key={flipKey}
                    initial={{ rotateY: 90 }}
                    animate={{ rotateY: 0 }}
                    transition={{ duration: 0.3 }}
                    className="inline-flex items-center gap-1"
                  >
                    {col.label}
                    {sortKey === col.key && (
                      <span className="text-xs">{sortDir === "asc" ? "↑" : "↓"}</span>
                    )}
                  </motion.span>
                </LayoutGroup>
              </button>
            ))}
          </div>

          {/* Rows */}
          <div className="divide-y divide-emerald-50 dark:divide-gray-800">
            {sortedRows.map((row, index) => {
              const isChecked = checkedRows.has(row.id);
              return (
                <motion.div
                  key={row.id}
                  initial={{ x: -50, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: index * 0.05, duration: 0.35, ease: "easeOut" }}
                  className={cn(
                    "grid grid-cols-[auto_1fr_1fr_1fr] gap-0 transition-colors duration-200",
                    index % 2 === 0
                      ? "bg-emerald-50/50 dark:bg-gray-900/50"
                      : "bg-white dark:bg-gray-900",
                    isChecked && "!bg-emerald-100/60 dark:!bg-emerald-900/30",
                  )}
                >
                  {/* Checkbox */}
                  <div className="px-4 py-3 flex items-center">
                    <motion.button
                      whileTap={{ scale: 0.85 }}
                      onClick={() => toggleRow(row.id)}
                      className={cn(
                        "w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2",
                        isChecked
                          ? "bg-emerald-500 border-emerald-500 text-white"
                          : "border-gray-300 dark:border-gray-600 hover:border-emerald-400",
                      )}
                      aria-label={`Mark ${row.finding} as reviewed`}
                      role="checkbox"
                      aria-checked={isChecked}
                    >
                      <AnimatePresence>
                        {isChecked && (
                          <motion.svg
                            initial={{ scale: 0 }}
                            animate={{ scale: [0, 1.3, 1] }}
                            exit={{ scale: 0 }}
                            transition={{ type: "spring", stiffness: 400, damping: 15 }}
                            width="14"
                            height="14"
                            viewBox="0 0 14 14"
                            fill="none"
                          >
                            <path
                              d="M3 7.5L5.5 10L11 4"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </motion.svg>
                        )}
                      </AnimatePresence>
                    </motion.button>
                  </div>

                  {/* Finding */}
                  <div className="px-4 py-3">
                    <p className={cn(
                      "text-sm font-medium transition-colors",
                      isChecked
                        ? "text-emerald-700 dark:text-emerald-300"
                        : "text-gray-900 dark:text-gray-100",
                    )}>
                      {row.finding}
                    </p>
                  </div>

                  {/* Significance */}
                  <div className="px-4 py-3">
                    <p className={cn(
                      "text-sm transition-colors",
                      isChecked
                        ? "text-emerald-600/70 dark:text-emerald-400/70"
                        : "text-gray-600 dark:text-gray-400",
                    )}>
                      {row.significance}
                    </p>
                  </div>

                  {/* Action */}
                  <div className="px-4 py-3">
                    <p className={cn(
                      "text-sm transition-colors",
                      isChecked
                        ? "text-emerald-600/70 dark:text-emerald-400/70"
                        : "text-gray-600 dark:text-gray-400",
                    )}>
                      {row.action}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Progress Bar */}
          <div className="px-4 py-4 bg-emerald-50/80 dark:bg-gray-800/50 border-t border-emerald-100 dark:border-gray-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Review Progress
              </span>
              <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                {reviewedCount} / {totalCount} reviewed
              </span>
            </div>
            <div className="w-full h-3 bg-emerald-100 dark:bg-gray-700 rounded-full overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: "#00A878" }}
                initial={{ width: 0 }}
                animate={{ width: `${progressPercent}%` }}
                transition={{ duration: 1, ease: "easeOut" }}
              />
            </div>
            {reviewedCount === totalCount && (
              <motion.p
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-sm text-emerald-600 dark:text-emerald-400 mt-2 font-medium text-center"
              >
                ✓ All items reviewed! Great work.
              </motion.p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default RevisionSheetTable;
