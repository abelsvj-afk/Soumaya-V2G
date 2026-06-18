import { Router } from "express";
import { z } from "zod";
import type { AppContext } from "../../context.js";
import { spaceOf } from "../middleware.js";
import { UserPersonaRepo } from "../../repositories/knowledge.repo.js";

const Body = z.object({ body: z.string().max(8000) });

/** "About Me" — the persistent user persona Soumaya is always aware of. Space-scoped. */
export function personaRoutes(ctx: AppContext): Router {
  const r = Router();

  r.get("/", (req, res) => {
    res.json({ body: new UserPersonaRepo(ctx.handle, spaceOf(res)).get() ?? "" });
  });

  r.put("/", (req, res) => {
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Body must be { body: string }" });
      return;
    }
    new UserPersonaRepo(ctx.handle, spaceOf(res)).set(parsed.data.body);
    res.json({ ok: true });
  });

  return r;
}
