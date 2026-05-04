// ──────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────

export type Status = "Not Started" | "In Progress" | "Done" | "Revised";
export type Difficulty = "Easy" | "Medium" | "Hard";
export type Priority = "Low" | "Medium" | "High";

export interface Topic {
  id: string;
  name: string;
  subject: string;
  filesAndMedia: string;
  videoLink: string;
  universityLecturer: string;
  amboss: string;
  notes: string;
  status: Status;
  difficultyLevel: Difficulty;
  priority: Priority;
  from: string;
}

export interface SubjectGroup {
  parentLabel: string;
  subjectLabel: string;
  storageKey: string;
}

export interface ScheduledItem {
  topic: Topic;
  subjectLabel: string;
  parentLabel: string;
  storageKey: string;
  firstDate: Date;
  secondDate: Date;
}

// ──────────────────────────────────────────────────────────────
// Subject hierarchy (14 leaf subjects, 5 parent groups)
// ──────────────────────────────────────────────────────────────

export const ALL_SUBJECT_GROUPS: SubjectGroup[] = [
  { parentLabel: "Sub Medicine", subjectLabel: "Dermatology",    storageKey: "dermatology"  },
  { parentLabel: "Sub Medicine", subjectLabel: "Family Medicine", storageKey: "family"       },
  { parentLabel: "Sub Medicine", subjectLabel: "Emergency",       storageKey: "emergency"    },
  { parentLabel: "Sub Medicine", subjectLabel: "Forensic",        storageKey: "forensic"     },
  { parentLabel: "Sub Medicine", subjectLabel: "Radiology",       storageKey: "radiology"    },
  { parentLabel: "Psychiatric",  subjectLabel: "Psychiatric",     storageKey: "psychiatric"  },
  { parentLabel: "Sub Surgery",  subjectLabel: "ENT",             storageKey: "ent"          },
  { parentLabel: "Sub Surgery",  subjectLabel: "Ophthalmology",   storageKey: "ophthalmology"},
  { parentLabel: "Sub Surgery",  subjectLabel: "Orthopedic",      storageKey: "orthopedic"   },
  { parentLabel: "Sub Surgery",  subjectLabel: "Neurosurgery",    storageKey: "neurosurgery" },
  { parentLabel: "Sub Surgery",  subjectLabel: "Urology",         storageKey: "urology"      },
  { parentLabel: "Pediatric",    subjectLabel: "Pediatric",       storageKey: "pediatric"    },
  { parentLabel: "Gynecology",   subjectLabel: "Gynecology",      storageKey: "gynecology"   },
  { parentLabel: "Gynecology",   subjectLabel: "Obstetric",       storageKey: "obstetric"    },
];

// ──────────────────────────────────────────────────────────────
// Color maps for badges
// ──────────────────────────────────────────────────────────────

export const STATUS_COLORS: Record<Status, string> = {
  "Not Started": "bg-slate-100 text-slate-700 border-slate-200",
  "In Progress": "bg-amber-100 text-amber-700 border-amber-200",
  "Done":        "bg-emerald-100 text-emerald-700 border-emerald-200",
  "Revised":     "bg-blue-100 text-blue-700 border-blue-200",
};

export const PRIORITY_COLORS: Record<Priority, string> = {
  High:   "bg-red-100 text-red-700 border-red-200",
  Medium: "bg-amber-100 text-amber-700 border-amber-200",
  Low:    "bg-blue-100 text-blue-700 border-blue-200",
};

export const DIFFICULTY_COLORS: Record<Difficulty, string> = {
  Hard:   "bg-red-100 text-red-700 border-red-200",
  Medium: "bg-amber-100 text-amber-700 border-amber-200",
  Easy:   "bg-emerald-100 text-emerald-700 border-emerald-200",
};

export const PRIORITY_BG_COLORS: Record<Priority, string> = {
  High:   "bg-red-500/10 border-red-500/20 text-red-600",
  Medium: "bg-amber-500/10 border-amber-500/20 text-amber-600",
  Low:    "bg-blue-500/10 border-blue-500/20 text-blue-600",
};

export const NOTION_HEADERS = [
  "Name", "Subject", "Parent Subject", "Files and Media", "Video Link",
  "University Lecturer", "Amboss", "First Study Date", "Second Study Date",
  "Notes", "Status", "Difficulty Level", "Priority", "From",
];

// ──────────────────────────────────────────────────────────────
// Schedule helpers
// ──────────────────────────────────────────────────────────────

