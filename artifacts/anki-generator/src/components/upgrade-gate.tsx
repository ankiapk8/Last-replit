import { motion } from "framer-motion";
import { Crown, Lock, Sparkles } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

interface UpgradeGateProps {
  feature: string;
  description?: string;
  className?: string;
}

export function UpgradeGate({ feature, description, className = "" }: UpgradeGateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`relative overflow-hidden rounded-xl border border-amber-300/40 dark:border-amber-700/40 bg-gradient-to-br from-amber-50/80 via-orange-50/60 to-yellow-50/80 dark:from-amber-950/20 dark:via-orange-950/15 dark:to-yellow-950/20 p-6 text-center ${className}`}
    >
      <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(251,191,36,0.12) 0%, transparent 65%)" }} />
      <div className="relative flex flex-col items-center gap-3">
        <div className="h-12 w-12 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shadow-sm">
          <Lock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
        </div>
        <div>
          <p className="font-semibold text-amber-900 dark:text-amber-200">{feature}</p>
          {description && (
            <p className="mt-1 text-sm text-amber-700/80 dark:text-amber-400/80">{description}</p>
          )}
        </div>
        <Link href="/pricing">
          <Button size="sm" className="gap-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white border-0 shadow-sm">
            <Crown className="h-3.5 w-3.5" />
            Upgrade to Pro
          </Button>
        </Link>
      </div>
    </motion.div>
  );
}

interface UpgradeBadgeProps {
  label?: string;
}

export function UpgradeBadge({ label = "Pro" }: UpgradeBadgeProps) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-gradient-to-r from-amber-400/20 to-orange-400/20 text-amber-700 dark:text-amber-400 border border-amber-300/50 dark:border-amber-700/50">
      <Crown className="h-2.5 w-2.5" />
      {label}
    </span>
  );
}

interface UpgradeBannerProps {
  feature?: string;
  compact?: boolean;
}

export function UpgradeBanner({ feature, compact = false }: UpgradeBannerProps) {
  if (compact) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-amber-300/50 dark:border-amber-700/50 bg-amber-50/80 dark:bg-amber-950/20 px-3 py-2">
        <Sparkles className="h-3.5 w-3.5 text-amber-500 shrink-0" />
        <p className="text-xs text-amber-800 dark:text-amber-300 flex-1">
          {feature ? `${feature} is a Pro feature.` : "Upgrade to Pro for full access."}
        </p>
        <Link href="/pricing">
          <button className="text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline shrink-0">
            Upgrade →
          </button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-amber-300/50 dark:border-amber-700/50 bg-amber-50/80 dark:bg-amber-950/20 px-4 py-3">
      <Crown className="h-4 w-4 text-amber-500 shrink-0" />
      <p className="text-sm text-amber-800 dark:text-amber-300 flex-1">
        {feature ? <><strong>{feature}</strong> is a Pro feature.</> : "Upgrade to Pro for full access."}
      </p>
      <Link href="/pricing">
        <Button size="sm" variant="outline" className="h-7 text-xs shrink-0 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/30">
          <Crown className="h-3 w-3 mr-1" />
          Upgrade
        </Button>
      </Link>
    </div>
  );
}
