import { Router, type IRouter } from "express";
import { createRequire } from "module";
import { createHash } from "crypto";
import { inArray } from "drizzle-orm";
import { db, decksTable, cardsTable } from "@workspace/db";
import { getEffectiveIsPro, checkExportQuota, recordExport, sendLimitError } from "../lib/free-tier-limits";

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AnkiExport: any = require("anki-apkg-export").default;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const JSZip: any = require("jszip");

const router: IRouter = Router();

function sha1(str: string): string {
  return createHash("sha1").update(str).digest("hex");
}

function ankiChecksum(str: string): number {
  return parseInt(sha1(str).substring(0, 8), 16);
}

const SEPARATOR = "\u001F";

// HTML escape, then convert newlines to <br>. Anki's note fields are HTML —
// raw newlines collapse to a single space in the renderer, and stray "<" /
// "&" can break the card template. AnkiMobile is particularly strict.
function toAnkiHtml(input: string): string {
  if (!input) return "";
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\r\n?/g, "\n")
    .replace(/\n/g, "<br>");
}

function letterFor(idx: number): string {
  return String.fromCharCode(65 + idx); // A, B, C, D, ...
}

// Build the front/back strings the way AnkiMobile expects:
//  • MCQ → stem on front, choices labelled A./B./C…, correct answer + explanation on back
//  • basic with image → image embedded on the relevant side via <img src="…">
//  • newlines → <br>; HTML-unsafe characters escaped
//  • optional "p. N" badge so the source-page tag survives the export
function buildAnkiFields(card: typeof cardsTable.$inferSelect, mediaFilename: string | null): { front: string; back: string } {
  const isMcq = card.cardType === "mcq" && card.choices;
  const pageBadge = card.pageNumber
    ? `<div style="font-size:11px;color:#888;margin-bottom:6px">p. ${card.pageNumber}</div>`
    : "";

  let frontHtml = pageBadge + toAnkiHtml(card.front);
  let backHtml = toAnkiHtml(card.back);

  if (isMcq) {
    let choices: string[] = [];
    try { choices = JSON.parse(card.choices ?? "[]"); } catch { choices = []; }
    if (choices.length > 0) {
      const correct = typeof card.correctIndex === "number" ? card.correctIndex : -1;
      const choicesHtml = choices
        .map((c, i) => `<div style="margin:4px 0">${letterFor(i)}. ${toAnkiHtml(c)}</div>`)
        .join("");
      frontHtml = `${frontHtml}<div style="margin-top:12px">${choicesHtml}</div>`;
      const correctLine = correct >= 0 && correct < choices.length
        ? `<div style="margin-bottom:8px"><b>Correct: ${letterFor(correct)}. ${toAnkiHtml(choices[correct])}</b></div>`
        : "";
      backHtml = correctLine + backHtml;
    }
  }

  if (mediaFilename) {
    // Visual cards: the image IS the prompt — show it on the front, keep the
    // text question above it (so the learner knows what to look at) and the
    // back stays as the explanation.
    const imgTag = `<div style="margin-top:10px"><img src="${mediaFilename}" style="max-width:100%;height:auto"></div>`;
    frontHtml = `${frontHtml}${imgTag}`;
  }

  return { front: frontHtml, back: backHtml };
}

// Decode a `data:image/...;base64,xxxx` (or bare base64) payload into a Buffer
// + extension. Returns null if the input doesn't look like an image we can save.
function decodeDataUrlImage(dataUrl: string | null): { buffer: Buffer; ext: string } | null {
  if (!dataUrl) return null;
  const m = dataUrl.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,(.+)$/);
  if (m) {
    const ext = m[1].toLowerCase().replace("jpeg", "jpg");
    try {
      return { buffer: Buffer.from(m[2], "base64"), ext };
    } catch {
      return null;
    }
  }
  // Bare base64 with no header — assume jpeg.
  if (/^[A-Za-z0-9+/=\s]+$/.test(dataUrl) && dataUrl.length > 64) {
    try {
      return { buffer: Buffer.from(dataUrl.replace(/\s+/g, ""), "base64"), ext: "jpg" };
    } catch {
      return null;
    }
  }
  return null;
}

