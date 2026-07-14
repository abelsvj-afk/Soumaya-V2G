import { Router } from "express";
import { z } from "zod";
import type { AppContext } from "../../context.js";
import { spaceOf } from "../middleware.js";
import { JourneysRepo } from "../../repositories/journeys.repo.js";

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

  r.get("/", (_req, res) => res.json(repo(res).list()));

  r.post("/", (req, res) => {
    const p = CreateBody.safeParse(req.body);
    if (!p.success) return bad(res, "Invalid journey", p.error.issues);
    res.json(repo(res).create(p.data));
  });

  r.get("/:id", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return bad(res, "Invalid id");
    const j = repo(res).get(id);
    return j ? res.json({ ...j, links: repo(res).links(id) }) : res.status(404).json({ error: "Not found" });
  });

  r.patch("/:id", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return bad(res, "Invalid id");
    const p = PatchBody.safeParse(req.body);
    if (!p.success) return bad(res, "Invalid patch", p.error.issues);
    const j = repo(res).update(id, p.data);
    return j ? res.json(j) : res.status(404).json({ error: "Not found" });
  });

  r.delete("/:id", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return bad(res, "Invalid id");
    return repo(res).remove(id) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
  });

  // Attach / detach any object.
  r.post("/:id/link", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return bad(res, "Invalid id");
    const p = LinkBody.safeParse(req.body);
    if (!p.success) return bad(res, "Body must be { kind, refId }", p.error.issues);
    const link = repo(res).link(id, p.data.kind, p.data.refId);
    return link ? res.json(link) : res.status(404).json({ error: "Journey not found" });
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

  return r;
}
