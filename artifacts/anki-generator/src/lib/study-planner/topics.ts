// ─── Types ───────────────────────────────────────────────────────────────────

export type Status     = "Not Started" | "In Progress" | "Done" | "Revised";
export type Difficulty = "Easy" | "Medium" | "Hard";
export type Priority   = "Low" | "Medium" | "High";

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
  estimatedMinutes?: number;
}

export interface SubjectGroup {
  parentLabel: string;
  subjectLabel: string;
  storageKey: string;
}

export interface BackupData {
  version: 1;
  exportedAt: string;
  scheduleStartDate: string | null;
  scheduleEndDate?: string | null;
  scheduleSpacingDays?: number | null;
  topics: Record<string, Topic[]>;
}

export interface ScheduledItem {
  topic: Topic;
  subjectLabel: string;
  parentLabel: string;
  storageKey: string;
  firstDate: Date;
  secondDate: Date;
}

export interface SeparatedCSV {
  filename: string;
  csv: string;
  parentLabel: string;
  topicCount: number;
}

// ─── Defaults ────────────────────────────────────────────────────────────────

export const DEFAULT_TOPIC: Topic = {
  id: "",
  name: "",
  subject: "",
  filesAndMedia: "",
  videoLink: "",
  universityLecturer: "",
  amboss: "",
  notes: "",
  status: "Not Started",
  difficultyLevel: "Medium",
  priority: "Medium",
  from: "",
  estimatedMinutes: 0,
};

export const ALL_SUBJECT_GROUPS: SubjectGroup[] = [
  { parentLabel: "Sub Medicine", subjectLabel: "Dermatology",   storageKey: "dermatology" },
  { parentLabel: "Sub Medicine", subjectLabel: "Family",        storageKey: "family" },
  { parentLabel: "Sub Medicine", subjectLabel: "Emergency",     storageKey: "emergency" },
  { parentLabel: "Sub Medicine", subjectLabel: "Forensic",      storageKey: "forensic" },
  { parentLabel: "Sub Medicine", subjectLabel: "Radiology",     storageKey: "radiology" },
  { parentLabel: "Psychiatric",  subjectLabel: "Psychiatric",   storageKey: "psychiatric" },
  { parentLabel: "Sub Surgery",  subjectLabel: "ENT",           storageKey: "ent" },
  { parentLabel: "Sub Surgery",  subjectLabel: "Ophthalmology", storageKey: "ophthalmology" },
  { parentLabel: "Sub Surgery",  subjectLabel: "Orthopedic",    storageKey: "orthopedic" },
  { parentLabel: "Sub Surgery",  subjectLabel: "Neurosurgery",  storageKey: "neurosurgery" },
  { parentLabel: "Sub Surgery",  subjectLabel: "Urology",       storageKey: "urology" },
  { parentLabel: "Pediatric",    subjectLabel: "Pediatric",     storageKey: "pediatric" },
  { parentLabel: "Gynecology",   subjectLabel: "Gynecology",    storageKey: "gynecology" },
  { parentLabel: "Gynecology",   subjectLabel: "Obstetric",     storageKey: "obstetric" },
];

// ─── Color maps ──────────────────────────────────────────────────────────────

export const STATUS_COLORS: Record<Status, string> = {
  "Not Started": "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  "In Progress": "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400",
  "Done":        "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400",
  "Revised":     "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400",
};

export const PRIORITY_COLORS: Record<Priority, string> = {
  Low:    "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  Medium: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400",
  High:   "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
};

export const DIFFICULTY_COLORS: Record<Difficulty, string> = {
  Easy:   "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400",
  Medium: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400",
  Hard:   "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
};

export const PARENT_DOT_COLORS: Record<string, string> = {
  "Sub Medicine": "bg-orange-500",
  "Psychiatric":  "bg-purple-500",
  "Sub Surgery":  "bg-orange-500",
  "Pediatric":    "bg-green-500",
  "Gynecology":   "bg-pink-500",
};

// ─── Utilities ───────────────────────────────────────────────────────────────

export function generateId(): string {
  return Math.random().toString(36).slice(2, 9);
}

