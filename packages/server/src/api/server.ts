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
import { securityHeaders, rateLimit } from "./middleware.js";

/** Assemble the Express app over an AppContext. */
export function createApp(ctx: AppContext): Express {
  const app = express();
  app.set("trust proxy", 1); // behind Fly's proxy — needed for correct req.ip
  app.use(securityHeaders);
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));
  app.use("/api", rateLimit());

  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      embeddings: { model: ctx.embeddings.model, dim: ctx.embeddings.dim },
      llm: {
        model: ctx.llm.model,
        available: ctx.llm.available,
        degraded: ctx.llm.degraded ?? false,
      },
      nodes: ctx.graph.full().nodes.length,
    });
  });

  app.use("/api/ingest", ingestRoutes(ctx));
  app.use("/api/graph", graphRoutes(ctx));
  app.use("/api/nodes", nodesRoutes(ctx));
  app.use("/api/search", searchRoutes(ctx));
  app.use("/api/digest", digestRoutes(ctx));
  app.use("/api/chat", chatRoutes(ctx));
  app.use("/api/maintenance", maintenanceRoutes(ctx));
  app.use("/api/usage", usageRoutes(ctx));
  app.use("/api/constellations", constellationRoutes(ctx));

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
