export type StudySession = {
  id: string;
  deckId: number;
  deckName: string;
  total: number;
  known: number;
  unknown: number;
  completedAt: string; // ISO string
  date: string; // YYYY-MM-DD
};

export type StudySavePoint = {
  deckId: number;
  cardIds: number[];
  index: number;
  knownIds: number[];
  unknownIds: number[];
  savedAt: string;
};

// --- QBank analytics types ---

export type QBankQuestionResult = {
  questionId: number;
  selectedIndex: number;
  correct: boolean;
  timeSeconds: number;
  tags: string[];
};

export type QBankSession = {
  id: string;
  qbankId: number;
  qbankName: string;
  results: QBankQuestionResult[];
  startedAt: string;
  completedAt: string;
  totalSeconds: number;
  filterMode: "all" | "unseen" | "wrong" | "flagged";
  timed: boolean;
  secondsPerQuestion?: number;
};

const STORAGE_KEY = "ankigen_study_sessions";
const SAVE_POINT_KEY = "ankigen_save_points";
const QBANK_SESSIONS_KEY = "ankigen_qbank_sessions";
const FLAGGED_KEY = "ankigen_qbank_flagged";
const SEEN_KEY = "ankigen_qbank_seen";
const MAX_SESSIONS = 500;
const MAX_QBANK_SESSIONS = 300;

// --- Flashcard sessions ---

export function getSavePoint(deckId: number): StudySavePoint | null {
  try {
    const raw = localStorage.getItem(SAVE_POINT_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<number, StudySavePoint>;
    return map[deckId] ?? null;
  } catch {
    return null;
  }
}

export function saveSavePoint(point: StudySavePoint): void {
  try {
    const raw = localStorage.getItem(SAVE_POINT_KEY);
    const map: Record<number, StudySavePoint> = raw ? JSON.parse(raw) : {};
    map[point.deckId] = point;
    localStorage.setItem(SAVE_POINT_KEY, JSON.stringify(map));
  } catch {}
}

export function clearSavePoint(deckId: number): void {
  try {
    const raw = localStorage.getItem(SAVE_POINT_KEY);
    if (!raw) return;
    const map = JSON.parse(raw) as Record<number, StudySavePoint>;
    delete map[deckId];
    localStorage.setItem(SAVE_POINT_KEY, JSON.stringify(map));
  } catch {}
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getSessions(): StudySession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as StudySession[];
  } catch {
    return [];
  }
}

export function saveSession(session: Omit<StudySession, "id" | "date">): StudySession {
  const sessions = getSessions();
  const newSession: StudySession = {
    ...session,
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    date: session.completedAt.slice(0, 10),
  };
  const updated = [newSession, ...sessions].slice(0, MAX_SESSIONS);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return newSession;
}

export function getStudyStreak(sessions: StudySession[]): number {
  if (sessions.length === 0) return 0;
  const dates = new Set(sessions.map(s => s.date));
  let streak = 0;
  let cursor = new Date();
  cursor.setHours(0, 0, 0, 0);

  while (true) {
    const dateStr = cursor.toISOString().slice(0, 10);
    if (dates.has(dateStr)) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      if (streak === 0) {
        cursor.setDate(cursor.getDate() - 1);
        const yesterday = cursor.toISOString().slice(0, 10);
        if (dates.has(yesterday)) {
          streak++;
          cursor.setDate(cursor.getDate() - 1);
          continue;
        }
      }
      break;
    }
  }
  return streak;
}

export function getLast7Days(): { date: string; label: string; known: number; total: number }[] {
  const sessions = getSessions();
  const result = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const label = i === 0 ? "Today" : d.toLocaleDateString("en-US", { weekday: "short" });
    const daySessions = sessions.filter(s => s.date === dateStr);
    const known = daySessions.reduce((sum, s) => sum + s.known, 0);
    const total = daySessions.reduce((sum, s) => sum + s.total, 0);
    result.push({ date: dateStr, label, known, total });
  }
  return result;
}

