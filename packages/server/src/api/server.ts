import path from "node:path";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import type { AppContext } from "../context.js";
import { ingestRoutes } from "./routes/ingest.js";
import { graphRoutes } from "./routes/graph.js";
import { nodesRoutes } from "./routes/nodes.js";
import { searchRoutes } from "./routes/search.js";
import { digestRoutes } from "./routes/digest.js";
import { chatRoutes } from "./routes/chat.js";
import { maintenanceRoutes } from "./routes/maintenance.js";
import { usageRoutes } from "./routes/usage.js";
import { constellationRoutes } from "./routes/constellations.js";
import { loreRoutes } from "./routes/lore.js";
import { instructionsRoutes } from "./routes/instructions.js";
import { documentsRoutes } from "./routes/documents.js";
import { personaRoutes } from "./routes/persona.js";
import { visitorRoutes } from "./routes/visitors.js";
import { spaceRoutes } from "./routes/space.js";
import { telegramRoutes } from "./routes/telegram.js";
import { securityHeaders, rateLimit, requireSpace } from "./middleware.js";

/** Assemble the Express app over an AppContext. */
export function createApp(ctx: AppContext): Express {
  const app = express();
  app.set("trust proxy", 1); // behind Fly's proxy — needed for correct req.ip
  app.use(securityHeaders);
  app.use(cors());
  // Raised from 1mb to accommodate knowledge-document text uploads (per-route zod
  // `max` bounds each endpoint independently). Env-overridable.
  app.use(express.json({ limit: process.env.JSON_BODY_LIMIT ?? "4mb" }));
  app.use("/api", rateLimit());

  app.get("/api/health", (_req, res) => {
    const total = ctx.handle.sqlite
      .prepare(`SELECT COUNT(*) AS c FROM nodes WHERE deleted_at IS NULL`)
      .get() as { c: number };
    res.json({
      ok: true,
      embeddings: { model: ctx.embeddings.model, dim: ctx.embeddings.dim },
      llm: {
        model: ctx.llm.model,
        available: ctx.llm.available,
        degraded: ctx.llm.degraded ?? false,
      },
      nodes: total.c,
    });
  });

  // Auth (open): log in to or create a private brain.
  app.use("/api/space", spaceRoutes(ctx));

  // Telegram webhook (open — secured by its own secret, resolves the brain itself).
  app.use("/api/telegram", telegramRoutes(ctx));

  // Settings are deployment-wide (shared API key/budget), so they stay open to
  // the authenticated app shell but aren't per-brain.
  app.use("/api/usage", usageRoutes(ctx));

  // Every per-brain data route requires a valid x-space-id (set after login).
  const guard = requireSpace(ctx.handle);
  app.use("/api/ingest", guard, ingestRoutes(ctx));
  app.use("/api/graph", guard, graphRoutes(ctx));
  app.use("/api/nodes", guard, nodesRoutes(ctx));
  app.use("/api/search", guard, searchRoutes(ctx));
  app.use("/api/digest", guard, digestRoutes(ctx));
  app.use("/api/chat", guard, chatRoutes(ctx));
  app.use("/api/maintenance", guard, maintenanceRoutes(ctx));
  app.use("/api/constellations", guard, constellationRoutes(ctx));
  app.use("/api/lore", guard, loreRoutes(ctx));
  app.use("/api/instructions", guard, instructionsRoutes(ctx));
  app.use("/api/documents", guard, documentsRoutes(ctx));
  app.use("/api/persona", guard, personaRoutes(ctx));
  app.use("/api/visitors", guard, visitorRoutes(ctx));

  // In production, serve the built web app (set WEB_DIR to packages/web/dist)
  // and fall back to index.html for client-side routes (non-API GETs).
  const webDir = process.env.WEB_DIR;
  if (webDir) {
    const dir = path.resolve(webDir);
    app.use(express.static(dir));
    app.use((req, res, next) => {
      if (req.method !== "GET" || req.path.startsWith("/api")) return next();
      res.sendFile(path.join(dir, "index.html"));
    });
  }

  // Centralized error handler (Express 5 forwards rejected async handlers here).
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error("[api] error:", err);
    res.status(500).json({ error: (err as Error)?.message ?? "Internal error" });
  });

  return app;
}
