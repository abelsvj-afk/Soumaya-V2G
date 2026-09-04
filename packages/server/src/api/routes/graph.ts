import { Router } from "express";
import type { GalaxyEntityKind } from "@brain/shared";
import type { AppContext } from "../../context.js";
import { GraphService } from "../../graph/service.js";
import { resolveGalaxyEntity, navigationIntentFor } from "../../analysis/galaxyEntity.js";
import { spaceOf } from "../middleware.js";

const GALAXY_ENTITY_KINDS: readonly GalaxyEntityKind[] = ["node", "journey", "bill", "goal"];

export function graphRoutes(ctx: AppContext): Router {
  const r = Router();
  // GET /api/graph?limit=300  -> bounded overview (react-force-graph-3d shape)
  r.get("/", (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit ?? 300) || 300, 1), 5000);
    res.json(new GraphService(ctx.handle, spaceOf(res)).overview(limit));
  });
  // GET /api/graph/entity/:kind/:id -> GalaxyEntityDescriptor (Maya Intelligence Part I3:
  // "what's that star?"). One bounded, deterministic lookup per Galaxy body kind — no
  // embeddings/LLM call, so this is safe to hit on every click.
  r.get("/entity/:kind/:id", (req, res) => {
    const kind = req.params.kind as GalaxyEntityKind;
    const id = Number(req.params.id);
    if (!GALAXY_ENTITY_KINDS.includes(kind) || !Number.isFinite(id)) {
      return res.status(400).json({ error: "invalid kind or id" });
    }
    const descriptor = resolveGalaxyEntity(ctx.handle, spaceOf(res), kind, id);
    if (!descriptor) return res.status(404).json({ error: "not found" });
    res.json({ descriptor, navigation: navigationIntentFor(descriptor) });
  });
  return r;
}
