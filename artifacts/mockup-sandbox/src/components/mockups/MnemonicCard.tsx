import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { mnemonicData, type MnemonicData } from "./data/fixtures";

// ── Single 3D Flip Tile ──
function FlipTile({
  letter,
  meaning,
  color,
  index,
  isFlipped,
  onFlip,
}: {
  letter: string;
  meaning: string;
  color: string;
  index: number;
  isFlipped: boolean;
  onFlip: () => void;
}) {
  return (
    <motion.div
      initial={{ scale: 0, rotateZ: -180 }}
      animate={{ scale: 1, rotateZ: 0 }}
      transition={{
        delay: index * 0.08,
        type: "spring",
        stiffness: 260,
        damping: 20,
      }}
      style={{ perspective: 600 }}
      className="cursor-pointer"
      onClick={onFlip}
      role="button"
      aria-label={`Letter ${letter}: ${meaning}`}
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onFlip()}
    >
      <motion.div
        animate={{ rotateY: isFlipped ? 180 : 0 }}
        transition={{ duration: 0.5, ease: "easeInOut" }}
        style={{ transformStyle: "preserve-3d" }}
        className="relative w-14 h-14 md:w-16 md:h-16"
      >
        {/* Front face */}
        <div
          className="absolute inset-0 rounded-xl flex items-center justify-center text-white font-bold text-xl md:text-2xl shadow-lg"
          style={{
            backgroundColor: color,
            backfaceVisibility: "hidden",
            boxShadow: `0 4px 14px ${color}44`,
          }}
        >
          {letter}
        </div>

        {/* Back face */}
        <div
          className="absolute inset-0 rounded-xl flex items-center justify-center text-white font-semibold text-[10px] md:text-xs text-center px-1 shadow-lg"
          style={{
            backgroundColor: color,
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
            boxShadow: `0 4px 14px ${color}44`,
          }}
        >
          {meaning}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Color Cascade Wave ──
function useColorCascade(active: boolean, count: number) {
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    if (!active) return;
    let i = 0;
    const interval = setInterval(() => {
      setActiveIndex(i);
      i++;
      if (i >= count) clearInterval(interval);
    }, 80);
    return () => clearInterval(interval);
  }, [active, count]);

  return activeIndex;
}

// ── Star Rating ──
function StarRating({
  totalStars = 5,
  onRate,
}: {
  totalStars?: number;
  onRate: (rating: number) => void;
}) {
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);

  const handleRate = (value: number) => {
    setRating(value);
    onRate(value);
  };

  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label="Difficulty rating">
      {Array.from({ length: totalStars }, (_, i) => {
        const starValue = i + 1;
        const isFilled = starValue <= (hovered || rating);
        return (
          <motion.button
            key={i}
            whileHover={{ scale: 1.2 }}
            whileTap={{ scale: 0.9 }}
            onMouseEnter={() => setHovered(starValue)}
            onMouseLeave={() => setHovered(0)}
            onClick={() => handleRate(starValue)}
            className="p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 rounded"
            aria-label={`${starValue} star${starValue > 1 ? "s" : ""}`}
            aria-pressed={rating === starValue}
          >
            <motion.span
              animate={
                isFilled
                  ? {
                      color: "#FFD700",
                      textShadow: "0 0 8px #FFD700, 0 0 16px #FFD70080",
                    }
                  : {
                      color: "#d1d5db",
                      textShadow: "none",
                    }
              }
              transition={{ duration: 0.3 }}
              className="text-2xl md:text-3xl"
            >
              ★
            </motion.span>
          </motion.button>
        );
      })}
      {rating > 0 && (
        <motion.span
          initial={{ opacity: 0, x: -5 }}
          animate={{ opacity: 1, x: 0 }}
          className="text-xs text-purple-600 dark:text-purple-400 ml-2 font-medium"
        >
          {rating}/5
        </motion.span>
      )}
    </div>
  );
}

// ── Repeat Icon ──
function RepeatIcon() {
  return (
    <motion.button
      whileHover={{ rotate: 360 }}
      transition={{ duration: 0.5, ease: "easeInOut" }}
      className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 hover:bg-purple-200 dark:hover:bg-purple-800/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
      aria-label="Reset mnemonic"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 2v6h-6" />
        <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
        <path d="M3 22v-6h6" />
        <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
      </svg>
    </motion.button>
  );
}

// ── Main Component ──
export function MnemonicCard() {
  const data = mnemonicData;
  const [flippedTiles, setFlippedTiles] = useState<Set<number>>(new Set());
  const [showCascade, setShowCascade] = useState(true);
  const cascadeIndex = useColorCascade(showCascade, data.letters.length);

  const toggleTile = (index: number) => {
    setFlippedTiles((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const handleRate = (rating: number) => {
    console.log(`Rated ${rating}/5`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-fuchsia-50 to-violet-50 dark:from-gray-950 dark:via-purple-950/20 dark:to-gray-950 p-4 md:p-8 flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-lg"
      >
        {/* Card */}
        <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl rounded-3xl shadow-xl shadow-purple-500/10 border border-purple-100 dark:border-purple-900/30 p-6 md:p-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <span className="inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-2"
                style={{ backgroundColor: "#8E24AA20", color: "#8E24AA" }}
              >
                {data.category}
              </span>
              <h2 className="text-lg md:text-xl font-bold text-gray-900 dark:text-white">
                {data.topic}
              </h2>
            </div>
            <RepeatIcon />
          </div>

          {/* Letter Tiles Row */}
          <div className="flex flex-wrap justify-center gap-2 md:gap-3 mb-8">
            {data.letters.map((item, index) => (
              <motion.div
                key={index}
                animate={
                  cascadeIndex >= index && showCascade
                    ? {
                        boxShadow: `0 0 20px ${item.color}66, 0 0 40px ${item.color}33`,
                      }
                    : {
                        boxShadow: `0 4px 14px ${item.color}22`,
                      }
                }
                transition={{ duration: 0.4 }}
                className="rounded-xl"
              >
                <FlipTile
                  letter={item.letter}
                  meaning={item.meaning}
                  color={item.color}
                  index={index}
                  isFlipped={flippedTiles.has(index)}
                  onFlip={() => toggleTile(index)}
                />
              </motion.div>
            ))}
          </div>

          {/* Divider */}
          <div className="border-t border-purple-100 dark:border-purple-900/30 mb-6" />

          {/* Meanings List */}
          <div className="space-y-3 mb-8">
            {data.letters.map((item, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -15 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 + index * 0.06, duration: 0.3 }}
                className="flex items-center gap-3"
              >
                {/* Colored bullet */}
                <motion.div
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: item.color }}
                  whileHover={{ scale: 1.4 }}
                />
                <div className="flex items-baseline gap-2 min-w-0">
                  <span className="font-bold text-sm" style={{ color: item.color }}>
                    {item.letter}
                  </span>
                  <span className="text-sm text-gray-600 dark:text-gray-400 truncate">
                    {item.meaning}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Divider */}
          <div className="border-t border-purple-100 dark:border-purple-900/30 mb-5" />

          {/* Spaced Repetition Rating */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
                How well do you know this?
              </p>
              <StarRating onRate={handleRate} />
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400 dark:text-gray-500">Difficulty</p>
              <p className="text-sm font-semibold text-purple-600 dark:text-purple-400">
                {data.difficulty}/5
              </p>
            </div>
          </div>
        </div>

        {/* Tip */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="text-center text-xs text-gray-400 dark:text-gray-500 mt-4"
        >
          Tap any tile to flip and reveal its meaning
        </motion.p>
      </motion.div>
    </div>
  );
}

export default MnemonicCard;
