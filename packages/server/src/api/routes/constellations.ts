import { Router } from "express";
import type { AppContext } from "../../context.js";
import { findConstellations } from "../../ml/cluster.js";

export function constellationRoutes(ctx: AppContext): Router {
  const r = Router();

  // GET /api/constellations -> ML (k-means) groupings of memories. Free, no LLM.
  r.get("/", (_req, res) => {
    res.json(findConstellations(ctx.handle));
  });

  return r;
}
