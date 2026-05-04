import { Router, type IRouter, type Request } from "express";
import { eq, sql, inArray, asc, isNull, and } from "drizzle-orm";
import { db, qbanksTable, questionsTable } from "@workspace/db";
import { getEffectiveIsPro, sendLimitError } from "../lib/free-tier-limits";

const router: IRouter = Router();

function getRequestUserId(req: Request): string | null {
  return req.isAuthenticated() ? req.user!.id : null;
}

function qbankOwnerFilter(userId: string | null) {
  return userId ? eq(qbanksTable.userId, userId) : isNull(qbanksTable.userId);
}

function ownsResource(resourceUserId: string | null, requestUserId: string | null): boolean {
  return resourceUserId === requestUserId;
}

router.get("/qbanks", async (req, res, next): Promise<void> => {
  const userId = getRequestUserId(req);
  try {
    const qbanks = await db
      .select({
        id: qbanksTable.id,
        name: qbanksTable.name,
        description: qbanksTable.description,
        parentId: qbanksTable.parentId,
        createdAt: qbanksTable.createdAt,
        questionCount: sql<number>`cast(count(${questionsTable.id}) as int)`,
      })
      .from(qbanksTable)
      .leftJoin(questionsTable, eq(questionsTable.qbankId, qbanksTable.id))
      .where(qbankOwnerFilter(userId))
      .groupBy(qbanksTable.id)
      .orderBy(qbanksTable.createdAt);

    res.json(qbanks.map(q => ({ ...q, createdAt: q.createdAt.toISOString() })));
  } catch (err) {
    next(err);
  }
});

router.post("/qbanks", async (req, res, next): Promise<void> => {
  const body = req.body as { name?: unknown; description?: unknown; parentId?: unknown };
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) { res.status(400).json({ error: "name is required" }); return; }

  const userId = req.isAuthenticated() ? req.user!.id : null;
  const isPro = await getEffectiveIsPro(req, userId);
  if (!isPro) {
    sendLimitError(res, "qbank", "QBank generation is a Pro feature. Upgrade to Pro to unlock question banks.");
    return;
  }

  try {
    const [qbank] = await db
      .insert(qbanksTable)
      .values({
        name,
        description: typeof body.description === "string" ? body.description : null,
        parentId: typeof body.parentId === "number" ? body.parentId : null,
        userId,
      })
      .returning();
    res.status(201).json({ ...qbank, questionCount: 0, createdAt: qbank.createdAt.toISOString() });
  } catch (err) {
    next(err);
  }
});

router.get("/qbanks/:id", async (req, res, next): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const userId = getRequestUserId(req);
  try {
    const [row] = await db
      .select({
        id: qbanksTable.id,
        name: qbanksTable.name,
        description: qbanksTable.description,
        parentId: qbanksTable.parentId,
        userId: qbanksTable.userId,
        createdAt: qbanksTable.createdAt,
        questionCount: sql<number>`cast(count(${questionsTable.id}) as int)`,
      })
      .from(qbanksTable)
      .leftJoin(questionsTable, eq(questionsTable.qbankId, qbanksTable.id))
      .where(eq(qbanksTable.id, id))
      .groupBy(qbanksTable.id);

    if (!row || !ownsResource(row.userId ?? null, userId)) { res.status(404).json({ error: "QBank not found" }); return; }

    const subQbanks = await db
      .select({
        id: qbanksTable.id,
        name: qbanksTable.name,
        description: qbanksTable.description,
        parentId: qbanksTable.parentId,
        createdAt: qbanksTable.createdAt,
        questionCount: sql<number>`cast(count(${questionsTable.id}) as int)`,
      })
      .from(qbanksTable)
      .leftJoin(questionsTable, eq(questionsTable.qbankId, qbanksTable.id))
      .where(and(eq(qbanksTable.parentId, id), qbankOwnerFilter(userId)))
      .groupBy(qbanksTable.id)
      .orderBy(asc(qbanksTable.name));

    res.json({
      ...row,
      createdAt: row.createdAt.toISOString(),
      subQbanks: subQbanks.map(s => ({ ...s, createdAt: s.createdAt.toISOString() })),
    });
  } catch (err) {
    next(err);
  }
});

