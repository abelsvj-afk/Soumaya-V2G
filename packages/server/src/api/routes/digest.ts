import { Router } from "express";
import type { AppContext } from "../../context.js";
import { InsightsRepo } from "../../repositories/insights.repo.js";
import { runSynthesis, DEFAULT_SYNTHESIS } from "../../synthesis/engine.js";
import { buildDailyDigest } from "../../synthesis/dailyDigest.js";
import { spaceOf } from "../middleware.js";

export function digestRoutes(ctx: AppContext): Router {
  const r = Router();

  // GET /api/digest -> recent synthesized insights
  r.get("/", (_req, res) => {
    res.json(new InsightsRepo(ctx.handle, spaceOf(res)).recent());
  });

  // GET /api/digest/daily -> Soumaya's daily digest (free, no LLM call)
  r.get("/daily", (_req, res) => {
    res.json(buildDailyDigest(ctx.handle, spaceOf(res)));
  });

  // POST /api/digest/run -> scan for latent connections and synthesize new insights
  r.post("/run", async (_req, res) => {
    const created = await runSynthesis(ctx.handle, ctx.llm, DEFAULT_SYNTHESIS, spaceOf(res));
    res.json(created);
  });

  return r;
}
