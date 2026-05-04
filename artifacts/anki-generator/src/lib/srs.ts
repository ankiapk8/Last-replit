const SRS_KEY = "ankigen_srs_data";

export type SrsRating = 1 | 2 | 3 | 4;

export type SrsCardState = {
  cardId: number;
  deckId: number;
  easeFactor: number;
  interval: number;
  reps: number;
  dueDate: string;
  lastReviewedAt: string;
};

function ratingToQuality(rating: SrsRating): number {
  switch (rating) {
    case 1: return 1;
    case 2: return 3;
    case 3: return 4;
    case 4: return 5;
  }
}

export function computeNextState(state: SrsCardState, rating: SrsRating): SrsCardState {
  const quality = ratingToQuality(rating);
  let { easeFactor, interval, reps } = state;

  if (quality < 3) {
    reps = 0;
    interval = 1;
  } else {
    if (reps === 0) {
      interval = 1;
    } else if (reps === 1) {
      interval = 6;
    } else {
      interval = Math.round(interval * easeFactor);
    }
    reps += 1;
  }

  easeFactor = easeFactor + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02);
  easeFactor = Math.max(1.3, easeFactor);

  const now = new Date();
  const dueDate = new Date(now);
  dueDate.setDate(dueDate.getDate() + interval);

  return {
    ...state,
    easeFactor,
    interval,
    reps,
    dueDate: dueDate.toISOString().slice(0, 10),
    lastReviewedAt: now.toISOString(),
  };
}

export function getNextInterval(rating: SrsRating, state: SrsCardState | null): number {
  const base: SrsCardState = state ?? {
    cardId: 0, deckId: 0, easeFactor: 2.5,
    interval: 0, reps: 0, dueDate: "", lastReviewedAt: "",
  };
  return computeNextState(base, rating).interval;
}

export function intervalLabel(days: number): string {
  if (days <= 0) return "<1d";
  if (days === 1) return "1d";
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.round(days / 7)}w`;
  return `${Math.round(days / 30)}mo`;
}

function getSrsMap(): Record<number, SrsCardState> {
  try {
    const raw = localStorage.getItem(SRS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<number, SrsCardState>;
  } catch {
    return {};
  }
}

function saveSrsMap(map: Record<number, SrsCardState>): void {
  try {
    localStorage.setItem(SRS_KEY, JSON.stringify(map));
  } catch {}
}

export function getSrsState(cardId: number): SrsCardState | null {
  return getSrsMap()[cardId] ?? null;
}

export function saveSrsState(state: SrsCardState): void {
  const map = getSrsMap();
  map[state.cardId] = state;
  saveSrsMap(map);
}

export function getDefaultSrsState(cardId: number, deckId: number): SrsCardState {
  return {
    cardId,
    deckId,
    easeFactor: 2.5,
    interval: 0,
    reps: 0,
    dueDate: new Date().toISOString().slice(0, 10),
    lastReviewedAt: "",
  };
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isDue(state: SrsCardState | null): boolean {
  if (!state || !state.dueDate || !state.lastReviewedAt) return true;
  return state.dueDate <= todayStr();
}

export function getDueCardIds(cardIds: number[]): number[] {
  const map = getSrsMap();
  const today = todayStr();
  return cardIds.filter(id => {
    const s = map[id];
    if (!s || !s.lastReviewedAt) return true;
    return s.dueDate <= today;
  });
}

/**
 * Splits card IDs into three ordered buckets for study queue construction:
 *   1. due     — reviewed at least once AND dueDate <= today
 *   2. unseen  — never reviewed (no SRS state or no lastReviewedAt)
 *   3. future  — reviewed at least once AND dueDate > today
 *
 * Concatenate due → unseen → future to get the optimal study order.
 */
export function partitionCardsByDue(cardIds: number[]): {
  due: number[];
  unseen: number[];
  future: number[];
} {
  const map = getSrsMap();
  const today = todayStr();
  const due: number[] = [];
  const unseen: number[] = [];
  const future: number[] = [];
  for (const id of cardIds) {
    const s = map[id];
    if (!s || !s.lastReviewedAt) {
      unseen.push(id);
    } else if (s.dueDate <= today) {
      due.push(id);
    } else {
      future.push(id);
    }
  }
  return { due, unseen, future };
}

export function getDueCountForDeck(cardIds: number[]): number {
  return getDueCardIds(cardIds).length;
}

export function getDueDeckIds(): number[] {
  const map = getSrsMap();
  const today = todayStr();
  const ids = new Set<number>();
  for (const s of Object.values(map)) {
    if (s.deckId && s.lastReviewedAt && s.dueDate <= today) {
      ids.add(s.deckId);
    }
  }
  return Array.from(ids);
}

/**
 * Returns the number of cards that have been reviewed at least once for a deck.
 * Used alongside getDueCountByDeckId to compute unseen/new card counts on pages
 * that only have the deck ID (e.g. dashboard), not the full card ID list.
 */
export function getReviewedCountByDeckId(deckId: number): number {
  const map = getSrsMap();
  return Object.values(map).filter(s => s.deckId === deckId && s.lastReviewedAt).length;
}

/**
 * Counts due cards for a deck by scanning the SRS map.
 * Only counts cards reviewed at least once (have lastReviewedAt) whose dueDate
 * is today or earlier. For a full "cards needing attention" count that also
 * includes new/unseen cards, combine with getReviewedCountByDeckId and
 * the deck's total cardCount (see dashboard.tsx recentDeckDueCounts).
 */
export function getDueCountByDeckId(deckId: number): number {
  const map = getSrsMap();
  const today = todayStr();
  return Object.values(map).filter(
    s => s.deckId === deckId && s.lastReviewedAt && s.dueDate <= today
  ).length;
}

export function getTotalScheduledDueCount(): number {
  const map = getSrsMap();
  const today = todayStr();
  return Object.values(map).filter(s => s.lastReviewedAt && s.dueDate <= today).length;
}

export function getDaysUntilDue(cardId: number): number | null {
  const state = getSrsState(cardId);
  if (!state || !state.lastReviewedAt) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(state.dueDate);
  due.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}