function addDeckEntry(sqlDb: any, deckId: number, deckName: string, templateDeck: Record<string, unknown>): void {
  const raw = sqlDb.exec("SELECT decks FROM col WHERE id=1");
  const decks = JSON.parse(raw[0].values[0][0] as string);
  decks[String(deckId)] = {
    ...templateDeck,
    id: deckId,
    name: deckName,
    mod: Math.floor(Date.now() / 1000),
  };
  sqlDb.prepare("UPDATE col SET decks=:d WHERE id=1").getAsObject({ ":d": JSON.stringify(decks) });
}

function insertNoteAndCard(
  sqlDb: any,
  { front, back, tags, deckId, modelId, noteId, cardId }: {
    front: string; back: string; tags: string[]; deckId: number; modelId: number; noteId: number; cardId: number;
  }
): void {
  const flds = front + SEPARATOR + back;
  const guid = sha1(`${deckId}:${noteId}:${front.slice(0, 200)}`);
  const strTags = tags.length ? " " + tags.map(t => t.replace(/\s+/g, "_")).join(" ") + " " : "";
  const mod = Math.floor(Date.now() / 1000);

  sqlDb.prepare(
    "INSERT OR REPLACE INTO notes VALUES(:id,:guid,:mid,:mod,:usn,:tags,:flds,:sfld,:csum,:flags,:data)"
  ).getAsObject({
    ":id": noteId,
    ":guid": guid,
    ":mid": modelId,
    ":mod": mod,
    ":usn": -1,
    ":tags": strTags,
    ":flds": flds,
    ":sfld": front,
    ":csum": ankiChecksum(flds),
    ":flags": 0,
    ":data": "",
  });

  sqlDb.prepare(
    "INSERT OR REPLACE INTO cards VALUES(:id,:nid,:did,:ord,:mod,:usn,:type,:queue,:due,:ivl,:factor,:reps,:lapses,:left,:odue,:odid,:flags,:data)"
  ).getAsObject({
    ":id": cardId,
    ":nid": noteId,
    ":did": deckId,
    ":ord": 0,
    ":mod": mod,
    ":usn": -1,
    ":type": 0,
    ":queue": 0,
    ":due": 179,
    ":ivl": 0,
    ":factor": 0,
    ":reps": 0,
    ":lapses": 0,
    ":left": 0,
    ":odue": 0,
    ":odid": 0,
    ":flags": 0,
    ":data": "",
  });
}

/**
 * Recursively register all descendant decks in the Anki SQLite col.decks JSON.
 * Returns the updated idCounter.
 */
function registerDescendants(
  allDecks: (typeof decksTable.$inferSelect)[],
  parentDbId: number,
  parentAnkiName: string,
  idCounter: number,
  ankiDeckIdMap: Map<number, { ankiId: number; ankiName: string }>,
  sqlDb: any,
  templateDeck: Record<string, unknown>
): number {
  const children = allDecks.filter(d => d.parentId === parentDbId);
  for (const child of children) {
    const ankiName = `${parentAnkiName}::${child.name}`;
    const ankiId = idCounter++;
    addDeckEntry(sqlDb, ankiId, ankiName, templateDeck);
    ankiDeckIdMap.set(child.id, { ankiId, ankiName });
    idCounter = registerDescendants(allDecks, child.id, ankiName, idCounter, ankiDeckIdMap, sqlDb, templateDeck);
  }
  return idCounter;
}

/**
 * Collect all descendant IDs for a set of deck IDs (recursive, in-memory).
 */
function collectAllDescendantIds(
  allDecks: (typeof decksTable.$inferSelect)[],
  parentIds: number[]
): number[] {
  const direct = allDecks.filter(d => d.parentId !== null && parentIds.includes(d.parentId!));
  if (direct.length === 0) return [];
  return [...direct.map(d => d.id), ...collectAllDescendantIds(allDecks, direct.map(d => d.id))];
}

