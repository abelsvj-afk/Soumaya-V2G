import { Router } from "express";
import { z } from "zod";
import type { AppContext } from "../../context.js";
import { insights } from "../../db/schema.js";
import { GraphService } from "../../graph/service.js";
import { NodesRepo } from "../../repositories/nodes.repo.js";
import { EconomyRepo, EARN_ACTION_DONE } from "../../economy.js";
import { spaceOf } from "../middleware.js";

// importance: 0..1 to set manually, or null to reset to the auto (heuristic) weight.
const PatchBody = z.object({ importance: z.number().min(0).max(1).nullable() });

export function nodesRoutes(ctx: AppContext): Router {
  const r = Router();
  const graphFor = (res: import("express").Response) =>
    new GraphService(ctx.handle, spaceOf(res));

  // POST /api/nodes/:id/tend -> reset a memory's entropy clock (revisiting it).
  // Free + space-scoped; the client calls this when you focus a memory.
  r.post("/:id/tend", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const ok = new NodesRepo(ctx.handle, spaceOf(res)).tend(id);
    res.json({ ok });
  });

  // POST /api/nodes/:id/synthesize -> AI pieces this memory + its connections into
  // a fresh insight (the "connect the dots for me" action).
  r.post("/:id/synthesize", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const spaceId = spaceOf(res);
    const graph = graphFor(res);
    const node = graph.getNode(id);
    if (!node) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    // Gather directly-connected memories (scoped to this brain).
    const rows = ctx.handle.sqlite
      .prepare(
        `SELECT CASE WHEN source = ? THEN target ELSE source END AS nid
         FROM edges WHERE space_id = ? AND (source = ? OR target = ?) LIMIT 8`,
      )
      .all(id, spaceId, id, id) as { nid: number }[];
    const neighbors = rows
      .map((x) => graph.getNode(x.nid))
      .filter((n): n is NonNullable<typeof n> => !!n);

    const cluster = [node, ...neighbors].map((n) => ({ label: n.label, content: n.content }));
    let text: string;
    try {
      text =
        neighbors.length > 0
          ? await ctx.llm.summarizeSector(cluster)
          : (await ctx.llm.research({ label: node.label, content: node.content })).content;
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
      return;
    }

    ctx.handle.db
      .insert(insights)
      .values({ spaceId, nodeA: id, nodeB: neighbors[0]?.id ?? id, text, score: 0.8 })
      .run();
    new NodesRepo(ctx.handle, spaceId).tend(id); // synthesizing tends the memory

    res.json({ text, connected: neighbors.length });
  });

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
    const node = graphFor(res).setImportance(id, parsed.data.importance);
    if (!node) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    new NodesRepo(ctx.handle, spaceOf(res)).tend(id); // editing weight tends it
    res.json(node);
  });

  // DELETE /api/nodes/:id -> remove a memory and everything attached to it
  r.delete("/:id", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const spaceId = spaceOf(res);
    const graph = graphFor(res);
    const existing = graph.getNode(id); // check kind before removing
    const ok = graph.deleteNode(id);
    if (!ok) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    // Clearing a day-to-day action item earns a little fuel (tending the galaxy).
    if (existing?.kind === "action") new EconomyRepo(ctx.handle, spaceId).add(EARN_ACTION_DONE);
    res.json({ ok: true, id });
  });

  // GET /api/nodes/:id -> node detail
  r.get("/:id", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const node = graphFor(res).getNode(id);
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
    res.json(graphFor(res).neighborhood(id, depth));
  });

  return r;
}
