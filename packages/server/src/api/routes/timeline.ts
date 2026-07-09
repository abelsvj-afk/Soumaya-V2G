import { Router } from "express";
import { z } from "zod";
import type { AppContext } from "../../context.js";
import { listChapters, createManualChapter, deleteChapter } from "../../analysis/timeline.js";
import { spaceOf } from "../middleware.js";

const createSchema = z.object({ title: z.string().max(120).optional() });

/** The Chronicle — the 3D flowing-river life timeline (docs/TIMELINE_DESIGN.md). */
export function timelineRoutes(ctx: AppContext): Router {
  const r = Router();

  // GET /api/timeline -> TimelineChapter[] (oldest → newest).
  r.get("/", (_req, res) => {
    res.json(listChapters(ctx, spaceOf(res)));
  });

  // POST /api/timeline { title? } -> mark a chapter now (manual).
  r.post("/", (req, res) => {
    const parsed = createSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
    res.json(createManualChapter(ctx, spaceOf(res), { title: parsed.data.title }));
  });

  // DELETE /api/timeline/:id -> remove a chapter.
  r.delete("/:id", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "bad id" });
    res.json({ ok: deleteChapter(ctx, spaceOf(res), id) });
  });

  return r;
}
