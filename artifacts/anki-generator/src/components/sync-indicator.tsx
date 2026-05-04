import { motion, AnimatePresence } from "framer-motion";
import { Loader2, CheckCircle2, WifiOff, Clock } from "lucide-react";

type Props = {
  queueCount: number;
  isSyncing: boolean;
};

export function SyncIndicator({ queueCount, isSyncing }: Props) {
  const visible = queueCount > 0 || isSyncing;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -4, scale: 0.92 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -4, scale: 0.92 }}
          transition={{ type: "spring", stiffness: 400, damping: 26 }}
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold border ${
            isSyncing
              ? "bg-sky-500/15 border-sky-500/30 text-sky-700 dark:text-sky-300"
              : "bg-amber-500/15 border-amber-500/30 text-amber-700 dark:text-amber-300"
          }`}
        >
          {isSyncing ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              Syncing {queueCount > 0 ? `${queueCount} item${queueCount !== 1 ? "s" : ""}` : ""}…
            </>
          ) : (
            <>
              <Clock className="h-3 w-3" />
              {queueCount} queued
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function SyncBanner({ queueCount, isSyncing }: Props) {
  const visible = queueCount > 0 || isSyncing;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className={`overflow-hidden border-b ${
            isSyncing
              ? "bg-sky-500/10 border-sky-500/20"
              : "bg-amber-500/10 border-amber-500/20"
          }`}
        >
          <div className="flex items-center justify-center gap-2 px-4 py-1.5 text-xs">
            {isSyncing ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin text-sky-600 dark:text-sky-400" />
                <span className="text-sky-700 dark:text-sky-300 font-medium">
                  Syncing {queueCount} item{queueCount !== 1 ? "s" : ""}…
                </span>
              </>
            ) : (
              <>
                <WifiOff className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                <span className="text-amber-700 dark:text-amber-300 font-medium">
                  {queueCount} generation{queueCount !== 1 ? "s" : ""} queued — will sync when online
                </span>
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
