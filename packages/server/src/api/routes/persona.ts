import { Router } from "express";
import type { AppContext } from "../../context.js";
import { spaceOf } from "../middleware.js";
import { refreshPersona } from "../../persona/derive.js";

/**
 * "About Me" — the persistent user persona Soumaya is always aware of. It is NOT
 * user-editable: she derives it herself from everything she knows about you and
 * keeps it current. GET returns the latest (re-deriving if stale); POST /refresh
 * forces a regeneration on demand. Space-scoped.
 */
export function personaRoutes(ctx: AppContext): Router {
  const r = Router();

  r.get("/", (req, res) => {
    res.json({ body: refreshPersona(ctx.handle, spaceOf(res)), auto: true });
  });

  r.post("/refresh", (req, res) => {
    res.json({ body: refreshPersona(ctx.handle, spaceOf(res), true), auto: true });
  });

  return r;
}