export function getScheduleStartDate(): Date {
  const stored = localStorage.getItem("schedule-start-date");
  if (stored) {
    const d = new Date(stored + "T00:00:00");
    if (!isNaN(d.getTime())) return d;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

export function setScheduleStartDate(date: Date): void {
  localStorage.setItem("schedule-start-date", isoDate(date));
}

export function getScheduleWindowDays(startDate: Date): number {
  const year = startDate.getFullYear();
  const month = startDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return daysInMonth - startDate.getDate() + 1;
}

export function isoDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

export function formatStartDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

// ──────────────────────────────────────────────────────────────
// Scheduling algorithm
// ──────────────────────────────────────────────────────────────

const PRIORITY_ORDER: Record<Priority, number> = { High: 0, Medium: 1, Low: 2 };

export function computeSchedule(
  groups: SubjectGroup[],
  topicsMap: Record<string, Topic[]>,
  startDate?: Date,
): ScheduledItem[] {
  const start = startDate ?? getScheduleStartDate();
  const windowDays = getScheduleWindowDays(start);

  // Flatten with group info
  type FlatTopic = { topic: Topic; group: SubjectGroup; groupIndex: number };
  const flat: FlatTopic[] = [];
  groups.forEach((g, gi) => {
    const topics = topicsMap[g.storageKey] ?? [];
    topics.forEach((t) => flat.push({ topic: t, group: g, groupIndex: gi }));
  });

  if (flat.length === 0) return [];

  // Sort: family first, then priority, then groupIndex, then name
  flat.sort((a, b) => {
    const aFamily = a.group.storageKey === "family" ? 0 : 1;
    const bFamily = b.group.storageKey === "family" ? 0 : 1;
    if (aFamily !== bFamily) return aFamily - bFamily;
    const ap = PRIORITY_ORDER[a.topic.priority] ?? 2;
    const bp = PRIORITY_ORDER[b.topic.priority] ?? 2;
    if (ap !== bp) return ap - bp;
    if (a.groupIndex !== b.groupIndex) return a.groupIndex - b.groupIndex;
    return a.topic.name.localeCompare(b.topic.name);
  });

  const N = flat.length;
  const W = windowDays;

  return flat.map((ft, i) => {
    const dayOffset = N <= W ? i : Math.min(Math.floor((i / N) * W), W - 1);
    const firstDate = addDays(start, dayOffset);
    const secondDate = addDays(firstDate, 14);
    return {
      topic: ft.topic,
      subjectLabel: ft.group.subjectLabel,
      parentLabel: ft.group.parentLabel,
      storageKey: ft.group.storageKey,
      firstDate,
      secondDate,
    };
  });
}

// ──────────────────────────────────────────────────────────────
// CSV generation
// ──────────────────────────────────────────────────────────────

function csvRow(cells: string[]): string {
  return cells.map((c) => `"${(c ?? "").replace(/"/g, '""')}"`).join(",");
}

function topicToRow(
  t: Topic,
  subjectLabel: string,
  parentLabel: string,
  firstDate: string,
  secondDate: string,
): string {
  return csvRow([
    t.name, subjectLabel, parentLabel, t.filesAndMedia, t.videoLink,
    t.universityLecturer, t.amboss, firstDate, secondDate,
    t.notes, t.status, t.difficultyLevel, t.priority, t.from,
  ]);
}

export function generateSubjectCSV(
  items: ScheduledItem[],
): string {
  const BOM = "\uFEFF";
  const header = csvRow(NOTION_HEADERS);
  const rows = items.map((s) =>
    topicToRow(s.topic, s.subjectLabel, s.parentLabel, isoDate(s.firstDate), isoDate(s.secondDate))
  );
  return BOM + [header, ...rows].join("\n");
}

export function generateAllSubjectsCSV(
  groups: SubjectGroup[],
  topicsMap: Record<string, Topic[]>,
  startDate?: Date,
): string {
  const schedule = computeSchedule(groups, topicsMap, startDate);
  return generateSubjectCSV(schedule);
}

export interface SeparatedCSV {
  filename: string;
  content: string;
}

export function generateSeparatedCSVs(
  groups: SubjectGroup[],
  topicsMap: Record<string, Topic[]>,
  startDate?: Date,
): SeparatedCSV[] {
  const schedule = computeSchedule(groups, topicsMap, startDate);
  const byKey: Record<string, ScheduledItem[]> = {};
  schedule.forEach((s) => {
    if (!byKey[s.storageKey]) byKey[s.storageKey] = [];
    byKey[s.storageKey].push(s);
  });

  const start = startDate ?? getScheduleStartDate();
  const monthYear = start.toLocaleDateString("en-US", { month: "long", year: "numeric" })
    .toLowerCase().replace(/\s+/g, "-");

  return groups
    .filter((g) => (topicsMap[g.storageKey]?.length ?? 0) > 0)
    .map((g) => ({
      filename: `${g.storageKey}-${monthYear}.csv`,
      content: generateSubjectCSV(byKey[g.storageKey] ?? []),
    }));
}

export function downloadCSV(content: string, filename: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadZip(files: SeparatedCSV[], zipName: string): Promise<void> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  files.forEach((f) => zip.file(f.filename, f.content));
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = zipName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ──────────────────────────────────────────────────────────────
// Backup & Restore
// ──────────────────────────────────────────────────────────────

export interface BackupData {
  version: number;
  exportedAt: string;
  scheduleStartDate: string | null;
  topics: Record<string, Topic[]>;
}

export function exportBackup(topicsMap: Record<string, Topic[]>): void {
  const data: BackupData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    scheduleStartDate: localStorage.getItem("schedule-start-date"),
    topics: topicsMap,
  };
  const content = JSON.stringify(data, null, 2);
  const date = isoDate(new Date());
  downloadCSV(content, `study-planner-backup-${date}.json`);
}

export function importBackup(json: string): { ok: boolean; message: string; data?: BackupData } {
  try {
    const data = JSON.parse(json) as BackupData;
    if (data.version !== 1 || typeof data.topics !== "object") {
      return { ok: false, message: "Invalid backup file format." };
    }
    return { ok: true, message: "Backup loaded successfully.", data };
  } catch {
    return { ok: false, message: "Could not parse backup file." };
  }
}

// ──────────────────────────────────────────────────────────────
// URL helper
// ──────────────────────────────────────────────────────────────

export function ensureUrl(raw: string): string {
  const trimmed = raw.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

// ──────────────────────────────────────────────────────────────
// Random ID generator
// ──────────────────────────────────────────────────────────────

export function randomId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
