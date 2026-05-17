import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import helmet from "helmet";
import compression from "compression";
import path from "path";
import router from "./routes";
import { logger } from "./lib/logger";
import { requestContextMiddleware } from "./lib/request-context";
import { requestLogMiddleware } from "./middlewares/requestLogMiddleware";
import { globalErrorHandler } from "./lib/error-handler";
import { WebhookHandlers } from "./webhookHandlers";
import internalAdminRouter from "./routes/internal-admin";
import { getConfig } from "./config";

const app: Express = express();

// Trust the first proxy (Render, Nginx) so req.ip is the real client IP
app.set("trust proxy", 1);

// ─── CORS Configuration ───────────────────────────────────────────────────────
// Allow ONLY the public frontend and admin frontend origins.
// Reject all other origins.

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

// ─── Static file serving ──────────────────────────────────────────────────────
// Serve public frontend static files at /
const publicDir = path.resolve(__dirname, "../../public");
app.use(express.static(publicDir, {
  etag: true,
  lastModified: true,
  maxAge: "1d",
  index: false,
}));

// Serve admin frontend static files at /admin
const adminDir = path.resolve(__dirname, "../../admin");
app.use("/admin", express.static(adminDir, {
  etag: true,
  lastModified: true,
  maxAge: "0",
  index: false,
  setHeaders(res) {
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  },
}));

// ─── SPA fallback routes ──────────────────────────────────────────────────────
// Admin SPA — /admin/* → /admin/index.html (must be before public fallback)
app.get("/admin/*", (_req: Request, res: Response) => {
  res.sendFile(path.join(adminDir, "index.html"));
});

// Public SPA — all remaining routes → /index.html
app.get("*", (_req: Request, res: Response) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

// Global error handler — must be last
app.use(globalErrorHandler);

export default app;
