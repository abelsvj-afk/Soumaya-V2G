import { Router } from "express";
import { z } from "zod";
import type { AppContext } from "../../context.js";
import { ingest } from "../../ingestion/pipeline.js";
import { NodesRepo } from "../../repositories/nodes.repo.js";

const IngestBody = z.object({
  text: z.string().min(1).max(20000),
  // Optional: create a transient day-to-day action item that times out.
  kind: z.enum(["memory", "action"]).optional(),
  ttlHours: z.number().min(1).max(24 * 30).optional(),
});

export function ingestRoutes(ctx: AppContext): Router {
  const r = Router();
  // POST /api/ingest  { text, kind?, ttlHours? }
  r.post("/", async (req, res) => {
    const parsed = IngestBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Body must be { text: string }" });
      return;
    }
    const { text, kind, ttlHours } = parsed.data;

    // Action items are quick to-dos: a small body, no LLM extraction or linking,
    // and an expiry. (Keeps them cheap + transient, distinct from real memories.)
    if (kind === "action") {
      const expiresAt = new Date(Date.now() + (ttlHours ?? 24) * 3_600_000).toISOString();
      const label = text.trim().split(/\s+/).slice(0, 6).join(" ") || "Action item";
      const vec = await ctx.embeddings.embed(text.trim());
      const node = new NodesRepo(ctx.handle).create(
        {
          label,
          type: "random_thought",
          content: text.trim(),
          importance: 0.12, // small celestial body
          kind: "action",
          expiresAt,
        },
        vec,
      );
      res.json({ nodes: [node], extractedEdges: [], associativeEdges: [] });
      return;
    }

    const result = await ingest(ctx.handle, { embeddings: ctx.embeddings, llm: ctx.llm }, text);
    res.json(result);
  });
  return r;
}
