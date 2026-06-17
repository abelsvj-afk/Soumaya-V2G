import { Router } from "express";
import { z } from "zod";
import type { AppContext } from "../../context.js";
import { ingest } from "../../ingestion/pipeline.js";
import { NodesRepo } from "../../repositories/nodes.repo.js";
import { EconomyRepo, EARN_MEMORY, EARN_LINK } from "../../economy.js";
import { spaceOf } from "../middleware.js";

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
    const spaceId = spaceOf(res);

    // Action items are quick to-dos: a small body, no LLM extraction or linking,
    // and an expiry. (Keeps them cheap + transient, distinct from real memories.)
    if (kind === "action") {
      const expiresAt = new Date(Date.now() + (ttlHours ?? 24) * 3_600_000).toISOString();
      const label = text.trim().split(/\s+/).slice(0, 6).join(" ") || "Action item";
      const vec = await ctx.embeddings.embed(text.trim());
      const node = new NodesRepo(ctx.handle, spaceId).create(
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

    const result = await ingest(
      ctx.handle,
      { embeddings: ctx.embeddings, llm: ctx.llm },
      text,
      spaceId,
    );
    // Earn fuel for tending the galaxy: a memory + each association it forged.
    const fuelEarned = EARN_MEMORY + EARN_LINK * result.associativeEdges.length;
    const econ = new EconomyRepo(ctx.handle, spaceId);
    econ.add(fuelEarned);
    res.json({ ...result, fuelEarned, fuel: econ.toFuel() });
  });
  return r;
}
