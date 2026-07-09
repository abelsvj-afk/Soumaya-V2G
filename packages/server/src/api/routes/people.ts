import { Router } from "express";
import { z } from "zod";
import type { AppContext } from "../../context.js";
import { suggestPeople, dismissPersonSuggestion } from "../../analysis/people.js";
import { spaceOf } from "../middleware.js";

const dismissSchema = z.object({ name: z.string().min(1).max(120) });

/** People layer: surface people you mention a lot but haven't added as entities. */
export function peopleRoutes(ctx: AppContext): Router {
  const r = Router();

  // GET /api/people/suggestions -> [{ name, count }] recurring, un-added names.
  r.get("/suggestions", (_req, res) => {
    res.json(suggestPeople(ctx, spaceOf(res)));
  });

  // POST /api/people/suggestions/dismiss { name } -> mark a suggestion "not a person".
  r.post("/suggestions/dismiss", (req, res) => {
    const parsed = dismissSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
    dismissPersonSuggestion(ctx, spaceOf(res), parsed.data.name);
    res.json({ ok: true });
  });

  return r;
}
