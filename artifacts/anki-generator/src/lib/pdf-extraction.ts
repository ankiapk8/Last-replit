import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import { createWorker } from "tesseract.js";
import { apiUrl } from "@/lib/utils";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type ProgressCallback = (message: string) => void;

const MIN_TEXT_LENGTH = 20;
const MAX_OCR_DIMENSION = 3200;
const SERVER_EXTRACT_URL = apiUrl("api/extract-pdf");
const CLIENT_MAX_PAGES = Number.MAX_SAFE_INTEGER;
const SERVER_THRESHOLD_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_PAGES = Number.MAX_SAFE_INTEGER;
const IMAGE_WIDTH_TEXT = 1100;
const IMAGE_WIDTH_VISUAL = 1600;
const IMAGE_QUALITY = 0.85;

export interface ImageRegion {
  x: number;
  y: number;
  w: number;
  h: number;
  source?: "raster" | "vector";
}

export interface PdfExtractionResult {
  text: string;
  pageImages: string[];
  pageTexts: string[];
  pageImageRegions: ImageRegion[][];
  pageHasVisuals?: boolean[];
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function copyBuffer(buffer: ArrayBuffer): Uint8Array {
  return new Uint8Array(buffer.slice(0));
}

async function loadPdf(buffer: ArrayBuffer) {
  const loadingTask = pdfjsLib.getDocument({ data: copyBuffer(buffer) });
  return loadingTask.promise;
}

async function renderPageToJpeg(
  pdf: Awaited<ReturnType<typeof loadPdf>>,
  pageNumber: number,
  targetWidth: number = IMAGE_WIDTH_TEXT,
): Promise<string> {
  const page = await pdf.getPage(pageNumber);
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = targetWidth / baseViewport.width;
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext("2d");

  if (!context) throw new Error("Could not get canvas context for image extraction.");

  await page.render({ canvasContext: context, canvas, viewport }).promise;
  page.cleanup();

  return new Promise<string>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) { reject(new Error("Failed to render page image.")); return; }
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Failed to read page image."));
        reader.readAsDataURL(blob);
        canvas.width = 0;
        canvas.height = 0;
      },
      "image/jpeg",
      IMAGE_QUALITY,
    );
  });
}

async function extractEmbeddedText(
  buffer: ArrayBuffer,
  onProgress?: ProgressCallback,
): Promise<{ text: string; pageTexts: string[] }> {
  const pdf = await loadPdf(buffer);
  const pageTexts: string[] = [];
  const pagesToProcess = Math.min(pdf.numPages, CLIENT_MAX_PAGES);

  try {
    for (let pageNumber = 1; pageNumber <= pagesToProcess; pageNumber++) {
      onProgress?.(`Extracting page ${pageNumber}/${pdf.numPages}…`);
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item) => ("str" in item && typeof item.str === "string" ? item.str : ""))
        .filter(Boolean)
        .join(" ");
      pageTexts.push(normalizeText(pageText));
      page.cleanup();
    }
  } finally {
    await pdf.destroy();
  }

  return { text: normalizeText(pageTexts.join("\n")), pageTexts };
}

async function extractPageImages(buffer: ArrayBuffer, onProgress?: ProgressCallback): Promise<{ images: string[]; regions: ImageRegion[][]; pageHasVisuals: boolean[] }> {
  const pdf = await loadPdf(buffer);
  const images: string[] = [];
  const regions: ImageRegion[][] = [];
  const pageHasVisuals: boolean[] = [];
  const pagesToRender = Math.min(pdf.numPages, MAX_IMAGE_PAGES);

  try {
    for (let pageNumber = 1; pageNumber <= pagesToRender; pageNumber++) {
      onProgress?.(`Capturing page ${pageNumber}/${pagesToRender} image…`);
      try {
        // Detect regions first (cheap — no canvas rendering) so we can pick
        // the right resolution for this specific page.
        let pageRegions: ImageRegion[] = [];
        try {
          pageRegions = await detectPageImageRegions(pdf, pageNumber);
        } catch {
          // ignore — fall back to text-only width
        }
        // pageHasVisuals: true whenever any qualifying region is detected on the page,
        // regardless of size — this drives the UI badge and AI focus hints.
        const hasVisuals = pageRegions.length > 0;
        // Render-resolution heuristic: upgrade to 1600px only when the page has a
        // large raster image (>20% area) or 2+ distinct vector clusters, which
        // suggests a chart/table/diagram worth high-fidelity capture.
        const rasterArea = pageRegions
          .filter(r => r.source === "raster")
          .reduce((max, r) => Math.max(max, r.w * r.h), 0);
        const vectorCount = pageRegions.filter(r => r.source === "vector").length;
        const useHighRes = rasterArea > 0.20 || vectorCount >= 2;
        const targetWidth = useHighRes ? IMAGE_WIDTH_VISUAL : IMAGE_WIDTH_TEXT;
        const dataUrl = await renderPageToJpeg(pdf, pageNumber, targetWidth);
        images.push(dataUrl);
        regions.push(pageRegions);
        pageHasVisuals.push(hasVisuals);
      } catch {
        // skip failed page renders
      }
    }
  } finally {
    await pdf.destroy();
  }

  return { images, regions, pageHasVisuals };
}