export function isoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatMinutes(mins: number): string {
  if (!mins) return "";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

// ─── localStorage helpers ────────────────────────────────────────────────────

function lsGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function lsSet(key: string, val: string): void {
  try { localStorage.setItem(key, val); } catch { /* ignore */ }
}

export function getScheduleStartDate(): Date {
  const v = lsGet("sp-schedule-start-date");
  if (v) { const d = new Date(v); if (!isNaN(d.getTime())) return d; }
  return new Date();
}
export function setScheduleStartDate(date: Date): void {
  lsSet("sp-schedule-start-date", date.toISOString());
}

export function getScheduleEndDate(startDate: Date): Date {
  const v = lsGet("sp-schedule-end-date");
  if (v) { const d = new Date(v); if (!isNaN(d.getTime())) return d; }
  const end = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);
  return end;
}
export function setScheduleEndDate(date: Date): void {
  lsSet("sp-schedule-end-date", date.toISOString());
}

export function getScheduleWindowDays(startDate: Date, endDate?: Date): number {
  const end = endDate ?? getScheduleEndDate(startDate);
  const diff = Math.round((end.getTime() - startDate.getTime()) / 86400000) + 1;
  return Math.max(1, Math.min(365, diff));
}

export function getSpacingDays(): number {
  const v = lsGet("sp-schedule-spacing-days");
  const n = v ? parseInt(v, 10) : 14;
  return isNaN(n) ? 14 : n;
}
export function setSpacingDays(days: number): void {
  lsSet("sp-schedule-spacing-days", String(days));
}

export function getWeightByDifficulty(): boolean {
  return lsGet("sp-weight-by-difficulty") === "true";
}
export function setWeightByDifficulty(val: boolean): void {
  lsSet("sp-weight-by-difficulty", String(val));
}

export function writeStudyActivity(date?: Date): void {
  try {
    const raw = lsGet("sp-study-activity");
    const log: Record<string, boolean> = raw ? JSON.parse(raw) : {};
    log[isoDate(date ?? new Date())] = true;
    lsSet("sp-study-activity", JSON.stringify(log));
    window.dispatchEvent(new CustomEvent("sp-study-activity-updated"));
  } catch { /* ignore */ }
}

export function computeStreak(): number {
  try {
    const raw = lsGet("sp-study-activity");
    if (!raw) return 0;
    const log: Record<string, boolean> = JSON.parse(raw);
    let streak = 0;
    const today = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      if (log[isoDate(d)]) streak++;
      else if (i > 0) break;
    }
    return streak;
  } catch { return 0; }
}

