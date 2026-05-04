const DECK_TAGS_KEY = "ankigen_deck_tags";

export function getAllDeckTags(): Map<number, string[]> {
  try {
    const raw = localStorage.getItem(DECK_TAGS_KEY);
    if (!raw) return new Map();
    const obj = JSON.parse(raw) as Record<string, string[]>;
    return new Map(
      Object.entries(obj).map(([k, v]) => [parseInt(k, 10), Array.isArray(v) ? v : []])
    );
  } catch {
    return new Map();
  }
}

export function getDeckTags(deckId: number): string[] {
  return getAllDeckTags().get(deckId) ?? [];
}

export function setDeckTags(deckId: number, tags: string[]): void {
  try {
    const raw = localStorage.getItem(DECK_TAGS_KEY);
    const obj: Record<string, string[]> = raw ? JSON.parse(raw) : {};
    const normalized = [...new Set(tags.map(t => t.trim()).filter(t => t.length > 0))];
    if (normalized.length === 0) {
      delete obj[String(deckId)];
    } else {
      obj[String(deckId)] = normalized;
    }
    localStorage.setItem(DECK_TAGS_KEY, JSON.stringify(obj));
    window.dispatchEvent(new CustomEvent("deck-tags-changed"));
  } catch {}
}

export function addDeckTag(deckId: number, tag: string): void {
  const current = getDeckTags(deckId);
  const trimmed = tag.trim();
  if (!trimmed || current.includes(trimmed)) return;
  setDeckTags(deckId, [...current, trimmed]);
}

export function removeDeckTag(deckId: number, tag: string): void {
  setDeckTags(deckId, getDeckTags(deckId).filter(t => t !== tag));
}
