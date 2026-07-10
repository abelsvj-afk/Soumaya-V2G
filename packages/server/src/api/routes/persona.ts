import { Router } from "express";
import { z } from "zod";
import type { AppContext } from "../../context.js";
import { spaceOf } from "../middleware.js";
import { refreshPersona } from "../../persona/derive.js";
import { getSpaceSoul, setSpaceSoul } from "../../identity.js";

const soulSchema = z.object({ body: z.string().max(8000) });

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

  // Soumaya's SOUL — her deeper character, per-brain editable (feature #5b). Empty = use
  // the shared soul.md. Injected into every chat reply's identity slot.
  r.get("/soul", (_req, res) => {
    res.json({ body: getSpaceSoul(ctx.handle.sqlite, spaceOf(res)) });
  });
  r.put("/soul", (req, res) => {
    const parsed = soulSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
    setSpaceSoul(ctx.handle.sqlite, spaceOf(res), parsed.data.body);
    res.json({ ok: true, body: getSpaceSoul(ctx.handle.sqlite, spaceOf(res)) });
  });

  return r;
}
