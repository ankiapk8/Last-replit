import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { WifiOff, X } from "lucide-react";
import { useLocation } from "wouter";

export function useOnlineStatus() {
  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine
  );
  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);
  return online;
}

const STUDY_ROUTES = ["/practice", "/practice-qbank", "/study"];

export function OfflineBanner() {
  const online = useOnlineStatus();
  const [location] = useLocation();
  const [dismissed, setDismissed] = useState(false);
  const shownThisSessionRef = useRef(false);
  const [visible, setVisible] = useState(false);

  const inStudyMode = STUDY_ROUTES.some((r) => location.startsWith(r));

  useEffect(() => {
    if (!online && !shownThisSessionRef.current && !inStudyMode) {
      shownThisSessionRef.current = true;
      setDismissed(false);
      setVisible(true);
    }
    if (online) {
      setVisible(false);
    }
  }, [online, inStudyMode]);

  const shouldShow = visible && !dismissed && !inStudyMode;

  return (
    <AnimatePresence>
      {shouldShow && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.22 }}
          className="overflow-hidden"
        >
          <div className="bg-amber-500/15 border-b border-amber-500/30 text-amber-800 dark:text-amber-300 px-4 py-1.5 text-xs flex items-center gap-2">
            <WifiOff className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1 text-center">
              <strong>Offline mode</strong> — your saved decks are available. Generation and AI features need internet.
            </span>
            <button
              onClick={() => setDismissed(true)}
              className="rounded p-0.5 hover:bg-amber-500/20 transition-colors shrink-0"
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function OfflineBadge() {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 text-[10px] font-semibold px-2 py-0.5 border border-amber-500/30">
      <WifiOff className="h-2.5 w-2.5" />
      OFFLINE
    </span>
  );
}
