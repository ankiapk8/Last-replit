import express, { Router, type IRouter } from "express";
import multer from "multer";
import { createCanvas, type Canvas } from "canvas";
import { createWorker } from "tesseract.js";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { logger } from "../lib/logger";

class NodeCanvasFactory {
  create(width: number, height: number) {
    if (width <= 0 || height <= 0) throw new Error("Invalid canvas size");
    const canvas = createCanvas(width, height);
    const context = canvas.getContext("2d");
    return { canvas, context };
  }
  reset(entry: { canvas: Canvas }, width: number, height: number) {
    if (width <= 0 || height <= 0) throw new Error("Invalid canvas size");
    entry.canvas.width = width;
    entry.canvas.height = height;
  }
  destroy(entry: { canvas: Canvas | null }) {
    if (entry.canvas) {
      entry.canvas.width = 0;
      entry.canvas.height = 0;
      entry.canvas = null;
    }
  }
}

const router: IRouter = Router();
const MIN_TEXT_LENGTH = 20;
const OCR_SCALE = 3;
const MAX_OCR_DIMENSION = 3200;
const MAX_PDF_SIZE = 200 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PDF_SIZE },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/pdf" || file.originalname.toLowerCase().endsWith(".pdf")) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are accepted."));
    }
  },
});

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function pdfDocOptions(buffer: Buffer) {
  return {
    data: new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength),
    disableWorker: true,
    useSystemFonts: true,
    isEvalSupported: false,
    CanvasFactory: NodeCanvasFactory,
  } as unknown as Parameters<(typeof import("pdfjs-dist/legacy/build/pdf.mjs"))["getDocument"]>[0];
}

const VGRID_COLS = 20;
const VGRID_ROWS = 20;

function gridHasAnyCluster(grid: Uint8Array): boolean {
  const visited = new Uint8Array(VGRID_ROWS * VGRID_COLS);
  const cellW = 1 / VGRID_COLS;
  const cellH = 1 / VGRID_ROWS;
  for (let r0 = 0; r0 < VGRID_ROWS; r0++) {
    for (let c0 = 0; c0 < VGRID_COLS; c0++) {
      if (!grid[r0 * VGRID_COLS + c0] || visited[r0 * VGRID_COLS + c0]) continue;
      const queue: number[] = [r0 * VGRID_COLS + c0];
      visited[r0 * VGRID_COLS + c0] = 1;
      let minR = r0,
        maxR = r0,
        minC = c0,
        maxC = c0;
      let qi = 0;
      while (qi < queue.length) {
        const idx = queue[qi++];
        const cr = Math.floor(idx / VGRID_COLS);
        const cc = idx % VGRID_COLS;
        for (const [dr, dc] of [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ] as [number, number][]) {
          const nr = cr + dr,
            nc = cc + dc;
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
      const clusterW = (maxC - minC + 1) * cellW;
      const clusterH = (maxR - minR + 1) * cellH;
      if (clusterW >= 0.08 && clusterH >= 0.06) return true;
    }
  }
  return false;
}

async function detectPagesWithVisuals(buffer: Buffer): Promise<boolean[]> {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await pdfjsLib.getDocument(pdfDocOptions(buffer)).promise;
  const OPS = pdfjsLib.OPS as Record<string, number>;
  const result: boolean[] = [];
  const imageOpCodes = new Set<number>(
    [
      OPS.paintImageXObject,
      OPS.paintInlineImageXObject,
      OPS.paintImageMaskXObject,
      OPS.paintImageXObjectRepeat,
      OPS.paintImageMaskXObjectGroup,
      OPS.paintImageMaskXObjectRepeat,
      OPS.paintJpegXObject,
    ].filter((v): v is number => typeof v === "number")
  );
  const paintOpCodes = new Set<number>(
    [OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.stroke].filter(
      (v): v is number => typeof v === "number"
    )
  );
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

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const pageW = viewport.width,
        pageH = viewport.height;
      const ops = await page.getOperatorList();
      let foundRaster = false;
      const vGrid = new Uint8Array(VGRID_ROWS * VGRID_COLS);
      const stack: number[][] = [];
      let ctm: number[] = [1, 0, 0, 1, 0, 0];
      let pathPts: [number, number][] = [];

      for (let i = 0; i < ops.fnArray.length; i++) {
        const fn = ops.fnArray[i];
        const args = ops.argsArray[i];
        if (fn === OPS.save) {
          stack.push(ctm.slice());
        } else if (fn === OPS.restore) {
          ctm = stack.pop() ?? ctm;
          pathPts = [];
        } else if (fn === OPS.transform && Array.isArray(args) && args.length >= 6) {
          ctm = multiply(ctm, args as number[]);
        } else if (fn === OPS.moveTo && Array.isArray(args) && args.length >= 2) {
          pathPts.push(tx(ctm, args[0] as number, args[1] as number));
        } else if (fn === OPS.lineTo && Array.isArray(args) && args.length >= 2) {
          pathPts.push(tx(ctm, args[0] as number, args[1] as number));
        } else if (fn === OPS.curveTo && Array.isArray(args) && args.length >= 6) {
          pathPts.push(tx(ctm, args[4] as number, args[5] as number));
        } else if (fn === OPS.rectangle && Array.isArray(args) && args.length >= 4) {
          const [rx, ry, rw, rh] = args as number[];
          pathPts.push(
            tx(ctm, rx, ry),
            tx(ctm, rx + rw, ry),
            tx(ctm, rx, ry + rh),
            tx(ctm, rx + rw, ry + rh)
          );
        } else if (paintOpCodes.has(fn)) {
          for (const [px, py] of pathPts) {
            const col = Math.min(
              VGRID_COLS - 1,
              Math.max(0, Math.floor((px / pageW) * VGRID_COLS))
            );
            const row = Math.min(
              VGRID_ROWS - 1,
              Math.max(0, Math.floor(((pageH - py) / pageH) * VGRID_ROWS))
            );
            vGrid[row * VGRID_COLS + col] = 1;
          }
          pathPts = [];
        } else if (imageOpCodes.has(fn)) {
          const corners: [number, number][] = [
            tx(ctm, 0, 0),
            tx(ctm, 1, 0),
            tx(ctm, 0, 1),
            tx(ctm, 1, 1),
          ];
          const xs = corners.map((p) => p[0]),
            ys = corners.map((p) => p[1]);
          const w = (Math.max(...xs) - Math.min(...xs)) / pageW;
          const h = (Math.max(...ys) - Math.min(...ys)) / pageH;
          if (w >= 0.08 && h >= 0.06) {
            foundRaster = true;
          }
        }
      }
      page.cleanup();
      result.push(foundRaster || gridHasAnyCluster(vGrid));
    }
  } finally {
    await pdf.destroy();
  }
  return result;
}

