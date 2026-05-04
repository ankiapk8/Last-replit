import { motion } from "framer-motion";
import { LogIn, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth, getLoginUrl } from "@/hooks/useAuth";

interface RequireAuthBannerProps {
  message?: string;
  className?: string;
}

export function RequireAuthBanner({
  message = "Sign in to save your decks across devices and unlock Pro features.",
  className = "",
}: RequireAuthBannerProps) {
  const { isLoggedIn, isLoading } = useAuth();

  if (isLoading || isLoggedIn) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.25 }}
      className={`flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 dark:bg-primary/10 px-4 py-3 ${className}`}
    >
      <Sparkles className="h-4 w-4 text-primary shrink-0" />
      <p className="text-sm text-foreground/80 flex-1">{message}</p>
      <Button
        size="sm"
        variant="outline"
        className="h-7 gap-1.5 text-xs shrink-0 border-primary/30 text-primary hover:bg-primary/10 hover:text-primary"
        onClick={() => { window.location.href = getLoginUrl(window.location.pathname); }}
      >
        <LogIn className="h-3 w-3" />
        Sign in
      </Button>
    </motion.div>
  );
}
