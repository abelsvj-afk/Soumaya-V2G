import { Router } from "express";
import { z } from "zod";
import type { AppContext } from "../../context.js";
import {
  listCandidates,
  countCandidates,
  acceptCandidate,
  dismissCandidate,
  manualLink,
  pruneWeakLinks,
} from "../../analysis/candidates.js";
import { spaceOf } from "../middleware.js";

const LinkBody = z.object({ source: z.number().int(), target: z.number().int() });
const PruneBody = z.object({ maxWeight: z.number().min(0).max(1).optional(), limit: z.number().int().min(1).max(2000).optional() });

/**
 * Suggested Connections — the review queue that keeps YOU in control of linking.
 * Withheld / pruned links wait here; connect or dismiss each, or link two memories
 * yourself. Thin routes: validate → delegate to analysis/candidates → json.
 */
export function candidateRoutes(ctx: AppContext): Router {
  const r = Router();

  // GET /api/candidates -> pending suggestions (strongest first) + the count.
  r.get("/", (_req, res) => {
    const spaceId = spaceOf(res);
    res.json({ candidates: listCandidates(ctx.handle, spaceId), count: countCandidates(ctx.handle, spaceId) });
  });

  // POST /api/candidates/link { source, target } -> connect two memories yourself.
  r.post("/link", (req, res) => {
    const parsed = LinkBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Body must be { source, target }", issues: parsed.error.issues });
      return;
    }
    const pair = manualLink(ctx.handle, spaceOf(res), parsed.data.source, parsed.data.target);
    if (!pair) {
      res.status(400).json({ error: "Invalid pair (unknown memory or same node)" });
      return;
    }
    res.json({ ok: true, pair });
  });

  // POST /api/candidates/prune { maxWeight?, limit? } -> declutter: move the weakest
  // existing links into the review queue (restorable, never destroyed).
  r.post("/prune", (req, res) => {
    const parsed = PruneBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: "Body must be { maxWeight?, limit? }", issues: parsed.error.issues });
      return;
    }
    res.json(pruneWeakLinks(ctx.handle, spaceOf(res), parsed.data));
  });

  // POST /api/candidates/:id/accept -> connect it (creates the edge).
  r.post("/:id/accept", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const pair = acceptCandidate(ctx.handle, spaceOf(res), id);
    if (!pair) {
      res.status(404).json({ error: "Not found or already resolved" });
      return;
    }
    res.json({ ok: true, pair });
  });

  // POST /api/candidates/:id/dismiss -> not a real connection; never suggest it again.
  r.post("/:id/dismiss", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    if (!dismissCandidate(ctx.handle, spaceOf(res), id)) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json({ ok: true });
  });

  return r;
}
