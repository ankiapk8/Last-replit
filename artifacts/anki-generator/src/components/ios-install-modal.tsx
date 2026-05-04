import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Apple,
  Share,
  Plus,
  Sparkles,
  X,
  PartyPopper,
  Smartphone,
  Tablet,
} from "lucide-react";

type Device = "iphone" | "ipad";

type Step = {
  icon: React.ReactNode;
  title: string;
  desc: string;
};

const IPHONE_STEPS: Step[] = [
  {
    icon: <Share className="w-6 h-6" />,
    title: "Tap the Share button",
    desc: "It's the square with an upward arrow in Safari's bottom toolbar.",
  },
  {
    icon: <Plus className="w-6 h-6" />,
    title: 'Choose "Add to Home Screen"',
    desc: "Scroll the share sheet a little until you see this option, then tap it.",
  },
  {
    icon: <Sparkles className="w-6 h-6" />,
    title: 'Tap "Add"',
    desc: "AnkiGen lands on your home screen like a real app — works offline too!",
  },
];

const IPAD_STEPS: Step[] = [
  {
    icon: <Share className="w-6 h-6" />,
    title: "Tap the Share button",
    desc: "On iPad it lives in the top-right corner of Safari, next to the address bar.",
  },
  {
    icon: <Plus className="w-6 h-6" />,
    title: 'Pick "Add to Home Screen"',
    desc: "It's in the second row of share-sheet actions. Swipe down if you don't see it.",
  },
  {
    icon: <Sparkles className="w-6 h-6" />,
    title: 'Confirm with "Add"',
    desc: "AnkiGen will appear on your iPad home screen and open full-screen, just like a real app.",
  },
];