router.post("/export-apkg", async (req, res, next): Promise<void> => {
  const { deckIds, exportName } = req.body as {
    deckIds?: number[];
    exportName?: string;
  };

  if (!Array.isArray(deckIds) || deckIds.length === 0) {
    res.status(400).json({ error: "deckIds must be a non-empty array." });
    return;
  }

  const userId = req.isAuthenticated() ? req.user!.id : null;
  const isPro = await getEffectiveIsPro(req, userId);
  const exportKey = userId ?? (req.ip ?? "unknown");
  if (!isPro) {
    const { allowed } = await checkExportQuota(exportKey);
    if (!allowed) {
      sendLimitError(
        res,
        "apkg_export",
        "Free users can export 1 .apkg file per day. Upgrade to Pro for unlimited exports.",
      );
      return;
    }
  }

  const ids = deckIds.map(id => Number(id)).filter(id => !isNaN(id));
  if (ids.length === 0) {
    res.status(400).json({ error: "No valid deck IDs provided." });
    return;
  }

  let allDecksInDb: (typeof decksTable.$inferSelect)[];
  try {
    allDecksInDb = await db.select().from(decksTable);
  } catch (err) {
    next(err);
    return;
  }

  // Fetch requested decks
  const requestedDecks = allDecksInDb.filter(d => ids.includes(d.id));
  if (requestedDecks.length === 0) {
    res.status(404).json({ error: "No matching decks found." });
    return;
  }

  // Auto-include ALL descendants of selected decks (any depth)
  const allDescendantIds = collectAllDescendantIds(allDecksInDb, ids);
  const autoDecks = allDecksInDb.filter(d => allDescendantIds.includes(d.id) && !ids.includes(d.id));

  // De-duplicate
  const allDeckMap = new Map([...requestedDecks, ...autoDecks].map(d => [d.id, d]));
  const allDecks = Array.from(allDeckMap.values());

  // Fetch all cards (sorted by source PDF page so the deck reads in order
  // when the learner imports the .apkg).
  const allCardIds = allDecks.map(d => d.id);
  let allCards: (typeof cardsTable.$inferSelect)[];
  try {
    const { sql } = await import("drizzle-orm");
    allCards = await db
      .select()
      .from(cardsTable)
      .where(inArray(cardsTable.deckId, allCardIds))
      .orderBy(sql`${cardsTable.pageNumber} ASC NULLS LAST`, cardsTable.createdAt);
  } catch (err) {
    next(err);
    return;
  }

  if (allCards.length === 0) {
    res.status(400).json({ error: "Selected decks have no cards to export." });
    return;
  }

  // Determine root label and root decks
  // A "root" for export purposes is any selected deck whose parent is NOT in the export set.
  const allExportIds = new Set(allDecks.map(d => d.id));
  const exportRoots = allDecks.filter(d => !d.parentId || !allExportIds.has(d.parentId));

  const rootLabel =
    exportName?.trim() ||
    (exportRoots.length === 1 ? exportRoots[0].name : `${exportRoots.length} Decks`);

  // ── Build the .apkg ──────────────────────────────────────────────────────
  const apkg = AnkiExport(rootLabel);
  const sqlDb = apkg.db;
  const parentDeckId: number = apkg.topDeckId;
  const modelId: number = apkg.topModelId;

  const colDecksRaw = sqlDb.exec("SELECT decks FROM col WHERE id=1");
  const colDecks = JSON.parse(colDecksRaw[0].values[0][0] as string);
  const templateDeck = colDecks[String(parentDeckId)];

  const ankiDeckIdMap = new Map<number, { ankiId: number; ankiName: string }>();
  let idCounter = parentDeckId + 1;

  if (exportRoots.length === 1) {
    // Single root — it IS the top-level AnkiExport deck
    const root = exportRoots[0];
    ankiDeckIdMap.set(root.id, { ankiId: parentDeckId, ankiName: rootLabel });
    // Recursively register all children
    idCounter = registerDescendants(allDecksInDb, root.id, rootLabel, idCounter, ankiDeckIdMap, sqlDb, templateDeck);
  } else {
    // Multiple roots — each becomes a child of the rootLabel deck
    for (const root of exportRoots) {
      const ankiName = `${rootLabel}::${root.name}`;
      const ankiId = idCounter++;
      addDeckEntry(sqlDb, ankiId, ankiName, templateDeck);
      ankiDeckIdMap.set(root.id, { ankiId, ankiName });
      idCounter = registerDescendants(allDecksInDb, root.id, ankiName, idCounter, ankiDeckIdMap, sqlDb, templateDeck);
    }
  }

  // Insert all cards. Use a stable, monotonically increasing base for note/card
  // IDs (Date.now() in ms + index) — this prevents collisions on AnkiMobile,
  // which is stricter than desktop about duplicate primary keys, and stays
  // within the 53-bit safe integer range.
  const baseId = Date.now();
  const mediaFiles: { filename: string; data: Buffer }[] = [];
  let cardIndex = 0;

  for (const card of allCards) {
    const entry = ankiDeckIdMap.get(card.deckId);
    if (!entry) continue;

    const baseTags = card.tags ? card.tags.split(/[\s,]+/).map((t: string) => t.trim()).filter(Boolean) : [];

    // If the card has an embedded image, decode + register it as a media file.
    // The filename has to be unique inside the zip and reference-friendly.
    let mediaFilename: string | null = null;
    const decoded = decodeDataUrlImage(card.image);
    if (decoded) {
      mediaFilename = `card_${card.id}.${decoded.ext}`;
      mediaFiles.push({ filename: mediaFilename, data: decoded.buffer });
    }

    const { front, back } = buildAnkiFields(card, mediaFilename);

    // Two consecutive IDs per card (note + card). Spaced by 2 so we always
    // have room and never collide between notes and cards even if the loop
    // grows huge.
    const noteId = baseId + cardIndex * 2;
    const cardId = baseId + cardIndex * 2 + 1;
    cardIndex++;

    insertNoteAndCard(sqlDb, {
      front,
      back,
      tags: baseTags,
      deckId: entry.ankiId,
      modelId,
      noteId,
      cardId,
    });
  }

  // ── Build the zip ourselves so we can:
  //   • use Buffer.from (not deprecated `new Buffer`) to avoid
  //     zero-fill bugs that AnkiMobile chokes on,
  //   • ensure media files are stored DEFLATE-compressed with binary mode,
  //   • write `collection.anki2` first (some readers, including older
  //     AnkiMobile builds, scan sequentially).
  // ──────────────────────────────────────────────────────────────────────
  const sqlExport: Uint8Array = sqlDb.export();
  const collectionBuffer = Buffer.from(sqlExport.buffer, sqlExport.byteOffset, sqlExport.byteLength);

  const zip = new JSZip();
  zip.file("collection.anki2", collectionBuffer, { binary: true });

  const mediaJson: Record<string, string> = {};
  mediaFiles.forEach((m, i) => {
    mediaJson[String(i)] = m.filename;
    zip.file(String(i), m.data, { binary: true });
  });
  zip.file("media", JSON.stringify(mediaJson));

  const zipBuffer: Buffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  const safeName = rootLabel.replace(/[^a-z0-9_\-]/gi, "_");
  res.setHeader("Content-Type", "application/vnd.anki");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${safeName}.apkg"; filename*=UTF-8''${encodeURIComponent(safeName)}.apkg`,
  );
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Length", zipBuffer.length);

  req.log.info(
    { deckCount: allDecks.length, cardCount: allCards.length, mediaCount: mediaFiles.length },
    "Exported hierarchical .apkg",
  );

  if (!isPro) {
    await recordExport(exportKey);
  }

  res.end(zipBuffer);
});

export default router;
