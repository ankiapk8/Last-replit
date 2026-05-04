# Final Year Study Planner — Complete AI Prompt Guide

> **Purpose:** Use these prompts sequentially with any AI coding assistant (Claude, ChatGPT, Gemini, etc.) to rebuild the entire Final Year Study Planner as a **tab-embeddable widget** inside an existing website, **with no authentication required**. Each prompt is self-contained and builds on the previous one. Paste them one at a time and confirm the result before moving to the next.

---

## How the Embed Works

The planner is delivered as a single `<StudyPlannerTab />` React component. Drop it inside any existing React app as a new tab/route. It:

- Stores **all data in the browser's `localStorage`** — no login, no backend required for the core experience.
- Optionally connects to an **Express + PostgreSQL backend** for cross-device sync (prompts 14–15).
- Never modifies any existing routes, styles, or state in the host app.
- Is styled with **Tailwind CSS v4 + shadcn/ui** — if your host app already uses Tailwind, the component picks up your theme automatically.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Routing (internal) | wouter (lightweight, no conflicts with React Router) |
| State / Server cache | TanStack Query v5 |
| Backend (optional) | Express 5 + TypeScript |
| Database (optional) | PostgreSQL + Drizzle ORM |
| CSV export | Native Blob API |
| ZIP export | jszip |
| Calendar save-as-image | html2canvas |

---

## Subject Hierarchy Reference

The planner covers **14 subjects** across 5 parent groups:

```
Sub Medicine      → Dermatology, Family Medicine, Emergency, Forensic, Radiology
Psychiatric       → Psychiatric
Sub Surgery       → ENT, Ophthalmology, Orthopedic, Neurosurgery, Urology
Pediatric         → Pediatric
Gynecology        → Gynecology, Obstetric
```

Each subject has a `storageKey` (snake_case, used as the localStorage/DB key):
`dermatology`, `family`, `emergency`, `forensic`, `radiology`, `psychiatric`,
`ent`, `ophthalmology`, `orthopedic`, `neurosurgery`, `urology`, `pediatric`,
`gynecology`, `obstetric`

---

## localStorage Keys Reference

| Key | Type | Description |
|---|---|---|
| `schedule-start-date` | ISO string | Study schedule start |
| `schedule-end-date` | ISO string | Study schedule end |
| `schedule-spacing-days` | number string | Days between first & second study (default 14) |
| `weight-by-difficulty` | `"true"/"false"` | Sort Hard topics earlier |
| `study-activity` | `Record<YYYY-MM-DD, boolean>` | Daily study activity log |
| `last-backup-at` | ISO string | Timestamp of last JSON backup download |
| `settings-display-name` | string | User's preferred display name |
| `settings-default-status` | Status string | Default status for new topics |
| `settings-default-priority` | Priority string | Default priority for new topics |
| `welcomed-{userId}` | `"1"` | Whether the welcome modal was dismissed |

---

## Data Model

```typescript
type Status     = "Not Started" | "In Progress" | "Done" | "Revised";
type Difficulty = "Easy" | "Medium" | "Hard";
type Priority   = "Low" | "Medium" | "High";

interface Topic {
  id: string;
  name: string;
  subject: string;           // e.g. "Dermatology"
  filesAndMedia: string;     // URL to notes/Notability
  videoLink: string;         // YouTube/lecture URL
  universityLecturer: string;
  amboss: string;            // Amboss link
  notes: string;
  status: Status;
  difficultyLevel: Difficulty;
  priority: Priority;
  from: string;              // Source: Lecture / Textbook / Online
  estimatedMinutes?: number; // 0–300
}

interface SubjectGroup {
  parentLabel: string;   // e.g. "Sub Medicine"
  subjectLabel: string;  // e.g. "Dermatology"
  storageKey: string;    // e.g. "dermatology"
}

interface BackupData {
  version: 1;
  exportedAt: string;
  scheduleStartDate: string | null;
  scheduleEndDate?: string | null;
  scheduleSpacingDays?: number | null;
  topics: Record<string, Topic[]>;   // keyed by storageKey
}
```

---

## CSV / Notion Export Headers

```
Name, Subject, Parent Subject, Files and Media, Video Link,
University Lecturer, Amboss, First Study Date, Second Study Date,
Notes, Status, Difficulty Level, Priority, From, Est. Minutes
```

Dates are formatted `YYYY-MM-DD` (Notion date-picker compatible).

---

---

# PROMPT 1 — Project Setup & Dependencies

```
Create a new React + TypeScript + Vite project called "study-planner-embed".

Install these dependencies:
- tailwindcss@^4 (Tailwind CSS v4)
- @shadcn/ui (run: npx shadcn@latest init — choose "Default" style, CSS variables, yes to TypeScript)
- shadcn components needed: button, input, label, select, textarea, dialog, badge, tooltip, toaster, separator, scroll-area, tabs
- wouter (client-side routing)
- @tanstack/react-query@^5
- lucide-react
- jszip
- html2canvas

Configure vite.config.ts:
- Set base: "/" (or whatever path prefix the host app uses)
- Enable React plugin

Configure tsconfig.json with strict: true, path alias "@" → "./src"

The entry point is src/main.tsx. Export a named component StudyPlannerTab from src/StudyPlannerTab.tsx — this is the single component the host app will import and render inside a tab. It should render a <div> with text "Study Planner loaded" for now.

Do not add any routing at the top level — the host app controls the router. StudyPlannerTab manages its own internal routing using wouter's <MemoryRouter> so it never touches the host app's URL bar.

Show me the full file tree after setup.
```

---

