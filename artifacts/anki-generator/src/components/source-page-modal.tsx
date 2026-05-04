import { useEffect, useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize2, Minimize2 } from "lucide-react";
import type { Bbox } from "./crop-compare";

export interface VisualCardRef {
  id: number;
  sourceImage: string;
  bbox?: Bbox | null;
  pageNumber?: number | null;
  figureType?: string | null;
  front: string;
}

interface SourcePageModalProps {
  open: boolean;
  onClose: () => void;
  cards: VisualCardRef[];
  activeIndex: number;
  onNavigate: (index: number) => void;
}

const ZOOM_STEP = 0.3;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 4;

function BboxHighlight({ bbox, zoomed }: { bbox: Bbox | null | undefined; zoomed: boolean }) {
  if (!bbox) return null;
  const isFullPage = bbox.w >= 0.99 && bbox.h >= 0.99 && bbox.x <= 0.01 && bbox.y <= 0.01;
  if (isFullPage) return null;

  if (zoomed) {
    return (
      <div
        className="absolute inset-0 rounded-md pointer-events-none"
        style={{
          boxShadow: "inset 0 0 0 3px rgba(139, 92, 246, 0.9), inset 0 0 0 5px rgba(139, 92, 246, 0.3)",
          animation: "sourcePageGlow 2s ease-in-out infinite",
        }}
      />
    );
  }

  return (
    <div
      className="absolute pointer-events-none rounded-sm"
      style={{
        left: `${bbox.x * 100}%`,
        top: `${bbox.y * 100}%`,
        width: `${bbox.w * 100}%`,
        height: `${bbox.h * 100}%`,
        boxShadow: "0 0 0 2px rgba(139, 92, 246, 1), 0 0 0 4px rgba(139, 92, 246, 0.35), 0 0 20px 4px rgba(139, 92, 246, 0.25)",
        background: "rgba(139, 92, 246, 0.08)",
        animation: "sourcePageGlow 2s ease-in-out infinite",
      }}
    />
  );
}

