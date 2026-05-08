import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { ClinicalArticleCard } from "./ClinicalArticleCard";
import { RevisionSheetTable } from "./RevisionSheetTable";
import { OsceStationQuestion } from "./OsceStationQuestion";
import { MnemonicCard } from "./MnemonicCard";
import { ClinicalPearlsCardStack } from "./ClinicalPearlsCardStack";

const COMPONENTS = [
  {
    id: "clinical-article",
    title: "A: Clinical Article Card",
    description:
      "AMBOSS-style full explanation with 15 collapsible sections, sticky navigation, and highlight boxes.",
    color: "#6C63FF",
    bgFrom: "from-purple-50",
    bgTo: "to-indigo-50",
  },
  {
    id: "revision-sheet",
    title: "B: Revision Sheet Table",
    description: "Emerald-themed table with checkmark progress tracking and animated progress bar.",
    color: "#00A878",
    bgFrom: "from-emerald-50",
    bgTo: "to-green-50",
  },
  {
    id: "osce-station",
    title: "C: OSCE Station Question",
    description:
      "Warm orange station card with SVG countdown timer, MCQ options, and answer reveal animations.",
    color: "#E55A2B",
    bgFrom: "from-orange-50",
    bgTo: "to-amber-50",
  },
  {
    id: "mnemonic-card",
    title: "D: Mnemonic Card",
    description:
      "Vibrant purple 3D flip tiles spelling CARDIAC with color cascade and star rating.",
    color: "#8E24AA",
    bgFrom: "from-purple-50",
    bgTo: "to-fuchsia-50",
  },
  {
    id: "pearls-stack",
    title: "E: Clinical Pearls Stack",
    description:
      "Golden amber swipeable card stack with drag gestures, confetti bookmark, and dot pagination.",
    color: "#F59E0B",
    bgFrom: "from-amber-50",
    bgTo: "to-yellow-50",
  },
];

function ComponentPreview({
  id,
  title,
  description,
  color,
  bgFrom,
  bgTo,
}: {
  id: string;
  title: string;
  description: string;
  color: string;
  bgFrom: string;
  bgTo: string;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-white dark:bg-gray-900 shadow-sm"
    >
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          "w-full text-left px-5 py-4 flex items-center gap-4 transition-colors",
          "hover:bg-gray-50 dark:hover:bg-gray-800/50",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset"
        )}
        style={{ "--tw-ring-color": color } as React.CSSProperties}
      >
        <div className="w-3 h-10 rounded-full shrink-0" style={{ backgroundColor: color }} />
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold text-gray-900 dark:text-white">{title}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>
        </div>
        <motion.span
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="text-gray-400 text-lg shrink-0"
        >
          ▾
        </motion.span>
      </button>

      {/* Preview */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className={cn("bg-gradient-to-br p-4", bgFrom, bgTo)}>
              <div className="bg-white/60 dark:bg-gray-900/60 backdrop-blur-sm rounded-xl overflow-hidden border border-white/40 dark:border-gray-800/40">
                {id === "clinical-article" && <ClinicalArticleCard />}
                {id === "revision-sheet" && <RevisionSheetTable />}
                {id === "osce-station" && <OsceStationQuestion />}
                {id === "mnemonic-card" && <MnemonicCard />}
                {id === "pearls-stack" && <ClinicalPearlsCardStack />}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export function MedicalComponentsDemo() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Page Header */}
      <div className="sticky top-0 z-50 backdrop-blur-xl bg-white/80 dark:bg-gray-950/80 border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Medical UI Components
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            5 animated, production-ready components for medical education apps. Click each card to
            expand the preview.
          </p>
        </div>
      </div>

      {/* Component List */}
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        {COMPONENTS.map((comp, index) => (
          <ComponentPreview key={comp.id} {...comp} />
        ))}
      </div>

      {/* Footer */}
      <div className="text-center py-8 text-xs text-gray-400 dark:text-gray-600">
        Built with React + Tailwind CSS + Framer Motion + React Spring
      </div>
    </div>
  );
}

export default MedicalComponentsDemo;
