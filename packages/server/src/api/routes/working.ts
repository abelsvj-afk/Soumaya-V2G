import { Router } from "express";
import { z } from "zod";
import type { AppContext } from "../../context.js";
import {
  addThought,
  listThoughts,
  reinforceThought,
  dismissThought,
  promoteThought,
} from "../../analysis/workingMemory.js";
import { spaceOf } from "../middleware.js";

const AddBody = z.object({
  text: z.string().min(1).max(500),
  source: z.enum(["manual", "chat", "goal", "priority", "emotion"]).optional(),
});

/** Working Memory (the "mind space"): hold, reinforce, promote, or dismiss thoughts. */
export function workingRoutes(ctx: AppContext): Router {
  const r = Router();

  // GET /api/working -> live thoughts (decayed strength, strongest first).
  r.get("/", (_req, res) => {
    res.json(listThoughts(ctx, spaceOf(res)));
  });

  // POST /api/working { text, source? } -> add a thought to the mind space.
  r.post("/", (req, res) => {
    const parsed = AddBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Body must be { text, source? }", issues: parsed.error.issues });
      return;
    }
    const id = addThought(ctx, spaceOf(res), parsed.data.text, parsed.data.source ?? "manual");
    res.json({ id });
  });

  // POST /api/working/:id/reinforce -> top it up; may auto-promote to a memory.
  r.post("/:id/reinforce", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const result = await reinforceThought(ctx, spaceOf(res), id);
    if (!result.ok) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json({ ok: true, promotedNodeId: result.promotedNodeId });
  });

  // POST /api/working/:id/promote -> consolidate this thought into the galaxy now.
  r.post("/:id/promote", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const nodeId = await promoteThought(ctx, spaceOf(res), id);
    if (nodeId == null) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json({ ok: true, nodeId });
  });

  // DELETE /api/working/:id -> dismiss (let the thought go).
  r.delete("/:id", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    if (!dismissThought(ctx, spaceOf(res), id)) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json({ ok: true });
  });

  return r;
}
