import { useState, useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, FileText, ImageIcon, Layers, Plus, Stethoscope, Library, Crown, Lock, Unlock, GitBranch, Download } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GenerateForm } from "@/components/generate-form";
import { GenerateQbankForm } from "@/components/generate-qbank-form";
import { useSubscription } from "@/hooks/useSubscription";
import { UpgradeBanner } from "@/components/upgrade-gate";
import { RequireAuthBanner } from "@/components/require-auth";

type Mode = "deck" | "qbank";

const features = [
  {
    icon: FileText,
    title: "From PDFs & text",
    desc: "Drop a file or paste notes — we'll turn them into smart cards.",
    color: "text-blue-500",
    bg: "bg-blue-500/10",
    pro: false,
  },
  {
    icon: ImageIcon,
    title: "Visual cards",
    desc: "PDFs with diagrams become visual flashcards automatically.",
    color: "text-violet-500",
    bg: "bg-violet-500/10",
    pro: true,
  },
  {
    icon: Layers,
    title: "Organized library",
    desc: "Group cards into topics, subdecks, and study sessions.",
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
    pro: false,
  },
  ...(import.meta.env.DEV ? [
    {
      icon: GitBranch,
      title: "Mind Map",
      desc: "AI-generated visual mind map of your deck's topics.",
      color: "text-indigo-500",
      bg: "bg-indigo-500/10",
      pro: true,
    },
    {
      icon: Download,
      title: "Export (.apkg)",
      desc: "Download your deck as an Anki-compatible .apkg file.",
      color: "text-rose-500",
      bg: "bg-rose-500/10",
      pro: true,
    },
  ] : []),
];

function DevLockBadge({ isPro, feature }: { isPro: boolean; feature: string }) {
  if (!import.meta.env.DEV) return null;
  return (
    <span
      title={isPro ? `${feature} — UNLOCKED (dev Pro active)` : `${feature} — Pro required`}
      className={`inline-flex items-center gap-0.5 text-[9px] font-bold font-mono px-1 py-0.5 rounded border shrink-0 ${
        isPro
          ? "text-emerald-600 dark:text-emerald-400 border-emerald-300/60 bg-emerald-50 dark:bg-emerald-900/20"
          : "text-amber-600 dark:text-amber-400 border-amber-300/50 bg-amber-50/80 dark:bg-amber-900/20"
      }`}
    >
      {isPro ? <Unlock className="h-2 w-2" /> : <Lock className="h-2 w-2" />}
      {isPro ? "UNLOCKED" : "PRO"}
    </span>
  );
}

