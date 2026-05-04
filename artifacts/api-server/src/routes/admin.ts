import { Router, type IRouter, type Request, type Response } from "express";
import { db, usersTable } from "@workspace/db";
import { eq, sql, desc } from "drizzle-orm";
import { logger } from "../lib/logger";

const router: IRouter = Router();

async function requireModerator(req: Request, res: Response): Promise<boolean> {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Authentication required" });
    return false;
  }
  const userId = req.user!.id;
  const rows = await db.execute(
    sql`SELECT role FROM public.users WHERE id = ${userId} LIMIT 1`,
  );
  const role = (rows.rows[0] as { role?: string } | undefined)?.role;
  if (role !== "moderator" && role !== "admin") {
    res.status(403).json({ error: "Moderator access required" });
    return false;
  }
  return true;
}

router.get("/admin/users", async (req: Request, res: Response): Promise<void> => {
  try {
    if (!(await requireModerator(req, res))) return;

    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "50"), 10)));
    const offset = (page - 1) * limit;
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";

    let rows;
    let totalRows;
    if (search) {
      rows = await db.execute(
        sql`
          SELECT id, email, first_name, last_name, profile_image_url,
                 role, manual_pro, stripe_subscription_id, stripe_customer_id,
                 created_at
          FROM public.users
          WHERE email ILIKE ${"%" + search + "%"}
             OR first_name ILIKE ${"%" + search + "%"}
             OR last_name ILIKE ${"%" + search + "%"}
          ORDER BY created_at DESC
          LIMIT ${limit} OFFSET ${offset}
        `,
      );
      totalRows = await db.execute(
        sql`SELECT COUNT(*)::int AS cnt FROM public.users
            WHERE email ILIKE ${"%" + search + "%"}
               OR first_name ILIKE ${"%" + search + "%"}
               OR last_name ILIKE ${"%" + search + "%"}`,
      );
    } else {
      rows = await db.execute(
        sql`
          SELECT id, email, first_name, last_name, profile_image_url,
                 role, manual_pro, stripe_subscription_id, stripe_customer_id,
                 created_at
          FROM public.users
          ORDER BY created_at DESC
          LIMIT ${limit} OFFSET ${offset}
        `,
      );
      totalRows = await db.execute(
        sql`SELECT COUNT(*)::int AS cnt FROM public.users`,
      );
    }

    const total = (totalRows.rows[0] as { cnt?: number } | undefined)?.cnt ?? 0;

    res.json({
      users: rows.rows,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    logger.error({ err }, "Admin: failed to list users");
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

router.patch("/admin/users/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    if (!(await requireModerator(req, res))) return;

    const targetId = req.params.id;
    const { role, manualPro } = req.body as { role?: string; manualPro?: boolean };

    const allowedRoles = ["user", "moderator", "admin"];
    const updates: Record<string, unknown> = { updatedAt: new Date() };

    if (role !== undefined) {
      if (!allowedRoles.includes(role)) {
        res.status(400).json({ error: `role must be one of: ${allowedRoles.join(", ")}` });
        return;
      }
      updates.role = role;
    }

    if (manualPro !== undefined) {
      updates.manualPro = String(Boolean(manualPro));
    }

    if (Object.keys(updates).length === 1) {
      res.status(400).json({ error: "Nothing to update" });
      return;
    }

    await db.update(usersTable)
      .set(updates as any)
      .where(eq(usersTable.id, targetId));

    const [updated] = await db.select().from(usersTable).where(eq(usersTable.id, targetId));
    if (!updated) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    logger.info({ actorId: req.user!.id, targetId, updates }, "Admin: user updated");
    res.json({ user: updated });
  } catch (err) {
    logger.error({ err }, "Admin: failed to update user");
    res.status(500).json({ error: "Failed to update user" });
  }
});

export default router;
