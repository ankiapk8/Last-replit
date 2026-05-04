import { useState, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { BookOpen, LayoutDashboard, Library, Sparkles, Moon, Sun, History, CalendarDays, Download, Crown, CreditCard, Loader2, LogIn, LogOut, User } from "lucide-react";
import { useSubscription, openBillingPortal } from "@/hooks/useSubscription";
import { useAuth, getLoginUrl, getLogoutUrl } from "@/hooks/useAuth";
import { ApkWelcomeBanner } from "@/components/apk-welcome-banner";
import { PomodoroTimer } from "@/components/pomodoro-timer";
import { FeedbackButton } from "@/components/feedback-button";
import { useDarkMode } from "@/hooks/use-dark-mode";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SettingsSheet } from "@/components/settings-sheet";
import { SyncIndicator } from "@/components/sync-indicator";
import { useOfflineQueue } from "@/hooks/use-offline-queue";
import { OfflineBadge } from "@/components/offline-indicator";
import { usePwaInstall } from "@/hooks/use-pwa-install";
import { IosInstallModal } from "@/components/ios-install-modal";
import { DevPlanBadge } from "@/components/dev-panel";

const NAV_ACCENTS: Record<string, { color: string; glow: string }> = {
  "/":        { color: "#34d399", glow: "hsl(152 72% 55% / 0.35)" },
  "/decks":   { color: "#818cf8", glow: "hsl(239 84% 68% / 0.35)" },
  "/history": { color: "#38bdf8", glow: "hsl(199 89% 60% / 0.35)" },
  "/planner": { color: "#fb923c", glow: "hsl(24 95% 60% / 0.35)" },
};

const NAV_BACKDROPS: Record<string, { light: string; dark: string }> = {
  "/":        {
    light: "radial-gradient(ellipse 90% 55% at 50% -5%, hsl(152 72% 55% / 0.055) 0%, transparent 70%)",
    dark:  "radial-gradient(ellipse 90% 55% at 50% -5%, hsl(152 72% 55% / 0.08) 0%, transparent 70%)",
  },
  "/decks":   {
    light: "radial-gradient(ellipse 90% 55% at 50% -5%, hsl(239 84% 68% / 0.055) 0%, transparent 70%)",
    dark:  "radial-gradient(ellipse 90% 55% at 50% -5%, hsl(239 84% 68% / 0.08) 0%, transparent 70%)",
  },
  "/history": {
    light: "radial-gradient(ellipse 90% 55% at 50% -5%, hsl(199 89% 60% / 0.055) 0%, transparent 70%)",
    dark:  "radial-gradient(ellipse 90% 55% at 50% -5%, hsl(199 89% 60% / 0.08) 0%, transparent 70%)",
  },
  "/planner": {
    light: "radial-gradient(ellipse 90% 55% at 50% -5%, hsl(24 95% 60% / 0.055) 0%, transparent 70%)",
    dark:  "radial-gradient(ellipse 90% 55% at 50% -5%, hsl(24 95% 60% / 0.08) 0%, transparent 70%)",
  },
};

