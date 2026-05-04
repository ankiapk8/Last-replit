import { motion } from "framer-motion";

type OrbConfig = {
  w: number; h: number;
  left: string; top: string;
  color: string;
  dx: number; dy: number;
  duration: number;
  opacity: [number, number, number];
};

function makeOrbs(color: string): OrbConfig[] {
  return [
    { w: 420, h: 420, left: "-8%",  top: "-15%", color, dx:  18, dy:  12, duration: 7.0, opacity: [0.28, 0.46, 0.28] },
    { w: 320, h: 320, left: "60%",  top:  "-5%", color, dx: -14, dy:  18, duration: 8.5, opacity: [0.18, 0.32, 0.18] },
    { w: 260, h: 260, left: "30%",  top:  "55%", color, dx:  10, dy: -14, duration: 6.5, opacity: [0.14, 0.24, 0.14] },
    { w: 200, h: 200, left: "78%",  top:  "60%", color, dx: -10, dy:   8, duration: 9.0, opacity: [0.12, 0.20, 0.12] },
  ];
}

type Props = {
  color: string;
  className?: string;
};

export function AmbientOrbs({ color, className = "" }: Props) {
  const orbs = makeOrbs(color);
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
      style={{ zIndex: 0 }}
    >
      {orbs.map((o, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{
            width: o.w,
            height: o.h,
            left: o.left,
            top: o.top,
            background: o.color,
            filter: "blur(72px)",
          }}
          animate={{
            x: [0, o.dx, 0],
            y: [0, o.dy, 0],
            opacity: o.opacity,
          }}
          transition={{
            duration: o.duration,
            repeat: Infinity,
            ease: "easeInOut",
            delay: i * 0.4,
          }}
        />
      ))}
    </div>
  );
}
