import { Router, type IRouter, type Request, type Response } from "express";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, userTopicsTable } from "@workspace/db";

const TopicSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  title: z.string().optional(),
  status: z.string().optional(),
  priority: z.string().optional(),
  estimatedMinutes: z.number().nullable().optional(),
});

const GetAllTopicsResponseSchema = z.object({
  topics: z.record(z.array(TopicSchema)),
});

const UpsertTopicsBodySchema = z.object({
  topics: z.array(TopicSchema),
});

const UpsertTopicsResponseSchema = z.object({
  topics: z.array(TopicSchema),
});

const router: IRouter = Router();

router.get("/topics", async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const rows = await db
    .select()
    .from(userTopicsTable)
    .where(eq(userTopicsTable.userId, req.user.id));

  const topics: Record<string, unknown[]> = {};
  for (const row of rows) {
    topics[row.storageKey] = (row.topics as unknown[]) ?? [];
  }

  res.json(GetAllTopicsResponseSchema.parse({ topics }));
});

router.put("/topics/:storageKey", async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const parsed = UpsertTopicsBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const topicsJson = sql`${JSON.stringify(parsed.data.topics)}::jsonb`;

  await db
    .insert(userTopicsTable)
    .values({
      userId: req.user.id,
      storageKey: String(req.params.storageKey),
      topics: topicsJson,
    })
    .onConflictDoUpdate({
      target: [userTopicsTable.userId, userTopicsTable.storageKey],
      set: {
        topics: topicsJson,
        updatedAt: new Date(),
      },
    });

  res.json(UpsertTopicsResponseSchema.parse({ topics: parsed.data.topics }));
});

export default router;