function resolveBackdropKey(location: string): string {
  if (location === "/" || location === "/generate") return "/";
  if (
    location.startsWith("/decks") ||
    location.startsWith("/practice") ||
    location.startsWith("/qbanks") ||
    location.startsWith("/study")
  ) return "/decks";
  if (location.startsWith("/history")) return "/history";
  if (location.startsWith("/planner")) return "/planner";
  return "/";
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [dark, setDark] = useDarkMode();
  const { queueCount, isSyncing } = useOfflineQueue();
  const { isPro } = useSubscription();
  const { user, isLoggedIn, isLoading: authLoading, displayName, initials } = useAuth();
  const [billingLoading, setBillingLoading] = useState(false);

  async function handleManageBilling() {
    setBillingLoading(true);
    try {
      const url = await openBillingPortal();
      if (url) window.open(url, "_blank", "noopener");
    } finally {
      setBillingLoading(false);
    }
  }

  const navLinks = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/decks", label: "Library", icon: Library },
    { href: "/history", label: "History", icon: History },
    { href: "/planner", label: "Planner", icon: CalendarDays },
  ];

  const generateActive = location === "/generate";

  const activeNavHref = navLinks.find(({ href }) =>
    href === "/" ? location === "/" : location.startsWith(href)
  )?.href;
  const activeHeaderAccent = activeNavHref ? NAV_ACCENTS[activeNavHref] : null;

  const { canInstall, install } = usePwaInstall();
  const [showIosModal, setShowIosModal] = useState(false);

  const isIosInstallable = useMemo(() => {
    if (typeof navigator === "undefined" || typeof window === "undefined") return false;
    const ua = navigator.userAgent;
    const isIos =
      /iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === "MacIntel" &&
        (navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints! > 1);
    const isStandalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    return isIos && !isStandalone;
  }, []);

  const backdropKey = resolveBackdropKey(location);
  const activeBackdrop = NAV_BACKDROPS[backdropKey];

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background text-foreground">
      <AnimatePresence>
        <motion.div
          key={backdropKey + (dark ? "-dark" : "-light")}
          aria-hidden
          className="fixed inset-0 pointer-events-none z-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.7, ease: "easeInOut" }}
          style={{ background: dark ? activeBackdrop.dark : activeBackdrop.light }}
        />
      </AnimatePresence>
      <header className="sticky top-0 z-50 w-full border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/60 relative overflow-hidden" style={{ boxShadow: "0 1px 0 0 hsl(var(--border) / 0.5), 0 4px 16px -4px rgba(0,0,0,0.06)" }}>
        <AnimatePresence mode="wait">
          {activeHeaderAccent && (
            <motion.div
              key={activeNavHref}
              aria-hidden
              className="absolute inset-0 pointer-events-none"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
              style={{ background: `linear-gradient(135deg, ${activeHeaderAccent.color}0d 0%, ${activeHeaderAccent.color}05 40%, transparent 65%)` }}
            />
          )}
        </AnimatePresence>
        <div className="container flex h-14 items-center gap-1 sm:gap-2 px-3 sm:px-4 md:px-6 max-w-5xl mx-auto relative z-10">
          <Link href="/" className="flex items-center gap-2 mr-1 sm:mr-2 md:mr-6 shrink-0">
            <BookOpen className="h-6 w-6 text-primary" />
            <span className="font-serif text-lg font-bold tracking-tight hidden sm:inline">AnkiGen</span>
          </Link>
          <nav className="flex items-center gap-0.5 sm:gap-1 min-w-0">
            {navLinks.map(({ href, label, icon: Icon }) => {
              const isActive = href === "/"
                ? location === "/"
                : location.startsWith(href);
              const accent = NAV_ACCENTS[href];
              return (
                <Link key={href} href={href}>
                  <span
                    className={`relative flex items-center gap-1.5 px-2 sm:px-3 py-2 sm:py-1.5 rounded-md text-sm font-medium transition-all duration-200 ${
                      isActive
                        ? "text-foreground"
                        : "text-foreground/55 hover:text-foreground hover:bg-muted/60"
                    }`}
                    style={isActive ? { color: accent?.color } : undefined}
                    aria-label={label}
                  >
                    {isActive && accent && (
                      <motion.span
                        layoutId="nav-indicator"
                        className="absolute inset-0 rounded-md"
                        style={{ background: `${accent.color}14`, boxShadow: `0 0 10px ${accent.glow}` }}
                        transition={{ type: "spring", stiffness: 380, damping: 30 }}
                      />
                    )}
                    <span className="relative flex items-center gap-1.5">
                      <Icon className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                      <span className="hidden xs:inline sm:inline">{label}</span>
                    </span>
                    {isActive && accent && (
                      <motion.span
                        layoutId="nav-underline"
                        className="absolute bottom-0.5 left-2 right-2 h-0.5 rounded-full"
                        style={{ background: accent.color, opacity: 0.7 }}
                        transition={{ type: "spring", stiffness: 380, damping: 30 }}
                      />
                    )}
                  </span>
                </Link>
              );
            })}

            <Link href="/generate">
              <motion.span
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                transition={{ type: "spring", stiffness: 400, damping: 22 }}
                className={`relative ml-0.5 sm:ml-1 inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-2 sm:py-1.5 rounded-md text-sm font-semibold overflow-hidden text-white shadow-sm shadow-primary/20 ${
                  generateActive ? "ring-2 ring-primary/40 ring-offset-1 ring-offset-background" : ""
                }`}
                style={{
                  background:
                    "linear-gradient(120deg, hsl(150 60% 45%) 0%, hsl(140 65% 42%) 50%, hsl(95 65% 45%) 100%)",
                }}
                aria-label="Generate flashcards"
              >
                <motion.span
                  aria-hidden
                  className="absolute inset-0"
                  style={{
                    background:
                      "linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.45) 50%, transparent 70%)",
                  }}
                  animate={{ x: ["-120%", "120%"] }}
                  transition={{
                    duration: 2.6,
                    repeat: Infinity,
                    ease: "easeInOut",
                    repeatDelay: 1.4,
                  }}
                />
                <motion.span
                  aria-hidden
                  className="relative inline-flex"
                  animate={{ rotate: [0, 14, -10, 0], scale: [1, 1.15, 1, 1] }}
                  transition={{
                    duration: 2.4,
                    repeat: Infinity,
                    ease: "easeInOut",
                    repeatDelay: 0.6,
                  }}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                </motion.span>
                <span className="relative">Generate</span>
              </motion.span>
            </Link>
          </nav>
          <div className="ml-auto pl-2 flex items-center gap-1.5">
            {import.meta.env.DEV && <DevPlanBadge />}
            <OfflineBadge />
            <SyncIndicator queueCount={queueCount} isSyncing={isSyncing} />
            {(canInstall || isIosInstallable) && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                onClick={canInstall ? install : () => setShowIosModal(true)}
                aria-label="Install app"
                title="Install AnkiGen as an app"
              >
                <Download className="h-4 w-4" />
              </Button>
            )}
            <PomodoroTimer />
            {isPro ? (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-amber-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                aria-label="Manage billing"
                title="Manage billing"
                onClick={handleManageBilling}
                disabled={billingLoading}
              >
                {billingLoading
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <CreditCard className="h-4 w-4" />}
              </Button>
            ) : (
              <Link href="/pricing">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-amber-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                  aria-label="Upgrade to Pro"
                  title="Upgrade to Pro"
                >
                  <Crown className="h-4 w-4" />
                </Button>
              </Link>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={() => setDark(d => !d)}
              aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
            >
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>

            {/* Auth button */}
            {authLoading ? (
              <div className="h-8 w-8 flex items-center justify-center">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              </div>
            ) : isLoggedIn && user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-full overflow-hidden border border-border/60 hover:border-border p-0"
                    aria-label={`Account: ${displayName}`}
                    title={displayName ?? "Account"}
                  >
                    {user.profileImageUrl ? (
                      <img
                        src={user.profileImageUrl}
                        alt={displayName ?? "User"}
                        className="h-full w-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <span className="h-full w-full flex items-center justify-center bg-primary/10 text-primary text-xs font-bold">
                        {initials}
                      </span>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <div className="px-2 py-1.5">
                    <p className="text-sm font-medium truncate">{displayName}</p>
                    {user.email && (
                      <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                    )}
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/pricing">
                      <Crown className="h-3.5 w-3.5 mr-2 text-amber-500" />
                      {isPro ? "Manage subscription" : "Upgrade to Pro"}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <a href={getLogoutUrl()} className="flex items-center text-destructive focus:text-destructive">
                      <LogOut className="h-3.5 w-3.5 mr-2" />
                      Sign out
                    </a>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 text-muted-foreground hover:text-foreground px-2"
                onClick={() => { window.location.href = getLoginUrl(window.location.pathname); }}
                aria-label="Sign in"
                title="Sign in to save your progress"
              >
                <LogIn className="h-3.5 w-3.5" />
                <span className="hidden sm:inline text-xs font-medium">Sign in</span>
              </Button>
            )}
          </div>
        </div>
      </header>
      <main className={`relative z-[1] flex-1 flex flex-col w-full ${location.startsWith("/planner") ? "" : "max-w-5xl mx-auto p-4 md:p-8"}`}>
        {children}
      </main>
      <FeedbackButton />
      <ApkWelcomeBanner />
      <IosInstallModal open={showIosModal} onClose={() => setShowIosModal(false)} />
    </div>
  );
}