// Density grid dimensions used for vector region clustering.
const VGRID_COLS = 20;
const VGRID_ROWS = 20;

// Convert a density grid (each cell = 0 or 1) into normalized ImageRegions by
// running a BFS connected-component pass.  This lets many small path primitives
// (bars of a bar chart, cells of a table, arrows of a flowchart) accumulate
// into a single labelled cluster before size thresholds are applied.
function vectorRegionsFromGrid(grid: Uint8Array): ImageRegion[] {
  const visited = new Uint8Array(VGRID_ROWS * VGRID_COLS);
  const regions: ImageRegion[] = [];
  const cellW = 1 / VGRID_COLS;
  const cellH = 1 / VGRID_ROWS;

  for (let r0 = 0; r0 < VGRID_ROWS; r0++) {
    for (let c0 = 0; c0 < VGRID_COLS; c0++) {
      if (!grid[r0 * VGRID_COLS + c0] || visited[r0 * VGRID_COLS + c0]) continue;
      const queue: number[] = [r0 * VGRID_COLS + c0];
      visited[r0 * VGRID_COLS + c0] = 1;
      let minR = r0, maxR = r0, minC = c0, maxC = c0;
      let qi = 0;
      while (qi < queue.length) {
        const idx = queue[qi++];
        const cr = Math.floor(idx / VGRID_COLS);
        const cc = idx % VGRID_COLS;
        for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as [number, number][]) {
          const nr = cr + dr, nc = cc + dc;
          if (nr < 0 || nr >= VGRID_ROWS || nc < 0 || nc >= VGRID_COLS) continue;
          const ni = nr * VGRID_COLS + nc;
          if (!grid[ni] || visited[ni]) continue;
          visited[ni] = 1;
          queue.push(ni);
          if (nr < minR) minR = nr;
          if (nr > maxR) maxR = nr;
          if (nc < minC) minC = nc;
          if (nc > maxC) maxC = nc;
        }
      }
      regions.push({
        x: minC * cellW,
        y: minR * cellH,
        w: (maxC - minC + 1) * cellW,
        h: (maxR - minR + 1) * cellH,
        source: "vector" as const,
      });
    }
  }
  return regions;
}

