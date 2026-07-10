import { Router } from "express";
import { z } from "zod";
import type { AppContext } from "../../context.js";
import { dueForReview, gradeReview, memoryStrength } from "../../analysis/review.js";
import { spaceOf } from "../middleware.js";

const gradeSchema = z.object({ remembered: z.boolean() });

/** Spaced-repetition review (NEURO_ALIGNMENT #1): list what's due, grade a recall. */
export function reviewRoutes(ctx: AppContext): Router {
  const r = Router();

  // GET /api/review/due -> memories due for recall, with current strength.
  r.get("/due", (_req, res) => {
    const now = Date.now();
    const due = dueForReview(ctx, spaceOf(res), now, 20).map((m) => ({
      id: m.id,
      label: m.label,
      strength: Math.round(memoryStrength(m, now) * 100) / 100,
      reviewCount: m.review_count,
    }));
    res.json(due);
  });

  // POST /api/review/:id { remembered } -> grade a recall attempt, reschedule (SM-2).
  r.post("/:id", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "bad id" });
    const parsed = gradeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
    const next = gradeReview(ctx, spaceOf(res), id, parsed.data.remembered, Date.now());
    if (next === null) return res.status(404).json({ error: "not found" });
    res.json({ ok: true, nextReviewAt: next });
  });

  return r;
}
