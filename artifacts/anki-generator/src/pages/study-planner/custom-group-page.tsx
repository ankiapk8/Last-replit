import { useLocation, useParams } from "wouter";
import { ArrowLeft, Settings2 } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useStudyTopicsContext } from "@/context/study-topics-context";
import { CUSTOM_COLOR_STYLES } from "@/lib/study-planner/topics";
import { AmbientOrbs } from "@/components/ambient-orbs";

const COLOR_ORB: Record<string, string> = {
  blue:   "hsl(221 83% 60% / 0.10)",
  orange: "hsl(25 95% 55% / 0.10)",
  purple: "hsl(270 70% 60% / 0.10)",
  green:  "hsl(142 70% 45% / 0.10)",
  pink:   "hsl(330 80% 60% / 0.10)",
  red:    "hsl(0 84% 60% / 0.10)",
  yellow: "hsl(48 96% 53% / 0.10)",
};

const COLOR_GRADIENT: Record<string, [string, string]> = {
  blue:   ["#3b82f6", "#60a5fa"],
  orange: ["#f97316", "#fb923c"],
  purple: ["#9333ea", "#a855f7"],
  green:  ["#22c55e", "#4ade80"],
  pink:   ["#ec4899", "#f472b6"],
  red:    ["#ef4444", "#f87171"],
  yellow: ["#eab308", "#facc15"],
};

const listVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } },
};

export default function CustomGroupPage() {
  const params = useParams<{ groupId: string }>();
  const groupId = params?.groupId ?? "";
  const [, nav] = useLocation();
  const { customGroups, topicsMap } = useStudyTopicsContext();

  const group = customGroups.find(g => g.id === groupId);

  if (!group) {
    return (
      <div className="p-8 text-center space-y-2">
        <p className="text-muted-foreground text-sm">Subject group not found.</p>
        <Button variant="link" onClick={() => nav("/")}>← Back to home</Button>
      </div>
    );
  }

  const styles = CUSTOM_COLOR_STYLES[group.color] ?? CUSTOM_COLOR_STYLES.blue;
  const orbColor = COLOR_ORB[group.color] ?? COLOR_ORB.blue;
  const [gradFrom, gradTo] = COLOR_GRADIENT[group.color] ?? COLOR_GRADIENT.blue;

  return (
    <div className="relative min-h-screen bg-background overflow-hidden">
      <AmbientOrbs color={orbColor} />

      <div className="sticky top-0 z-10 bg-background/90 backdrop-blur-md border-b border-border/50 px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => nav("/")} className="h-8 w-8">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className="text-xl">{group.emoji}</span>
        <h1
          className="text-base font-bold flex-1 bg-clip-text text-transparent"
          style={{ backgroundImage: `linear-gradient(90deg, ${gradFrom}, ${gradTo})` }}
        >
          {group.label}
        </h1>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => nav("/manage-subjects")}
          title="Manage subjects">
          <Settings2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="relative z-[1] max-w-lg mx-auto p-4 pb-24">
        {group.subjects.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-muted/20 p-8 text-center">
            <p className="text-sm font-medium text-muted-foreground">No sub-topics yet</p>
            <p className="text-xs text-muted-foreground mt-1">Go to Manage Subjects to add sub-topics.</p>
            <Button size="sm" variant="outline" className="mt-3 text-xs" onClick={() => nav("/manage-subjects")}>
              Manage Subjects
            </Button>
          </div>
        ) : (
          <motion.div
            className="space-y-3"
            variants={listVariants}
            initial="hidden"
            animate="visible"
          >
            {group.subjects.map(s => {
              const topics = topicsMap[s.storageKey] ?? [];
              const done = topics.filter(t => t.status === "Done" || t.status === "Revised").length;
              const pct = topics.length ? Math.round((done / topics.length) * 100) : 0;
              return (
                <motion.button
                  key={s.id}
                  variants={itemVariants}
                  onClick={() => nav(`/subject/${s.storageKey}`)}
                  className="w-full text-left rounded-xl border border-border/50 bg-card/70 backdrop-blur-sm p-4 hover:bg-accent/50 transition-colors shadow-sm"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-sm">{s.label}</span>
                    <span className="text-xs text-muted-foreground">{topics.length} topics · {pct}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${styles.bar}`} style={{ width: `${pct}%` }} />
                  </div>
                </motion.button>
              );
            })}
          </motion.div>
        )}
      </div>
    </div>
  );
}
