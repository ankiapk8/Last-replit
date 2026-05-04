import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { apiUrl } from "@/lib/utils";
import {
  Loader2, Network, X, ZoomIn, ZoomOut, Maximize2,
  Trash2, Plus, Sparkles, FileImage, FileType2,
} from "lucide-react";
import type { Card } from "@workspace/api-client-react/src/generated/api.schemas";
import {
  useListDeckMindMaps,
  useCreateDeckMindMap,
  useDeleteDeckMindMap,
  getListDeckMindMapsQueryKey,
  type SavedMindMap,
} from "@workspace/api-client-react";

/* ─────────────────────────────────────────────────────────────────
   Types & Layout Constants
───────────────────────────────────────────────────────────────── */
interface MindMapNode {
  center: string;
  branches: Array<{ label: string; color: string; children: string[] }>;
}

const BRANCH_RADIUS = 190;
const CHILD_RADIUS  = 360;
const NODE_R        = 44;
const CENTER_R      = 64;
const CHILD_W       = 108;
const CHILD_H       = 34;
const CHILD_RX      = 9;
const VW = 900;
const VH = 660;

function splitText(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur ? cur + " " + w : w).length > max && cur) { lines.push(cur); cur = w; }
    else cur = cur ? cur + " " + w : w;
  }
  if (cur) lines.push(cur);
  return lines;
}

/* ─────────────────────────────────────────────────────────────────
   Export Utilities
───────────────────────────────────────────────────────────────── */
function resolveCssColor(varName: string, fallback: string): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return raw ? `hsl(${raw})` : fallback;
}

function buildExportSvg(data: MindMapNode): string {
  const primary  = resolveCssColor("--primary",    "#6366f1");
  const textCol  = resolveCssColor("--foreground", "#0f172a");
  const branches = data.branches;
  const n = branches.length;

  const lines: string[] = [];

  const addText = (
    x: number, y: number, text: string, maxChars: number,
    fontSize: number, fontWeight: string, fill: string, lineHeight = 1.3,
  ) => {
    const parts = splitText(text, maxChars);
    const startDy = `${-(parts.length - 1) * lineHeight * 0.5}em`;
    lines.push(
      `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle"`,
      ` font-size="${fontSize}" font-weight="${fontWeight}" fill="${fill}"`,
      ` font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">`,
    );
    parts.forEach((part, pi) => {
      const dy = pi === 0 ? startDy : `${lineHeight}em`;
      lines.push(`<tspan x="${x}" dy="${dy}">${part.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}</tspan>`);
    });
    lines.push(`</text>`);
  };

  lines.push(`<rect width="${VW}" height="${VH}" fill="white"/>`);
  lines.push(`<g transform="translate(${VW / 2} ${VH / 2})">`);

  lines.push(`<circle cx="0" cy="0" r="${CENTER_R + 30}" fill="${primary}" fill-opacity="0.06"/>`);

  branches.forEach((branch, bi) => {
    const angleBase = (bi / n) * 2 * Math.PI - Math.PI / 2;
    const bx = Math.round(BRANCH_RADIUS * Math.cos(angleBase) * 100) / 100;
    const by = Math.round(BRANCH_RADIUS * Math.sin(angleBase) * 100) / 100;
    const nc = branch.children.length;

    lines.push(`<line x1="0" y1="0" x2="${bx}" y2="${by}" stroke="${branch.color}" stroke-width="2.8" stroke-opacity="0.55" stroke-linecap="round"/>`);

    branch.children.forEach((child, ci) => {
      const spread = Math.PI / 2.6;
      const childAngle = angleBase + spread * (ci / Math.max(nc - 1, 1) - 0.5);
      const chx = Math.round(CHILD_RADIUS * Math.cos(childAngle) * 100) / 100;
      const chy = Math.round(CHILD_RADIUS * Math.sin(childAngle) * 100) / 100;
      lines.push(
        `<line x1="${bx}" y1="${by}" x2="${chx}" y2="${chy}" stroke="${branch.color}" stroke-width="1.5" stroke-opacity="0.35" stroke-dasharray="4,4" stroke-linecap="round"/>`,
        `<rect x="${chx - CHILD_W / 2}" y="${chy - CHILD_H / 2}" width="${CHILD_W}" height="${CHILD_H}" rx="${CHILD_RX}" fill="${branch.color}" fill-opacity="0.12" stroke="${branch.color}" stroke-width="1.2" stroke-opacity="0.4"/>`,
      );
      addText(chx, chy, child, 16, 9.5, "400", textCol, 1.25);
    });

    lines.push(
      `<circle cx="${bx}" cy="${by}" r="${NODE_R}" fill="${branch.color}" fill-opacity="0.16" stroke="${branch.color}" stroke-width="2"/>`,
      `<circle cx="${bx}" cy="${by}" r="${NODE_R - 8}" fill="${branch.color}" fill-opacity="0.07"/>`,
    );
    addText(bx, by, branch.label, 10, 11, "700", branch.color, 1.3);
  });

  lines.push(
    `<circle cx="0" cy="0" r="${CENTER_R}" fill="${primary}" fill-opacity="0.16" stroke="${primary}" stroke-width="2.5"/>`,
    `<circle cx="0" cy="0" r="${CENTER_R - 10}" fill="${primary}" fill-opacity="0.08"/>`,
  );
  addText(0, 0, data.center, 12, 13, "800", primary, 1.3);

  lines.push(`</g>`);

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${VW}" height="${VH}" viewBox="0 0 ${VW} ${VH}">`,
    ...lines,
    `</svg>`,
  ].join("\n");
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function downloadAsSvg(data: MindMapNode, name: string) {
  const svg = buildExportSvg(data);
  triggerDownload(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }), `${name}.svg`);
}

