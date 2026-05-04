import type { Topic } from "@/lib/study-planner/topics";
import { apiUrl } from "@/lib/utils";

type TopicsResponse = { topics: Record<string, Topic[]> };

function lsGet(k: string): string | null {
  try { return localStorage.getItem(k); } catch { return null; }
}
function lsSet(k: string, v: string): void {
  try { localStorage.setItem(k, v); } catch {}
}

function getAllTopicsFromLocalStorage(): TopicsResponse {
  const topics: Record<string, Topic[]> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith("sp-topics-")) {
        const storageKey = key.slice("sp-topics-".length);
        const raw = lsGet(key);
        if (raw) {
          try { topics[storageKey] = JSON.parse(raw) as Topic[]; } catch {}
        }
      }
    }
  } catch {}
  return { topics };
}

export async function getAllTopics(): Promise<TopicsResponse> {
  try {
    const res = await fetch(apiUrl("/topics"), {
      credentials: "include",
      headers: { accept: "application/json" },
    });
    if (res.status === 401) {
      return getAllTopicsFromLocalStorage();
    }
    if (!res.ok) throw new Error("Failed to load study topics");
    return res.json();
  } catch {
    return getAllTopicsFromLocalStorage();
  }
}

export async function upsertTopics(storageKey: string, topics: Topic[]): Promise<Topic[]> {
  lsSet(`sp-topics-${storageKey}`, JSON.stringify(topics));
  try {
    const res = await fetch(apiUrl(`/topics/${encodeURIComponent(storageKey)}`), {
      method: "PUT",
      credentials: "include",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ topics }),
    });
    if (res.status === 401) {
      return topics;
    }
    if (!res.ok) return topics;
    const data = (await res.json()) as { topics: Topic[] };
    return data.topics;
  } catch {
    return topics;
  }
}
