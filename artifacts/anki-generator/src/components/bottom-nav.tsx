import { Link, useLocation } from "wouter";
import { LayoutDashboard, Library, Sparkles, History } from "lucide-react";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/decks", label: "Library", icon: Library },
  { href: "/generate", label: "Generate", icon: Sparkles, highlight: true },
  { href: "/history", label: "History", icon: History },
];

export function BottomNav() {
  const [location] = useLocation();

  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-md border-t border-border/60 flex items-stretch"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      {NAV_ITEMS.map(({ href, label, icon: Icon, highlight }) => {
        const isActive = href === "/" ? location === "/" : location.startsWith(href);
        return (
          <Link key={href} href={href} className="flex-1">
            <span
              className={`flex flex-col items-center justify-center gap-0.5 py-2 px-1 w-full transition-colors ${
                highlight
                  ? isActive
                    ? "text-white"
                    : "text-emerald-600 dark:text-emerald-400"
                  : isActive
                  ? "text-primary"
                  : "text-muted-foreground"
              }`}
            >
              {highlight ? (
                <span
                  className={`h-9 w-9 rounded-xl flex items-center justify-center transition-all ${
                    isActive
                      ? "bg-primary shadow-md shadow-primary/30"
                      : "bg-primary/10"
                  }`}
                >
                  <Icon className={`h-5 w-5 ${isActive ? "text-white" : "text-primary"}`} />
                </span>
              ) : (
                <Icon className="h-5 w-5" />
              )}
              <span className="text-[10px] font-medium leading-none">{label}</span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