async function downloadAsPng(data: MindMapNode, name: string) {
  const svg = buildExportSvg(data);
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const img  = new Image();
  img.onload = () => {
    const scale  = 2;
    const canvas = document.createElement("canvas");
    canvas.width  = VW * scale;
    canvas.height = VH * scale;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, VW, VH);
    URL.revokeObjectURL(url);
    canvas.toBlob(png => { if (png) triggerDownload(png, `${name}.png`); }, "image/png");
  };
  img.src = url;
}

/* ─────────────────────────────────────────────────────────────────
   SVG Content (pure, stateless — used in both thumbnail & viewer)
───────────────────────────────────────────────────────────────── */
function MindMapContent({ data }: { data: MindMapNode }) {
  const branches = data.branches;
  const n = branches.length;

  return (
    <>
      <circle cx={0} cy={0} r={CENTER_R + 30} fill="hsl(var(--primary))" fillOpacity="0.04" />

      {branches.map((branch, bi) => {
        const angleBase = (bi / n) * 2 * Math.PI - Math.PI / 2;
        const bx = BRANCH_RADIUS * Math.cos(angleBase);
        const by = BRANCH_RADIUS * Math.sin(angleBase);
        const nc = branch.children.length;

        return (
          <g key={bi}>
            <line x1={0} y1={0} x2={bx} y2={by}
              stroke={branch.color} strokeWidth="2.8" strokeOpacity="0.55" strokeLinecap="round" />

            {branch.children.map((child, ci) => {
              const spread = Math.PI / 2.6;
              const childAngle = angleBase + spread * (ci / Math.max(nc - 1, 1) - 0.5);
              const chx = CHILD_RADIUS * Math.cos(childAngle);
              const chy = CHILD_RADIUS * Math.sin(childAngle);
              const lines = splitText(child, 16);
              return (
                <g key={ci}>
                  <line x1={bx} y1={by} x2={chx} y2={chy}
                    stroke={branch.color} strokeWidth="1.5" strokeOpacity="0.35"
                    strokeDasharray="4,4" strokeLinecap="round" />
                  <rect x={chx - CHILD_W / 2} y={chy - CHILD_H / 2}
                    width={CHILD_W} height={CHILD_H} rx={CHILD_RX}
                    fill={branch.color} fillOpacity="0.1"
                    stroke={branch.color} strokeWidth="1.2" strokeOpacity="0.35" />
                  <text x={chx} y={chy} textAnchor="middle" dominantBaseline="middle"
                    fontSize="9.5" fill="currentColor" fillOpacity="0.88" fontFamily="inherit">
                    {lines.map((line, li) => (
                      <tspan key={li} x={chx}
                        dy={li === 0 ? `${-(lines.length - 1) * 0.6}em` : "1.25em"}>
                        {line}
                      </tspan>
                    ))}
                  </text>
                </g>
              );
            })}

            <circle cx={bx} cy={by} r={NODE_R}
              fill={branch.color} fillOpacity="0.14" stroke={branch.color} strokeWidth="2" />
            <circle cx={bx} cy={by} r={NODE_R - 8} fill={branch.color} fillOpacity="0.06" />
            <text x={bx} y={by} textAnchor="middle" dominantBaseline="middle"
              fontSize="11" fontWeight="700" fill={branch.color} fontFamily="inherit">
              {splitText(branch.label, 10).map((line, li, arr) => (
                <tspan key={li} x={bx} dy={li === 0 ? `${-(arr.length - 1) * 0.6}em` : "1.3em"}>
                  {line}
                </tspan>
              ))}
            </text>
          </g>
        );
      })}

      <circle cx={0} cy={0} r={CENTER_R} fill="hsl(var(--primary))" fillOpacity="0.14"
        stroke="hsl(var(--primary))" strokeWidth="2.5" />
      <circle cx={0} cy={0} r={CENTER_R - 10} fill="hsl(var(--primary))" fillOpacity="0.07" />
      <text x={0} y={0} textAnchor="middle" dominantBaseline="middle"
        fontSize="13" fontWeight="800" fill="hsl(var(--primary))" fontFamily="inherit">
        {splitText(data.center, 12).map((line, i, arr) => (
          <tspan key={i} x={0} dy={i === 0 ? `${-(arr.length - 1) * 0.65}em` : "1.3em"}>
            {line}
          </tspan>
        ))}
      </text>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────
   Zoomable Viewer  (mouse wheel + mouse drag + touch pan + pinch zoom)
───────────────────────────────────────────────────────────────── */
function MindMapViewer({ data }: { data: MindMapNode }) {
  const [zoom, setZoom]   = useState(1);
  const [panX, setPanX]   = useState(0);
  const [panY, setPanY]   = useState(0);
  const [grabbing, setGrabbing] = useState(false);

  // Keep a synchronous snapshot of state for use inside event handlers
  const stateRef = useRef({ zoom: 1, panX: 0, panY: 0 });
  useEffect(() => { stateRef.current = { zoom, panX, panY }; }, [zoom, panX, panY]);

  const containerRef      = useRef<HTMLDivElement>(null);
  const pointersRef       = useRef<Map<number, { x: number; y: number }>>(new Map());
  const prevPinchDistRef  = useRef<number | null>(null);

  /* ── Wheel zoom ─────────────────────────────────────────────── */
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const rect = containerRef.current!.getBoundingClientRect();
    const mouseVX = (e.clientX - rect.left) * (VW / rect.width);
    const mouseVY = (e.clientY - rect.top)  * (VH / rect.height);
    const factor  = e.deltaY < 0 ? 1.14 : 1 / 1.14;
    const { zoom: pz, panX: px, panY: py } = stateRef.current;
    const newZoom = Math.max(0.2, Math.min(8, pz * factor));
    const wx = (mouseVX - VW / 2 - px) / pz;
    const wy = (mouseVY - VH / 2 - py) / pz;
    setZoom(newZoom);
    setPanX(mouseVX - VW / 2 - wx * newZoom);
    setPanY(mouseVY - VH / 2 - wy * newZoom);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  /* ── Pointer down ────────────────────────────────────────────── */
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setGrabbing(true);
  }, []);

  /* ── Pointer move: single=pan, two=pinch ─────────────────────── */
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const pointers = pointersRef.current;
    if (!pointers.has(e.pointerId)) return;

    const rect = containerRef.current!.getBoundingClientRect();
    const scaleX = VW / rect.width;
    const scaleY = VH / rect.height;
    const prev = pointers.get(e.pointerId)!;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size === 1) {
      /* ── Pan ── */
      setPanX(p => p + (e.clientX - prev.x) * scaleX);
      setPanY(p => p + (e.clientY - prev.y) * scaleY);
    } else if (pointers.size >= 2) {
      /* ── Pinch zoom ── */
      const pts = Array.from(pointers.values());
      const curDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);

      if (prevPinchDistRef.current !== null && prevPinchDistRef.current > 0) {
        const factor = curDist / prevPinchDistRef.current;
        const midClientX = (pts[0].x + pts[1].x) / 2;
        const midClientY = (pts[0].y + pts[1].y) / 2;
        const midVX = (midClientX - rect.left) * scaleX;
        const midVY = (midClientY - rect.top)  * scaleY;

        const { zoom: pz, panX: px, panY: py } = stateRef.current;
        const newZoom = Math.max(0.2, Math.min(8, pz * factor));
        const wx = (midVX - VW / 2 - px) / pz;
        const wy = (midVY - VH / 2 - py) / pz;
        setZoom(newZoom);
        setPanX(midVX - VW / 2 - wx * newZoom);
        setPanY(midVY - VH / 2 - wy * newZoom);
      }
      prevPinchDistRef.current = curDist;
    }
  }, []);

  /* ── Pointer up / cancel ────────────────────────────────────── */
  const onPointerUp = useCallback((e: React.PointerEvent) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) prevPinchDistRef.current = null;
    if (pointersRef.current.size === 0) setGrabbing(false);
  }, []);

  const transform = `translate(${VW / 2 + panX} ${VH / 2 + panY}) scale(${zoom})`;

  return (
    <div className="relative rounded-xl border border-border/40 bg-muted/20 overflow-hidden select-none" style={{ height: 460 }}>
      <div className="absolute top-3 right-3 z-10 flex flex-col gap-1">
        {[
          { icon: ZoomIn,    title: "Zoom in",    fn: () => setZoom(z => Math.min(z * 1.25, 8)) },
          { icon: ZoomOut,   title: "Zoom out",   fn: () => setZoom(z => Math.max(z / 1.25, 0.2)) },
          { icon: Maximize2, title: "Reset view", fn: () => { setZoom(1); setPanX(0); setPanY(0); } },
        ].map(({ icon: Icon, title, fn }) => (
          <button key={title} onClick={fn} title={title}
            className="h-7 w-7 flex items-center justify-center rounded-md bg-background/90 border border-border/50 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shadow-sm">
            <Icon className="h-3.5 w-3.5" />
          </button>
        ))}
      </div>
      <div className="absolute bottom-3 left-3 z-10 px-2 py-0.5 rounded-md bg-background/80 border border-border/40 text-[10px] text-muted-foreground font-mono">
        {Math.round(zoom * 100)}%
      </div>
      <div className="absolute bottom-3 right-3 z-10 text-[10px] text-muted-foreground/50 pointer-events-none hidden sm:block">
        scroll to zoom · drag to pan
      </div>
      <div className="absolute bottom-3 right-3 z-10 text-[10px] text-muted-foreground/50 pointer-events-none sm:hidden">
        pinch to zoom · drag to pan
      </div>
      <div
        ref={containerRef}
        className="w-full h-full"
        style={{ cursor: grabbing ? "grabbing" : "grab", touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <svg width="100%" height="100%" viewBox={`0 0 ${VW} ${VH}`}
          style={{ display: "block" }} xmlns="http://www.w3.org/2000/svg">
          <g transform={transform}>
            <MindMapContent data={data} />
          </g>
        </svg>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   Full-Screen Viewer Modal
───────────────────────────────────────────────────────────────── */
function MindMapViewerModal({ map, onClose }: { map: SavedMindMap; onClose: () => void }) {
  const parsed = useMemo(() => { try { return JSON.parse(map.data) as MindMapNode; } catch { return null; } }, [map.data]);
  if (!parsed) return null;
  const totalChildren = parsed.branches.reduce((s, b) => s + b.children.length, 0);

  return (
    <div className="fixed inset-0 z-50 bg-black/65 flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={onClose}>
      <div className="w-full max-w-3xl bg-background rounded-2xl shadow-2xl border border-border/60 flex flex-col overflow-hidden"
        style={{ maxHeight: "92vh" }} onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between px-5 py-4 border-b border-border/40 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Network className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-sm">{parsed.center}</p>
              <p className="text-[11px] text-muted-foreground">
                {parsed.branches.length} branches · {totalChildren} subtopics · {map.cardCount} cards
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => downloadAsSvg(parsed, parsed.center)}
              title="Download as SVG"
              className="h-8 flex items-center gap-1.5 px-2.5 rounded-md text-xs font-medium text-muted-foreground border border-border/50 bg-background hover:text-foreground hover:bg-muted transition-colors"
            >
              <FileType2 className="h-3.5 w-3.5" />
              SVG
            </button>
            <button
              onClick={() => downloadAsPng(parsed, parsed.center)}
              title="Download as PNG"
              className="h-8 flex items-center gap-1.5 px-2.5 rounded-md text-xs font-medium text-muted-foreground border border-border/50 bg-background hover:text-foreground hover:bg-muted transition-colors"
            >
              <FileImage className="h-3.5 w-3.5" />
              PNG
            </button>
            <button onClick={onClose}
              className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 min-h-0 space-y-4">
          <MindMapViewer data={parsed} />
          <div className="grid grid-cols-2 gap-2">
            {parsed.branches.map((b, i) => (
              <div key={i} className="rounded-lg p-3 border"
                style={{ borderColor: b.color + "33", backgroundColor: b.color + "0d" }}>
                <p className="text-xs font-semibold mb-1.5" style={{ color: b.color }}>{b.label}</p>
                <ul className="space-y-0.5">
                  {b.children.map((c, ci) => (
                    <li key={ci} className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                      <span className="mt-1 shrink-0 h-1.5 w-1.5 rounded-full" style={{ backgroundColor: b.color + "99" }} />
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   Gallery Card
───────────────────────────────────────────────────────────────── */
function MindMapCard({
  map,
  onView,
  onDelete,
}: {
  map: SavedMindMap;
  onView: (m: SavedMindMap) => void;
  onDelete: (id: number) => void;
}) {
  const parsed = useMemo(() => {
    try { return JSON.parse(map.data) as MindMapNode; }
    catch { return null; }
  }, [map.data]);

  if (!parsed) return null;

  const accentColor   = parsed.branches[0]?.color ?? "#6366f1";
  const totalChildren = parsed.branches.reduce((s, b) => s + b.children.length, 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -3 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="group relative rounded-xl border border-border/50 bg-card overflow-hidden cursor-pointer hover:border-primary/30 transition-all"
      style={{ boxShadow: `0 2px 14px ${accentColor}18` }}
      onClick={() => onView(map)}
    >
      {/* Top accent stripe */}
      <div className="h-0.5 w-full" style={{ background: `linear-gradient(90deg, ${accentColor}, ${accentColor}44, transparent)` }} />

      {/* SVG Thumbnail */}
      <div className="relative overflow-hidden bg-muted/25" style={{ height: 152 }}>
        <svg viewBox={`0 0 ${VW} ${VH}`} className="w-full h-full" xmlns="http://www.w3.org/2000/svg"
          style={{ opacity: 0.88 }}>
          <g transform={`translate(${VW / 2} ${VH / 2})`}>
            <MindMapContent data={parsed} />
          </g>
        </svg>
        {/* Edge vignette so it blends into the card */}
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: "radial-gradient(ellipse at center, transparent 38%, hsl(var(--card)) 98%)" }} />
        <div className="absolute inset-x-0 bottom-0 h-10 pointer-events-none"
          style={{ background: "linear-gradient(to top, hsl(var(--card)) 0%, transparent 100%)" }} />
      </div>

      {/* Info */}
      <div className="px-3.5 py-3 flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate leading-tight">{parsed.center}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
            {parsed.branches.length} branches · {totalChildren} subtopics
            {map.cardCount > 0 && ` · ${map.cardCount} cards`}
          </p>
          <p className="text-[10px] text-muted-foreground/60 mt-0.5">
            {format(new Date(map.createdAt), "MMM d, yyyy · h:mm a")}
          </p>
        </div>
        <button
          onClick={e => { e.stopPropagation(); onDelete(map.id); }}
          title="Delete mind map"
          className="shrink-0 opacity-0 group-hover:opacity-100 h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </motion.div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   Skeleton card (shown while generating)
───────────────────────────────────────────────────────────────── */
function SkeletonCard() {
  return (
    <div className="rounded-xl border border-border/40 bg-card overflow-hidden animate-pulse">
      <div className="h-0.5 bg-muted" />
      <div className="h-[152px] bg-muted/40 flex items-center justify-center">
        <Network className="h-8 w-8 text-muted-foreground/20" />
      </div>
      <div className="px-3.5 py-3 space-y-2">
        <div className="h-3.5 bg-muted rounded w-3/4" />
        <div className="h-2.5 bg-muted rounded w-1/2" />
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   Empty State
───────────────────────────────────────────────────────────────── */
function EmptyState({ onGenerate, cardsCount }: { onGenerate: () => void; cardsCount: number }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-14 rounded-xl border border-dashed border-border/50 bg-muted/10">
      <div className="h-16 w-16 rounded-2xl bg-primary/8 border border-primary/15 flex items-center justify-center">
        <Network className="h-7 w-7 text-primary/70" />
      </div>
      <div className="text-center space-y-1 max-w-xs">
        <p className="font-semibold text-foreground">No mind maps yet</p>
        <p className="text-sm text-muted-foreground">
          Generate visual mind maps from the {cardsCount} cards in this deck. Large decks get multiple maps so every concept is covered.
        </p>
      </div>
      <Button onClick={onGenerate} disabled={cardsCount === 0} className="gap-2 mt-1">
        <Sparkles className="h-4 w-4" /> Generate Mind Maps
      </Button>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   Main Export: MindMapGallery
───────────────────────────────────────────────────────────────── */
export function MindMapGallery({
  deckId,
  cards,
  deckName,
}: {
  deckId: number;
  cards: Card[];
  deckName: string;
}) {
  const queryClient = useQueryClient();
  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: getListDeckMindMapsQueryKey(deckId) }),
    [queryClient, deckId],
  );

  const { data: maps = [] } = useListDeckMindMaps(deckId);
  const { mutateAsync: createMap } = useCreateDeckMindMap(deckId, { mutation: { onSuccess: invalidate } });
  const { mutateAsync: deleteMap } = useDeleteDeckMindMap(deckId, { mutation: { onSuccess: invalidate } });

  const [viewingMap, setViewingMap]   = useState<SavedMindMap | null>(null);
  const [generating, setGenerating]   = useState(false);
  const [genProgress, setGenProgress] = useState({ done: 0, total: 0 });

  const generateMaps = useCallback(async () => {
    if (cards.length === 0 || generating) return;
    const CHUNK = 25;
    const chunks: Card[][] = [];
    for (let i = 0; i < cards.length; i += CHUNK) chunks.push(cards.slice(i, i + CHUNK));

    setGenerating(true);
    setGenProgress({ done: 0, total: chunks.length });

    for (const chunk of chunks) {
      try {
        const resp = await fetch(apiUrl("api/mind-map"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topic: deckName,
            cards: chunk.map(c => ({ front: c.front, back: c.back })),
          }),
        });
        if (resp.ok) {
          const data = await resp.json() as MindMapNode;
          await createMap({ title: data.center, data, cardCount: chunk.length });
        }
      } catch { /* skip failed chunk */ }
      setGenProgress(p => ({ ...p, done: p.done + 1 }));
    }

    setGenerating(false);
    setGenProgress({ done: 0, total: 0 });
  }, [cards, deckName, generating, createMap]);

  const pendingSkeletons = generating
    ? Math.max(0, genProgress.total - genProgress.done - maps.length)
    : 0;

  return (
    <div className="space-y-4">
      {/* Section Header */}
      <div className="flex items-center justify-between gap-3 border-b pb-3">
        <div className="flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <Network className="h-3.5 w-3.5 text-primary" />
          </div>
          <h2 className="text-xl font-medium tracking-tight">Mind Maps</h2>
          {maps.length > 0 && (
            <Badge variant="secondary" className="rounded-full px-2 py-0.5 text-xs">{maps.length}</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {maps.length > 0 && !generating && (
            <Button variant="outline" size="sm" onClick={generateMaps} disabled={cards.length === 0} className="gap-1.5 h-8 text-xs">
              <Plus className="h-3.5 w-3.5" /> Add map
            </Button>
          )}
          <Button
            size="sm"
            onClick={generateMaps}
            disabled={generating || cards.length === 0}
            className="gap-1.5 h-8"
          >
            {generating
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating {genProgress.done}/{genProgress.total}…</>
              : <><Sparkles className="h-3.5 w-3.5" /> Generate Maps</>
            }
          </Button>
        </div>
      </div>

      {/* Progress bar */}
      <AnimatePresence>
        {generating && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-1.5"
          >
            <Progress
              value={genProgress.total > 0 ? (genProgress.done / genProgress.total) * 100 : 0}
              className="h-1.5"
            />
            <p className="text-xs text-muted-foreground">
              Building map {genProgress.done + 1} of {genProgress.total}…
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Grid or Empty State */}
      {maps.length === 0 && !generating ? (
        <EmptyState onGenerate={generateMaps} cardsCount={cards.length} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {maps.map((map, idx) => (
            <motion.div key={map.id}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}>
              <MindMapCard map={map} onView={setViewingMap} onDelete={id => deleteMap(id)} />
            </motion.div>
          ))}
          {Array.from({ length: pendingSkeletons }).map((_, i) => (
            <SkeletonCard key={`sk-${i}`} />
          ))}
        </div>
      )}

      {/* Full-screen viewer */}
      <AnimatePresence>
        {viewingMap && (
          <MindMapViewerModal map={viewingMap} onClose={() => setViewingMap(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}
