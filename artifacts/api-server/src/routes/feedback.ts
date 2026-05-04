import { Router, type IRouter } from "express";
import { db, feedbackTable } from "@workspace/db";
import { desc } from "drizzle-orm";

const router: IRouter = Router();

router.post("/feedback", async (req, res): Promise<void> => {
  const { type, rating, message, email, userId, page } = req.body as {
    type?: string;
    rating?: number;
    message?: string;
    email?: string;
    userId?: string;
    page?: string;
  };

  if (!message || String(message).trim().length === 0) {
    res.status(400).json({ error: "message is required" });
    return;
  }

  const validTypes = ["bug", "suggestion", "compliment", "general"];
  const safeType = validTypes.includes(String(type)) ? String(type) : "general";
  const safeRating = typeof rating === "number" && rating >= 1 && rating <= 5
    ? Math.round(rating)
    : null;

  const [entry] = await db
    .insert(feedbackTable)
    .values({
      type: safeType,
      rating: safeRating ?? undefined,
      message: String(message).trim().slice(0, 4000),
      email: email ? String(email).trim().slice(0, 320) : null,
      userId: userId ? String(userId).trim().slice(0, 256) : null,
      page: page ? String(page).trim().slice(0, 512) : null,
    })
    .returning();

  res.status(201).json(entry);
});

router.get("/feedback", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(feedbackTable)
    .orderBy(desc(feedbackTable.createdAt))
    .limit(200);
  res.json(rows);
});

export default router;