# PROMPT 2 — Core Data Types & localStorage Utility Layer

```
In src/lib/topics.ts, implement the complete data layer for the study planner. No external dependencies — pure TypeScript with localStorage.

## Types to export
```typescript
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
```

## Constants & defaults
- DEFAULT_TOPIC: all fields empty string, status "Not Started", difficultyLevel "Medium", priority "Medium", estimatedMinutes 0
- ALL_SUBJECT_GROUPS: array of 14 SubjectGroup objects:
  {parentLabel:"Sub Medicine", subjectLabel:"Dermatology", storageKey:"dermatology"},
  {parentLabel:"Sub Medicine", subjectLabel:"Family", storageKey:"family"},
  {parentLabel:"Sub Medicine", subjectLabel:"Emergency", storageKey:"emergency"},
  {parentLabel:"Sub Medicine", subjectLabel:"Forensic", storageKey:"forensic"},
  {parentLabel:"Sub Medicine", subjectLabel:"Radiology", storageKey:"radiology"},
  {parentLabel:"Psychiatric", subjectLabel:"Psychiatric", storageKey:"psychiatric"},
  {parentLabel:"Sub Surgery", subjectLabel:"ENT", storageKey:"ent"},
  {parentLabel:"Sub Surgery", subjectLabel:"Ophthalmology", storageKey:"ophthalmology"},
  {parentLabel:"Sub Surgery", subjectLabel:"Orthopedic", storageKey:"orthopedic"},
  {parentLabel:"Sub Surgery", subjectLabel:"Neurosurgery", storageKey:"neurosurgery"},
  {parentLabel:"Sub Surgery", subjectLabel:"Urology", storageKey:"urology"},
  {parentLabel:"Pediatric", subjectLabel:"Pediatric", storageKey:"pediatric"},
  {parentLabel:"Gynecology", subjectLabel:"Gynecology", storageKey:"gynecology"},
  {parentLabel:"Gynecology", subjectLabel:"Obstetric", storageKey:"obstetric"}

## Color maps
```typescript
export const STATUS_COLORS: Record<Status, string> = {
  "Not Started": "bg-gray-100 text-gray-600",
  "In Progress": "bg-yellow-100 text-yellow-700",
  "Done":        "bg-green-100 text-green-700",
  "Revised":     "bg-blue-100 text-blue-700",
};
export const PRIORITY_COLORS: Record<Priority, string> = {
  Low:    "bg-gray-100 text-gray-600",
  Medium: "bg-yellow-100 text-yellow-700",
  High:   "bg-red-100 text-red-700",
};
export const DIFFICULTY_COLORS: Record<Difficulty, string> = {
  Easy:   "bg-green-100 text-green-700",
  Medium: "bg-yellow-100 text-yellow-700",
  Hard:   "bg-red-100 text-red-700",
};
```

## Utility functions
- generateId(): string — Math.random().toString(36).slice(2,9)
- isoDate(date: Date): string — returns "YYYY-MM-DD" in local time (do NOT use toISOString which gives UTC)

## localStorage helpers — all wrapped in try/catch
- getScheduleStartDate(): Date — reads "schedule-start-date", falls back to new Date()
- setScheduleStartDate(date: Date): void
- getScheduleEndDate(startDate: Date): Date — reads "schedule-end-date", falls back to last day of start month
- setScheduleEndDate(date: Date): void
- getScheduleWindowDays(startDate, endDate?): number — clamped 1–365
- getSpacingDays(): number — reads "schedule-spacing-days", default 14
- setSpacingDays(days: number): void
- getWeightByDifficulty(): boolean — reads "weight-by-difficulty" === "true"
- setWeightByDifficulty(val: boolean): void
- writeStudyActivity(date?: Date): void — writes today's isoDate key to "study-activity" Record<string,boolean>; after writing, dispatch new CustomEvent("study-activity-updated") on window
- computeStreak(): number — reads "study-activity", counts consecutive days backwards from today
- getStudyActivityLog(): Record<string, boolean> — reads "study-activity"
- getLastBackupAt(): Date | null — reads "last-backup-at"

## Schedule algorithm
```typescript
// Internal helper: spread topics evenly across daysWindow, add spacing for second date
function assignDates(topics: Topic[], startDate: Date, daysWindow: number, spacing: number):
  { topic: Topic; firstDate: Date; secondDate: Date }[]

// Sort order: priority High→Medium→Low first; then difficulty Hard→Medium→Easy if weightByDifficulty; then alphabetical
// Priority order numbers: High=0, Medium=1, Low=2
// Difficulty order numbers: Hard=0, Medium=1, Easy=2

export function computeSchedule(groups, topicsMap, startDate?, endDate?, spacing?, weightByDifficulty?): ScheduledItem[]
```

## CSV export
- NOTION_HEADERS: string[] = ["Name","Subject","Parent Subject","Files and Media","Video Link","University Lecturer","Amboss","First Study Date","Second Study Date","Notes","Status","Difficulty Level","Priority","From","Est. Minutes"]
- csvRow(cells: string[]): string — wraps each cell in double quotes, escapes internal quotes
- generateSubjectCSV(topics, subjectLabel, parentLabel, endDate?, spacing?): string
- generateGroupCSV(groups, parentLabel, topicsMap, endDate?, spacing?, weightByDifficulty?): string
- generateAllSubjectsCSV(groups, topicsMap, endDate?, spacing?, weightByDifficulty?): string
- generateSeparatedCSVs(groups, topicsMap, endDate?, spacing?, weightByDifficulty?): SeparatedCSV[]
- downloadCSV(content: string, filename: string): void — creates Blob with BOM (\uFEFF), triggers download
- downloadZip(files: SeparatedCSV[], zipName: string): Promise<void> — dynamic import jszip, zip all CSVs, download

## Backup
- exportBackup(groups, topicsMap): void — creates BackupData v1 JSON, downloads as study-planner-backup-YYYY-MM-DD.json; then writes now to "last-backup-at" localStorage
- importBackup(json: string): { ok: boolean; message: string; data?: BackupData } — parses JSON, validates version===1 and topics object exists

Show me the complete topics.ts file.
```