export function SourcePageModal({ open, onClose, cards, activeIndex, onNavigate }: SourcePageModalProps) {
  const [zoom, setZoom] = useState(1);
  const [zoomedToFigure, setZoomedToFigure] = useState(false);

  const card = cards[activeIndex];
  const resetZoom = useCallback(() => {
    setZoom(1);
    setZoomedToFigure(false);
  }, []);

  const handleNavigate = useCallback((idx: number) => {
    resetZoom();
    onNavigate(idx);
  }, [onNavigate, resetZoom]);

  const handleClose = useCallback(() => {
    resetZoom();
    onClose();
  }, [onClose, resetZoom]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); handleClose(); return; }
      if (e.key === "ArrowRight" && cards.length > 1) {
        e.preventDefault(); e.stopPropagation();
        handleNavigate((activeIndex + 1) % cards.length);
      }
      if (e.key === "ArrowLeft" && cards.length > 1) {
        e.preventDefault(); e.stopPropagation();
        handleNavigate((activeIndex - 1 + cards.length) % cards.length);
      }
    };
    window.addEventListener("keydown", handler, { capture: true });
    return () => window.removeEventListener("keydown", handler, { capture: true });
  }, [open, activeIndex, cards.length, handleClose, handleNavigate]);

  const getZoomedStyle = useCallback(() => {
    if (!zoomedToFigure || !card?.bbox) return {};
    const b = card.bbox;
    const isFullPage = b.w >= 0.99 && b.h >= 0.99;
    if (isFullPage) return {};
    const scaleX = 1 / b.w;
    const scaleY = 1 / b.h;
    const scale = Math.min(scaleX, scaleY) * 0.85;
    const centerX = b.x + b.w / 2;
    const centerY = b.y + b.h / 2;
    const tx = (0.5 - centerX) * 100;
    const ty = (0.5 - centerY) * 100;
    return {
      transform: `scale(${scale * zoom}) translate(${tx / scale}%, ${ty / scale}%)`,
      transformOrigin: `${centerX * 100}% ${centerY * 100}%`,
    };
  }, [zoomedToFigure, card?.bbox, zoom]);

  const canZoomToFigure = card?.bbox && !(card.bbox.w >= 0.99 && card.bbox.h >= 0.99);

  if (!open || !card) return null;

  const modalContent = (
    <>
      <style>{`
        @keyframes sourcePageGlow {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.55; }
        }
      `}</style>
      <AnimatePresence>
        {open && (
          <motion.div
            key="source-page-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
            style={{ backgroundColor: "rgba(0,0,0,0.88)", backdropFilter: "blur(4px)" }}
            onClick={handleClose}
          >
            <motion.div
              key={`source-page-content-${card.id}`}
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.94 }}
              transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="relative flex flex-col items-center max-w-5xl w-full max-h-[90vh]"
              onClick={e => e.stopPropagation()}
            >
              {/* Top bar */}
              <div className="w-full flex items-center justify-between mb-3 px-1">
                <div className="flex items-center gap-2">
                  {card.pageNumber != null && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-violet-500/20 border border-violet-500/40 text-violet-200 text-xs font-semibold backdrop-blur-sm">
                      <span className="h-1.5 w-1.5 rounded-full bg-violet-400 inline-block" />
                      Page {card.pageNumber}
                    </span>
                  )}
                  {card.figureType && (
                    <span className="px-2 py-0.5 rounded-full bg-white/10 border border-white/15 text-white/70 text-[11px] font-medium capitalize">
                      {card.figureType}
                    </span>
                  )}
                  {cards.length > 1 && (
                    <span className="px-2 py-0.5 rounded-full bg-white/10 text-white/50 text-[11px]">
                      {activeIndex + 1} / {cards.length}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  {/* Zoom to figure toggle */}
                  {canZoomToFigure && (
                    <button
                      type="button"
                      onClick={() => { setZoomedToFigure(z => !z); setZoom(1); }}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 ${
                        zoomedToFigure
                          ? "bg-violet-500 text-white border border-violet-400"
                          : "bg-white/10 text-white/80 border border-white/20 hover:bg-white/20"
                      }`}
                      title="Zoom to figure"
                    >
                      {zoomedToFigure ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
                      {zoomedToFigure ? "Full page" : "Zoom to figure"}
                    </button>
                  )}

                  {/* Zoom controls */}
                  <button
                    type="button"
                    onClick={() => setZoom(z => Math.max(ZOOM_MIN, z - ZOOM_STEP))}
                    disabled={zoom <= ZOOM_MIN}
                    className="h-8 w-8 flex items-center justify-center rounded-full bg-white/10 border border-white/20 text-white/80 hover:bg-white/20 disabled:opacity-40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                    title="Zoom out"
                  >
                    <ZoomOut className="h-3.5 w-3.5" />
                  </button>
                  <span className="text-white/50 text-[11px] w-9 text-center tabular-nums">
                    {Math.round(zoom * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={() => setZoom(z => Math.min(ZOOM_MAX, z + ZOOM_STEP))}
                    disabled={zoom >= ZOOM_MAX}
                    className="h-8 w-8 flex items-center justify-center rounded-full bg-white/10 border border-white/20 text-white/80 hover:bg-white/20 disabled:opacity-40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                    title="Zoom in"
                  >
                    <ZoomIn className="h-3.5 w-3.5" />
                  </button>

                  {/* Close */}
                  <button
                    type="button"
                    onClick={handleClose}
                    className="ml-1 h-8 w-8 flex items-center justify-center rounded-full bg-white/10 border border-white/20 text-white/80 hover:bg-white/20 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                    title="Close (Esc)"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Image area */}
              <div className="relative w-full flex-1 flex items-center justify-center overflow-hidden rounded-xl bg-black/40 border border-white/10 shadow-2xl"
                style={{ maxHeight: "calc(90vh - 80px)" }}
              >
                <div
                  className="relative overflow-hidden rounded-lg"
                  style={{
                    maxHeight: "calc(90vh - 100px)",
                    transition: "transform 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
                    ...getZoomedStyle(),
                    ...(zoomedToFigure ? {} : { transform: `scale(${zoom})` }),
                  }}
                >
                  <img
                    src={card.sourceImage}
                    alt={`Source page${card.pageNumber != null ? ` ${card.pageNumber}` : ""}`}
                    className="max-w-full max-h-[calc(90vh-100px)] object-contain block"
                    draggable={false}
                    style={{ userSelect: "none" }}
                  />
                  <BboxHighlight bbox={card.bbox} zoomed={zoomedToFigure} />
                </div>
              </div>

              {/* Navigation arrows */}
              {cards.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => handleNavigate((activeIndex - 1 + cards.length) % cards.length)}
                    className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-3 sm:-translate-x-5 h-10 w-10 flex items-center justify-center rounded-full bg-white/10 border border-white/20 text-white/80 hover:bg-white/25 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                    title="Previous visual card (←)"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNavigate((activeIndex + 1) % cards.length)}
                    className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-3 sm:translate-x-5 h-10 w-10 flex items-center justify-center rounded-full bg-white/10 border border-white/20 text-white/80 hover:bg-white/25 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                    title="Next visual card (→)"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </>
              )}

              {/* Card caption */}
              {card.front && (
                <p className="mt-3 text-center text-white/50 text-xs max-w-lg truncate px-8">
                  {card.front.slice(0, 120)}{card.front.length > 120 ? "…" : ""}
                </p>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );

  return createPortal(modalContent, document.body);
}
