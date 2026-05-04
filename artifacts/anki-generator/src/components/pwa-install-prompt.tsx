import { motion, AnimatePresence } from "framer-motion";
import { Download, X, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePwaInstall } from "@/hooks/use-pwa-install";

export function PwaInstallPrompt() {
  const { showSheet, install, dismiss } = usePwaInstall();

  return (
    <AnimatePresence>
      {showSheet && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-black/20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={dismiss}
          />
          <motion.div
            className="fixed bottom-0 inset-x-0 z-50 px-4 pb-6 safe-area-bottom"
            initial={{ y: "100%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
          >
            <div
              className="relative mx-auto max-w-md rounded-2xl border border-white/10 bg-background/95 p-5 shadow-2xl backdrop-blur-xl"
              style={{ boxShadow: "0 -4px 40px -8px hsl(152 72% 50% / 0.18), 0 8px 40px rgba(0,0,0,0.4)" }}
            >
              <button
                onClick={dismiss}
                className="absolute right-3 top-3 rounded-full p-1.5 text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
                aria-label="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>

              <div className="flex items-start gap-4">
                <div
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
                  style={{ background: "linear-gradient(135deg, hsl(150 60% 45%), hsl(95 65% 45%))" }}
                >
                  <Smartphone className="h-6 w-6 text-white" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-foreground">Add AnkiGen to your home screen</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Study offline, get faster load times, and a native app experience — no App Store needed.
                  </p>
                </div>
              </div>

              <div className="mt-4 flex gap-2">
                <Button
                  className="flex-1 gap-2 font-semibold"
                  style={{ background: "linear-gradient(120deg, hsl(150 60% 42%) 0%, hsl(95 65% 42%) 100%)" }}
                  onClick={install}
                >
                  <Download className="h-4 w-4" />
                  Add to Home Screen
                </Button>
                <Button variant="ghost" className="text-muted-foreground hover:text-foreground" onClick={dismiss}>
                  Not now
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