export function getDeckStats(sessions: StudySession[]): Map<number, { deckName: string; total: number; known: number; sessions: number }> {
  const map = new Map<number, { deckName: string; total: number; known: number; sessions: number }>();
  for (const s of sessions) {
    const existing = map.get(s.deckId) ?? { deckName: s.deckName, total: 0, known: 0, sessions: 0 };
    map.set(s.deckId, {
      deckName: s.deckName,
      total: existing.total + s.total,
      known: existing.known + s.known,
      sessions: existing.sessions + 1,
    });
  }
  return map;
}

export function getTodayStats(sessions: StudySession[]): { cardsStudied: number; known: number } {
  const t = today();
  const todaySessions = sessions.filter(s => s.date === t);
  return {
    cardsStudied: todaySessions.reduce((sum, s) => sum + s.total, 0),
    known: todaySessions.reduce((sum, s) => sum + s.known, 0),
  };
}

// --- QBank session analytics ---

export function getQBankSessions(qbankId?: number): QBankSession[] {
  try {
    const raw = localStorage.getItem(QBANK_SESSIONS_KEY);
    if (!raw) return [];
    const all = JSON.parse(raw) as QBankSession[];
    return qbankId !== undefined ? all.filter(s => s.qbankId === qbankId) : all;
  } catch {
    return [];
  }
}

export function saveQBankSession(session: Omit<QBankSession, "id">): QBankSession {
  try {
    const raw = localStorage.getItem(QBANK_SESSIONS_KEY);
    const all: QBankSession[] = raw ? JSON.parse(raw) : [];
    const newSession: QBankSession = {
      ...session,
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    };
    const updated = [newSession, ...all].slice(0, MAX_QBANK_SESSIONS);
    localStorage.setItem(QBANK_SESSIONS_KEY, JSON.stringify(updated));
    return newSession;
  } catch {
    return { ...session, id: `${Date.now()}` };
  }
}

// --- Flagging ---

export function getFlaggedIds(qbankId: number): Set<number> {
  try {
    const raw = localStorage.getItem(FLAGGED_KEY);
    if (!raw) return new Set();
    const map = JSON.parse(raw) as Record<number, number[]>;
    return new Set(map[qbankId] ?? []);
  } catch {
    return new Set();
  }
}

export function toggleFlagged(qbankId: number, questionId: number): boolean {
  try {
    const raw = localStorage.getItem(FLAGGED_KEY);
    const map: Record<number, number[]> = raw ? JSON.parse(raw) : {};
    const current = new Set(map[qbankId] ?? []);
    const nowFlagged = !current.has(questionId);
    if (nowFlagged) current.add(questionId); else current.delete(questionId);
    map[qbankId] = Array.from(current);
    localStorage.setItem(FLAGGED_KEY, JSON.stringify(map));
    return nowFlagged;
  } catch {
    return false;
  }
}

// --- Seen tracking ---

export function getSeenIds(qbankId: number): Set<number> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (!raw) return new Set();
    const map = JSON.parse(raw) as Record<number, number[]>;
    return new Set(map[qbankId] ?? []);
  } catch {
    return new Set();
  }
}

export function markSeen(qbankId: number, questionIds: number[]): void {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    const map: Record<number, number[]> = raw ? JSON.parse(raw) : {};
    const current = new Set(map[qbankId] ?? []);
    questionIds.forEach(id => current.add(id));
    map[qbankId] = Array.from(current);
    localStorage.setItem(SEEN_KEY, JSON.stringify(map));
  } catch {}
}

// --- Wrong answers ---

