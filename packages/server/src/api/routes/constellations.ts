import { Router } from "express";
import { z } from "zod";
import type { AppContext } from "../../context.js";
import { findConstellations } from "../../ml/cluster.js";
import { promoteConstellation } from "../../analysis/constellations.js";
import { spaceOf } from "../middleware.js";

const PromoteBody = z.object({
  name: z.string().trim().min(1).max(60),
  nodeIds: z.array(z.number().int().positive()).min(2).max(64),
});

export function constellationRoutes(ctx: AppContext): Router {
  const r = Router();

  // GET /api/constellations -> ML (k-means) groupings of memories. Free, no LLM.
  r.get("/", (_req, res) => {
    res.json(findConstellations(ctx.handle, {}, spaceOf(res)));
  });

  /**
   * POST /api/constellations/promote { name, nodeIds }
   * Promote a detected cluster into a persistent "constellation" hub node (a Map
   * of Content): a `moc` node that summarizes + links its members. Human-curated
   * (the user names it). Offline-safe — the summary falls back to a heuristic line
   * when no LLM key is present. Fully space-scoped.
   */
  r.post("/promote", async (req, res) => {
    const parsed = PromoteBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Body must be { name: string, nodeIds: number[≥2] }" });
      return;
    }
    const spaceId = spaceOf(res);
    const hub = await promoteConstellation(ctx, spaceId, parsed.data.name, parsed.data.nodeIds);
    if (!hub) {
      res.status(400).json({ error: "Need at least 2 valid member memories" });
      return;
    }
    res.json({ ...hub, summary: hub.content, memberCount: (hub.memberCount ?? 0) });
  });

  return r;
}