async function extractEmbeddedPdfText(
  buffer: Buffer
): Promise<{ text: string; pageTexts: string[]; numPages: number }> {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await pdfjsLib.getDocument(pdfDocOptions(buffer)).promise;
  const numPages = pdf.numPages;
  const pageTexts: string[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= numPages; pageNumber++) {
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
  return { text: normalizeText(pageTexts.join("\n")), pageTexts, numPages };
}

async function renderPageToBuffer(pdf: PDFDocumentProxy, pageNumber: number): Promise<Buffer> {
  const page = await pdf.getPage(pageNumber);
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = Math.min(
    OCR_SCALE,
    MAX_OCR_DIMENSION / Math.max(baseViewport.width, baseViewport.height)
  );
  const viewport = page.getViewport({ scale });
  const width = Math.ceil(viewport.width);
  const height = Math.ceil(viewport.height);
  const factory = new NodeCanvasFactory();
  const entry = factory.create(width, height);
  await page.render({
    canvasContext: entry.context as Parameters<typeof page.render>[0]["canvasContext"],
    canvas: entry.canvas as never,
    viewport,
  }).promise;
  page.cleanup();
  const buffer = (entry.canvas as Canvas).toBuffer("image/png");
  factory.destroy(entry as { canvas: Canvas | null });
  return buffer;
}

let workerPromise: ReturnType<typeof createWorker> | null = null;

async function getOcrWorker() {
  if (!workerPromise) {
    workerPromise = createWorker("eng");
  }
  return workerPromise;
}

export async function terminateOcrWorker(): Promise<void> {
  if (workerPromise) {
    const worker = await workerPromise;
    await worker.terminate();
    workerPromise = null;
  }
}

async function extractOcrText(buffer: Buffer): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await pdfjsLib.getDocument(pdfDocOptions(buffer)).promise;
  const worker = await getOcrWorker();
  const pageTexts: string[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const imageBuffer = await renderPageToBuffer(pdf, pageNumber);
      const { data } = await worker.recognize(imageBuffer);
      pageTexts.push(data.text);
    }
  } finally {
    await pdf.destroy();
  }
  return normalizeText(pageTexts.join("\n"));
}

async function processPdfBuffer(
  buffer: Buffer,
  res: express.Response,
  log: { info: (msg: string) => void; error: (obj: object, msg: string) => void }
): Promise<void> {
  try {
    const [{ text: embeddedText, pageTexts: embeddedPageTexts }, pageHasVisuals] =
      await Promise.all([
        extractEmbeddedPdfText(buffer),
        detectPagesWithVisuals(buffer).catch(() => [] as boolean[]),
      ]);
    if (embeddedText.length > MIN_TEXT_LENGTH) {
      res.json({
        text: embeddedText,
        pageTexts: embeddedPageTexts,
        pageHasVisuals,
        length: embeddedText.length,
        method: "embedded",
      });
      return;
    }
    log.info("No embedded text found, running server-side OCR…");
    const ocrText = await extractOcrText(buffer);
    if (ocrText.length <= MIN_TEXT_LENGTH) {
      res
        .status(422)
        .json({
          error: {
            code: "VALIDATION_ERROR",
            message: "No readable text could be extracted from this PDF, even with OCR.",
          },
        });
      return;
    }
    res.json({ text: ocrText, pageHasVisuals, length: ocrText.length, method: "ocr" });
  } catch (error) {
    log.error({ err: error }, "Server-side PDF extraction failed");
    res
      .status(422)
      .json({
        error: {
          code: "INTERNAL_ERROR",
          message: error instanceof Error ? error.message : "Could not extract text from this PDF.",
        },
      });
  }
}

router.post(
  "/extract-pdf",
  (req, res, next) => {
    const ct = req.headers["content-type"] ?? "";
    if (ct.includes("multipart/form-data")) {
      upload.single("file")(req, res, next);
    } else {
      next();
    }
  },
  express.raw({ type: ["application/pdf", "application/octet-stream"], limit: "200mb" }),
  async (req, res): Promise<void> => {
    const log = (
      req as express.Request & {
        log: { info: (m: string) => void; error: (o: object, m: string) => void };
      }
    ).log;
    let buffer: Buffer | null = null;
    if ((req as express.Request & { file?: Express.Multer.File }).file) {
      buffer = (req as express.Request & { file?: Express.Multer.File }).file!.buffer;
    } else if (Buffer.isBuffer(req.body) && req.body.byteLength > 0) {
      buffer = req.body;
    }
    if (!buffer) {
      res
        .status(400)
        .json({
          error: { code: "VALIDATION_ERROR", message: "Upload a PDF file to extract text." },
        });
      return;
    }
    await processPdfBuffer(buffer, res, log);
  }
);

export default router;
