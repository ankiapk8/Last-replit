import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import {
  Crown, Check, Sparkles, Zap, Brain, FileText, BarChart3,
  Star, Loader2, BookOpen, FileStack, Image,
  MessageSquare, Map, Download, CalendarDays, CheckCircle2,
  AlertTriangle, WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { AmbientOrbs } from "@/components/ambient-orbs";
import { useSubscription, useUsage, fetchProducts, fetchStripeConfigured, startCheckout, openBillingPortal } from "@/hooks/useSubscription";
import { useToast } from "@/hooks/use-toast";
import { useSearch } from "wouter";

interface Price {
  id: string;
  unitAmount: number;
  currency: string;
  recurring: { interval: string } | null;
}

interface Product {
  id: string;
  name: string;
  description: string;
  prices: Price[];
}

const FREE_FEATURES = [
  { icon: FileText, text: "Generate up to 20 cards per session" },
  { icon: BookOpen, text: "Basic flashcard decks" },
  { icon: BarChart3, text: "Study stats & streak tracking" },
  { icon: CheckCircle2, text: "SRS-based spaced repetition" },
];

const PRO_FEATURES = [
  { icon: Zap, text: "Unlimited card generation" },
  { icon: FileStack, text: "Question Bank (MCQ) generation" },
  { icon: Image, text: "Visual PDF extraction & image cards" },
  { icon: Brain, text: "AI explanations — mnemonics, OSCE, clinical" },
  { icon: Map, text: "AI mind map generation" },
  { icon: Download, text: "Export to Anki (.apkg)" },
  { icon: CalendarDays, text: "Full Study Planner access" },
  { icon: MessageSquare, text: "Priority support" },
];

function formatPrice(unitAmount: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(unitAmount / 100);
}

function UsageBar({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const unlimited = limit === null;
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / limit!) * 100));
  const isNearLimit = !unlimited && pct >= 80;
  const isAtLimit = !unlimited && used >= limit!;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className={`font-medium tabular-nums ${isAtLimit ? "text-red-500 dark:text-red-400" : isNearLimit ? "text-amber-500 dark:text-amber-400" : "text-foreground"}`}>
          {unlimited ? `${used} / ∞` : `${used} / ${limit}`}
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <motion.div
          className={`h-full rounded-full transition-colors ${isAtLimit ? "bg-red-500" : isNearLimit ? "bg-amber-400" : "bg-emerald-500"}`}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}

