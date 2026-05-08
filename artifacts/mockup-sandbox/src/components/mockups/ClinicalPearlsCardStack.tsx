import { useState, useCallback, useMemo } from "react";
import { useSpring, animated, to } from "@react-spring/web";
import { useDrag } from "@use-gesture/react";
import confetti from "canvas-confetti";
import { cn } from "@/lib/utils";
import { clinicalPearlsData, type ClinicalPearl } from "./data/fixtures";

// ── Sparkle Burst ──
function fireBookmarkConfetti() {
  confetti({
    particleCount: 60,
    spread: 70,
    origin: { y: 0.6 },
    colors: ["#F59E0B", "#FBBF24", "#FDE68A", "#D97706", "#ffffff"],
    gravity: 0.8,
    scalar: 1.2,
  });
}

// ── Dot Pagination ──
function DotPagination({
  total,
  activeIndex,
  onSelect,
}: {
  total: number;
  activeIndex: number;
  onSelect: (index: number) => void;
}) {
  return (
    <div
      className="flex items-center justify-center gap-2 mt-6"
      role="tablist"
      aria-label="Card pagination"
    >
      {Array.from({ length: total }, (_, i) => (
        <button
          key={i}
          onClick={() => onSelect(i)}
          className={cn(
            "rounded-full transition-all duration-300",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2",
            i === activeIndex
              ? "w-8 h-2.5 bg-amber-500"
              : "w-2.5 h-2.5 bg-amber-200 dark:bg-amber-800 hover:bg-amber-300 dark:hover:bg-amber-700",
          )}
          role="tab"
          aria-selected={i === activeIndex}
          aria-label={`Go to card ${i + 1}`}
        />
      ))}
    </div>
  );
}

// ── Card Content (shared between top and background cards) ──
function CardContent({
  pearl,
  isTop,
  onBookmark,
}: {
  pearl: ClinicalPearl;
  isTop: boolean;
  onBookmark: () => void;
}) {
  return (
    <div
      className={cn(
        "w-full h-full rounded-2xl bg-white dark:bg-gray-900 border border-amber-200 dark:border-amber-800/30",
        "shadow-xl shadow-amber-500/10 p-5 md:p-6 flex flex-col",
        isTop && "cursor-grab active:cursor-grabbing",
      )}
    >
      {/* Label Badge */}
      <span className="inline-flex self-start px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 mb-3">
        {pearl.label}
      </span>

      {/* Title */}
      <h3 className="text-lg md:text-xl font-bold text-gray-900 dark:text-white mb-3 leading-snug">
        {pearl.title}
      </h3>

      {/* Body — clamped to 3 lines */}
      <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed line-clamp-3 flex-1">
        {pearl.body}
      </p>

      {/* Action Buttons */}
      <div className="flex items-center gap-2 mt-4 pt-4 border-t border-amber-100 dark:border-amber-900/20">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onBookmark();
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-800/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          aria-label="Bookmark this pearl"
        >
          <span>🔖</span> Bookmark
        </button>
        <button
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
          aria-label="Share this pearl"
        >
          <span>📤</span> Share
        </button>
        <button
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:outline-none"
          aria-label="Add to deck"
        >
          <span>📚</span> Add to Deck
        </button>
      </div>
    </div>
  );
}

