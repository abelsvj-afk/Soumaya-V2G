import { NodesRepo } from "../repositories/nodes.repo.js";
import { EdgesRepo } from "../repositories/edges.repo.js";
import { InsightsRepo } from "../repositories/insights.repo.js";
import { insights, agentLogs, settings, nodes, edges, dailyLogs } from "../db/schema.js";
import { upsertEmbedding, getEmbedding, knn } from "../db/vec.js";
import { eq, desc } from "drizzle-orm";
import { findCandidates } from "../synthesis/engine.js";
import type { AppContext } from "../context.js";

export type JobType = 
  | "synthesis" 
  | "calibration" 
  | "patrol" 
  | "pruning" 
  | "harmonization" 
  | "research" 
  | "merging" 
  | "sector_vibe" 
  | "daily_log";

export interface MaintenanceJob {
  type: JobType;
  targets: number[];
  description: string;
}

export class MaintenanceService {
  constructor(private readonly ctx: AppContext) {}

  async getNextJob(): Promise<MaintenanceJob | null> {
    const { handle } = this.ctx;
    
    // Check if it's time for a Daily Log (once per day)
    const today = new Date().toISOString().split("T")[0];
    const logExists = await handle.db
      .select()
      .from(dailyLogs)
      .where(eq(dailyLogs.date, today))
      .get();
    
    if (!logExists) {
      const nodeCount = new NodesRepo(handle).count();
      if (nodeCount > 5) {
        return {
          type: "daily_log",
          targets: [],
          description: "Captain's Log: Summarizing today's brain evolution.",
        };
      }
    }

    // 0. Merging: Find high-redundancy nodes (similarity > 0.96)
    const nodesRepo = new NodesRepo(handle);
    const allNodes = nodesRepo.all();
    
    for (const node of allNodes) {
      const emb = getEmbedding(handle.sqlite, node.id);
      if (!emb) continue;
      const hits = knn(handle.sqlite, emb, 2);
      const redundant = hits.find(h => h.nodeId !== node.id && h.similarity > 0.96);
      
      if (redundant) {
        return {
          type: "merging",
          targets: [node.id, redundant.nodeId],
          description: "Memory Fusion: Detecting and consolidating redundant information nodes.",
        };
      }
    }

    // 1. Research: If enabled
    const researchEnabled = await handle.db
      .select()
      .from(settings)
      .where(eq(settings.key, "research_enabled"))
      .get();

    if (researchEnabled?.value === "true") {
      const target = handle.sqlite.prepare(`
        SELECT n.id FROM nodes n
        JOIN (
          SELECT node_id, COUNT(*) as deg 
          FROM (SELECT source as node_id FROM edges UNION ALL SELECT target as node_id FROM edges)
          GROUP BY node_id
        ) d ON d.node_id = n.id
        WHERE n.content NOT LIKE '%--- Research Deep Dive ---%'
        AND d.deg > 1
        AND n.importance >= 0.4
        AND n.deleted_at IS NULL
        ORDER BY d.deg DESC, n.importance DESC
        LIMIT 1
      `).get() as { id: number } | undefined;

      if (target) {
        return {
          type: "research",
          targets: [target.id],
          description: "Hub Expansion: Performing analytical research on a major memory center.",
        };
      }
    }

    // 2. Synthesis
    const candidates = findCandidates(handle, {
      threshold: 0.85,
      k: 5,
      minHops: 3,
      maxCandidates: 1,
    });

    if (candidates.length > 0) {
      return {
        type: "synthesis",
        targets: [candidates[0].a, candidates[0].b],
        description: "Synthesizing latent connection between semantically related memories.",
      };
    }

    // 3. Pruning
    const weakEdge = handle.sqlite.prepare(`
      SELECT id, source, target FROM edges 
      WHERE weight < 0.25 
      ORDER BY weight ASC 
      LIMIT 1
    `).get() as { id: number; source: number; target: number } | undefined;

    if (weakEdge) {
      return {
        type: "pruning",
        targets: [weakEdge.source, weakEdge.target],
        description: "Pruning weak or redundant associative link to maintain graph clarity.",
      };
    }

    // 4. Harmonization
    const erraticNode = handle.sqlite.prepare(`
      SELECT n.id
      FROM nodes n
      JOIN (
        SELECT node_id, AVG(emotional_weight) as cluster_avg
        FROM (SELECT source as node_id FROM edges UNION ALL SELECT target as node_id FROM edges)
        GROUP BY node_id
      ) c ON c.node_id = n.id
      WHERE ABS(n.emotional_weight - c.cluster_avg) > 0.4
      AND n.deleted_at IS NULL
      LIMIT 1
    `).get() as { id: number } | undefined;

    if (erraticNode) {
      return {
        type: "harmonization",
        targets: [erraticNode.id],
        description: "Harmonizing emotional resonance across memory cluster.",
      };
    }

    // 5. Sector Vibe
    const cluster = handle.sqlite.prepare(`
      SELECT n.id
      FROM nodes n
      JOIN (
        SELECT node_id, COUNT(*) as deg 
        FROM (SELECT source as node_id FROM edges UNION ALL SELECT target as node_id FROM edges)
        GROUP BY node_id
      ) d ON d.node_id = n.id
      WHERE n.content NOT LIKE '%--- Sector Vibe ---%'
      AND d.deg >= 3
      AND n.deleted_at IS NULL
      ORDER BY RANDOM()
      LIMIT 1
    `).get() as { id: number } | undefined;

    if (cluster) {
      return {
        type: "sector_vibe",
        targets: [cluster.id],
        description: "Atmospheric scan: Charting the vibe of a local memory sector.",
      });
      return;
    }