export default function Pricing() {
  const { isPro, subscription, isLoading: subLoading, refetch } = useSubscription();
  const { decks, deckLimit, exports, exportLimit, isLoading: usageLoading } = useUsage();
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [pollingForPro, setPollingForPro] = useState(false);
  const [stripeConfigured, setStripeConfigured] = useState<boolean | null>(null);
  const { toast } = useToast();
  const rawSearch = useSearch();
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(rawSearch);
    if (params.get("success") === "1") {
      if (!isPro && !subLoading) {
        setPollingForPro(true);
        let attempts = 0;
        pollingRef.current = setInterval(async () => {
          attempts++;
          const result = await refetch();
          if (result.data?.isPro || attempts >= 7) {
            clearInterval(pollingRef.current!);
            pollingRef.current = null;
            setPollingForPro(false);
            if (result.data?.isPro) {
              toast({ title: "You're now Pro!", description: "Full access is active. Enjoy unlimited generation." });
            } else {
              toast({ title: "Checkout complete!", description: "Your subscription is processing — refresh in a moment if Pro isn't active yet." });
            }
          }
        }, 1500);
      } else if (isPro) {
        toast({ title: "You're on Pro!", description: "Your subscription is active." });
      }
    } else if (params.get("canceled") === "1") {
      toast({ title: "Checkout canceled", description: "You can upgrade any time from this page.", variant: "destructive" });
    }
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [rawSearch]);

  useEffect(() => {
    setLoadingProducts(true);
    Promise.all([fetchProducts(), fetchStripeConfigured()])
      .then(([prods, configured]) => {
        setProducts(prods);
        setStripeConfigured(configured);
      })
      .finally(() => setLoadingProducts(false));
  }, []);

  const monthlyPrice = products
    .flatMap(p => p.prices)
    .find(p => p.recurring?.interval === "month");
  const yearlyPrice = products
    .flatMap(p => p.prices)
    .find(p => p.recurring?.interval === "year");

  async function handleCheckout(priceId: string) {
    setCheckoutLoading(priceId);
    try {
      const url = await startCheckout(priceId);
      if (url) window.location.href = url;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Please try again.";
      toast({ title: "Checkout failed", description: msg, variant: "destructive" });
    } finally {
      setCheckoutLoading(null);
    }
  }

  async function handlePortal() {
    setPortalLoading(true);
    try {
      const url = await openBillingPortal();
      if (url) window.open(url, "_blank", "noopener");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Please try again.";
      toast({ title: "Could not open billing portal", description: msg, variant: "destructive" });
    } finally {
      setPortalLoading(false);
    }
  }

  const showUsage = !isPro && !usageLoading;
  const anyNearLimit = !isPro && (
    (deckLimit != null && decks / deckLimit >= 0.8) ||
    (exportLimit != null && exports / exportLimit >= 0.8)
  );

  return (
    <div className="relative space-y-10 animate-in fade-in duration-500 pb-16">
      <AmbientOrbs color="hsl(38 95% 58% / 0.10)" className="rounded-3xl" />

      <PageHeader
        icon={Crown}
        iconColor="#f59e0b"
        iconGlow="hsl(38 95% 60% / 0.5)"
        gradient="from-amber-500 via-orange-400 to-yellow-500"
        title="Upgrade to Pro"
        subtitle="Unlock unlimited card generation, QBanks, AI explanations, and more."
      />

      {/* Polling spinner */}
      {pollingForPro && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-amber-300/50 dark:border-amber-700/50 bg-amber-50/80 dark:bg-amber-950/20 p-4 flex items-center gap-3"
        >
          <Loader2 className="h-5 w-5 text-amber-500 animate-spin shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">Activating your Pro subscription…</p>
            <p className="text-xs text-amber-700/70 dark:text-amber-400/70">This usually takes a few seconds.</p>
          </div>
        </motion.div>
      )}

      {/* Active Pro banner */}
      {isPro && subscription && !pollingForPro && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-emerald-300/50 dark:border-emerald-700/50 bg-emerald-50/80 dark:bg-emerald-950/20 p-4 flex items-center gap-3"
        >
          <div className="h-9 w-9 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0">
            <Star className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">You're on Pro!</p>
            <p className="text-xs text-emerald-700/70 dark:text-emerald-400/70">
              {subscription.cancelAtPeriodEnd
                ? "Your subscription will end at the current period."
                : subscription.currentPeriodEnd
                  ? `Renews ${new Date(subscription.currentPeriodEnd).toLocaleDateString()}`
                  : "Active subscription"}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300"
            onClick={handlePortal}
            disabled={portalLoading}
          >
            {portalLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Manage billing"}
          </Button>
        </motion.div>
      )}

      {/* Free-tier usage card */}
      {showUsage && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className={`rounded-xl border p-4 space-y-3 ${anyNearLimit ? "border-amber-300/60 dark:border-amber-700/50 bg-amber-50/60 dark:bg-amber-950/15" : "border-border/60 bg-card/60"}`}
        >
          <div className="flex items-center gap-2">
            {anyNearLimit
              ? <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
              : <BarChart3 className="h-4 w-4 text-muted-foreground shrink-0" />}
            <span className="text-sm font-medium">
              {anyNearLimit ? "You're approaching your free-tier limits" : "Your free-tier usage"}
            </span>
          </div>
          <UsageBar label="Decks created" used={decks} limit={deckLimit} />
          <UsageBar label="Anki exports today" used={exports} limit={exportLimit} />
          {anyNearLimit && (
            <p className="text-xs text-amber-700/80 dark:text-amber-400/70 pt-0.5">
              Upgrade to Pro for unlimited decks and exports.
            </p>
          )}
        </motion.div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        {/* Free tier */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur-sm p-6 flex flex-col gap-5"
        >
          <div>
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Free</span>
            <div className="mt-1 flex items-end gap-1">
              <span className="text-4xl font-bold">$0</span>
              <span className="text-muted-foreground mb-1">/month</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Get started with the essentials.</p>
          </div>
          <ul className="flex flex-col gap-2.5 flex-1">
            {FREE_FEATURES.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-2.5 text-sm">
                <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                {text}
              </li>
            ))}
          </ul>
          <Button variant="outline" className="w-full" disabled>
            {isPro ? "Previous plan" : "Current plan"}
          </Button>
        </motion.div>

        {/* Pro tier */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="relative rounded-2xl border-2 border-amber-400/60 dark:border-amber-600/50 bg-gradient-to-br from-amber-50/60 via-orange-50/40 to-card dark:from-amber-950/20 dark:via-orange-950/15 dark:to-card p-6 flex flex-col gap-5 shadow-lg shadow-amber-500/10"
        >
          <div className="absolute -top-3 left-4">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-sm">
              <Sparkles className="h-3 w-3" />
              Most Popular
            </span>
          </div>
          <div>
            <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-widest">Pro</span>
            <div className="mt-1">
              {loadingProducts ? (
                <div className="flex items-center gap-2 h-10">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  <span className="text-muted-foreground text-sm">Loading pricing…</span>
                </div>
              ) : monthlyPrice ? (
                <div className="flex items-end gap-1">
                  <span className="text-4xl font-bold">{formatPrice(monthlyPrice.unitAmount, monthlyPrice.currency)}</span>
                  <span className="text-muted-foreground mb-1">/month</span>
                </div>
              ) : (
                <div className="flex items-end gap-1">
                  <span className="text-4xl font-bold">$9.99</span>
                  <span className="text-muted-foreground mb-1">/month</span>
                </div>
              )}
              {yearlyPrice && (
                <p className="mt-0.5 text-xs text-amber-600 dark:text-amber-400 font-medium">
                  Or {formatPrice(yearlyPrice.unitAmount, yearlyPrice.currency)}/year — save 33%
                </p>
              )}
              <p className="mt-1 text-sm text-muted-foreground">Everything, unlimited.</p>
            </div>
          </div>
          <ul className="flex flex-col gap-2.5 flex-1">
            {PRO_FEATURES.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-2.5 text-sm">
                <div className="h-4 w-4 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0">
                  <Check className="h-2.5 w-2.5 text-amber-600 dark:text-amber-400" />
                </div>
                {text}
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-2">
            {isPro ? (
              <Button
                className="w-full gap-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white border-0 shadow-sm"
                onClick={handlePortal}
                disabled={portalLoading}
              >
                {portalLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crown className="h-4 w-4" />}
                Manage subscription
              </Button>
            ) : monthlyPrice ? (
              <>
                <Button
                  className="w-full gap-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white border-0 shadow-sm"
                  onClick={() => handleCheckout(monthlyPrice.id)}
                  disabled={checkoutLoading !== null || subLoading || pollingForPro}
                >
                  {checkoutLoading === monthlyPrice.id
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Crown className="h-4 w-4" />}
                  Get Pro — {formatPrice(monthlyPrice.unitAmount, monthlyPrice.currency)}/mo
                </Button>
                {yearlyPrice && (
                  <Button
                    variant="outline"
                    className="w-full gap-2 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                    onClick={() => handleCheckout(yearlyPrice.id)}
                    disabled={checkoutLoading !== null || subLoading || pollingForPro}
                  >
                    {checkoutLoading === yearlyPrice.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Annual — {formatPrice(yearlyPrice.unitAmount, yearlyPrice.currency)}/yr
                    <span className="ml-1 text-xs bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 px-1 py-0.5 rounded">Save 33%</span>
                  </Button>
                )}
              </>
            ) : stripeConfigured === false ? (
              <div className="rounded-lg border border-dashed border-muted-foreground/30 bg-muted/30 p-3 flex items-start gap-2.5 text-xs text-muted-foreground">
                <WifiOff className="h-4 w-4 shrink-0 mt-0.5" />
                <span>Stripe is not connected yet. Connect Stripe from the Integrations tab, or set <code className="font-mono bg-muted px-1 rounded">STRIPE_SECRET_KEY</code> in Secrets to enable payments.</span>
              </div>
            ) : (
              <Button
                className="w-full gap-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white border-0 shadow-sm"
                disabled
              >
                <Crown className="h-4 w-4" />
                Upgrade to Pro
              </Button>
            )}
          </div>
        </motion.div>
      </div>

      <div className="rounded-xl border border-border/60 bg-card/60 p-5">
        <h3 className="font-semibold mb-3 text-sm">Frequently asked questions</h3>
        <div className="space-y-3">
          {[
            {
              q: "Can I cancel anytime?",
              a: "Yes. Cancel from the billing portal and you keep Pro access until the end of your billing period.",
            },
            {
              q: "What happens to my data if I downgrade?",
              a: "All your decks, cards, and progress are always yours — nothing is deleted. Pro features are just locked.",
            },
            {
              q: "Is my payment secure?",
              a: "Payments are handled entirely by Stripe, a PCI-compliant processor. We never store your card details.",
            },
          ].map(({ q, a }) => (
            <div key={q}>
              <p className="text-sm font-medium">{q}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{a}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
