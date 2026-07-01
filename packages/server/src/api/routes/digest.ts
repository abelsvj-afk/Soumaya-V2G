import { Router } from "express";
import type { AppContext } from "../../context.js";
import { InsightsRepo } from "../../repositories/insights.repo.js";
import { runSynthesis, DEFAULT_SYNTHESIS } from "../../synthesis/engine.js";
import { runContradictionScan, DEFAULT_CONTRADICTION } from "../../synthesis/contradictions.js";
import { buildDailyDigest } from "../../synthesis/dailyDigest.js";
import { buildEmotionalTrajectory } from "../../analysis/emotional.js";
import { buildDormantList } from "../../analysis/dormant.js";
import { buildEvolutionLinks } from "../../analysis/temporalChains.js";
import { buildLifeAreaCounts } from "../../analysis/lifeAreas.js";
import { buildSelfReview } from "../../analysis/selfReview.js";
import { buildAwayDigest, markSeen } from "../../analysis/awayDigest.js";
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

  // GET /api/digest/emotional -> mood-over-time trajectory + detected patterns (free, offline)
  r.get("/emotional", (_req, res) => {
    res.json(buildEmotionalTrajectory(ctx.handle, spaceOf(res)));
  });

  // GET /api/digest/dormant -> dormant skills/goals/projects worth reviving (free, offline)
  r.get("/dormant", (_req, res) => {
    res.json(buildDormantList(ctx.handle, spaceOf(res)));
  });

  // GET /api/digest/evolution -> how a thread of thinking evolved over time (free, offline)
  r.get("/evolution", (_req, res) => {
    res.json(buildEvolutionLinks(ctx.handle, spaceOf(res)));
  });

  // GET /api/digest/life-areas -> distribution of memories across life-areas (free, offline)
  r.get("/life-areas", (_req, res) => {
    res.json(buildLifeAreaCounts(ctx.handle, spaceOf(res)));
  });

  // GET /api/digest/self-review -> Soumaya's read-only coverage self-check (free, offline)
  r.get("/self-review", (_req, res) => {
    res.json(buildSelfReview(ctx.handle, spaceOf(res)));
  });

  // GET /api/digest/away -> "while you were away" digest since last visit (read-only)
  r.get("/away", (_req, res) => {
    res.json(buildAwayDigest(ctx.handle, spaceOf(res)));
  });

  // POST /api/digest/away/seen -> advance the "last visit" window to now
  r.post("/away/seen", (_req, res) => {
    markSeen(ctx.handle, spaceOf(res), new Date().toISOString());
    res.json({ ok: true });
  });

  // POST /api/digest/run -> scan for latent connections and synthesize new insights
  r.post("/run", async (_req, res) => {
    const created = await runSynthesis(ctx.handle, ctx.llm, DEFAULT_SYNTHESIS, spaceOf(res));
    res.json(created);
  });

  // POST /api/digest/contradictions -> scan same-topic memories for conflicts
  // (changed beliefs / reversed goals / shifting identity). Offline-safe.
  r.post("/contradictions", async (_req, res) => {
    const created = await runContradictionScan(ctx.handle, ctx.llm, DEFAULT_CONTRADICTION, spaceOf(res));
    res.json(created);
  });

  return r;
}
