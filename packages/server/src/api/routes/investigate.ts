import { Router } from "express";
import { z } from "zod";
import type { AppContext } from "../../context.js";
import { spaceOf } from "../middleware.js";
import { runInvestigation } from "../../analysis/investigator.js";

/**
 * Investigator route (docs/INVESTIGATOR_RESEARCH.md). Runs the internal, cited deep-dive over a
 * memory FIRST — surfacing the connected memories + the research TYPE — so Research (typed) can
 * then work the findings. Deterministic + offline; space-scoped.
 */
export function investigateRoutes(ctx: AppContext): Router {
  const r = Router();
  const Body = z.object({ nodeId: z.number().int().positive() }).strict();

  r.post("/", (req, res) => {
    const p = Body.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: "Body must be { nodeId }", issues: p.error.issues });
    const report = runInvestigation(ctx.handle, spaceOf(res), p.data.nodeId);
    return report ? res.json(report) : res.status(404).json({ error: "Memory not found" });
  });

  return r;
}
