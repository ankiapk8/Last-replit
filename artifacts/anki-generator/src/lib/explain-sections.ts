export interface ExplainSection {
  title: string;
  content: string;
  icon: string;
  color: string;
}

const SECTION_ICONS: Record<string, string> = {
  Definition: "📖",
  Epidemiology: "📊",
  "Etiology & Risk Factors": "🔀",
  Etiology: "🔀",
  Pathophysiology: "🔬",
  "Gross and microscopic pathology": "🔬",
  "Clinical presentation": "🏥",
  "Clinical Presentation": "🏥",
  "Red flags / complications": "🚨",
  "Differential diagnosis": "🔍",
  Diagnosis: "🔍",
  "Diagnostic approach": "🔍",
  Management: "💊",
  Prognosis: "📈",
  "High-yield exam pearls": "⚡",
  "Exam Pearls": "⚡",
  Mnemonic: "💡",
  OSCE: "🩺",
  "Key Facts": "📋",
  "Pathophysiology (step-by-step mechanism)": "🔬",
  "Clinical Features": "🏥",
  Investigations: "🧪",
  "Pearls & Pitfalls": "⚡",
  "When you see this": "👁️",
  "What you actually do": "🩺",
  "Pitfalls & near-misses": "⚠️",
  "Guideline snapshot": "📑",
  "Clinical vignette": "📝",
  "Station type": "🏷️",
  "Scenario / stem": "📖",
  "Candidate instructions": "📋",
  "Examiner mark scheme": "✅",
  "Common mistakes": "❌",
  "Key clinical teaching point": "💡",
  "The Mnemonic": "💡",
  Breakdown: "📝",
  "Memory Hook": "🧠",
  "Clinical link": "🔗",
  "Correct answer": "✅",
};

const SECTION_COLORS: Record<string, string> = {
  Definition: "blue",
  Epidemiology: "purple",
  "Etiology & Risk Factors": "amber",
  Etiology: "amber",
  Pathophysiology: "rose",
  "Gross and microscopic pathology": "rose",
  "Clinical presentation": "emerald",
  "Clinical Presentation": "emerald",
  "Red flags / complications": "red",
  "Differential diagnosis": "sky",
  Diagnosis: "sky",
  "Diagnostic approach": "sky",
  Management: "teal",
  Prognosis: "green",
  "High-yield exam pearls": "yellow",
  "Exam Pearls": "yellow",
  Mnemonic: "amber",
  OSCE: "violet",
  "Key Facts": "blue",
  "Clinical Features": "emerald",
  Investigations: "sky",
  "Pearls & Pitfalls": "yellow",
  "When you see this": "emerald",
  "What you actually do": "teal",
  "Pitfalls & near-misses": "red",
  "Guideline snapshot": "blue",
  "Clinical vignette": "purple",
  "Station type": "violet",
  "Scenario / stem": "blue",
  "Candidate instructions": "sky",
  "Examiner mark scheme": "green",
  "Common mistakes": "red",
  "Key clinical teaching point": "amber",
  "The Mnemonic": "amber",
  Breakdown: "purple",
  "Memory Hook": "rose",
  "Clinical link": "emerald",
  "Correct answer": "green",
};

export function parseSections(markdown: string): ExplainSection[] {
  const sections: ExplainSection[] = [];
  // Split on ## headings (but not ### or deeper)
  const parts = markdown.split(/^##\s+/m);
  for (const part of parts) {
    if (!part.trim()) continue;
    const [titleLine, ...rest] = part.split("\n");
    const title = titleLine.trim();
    // Remove trailing colon if present
    const cleanTitle = title.replace(/:$/, "").trim();
    const content = rest.join("\n").trim();
    if (!content) continue;
    sections.push({
      title: cleanTitle,
      content,
      icon: SECTION_ICONS[cleanTitle] ?? SECTION_ICONS[title] ?? "📄",
      color: SECTION_COLORS[cleanTitle] ?? SECTION_COLORS[title] ?? "gray",
    });
  }
  return sections;
}
