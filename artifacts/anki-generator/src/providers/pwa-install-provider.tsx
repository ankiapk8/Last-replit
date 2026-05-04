import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

const DISMISSED_KEY = "ankigen-pwa-install-dismissed";
const PROMPT_DELAY_MS = 30_000;

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type PwaInstallContextValue = {
  canInstall: boolean;
  showSheet: boolean;
  install: () => Promise<void>;
  dismiss: () => void;
};

const PwaInstallContext = createContext<PwaInstallContextValue | null>(null);

function isDismissed() {
  try { return localStorage.getItem(DISMISSED_KEY) === "1"; } catch { return false; }
}

export function PwaInstallProvider({ children }: { children: React.ReactNode }) {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showSheet, setShowSheet] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isDismissed()) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setPromptEvent(e as BeforeInstallPromptEvent);
      timerRef.current = setTimeout(() => {
        if (!isDismissed()) setShowSheet(true);
      }, PROMPT_DELAY_MS);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const install = useCallback(async () => {
    if (!promptEvent) return;
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    if (outcome === "accepted") {
      try { localStorage.setItem(DISMISSED_KEY, "1"); } catch {}
    }
    setShowSheet(false);
    setPromptEvent(null);
  }, [promptEvent]);

  const dismiss = useCallback(() => {
    try { localStorage.setItem(DISMISSED_KEY, "1"); } catch {}
    setShowSheet(false);
  }, []);

  return (
    <PwaInstallContext.Provider value={{ canInstall: !!promptEvent, showSheet, install, dismiss }}>
      {children}
    </PwaInstallContext.Provider>
  );
}

export function usePwaInstallContext(): PwaInstallContextValue {
  const ctx = useContext(PwaInstallContext);
  if (!ctx) throw new Error("usePwaInstallContext must be used within PwaInstallProvider");
  return ctx;
}
