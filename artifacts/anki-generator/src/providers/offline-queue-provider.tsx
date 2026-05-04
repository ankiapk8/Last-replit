import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getListDecksQueryKey, getListQbanksQueryKey } from "@workspace/api-client-react";
import { apiUrl } from "@/lib/utils";
import {
  type QueuedGeneration,
  dbEnqueue,
  dbGetAll,
  dbRemove,
  dbCount,
} from "@/lib/offline-queue-db";

export type { QueuedGeneration };

type OfflineQueueContextValue = {
  queueCount: number;
  isSyncing: boolean;
  enqueue: (item: Omit<QueuedGeneration, "id" | "createdAt">) => Promise<void>;
  dbGetAll: () => Promise<QueuedGeneration[]>;
};

const OfflineQueueContext = createContext<OfflineQueueContextValue | null>(null);

async function syncItemToApi(
  item: QueuedGeneration,
  queryClient: ReturnType<typeof useQueryClient>,
): Promise<boolean> {
  try {
    const isQbank = item.type === "qbank";
    const endpoint = isQbank
      ? apiUrl("api/generate-qbank/stream")
      : apiUrl("api/generate/stream");
    const body = isQbank
      ? JSON.stringify({ text: item.text, deckName: item.deckName, questionCount: item.numCards, customPrompt: item.customPrompt })
      : JSON.stringify({ text: item.text, deckName: item.deckName, cardCount: item.numCards, deckType: "text", customPrompt: item.customPrompt });
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    if (!resp.ok || !resp.body) return false;
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        try {
          const event = JSON.parse(line.slice(5).trim()) as { type: string };
          if (event.type === "done") {
            if (isQbank) {
              queryClient.invalidateQueries({ queryKey: getListQbanksQueryKey() });
            } else {
              queryClient.invalidateQueries({ queryKey: getListDecksQueryKey() });
            }
            return true;
          }
          if (event.type === "error") return false;
        } catch { continue; }
      }
    }
    return false;
  } catch {
    return false;
  }
}

export function OfflineQueueProvider({ children }: { children: React.ReactNode }) {
  const [queueCount, setQueueCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const syncingRef = useRef(false);
  const queryClient = useQueryClient();

  const refreshCount = useCallback(async () => {
    try {
      const n = await dbCount();
      setQueueCount(n);
    } catch { /* IndexedDB unavailable */ }
  }, []);

  const runSync = useCallback(async () => {
    if (syncingRef.current || !navigator.onLine) return;
    const items = await dbGetAll();
    if (items.length === 0) return;

    syncingRef.current = true;
    setIsSyncing(true);

    for (const item of items) {
      try {
        const ok = await syncItemToApi(item, queryClient);
        if (ok) await dbRemove(item.id);
      } catch { /* network error for this item; leave in queue */ }
    }

    await refreshCount();
    syncingRef.current = false;
    setIsSyncing(false);
  }, [queryClient, refreshCount]);

  const enqueue = useCallback(async (item: Omit<QueuedGeneration, "id" | "createdAt">) => {
    const full: QueuedGeneration = {
      ...item,
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      createdAt: Date.now(),
    };
    await dbEnqueue(full);
    await refreshCount();
    if ("serviceWorker" in navigator && "SyncManager" in window) {
      try {
        const reg = await navigator.serviceWorker.ready;
        await (reg as ServiceWorkerRegistration & { sync: { register: (tag: string) => Promise<void> } }).sync.register("ankigen-sync-queue");
      } catch { /* Background Sync not available; will sync on next online event */ }
    }
  }, [refreshCount]);

  useEffect(() => {
    refreshCount();

    // Run sync immediately on mount if already connected
    if (navigator.onLine) {
      runSync();
    }

    const handleOnline = () => {
      refreshCount();
      runSync();
    };

    // SW posts SYNC_QUEUE when Background Sync fires
    const handleSwMessage = (e: MessageEvent) => {
      if (e.data?.type === "SYNC_QUEUE") runSync();
    };

    window.addEventListener("online", handleOnline);
    navigator.serviceWorker?.addEventListener("message", handleSwMessage);

    return () => {
      window.removeEventListener("online", handleOnline);
      navigator.serviceWorker?.removeEventListener("message", handleSwMessage);
    };
  }, [refreshCount, runSync]);

  return (
    <OfflineQueueContext.Provider value={{ queueCount, isSyncing, enqueue, dbGetAll }}>
      {children}
    </OfflineQueueContext.Provider>
  );
}

export function useOfflineQueue(): OfflineQueueContextValue {
  const ctx = useContext(OfflineQueueContext);
  if (!ctx) throw new Error("useOfflineQueue must be used within OfflineQueueProvider");
  return ctx;
}
