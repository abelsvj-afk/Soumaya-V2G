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

  // Health is unauthenticated — provider status only, no data facts (the global
  // node count spanned every tenant's brain).
  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      embeddings: { model: ctx.embeddings.model, dim: ctx.embeddings.dim },
      llm: {
        model: ctx.llm.model,
        available: ctx.llm.available,
        degraded: ctx.llm.degraded ?? false,
      },
    });
  });

  // Auth (open): log in to or create a private brain. A much tighter limit than
  // the general API one — 4-char passcodes at 120 guesses/min was a brute-force
  // ceiling, and unlimited free creation inflates the autonomy loop's work.
  app.use("/api/space/auth", rateLimit({ max: Number(process.env.AUTH_RATE_LIMIT_MAX ?? 10) }));
  app.use("/api/space", spaceRoutes(ctx));

  // Telegram webhook (open — secured by its own secret, resolves the brain itself).
  app.use("/api/telegram", telegramRoutes(ctx));

  // Every per-brain data route requires a valid x-space-id (set after login).
  const guard = requireSpace(ctx.handle);

  // Usage/budget is deployment-wide (shared API budget). Guarded so it can't be
  // tampered with anonymously; the mutating routes additionally honor ADMIN_TOKEN.
  app.use("/api/usage", guard, usageRoutes(ctx));
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
    // The shell (index.html / sw.js / manifest) must NEVER be cached, or a deploy
    // won't reach an installed PWA. Content-hashed assets (…-AbC123.js/.css) are
    // immutable, so cache them hard. This is what makes new builds actually show up.
    app.use(
      express.static(dir, {
        setHeaders: (res, filePath) => {
          const base = path.basename(filePath);
          if (base === "index.html" || base === "sw.js" || base.endsWith(".webmanifest")) {
            res.setHeader("Cache-Control", "no-cache, must-revalidate");
          } else if (/\.[A-Za-z0-9]{8,}\.(?:js|css)$/.test(base)) {
            res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
          }
        },
      }),
    );
    app.use((req, res, next) => {
      if (req.method !== "GET" || req.path.startsWith("/api")) return next();
      res.setHeader("Cache-Control", "no-cache, must-revalidate"); // SPA shell — always revalidate
      res.sendFile(path.join(dir, "index.html"));
    });
  }

  // Centralized error handler (Express 5 forwards rejected async handlers here).
  // The detail goes to the server log only — raw messages can carry SQL/provider
  // internals that don't belong in a client response.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error("[api] error:", err);
    res.status(500).json({ error: "Internal error" });
  });

  return app;
}