export function getStudyActivityLog(): Record<string, boolean> {
  try {
    const raw = lsGet("sp-study-activity");
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

export function getLastBackupAt(): Date | null {
  const v = lsGet("sp-last-backup-at");
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

// ─── Schedule algorithm ──────────────────────────────────────────────────────

const PRIORITY_ORDER: Record<Priority, number> = { High: 0, Medium: 1, Low: 2 };
const DIFFICULTY_ORDER: Record<Difficulty, number> = { Hard: 0, Medium: 1, Easy: 2 };

function assignDates(
  topics: Topic[],
  startDate: Date,
  daysWindow: number,
  spacing: number,
): { topic: Topic; firstDate: Date; secondDate: Date }[] {
  return topics.map((topic, i) => {
    const offset = topics.length > 1
      ? Math.round((i / (topics.length - 1)) * (daysWindow - 1))
      : 0;
    const firstDate = new Date(startDate);
    firstDate.setDate(firstDate.getDate() + offset);
    const secondDate = new Date(firstDate);
    secondDate.setDate(secondDate.getDate() + spacing);
    return { topic, firstDate, secondDate };
  });
}

export function computeSchedule(
  groups: SubjectGroup[],
  topicsMap: Record<string, Topic[]>,
  startDate?: Date,
  endDate?: Date,
  spacing?: number,
  weightByDifficulty?: boolean,
): ScheduledItem[] {
  const start = startDate ?? getScheduleStartDate();
  const end = endDate ?? getScheduleEndDate(start);
  const sp = spacing ?? getSpacingDays();
  const weight = weightByDifficulty ?? getWeightByDifficulty();
  const daysWindow = getScheduleWindowDays(start, end);

  const items: ScheduledItem[] = [];
  for (const group of groups) {
    const topics = [...(topicsMap[group.storageKey] ?? [])];
    topics.sort((a, b) => {
      const pDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      if (pDiff !== 0) return pDiff;
      if (weight) {
        const dDiff = DIFFICULTY_ORDER[a.difficultyLevel] - DIFFICULTY_ORDER[b.difficultyLevel];
        if (dDiff !== 0) return dDiff;
      }
      return a.name.localeCompare(b.name);
    });
    const assigned = assignDates(topics, start, daysWindow, sp);
    for (const a of assigned) {
      items.push({ ...a, subjectLabel: group.subjectLabel, parentLabel: group.parentLabel, storageKey: group.storageKey });
    }
  }
  return items;
}

// ─── CSV export ──────────────────────────────────────────────────────────────

export const NOTION_HEADERS = [
  "Name", "Subject", "Parent Subject", "Files and Media", "Video Link",
  "University Lecturer", "Amboss", "First Study Date", "Second Study Date",
  "Notes", "Status", "Difficulty Level", "Priority", "From", "Est. Minutes",
];

export function csvRow(cells: string[]): string {
  return cells.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",");
}

export function generateSubjectCSV(
  topics: Topic[],
  subjectLabel: string,
  parentLabel: string,
  endDate?: Date,
  spacing?: number,
): string {
  const start = getScheduleStartDate();
  const end = endDate ?? getScheduleEndDate(start);
  const sp = spacing ?? getSpacingDays();
  const daysWindow = getScheduleWindowDays(start, end);
  const assigned = assignDates(topics, start, daysWindow, sp);
  const rows = [csvRow(NOTION_HEADERS)];
  for (const { topic, firstDate, secondDate } of assigned) {
    rows.push(csvRow([
      topic.name, subjectLabel, parentLabel,
      topic.filesAndMedia, topic.videoLink,
      topic.universityLecturer, topic.amboss,
      isoDate(firstDate), isoDate(secondDate),
      topic.notes, topic.status, topic.difficultyLevel, topic.priority, topic.from,
      String(topic.estimatedMinutes ?? 0),
    ]));
  }
  return rows.join("\n");
}

export function generateAllSubjectsCSV(
  groups: SubjectGroup[],
  topicsMap: Record<string, Topic[]>,
  endDate?: Date,
  spacing?: number,
  weightByDifficulty?: boolean,
): string {
  const start = getScheduleStartDate();
  const end = endDate ?? getScheduleEndDate(start);
  const sp = spacing ?? getSpacingDays();
  const weight = weightByDifficulty ?? getWeightByDifficulty();
  const items = computeSchedule(groups, topicsMap, start, end, sp, weight);
  const rows = [csvRow(NOTION_HEADERS)];
  for (const { topic, subjectLabel, parentLabel, firstDate, secondDate } of items) {
    rows.push(csvRow([
      topic.name, subjectLabel, parentLabel,
      topic.filesAndMedia, topic.videoLink,
      topic.universityLecturer, topic.amboss,
      isoDate(firstDate), isoDate(secondDate),
      topic.notes, topic.status, topic.difficultyLevel, topic.priority, topic.from,
      String(topic.estimatedMinutes ?? 0),
    ]));
  }
  return rows.join("\n");
}

export function generateSeparatedCSVs(
  groups: SubjectGroup[],
  topicsMap: Record<string, Topic[]>,
  endDate?: Date,
  spacing?: number,
  weightByDifficulty?: boolean,
): SeparatedCSV[] {
  return groups
    .filter(g => (topicsMap[g.storageKey] ?? []).length > 0)
    .map(g => {
      const topics = topicsMap[g.storageKey] ?? [];
      return {
        filename: `${g.storageKey}.csv`,
        csv: generateSubjectCSV(topics, g.subjectLabel, g.parentLabel, endDate, spacing),
        parentLabel: g.parentLabel,
        topicCount: topics.length,
      };
    });
}

export function downloadCSV(content: string, filename: string): void {
  const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export async function downloadZip(files: SeparatedCSV[], zipName: string): Promise<void> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  for (const f of files) zip.file(f.filename, "\uFEFF" + f.csv);
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = zipName; a.click();
  URL.revokeObjectURL(url);
}

// ─── Backup ──────────────────────────────────────────────────────────────────

export function exportBackup(
  groups: SubjectGroup[],
  topicsMap: Record<string, Topic[]>,
): void {
  const data: BackupData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    scheduleStartDate: lsGet("sp-schedule-start-date"),
    scheduleEndDate: lsGet("sp-schedule-end-date"),
    scheduleSpacingDays: getSpacingDays(),
    topics: Object.fromEntries(groups.map(g => [g.storageKey, topicsMap[g.storageKey] ?? []])),
  };
  downloadCSV(JSON.stringify(data, null, 2), `study-planner-backup-${isoDate(new Date())}.json`);
  lsSet("sp-last-backup-at", new Date().toISOString());
}

export function importBackup(json: string): { ok: boolean; message: string; data?: BackupData } {
  try {
    const data = JSON.parse(json) as BackupData;
    if (data.version !== 1) return { ok: false, message: "Unsupported backup version." };
    if (!data.topics || typeof data.topics !== "object") return { ok: false, message: "Invalid backup: missing topics." };
    return { ok: true, message: "Backup loaded successfully.", data };
  } catch (e) {
    return { ok: false, message: `Parse error: ${e}` };
  }
}

// ─── Custom Subject Groups ────────────────────────────────────────────────────

export interface CustomSubject {
  id: string;
  storageKey: string;
  label: string;
}

export interface CustomSubjectGroup {
  id: string;
  emoji: string;
  label: string;
  color: string;
  subjects: CustomSubject[];
}

export const CUSTOM_COLOR_OPTIONS = [
  "blue","purple","orange","green","pink","teal","red","indigo","cyan","amber",
] as const;

export const CUSTOM_DOT_COLORS: Record<string, string> = {
  blue:"bg-blue-500", purple:"bg-purple-500", orange:"bg-orange-500",
  green:"bg-green-500", pink:"bg-pink-500", teal:"bg-teal-500",
  red:"bg-red-500", indigo:"bg-indigo-500", cyan:"bg-cyan-500", amber:"bg-amber-500",
};

export const CUSTOM_COLOR_STYLES: Record<string, { card: string; text: string; bar: string }> = {
  blue:   { card:"border-blue-200/70 bg-blue-50/70 dark:bg-blue-950/25 dark:border-blue-800/60 backdrop-blur-sm shadow-sm",     text:"text-blue-700 dark:text-blue-400",     bar:"bg-blue-500"   },
  purple: { card:"border-purple-200/70 bg-purple-50/70 dark:bg-purple-950/25 dark:border-purple-800/60 backdrop-blur-sm shadow-sm", text:"text-purple-700 dark:text-purple-400", bar:"bg-purple-500" },
  orange: { card:"border-orange-200/70 bg-orange-50/70 dark:bg-orange-950/25 dark:border-orange-800/60 backdrop-blur-sm shadow-sm", text:"text-orange-700 dark:text-orange-400", bar:"bg-orange-500" },
  green:  { card:"border-green-200/70 bg-green-50/70 dark:bg-green-950/25 dark:border-green-800/60 backdrop-blur-sm shadow-sm",   text:"text-green-700 dark:text-green-400",   bar:"bg-green-500"  },
  pink:   { card:"border-pink-200/70 bg-pink-50/70 dark:bg-pink-950/25 dark:border-pink-800/60 backdrop-blur-sm shadow-sm",      text:"text-pink-700 dark:text-pink-400",     bar:"bg-pink-500"   },
  teal:   { card:"border-teal-200/70 bg-teal-50/70 dark:bg-teal-950/25 dark:border-teal-800/60 backdrop-blur-sm shadow-sm",      text:"text-teal-700 dark:text-teal-400",     bar:"bg-teal-500"   },
  red:    { card:"border-red-200/70 bg-red-50/70 dark:bg-red-950/25 dark:border-red-800/60 backdrop-blur-sm shadow-sm",          text:"text-red-700 dark:text-red-400",       bar:"bg-red-500"    },
  indigo: { card:"border-indigo-200/70 bg-indigo-50/70 dark:bg-indigo-950/25 dark:border-indigo-800/60 backdrop-blur-sm shadow-sm",text:"text-indigo-700 dark:text-indigo-400", bar:"bg-indigo-500" },
  cyan:   { card:"border-cyan-200/70 bg-cyan-50/70 dark:bg-cyan-950/25 dark:border-cyan-800/60 backdrop-blur-sm shadow-sm",      text:"text-cyan-700 dark:text-cyan-400",     bar:"bg-cyan-500"   },
  amber:  { card:"border-amber-200/70 bg-amber-50/70 dark:bg-amber-950/25 dark:border-amber-800/60 backdrop-blur-sm shadow-sm",   text:"text-amber-700 dark:text-amber-400",   bar:"bg-amber-500"  },
};

export function getCustomGroups(): CustomSubjectGroup[] {
  try { return JSON.parse(lsGet("sp-custom-groups") ?? "[]") as CustomSubjectGroup[]; }
  catch { return []; }
}

export function saveCustomGroups(groups: CustomSubjectGroup[]): void {
  lsSet("sp-custom-groups", JSON.stringify(groups));
  window.dispatchEvent(new CustomEvent("sp-custom-groups-updated"));
}

export function customGroupsToSubjectGroups(groups: CustomSubjectGroup[]): SubjectGroup[] {
  return groups.flatMap(g =>
    g.subjects.map(s => ({ parentLabel: g.label, subjectLabel: s.label, storageKey: s.storageKey }))
  );
}

// ─── Date Overrides (for shifting missed topics) ──────────────────────────────

export function getDateOverrides(): Record<string, string> {
  try { return JSON.parse(lsGet("sp-date-overrides") ?? "{}") as Record<string, string>; }
  catch { return {}; }
}

export function saveDateOverrides(overrides: Record<string, string>): void {
  lsSet("sp-date-overrides", JSON.stringify(overrides));
  window.dispatchEvent(new CustomEvent("sp-overrides-updated"));
}

export function shiftTopicsToDate(topicIds: string[], targetDate: Date): void {
  const overrides = getDateOverrides();
  const dateStr = isoDate(targetDate);
  for (const id of topicIds) overrides[id] = dateStr;
  saveDateOverrides(overrides);
}

// ─── Daily checklist state ────────────────────────────────────────────────────

const DAILY_CHECK_PREFIX = "sp-daily-check-";

export function getDailyCheckState(): Set<string> {
  try {
    const raw = lsGet(DAILY_CHECK_PREFIX + isoDate(new Date()));
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch { return new Set(); }
}

export function toggleDailyCheck(topicId: string): Set<string> {
  try {
    const key = DAILY_CHECK_PREFIX + isoDate(new Date());
    const current = getDailyCheckState();
    if (current.has(topicId)) current.delete(topicId); else current.add(topicId);
    lsSet(key, JSON.stringify(Array.from(current)));
    return current;
  } catch { return new Set(); }
}

// ─── Today's scheduled topic count (for dashboard banner) ────────────────────

export function getTodayScheduledCount(
  groups: SubjectGroup[],
  topicsMap: Record<string, Topic[]>,
  startDate: Date,
  endDate: Date,
  spacing: number,
  weightByDifficulty: boolean,
): number {
  const today = isoDate(new Date());
  const overrides = getDateOverrides();
  const scheduled = computeSchedule(groups, topicsMap, startDate, endDate, spacing, weightByDifficulty);
  return scheduled.filter(item => {
    const firstDateStr = overrides[item.topic.id] ?? isoDate(item.firstDate);
    const secondDateStr = isoDate(item.secondDate);
    return firstDateStr === today || secondDateStr === today;
  }).length;
}

export function getDashboardPlannerDueTodayCount(): number {
  try {
    const allGroups: SubjectGroup[] = [...ALL_SUBJECT_GROUPS];
    try {
      const cg = JSON.parse(lsGet("sp-custom-groups") ?? "[]") as CustomSubjectGroup[];
      for (const g of cg) {
        for (const s of g.subjects) {
          allGroups.push({ parentLabel: g.label, subjectLabel: s.label, storageKey: s.storageKey });
        }
      }
    } catch { /* ignore */ }
    const topicsMap: Record<string, Topic[]> = {};
    for (const g of allGroups) {
      try {
        const raw = lsGet(`sp-topics-${g.storageKey}`);
        if (raw) topicsMap[g.storageKey] = JSON.parse(raw) as Topic[];
      } catch { /* ignore */ }
    }
    const start = getScheduleStartDate();
    const end = getScheduleEndDate(start);
    const spacing = getSpacingDays();
    const weight = getWeightByDifficulty();
    return getTodayScheduledCount(allGroups, topicsMap, start, end, spacing, weight);
  } catch { return 0; }
}

// ─── Redistribute overdue items evenly across remaining days ─────────────────

export function redistributeOverdueItems(items: ScheduledItem[], endDate: Date): void {
  if (items.length === 0) return;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endStr = isoDate(endDate);
  const remaining: string[] = [];
  const cur = new Date(today);
  while (isoDate(cur) <= endStr) { remaining.push(isoDate(cur)); cur.setDate(cur.getDate() + 1); }
  if (remaining.length === 0) return;
  const overrides = getDateOverrides();
  // True balanced round-robin: item[i] → remaining[i % remaining.length]
  // Every day gets floor(items/days) items; first (items % days) days get one extra.
  items.forEach((item, idx) => {
    overrides[item.topic.id] = remaining[idx % remaining.length];
  });
  saveDateOverrides(overrides);
}

// ─── Burndown chart data ──────────────────────────────────────────────────────

export interface BurndownPoint {
  date: string;
  label: string;
  planned: number;
  actual?: number; // cumulative % of topics checked via daily checklist by this date
  isToday: boolean;
  isFuture: boolean;
}

function getCheckedOnDate(dateStr: string): Set<string> {
  try {
    const raw = lsGet(DAILY_CHECK_PREFIX + dateStr);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch { return new Set(); }
}

export function getBurndownData(
  totalTopics: number,
  startDate: Date,
  endDate: Date,
): BurndownPoint[] {
  if (totalTopics === 0) return [];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayStr = isoDate(today);
  const startMs = startDate.getTime();
  const endMs = endDate.getTime();
  const totalMs = endMs - startMs;
  if (totalMs <= 0) return [];

  // Build cumulative unique topic IDs checked per day (start → today)
  const checkedByDate = new Map<string, number>(); // date → cumulative unique count
  const cumulativeIds = new Set<string>();
  const dayCursor = new Date(startDate); dayCursor.setHours(0, 0, 0, 0);
  while (dayCursor <= today) {
    const ds = isoDate(dayCursor);
    getCheckedOnDate(ds).forEach(id => cumulativeIds.add(id));
    checkedByDate.set(ds, cumulativeIds.size);
    dayCursor.setDate(dayCursor.getDate() + 1);
  }

  const totalDays = Math.round(totalMs / 86400000);
  const step = Math.max(1, Math.floor(totalDays / 18));
  const points: BurndownPoint[] = [];
  const cursor = new Date(startDate); cursor.setHours(0, 0, 0, 0);
  const endStr = isoDate(endDate);
  while (isoDate(cursor) <= endStr) {
    const elapsed = Math.max(0, cursor.getTime() - startMs);
    const planned = Math.min(100, Math.round((elapsed / totalMs) * 100));
    const dateStr = isoDate(cursor);
    const label = cursor.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const isFuture = cursor > today;
    const checkedCount = checkedByDate.get(dateStr);
    const actual = !isFuture && checkedCount !== undefined
      ? Math.min(100, Math.round((checkedCount / totalTopics) * 100))
      : undefined;
    points.push({ date: dateStr, label, planned, actual, isToday: dateStr === todayStr, isFuture });
    cursor.setDate(cursor.getDate() + step);
  }
  if (points[points.length - 1]?.date !== endStr) {
    const ed = new Date(endDate); ed.setHours(0, 0, 0, 0);
    const isFuture = ed > today;
    const checkedCount = checkedByDate.get(endStr);
    const actual = !isFuture && checkedCount !== undefined
      ? Math.min(100, Math.round((checkedCount / totalTopics) * 100))
      : undefined;
    points.push({ date: endStr, label: new Date(endStr + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }), planned: 100, actual, isToday: endStr === todayStr, isFuture });
  }
  return points;
}

// ─── Missed Plan Detection ────────────────────────────────────────────────────

export function getShiftDismissedDate(): string | null { return lsGet("sp-shift-dismissed-date"); }
export function setShiftDismissedDate(dateStr: string): void { lsSet("sp-shift-dismissed-date", dateStr); }

export function getOverdueItems(
  groups: SubjectGroup[],
  topicsMap: Record<string, Topic[]>,
  startDate: Date,
  endDate: Date,
  spacing: number,
  weightByDifficulty: boolean,
): ScheduledItem[] {
  const today = isoDate(new Date());
  const overrides = getDateOverrides();
  const scheduled = computeSchedule(groups, topicsMap, startDate, endDate, spacing, weightByDifficulty);
  return scheduled.filter(item => {
    const override = overrides[item.topic.id];
    const d1 = override ?? isoDate(item.firstDate);
    if (d1 >= today) return false;
    const live = (topicsMap[item.storageKey] ?? []).find(t => t.id === item.topic.id);
    const status = live?.status ?? item.topic.status;
    if (status === "Done" || status === "Revised") return false;
    // Topic is overdue only if it was NOT checked in the daily checklist on its scheduled date
    return !getCheckedOnDate(d1).has(item.topic.id);
  });
}