---

# PROMPT 3 — Topics Storage Hook (localStorage-based, no backend)

```
Create src/hooks/useTopics.ts — a React hook that manages all topic data using localStorage. This replaces any server/API calls from the original app.

The hook should:

1. Store topics in localStorage under each storageKey, e.g. localStorage.setItem("topics-dermatology", JSON.stringify(topics))
2. Read all 14 subject keys on mount into a topicsMap: Record<string, Topic[]>
3. Expose:
   - topicsMap: Record<string, Topic[]>
   - isLoading: boolean (true only on first mount)
   - upsertTopics(storageKey: string, topics: Topic[]): void — saves to localStorage, updates state
   - getAllTopics(): Topic[] — flat array of all 14 subjects

4. Listen for a custom window event "topics-updated" to sync across tabs
5. When upsertTopics is called, dispatch window.dispatchEvent(new CustomEvent("topics-updated"))

Also create a React context in src/context/TopicsContext.tsx that provides the hook result, and a <TopicsProvider> wrapper. StudyPlannerTab will wrap its internal content with TopicsProvider.

Storage key format: "sp-topics-{storageKey}" (prefix with "sp-" to avoid conflicts with the host app's localStorage).

Show me both files.
```

---

# PROMPT 4 — Topic Manager Component

```
Create src/components/TopicManager.tsx — the main CRUD interface for a single subject.

Props:
```typescript
interface TopicManagerProps {
  storageKey: string;       // e.g. "dermatology"
  subjectLabel: string;     // e.g. "Dermatology"
  parentLabel: string;      // e.g. "Sub Medicine"
  accentClass?: string;     // Tailwind text color class, default "text-primary"
}
```

## Features to implement

### Topic list
- A scrollable list of topic rows, each row showing:
  - Checkbox (for bulk select)
  - Topic name (bold)
  - Status pill — colored badge using STATUS_COLORS; clicking it cycles through [Not Started → In Progress → Done → Revised → Not Started]. When cycled to "Done" or "Revised", call writeStudyActivity().
  - Priority pill — colored badge using PRIORITY_COLORS; clicking cycles [High → Medium → Low → High]
  - Difficulty pill — colored using DIFFICULTY_COLORS (read-only display, editable in the form)
  - Estimated time badge (Clock icon + "30m" or "1h 30m") — only shown when estimatedMinutes > 0
  - Edit button (pencil icon) — opens the edit dialog
  - Delete button (trash icon) — removes the topic

### Search & filter bar
- Text search input (case-insensitive name match) with clear button
- Status filter chips (toggleable): Not Started, In Progress, Done, Revised — active chips use STATUS_COLORS
- Priority filter chips (toggleable): High, Medium, Low — active chips use PRIORITY_COLORS
- "Clear filters" link when any filter is active
- Result count label: "X topics" normally, "Showing X of Y" when filtered

### Bulk actions floating bar
- Appears at bottom of screen when ≥1 rows are checked (position: fixed, bottom-20 on mobile, bottom-4 on md+, to clear mobile nav)
- Shows: selected count, "Select All" / "Deselect All" links
- "Set Status →" dropdown: selecting a value immediately applies it to all selected topics; calls writeStudyActivity() if value is "Done" or "Revised"
- "Set Priority →" dropdown: same immediate-apply pattern
- Both dropdowns disabled while a save is in-flight

### Add/Edit Topic dialog (shadcn Dialog)
Title: "Add Topic — {subjectLabel}" or "Edit Topic"
Fields:
1. Topic Name * (required, text input)
2. Status (Select: Not Started, In Progress, Done, Revised) — default from localStorage "settings-default-status" or "Not Started"
3. Priority (Select: Low, Medium, High) — default from localStorage "settings-default-priority" or "Medium"
4. Difficulty Level (Select: Easy, Medium, Hard) — default Medium
5. Est. Study Time (mins) (number input, 0–300)
6. University Lecturer (text)
7. Files and Media (URL text)
8. Video Link (URL text)
9. Amboss Link (URL text)
10. From / Source (text: "Lecture / Textbook / Online")
11. Notes (textarea, 3 rows)
Save button is disabled when Topic Name is empty.

### Stats bar (above the list)
Three stat cards: Total Topics, Not Started, High Priority
Purple banner below: "⏱ Time remaining: Xh Ym across N topics" — only when total estimated minutes > 0

### Export CSV button
Exports this subject's topics as a Notion-ready CSV using generateSubjectCSV()

### Schedule info banner
Blue info banner: "N topics spread across [Start Date] – [End Date]. Dates in YYYY-MM-DD format (Notion-ready). Sorted High → Medium → Low priority."

Use the useTopics() hook (from Prompt 3) for all data operations. Call writeStudyActivity() whenever a topic is saved/edited/created with status Done or Revised.

Show me the complete TopicManager.tsx file.
```

---

# PROMPT 5 — Subject Pages (5 pages + shared TopicPage)

