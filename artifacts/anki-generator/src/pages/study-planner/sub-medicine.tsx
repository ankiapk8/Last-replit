import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useStudyTopicsContext } from "@/context/study-topics-context";
import { AmbientOrbs } from "@/components/ambient-orbs";

const SUBJECTS = [
  { label: "Dermatology", storageKey: "dermatology", path: "/sub-medicine/dermatology" },
  { label: "Family Medicine", storageKey: "family", path: "/sub-medicine/family" },
  { label: "Emergency", storageKey: "emergency", path: "/sub-medicine/emergency" },
  { label: "Forensic", storageKey: "forensic", path: "/sub-medicine/forensic" },
  { label: "Radiology", storageKey: "radiology", path: "/sub-medicine/radiology" },
];

const listVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } },
};

export default function SubMedicine() {
  const [, nav] = useLocation();
  const { topicsMap } = useStudyTopicsContext();

  return (
    <div className="relative min-h-screen bg-background overflow-hidden">
      <AmbientOrbs color="hsl(221 83% 60% / 0.10)" />

      <div className="sticky top-0 z-10 bg-background/90 backdrop-blur-md border-b border-border/50 px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => nav("/")} className="h-8 w-8">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className="text-lg">🩺</span>
        <h1
          className="text-base font-bold bg-clip-text text-transparent"
          style={{ backgroundImage: "linear-gradient(90deg, #3b82f6, #60a5fa)" }}
        >
          Sub Medicine
        </h1>
      </div>

      <div className="relative z-[1] max-w-lg mx-auto p-4">
        <motion.div
          className="space-y-3"
          variants={listVariants}
          initial="hidden"
          animate="visible"
        >
          {SUBJECTS.map(s => {
            const topics = topicsMap[s.storageKey] ?? [];
            const done = topics.filter(t => t.status === "Done" || t.status === "Revised").length;
            const pct = topics.length ? Math.round((done / topics.length) * 100) : 0;
            return (
              <motion.button
                key={s.storageKey}
                variants={itemVariants}
                onClick={() => nav(s.path)}
                className="w-full text-left rounded-xl border border-border/50 bg-card/70 backdrop-blur-sm p-4 hover:bg-accent/50 transition-colors shadow-sm"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-sm">{s.label}</span>
                  <span className="text-xs text-muted-foreground">{topics.length} topics · {pct}%</span>
                </div>
                <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
              </motion.button>
            );
          })}
        </motion.div>
      </div>
    </div>
  );
}