// ── Main Component ──
export function ClinicalPearlsCardStack() {
  const pearls = clinicalPearlsData;
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [gone] = useState(() => new Set<number>());

  // Spring for the top card
  const [{ x, rotate, scale, y }, api] = useSpring(() => ({
    x: 0,
    rotate: 0,
    scale: 1,
    y: 0,
    config: { tension: 300, friction: 30 },
  }));

  const handleSwipe = useCallback(
    (dir: "left" | "right") => {
      if (isAnimating) return;
      setIsAnimating(true);

      // Animate card off screen
      api.start({
        x: dir === "right" ? 500 : -500,
        rotate: dir === "right" ? 15 : -15,
        scale: 0.95,
      });

      setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % pearls.length);
        // Reset spring for next card
        api.start({ x: 0, rotate: 0, scale: 1, y: 0, immediate: true });
        setIsAnimating(false);
      }, 300);
    },
    [isAnimating, pearls.length, api],
  );

  const handleBookmark = useCallback(() => {
    fireBookmarkConfetti();
  }, []);

  const handleDotSelect = useCallback(
    (index: number) => {
      if (isAnimating || index === currentIndex) return;
      setIsAnimating(true);
      const dir = index > currentIndex ? "left" : "right";
      api.start({
        x: dir === "right" ? 500 : -500,
        rotate: dir === "right" ? 15 : -15,
      });
      setTimeout(() => {
        setCurrentIndex(index);
        api.start({ x: 0, rotate: 0, scale: 1, y: 0, immediate: true });
        setIsAnimating(false);
      }, 300);
    },
    [isAnimating, currentIndex, api],
  );

  // Drag binding for the top card
  const bind = useDrag(
    ({ down, movement: [mx], velocity: [vx], direction: [dx], cancel, event }) => {
      event?.preventDefault();
      const trigger = Math.abs(mx) > 100 || (Math.abs(vx) > 0.5 && !down);

      if (trigger) {
        cancel();
        const dir = dx > 0 ? "right" : "left";
        api.start({
          x: mx > 0 ? 500 : -500,
          rotate: mx > 0 ? 15 : -15,
          scale: 0.95,
        });
        handleSwipe(dir);
      } else {
        api.start({
          x: down ? mx : 0,
          rotate: down ? mx / 20 : 0,
          scale: down ? 0.98 : 1,
        });
      }
    },
    { filterTaps: true, rubberband: true, from: () => [0, 0] },
  );

  // Build visible cards (up to 3, wrapping around)
  const visibleCards = useMemo(() => {
    const cards: { pearl: ClinicalPearl; offset: number }[] = [];
    for (let i = 0; i < Math.min(3, pearls.length); i++) {
      cards.push({
        pearl: pearls[(currentIndex + i) % pearls.length],
        offset: i,
      });
    }
    return cards;
  }, [pearls, currentIndex]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-yellow-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 p-4 md:p-8 flex flex-col items-center justify-center">
      {/* Title */}
      <div className="text-center mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-1">
          Clinical Pearls
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Swipe or drag to browse • Tap bookmark to save
        </p>
      </div>

      {/* Card Stack Container */}
      <div
        className="relative w-full max-w-sm mx-auto"
        style={{ height: 320 }}
        role="tabpanel"
        aria-label={`Card ${currentIndex + 1} of ${pearls.length}`}
      >
        {visibleCards.map(({ pearl, offset }) => {
          const isTop = offset === 0;

          if (isTop) {
            return (
              <animated.div
                key={`top-${pearl.id}-${currentIndex}`}
                {...(isTop ? bind() : {})}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  zIndex: 3,
                  touchAction: "none",
                  transform: to(
                    [x, rotate, scale, y] as const,
                    (xv: number, rv: number, sv: number, yv: number) =>
                      `translateX(${xv}px) translateY(${yv}px) rotate(${rv}deg) scale(${sv})`,
                  ),
                }}
                className="select-none"
              >
                <CardContent
                  pearl={pearl}
                  isTop={true}
                  onBookmark={handleBookmark}
                />
              </animated.div>
            );
          }

          // Background cards — static offset/scale
          const bgScale = 1 - offset * 0.05;
          const bgY = offset * 12;
          const bgRotate = offset % 2 === 0 ? -offset * 0.5 : offset * 0.5;

          return (
            <div
              key={`bg-${pearl.id}-${currentIndex}-${offset}`}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 3 - offset,
                transform: `translateY(${bgY}px) rotate(${bgRotate}deg) scale(${bgScale})`,
                pointerEvents: "none",
              }}
            >
              <CardContent
                pearl={pearl}
                isTop={false}
                onBookmark={handleBookmark}
              />
            </div>
          );
        })}
      </div>

      {/* Dot Pagination */}
      <DotPagination
        total={pearls.length}
        activeIndex={currentIndex}
        onSelect={handleDotSelect}
      />

      {/* Swipe hint */}
      <div className="mt-6 flex items-center gap-4 text-xs text-gray-400 dark:text-gray-500">
        <span>← Swipe left</span>
        <span>•</span>
        <span>Swipe right →</span>
      </div>
    </div>
  );
}

export default ClinicalPearlsCardStack;
