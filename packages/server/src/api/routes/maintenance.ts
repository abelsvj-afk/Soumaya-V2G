import { Router } from "express";
import { z } from "zod";
import type { AppContext } from "../../context.js";
import { findCandidates } from "../../synthesis/engine.js";
import { NodesRepo } from "../../repositories/nodes.repo.js";
import { EdgesRepo } from "../../repositories/edges.repo.js";
import { insights, agentLogs, settings, nodes, edges } from "../../db/schema.js";
import { upsertEmbedding, getEmbedding, knn } from "../../db/vec.js";
import { eq, desc } from "drizzle-orm";

const CompleteJobSchema = z.object({
  type: z.enum(["synthesis", "calibration", "patrol", "pruning", "harmonization", "research", "merging"]),
  targets: z.array(z.number()),
});

export function maintenanceRoutes(ctx: AppContext): Router {
  const r = Router();

  /**
   * GET /api/maintenance/next-job
   * Returns the next "meaningful" task for the Soumaya agent.
   */
  r.get("/next-job", async (req, res) => {
    // 0. Merging: Find high-redundancy nodes (similarity > 0.95)
    // We use a strict threshold to avoid merging distinct but related thoughts.
    const nodesRepo = new NodesRepo(ctx.handle);
    const allNodes = nodesRepo.all();
    
    // Check for redundancy
    for (const node of allNodes) {
      const emb = getEmbedding(ctx.handle.sqlite, node.id);
      if (!emb) continue;
      const hits = knn(ctx.handle.sqlite, emb, 2);
      const redundant = hits.find(h => h.nodeId !== node.id && h.similarity > 0.96);
      
      if (redundant) {
        res.json({
          type: "merging",
          targets: [node.id, redundant.nodeId],
          description: "Memory Fusion: Detecting and consolidating redundant information nodes.",
        });
        return;
      }
    }

    // 1. Research: If enabled, find a node WITH connections that hasn't been researched yet
    const researchEnabled = await ctx.handle.db
      .select()
      .from(settings)
      .where(eq(settings.key, "research_enabled"))
      .get();

    if (researchEnabled?.value === "true") {
      // Strategic Hub Research: Only target nodes with multiple satellites (deg > 1)
      // and significant existing mass (importance > 0.4).
      const target = ctx.handle.sqlite.prepare(`
        SELECT n.id FROM nodes n
        JOIN (
          SELECT node_id, COUNT(*) as deg 
          FROM (SELECT source as node_id FROM edges UNION ALL SELECT target as node_id FROM edges)
          GROUP BY node_id
        ) d ON d.node_id = n.id
        WHERE n.content NOT LIKE '%--- Research Deep Dive ---%'
        AND d.deg > 1
        AND n.importance >= 0.4
        ORDER BY d.deg DESC, n.importance DESC
        LIMIT 1
      `).get() as { id: number } | undefined;

      if (target) {
        res.json({
          type: "research",
          targets: [target.id],
          description: "Hub Expansion: Performing analytical research on a major memory center.",
        });
        return;
      }
    }

    // 2. Synthesis: Find latent connections
    const candidates = findCandidates(ctx.handle, {
      threshold: 0.85,
      k: 5,
      minHops: 3,
      maxCandidates: 1,
    });

    if (candidates.length > 0) {
      res.json({
        type: "synthesis",
        targets: [candidates[0].a, candidates[0].b],
        description: "Synthesizing latent connection between semantically related memories.",
      });
      return;
    }

    // 3. Pruning: Find weak or redundant connections (low weight edges)
    const weakEdge = ctx.handle.sqlite.prepare(`
      SELECT id, source, target FROM edges 
      WHERE weight < 0.25 
      ORDER BY weight ASC 
      LIMIT 1
    `).get() as { id: number; source: number; target: number } | undefined;

    if (weakEdge) {
      res.json({
        type: "pruning",
        targets: [weakEdge.source, weakEdge.target],
        description: "Pruning weak or redundant associative link to maintain graph clarity.",
      });
      return;
    }

    // 4. Harmonization: Find clusters with high emotional variance
    const erraticNode = ctx.handle.sqlite.prepare(`
      SELECT n.id
      FROM nodes n
      JOIN (
        SELECT node_id, AVG(emotional_weight) as cluster_avg
        FROM (SELECT source as node_id FROM edges UNION ALL SELECT target as node_id FROM edges)
        GROUP BY node_id
      ) c ON c.node_id = n.id
      WHERE ABS(n.emotional_weight - c.cluster_avg) > 0.4
      LIMIT 1
    `).get() as { id: number } | undefined;

    if (erraticNode) {
      res.json({
        type: "harmonization",
        targets: [erraticNode.id],
        description: "Harmonizing emotional resonance across memory cluster.",
      });
      return;
    }

    // 5. Calibration: Hub mass check
    const hub = ctx.handle.sqlite.prepare(`
      SELECT n.id
      FROM nodes n
      JOIN (
        SELECT node_id, COUNT(*) as deg 
        FROM (SELECT source as node_id FROM edges UNION ALL SELECT target as node_id FROM edges)
        GROUP BY node_id
      ) d ON d.node_id = n.id
      WHERE n.importance < 0.5 AND d.deg > 5
      ORDER BY d.deg DESC
      LIMIT 1
    `).get() as { id: number } | undefined;

    if (hub) {
      res.json({
        type: "calibration",
        targets: [hub.id],
        description: "Recalibrating gravitational mass for highly-connected memory hub.",
      });
      return;
    }

    // 6. Fallback: Patrol a random node
    const nodesRepo = new NodesRepo(ctx.handle);
    const count = nodesRepo.count();
    if (count > 0) {
      const all = nodesRepo.all();
      const randomNode = all[Math.floor(Math.random() * all.length)];
      res.json({
        type: "patrol",
        targets: [randomNode.id],
        description: "Routine maintenance patrol and health check.",
      });
      return;
    }

    res.status(404).json({ error: "No nodes available for maintenance." });
  });

  /**
   * POST /api/maintenance/complete-job
   * Commits the results of a maintenance task to the database.
   */
  r.post("/complete-job", async (req, res) => {
    const parsed = CompleteJobSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid job completion data" });
      return;
    }

    const { type, targets } = parsed.data;
    let description = "";

    try {
      if (type === "synthesis" && targets.length === 2) {
        const nodesRepo = new NodesRepo(ctx.handle);
        const a = nodesRepo.getById(targets[0]);
        const b = nodesRepo.getById(targets[1]);
        if (a && b) {
          const { text, score } = await ctx.llm.synthesize(
            { label: a.label, content: a.content },
            { label: b.label, content: b.content },
            0.9,
          );
          ctx.handle.db.insert(insights).values({
            nodeA: targets[0],
            nodeB: targets[1],
            text,
            score,
          }).run();
          description = `Synthesized latent connection between "${a.label}" and "${b.label}".`;
          res.json({ ok: true, detail: "Synthesized new insight." });
        }
      } else if (type === "calibration" && targets.length === 1) {
        ctx.graph.setImportance(targets[0], null);
        const node = ctx.graph.getNode(targets[0]);
        description = `Recalibrated importance for "${node?.label || targets[0]}".`;
        res.json({ ok: true, detail: "Recalibrated importance." });
      } else if (type === "pruning" && targets.length === 2) {
        ctx.handle.sqlite.prepare(`
          DELETE FROM edges 
          WHERE (source = ? AND target = ?) OR (source = ? AND target = ?)
          AND weight < 0.25
        `).run(targets[0], targets[1], targets[1], targets[0]);
        description = `Pruned weak connection between node ${targets[0]} and ${targets[1]}.`;
        res.json({ ok: true, detail: "Pruned weak connection." });
      } else if (type === "harmonization" && targets.length === 1) {
        ctx.handle.sqlite.prepare(`
          UPDATE nodes 
          SET emotional_weight = (
            SELECT AVG(n2.emotional_weight)
            FROM nodes n2
            JOIN edges e ON (e.source = n2.id OR e.target = n2.id)
            WHERE (e.source = ? OR e.target = ?)
          )
          WHERE id = ?
        `).run(targets[0], targets[0], targets[0]);
        const node = ctx.graph.getNode(targets[0]);
        description = `Harmonized emotional resonance for "${node?.label || targets[0]}".`;
        res.json({ ok: true, detail: "Harmonized emotional weight." });
      } else if (type === "research" && targets.length === 1) {
        const nodesRepo = new NodesRepo(ctx.handle);
        const original = nodesRepo.getById(targets[0]);
        if (original) {
          const research = await ctx.llm.research({ label: original.label, content: original.content });
          
          // Append research to the existing node's content
          const expandedContent = `${original.content}\n\n--- Research Deep Dive ---\n${research.content}`;
          
          // Grow the node: Increase importance significantly as it matures
          const currentImp = original.importance ?? 0.5;
          const newImp = Math.min(1.0, currentImp + 0.2); // Trigger celestial growth

          await ctx.handle.db.update(nodes)
            .set({ 
              content: expandedContent,
              importance: newImp
            })
            .where(eq(nodes.id, original.id))
            .run();

          // Update embedding to reflect new knowledge
          const newEmbedding = await ctx.embeddings.embed(expandedContent);
          upsertEmbedding(ctx.handle.sqlite, original.id, newEmbedding);

          description = `Expanded memory hub "${original.label}" with deep-dive research. Node mass increased.`;
          res.json({ ok: true, detail: "Research integrated into memory." });
        }
      } else if (type === "merging" && targets.length === 2) {
        const nodesRepo = new NodesRepo(ctx.handle);
        const a = nodesRepo.getById(targets[0]);
        const b = nodesRepo.getById(targets[1]);
        if (a && b) {
          // Use LLM to consolidate the two redundant thoughts into one superior node
          const { text } = await ctx.llm.synthesize(
            { label: a.label, content: a.content },
            { label: b.label, content: b.content },
            1.0 // total redundancy
          );
          
          // Update node A with combined content and importance
          const newImp = Math.max(a.importance ?? 0, b.importance ?? 0) + 0.05;
          await ctx.handle.db.update(nodes)
            .set({ 
              content: text,
              importance: Math.min(1.0, newImp)
            })
            .where(eq(nodes.id, a.id))
            .run();
          
          // Re-calculate embedding for the combined node
          const newEmbedding = await ctx.embeddings.embed(text);
          upsertEmbedding(ctx.handle.sqlite, a.id, newEmbedding);

          // Move all edges from B to A
          await ctx.handle.db.update(edges)
            .set({ source: a.id })
            .where(eq(edges.source, b.id))
            .run();
          await ctx.handle.db.update(edges)
            .set({ target: a.id })
            .where(eq(edges.target, b.id))
            .run();

          // Delete the now-redundant node B
          nodesRepo.delete(b.id);

          description = `Fused redundant memory "${b.label}" into "${a.label}". Connections re-routed.`;
          res.json({ ok: true, detail: "Memory fusion complete." });
        }
      } else if (type === "patrol") {
        description = `Performed routine patrol on node ${targets[0]}.`;
        res.json({ ok: true, detail: "Patrol logged." });
      }

      if (description) {
        ctx.handle.db.insert(agentLogs).values({
          action: type,
          description,
          targets: JSON.stringify(targets),
        }).run();
      }
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  /**
   * GET /api/maintenance/logs
   * Returns recent activity logs.
   */
  r.get("/logs", async (req, res) => {
    const logs = await ctx.handle.db
      .select()
      .from(agentLogs)
      .orderBy(desc(agentLogs.id))
      .limit(50)
      .all();
    res.json(logs);
  });

  /**
   * GET /api/maintenance/settings
   */
  r.get("/settings", async (req, res) => {
    const all = await ctx.handle.db.select().from(settings).all();
    const map = Object.fromEntries(all.map(s => [s.key, s.value]));
    res.json(map);
  });

  /**
   * POST /api/maintenance/settings
   */
  r.post("/settings", async (req, res) => {
    const { key, value } = req.body;
    await ctx.handle.db.insert(settings)
      .values({ key, value })
      .onConflictDoUpdate({ target: settings.key, set: { value } })
      .run();
    res.json({ ok: true });
  });

  return r;
}