router.patch("/qbanks/:id", async (req, res, next): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const body = req.body as { name?: unknown; description?: unknown; parentId?: unknown };
  const updates: Partial<typeof qbanksTable.$inferInsert> & { updatedAt?: Date } = { updatedAt: new Date() };
  if (typeof body.name === "string") updates.name = body.name.trim();
  if ("description" in body) updates.description = typeof body.description === "string" ? body.description : undefined;
  if ("parentId" in body) updates.parentId = typeof body.parentId === "number" ? body.parentId : undefined;

  if (Object.keys(updates).length <= 1) { res.status(400).json({ error: "No fields to update" }); return; }

  const patchUserId = getRequestUserId(req);
  try {
    const [existing] = await db.select({ userId: qbanksTable.userId }).from(qbanksTable).where(eq(qbanksTable.id, id));
    if (!existing || !ownsResource(existing.userId ?? null, patchUserId)) { res.status(404).json({ error: "QBank not found" }); return; }

    const [updated] = await db.update(qbanksTable).set(updates).where(and(eq(qbanksTable.id, id), qbankOwnerFilter(patchUserId))).returning();
    if (!updated) { res.status(404).json({ error: "QBank not found" }); return; }

    const [row] = await db
      .select({
        id: qbanksTable.id,
        name: qbanksTable.name,
        description: qbanksTable.description,
        parentId: qbanksTable.parentId,
        createdAt: qbanksTable.createdAt,
        questionCount: sql<number>`cast(count(${questionsTable.id}) as int)`,
      })
      .from(qbanksTable)
      .leftJoin(questionsTable, eq(questionsTable.qbankId, qbanksTable.id))
      .where(eq(qbanksTable.id, id))
      .groupBy(qbanksTable.id);

    res.json({ ...row!, createdAt: row!.createdAt.toISOString() });
  } catch (err) {
    next(err);
  }
});

router.delete("/qbanks/:id", async (req, res, next): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const deleteUserId = getRequestUserId(req);
  try {
    const [target] = await db.select({ userId: qbanksTable.userId }).from(qbanksTable).where(eq(qbanksTable.id, id));
    if (!target || !ownsResource(target.userId ?? null, deleteUserId)) { res.status(404).json({ error: "QBank not found" }); return; }

    const allQbanks = await db.select({ id: qbanksTable.id, parentId: qbanksTable.parentId }).from(qbanksTable);

    function collectDescendants(pid: number): number[] {
      const direct = allQbanks.filter(q => q.parentId === pid).map(q => q.id);
      return [...direct, ...direct.flatMap(collectDescendants)];
    }

    const idsToDelete = [id, ...collectDescendants(id)];
    const deleted = await db.delete(qbanksTable).where(inArray(qbanksTable.id, idsToDelete)).returning({ id: qbanksTable.id });

    if (deleted.length === 0) { res.status(404).json({ error: "QBank not found" }); return; }
    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
});

router.get("/qbanks/:id/questions", async (req, res, next): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  try {
    const allQbanks = await db.select().from(qbanksTable);

    function collectDescendantIds(pid: number): number[] {
      const children = allQbanks.filter(q => q.parentId === pid);
      return [...children.map(q => q.id), ...children.flatMap(q => collectDescendantIds(q.id))];
    }

    const allIds = [id, ...collectDescendantIds(id)];
    const questions = await db
      .select()
      .from(questionsTable)
      .where(inArray(questionsTable.qbankId, allIds))
      .orderBy(sql`${questionsTable.pageNumber} ASC NULLS LAST`, questionsTable.createdAt);

    res.json(questions.map(q => ({
      ...q,
      choices: q.choices ? JSON.parse(q.choices) : null,
      createdAt: q.createdAt.toISOString(),
      updatedAt: q.updatedAt.toISOString(),
    })));
  } catch (err) {
    next(err);
  }
});

router.patch("/questions/:id", async (req, res, next): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const body = req.body as { front?: unknown; back?: unknown; tags?: unknown };
  const updates: Partial<typeof questionsTable.$inferInsert> & { updatedAt?: Date } = { updatedAt: new Date() };
  if (typeof body.front === "string") updates.front = body.front;
  if (typeof body.back === "string") updates.back = body.back;
  if ("tags" in body) updates.tags = typeof body.tags === "string" ? body.tags : undefined;

  if (Object.keys(updates).length <= 1) { res.status(400).json({ error: "No fields to update" }); return; }

  try {
    const [updated] = await db.update(questionsTable).set(updates).where(eq(questionsTable.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Question not found" }); return; }

    res.json({
      ...updated,
      choices: updated.choices ? JSON.parse(updated.choices) : null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

router.delete("/questions/:id", async (req, res, next): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  try {
    const [deleted] = await db.delete(questionsTable).where(eq(questionsTable.id, id)).returning();
    if (!deleted) { res.status(404).json({ error: "Question not found" }); return; }
    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
});

export default router;
