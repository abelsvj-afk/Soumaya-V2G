import { Router } from "express";
import { z } from "zod";
import { COGNITIVE_KINDS } from "@brain/shared";
import type { AppContext } from "../../context.js";
import { createCognitive, listCognitive, setCognitiveProgress, updateCognitive } from "../../analysis/cognitive.js";
import { GraphService } from "../../graph/service.js";
import { spaceOf } from "../middleware.js";

const CreateBody = z.object({
  kind: z.enum(COGNITIVE_KINDS as [string, ...string[]]),
  label: z.string().min(1).max(200),
  content: z.string().max(4000).optional(),
});
const ProgressBody = z.object({ value: z.number().min(0).max(1) });
const EditBody = z
  .object({ label: z.string().min(1).max(200).optional(), content: z.string().max(4000).optional() })
  .refine((b) => b.label !== undefined || b.content !== undefined, {
    message: "Provide label and/or content",
  });

/** The cognitive layer: create/list/track goals, ideas, skills, identity, etc. */
export function cognitiveRoutes(ctx: AppContext): Router {
  const r = Router();

  // GET /api/cognitive?kind=goal -> cognitive objects (all, or one kind).
  r.get("/", (req, res) => {
    const kind = typeof req.query.kind === "string" && (COGNITIVE_KINDS as string[]).includes(req.query.kind)
      ? (req.query.kind as never)
      : undefined;
    res.json(listCognitive(ctx, spaceOf(res), kind));
  });

  // POST /api/cognitive { kind, label, content? } -> create one.
  r.post("/", async (req, res) => {
    const parsed = CreateBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Body must be { kind, label, content? }", issues: parsed.error.issues });
      return;
    }
    const spaceId = spaceOf(res);
    const id = await createCognitive(ctx, spaceId, parsed.data.kind as never, parsed.data.label, parsed.data.content ?? "");
    res.json(new GraphService(ctx.handle, spaceId).getNode(id));
  });

  // PATCH /api/cognitive/:id { label?, content? } -> edit + re-embed + re-link.
  r.patch("/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const parsed = EditBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Body must be { label?, content? }", issues: parsed.error.issues });
      return;
    }
    const spaceId = spaceOf(res);
    const ok = await updateCognitive(ctx, spaceId, id, parsed.data);
    if (!ok) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(new GraphService(ctx.handle, spaceId).getNode(id));
  });

  // POST /api/cognitive/:id/progress { value } -> set 0..1 progress.
  r.post("/:id/progress", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const parsed = ProgressBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Body must be { value: 0..1 }" });
      return;
    }
    const ok = setCognitiveProgress(ctx, spaceOf(res), id, parsed.data.value);
    if (!ok) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json({ ok: true });
  });

  return r;
}