```
Create these pages. Each page renders a back arrow header + a list of subject sections using TopicManager.

## src/pages/TopicPage.tsx
A generic page for a single subject (the 9 subjects that don't have sub-subjects).
Props: { path: string } — used to look up which storageKey/subjectLabel/parentLabel to render.

Maintain a lookup table mapping path → { storageKey, subjectLabel, parentLabel, accentClass }.

Paths and their subjects:
- "/sub-medicine/dermatology"  → {storageKey:"dermatology", subjectLabel:"Dermatology", parentLabel:"Sub Medicine", accentClass:"text-blue-600"}
- "/sub-medicine/family"       → {storageKey:"family", subjectLabel:"Family Medicine", parentLabel:"Sub Medicine", accentClass:"text-blue-600"}
- "/sub-medicine/emergency"    → {storageKey:"emergency", subjectLabel:"Emergency", parentLabel:"Sub Medicine", accentClass:"text-blue-600"}
- "/sub-medicine/forensic"     → {storageKey:"forensic", subjectLabel:"Forensic", parentLabel:"Sub Medicine", accentClass:"text-blue-600"}
- "/sub-medicine/radiology"    → {storageKey:"radiology", subjectLabel:"Radiology", parentLabel:"Sub Medicine", accentClass:"text-blue-600"}
- "/psychiatric"               → {storageKey:"psychiatric", subjectLabel:"Psychiatric", parentLabel:"Psychiatric", accentClass:"text-purple-600"}
- "/sub-surgery/ent"           → {storageKey:"ent", subjectLabel:"ENT", parentLabel:"Sub Surgery", accentClass:"text-orange-600"}
- "/sub-surgery/ophthalmology" → {storageKey:"ophthalmology", subjectLabel:"Ophthalmology", parentLabel:"Sub Surgery", accentClass:"text-orange-600"}
- "/sub-surgery/orthopedic"    → {storageKey:"orthopedic", subjectLabel:"Orthopedic", parentLabel:"Sub Surgery", accentClass:"text-orange-600"}
- "/sub-surgery/neurosurgery"  → {storageKey:"neurosurgery", subjectLabel:"Neurosurgery", parentLabel:"Sub Surgery", accentClass:"text-orange-600"}
- "/sub-surgery/urology"       → {storageKey:"urology", subjectLabel:"Urology", parentLabel:"Sub Surgery", accentClass:"text-orange-600"}
- "/pediatric"                 → {storageKey:"pediatric", subjectLabel:"Pediatric", parentLabel:"Pediatric", accentClass:"text-green-600"}
- "/gynecology/gynecology"     → {storageKey:"gynecology", subjectLabel:"Gynecology", parentLabel:"Gynecology", accentClass:"text-pink-600"}
- "/gynecology/obstetric"      → {storageKey:"obstetric", subjectLabel:"Obstetric", parentLabel:"Gynecology", accentClass:"text-pink-600"}

Render: back arrow button (navigates to parent path), subject title, TopicManager.

## src/pages/SubMedicine.tsx
Header: "🩺 Sub Medicine" with back arrow to "/"
5 clickable cards (one per sub-subject): Dermatology, Family Medicine, Emergency, Forensic, Radiology
Each card shows: subject name, topic count (from useTopics()), completion % progress bar
Card navigates to the sub-subject route on click.

## src/pages/SubSurgery.tsx
Same pattern — "🔬 Sub Surgery" with ENT, Ophthalmology, Orthopedic, Neurosurgery, Urology

## src/pages/Gynecology.tsx
Same pattern — "🌸 Gynecology" with Gynecology, Obstetric

Show me all the files.
```

---

# PROMPT 6 — Calendar View Component

```
Create src/components/CalendarView.tsx — a multi-month animated study calendar.

Props:
```typescript
interface CalendarViewProps {
  groups: SubjectGroup[];
  topicsMap: Record<string, Topic[]>;
  startDate: Date;
  endDate: Date;
  spacing: number;
  weightByDifficulty: boolean;
  onRangeChange?: (start: Date, end: Date) => void;
}
```

## Core behavior

1. Compute the full schedule using computeSchedule() from topics.ts into an array of ScheduledItem.
2. Build a byDay map: Record<YYYY-MM-DD, ScheduledItem[]> — a topic can appear on its firstDate AND its secondDate.
3. Render ALL months between startDate and endDate as stacked grids (multi-month, scroll to see all).
4. Each month grid:
   - Month name header (e.g. "MAY 2026") — first month has a plain centered label; subsequent months have a horizontal rule flanking the label as a visual divider
   - 7-column day-of-week header row (Sun Mon Tue Wed Thu Fri Sat)
   - Day cells: empty cells for days before/after the month; active cells show colored dot badges for each topic scheduled that day
5. Each day cell is clickable — clicking opens a day detail panel (below the calendar or in a side panel) showing all topics for that day with their status/priority pills and an inline status edit.
6. "Today" button scrolls to the current month section using scrollIntoView.
7. "Save as Image" button uses html2canvas to capture the full calendar div and download as PNG.
8. Month picker tab strip: when schedule spans > 1 month, show a sticky horizontal strip of abbreviated month buttons (e.g. "May", "Jun 2026"). Clicking any scrolls to that month. An IntersectionObserver highlights the currently visible month's button.

## Day detail panel
When a day is selected:
- Show date heading
- List all topics scheduled for that day (first study or second study)
- Per topic: name, subject badge, status pill (clickable to cycle), priority pill
- Clicking the status pill cycles it and saves via upsertTopics; calls writeStudyActivity() for Done/Revised
- "No topics today" message if the day has no scheduled topics

## Topic dot colors
Use the subject's accent color for dots. Map parentLabel → Tailwind bg color:
- Sub Medicine → bg-blue-500
- Psychiatric → bg-purple-500
- Sub Surgery → bg-orange-500
- Pediatric → bg-green-500
- Gynecology → bg-pink-500

Show me the complete CalendarView.tsx.
```

