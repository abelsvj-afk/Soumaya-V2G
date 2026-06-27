import { Router } from "express";
import { z } from "zod";
import type { AppContext } from "../../context.js";
import { findConstellations } from "../../ml/cluster.js";
import { NodesRepo } from "../../repositories/nodes.repo.js";
import { EdgesRepo } from "../../repositories/edges.repo.js";
import { GraphService } from "../../graph/service.js";
import { spaceOf } from "../middleware.js";

const PromoteBody = z.object({
  name: z.string().trim().min(1).max(60),
  nodeIds: z.array(z.number().int().positive()).min(2).max(64),
});

export function constellationRoutes(ctx: AppContext): Router {
  const r = Router();

  // GET /api/constellations -> ML (k-means) groupings of memories. Free, no LLM.
  r.get("/", (_req, res) => {
    res.json(findConstellations(ctx.handle, {}, spaceOf(res)));
  });

  /**
   * POST /api/constellations/promote { name, nodeIds }
   * Promote a detected cluster into a persistent "constellation" hub node (a Map
   * of Content): a `moc` node that summarizes + links its members. Human-curated
   * (the user names it). Offline-safe — the summary falls back to a heuristic line
   * when no LLM key is present. Fully space-scoped.
   */
  r.post("/promote", async (req, res) => {
    const parsed = PromoteBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Body must be { name: string, nodeIds: number[≥2] }" });
      return;
    }
    const spaceId = spaceOf(res);
    const nodesRepo = new NodesRepo(ctx.handle, spaceId);
    // Only real memories in THIS brain may be members (drops cross-space / hub ids).
    const members = nodesRepo
      .byIds(parsed.data.nodeIds)
      .filter((n) => n.kind !== "action" && n.kind !== "moc");
    if (members.length < 2) {
      res.status(400).json({ error: "Need at least 2 valid member memories" });
      return;
    }

    // Curated summary — the "summary of a body of work". Heuristic offline.
    let summary: string;
    try {
      summary = await ctx.llm.summarizeSector(
        members.map((m) => ({ label: m.label, content: m.content })),
      );
    } catch {
      summary = `Consolidates ${members.length} memories: ${members
        .slice(0, 5)
        .map((m) => m.label)
        .join(", ")}.`;
    }

    const vec = await ctx.embeddings.embed(`${parsed.data.name}. ${summary}`);
    const hub = nodesRepo.create(
      {
        label: parsed.data.name,
        type: "moc",
        kind: "moc",
        content: summary,
        importance: 0.7, // hubs are weighty by nature → renders large
        color: "#ffe9a8", // starlight gold so a constellation reads as special
        origin: "agent", // Soumaya authored this hub's summary
      },
      vec,
    );

    const edgesRepo = new EdgesRepo(ctx.handle, spaceId);
    for (const m of members) {
      if (!edgesRepo.exists(hub.id, m.id)) {
        edgesRepo.create({ source: hub.id, target: m.id, relationship: "summarizes", weight: 0.9 });
      }
    }

    const enriched = new GraphService(ctx.handle, spaceId).getNode(hub.id);
    res.json({ ...enriched, summary, memberCount: members.length });
  });

  return r;
}
