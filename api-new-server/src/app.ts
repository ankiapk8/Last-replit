import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import helmet from "helmet";
import compression from "compression";
import router from "./routes";
import { logger } from "./lib/logger";
import { requestContextMiddleware } from "./lib/request-context";
import { requestLogMiddleware } from "./middlewares/requestLogMiddleware";
import { globalErrorHandler } from "./lib/error-handler";
import { WebhookHandlers } from "./webhookHandlers";
import internalAdminRouter from "./routes/internal-admin";
import { getConfig } from "./config";

const app: Express = express();

// Trust the first proxy (Render, Railway, Nginx) so req.ip is the real client IP
app.set("trust proxy", 1);

// ─── CORS Configuration ───────────────────────────────────────────────────────
// Allow the public frontend and admin frontend.
// In production, APP_URL and ADMIN_URL point to the deployed domains.

function buildAllowedOrigins(): string[] {
  const origins: string[] = [];
  const appUrl = process.env.APP_URL;
  const adminUrl = process.env.ADMIN_URL;
  if (appUrl) origins.push(appUrl);
  if (adminUrl) origins.push(adminUrl);
  // In development, also allow localhost
  if (process.env.NODE_ENV !== "production") {
    origins.push("http://localhost:5000");
    origins.push("http://localhost:5173");
    origins.push("http://localhost:3001");
    origins.push("http://localhost:5174");
  }
  return origins;
}

const allowedOrigins = buildAllowedOrigins();

const corsOptions: cors.CorsOptions = {
  origin(origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
    // Allow requests with no origin (mobile apps, curl, server-to-server)
    if (!origin) {
      callback(null, true);
      return;
    }
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    logger.warn({ origin, allowedOrigins }, "CORS rejected origin");
    callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "X-Admin-Api-Key",
    "X-Request-Id",
  ],
  exposedHeaders: ["X-Request-Id", "X-RateLimit-Limit", "X-RateLimit-Remaining"],
  maxAge: 86400, // 24 hours
};

app.use(cors(corsOptions));

// ─── Stripe webhook route BEFORE body-parsing middleware (needs raw Buffer) ─────
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
    } catch (err: unknown) {
      logger.error({ err }, "Stripe webhook error");
      res
        .status(400)
        .json({ error: { code: "INTERNAL_ERROR", message: "Webhook processing error" } });
    }
  }
);

app.use(cookieParser());
app.use(pinoHttp({ logger }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(helmet());
app.use(compression());

// Request context (ID + timing) — before routes
app.use(requestContextMiddleware);
app.use(requestLogMiddleware);

// ─── Public API routes ─────────────────────────────────────────────────────────
app.use("/api", router);

// ─── Admin API routes — /api/admin/* ──────────────────────────────────────────
// Uses its own auth middleware (JWT + API key + role + IP)
// Completely separate route tree from public routes
app.use("/api/admin", internalAdminRouter);

// ─── Health check at root (for load balancer) ─────────────────────────────────
app.get("/healthz", (_req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ─── Static frontend serving ──────────────────────────────────────────────────
const staticDir = getConfig().STATIC_DIR;
if (staticDir) {
  const path = await import("path");
  const fs = await import("fs");
  const resolvedStatic = path.resolve(staticDir);
  if (fs.existsSync(resolvedStatic)) {
    logger.info({ staticDir: resolvedStatic }, "Serving static frontend");
    app.use(express.static(resolvedStatic, { index: false }));

    // SPA fallback: serve index.html for non-API, non-file requests
    app.get(/^(?!\/api\/).*$/, (req: Request, res: Response, next: NextFunction) => {
      const reqPath = path.resolve(resolvedStatic, req.path.replace(/^\//, ""));
      if (fs.existsSync(reqPath) && fs.statSync(reqPath).isFile()) {
        next();
        return;
      }
      res.sendFile(path.join(resolvedStatic, "index.html"));
    });
  } else {
    logger.warn({ staticDir: resolvedStatic }, "STATIC_DIR does not exist — skipping static serving");
  }
}

// ─── 404 for unmatched API routes ─────────────────────────────────────────────
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    error: { code: "NOT_FOUND", message: "Endpoint not found" },
  });
});

// Global error handler — must be last
app.use(globalErrorHandler);

export default app;