---

# PROMPT 7 — Dashboard Home Page

```
Create src/pages/Home.tsx — the main dashboard page of the planner.

## User bar (top)
- Shows display name: reads localStorage "settings-display-name", falls back to "Student"
- Gear icon button → navigates to /settings
- No logout button (no auth in this version)

## Header
- BookOpen icon + "Final Year Study Planner" title
- Subtitle: "Schedule [Start] → [End] · N days"

## Backup reminder banner
- Amber dismissible banner shown when: last backup was > 7 days ago AND there are topics
- Reads "last-backup-at" from localStorage
- "Download Now" button triggers exportBackup(); X button dismisses for the session

## Dashboard accordion section (collapsible, default open)
Header: BarChart3 icon + "Dashboard" + streak flame badge (🔥 N days, orange) if streak > 0
Controls in header: Start date picker, End date picker, Spacing days input (number, 1–365), "Hard first" toggle switch

### Inside the dashboard (only when totalTopics > 0)

**Stat cards (2×2 grid on mobile, 4 columns on sm+):**
1. Total topics (primary color)
2. High Priority count (red)
3. Completed (Done + Revised) count (green)
4. Time Remaining: total estimatedMinutes for Not Started + In Progress, formatted as "Xh Ym" (blue)

**8-Week Activity Heatmap:**
- 56 cells (8 weeks × 7 days), column-major layout (each column = one week)
- Aligned to Monday boundaries
- Month labels above new-month columns
- Day-of-week labels M T W T F S S on the left
- Green cells = days with activity, gray = no activity, faded = future, ring = today
- Active day count label ("X active days")
- Legend: gray square "No activity" / green square "Studied"
- Reacts to "study-activity-updated" window events (add a useState counter + useEffect listener, pass as dep to the activityLog useMemo)

**Overall progress bar:** green fill showing (Done+Revised)/Total %; status legend below

**Priority breakdown bar:** stacked bar: High (red) | Medium (amber) | Low (blue)

**Completion per subject:** one row per subject with topics, showing:
- Subject icon, name, topic count
- "Go to topics →" link
- Completion %
- Progress bar (emerald=Done, green=Revised, amber=In Progress)
- Status breakdown badges (Not Started, In Progress, Done, Revised counts)
- "Time Remaining: Xh Ym" in violet

## Export & Download accordion section (collapsible, default closed)
- "Download Combined CSV" button — all 14 subjects in one CSV
- "Download as ZIP" button — one CSV per subject, zipped
- Download progress indicator
- Collapsible Notion import guide (4 steps with emoji icons)

## Backup & Restore accordion section (collapsible, default closed)
- "Download Backup" button → exportBackup()
- "Restore from Backup" button → triggers hidden file input → importBackup() → upsertTopics for each subject → reload page
- Import success/error status message

## Subjects grid
5 subject cards (one per parent group): Sub Medicine 🩺, Psychiatric 🧠, Sub Surgery 🔬, Pediatric 👶, Gynecology 🌸
Each card:
- Background/border/text colors per subject (blue, purple, orange, green, pink)
- Completion % and progress bar
- "X topics" count
- Clicking navigates to the subject page

## Calendar View
Renders CalendarView component below the subjects grid. A numeric calendarKey state is incremented whenever date/spacing/weight settings change, forcing CalendarView to remount and recompute.

## State management
- All date/spacing/weight state reads from localStorage on mount
- All setting handlers persist to localStorage AND update React state AND increment calendarKey
- useTopics() hook for data

Show me the complete Home.tsx file.
```

---

# PROMPT 8 — Settings Page

```
Create src/pages/Settings.tsx — a user preferences page at route /settings.

## Layout
- Back arrow button → navigates to /
- Page title: SettingsIcon + "Settings"
- Three collapsible sections (using the same CSS grid transition pattern: gridTemplateRows 0fr↔1fr)

## Section 1 — Display
- "Display Name" text input: shown in place of "Student" throughout the app
- Reads from / saves to localStorage "settings-display-name"

## Section 2 — New Topic Defaults
- "Default Status" Select: Not Started / In Progress / Done / Revised — localStorage "settings-default-status"
- "Default Priority" Select: Low / Medium / High — localStorage "settings-default-priority"
- These values are used as defaults when the Add Topic dialog opens

## Section 3 — Schedule
- "Spacing Days" number input (1–365): mirrors the dashboard spacing control — localStorage "schedule-spacing-days"
- Changing it here also updates the dashboard's calendarKey (you can skip this sync and just note that the user needs to return to home to see calendar updated)

## Save button
- A single "Save Preferences" button at the bottom
- Shows a green checkmark and "Saved!" for 2 seconds after saving
- On save: writes all three localStorage keys

## Notes
- No server calls in this component (all localStorage)
- Changes to display name take effect immediately on next navigation to /

Show me the complete Settings.tsx file.
```

---

# PROMPT 9 — Mobile Bottom Navigation Bar