export function getWrongIds(qbankId: number): Set<number> {
  const sessions = getQBankSessions(qbankId);
  const wrongCounts = new Map<number, number>();
  const correctCounts = new Map<number, number>();
  for (const session of sessions) {
    for (const r of session.results) {
      if (r.correct) {
        correctCounts.set(r.questionId, (correctCounts.get(r.questionId) ?? 0) + 1);
      } else {
        wrongCounts.set(r.questionId, (wrongCounts.get(r.questionId) ?? 0) + 1);
      }
    }
  }
  const wrongIds = new Set<number>();
  wrongCounts.forEach((wrongCount, id) => {
    const correctCount = correctCounts.get(id) ?? 0;
    if (wrongCount > correctCount) wrongIds.add(id);
  });
  return wrongIds;
}

// --- Topic breakdown ---

export function getTopicBreakdown(
  results: QBankQuestionResult[]
): { topic: string; correct: number; total: number; pct: number }[] {
  const map = new Map<string, { correct: number; total: number }>();
  for (const r of results) {
    const tags = r.tags.length > 0 ? r.tags : ["Untagged"];
    for (const tag of tags) {
      const entry = map.get(tag) ?? { correct: 0, total: 0 };
      entry.total++;
      if (r.correct) entry.correct++;
      map.set(tag, entry);
    }
  }
  return Array.from(map.entries())
    .map(([topic, { correct, total }]) => ({ topic, correct, total, pct: total > 0 ? correct / total : 0 }))
    .sort((a, b) => a.pct - b.pct);
}

export function getHistoricalTopicBreakdown(
  sessions: QBankSession[]
): { topic: string; correct: number; total: number; pct: number }[] {
  const allResults = sessions.flatMap(s => s.results);
  return getTopicBreakdown(allResults);
}

// --- Weekly goal ---

const WEEKLY_GOAL_KEY = "ankigen_weekly_goal";
const DEFAULT_WEEKLY_GOAL = 50;

export function getWeeklyGoal(): number {
  try {
    const raw = localStorage.getItem(WEEKLY_GOAL_KEY);
    return raw ? Math.max(1, parseInt(raw, 10)) : DEFAULT_WEEKLY_GOAL;
  } catch { return DEFAULT_WEEKLY_GOAL; }
}

export function setWeeklyGoal(n: number): void {
  try { localStorage.setItem(WEEKLY_GOAL_KEY, String(Math.max(1, n))); } catch {}
}

export function getThisWeekCards(sessions: StudySession[]): number {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const mondayOffset = (dayOfWeek + 6) % 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - mondayOffset);
  monday.setHours(0, 0, 0, 0);
  return sessions
    .filter(s => new Date(s.completedAt) >= monday)
    .reduce((sum, s) => sum + s.total, 0);
}

// --- 8-week activity heatmap ---

export function getLast8Weeks(): { date: string; label: string; total: number; known: number }[] {
  const sessions = getSessions();
  const result: { date: string; label: string; total: number; known: number }[] = [];
  for (let i = 55; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    const dateStr = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    const daySessions = sessions.filter(s => s.date === dateStr);
    const total = daySessions.reduce((sum, s) => sum + s.total, 0);
    const known = daySessions.reduce((sum, s) => sum + s.known, 0);
    result.push({ date: dateStr, label, total, known });
  }
  return result;
}

// --- Study time sparkline (estimated 8 s/card) ---

const AVG_SECONDS_PER_CARD = 8;

export function getLastStudiedByDeck(sessions: StudySession[]): Map<number, string> {
  const map = new Map<number, string>();
  for (const s of sessions) {
    const ex = map.get(s.deckId);
    if (!ex || s.completedAt > ex) map.set(s.deckId, s.completedAt);
  }
  return map;
}

export function getLast14DaysTotals(): { date: string; label: string; total: number; estimatedMinutes: number }[] {
  const sessions = getSessions();
  const result = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const label = i === 0 ? "Today" : d.toLocaleDateString("en-US", { weekday: "short" });
    const daySessions = sessions.filter(s => s.date === dateStr);
    const total = daySessions.reduce((sum, s) => sum + s.total, 0);
    result.push({ date: dateStr, label, total, estimatedMinutes: Math.round(total * AVG_SECONDS_PER_CARD / 60) });
  }
  return result;
}
