import { useEffect, useState } from "react";
import { Cpu } from "lucide-react";
import { apiUrl } from "@/lib/utils";

interface ModelInfo {
  textModel: string;
  visionModel: string;
  textFree: boolean;
  visionFree: boolean;
  sameModel: boolean;
}

function parseModelName(raw: string): string {
  const withoutProvider = raw.includes("/") ? raw.split("/").slice(1).join("/") : raw;
  const withoutTier = withoutProvider.replace(/:free$|:paid$|:nitro$|:floor$/i, "");
  return withoutTier
    .replace(/-/g, " ")
    .replace(/\b(\w)/g, c => c.toUpperCase())
    .replace(/\b(Gpt)\b/i, "GPT")
    .replace(/\b(Llm|Llama)\b/i, m => m.toUpperCase())
    .trim();
}

function TierBadge({ free }: { free: boolean }) {
  return (
    <span className={`text-[9px] font-bold tracking-widest px-1.5 py-0.5 rounded-full border ${
      free
        ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
        : "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20"
    }`}>
      {free ? "FREE" : "PAID"}
    </span>
  );
}

export function ModelBadge() {
  const [info, setInfo] = useState<ModelInfo | null>(null);

  useEffect(() => {
    fetch(apiUrl("api/model-info"))
      .then(r => r.json())
      .then(setInfo)
      .catch(() => {});
  }, []);

  if (!info) return null;

  const sameAndFree  = info.sameModel && info.textFree;
  const sameAndPaid  = info.sameModel && !info.textFree;

  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-border/40 bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur-sm">
      <span className="flex items-center gap-1.5 font-medium text-muted-foreground/60 shrink-0">
        <Cpu style={{ width: 11, height: 11 }} />
        <span className="text-[10px] font-semibold tracking-wider uppercase">Model</span>
      </span>

      <span className="h-3 w-px bg-border/60" />

      {info.sameModel ? (
        <span className="flex items-center gap-1.5">
          <span
            className={`h-1.5 w-1.5 rounded-full shrink-0 ${sameAndFree ? "bg-emerald-500" : "bg-amber-500"}`}
          />
          <span className="font-medium text-foreground/70 text-[11px]">
            {parseModelName(info.textModel)}
          </span>
          <TierBadge free={info.textFree} />
        </span>
      ) : (
        <span className="flex items-center gap-2 flex-wrap">
          <span className="flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground/50">text</span>
            <span className="font-medium text-foreground/70 text-[11px]">{parseModelName(info.textModel)}</span>
            <TierBadge free={info.textFree} />
          </span>
          <span className="text-border">·</span>
          <span className="flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground/50">vision</span>
            <span className="font-medium text-foreground/70 text-[11px]">{parseModelName(info.visionModel)}</span>
            <TierBadge free={info.visionFree} />
          </span>
        </span>
      )}
    </div>
  );
}