```
Create src/components/MobileBottomNav.tsx — a fixed bottom nav bar visible only on mobile (hidden on md+ screens).

Behavior:
- Only renders on the home route (internal route "/")
- Three tabs: 🏠 Home (scroll to top), 📅 Calendar (scrolls to [data-calendar-section]), 📚 Subjects (scrolls to [data-subjects-section])
- Uses window.scrollY + getBoundingClientRect to determine the active tab (highlight with primary color)
- Fixed positioning, z-50, full width, white background, border-top
- Height: h-14 (56px) + padding for iOS home indicator (paddingBottom: env(safe-area-inset-bottom))
- The host page should have pb-14 on mobile to avoid content being hidden behind it

In Home.tsx:
- Add data-calendar-section attribute to the CalendarView wrapper div
- Add data-subjects-section attribute to the "Subjects" heading div

Show me the complete MobileBottomNav.tsx and the relevant changes to Home.tsx.
```

---

# PROMPT 10 — Internal Router & StudyPlannerTab Entry Point

```
Create src/StudyPlannerTab.tsx — the single component the host app imports.

Requirements:
1. Use wouter's <MemoryRouter> (NOT BrowserRouter or HashRouter) so all routing is internal and never touches the host app's URL bar.
2. Wrap everything in <TopicsProvider> (from Prompt 3).
3. Wrap everything in <QueryClientProvider> with a private QueryClient instance.
4. Render <Toaster /> from shadcn for toast notifications.

Internal route table (using wouter <Switch> and <Route>):
- "/"                           → <Home />
- "/settings"                   → <Settings />
- "/sub-medicine"               → <SubMedicine />
- "/sub-surgery"                → <SubSurgery />
- "/gynecology"                 → <Gynecology />
- "/sub-medicine/dermatology"   → <TopicPage path="/sub-medicine/dermatology" />
- "/sub-medicine/family"        → <TopicPage path="/sub-medicine/family" />
- "/sub-medicine/emergency"     → <TopicPage path="/sub-medicine/emergency" />
- "/sub-medicine/forensic"      → <TopicPage path="/sub-medicine/forensic" />
- "/sub-medicine/radiology"     → <TopicPage path="/sub-medicine/radiology" />
- "/psychiatric"                → <TopicPage path="/psychiatric" />
- "/sub-surgery/ent"            → <TopicPage path="/sub-surgery/ent" />
- "/sub-surgery/ophthalmology"  → <TopicPage path="/sub-surgery/ophthalmology" />
- "/sub-surgery/orthopedic"     → <TopicPage path="/sub-surgery/orthopedic" />
- "/sub-surgery/neurosurgery"   → <TopicPage path="/sub-surgery/neurosurgery" />
- "/sub-surgery/urology"        → <TopicPage path="/sub-surgery/urology" />
- "/pediatric"                  → <TopicPage path="/pediatric" />
- "/gynecology/gynecology"      → <TopicPage path="/gynecology/gynecology" />
- "/gynecology/obstetric"       → <TopicPage path="/gynecology/obstetric" />

Also add <MobileBottomNav /> outside the Switch (always mounted, self-hides when not on "/").

Show me StudyPlannerTab.tsx, and show me how a host app would import and render it:
```jsx
// In host app (e.g. inside a Tabs component):
import { StudyPlannerTab } from "./study-planner-embed/src/StudyPlannerTab";

function MyApp() {
  return (
    <Tabs defaultValue="study">
      <TabsList>
        <TabsTrigger value="study">Study Planner</TabsTrigger>
        <TabsTrigger value="other">Other Feature</TabsTrigger>
      </TabsList>
      <TabsContent value="study">
        <StudyPlannerTab />
      </TabsContent>
    </Tabs>
  );
}
```
```

---

# PROMPT 11 — Styling & Theme Integration

```
The study planner uses Tailwind CSS v4. Make it work inside an existing host app without breaking the host app's styles.

## If the host app already uses Tailwind v4
No extra setup needed. The planner's Tailwind classes share the host's theme. To use a custom accent color for the planner without affecting the host app:

In the planner's CSS (src/index.css), scope CSS variables under a wrapper class:
```css
.sp-root {
  --primary: oklch(0.55 0.18 250); /* custom blue for the planner */
  --primary-foreground: oklch(1 0 0);
  /* ... other overrides */
}
```

Then wrap StudyPlannerTab's root div with className="sp-root".

## If the host app does NOT use Tailwind
In vite.config.ts, configure Tailwind to only process files inside this package using the `content` array. The planner's styles will be bundled separately and won't leak.

## shadcn/ui components
All shadcn components are locally generated in src/components/ui/ — they don't conflict with any existing shadcn installation in the host app because they're in a different path scope.

## z-index safety
The bulk action bar uses z-50.
The mobile bottom nav uses z-50.
If the host app has elements at z-50+, bump these to z-[60] and z-[60] respectively.

Show me the final src/index.css with all required CSS variables and the sp-root scoping class.
```

---

# PROMPT 12 — Optional Backend: Express + PostgreSQL + Drizzle ORM

```
This is optional. Skip if you want to use localStorage-only storage (Prompts 1–11 give you a fully working app). Add this if you want cross-device sync.

## Database schema (lib/db/schema/topics.ts)

```typescript
import { pgTable, text, jsonb, timestamp, integer } from "drizzle-orm/pg-core";

