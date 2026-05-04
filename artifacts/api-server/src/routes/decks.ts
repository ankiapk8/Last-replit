import { Router, type IRouter, type Request } from "express";
import { eq, sql, inArray, asc, isNull, and } from "drizzle-orm";
import { db, decksTable, cardsTable } from "@workspace/db";
import {
  CreateDeckBody,
  GetDeckParams,
  DeleteDeckParams,
  ListDeckCardsParams,
  ExportDeckParams,
  UpdateDeckBody,
} from "@workspace/api-zod";
import { serializeCard } from "../lib/serialize-card";
import { getEffectiveIsPro, checkDeckQuota, recordDeckCreation, FREE_TIER, sendLimitError } from "../lib/free-tier-limits";

const router: IRouter = Router();

/** Returns the authenticated userId or null for anonymous requests. */
function getRequestUserId(req: Request): string | null {
  return req.isAuthenticated() ? req.user!.id : null;
}

/** Drizzle WHERE condition that scopes rows to the requester. */
function deckOwnerFilter(userId: string | null) {
  return userId ? eq(decksTable.userId, userId) : isNull(decksTable.userId);
}

/** Returns true when a stored deck userId matches the requester (null == anonymous). */
function ownsResource(resourceUserId: string | null, requestUserId: string | null): boolean {
  return resourceUserId === requestUserId;
}

router.get("/decks", async (req, res, next): Promise<void> => {
  const userId = getRequestUserId(req);
  try {
    const decks = await db
      .select({
        id: decksTable.id,
        name: decksTable.name,
        description: decksTable.description,
        parentId: decksTable.parentId,
        kind: decksTable.kind,
        createdAt: decksTable.createdAt,
        cardCount: sql<number>`cast(count(${cardsTable.id}) as int)`,
      })
      .from(decksTable)
      .leftJoin(cardsTable, eq(cardsTable.deckId, decksTable.id))
      .where(deckOwnerFilter(userId))
      .groupBy(decksTable.id)
      .orderBy(decksTable.createdAt);

    res.json(decks.map(d => ({ ...d, createdAt: d.createdAt.toISOString() })));
  } catch (err) {
    next(err);
  }
});