function detectDevice(): Device {
  if (typeof navigator === "undefined") return "iphone";
  const ua = navigator.userAgent;
  const isIPad =
    /iPad/.test(ua) ||
    (navigator.platform === "MacIntel" &&
      (navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints! > 1);
  return isIPad ? "ipad" : "iphone";
}

export function IosInstallModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [exiting, setExiting] = useState(false);
  const [device, setDevice] = useState<Device>("iphone");

  const initialDevice = useMemo(() => detectDevice(), []);

  useEffect(() => {
    if (open) {
      setDevice(initialDevice);
      setExiting(false);
    }
  }, [open, initialDevice]);

  const handleClose = () => {
    if (exiting) return;
    setExiting(true);
    window.setTimeout(() => {
      setExiting(false);
      onClose();
    }, 1400);
  };

  // Lock body scroll while modal is open so iOS Safari won't scroll the page
  // behind it and we can fully control the modal's vertical position.
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    const prevPaddingRight = document.body.style.paddingRight;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPaddingRight;
    };
  }, [open]);

  const steps = device === "ipad" ? IPAD_STEPS : IPHONE_STEPS;
  const heading = "Install on iPhone/iPad";

  if (typeof document === "undefined") return null;

  const overlay = (
    <AnimatePresence>
      {open && (
        <motion.div
          key="ios-install-backdrop"
          className="ios-install-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35 }}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            height: "100dvh",
            zIndex: 2147483600,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1.5rem 1rem",
            overflowY: "auto",
            WebkitOverflowScrolling: "touch",
            background:
              "radial-gradient(ellipse at top, rgba(22,163,74,0.95) 0%, rgba(6,78,59,0.95) 70%, rgba(0,0,0,0.85) 100%)",
            backdropFilter: "blur(8px)",
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Install on iPhone or iPad"
          onClick={handleClose}
        >
          {Array.from({ length: 18 }).map((_, i) => (
            <motion.div
              key={i}
              aria-hidden
              className="pointer-events-none absolute w-1.5 h-1.5 rounded-full bg-yellow-200"
              style={{
                left: `${(i * 53) % 100}%`,
                top: `${(i * 71) % 100}%`,
                filter: "blur(0.5px)",
                boxShadow: "0 0 8px rgba(254, 240, 138, 0.9)",
              }}
              animate={{
                opacity: [0, 1, 0],
                scale: [0, 1.3, 0],
                y: [0, -30 - (i % 3) * 10, -60],
              }}
              transition={{
                duration: 3 + (i % 4) * 0.5,
                repeat: Infinity,
                delay: (i * 0.13) % 3,
                ease: "easeInOut",
              }}
            />
          ))}

          <motion.div
            className="relative w-full max-w-md rounded-3xl bg-white text-slate-800 shadow-2xl overflow-hidden flex flex-col"
            style={{
              marginTop: "auto",
              marginBottom: "auto",
              maxHeight: "calc(100dvh - 3rem)",
            }}
            initial={{ scale: 0.85, y: 30, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.9, y: 20, opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 22 }}
            onClick={(e) => e.stopPropagation()}
            data-testid="ios-install-modal"
          >
            <button
              type="button"
              onClick={handleClose}
              className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition"
              aria-label="Close"
              data-testid="ios-install-close"
            >
              <X className="w-5 h-5" />
            </button>

            <div
              className="relative px-6 pt-8 pb-6 text-center text-white overflow-hidden"
              style={{
                background:
                  "linear-gradient(135deg, #16A34A 0%, #15803D 50%, #064E3B 100%)",
              }}
            >
              <TreasureChest exiting={exiting} />
              <h2 className="text-2xl font-bold tracking-tight mt-3" data-testid="ios-install-heading">
                {heading}
              </h2>
              <p className="text-white/85 text-sm mt-1">
                <Apple className="inline w-3.5 h-3.5 -mt-0.5 mr-1" />
                iOS doesn't use APK files — but you can install AnkiGen as a real app in 3 quick steps.
              </p>
            </div>

            {/* Device tabs */}
            <div className="px-6 pt-4">
              <div
                role="tablist"
                aria-label="Choose your device"
                className="relative flex p-1 rounded-full bg-emerald-50 border border-emerald-100"
              >
                <motion.div
                  aria-hidden
                  className="absolute top-1 bottom-1 w-[calc(50%-0.25rem)] rounded-full bg-gradient-to-r from-emerald-500 to-green-600 shadow-md shadow-emerald-600/30"
                  initial={false}
                  animate={{ x: device === "iphone" ? 0 : "100%" }}
                  transition={{ type: "spring", stiffness: 320, damping: 28 }}
                />
                <DeviceTab
                  active={device === "iphone"}
                  icon={<Smartphone className="w-4 h-4" />}
                  label="iPhone"
                  onClick={() => setDevice("iphone")}
                  testid="ios-tab-iphone"
                />
                <DeviceTab
                  active={device === "ipad"}
                  icon={<Tablet className="w-4 h-4" />}
                  label="iPad"
                  onClick={() => setDevice("ipad")}
                  testid="ios-tab-ipad"
                />
              </div>
            </div>

            <div className="px-6 py-4">
              <AnimatePresence mode="wait">
                <motion.div
                  key={device}
                  className="space-y-3"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.22 }}
                >
                  <DeviceHint device={device} />
                  {steps.map((step, i) => (
                    <motion.div
                      key={i}
                      className="flex items-start gap-3 p-3 rounded-2xl bg-emerald-50/60 border border-emerald-100"
                      initial={{ opacity: 0, x: -16 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.08 + i * 0.1, duration: 0.35 }}
                    >
                      <div className="shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 text-white flex items-center justify-center shadow-md">
                        {step.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-emerald-700">
                            STEP {i + 1}
                          </span>
                        </div>
                        <div className="font-semibold text-sm">{step.title}</div>
                        <div className="text-xs text-slate-600 mt-0.5">{step.desc}</div>
                      </div>
                    </motion.div>
                  ))}
                </motion.div>
              </AnimatePresence>
            </div>

            <div className="px-6 pb-6">
              <p className="text-[11px] text-slate-500 text-center mb-3">
                Tip: open this site in <strong>Safari</strong> (not Chrome) for the install option.
              </p>
              <button
                type="button"
                onClick={handleClose}
                className="w-full h-11 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 text-white font-semibold shadow-lg shadow-emerald-600/30 hover:shadow-emerald-600/50 hover:scale-[1.01] active:scale-[0.99] transition"
                data-testid="ios-install-got-it"
              >
                Got it!
              </button>
            </div>

            <AnimatePresence>
              {exiting && (
                <motion.div
                  key="exit-overlay"
                  className="absolute inset-0 flex flex-col items-center justify-center text-white"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  style={{
                    background:
                      "radial-gradient(circle at center, rgba(22,163,74,0.97) 0%, rgba(6,78,59,0.98) 100%)",
                  }}
                >
                  {Array.from({ length: 22 }).map((_, i) => {
                    const angle = (i / 22) * Math.PI * 2;
                    const dist = 140 + (i % 4) * 30;
                    return (
                      <motion.span
                        key={i}
                        aria-hidden
                        className="absolute w-2 h-2 rounded-full"
                        style={{
                          background: i % 3 === 0 ? "#FACC15" : i % 3 === 1 ? "#A7F3D0" : "#FFFFFF",
                          boxShadow: "0 0 10px rgba(254,240,138,0.9)",
                        }}
                        initial={{ opacity: 1, x: 0, y: 0, scale: 0.6 }}
                        animate={{
                          opacity: 0,
                          x: Math.cos(angle) * dist,
                          y: Math.sin(angle) * dist,
                          scale: 1.4,
                        }}
                        transition={{ duration: 1.1, ease: "easeOut" }}
                      />
                    );
                  })}

                  <motion.div
                    initial={{ scale: 0, rotate: -45 }}
                    animate={{ scale: [0, 1.3, 1], rotate: 0 }}
                    transition={{ duration: 0.6, ease: "easeOut" }}
                    className="w-20 h-20 rounded-full bg-white/15 flex items-center justify-center mb-3 backdrop-blur"
                  >
                    <PartyPopper className="w-10 h-10 text-yellow-200" strokeWidth={2.2} />
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2, duration: 0.4 }}
                    className="font-bold text-xl text-center px-6"
                  >
                    Happy studying!
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.35, duration: 0.4 }}
                    className="text-white/85 text-sm mt-1 text-center px-8"
                  >
                    Your treasure of knowledge awaits ✨
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return createPortal(overlay, document.body);
}

