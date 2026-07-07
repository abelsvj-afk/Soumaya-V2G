import { Router } from "express";
import type { AppContext } from "../../context.js";
import { suggestPeople } from "../../analysis/people.js";
import { spaceOf } from "../middleware.js";

/** People layer: surface people you mention a lot but haven't added as entities. */
export function peopleRoutes(ctx: AppContext): Router {
  const r = Router();

  // GET /api/people/suggestions -> [{ name, count }] recurring, un-added names.
  r.get("/suggestions", (_req, res) => {
    res.json(suggestPeople(ctx, spaceOf(res)));
  });

  return r;
}