router.post("/decks", async (req, res, next): Promise<void> => {
  const parsed = CreateDeckBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const userId = req.isAuthenticated() ? req.user!.id : null;
  const isPro = await getEffectiveIsPro(req, userId);
  const deckKey = userId ?? (req.ip ?? "unknown");

  if (!isPro && parsed.data.parentId == null) {
    const { allowed } = await checkDeckQuota(deckKey, userId);
    if (!allowed) {
      sendLimitError(
        res,
        "deck_count",
        `Free users can create up to ${FREE_TIER.MAX_DECKS} decks. Upgrade to Pro for unlimited decks.`,
      );
      return;
    }
  }

  try {
    const values = {
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      parentId: parsed.data.parentId ?? null,
      kind: parsed.data.kind === "qbank" ? "qbank" : "deck",
      userId,
    };
    const [deck] = await db.insert(decksTable).values(values).returning();
    if (deck && parsed.data.parentId == null && !isPro) {
      await recordDeckCreation(deckKey);
    }
    res.status(201).json({
      ...deck,
      cardCount: 0,
      createdAt: deck.createdAt.toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

router.get("/decks/:id", async (req, res, next): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetDeckParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const userId = getRequestUserId(req);
  try {
    const [row] = await db
      .select({
        id: decksTable.id,
        name: decksTable.name,
        description: decksTable.description,
        parentId: decksTable.parentId,
        kind: decksTable.kind,
        createdAt: decksTable.createdAt,
        userId: decksTable.userId,
        cardCount: sql<number>`cast(count(${cardsTable.id}) as int)`,
      })
      .from(decksTable)
      .leftJoin(cardsTable, eq(cardsTable.deckId, decksTable.id))
      .where(eq(decksTable.id, params.data.id))
      .groupBy(decksTable.id);

    if (!row || !ownsResource(row.userId ?? null, userId)) {
      res.status(404).json({ error: "Deck not found" });
      return;
    }

    const subDecks = await db
      .select({
        id: decksTable.id,
        name: decksTable.name,
        description: decksTable.description,
        parentId: decksTable.parentId,
        kind: decksTable.kind,
        createdAt: decksTable.createdAt,
        cardCount: sql<number>`cast(count(${cardsTable.id}) as int)`,
      })
      .from(decksTable)
      .leftJoin(cardsTable, eq(cardsTable.deckId, decksTable.id))
      .where(and(eq(decksTable.parentId, params.data.id), deckOwnerFilter(userId)))
      .groupBy(decksTable.id)
      .orderBy(asc(decksTable.name));

    res.json({
      ...row,
      createdAt: row.createdAt.toISOString(),
      subDecks: subDecks.map(s => ({ ...s, createdAt: s.createdAt.toISOString() })),
    });
  } catch (err) {
    next(err);
  }
});

router.patch("/decks/:id", async (req, res, next): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const parsed = UpdateDeckBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const promotingToRoot = "parentId" in parsed.data && (parsed.data.parentId === null || parsed.data.parentId === undefined);
  if (promotingToRoot) {
    const patchUserId = req.isAuthenticated() ? req.user!.id : null;
    const patchIsPro = await getEffectiveIsPro(req, patchUserId);
    if (!patchIsPro) {
      const patchKey = patchUserId ?? (req.ip ?? "unknown");
      const existing = await db.select({ parentId: decksTable.parentId }).from(decksTable).where(eq(decksTable.id, id));
      const wasChild = existing[0]?.parentId != null;
      if (wasChild) {
        const { allowed } = await checkDeckQuota(patchKey, patchUserId);
        if (!allowed) {
          sendLimitError(res, "deck_count", `Free users can have up to ${FREE_TIER.MAX_DECKS} root decks. Upgrade to Pro for unlimited decks.`);
          return;
        }
      }
    }
  }

  const patchUserId2 = getRequestUserId(req);
  const updates: Partial<typeof decksTable.$inferInsert> & { updatedAt?: Date } = {
    updatedAt: new Date(),
  };
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if ("description" in parsed.data) updates.description = parsed.data.description ?? undefined;
  if ("parentId" in parsed.data) updates.parentId = parsed.data.parentId ?? undefined;
  if (parsed.data.kind !== undefined) updates.kind = parsed.data.kind === "qbank" ? "qbank" : "deck";

  if (Object.keys(updates).length <= 1) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  try {
    const [existing] = await db.select({ userId: decksTable.userId }).from(decksTable).where(eq(decksTable.id, id));
    if (!existing || !ownsResource(existing.userId ?? null, patchUserId2)) {
      res.status(404).json({ error: "Deck not found" });
      return;
    }

    const [updated] = await db
      .update(decksTable)
      .set(updates)
      .where(and(eq(decksTable.id, id), deckOwnerFilter(patchUserId2)))
      .returning();

    if (!updated) { res.status(404).json({ error: "Deck not found" }); return; }

    const [row] = await db
      .select({
        id: decksTable.id,
        name: decksTable.name,
        description: decksTable.description,
        parentId: decksTable.parentId,
        kind: decksTable.kind,
        createdAt: decksTable.createdAt,
        cardCount: sql<number>`cast(count(${cardsTable.id}) as int)`,
      })
      .from(decksTable)
      .leftJoin(cardsTable, eq(cardsTable.deckId, decksTable.id))
      .where(eq(decksTable.id, id))
      .groupBy(decksTable.id);

    res.json({ ...row!, createdAt: row!.createdAt.toISOString() });
  } catch (err) {
    next(err);
  }
});

router.post("/decks/merge", async (req, res, next): Promise<void> => {
  const body = req.body as {
    deckIds?: unknown;
    newDeckName?: unknown;
    parentId?: unknown;
    deleteOriginals?: unknown;
  };

  const deckIds = Array.isArray(body.deckIds)
    ? body.deckIds.map(v => Number(v)).filter(n => Number.isInteger(n) && n > 0)
    : [];
  const newDeckName = typeof body.newDeckName === "string" ? body.newDeckName.trim() : "";
  const parentId =
    typeof body.parentId === "number" && Number.isInteger(body.parentId) ? body.parentId : null;
  const deleteOriginals = body.deleteOriginals === true;

  if (deckIds.length < 2) {
    res.status(400).json({ error: "Select at least two decks to merge." });
    return;
  }
  if (!newDeckName) {
    res.status(400).json({ error: "A name for the merged deck is required." });
    return;
  }

  const mergeUserId = req.isAuthenticated() ? req.user!.id : null;
  const mergeIsPro = await getEffectiveIsPro(req, mergeUserId);
  if (!mergeIsPro && parentId === null) {
    const mergeKey = mergeUserId ?? (req.ip ?? "unknown");
    const { allowed } = await checkDeckQuota(mergeKey, mergeUserId);
    if (!allowed) {
      sendLimitError(res, "deck_count", `Free users can create up to ${FREE_TIER.MAX_DECKS} decks. Upgrade to Pro for unlimited decks.`);
      return;
    }
  }

  try {
    const allDecks = await db.select().from(decksTable);
    const byId = new Map(allDecks.map(d => [d.id, d] as const));
    const childrenByParent = new Map<number, number[]>();
    for (const d of allDecks) {
      if (d.parentId == null) continue;
      const arr = childrenByParent.get(d.parentId) ?? [];
      arr.push(d.id);
      childrenByParent.set(d.parentId, arr);
    }

    function collectIds(rootId: number, acc: Set<number>) {
      if (acc.has(rootId)) return;
      acc.add(rootId);
      for (const c of childrenByParent.get(rootId) ?? []) collectIds(c, acc);
    }

    const sourceIds = new Set<number>();
    for (const id of deckIds) {
      if (!byId.has(id)) {
        res.status(404).json({ error: `Deck ${id} not found.` });
        return;
      }
      collectIds(id, sourceIds);
    }

    if (parentId !== null && sourceIds.has(parentId)) {
      res.status(400).json({ error: "Cannot place the merged deck inside a deck that's being merged." });
      return;
    }

    const sourceCards = await db
      .select()
      .from(cardsTable)
      .where(inArray(cardsTable.deckId, Array.from(sourceIds)))
      .orderBy(cardsTable.createdAt);

    if (sourceCards.length === 0) {
      res.status(400).json({ error: "Selected decks contain no cards to merge." });
      return;
    }

    const [mergedDeck] = await db
      .insert(decksTable)
      .values({
        name: newDeckName,
        description: `Merged from ${deckIds.length} deck${deckIds.length === 1 ? "" : "s"}: ${deckIds
          .map(id => byId.get(id)?.name ?? `#${id}`)
          .join(", ")}`,
        parentId,
      })
      .returning();

    await db.insert(cardsTable).values(
      sourceCards.map(c => ({
        deckId: mergedDeck.id,
        front: c.front,
        back: c.back,
        tags: c.tags,
        image: c.image,
      })),
    );

    if (deleteOriginals) {
      await db.delete(decksTable).where(inArray(decksTable.id, deckIds));
    }

    if (!mergeIsPro && parentId === null) {
      const mergeKey = mergeUserId ?? (req.ip ?? "unknown");
      await recordDeckCreation(mergeKey);
    }

    res.status(201).json({
      ...mergedDeck,
      cardCount: sourceCards.length,
      createdAt: mergedDeck.createdAt.toISOString(),
      mergedDeckCount: deckIds.length,
      deletedOriginals: deleteOriginals,
    });
  } catch (err) {
    next(err);
  }
});

router.delete("/decks/:id", async (req, res, next): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = DeleteDeckParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const deleteUserId = getRequestUserId(req);
  try {
    const [target] = await db.select({ userId: decksTable.userId }).from(decksTable).where(eq(decksTable.id, params.data.id));
    if (!target || !ownsResource(target.userId ?? null, deleteUserId)) {
      res.status(404).json({ error: "Deck not found" });
      return;
    }

    const allDecks = await db.select({ id: decksTable.id, parentId: decksTable.parentId }).from(decksTable);

    function collectDescendants(parentId: number): number[] {
      const direct = allDecks.filter(d => d.parentId === parentId).map(d => d.id);
      return [...direct, ...direct.flatMap(collectDescendants)];
    }

    const idsToDelete = [params.data.id, ...collectDescendants(params.data.id)];

    const deleted = await db
      .delete(decksTable)
      .where(inArray(decksTable.id, idsToDelete))
      .returning({ id: decksTable.id });

    if (deleted.length === 0) {
      res.status(404).json({ error: "Deck not found" });
      return;
    }

    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
});

router.get("/decks/:id/cards", async (req, res, next): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = ListDeckCardsParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  try {
    const deckId = params.data.id;
    const allDecks = await db.select().from(decksTable);

    function collectDescendantIds(parentId: number): number[] {
      const children = allDecks.filter(d => d.parentId === parentId);
      return [...children.map(d => d.id), ...children.flatMap(d => collectDescendantIds(d.id))];
    }

    const descendantIds = collectDescendantIds(deckId);
    const allDeckIds = [deckId, ...descendantIds];

    const cards = await db
      .select()
      .from(cardsTable)
      .where(inArray(cardsTable.deckId, allDeckIds))
      .orderBy(sql`${cardsTable.pageNumber} ASC NULLS LAST`, cardsTable.createdAt);

    res.json(cards.map(serializeCard));
  } catch (err) {
    next(err);
  }
});

router.get("/decks/:id/export", async (req, res, next): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = ExportDeckParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  try {
    const [deck] = await db
      .select()
      .from(decksTable)
      .where(eq(decksTable.id, params.data.id));

    if (!deck) {
      res.status(404).json({ error: "Deck not found" });
      return;
    }

    const cards = await db
      .select()
      .from(cardsTable)
      .where(eq(cardsTable.deckId, params.data.id))
      .orderBy(sql`${cardsTable.pageNumber} ASC NULLS LAST`, cardsTable.createdAt);

    const rows = cards.map(c => {
      const front = c.front.replace(/\t/g, " ").replace(/\n/g, "<br>");
      const back = c.back.replace(/\t/g, " ").replace(/\n/g, "<br>");
      const tags = c.tags ? c.tags.replace(/\t/g, " ") : "";
      return tags ? `${front}\t${back}\t${tags}` : `${front}\t${back}`;
    });

    res.json({ deckName: deck.name, csv: rows.join("\n"), cardCount: cards.length });
  } catch (err) {
    next(err);
  }
});

export default router;