// Walks PDF.js operator list to find embedded raster images AND vector-drawn
// visual content (charts, tables, diagrams) and returns their bounding boxes
// in normalized (0..1) coordinates with origin at top-left.
// Raster regions: per-XObject bbox via CTM transform.
// Vector regions: density-grid clustering so many small primitives (bars of
// a bar chart, cells of a table, strokes of a flowchart) merge into a single
// connected region before size thresholds are applied.
async function detectPageImageRegions(
  pdf: Awaited<ReturnType<typeof loadPdf>>,
  pageNumber: number,
): Promise<ImageRegion[]> {
  const page = await pdf.getPage(pageNumber);
  try {
    const viewport = page.getViewport({ scale: 1 });
    const ops = await page.getOperatorList();
    const OPS = pdfjsLib.OPS as Record<string, number>;

    const imageOpCodes = new Set<number>([
      OPS.paintImageXObject,
      OPS.paintInlineImageXObject,
      OPS.paintImageMaskXObject,
      OPS.paintImageXObjectRepeat,
      OPS.paintImageMaskXObjectGroup,
      OPS.paintImageMaskXObjectRepeat,
      OPS.paintJpegXObject,
    ].filter((v) => typeof v === "number"));

    // Vector paint ops — include fill AND stroke so flowcharts, decision trees,
    // and line-art tables (often stroke-only) are also detected.
    const paintOpCodes = new Set<number>([
      OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.stroke,
    ].filter((v): v is number => typeof v === "number"));

    const multiply = (a: number[], b: number[]): number[] => [
      a[0] * b[0] + a[2] * b[1],
      a[1] * b[0] + a[3] * b[1],
      a[0] * b[2] + a[2] * b[3],
      a[1] * b[2] + a[3] * b[3],
      a[0] * b[4] + a[2] * b[5] + a[4],
      a[1] * b[4] + a[3] * b[5] + a[5],
    ];
    const tx = (m: number[], x: number, y: number): [number, number] => [
      m[0] * x + m[2] * y + m[4],
      m[1] * x + m[3] * y + m[5],
    ];

    const pageW = viewport.width;
    const pageH = viewport.height;

    // Raster regions are stored individually (one per image XObject) and merged later.
    const rasterOut: ImageRegion[] = [];
    // Vector density grid — cells are marked as path operations are painted.
    const vGrid = new Uint8Array(VGRID_ROWS * VGRID_COLS);

    const markGrid = (pts: [number, number][]) => {
      for (const [px, py] of pts) {
        // Convert PDF user-space y (y-up) to normalized y-down for the grid.
        const normX = px / pageW;
        const normY = 1 - py / pageH;
        const col = Math.min(VGRID_COLS - 1, Math.max(0, Math.floor(normX * VGRID_COLS)));
        const row = Math.min(VGRID_ROWS - 1, Math.max(0, Math.floor(normY * VGRID_ROWS)));
        vGrid[row * VGRID_COLS + col] = 1;
      }
    };

    const stack: number[][] = [];
    let ctm: number[] = [1, 0, 0, 1, 0, 0];
    let pathPoints: [number, number][] = [];

    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i];
      const args = ops.argsArray[i];
      if (fn === OPS.save) {
        stack.push(ctm.slice());
      } else if (fn === OPS.restore) {
        ctm = stack.pop() ?? ctm;
        pathPoints = [];
      } else if (fn === OPS.transform && Array.isArray(args) && args.length >= 6) {
        ctm = multiply(ctm, args as number[]);
      } else if (fn === OPS.moveTo && Array.isArray(args) && args.length >= 2) {
        pathPoints.push(tx(ctm, args[0] as number, args[1] as number));
      } else if (fn === OPS.lineTo && Array.isArray(args) && args.length >= 2) {
        pathPoints.push(tx(ctm, args[0] as number, args[1] as number));
      } else if (fn === OPS.curveTo && Array.isArray(args) && args.length >= 6) {
        pathPoints.push(tx(ctm, args[4] as number, args[5] as number));
      } else if (fn === OPS.rectangle && Array.isArray(args) && args.length >= 4) {
        const [rx, ry, rw, rh] = args as number[];
        pathPoints.push(
          tx(ctm, rx, ry),
          tx(ctm, rx + rw, ry),
          tx(ctm, rx, ry + rh),
          tx(ctm, rx + rw, ry + rh),
        );
      } else if (paintOpCodes.has(fn)) {
        // On any paint op, mark the density grid with all accumulated path points.
        // This aggregates small primitives (individual bars, cells, arrows) across
        // the whole page so connected-component labelling can cluster them correctly.
        if (pathPoints.length >= 2) markGrid(pathPoints);
        pathPoints = [];
      } else if (imageOpCodes.has(fn)) {
        // PDF image XObjects are drawn into the unit square (0,0)-(1,1) under CTM.
        const corners: [number, number][] = [
          tx(ctm, 0, 0), tx(ctm, 1, 0), tx(ctm, 0, 1), tx(ctm, 1, 1),
        ];
        const xs = corners.map((p) => p[0]);
        const ys = corners.map((p) => p[1]);
        const minX = Math.min(...xs), maxX = Math.max(...xs);
        const minY = Math.min(...ys), maxY = Math.max(...ys);
        const r: ImageRegion = {
          x: Math.max(0, Math.min(1, minX / pageW)),
          y: Math.max(0, Math.min(1, 1 - maxY / pageH)),
          w: Math.max(0, Math.min(1, (maxX - minX) / pageW)),
          h: Math.max(0, Math.min(1, (maxY - minY) / pageH)),
          source: "raster",
        };
        // Keep only non-trivial raster images (skip 1px decorations / icons).
        if (r.w >= 0.04 && r.h >= 0.04) rasterOut.push(r);
      }
    }

    // Derive vector regions from density grid via connected-component labelling.
    const vectorRegions = vectorRegionsFromGrid(vGrid);

    // Combine: merge raster XObjects, then append vector clusters.
    // Apply a unified minimum size gate after all merging — meaningful visuals
    // should occupy at least 8% width × 6% height of the page.
    const combined = [
      ...mergeRegions(rasterOut),
      ...vectorRegions,
    ].filter(r => r.w >= 0.08 && r.h >= 0.06);

    return combined;
  } finally {
    page.cleanup();
  }
}

