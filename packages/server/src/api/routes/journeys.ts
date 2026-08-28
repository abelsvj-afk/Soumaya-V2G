import { Router } from "express";
import { z } from "zod";
import type { AppContext } from "../../context.js";
import { spaceOf } from "../middleware.js";
import { JourneysRepo } from "../../repositories/journeys.repo.js";
import { upsertJourneyEmbedding, deleteJourneyEmbedding } from "../../db/vec.js";
import { suggestJourneys, hydrateJourneyLinks } from "../../analysis/journeyLinking.js";

/**
 * Journeys (Vision 2.0) routes. Thin: validate with zod → delegate to JourneysRepo → json.
 * A Journey is a life chapter; links attach any object to it (we never copy the object).
 * Space-scoped + offline. See docs/VISION_2_JOURNEYS.md.
 */

const LINK_KINDS = ["node", "task", "income", "expense", "bill", "insight", "doc", "chat", "achievement"] as const;

const CreateBody = z.object({
  title: z.string().trim().min(1).max(80),
  description: z.string().max(2000).optional(),
  color: z.string().max(20).optional(),
  icon: z.string().max(8).optional(),
  status: z.enum(["active", "paused", "done"]).optional(),
}).strict();
const PatchBody = z.object({
  title: z.string().trim().min(1).max(80).optional(),
  description: z.string().max(2000).optional(),
  color: z.string().max(20).optional(),
  icon: z.string().max(8).optional(),
  status: z.enum(["active", "paused", "done"]).optional(),
  progress: z.number().min(0).max(1).optional(),
}).strict();
const LinkBody = z.object({ kind: z.enum(LINK_KINDS), refId: z.number().int().positive() }).strict();

const bad = (res: any, msg: string, issues?: unknown) => res.status(400).json({ error: msg, issues });

export function journeysRoutes(ctx: AppContext): Router {
  const r = Router();
  const repo = (res: any) => new JourneysRepo(ctx.handle, spaceOf(res));

  // Vector embeddings live OUTSIDE the repo, same split already established for
  // instruction profiles (instructions.repo.ts's own doc comment: "managed by the
  // route... this repo owns only the relational rows") — fire-and-forget so a
  // Journey always saves even if embedding fails; it just won't be suggestible
  // until the next title/description edit re-embeds it.
  const embed = async (id: number, title: string, description: string) => {
    try {
      const vec = await ctx.embeddings.embed(`${title}. ${description}`);
      upsertJourneyEmbedding(ctx.handle.sqlite, id, vec);
    } catch (err) {
      console.error("[journeys] embed failed:", err);
    }
  };

  r.get("/", (_req, res) => res.json(repo(res).list()));

  r.post("/", async (req, res) => {
    const p = CreateBody.safeParse(req.body);
    if (!p.success) return bad(res, "Invalid journey", p.error.issues);
    const journey = repo(res).create(p.data);
    await embed(journey.id, journey.title, journey.description);
    res.json(journey);
  });

  r.get("/:id", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return bad(res, "Invalid id");
    const j = repo(res).get(id);
    return j ? res.json({ ...j, links: repo(res).links(id) }) : res.status(404).json({ error: "Not found" });
  });

  r.patch("/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return bad(res, "Invalid id");
    const p = PatchBody.safeParse(req.body);
    if (!p.success) return bad(res, "Invalid patch", p.error.issues);
    const j = repo(res).update(id, p.data);
    if (!j) return res.status(404).json({ error: "Not found" });
    if (p.data.title !== undefined || p.data.description !== undefined) {
      await embed(j.id, j.title, j.description);
    }
    res.json(j);
  });

  r.delete("/:id", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return bad(res, "Invalid id");
    const ok = repo(res).remove(id);
    if (ok) deleteJourneyEmbedding(ctx.handle.sqlite, id);
    return ok ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
  });

  // Attach / detach any object.
  r.post("/:id/link", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return bad(res, "Invalid id");
    const p = LinkBody.safeParse(req.body);
    if (!p.success) return bad(res, "Body must be { kind, refId }", p.error.issues);
    const link = repo(res).link(id, p.data.kind, p.data.refId);
    // link() returns null for either an unknown journey or a refId that doesn't exist in
    // this space (see JourneysRepo.refExists) — a single generic message covers both.
    return link ? res.json(link) : res.status(404).json({ error: "Journey or linked item not found" });
  });
  r.post("/:id/unlink", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return bad(res, "Invalid id");
    const p = LinkBody.safeParse(req.body);
    if (!p.success) return bad(res, "Body must be { kind, refId }", p.error.issues);
    return repo(res).unlink(id, p.data.kind, p.data.refId) ? res.json({ ok: true }) : res.status(404).json({ error: "Link not found" });
  });

  // Which journeys an object belongs to (e.g. ?kind=node&refId=42).
  r.get("/for/:kind/:refId", (req, res) => {
    const kind = req.params.kind as (typeof LINK_KINDS)[number];
    const refId = Number(req.params.refId);
    if (!LINK_KINDS.includes(kind) || !Number.isInteger(refId)) return bad(res, "Invalid kind/refId");
    res.json(repo(res).journeysFor(kind, refId));
  });

  // Candidate journeys for a captured/edited object — auto-link (>=0.72 similarity,
  // silent) vs. suggested (0.40-0.72, one tap). Path-param shape matches /for/:kind/:refId
  // above rather than a query string, for consistency with this router's own convention.
  r.get("/suggest/:kind/:refId", (req, res) => {
    const kind = req.params.kind as (typeof LINK_KINDS)[number];
    const refId = Number(req.params.refId);
    if (!LINK_KINDS.includes(kind) || !Number.isInteger(refId)) return bad(res, "Invalid kind/refId");
    res.json(suggestJourneys(ctx, spaceOf(res), kind, refId));
  });

  // Hydrated links for a journey's detail view (label + amount, not just kind/refId).
  r.get("/:id/links", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return bad(res, "Invalid id");
    const spaceId = spaceOf(res);
    if (!repo(res).get(id)) return res.status(404).json({ error: "Not found" });
    res.json(hydrateJourneyLinks(ctx, spaceId, repo(res).links(id).slice(0, 20)));
  });

  return r;
}
