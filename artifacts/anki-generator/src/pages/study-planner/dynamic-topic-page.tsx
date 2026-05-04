import { useLocation, useParams } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TopicManager } from "@/components/study-planner/topic-manager";
import { useStudyTopicsContext } from "@/context/study-topics-context";
import { AmbientOrbs } from "@/components/ambient-orbs";
import { CUSTOM_COLOR_STYLES } from "@/lib/study-planner/topics";

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

export default function DynamicTopicPage() {
  const params = useParams<{ storageKey: string }>();
  const storageKey = params?.storageKey ?? "";
  const [, nav] = useLocation();
  const { customGroups } = useStudyTopicsContext();

  let config: { label: string; parentLabel: string; parentId: string; color: string } | null = null;
  for (const g of customGroups) {
    const s = g.subjects.find(s => s.storageKey === storageKey);
    if (s) { config = { label: s.label, parentLabel: g.label, parentId: g.id, color: g.color }; break; }
  }

  if (!config) {
    return (
      <div className="p-8 text-center space-y-2">
        <p className="text-muted-foreground text-sm">Subject not found.</p>
        <Button variant="link" onClick={() => nav("/")}>← Back to home</Button>
      </div>
    );
  }

  const orbColor = COLOR_ORB[config.color] ?? COLOR_ORB.blue;
  const [gradFrom, gradTo] = COLOR_GRADIENT[config.color] ?? COLOR_GRADIENT.blue;
  const accentClass = CUSTOM_COLOR_STYLES[config.color]?.text ?? "text-primary";

  return (
    <div className="relative min-h-screen bg-background overflow-hidden">
      <AmbientOrbs color={orbColor} />

      <div className="sticky top-0 z-10 bg-background/90 backdrop-blur-md border-b border-border/50 px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon"
          onClick={() => nav(`/custom/${config!.parentId}`)} className="h-8 w-8">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1
            className="text-base font-bold bg-clip-text text-transparent"
            style={{ backgroundImage: `linear-gradient(90deg, ${gradFrom}, ${gradTo})` }}
          >
            {config.label}
          </h1>
          <p className="text-xs text-muted-foreground">{config.parentLabel}</p>
        </div>
      </div>

      <div className="relative z-[1] max-w-2xl mx-auto p-4 pb-24">
        <TopicManager
          storageKey={storageKey}
          subjectLabel={config.label}
          parentLabel={config.parentLabel}
          accentClass={accentClass}
        />
      </div>
    </div>
  );
}