function DeviceTab({
  active,
  icon,
  label,
  onClick,
  testid,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  testid: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      data-testid={testid}
      className={`relative z-10 flex-1 flex items-center justify-center gap-1.5 h-9 rounded-full text-sm font-semibold transition-colors ${
        active ? "text-white" : "text-emerald-700 hover:text-emerald-900"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function DeviceHint({ device }: { device: Device }) {
  const isIPad = device === "ipad";
  return (
    <div
      className="relative flex items-center gap-3 p-3 rounded-2xl border bg-gradient-to-r from-emerald-50 to-green-50 border-emerald-100 overflow-hidden"
      data-testid={`ios-device-hint-${device}`}
    >
      <DeviceFrame variant={device} />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-bold uppercase tracking-wider text-emerald-700">
          {isIPad ? "iPad Safari" : "iPhone Safari"}
        </div>
        <div className="text-sm font-semibold text-slate-800 leading-tight">
          {isIPad
            ? "Look for the share icon in the top-right corner."
            : "Look for the share icon in the bottom toolbar."}
        </div>
      </div>
    </div>
  );
}

function DeviceFrame({ variant }: { variant: Device }) {
  const isIPad = variant === "ipad";
  const w = isIPad ? 56 : 36;
  const h = isIPad ? 42 : 60;
  const radius = isIPad ? 6 : 7;
  const sharePos = isIPad
    ? { top: 6, right: 6 }
    : { bottom: 6, left: "50%" as const, transform: "translateX(-50%)" };

  return (
    <div
      className="relative shrink-0 rounded-[10px] bg-gradient-to-br from-slate-800 to-slate-950 shadow-inner"
      style={{ width: w, height: h, padding: 3 }}
      aria-hidden
    >
      <div
        className="relative w-full h-full bg-white overflow-hidden"
        style={{ borderRadius: radius }}
      >
        <div className="absolute inset-x-0 top-0 h-2 bg-emerald-100" />
        <div className="absolute inset-x-1 top-3 h-0.5 bg-slate-200 rounded" />
        <div className="absolute inset-x-1 top-4 h-0.5 bg-slate-200 rounded" />
        <div className="absolute inset-x-1 top-5 h-0.5 bg-slate-100 rounded" />

        <motion.div
          className="absolute flex items-center justify-center rounded-sm bg-emerald-500 text-white shadow"
          style={{ width: 11, height: 11, ...sharePos }}
          animate={{ scale: [1, 1.25, 1] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        >
          <Share className="w-2 h-2" strokeWidth={3} />
        </motion.div>

        <motion.span
          aria-hidden
          className="absolute w-2 h-2 rounded-full bg-yellow-300"
          style={{
            ...(isIPad
              ? { top: 4, right: 4 }
              : { bottom: 4, left: "50%" as const, marginLeft: -4 }),
            boxShadow: "0 0 8px rgba(253,224,71,0.9)",
          }}
          animate={{ opacity: [0.2, 1, 0.2], scale: [0.6, 1.4, 0.6] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>
    </div>
  );
}

function TreasureChest({ exiting }: { exiting: boolean }) {
  return (
    <div className="relative w-32 h-32 mx-auto">
      <motion.div
        aria-hidden
        className="absolute inset-0 rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(254,240,138,0.55) 0%, transparent 70%)",
        }}
        animate={{ scale: [1, 1.15, 1], opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
      />

      <motion.div
        className="absolute left-1/2 -translate-x-1/2 bottom-2 w-24 h-14 rounded-md"
        style={{
          background: "linear-gradient(180deg, #B45309 0%, #78350F 100%)",
          boxShadow: "inset 0 -4px 0 rgba(0,0,0,0.25), 0 6px 14px rgba(0,0,0,0.35)",
        }}
        initial={{ y: 6, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <div className="absolute left-1/2 -translate-x-1/2 -top-1 w-4 h-4 rounded-sm bg-yellow-400 border border-yellow-600" />
        <div className="absolute inset-x-2 top-2 h-0.5 bg-yellow-500/80" />
        <div className="absolute inset-x-2 bottom-2 h-0.5 bg-yellow-500/80" />
      </motion.div>

      <motion.div
        className="absolute left-1/2 -translate-x-1/2 bottom-[52px] w-24 h-8 rounded-t-[18px] origin-bottom"
        style={{
          background: "linear-gradient(180deg, #D97706 0%, #92400E 100%)",
          boxShadow: "inset 0 2px 0 rgba(255,255,255,0.18), 0 -3px 8px rgba(0,0,0,0.25)",
        }}
        initial={{ rotate: 0 }}
        animate={exiting ? { rotate: 0 } : { rotate: -55 }}
        transition={{ delay: exiting ? 0 : 0.5, duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }}
      >
        <div className="absolute inset-x-2 top-1.5 h-0.5 bg-yellow-500/80" />
      </motion.div>

      {!exiting &&
        Array.from({ length: 8 }).map((_, i) => {
          const angle = -Math.PI / 2 + (i - 3.5) * 0.18;
          const dist = 36 + (i % 3) * 8;
          return (
            <motion.span
              key={i}
              aria-hidden
              className="absolute left-1/2 bottom-10 w-2.5 h-2.5 rounded-full"
              style={{
                background: i % 2 === 0 ? "#FACC15" : "#FDE68A",
                boxShadow: "0 0 6px rgba(254,240,138,0.9)",
              }}
              initial={{ x: -5, y: 0, opacity: 0, scale: 0.5 }}
              animate={{
                x: Math.cos(angle) * dist - 5,
                y: Math.sin(angle) * dist,
                opacity: [0, 1, 1, 0],
                scale: [0.5, 1.1, 1, 0.7],
              }}
              transition={{
                delay: 0.9 + i * 0.06,
                duration: 1.6,
                repeat: Infinity,
                repeatDelay: 1.4,
                ease: "easeOut",
              }}
            />
          );
        })}
    </div>
  );
}
