import { Router, type IRouter } from "express";
import multer from "multer";

const router: IRouter = Router();

const MAX_SIZE = 50 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIZE },
  fileFilter: (_req, file, cb) => {
    const name = file.originalname.toLowerCase();
    if (name.endsWith(".pptx") || name.endsWith(".docx") || name.endsWith(".ppt") || name.endsWith(".doc")) {
      cb(null, true);
    } else {
      cb(new Error("Only .pptx and .docx files are accepted."));
    }
  },
});

async function extractPptx(buffer: Buffer): Promise<{ text: string; pageTexts: string[] }> {
  const JSZip = (await import("jszip")).default;
  const { XMLParser } = await import("fast-xml-parser");
  const zip = await JSZip.loadAsync(buffer);

  const slideFiles = Object.keys(zip.files)
    .filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const na = parseInt(a.match(/\d+/)?.[0] ?? "0");
      const nb = parseInt(b.match(/\d+/)?.[0] ?? "0");
      return na - nb;
    });

  const parser = new XMLParser({ ignoreAttributes: true, textNodeName: "#text" });
  const pageTexts: string[] = [];

  for (const slidePath of slideFiles) {
    const xml = await zip.files[slidePath].async("string");
    const parsed = parser.parse(xml);

    const texts: string[] = [];
    function walk(obj: unknown): void {
      if (!obj || typeof obj !== "object") return;
      if (Array.isArray(obj)) { obj.forEach(walk); return; }
      const record = obj as Record<string, unknown>;
      if ("a:t" in record) {
        const t = record["a:t"];
        if (typeof t === "string" && t.trim()) texts.push(t.trim());
        else if (Array.isArray(t)) t.forEach(s => { if (typeof s === "string" && s.trim()) texts.push(s.trim()); });
      }
      for (const v of Object.values(record)) walk(v);
    }
    walk(parsed);
    pageTexts.push(texts.join(" "));
  }

  return { text: pageTexts.join("\n\n"), pageTexts };
}

async function extractDocx(buffer: Buffer): Promise<{ text: string; pageTexts: string[] }> {
  const JSZip = (await import("jszip")).default;
  const { XMLParser } = await import("fast-xml-parser");
  const zip = await JSZip.loadAsync(buffer);
  const docFile = zip.files["word/document.xml"];
  if (!docFile) throw new Error("Invalid .docx file.");
  const xml = await docFile.async("string");
  const parser = new XMLParser({ ignoreAttributes: true, textNodeName: "#text" });
  const parsed = parser.parse(xml);

  const texts: string[] = [];
  function walk(obj: unknown): void {
    if (!obj || typeof obj !== "object") return;
    if (Array.isArray(obj)) { obj.forEach(walk); return; }
    const record = obj as Record<string, unknown>;
    if ("w:t" in record) {
      const t = record["w:t"];
      if (typeof t === "string" && t.trim()) texts.push(t.trim());
    }
    for (const v of Object.values(record)) walk(v);
  }
  walk(parsed);
  const text = texts.join(" ");
  return { text, pageTexts: [text] };
}

router.post("/extract-office", upload.single("file"), async (req, res): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded." });
    return;
  }
  try {
    const name = req.file.originalname.toLowerCase();
    let result: { text: string; pageTexts: string[] };
    if (name.endsWith(".pptx") || name.endsWith(".ppt")) {
      result = await extractPptx(req.file.buffer);
    } else {
      result = await extractDocx(req.file.buffer);
    }
    if (!result.text.trim()) {
      res.status(422).json({ error: "No readable text found in this file." });
      return;
    }
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Extraction failed.";
    res.status(500).json({ error: message });
  }
});

export default router;
