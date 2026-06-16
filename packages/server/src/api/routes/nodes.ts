import { Router } from "express";
import { z } from "zod";
import type { AppContext } from "../../context.js";

// importance: 0..1 to set manually, or null to reset to the auto (heuristic) weight.
const PatchBody = z.object({ importance: z.number().min(0).max(1).nullable() });

export function nodesRoutes(ctx: AppContext): Router {
  const r = Router();

  // PATCH /api/nodes/:id  { importance: number|null } -> adjust gravitational weight
  r.patch("/:id", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const parsed = PatchBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Body must be { importance: number 0..1 | null }" });
      return;
    }
    const node = ctx.graph.setImportance(id, parsed.data.importance);
    if (!node) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(node);
  });

  // DELETE /api/nodes/:id -> remove a memory and everything attached to it
  r.delete("/:id", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const ok = ctx.graph.deleteNode(id);
    if (!ok) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json({ ok: true, id });
  });

  // GET /api/nodes/:id -> node detail
  r.get("/:id", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const node = ctx.graph.getNode(id);
    if (!node) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(node);
  });

  // GET /api/nodes/:id/neighbors?depth=2 -> multi-hop neighborhood subgraph
  r.get("/:id/neighbors", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const depth = Math.min(Math.max(Number(req.query.depth ?? 2) || 2, 1), 5);
    res.json(ctx.graph.neighborhood(id, depth));
  });

  return r;
}