function mergeRegions(regions: ImageRegion[]): ImageRegion[] {
  if (regions.length <= 1) return regions;
  const items = regions.map((r) => ({ ...r, used: false }));
  const merged: ImageRegion[] = [];
  for (let i = 0; i < items.length; i++) {
    if (items[i].used) continue;
    let cur = { x: items[i].x, y: items[i].y, w: items[i].w, h: items[i].h };
    items[i].used = true;
    let changed = true;
    while (changed) {
      changed = false;
      for (let j = 0; j < items.length; j++) {
        if (items[j].used) continue;
        const a = cur;
        const b = items[j];
        const ax2 = a.x + a.w;
        const ay2 = a.y + a.h;
        const bx2 = b.x + b.w;
        const by2 = b.y + b.h;
        const overlapX = Math.max(0, Math.min(ax2, bx2) - Math.max(a.x, b.x));
        const overlapY = Math.max(0, Math.min(ay2, by2) - Math.max(a.y, b.y));
        const overlapArea = overlapX * overlapY;
        const aArea = a.w * a.h;
        const bArea = b.w * b.h;
        const minArea = Math.min(aArea, bArea);
        // Merge if they overlap meaningfully OR are adjacent (gap < 2% on
        // each axis where the other axis already overlaps).
        const adjacent =
          overlapY > 0 && Math.max(a.x, b.x) - Math.min(ax2, bx2) <= 0.02 &&
          Math.max(a.x, b.x) - Math.min(ax2, bx2) >= -0.02 ||
          overlapX > 0 && Math.max(a.y, b.y) - Math.min(ay2, by2) <= 0.02 &&
          Math.max(a.y, b.y) - Math.min(ay2, by2) >= -0.02;
        if (overlapArea / Math.max(minArea, 1e-6) > 0.2 || adjacent) {
          const x = Math.min(a.x, b.x);
          const y = Math.min(a.y, b.y);
          const w = Math.max(ax2, bx2) - x;
          const h = Math.max(ay2, by2) - y;
          cur = { x, y, w, h };
          items[j].used = true;
          changed = true;
        }
      }
    }
    merged.push(cur);
  }
  return merged;
}

async function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("Could not render PDF page for OCR."));
      }
    }, "image/png");
  });
}

async function extractClientOcrText(
  buffer: ArrayBuffer,
  onProgress?: ProgressCallback,
): Promise<{ text: string; pageTexts: string[] }> {
  const pdf = await loadPdf(buffer);
  const worker = await createWorker("eng");
  const pageTexts: string[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      onProgress?.(`OCR page ${pageNumber}/${pdf.numPages}…`);
      const page = await pdf.getPage(pageNumber);
      const baseViewport = page.getViewport({ scale: 1 });
      const scale = Math.max(
        1,
        Math.min(2, MAX_OCR_DIMENSION / Math.max(baseViewport.width, baseViewport.height)),
      );
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d");

      if (!context) {
        throw new Error("Could not prepare OCR canvas.");
      }

      await page.render({ canvasContext: context, canvas, viewport }).promise;
      const image = await canvasToBlob(canvas);
      const { data } = await worker.recognize(image);
      pageTexts.push(normalizeText(data.text));
      page.cleanup();
      canvas.width = 0;
      canvas.height = 0;
    }
  } finally {
    await worker.terminate();
    await pdf.destroy();
  }

  return { text: normalizeText(pageTexts.join("\n")), pageTexts };
}

async function extractServerText(
  buffer: ArrayBuffer,
  onProgress?: ProgressCallback,
): Promise<{ text: string; pageTexts: string[]; pageHasVisuals?: boolean[] }> {
  onProgress?.("Sending to server for extraction…");
  const blob = new Blob([buffer], { type: "application/pdf" });
  const formData = new FormData();
  formData.append("file", blob, "upload.pdf");

  const response = await fetch(SERVER_EXTRACT_URL, {
    method: "POST",
    body: formData,
  });

  const data = await response.json().catch(() => null) as { text?: unknown; pageTexts?: unknown; pageHasVisuals?: unknown; error?: unknown; method?: unknown } | null;

  if (!response.ok) {
    const error = typeof data?.error === "string" ? data.error : "Server PDF extraction failed.";
    throw new Error(error);
  }

  if (!data || typeof data.text !== "string" || data.text.trim().length <= MIN_TEXT_LENGTH) {
    throw new Error("No readable text found in this PDF.");
  }

  const serverPageTexts = Array.isArray(data.pageTexts)
    ? (data.pageTexts as unknown[]).filter((t): t is string => typeof t === "string").map(normalizeText)
    : [];

  const serverPageHasVisuals = Array.isArray(data.pageHasVisuals)
    ? (data.pageHasVisuals as unknown[]).map(Boolean)
    : undefined;

  return { text: normalizeText(data.text), pageTexts: serverPageTexts, pageHasVisuals: serverPageHasVisuals };
}

