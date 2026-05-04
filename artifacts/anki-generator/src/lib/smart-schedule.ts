export interface DeckInfo {
  id: number;
  name: string;
  cardCount: number;
}

export interface SmartScheduleDeckSlot {
  deckId: number;
  deckName: string;
  cardCount: number;
  isReview: boolean;
  slotId: string;
}

export interface SmartScheduleDay {
  date: string;
  slots: SmartScheduleDeckSlot[];
}

export interface SmartScheduleConfig {
  examDate: string;
  startDate: string;
  availableDays: number[];
  deckIds: number[];
}

export interface SmartSchedule {
  config: SmartScheduleConfig;
  days: SmartScheduleDay[];
  createdAt: string;
}

const SS_KEY = "ankigen_smart_schedule";

function lsGet(k: string): string | null {
  try { return localStorage.getItem(k); } catch { return null; }
}
function lsSet(k: string, v: string): void {
  try { localStorage.setItem(k, v); } catch {}
}
function lsDel(k: string): void {
  try { localStorage.removeItem(k); } catch {}
}

export function getSmartSchedule(): SmartSchedule | null {
  const raw = lsGet(SS_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as SmartSchedule; } catch { return null; }
}

export function saveSmartSchedule(s: SmartSchedule): void {
  lsSet(SS_KEY, JSON.stringify(s));
  window.dispatchEvent(new CustomEvent("smart-schedule-changed"));
}

export function clearSmartSchedule(): void {
  lsDel(SS_KEY);
  window.dispatchEvent(new CustomEvent("smart-schedule-changed"));
}

export function isoDateSS(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getStudyDates(start: Date, examDate: Date, availableDays: number[]): Date[] {
  const daySet = new Set(availableDays.length > 0 ? availableDays : [1, 2, 3, 4, 5]);
  const dates: Date[] = [];
  const cur = new Date(start);
  cur.setHours(0, 0, 0, 0);
  const end = new Date(examDate);
  end.setHours(0, 0, 0, 0);
  while (cur < end) {
    if (daySet.has(cur.getDay())) dates.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

let _uidCounter = 0;
function uid(): string {
  return `${Date.now()}-${++_uidCounter}-${Math.random().toString(36).slice(2, 6)}`;
}

export function generateSmartSchedule(
  decks: DeckInfo[],
  examDate: Date,
  availableDays: number[],
  startDate: Date,
): SmartSchedule {
  const studyDates = getStudyDates(startDate, examDate, availableDays);

  const config: SmartScheduleConfig = {
    examDate: isoDateSS(examDate),
    startDate: isoDateSS(startDate),
    availableDays,
    deckIds: decks.map(d => d.id),
  };

  if (studyDates.length === 0 || decks.length === 0) {
    return { config, days: [], createdAt: new Date().toISOString() };
  }

  const sorted = [...decks].sort((a, b) => b.cardCount - a.cardCount);

  const dayMap = new Map<string, SmartScheduleDeckSlot[]>();
  studyDates.forEach(d => dayMap.set(isoDateSS(d), []));

  const splitIdx = Math.max(1, Math.floor(studyDates.length * 0.55));
  const firstDates = studyDates.slice(0, splitIdx);
  const reviewDates = studyDates.slice(Math.floor(studyDates.length * 0.45));

  sorted.forEach((deck, i) => {
    const dayIdx = sorted.length > 1
      ? Math.round((i / (sorted.length - 1)) * (firstDates.length - 1))
      : 0;
    const dateStr = isoDateSS(firstDates[Math.min(dayIdx, firstDates.length - 1)]);
    dayMap.get(dateStr)!.push({
      deckId: deck.id, deckName: deck.name, cardCount: deck.cardCount,
      isReview: false, slotId: uid(),
    });
  });

  sorted.forEach((deck, i) => {
    const dayIdx = sorted.length > 1
      ? Math.round((i / (sorted.length - 1)) * (reviewDates.length - 1))
      : 0;
    const dateStr = isoDateSS(reviewDates[Math.min(dayIdx, reviewDates.length - 1)]);
    dayMap.get(dateStr)!.push({
      deckId: deck.id, deckName: deck.name, cardCount: deck.cardCount,
      isReview: true, slotId: uid(),
    });
  });

  const days: SmartScheduleDay[] = studyDates.map(d => {
    const dateStr = isoDateSS(d);
    return { date: dateStr, slots: dayMap.get(dateStr) ?? [] };
  });

  return { config, days, createdAt: new Date().toISOString() };
}

export function getSmartScheduleTodaySlots(): SmartScheduleDeckSlot[] {
  const schedule = getSmartSchedule();
  if (!schedule) return [];
  const today = isoDateSS(new Date());
  return schedule.days.find(d => d.date === today)?.slots ?? [];
}
