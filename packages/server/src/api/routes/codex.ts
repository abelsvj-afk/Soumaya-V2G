import { Router } from "express";
import type { AppContext } from "../../context.js";
import { CodexDiscoveriesRepo } from "../../repositories/codexDiscoveries.repo.js";
import { spaceOf } from "../middleware.js";

/** Soumaya's autonomously-charted Codex field notes (read-only for the client). */
export function codexRoutes(ctx: AppContext): Router {
  const r = Router();
  // GET /api/codex/discoveries -> the space's agent-charted discoveries.
  r.get("/discoveries", (_req, res) => {
    res.json(new CodexDiscoveriesRepo(ctx.handle, spaceOf(res)).list());
  });
  return r;
}