export async function extractPdfText(buffer: ArrayBuffer, onProgress?: ProgressCallback): Promise<string> {
  const result = await extractPdf(buffer, onProgress);
  return result.text;
}

export async function extractPdf(buffer: ArrayBuffer, onProgress?: ProgressCallback): Promise<PdfExtractionResult> {
  const isLargeFile = buffer.byteLength > SERVER_THRESHOLD_BYTES;
  let text = "";
  let pageTexts: string[] = [];
  let serverPageHasVisuals: boolean[] | undefined;

  if (!isLargeFile) {
    try {
      const embedded = await extractEmbeddedText(buffer, onProgress);
      if (embedded.text.length > MIN_TEXT_LENGTH) {
        text = embedded.text;
        pageTexts = embedded.pageTexts;
      }
    } catch {
      // fall through to server
    }
  } else {
    onProgress?.("Large file detected — using server extraction…");
  }

  if (!text) {
    try {
      const server = await extractServerText(buffer, onProgress);
      text = server.text;
      pageTexts = server.pageTexts;
      serverPageHasVisuals = server.pageHasVisuals;
    } catch (serverError) {
      if (!isLargeFile) {
        onProgress?.("Server unavailable, trying local OCR…");
        try {
          const ocr = await extractClientOcrText(buffer, onProgress);
          if (ocr.text.length > MIN_TEXT_LENGTH) {
            text = ocr.text;
            pageTexts = ocr.pageTexts;
          }
        } catch {
          // swallow
        }
      }
      if (!text) {
        throw serverError instanceof Error
          ? serverError
          : new Error("No readable text found in this PDF.");
      }
    }
  }

  onProgress?.("Capturing page images…");
  let pageImages: string[] = [];
  let pageImageRegions: ImageRegion[][] = [];
  let pageHasVisuals: boolean[] = [];
  try {
    const result = await extractPageImages(buffer, onProgress);
    pageImages = result.images;
    pageImageRegions = result.regions;
    pageHasVisuals = result.pageHasVisuals;
  } catch {
    // images are best-effort; fall back to server's visual detection if available
    pageHasVisuals = serverPageHasVisuals ?? [];
  }

  return { text, pageImages, pageTexts, pageImageRegions, pageHasVisuals };
}

export function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

export function isTextFile(file: File): boolean {
  return file.type === "text/plain" || file.name.toLowerCase().endsWith(".txt");
}

export function isImageFile(file: File): boolean {
  return (
    file.type.startsWith("image/") ||
    /\.(jpe?g|png|webp|gif|bmp|tiff?)$/i.test(file.name)
  );
}

export function isPptxFile(file: File): boolean {
  return (
    file.type === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    file.name.toLowerCase().endsWith(".pptx")
  );
}

export function isDocxFile(file: File): boolean {
  return (
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    file.name.toLowerCase().endsWith(".docx")
  );
}

export async function extractImage(file: File): Promise<PdfExtractionResult> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  return {
    text: `Image file: ${file.name}`,
    pageImages: [dataUrl],
    pageTexts: [`Image file: ${file.name}`],
    pageImageRegions: [[]],
  };
}

export async function extractOffice(
  file: File,
  onProgress?: ProgressCallback,
): Promise<PdfExtractionResult> {
  onProgress?.("Sending to server for extraction…");
  const formData = new FormData();
  formData.append("file", file);
  const resp = await fetch(apiUrl("api/extract-office"), { method: "POST", body: formData });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? "Office extraction failed.");
  }
  const data = (await resp.json()) as { text?: string; pageTexts?: string[] };
  const text = data.text ?? "";
  const pageTexts = data.pageTexts ?? (text ? [text] : []);
  return { text, pageImages: [], pageTexts, pageImageRegions: [] };
}