    // 6. Calibration
    const hub = handle.sqlite.prepare(`
      SELECT n.id
      FROM nodes n
      JOIN (
        SELECT node_id, COUNT(*) as deg 
        FROM (SELECT source as node_id FROM edges UNION ALL SELECT target as node_id FROM edges)
        GROUP BY node_id
      ) d ON d.node_id = n.id
      WHERE n.importance < 0.5 AND d.deg > 5
      AND n.deleted_at IS NULL
      ORDER BY d.deg DESC
      LIMIT 1
    `).get() as { id: number } | undefined;

    if (hub) {
      return {
        type: "calibration",
        targets: [hub.id],
        description: "Recalibrating gravitational mass for highly-connected memory hub.",
      };
    }

    // 7. Patrol (Fallback)
    if (allNodes.length > 0) {
      const randomNode = allNodes[Math.floor(Math.random() * allNodes.length)];
      return {
        type: "patrol",
        targets: [randomNode.id],
        description: "Routine maintenance patrol and health check.",
      };
    }

    return null;
  }

  async completeJob(type: JobType, targets: number[]): Promise<string> {
    const { handle, llm, embeddings, graph } = this.ctx;
    let description = "";

    if (type === "synthesis" && targets.length === 2) {
      const nodesRepo = new NodesRepo(handle);
      const a = nodesRepo.getById(targets[0]);
      const b = nodesRepo.getById(targets[1]);
      if (a && b) {
        const { text, score } = await llm.synthesize(
          { label: a.label, content: a.content },
          { label: b.label, content: b.content },
          0.9,
        );
        handle.db.insert(insights).values({
          nodeA: targets[0],
          nodeB: targets[1],
          text,
          score,
        }).run();
        description = `Synthesized latent connection between "${a.label}" and "${b.label}".`;
      }
    } else if (type === "calibration" && targets.length === 1) {
      graph.setImportance(targets[0], null);
      const node = graph.getNode(targets[0]);
      description = `Recalibrated importance for "${node?.label || targets[0]}".`;
    } else if (type === "pruning" && targets.length === 2) {
      handle.sqlite.prepare(`
        DELETE FROM edges 
        WHERE (source = ? AND target = ?) OR (source = ? AND target = ?)
        AND weight < 0.25
      `).run(targets[0], targets[1], targets[1], targets[0]);
      description = `Pruned weak connection between node ${targets[0]} and ${targets[1]}.`;
    } else if (type === "harmonization" && targets.length === 1) {
      handle.sqlite.prepare(`
        UPDATE nodes 
        SET emotional_weight = (
          SELECT AVG(n2.emotional_weight)
          FROM nodes n2
          JOIN edges e ON (e.source = n2.id OR e.target = n2.id)
          WHERE (e.source = ? OR e.target = ?)
          AND n2.deleted_at IS NULL
        )
        WHERE id = ?
      `).run(targets[0], targets[0], targets[0]);
      const node = graph.getNode(targets[0]);
      description = `Harmonized emotional resonance for "${node?.label || targets[0]}".`;
    } else if (type === "research" && targets.length === 1) {
      const nodesRepo = new NodesRepo(handle);
      const original = nodesRepo.getById(targets[0]);
      if (original) {
        const research = await llm.research({ label: original.label, content: original.content });
        const expandedContent = `${original.content}\n\n--- Research Deep Dive ---\n${research.content}`;
        const currentImp = original.importance ?? 0.5;
        const newImp = Math.min(1.0, currentImp + 0.2);

        await handle.db.update(nodes)
          .set({ 
            content: expandedContent,
            importance: newImp
          })
          .where(eq(nodes.id, original.id))
          .run();

        const newEmbedding = await embeddings.embed(expandedContent);
        upsertEmbedding(handle.sqlite, original.id, newEmbedding);

        description = `Expanded memory hub "${original.label}" with deep-dive research. Node mass increased.`;
      }
    } else if (type === "merging" && targets.length === 2) {
      const nodesRepo = new NodesRepo(handle);
      const a = nodesRepo.getById(targets[0]);
      const b = nodesRepo.getById(targets[1]);
      if (a && b) {
        const { text } = await llm.synthesize(
          { label: a.label, content: a.content },
          { label: b.label, content: b.content },
          1.0
        );
        
        const newImp = Math.max(a.importance ?? 0, b.importance ?? 0) + 0.05;
        await handle.db.update(nodes)
          .set({ 
            content: text,
            importance: Math.min(1.0, newImp)
          })
          .where(eq(nodes.id, a.id))
          .run();
        
        const newEmbedding = await embeddings.embed(text);
        upsertEmbedding(handle.sqlite, a.id, newEmbedding);

        await handle.db.update(edges)
          .set({ source: a.id })
          .where(eq(edges.source, b.id))
          .run();
        await handle.db.update(edges)
          .set({ target: a.id })
          .where(eq(edges.target, b.id))
          .run();

        nodesRepo.softDelete(b.id, a.id);
        description = `Fused redundant memory "${b.label}" into "${a.label}". Node preserved in tombstone.`;
      }
    } else if (type === "sector_vibe" && targets.length === 1) {
      const nodesRepo = new NodesRepo(handle);
      const center = nodesRepo.getById(targets[0]);
      if (center) {
        const neighbors = handle.sqlite.prepare(`
          SELECT n.id, n.label, n.content 
          FROM nodes n
          JOIN edges e ON (e.source = n.id OR e.target = n.id)
          WHERE (e.source = ? OR e.target = ?) AND n.id != ? AND n.deleted_at IS NULL
          LIMIT 5
        `).all(center.id, center.id, center.id) as { id: number, label: string, content: string }[];
        
        const clusterNodes = [center, ...neighbors].map(n => ({ label: n.label, content: n.content }));
        const vibe = await llm.summarizeSector(clusterNodes);

        const expandedContent = `${center.content}\n\n--- Sector Vibe ---\n${vibe}`;
        await handle.db.update(nodes)
          .set({ content: expandedContent })
          .where(eq(nodes.id, center.id))
          .run();
        
        description = `Charted sector vibe around "${center.label}": ${vibe}`;
      }
    } else if (type === "daily_log") {
      const nodesRepo = new NodesRepo(handle);
      const recentNodes = nodesRepo.recent(10);
      const recentLogs = handle.sqlite.prepare(`SELECT action, description FROM agent_logs ORDER BY id DESC LIMIT 10`).all() as { action: string, description: string }[];
      
      const logText = await llm.generateDailyLog(
        recentNodes.map(n => ({ label: n.label, content: n.content })),
        recentLogs.map(l => l.description)
      );

      handle.db.insert(dailyLogs).values({
        content: logText,
        date: new Date().toISOString().split("T")[0]
      }).run();

      description = `Captain's Log recorded: ${logText.slice(0, 50)}...`;
    } else if (type === "patrol") {
      description = `Performed routine patrol on node ${targets[0]}.`;
    }

    if (description) {
      handle.db.insert(agentLogs).values({
        action: type,
        description,
        targets: JSON.stringify(targets),
      }).run();
    }

    return description;
  }
}