export default function Generate() {
  const [, setLocation] = useLocation();
  const rawSearch = useSearch();
  const urlParams = useMemo(() => new URLSearchParams(rawSearch), [rawSearch]);
  const prefillDeckName = urlParams.get("deckName") ?? undefined;
  const prefillCustomPrompt = urlParams.get("customPrompt") ?? undefined;
  const [mode, setMode] = useState<Mode>(urlParams.get("mode") === "qbank" ? "qbank" : "deck");
  const { isPro } = useSubscription();

  const isQbank = mode === "qbank";

  // Theme tokens that swap based on mode so the whole hero rebrands
  const accent = isQbank
    ? {
        title: "Generate Question Bank",
        subtitle: "Drop PDFs or paste notes — we'll build vignette MCQs with full explanations.",
        gradient: "from-violet-500 via-fuchsia-500 to-purple-500",
        haloA: "hsl(280 70% 60% / 0.18)",
        haloB: "hsl(290 75% 55% / 0.16)",
        spark: "hsl(280 70% 60%), hsl(310 70% 55%), hsl(265 65% 50%), hsl(280 70% 60%)",
      }
    : {
        title: "Generate Flashcards",
        subtitle: "Turn any PDF, text, or topic into a polished study deck in seconds.",
        gradient: "from-primary via-emerald-500 to-lime-500",
        haloA: "hsl(150 60% 55% / 0.18)",
        haloB: "hsl(140 70% 50% / 0.16)",
        spark: "hsl(150 60% 55%), hsl(95 65% 50%), hsl(160 60% 40%), hsl(150 60% 55%)",
      };

  return (
    <div className="relative min-h-[60vh] pb-12">
      <RequireAuthBanner className="mb-4" message="Sign in to save your decks across devices and track your progress." />
      {/* Animated background */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8 }}
      >
        <motion.div
          key={`haloA-${mode}`}
          className="absolute -top-24 left-1/2 -translate-x-1/2 h-[500px] w-[500px] rounded-full"
          style={{
            background: `radial-gradient(circle, ${accent.haloA} 0%, transparent 70%)`,
            filter: "blur(20px)",
          }}
          animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.8, 0.5] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          key={`haloB-${mode}`}
          className="absolute -bottom-32 right-1/4 h-[360px] w-[360px] rounded-full"
          style={{
            background: `radial-gradient(circle, ${accent.haloB} 0%, transparent 70%)`,
            filter: "blur(20px)",
          }}
          animate={{ scale: [1.1, 1, 1.1], opacity: [0.4, 0.7, 0.4] }}
          transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
        />
        {[...Array(10)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full"
            style={{
              width: 4 + (i % 3) * 3,
              height: 4 + (i % 3) * 3,
              background: isQbank
                ? (i % 2 ? "hsl(280 70% 60% / 0.35)" : "hsl(310 70% 55% / 0.35)")
                : (i % 2 ? "hsl(150 50% 55% / 0.35)" : "hsl(140 70% 50% / 0.35)"),
              left: `${(i * 73) % 100}%`,
              top: `${10 + ((i * 47) % 70)}%`,
            }}
            animate={{
              y: [0, -20, 0],
              opacity: [0.2, 0.7, 0.2],
            }}
            transition={{
              duration: 4 + (i % 3),
              repeat: Infinity,
              delay: i * 0.3,
              ease: "easeInOut",
            }}
          />
        ))}
      </motion.div>

      {/* Hero */}
      <div className="text-center max-w-2xl mx-auto pt-6">
        <motion.div
          initial={{ scale: 0.5, opacity: 0, rotate: -15 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1.4, 0.36, 1] }}
          className="relative inline-flex"
        >
          <motion.div
            key={`halo-icon-${mode}`}
            className="absolute -inset-3 rounded-2xl"
            style={{
              background: `conic-gradient(from 0deg, ${accent.spark})`,
              filter: "blur(12px)",
              opacity: 0.5,
            }}
            animate={{ rotate: 360 }}
            transition={{ duration: 5, repeat: Infinity, ease: "linear" }}
          />
          <motion.div
            key={`icon-${mode}`}
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.4, ease: [0.22, 1.4, 0.36, 1] }}
            className={`relative h-16 w-16 rounded-2xl bg-gradient-to-br ${accent.gradient} flex items-center justify-center shadow-lg`}
          >
            {isQbank
              ? <Stethoscope className="h-8 w-8 text-white" />
              : <Sparkles className="h-8 w-8 text-white" />
            }
          </motion.div>
        </motion.div>

        <AnimatePresence mode="wait">
          <motion.h1
            key={`title-${mode}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35 }}
            className={`mt-5 font-serif text-4xl md:text-5xl font-bold tracking-tight bg-gradient-to-br ${accent.gradient} bg-clip-text text-transparent`}
          >
            {accent.title}
          </motion.h1>
        </AnimatePresence>

        <AnimatePresence mode="wait">
          <motion.p
            key={`sub-${mode}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.3 }}
            className="mt-3 text-muted-foreground text-base md:text-lg"
          >
            {accent.subtitle}
          </motion.p>
        </AnimatePresence>
      </div>

      {/* Mode toggle — animated pill with two buttons */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, duration: 0.5 }}
        className="mt-7 flex justify-center"
      >
        <div className="relative inline-flex p-1 rounded-full bg-muted/70 backdrop-blur-sm border border-border/60 shadow-sm">
          {/* Sliding highlight pill */}
          <motion.div
            className={`absolute top-1 bottom-1 w-1/2 rounded-full shadow-md bg-gradient-to-r ${accent.gradient}`}
            animate={{ x: isQbank ? "100%" : "0%" }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            style={{ left: 4, right: 4 }}
          />
          {/* Glow halo behind active pill */}
          <motion.div
            aria-hidden
            className="absolute top-1 bottom-1 w-1/2 rounded-full"
            animate={{ x: isQbank ? "100%" : "0%" }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            style={{
              left: 4,
              right: 4,
              background: isQbank
                ? "radial-gradient(circle, hsl(280 70% 60% / 0.45) 0%, transparent 70%)"
                : "radial-gradient(circle, hsl(150 60% 55% / 0.45) 0%, transparent 70%)",
              filter: "blur(10px)",
            }}
          />

          <button
            type="button"
            onClick={() => setMode("deck")}
            className={`relative z-10 flex items-center gap-1.5 px-4 sm:px-5 py-2 rounded-full text-sm font-semibold transition-colors ${
              mode === "deck" ? "text-white" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Library className="h-4 w-4" />
            Flashcards
          </button>
          <button
            type="button"
            onClick={() => setMode("qbank")}
            className={`relative z-10 flex items-center gap-1.5 px-4 sm:px-5 py-2 rounded-full text-sm font-semibold transition-colors ${
              mode === "qbank" ? "text-white" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Stethoscope className="h-4 w-4" />
            Question Bank
            {!import.meta.env.DEV && !isPro && (
              <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1 py-0.5 rounded bg-amber-400/20 text-amber-600 dark:text-amber-400 border border-amber-300/50 ml-0.5">
                <Crown className="h-2 w-2" />Pro
              </span>
            )}
            {import.meta.env.DEV && <DevLockBadge isPro={isPro} feature="Question Bank" />}
          </button>
        </div>
      </motion.div>

      {/* Feature highlights — only on deck mode */}
      <AnimatePresence mode="wait">
        {!isQbank && (
          <motion.div
            key="features-deck"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35 }}
            className="mt-8 grid grid-cols-2 gap-3 sm:gap-4 max-w-2xl mx-auto"
          >
            {features.map(({ icon: Icon, title, desc, color, bg, pro }, idx) => (
              <motion.div
                key={title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: 0.05 + idx * 0.08,
                  duration: 0.5,
                  ease: [0.22, 1, 0.36, 1],
                }}
                whileHover={{ y: -4, transition: { duration: 0.2 } }}
              >
                <Card className="h-full aspect-square border-border/50 shadow-sm hover:shadow-md hover:border-primary/30 transition-all bg-background/70 backdrop-blur-sm">
                  <CardContent className="p-4 sm:p-5 h-full flex flex-col">
                    <div className="flex items-start justify-between gap-1 mb-3">
                      <div className={`h-10 w-10 rounded-lg ${bg} flex items-center justify-center shrink-0`}>
                        <Icon className={`h-5 w-5 ${color}`} />
                      </div>
                      {pro && <DevLockBadge isPro={isPro} feature={title} />}
                    </div>
                    <p className="font-semibold text-sm sm:text-base">{title}</p>
                    <p className="text-xs sm:text-sm text-muted-foreground mt-1 leading-snug">
                      {desc}
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}

            {/* Build with AI tile */}
            <motion.button
              type="button"
              onClick={() => {
                const el = document.getElementById("generate-form-section");
                el?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              whileHover={{ y: -4, transition: { duration: 0.2 } }}
              whileTap={{ scale: 0.97 }}
              className="relative aspect-square rounded-xl overflow-hidden text-left group"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-primary via-emerald-500 to-lime-500" />
              <motion.div
                aria-hidden
                className="absolute -inset-8 opacity-60"
                style={{
                  background:
                    "conic-gradient(from 0deg, hsl(150 60% 55% / 0.4), transparent 60%, hsl(95 65% 50% / 0.4), transparent)",
                  filter: "blur(10px)",
                }}
                animate={{ rotate: 360 }}
                transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
              />
              <div className="relative h-full flex flex-col p-4 sm:p-5 text-white">
                <div className="h-10 w-10 rounded-lg bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center mb-3">
                  <Sparkles className="h-5 w-5" />
                </div>
                <p className="font-semibold text-sm sm:text-base">Build with AI</p>
                <p className="text-xs sm:text-sm text-white/85 mt-1 leading-snug">
                  Tap to start — upload, paste, generate.
                </p>
                <div className="mt-auto inline-flex items-center gap-1 text-xs font-semibold opacity-90 group-hover:opacity-100">
                  Start
                  <motion.span
                    animate={{ x: [0, 3, 0] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                  >
                    →
                  </motion.span>
                </div>
              </div>
            </motion.button>
          </motion.div>
        )}

        {/* Qbank-specific big animated CTA */}
        {isQbank && (
          <motion.div
            key="features-qbank"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35 }}
            className="mt-8 max-w-2xl mx-auto space-y-4"
          >
            {!isPro && (
              <UpgradeBanner feature="Question Bank generation" />
            )}
            <motion.button
              type="button"
              onClick={() => {
                if (!isPro) return;
                const el = document.getElementById("generate-form-section");
                el?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              whileHover={{ y: -3 }}
              whileTap={{ scale: 0.98 }}
              className="relative w-full overflow-hidden rounded-2xl text-left group shadow-lg"
            >
              {/* Base gradient */}
              <div className="absolute inset-0 bg-gradient-to-br from-violet-600 via-fuchsia-500 to-purple-600" />
              {/* Rotating conic glow */}
              <motion.div
                aria-hidden
                className="absolute -inset-12 opacity-70"
                style={{
                  background:
                    "conic-gradient(from 0deg, hsl(280 80% 65% / 0.5), transparent 55%, hsl(310 75% 60% / 0.5), transparent)",
                  filter: "blur(14px)",
                }}
                animate={{ rotate: 360 }}
                transition={{ duration: 9, repeat: Infinity, ease: "linear" }}
              />
              {/* Pulsing sheen */}
              <motion.div
                aria-hidden
                className="absolute inset-y-0 -inset-x-1/3"
                style={{
                  background:
                    "linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.18) 50%, transparent 70%)",
                }}
                animate={{ x: ["-30%", "130%"] }}
                transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut", repeatDelay: 0.6 }}
              />
              <div className="relative flex items-center gap-4 p-5 sm:p-6 text-white">
                <motion.div
                  animate={{ rotate: [0, -8, 8, 0], scale: [1, 1.05, 1] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                  className="h-14 w-14 rounded-xl bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center shrink-0"
                >
                  <Stethoscope className="h-7 w-7" />
                </motion.div>
                <div className="min-w-0 flex-1">
                  <p className="font-serif text-lg sm:text-xl font-bold leading-tight">
                    Build a Question Bank
                  </p>
                  <p className="text-xs sm:text-sm text-white/85 mt-0.5 leading-snug">
                    Vignette MCQs with full distractors and detailed explanations.
                  </p>
                </div>
                <div className="shrink-0 inline-flex items-center gap-1.5 text-sm font-semibold opacity-95 group-hover:opacity-100">
                  Start
                  <motion.span
                    animate={{ x: [0, 4, 0] }}
                    transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                  >
                    →
                  </motion.span>
                </div>
              </div>
            </motion.button>

            <p className="mt-3 text-center text-xs text-muted-foreground">
              Same PDF reading and OCR as flashcards — but every output is a multiple-choice question.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Inline form */}
      <motion.div
        id="generate-form-section"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="mt-10 max-w-2xl mx-auto scroll-mt-20"
      >
        <Card
          className={`shadow-md backdrop-blur-md overflow-hidden transition-colors ${
            isQbank
              ? "border-violet-500/30 bg-card/85"
              : "border-border/60 bg-card/85"
          }`}
        >
          <CardContent className="p-5 md:p-6">
            <div className="flex items-center justify-between gap-3 mb-5">
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={`h-9 w-9 rounded-xl border flex items-center justify-center shrink-0 ${
                    isQbank
                      ? "bg-gradient-to-br from-violet-500/20 to-violet-500/5 border-violet-500/30"
                      : "bg-gradient-to-br from-primary/20 to-primary/5 border-primary/20"
                  }`}
                >
                  {isQbank
                    ? <Stethoscope className="h-4 w-4 text-violet-600" />
                    : <Sparkles className="h-4 w-4 text-primary" />
                  }
                </div>
                <div className="min-w-0">
                  <p className="font-serif text-lg font-semibold leading-tight truncate">
                    {isQbank ? "Build a Question Bank" : "Build with AI"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {isQbank
                      ? "Upload PDFs, paste notes, or both."
                      : "Upload files, paste notes, or both."}
                  </p>
                </div>
              </div>
              {!isQbank && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 shrink-0"
                  onClick={() => setLocation("/decks?new=1")}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Empty deck
                </Button>
              )}
            </div>

            <AnimatePresence mode="wait">
              {isQbank ? (
                <motion.div
                  key="form-qbank"
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -16 }}
                  transition={{ duration: 0.25 }}
                >
                  {!isPro ? (
                    <div className="py-4">
                      <UpgradeBanner feature="Question Bank generation" />
                    </div>
                  ) : (
                    <GenerateQbankForm
                      prefilledDeckName={prefillDeckName}
                      prefilledCustomPrompt={prefillCustomPrompt}
                      onDone={(deckId) => {
                        if (deckId !== undefined) setLocation(`/decks/${deckId}`);
                        else setLocation("/decks");
                      }}
                    />
                  )}
                </motion.div>
              ) : (
                <motion.div
                  key="form-deck"
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 16 }}
                  transition={{ duration: 0.25 }}
                >
                  <GenerateForm
                    variant="page"
                    animated
                    onDone={() => setLocation("/decks")}
                    prefilledDeckName={prefillDeckName}
                    prefilledCustomPrompt={prefillCustomPrompt}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
