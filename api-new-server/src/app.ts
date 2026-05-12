import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import path from "node:path";
import fs from "node:fs";
import helmet from "helmet";
import compression from "compression";
import router from "./routes";
import { logger } from "./lib/logger";
import { requestContextMiddleware } from "./lib/request-context";
import { requestLogMiddleware } from "./middlewares/requestLogMiddleware";
import { globalErrorHandler } from "./lib/error-handler";
import { WebhookHandlers } from "./webhookHandlers";
import internalAdminRouter from "./routes/internal-admin";

const app: Express = express();

// Trust the first proxy (Replit, Render, Nginx) so req.ip is the real client IP
app.set("trust proxy", 1);

// Stripe webhook route BEFORE body-parsing middleware (needs raw Buffer)
app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req: Request, res: Response) => {
    const signature = req.headers["stripe-signature"];
    if (!signature) {
      res
        .status(400)
        .json({ error: { code: "VALIDATION_ERROR", message: "Missing stripe-signature header" } });
      return;
    }
    try {
      const sig = Array.isArray(signature) ? signature[0] : signature;
      await WebhookHandlers.processWebhook(req.body as Buffer, sig);
      res.status(200).json({ received: true });
    } catch (err: any) {
      logger.error({ err }, "Stripe webhook error");
      res
        .status(400)
        .json({ error: { code: "INTERNAL_ERROR", message: "Webhook processing error" } });
    }
  }
);

app.use(cookieParser());
app.use(pinoHttp({ logger }));
app.use(
  cors({
    origin: process.env.APP_URL ?? "http://localhost:5000",
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(helmet());
app.use(compression());

// Request context (ID + timing) — before routes
app.use(requestContextMiddleware);
app.use(requestLogMiddleware);

// ─── Public API routes ───────────────────────────────────────────────────────
app.use("/api", router);

// ─── Internal admin routes — completely separate from /api ───────────────────
// These routes use their own auth middleware (JWT + API key + role + IP)
// They are NOT exposed to the public frontend
app.use("/internal/admin", internalAdminRouter);

// Static frontend serving (public only — no admin pages)
const staticDir = process.env.STATIC_DIR ?? path.resolve(process.cwd(), "public");
if (fs.existsSync(staticDir)) {
  logger.info({ staticDir }, "Serving static frontend");
  app.use(
    express.static(staticDir, {
      index: false,
      maxAge: "1y",
      immutable: true,
      setHeaders: (res, filePath) => {
        if (filePath.endsWith(".html")) {
          res.setHeader("Cache-Control", "no-cache");
        } else {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        }
      },
    })
  );
  // SPA catch-all — only for non-API, non-internal routes
  app.get(/^(?!\/api\/|\/internal\/).*/, (_req: Request, res: Response, next: NextFunction) => {
    const indexPath = path.join(staticDir, "index.html");
    if (!fs.existsSync(indexPath)) {
      next();
      return;
    }
    res.sendFile(indexPath);
  });
}

// Global error handler — must be last
app.use(globalErrorHandler);

export default app;