// Topics table: one row per user per subject
export const topicsTable = pgTable("topics", {
  id: text("id").primaryKey().notNull(),  // userId:storageKey
  userId: text("user_id").notNull(),
  storageKey: text("storage_key").notNull(),
  topics: jsonb("topics").notNull().default([]),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// User preferences table
export const userPreferencesTable = pgTable("user_preferences", {
  userId: text("user_id").primaryKey().notNull(),
  scheduleStartDate: text("schedule_start_date"),  // YYYY-MM-DD
  scheduleEndDate: text("schedule_end_date"),
  spacingDays: integer("spacing_days"),
  weightByDifficulty: text("weight_by_difficulty").default("false"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
```

## API routes (Express)

### GET /api/topics
Returns all topics for the requesting user as { topics: Record<storageKey, Topic[]> }

### PUT /api/topics/:storageKey
Body: { topics: Topic[] }
Upserts (INSERT ... ON CONFLICT DO UPDATE) the row for this user+storageKey

### GET /api/preferences
Returns the user's schedule preferences

### PUT /api/preferences
Body: { scheduleStartDate?, scheduleEndDate?, spacingDays?, weightByDifficulty? }
Upserts the row for this user

## User identity without auth
Since there's no login, generate a stable anonymous user ID on first visit:
```typescript
function getAnonymousUserId(): string {
  const KEY = "sp-anon-user-id";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}
```

Pass this ID in every API request as the X-User-Id header. The backend reads it from req.headers["x-user-id"].

Note: This is NOT secure — anyone who knows another user's UUID can read their data. For a private/personal tool this is acceptable. For a shared deployment, add a simple password or PIN gate.

## Updating useTopics hook
Replace the localStorage-only implementation with React Query hooks that:
- GET /api/topics on mount
- PUT /api/topics/:storageKey on upsert
- Fall back to localStorage values if the server is unreachable

Show me the schema file, the two Express route files, and the updated useTopics.ts with React Query.
```

---

# PROMPT 13 — OpenAPI Spec & Codegen (if using the backend)

```
Create lib/api-spec/openapi.yaml defining the Topics and Preferences API contracts.

Paths:
- GET  /api/healthz → { status: "ok" }
- GET  /api/topics  → TopicsEnvelope { topics: Record<string, Topic[]> }
- PUT  /api/topics/{storageKey} → UpsertTopicsRequest { topics: Topic[] } → TopicsEnvelope
- GET  /api/preferences → PreferencesEnvelope { preferences: SchedulePreferences }
- PUT  /api/preferences → UpsertPreferencesRequest → PreferencesEnvelope

SchedulePreferences schema:
```yaml
SchedulePreferences:
  type: object
  properties:
    scheduleStartDate: { type: string, nullable: true }
    scheduleEndDate:   { type: string, nullable: true }
    spacingDays:       { type: integer, nullable: true }
    weightByDifficulty:{ type: boolean, nullable: true }
```

Topic schema (all fields from the Topic interface in Prompt 2).

Use Orval to generate React Query hooks and Zod schemas from the OpenAPI spec:
- Install: @orval/core, orval
- Config in orval.config.ts: client "react-query", output to lib/api-client-react/src/generated/, Zod schemas to lib/api-zod/src/generated/
- Run: pnpm --filter @workspace/api-spec run codegen

Show me the openapi.yaml and orval.config.ts.
```

---

# PROMPT 14 — Integration Checklist: Embed Into an Existing Website

```
I have an existing React website and I want to add the Study Planner as a new tab without disturbing anything. Give me a step-by-step integration checklist.

Assume the host app uses React 18 + TypeScript + Tailwind CSS v4.

## Steps

### 1. Copy the planner source
Copy the src/ folder from study-planner-embed into host-app/src/study-planner/.

### 2. Install missing dependencies
Check that the host app has these — install any that are missing:
- wouter
- @tanstack/react-query (v5)
- lucide-react
- jszip
- html2canvas
- shadcn/ui components: button, input, label, select, textarea, dialog, badge, tooltip, toaster, separator, scroll-area, tabs

### 3. Add the tab to the host app's navigation
```tsx
// In your existing navigation/tabs component:
import StudyPlannerTab from "@/study-planner/StudyPlannerTab";

// Add a new tab panel:
<TabsContent value="study-planner">
  <StudyPlannerTab />
</TabsContent>
```

### 4. Ensure the host app's QueryClient doesn't conflict
StudyPlannerTab creates its own private QueryClient internally. This means it has its own cache, completely separate from the host app's cache. No action needed.

### 5. localStorage namespace
All study planner keys are prefixed with "sp-" so they don't collide with the host app's own localStorage keys. Verify the host app doesn't already use the prefix "sp-".

### 6. z-index audit
Check that no host app modals, toasts, or drawers use z-index > 50. If they do, increase the planner's MobileBottomNav and bulk action bar z-index to z-[70].

### 7. Tailwind scoping (if the host app customizes --primary)
Wrap StudyPlannerTab's root div in className="sp-root" and define custom CSS variables under .sp-root in the planner's CSS file to prevent the host app's primary color overriding the planner's accent.

### 8. Mobile safe-area padding
If the host app has a fixed bottom bar (e.g., its own mobile nav), the planner's MobileBottomNav may overlap it. In that case, disable MobileBottomNav by passing a prop: <StudyPlannerTab hideMobileNav />.

### 9. Verify TypeScript paths
In the host tsconfig.json, add an alias for the planner if needed:
```json
"paths": {
  "@sp/*": ["./src/study-planner/*"]
}
```

### 10. Final test
- Open the Study Planner tab, add a topic → confirm it persists on refresh
- Switch to another tab in the host app → confirm the host app is unaffected
- Return to Study Planner tab → confirm topics are still there

Show me a minimal example of a host app's App.tsx that embeds the study planner as one of three tabs using shadcn Tabs.
```

---

# PROMPT 15 — Full Feature Verification Checklist

```
The study planner embed is complete. Walk me through testing every feature to confirm nothing is broken. For each item, describe what to click/do and what the expected result is.

## Data & CRUD
- [ ] Add a topic to Dermatology: name "Acne Vulgaris", High priority, Hard difficulty, 60 mins, notes "Key concepts"
- [ ] Verify it appears in the topic list with correct status/priority/difficulty badges
- [ ] Click the status pill → cycles Not Started → In Progress → Done → Revised
- [ ] Click the priority pill → cycles
- [ ] Edit the topic: change name to "Acne Vulgaris (Updated)"
- [ ] Delete the topic: confirm it disappears
- [ ] Add 3 more topics with different priorities, check they sort correctly in the CSV

## Search & Filter
- [ ] Type "acne" in the search box → list filters to matching topics
- [ ] Click "High" priority chip → only High priority topics shown
- [ ] Click "Clear filters" → all topics shown again

## Bulk Actions
- [ ] Select 2 topics via checkboxes → bulk action bar appears
- [ ] Use "Set Status →" dropdown → both topics change status immediately
- [ ] Click "Select All" → all topics checked
- [ ] Click "Deselect All" → none checked

## Calendar
- [ ] Set schedule start to today, end to 3 months from now
- [ ] Calendar shows all 3 months stacked
- [ ] Month picker strip at top — click "Month 2" → scrolls to it
- [ ] Click a day with scheduled topics → detail panel shows topics for that day
- [ ] Click a status pill in the detail panel → topic status updates
- [ ] Click "Today" button → scrolls to current month
- [ ] Click "Save as Image" → PNG downloads

## Dashboard
- [ ] Streak badge shows 🔥 1 day after marking a topic Done today
- [ ] 8-week heatmap shows today's cell with a ring and green fill
- [ ] Stats: Total count matches, High Priority count matches, Completed increments after marking Done
- [ ] Time Remaining shows correct sum in "Xh Ym" format
- [ ] Per-subject progress bars update

## Export
- [ ] "Download Combined CSV" → downloads one CSV with all subjects
- [ ] "Download as ZIP" → downloads ZIP with per-subject CSVs
- [ ] Open a CSV in Excel/Notion — verify all 15 columns present and dates in YYYY-MM-DD

## Settings
- [ ] Navigate to /settings (gear icon)
- [ ] Set Display Name to "Dr. Ahmed" → back to home → user bar shows "Dr. Ahmed"
- [ ] Set Default Status to "In Progress" → open Add Topic dialog → Status pre-selected as In Progress
- [ ] Change Spacing to 21 days → save → calendar updates with 21-day gaps

## Backup & Restore
- [ ] Click "Download Backup" → JSON file downloads
- [ ] Add a new topic
- [ ] Click "Restore from Backup" → select the JSON file → page reloads with old data (new topic is gone)

## Backup Reminder
- [ ] Manually set localStorage "last-backup-at" to 8 days ago (in browser console: localStorage.setItem("last-backup-at", new Date(Date.now()-8*86400000).toISOString()))
- [ ] Refresh → amber banner appears at top
- [ ] Click X → banner dismisses for the session

## Mobile
- [ ] Resize browser to mobile width → bottom nav bar appears with 3 tabs
- [ ] Click Calendar tab → scrolls to calendar section
- [ ] Click Subjects tab → scrolls to subjects grid
- [ ] Open a topic detail page → bottom nav is hidden (correct)
- [ ] Bulk action bar appears above the bottom nav (not hidden behind it)

## Embed isolation
- [ ] Switch to another tab in the host app → host app renders normally, no style bleed
- [ ] Switch back to Study Planner tab → data and scroll position preserved
- [ ] Hard refresh → all data still in localStorage

All items should pass. Report any failures.
```

---

## Quick Reference: Key Files

| File | Purpose |
|---|---|
| `src/lib/topics.ts` | All data types, schedule algorithm, CSV export, backup, localStorage helpers |
| `src/hooks/useTopics.ts` | React hook for topic CRUD (localStorage or API) |
| `src/context/TopicsContext.tsx` | Context provider for topics data |
| `src/components/TopicManager.tsx` | Per-subject CRUD UI with search, filter, bulk actions |
| `src/components/CalendarView.tsx` | Multi-month animated study calendar |
| `src/components/MobileBottomNav.tsx` | Fixed mobile bottom navigation (3 tabs) |
| `src/pages/Home.tsx` | Main dashboard (stats, heatmap, export, backup, subjects) |
| `src/pages/Settings.tsx` | User preferences (display name, defaults, spacing) |
| `src/pages/SubMedicine.tsx` | Sub-subject listing for Sub Medicine |
| `src/pages/SubSurgery.tsx` | Sub-subject listing for Sub Surgery |
| `src/pages/Gynecology.tsx` | Sub-subject listing for Gynecology |
| `src/pages/TopicPage.tsx` | Generic single-subject topic manager page |
| `src/StudyPlannerTab.tsx` | Root entry point — drop this into any host app tab |

---

## Customisation Notes

- **Change subjects:** Edit the `ALL_SUBJECT_GROUPS` array in `topics.ts` and update the `SUBJECTS` config in `Home.tsx`. No other files need changes.
- **Change accent color:** Update `--primary` in `.sp-root` in `index.css`.
- **Add a new topic field:** Add the field to the `Topic` interface, `DEFAULT_TOPIC`, the `TopicForm` in `TopicManager.tsx`, `NOTION_HEADERS` array, and all `csvRow()` calls in `topics.ts`.
- **Increase backup reminder threshold:** Change the `> 7` comparison in `Home.tsx` `showBackupReminder` useMemo.
- **Remove the heatmap:** Delete the `{/* Activity heatmap */}` block in `Home.tsx`.

---

*Generated from the Final Year Study Planner codebase — May 2026*
