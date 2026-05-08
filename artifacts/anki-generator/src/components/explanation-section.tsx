import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ExplainSection } from "@/lib/explain-sections";

const COLOR_MAP: Record<string, { border: string; bg: string; headerBg: string; text: string }> = {
  blue:   { border: "border-blue-200/60",   bg: "bg-blue-50/30",   headerBg: "bg-blue-100/40",   text: "text-blue-800" },
  purple: { border: "border-purple-200/60", bg: "bg-purple-50/30", headerBg: "bg-purple-100/40", text: "text-purple-800" },
  rose:   { border: "border-rose-200/60",   bg: "bg-rose-50/30",   headerBg: "bg-rose-100/40",   text: "text-rose-800" },
  emerald:{ border: "border-emerald-200/60",bg: "bg-emerald-50/30",headerBg: "bg-emerald-100/40",text: "text-emerald-800" },
  sky:    { border: "border-sky-200/60",    bg: "bg-sky-50/30",    headerBg: "bg-sky-100/40",    text: "text-sky-800" },
  teal:   { border: "border-teal-200/60",   bg: "bg-teal-50/30",   headerBg: "bg-teal-100/40",   text: "text-teal-800" },
  green:  { border: "border-green-200/60",  bg: "bg-green-50/30",  headerBg: "bg-green-100/40",  text: "text-green-800" },
  yellow: { border: "border-yellow-200/60", bg: "bg-yellow-50/30", headerBg: "bg-yellow-100/40", text: "text-yellow-800" },
  amber:  { border: "border-amber-200/60",  bg: "bg-amber-50/30",  headerBg: "bg-amber-100/40",  text: "text-amber-800" },
  violet: { border: "border-violet-200/60", bg: "bg-violet-50/30", headerBg: "bg-violet-100/40", text: "text-violet-800" },
  red:    { border: "border-red-200/60",    bg: "bg-red-50/30",    headerBg: "bg-red-100/40",    text: "text-red-800" },
  gray:   { border: "border-gray-200/60",   bg: "bg-gray-50/30",   headerBg: "bg-gray-100/40",   text: "text-gray-800" },
};

function getColors(color: string) {
  return COLOR_MAP[color] || COLOR_MAP.gray;
}

export function ExplanationSectionCard({
  section,
  index,
  isStreaming,
}: {
  section: ExplainSection;
  index: number;
  isStreaming: boolean;
}) {
  const colors = getColors(section.color);
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.3 }}
      className={`rounded-xl border ${colors.border} ${colors.bg} overflow-hidden mb-3`}
    >
      <div className={`flex items-center gap-2 px-4 py-2 ${colors.headerBg}`}>
        <span className="text-base">{section.icon}</span>
        <span className={`text-sm font-semibold ${colors.text}`}>{section.title}</span>
      </div>
      <div className="px-4 py-3 prose prose-sm dark:prose-invert max-w-none
        prose-headings:font-semibold prose-headings:text-foreground
        prose-p:text-foreground prose-p:leading-relaxed prose-p:my-2
        prose-strong:text-foreground prose-strong:font-semibold
        prose-ul:my-2 prose-li:my-0.5 prose-ol:my-2
        prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs
        prose-blockquote:border-primary/40 prose-blockquote:text-muted-foreground
      ">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {section.content}
        </ReactMarkdown>
        {isStreaming && index === 0 && (
          <span className="inline-block w-1.5 h-4 bg-primary/60 ml-0.5 animate-pulse rounded-sm align-middle" />
        )}
      </div>
    </motion.div>
  );
}

export function ExplanationSkeleton() {
  const sections = ["Definition", "Epidemiology", "Pathophysiology", "Clinical Presentation", "Management"];
  return (
    <div className="space-y-3">
      {sections.map((_, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0.4, 0.7, 0.4] }}
          transition={{ repeat: Infinity, duration: 1.5, delay: i * 0.1 }}
          className="rounded-xl border border-border/30 overflow-hidden"
        >
          <div className="h-10 bg-muted/50" />
          <div className="p-4 space-y-2">
            <div className="h-3 bg-muted/30 rounded w-3/4" />
            <div className="h-3 bg-muted/30 rounded w-1/2" />
          </div>
        </motion.div>
      ))}
    </div>
  );
}
