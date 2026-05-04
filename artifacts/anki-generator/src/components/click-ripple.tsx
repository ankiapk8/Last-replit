import { useEffect, useState, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";

type Ripple = {
  id: number;
  x: number;
  y: number;
  color: string;
  size: number;
};

const COLORS = [
  "hsl(150 60% 55%)",
  "hsl(140 70% 50%)",
  "hsl(160 55% 50%)",
  "hsl(95 65% 50%)",
];

function isInteractive(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return !!target.closest(
    'button, a, [role="button"], [role="tab"], [role="menuitem"], [role="option"], [role="checkbox"], [role="switch"], input[type="button"], input[type="submit"], input[type="checkbox"], input[type="radio"], label, summary, [data-ripple]'
  );
}

export function ClickRipple() {
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const counterRef = useRef(0);

  useEffect(() => {
    const handler = (e: PointerEvent) => {
      if (!isInteractive(e.target)) return;
      const id = ++counterRef.current;
      const color = COLORS[id % COLORS.length];
      const size = 120 + Math.random() * 40;
      setRipples((prev) => [
        ...prev,
        { id, x: e.clientX, y: e.clientY, color, size },
      ]);
      window.setTimeout(() => {
        setRipples((prev) => prev.filter((r) => r.id !== id));
      }, 700);
    };
    document.addEventListener("pointerdown", handler, { passive: true });
    return () => document.removeEventListener("pointerdown", handler);
  }, []);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[9998] overflow-hidden"
    >
      <AnimatePresence>
        {ripples.map((r) => (
          <motion.span
            key={r.id}
            initial={{ scale: 0, opacity: 0.55 }}
            animate={{ scale: 1, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            style={{
              position: "absolute",
              left: r.x - r.size / 2,
              top: r.y - r.size / 2,
              width: r.size,
              height: r.size,
              borderRadius: "9999px",
              background: `radial-gradient(circle, ${r.color}55 0%, ${r.color}22 40%, transparent 70%)`,
              mixBlendMode: "multiply",
            }}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
