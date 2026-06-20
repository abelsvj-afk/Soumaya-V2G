import { Router } from "express";
import { z } from "zod";
import type { AppContext } from "../../context.js";
import { spaceOf } from "../middleware.js";
import { InstructionProfilesRepo } from "../../repositories/instructions.repo.js";
import { upsertProfileEmbedding, deleteProfileEmbedding } from "../../db/vec.js";

const Mode = z.enum(["always", "auto"]);
// Generous body limit — a custom instruction / operating manual can be long
// (knowledge docs allow ~3.5M chars; an instruction stays well within the 4mb
// JSON body cap). Bounded so it can't be abused, but big enough to paste a
// full operating manual without hitting the wall.
const BODY_MAX = 1_000_000;
const CreateBody = z.object({
  name: z.string().min(1).max(120),
  body: z.string().min(1).max(BODY_MAX),
  mode: Mode.optional(),
  priority: z.number().int().min(0).max(100).optional(),
});
const PatchBody = z.object({
  name: z.string().min(1).max(120).optional(),
  body: z.string().min(1).max(BODY_MAX).optional(),
  enabled: z.boolean().optional(),
  mode: Mode.optional(),
  priority: z.number().int().min(0).max(100).optional(),
});

/** Human-readable zod failure (so a 400 tells you exactly what's wrong). */
const zodDetail = (e: z.ZodError): string =>
  e.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ");

/**
 * Layer-2 custom instruction profiles (CRUD). On create/update we (re)embed the
 * profile so 'auto' profiles can be intent-routed in chat (knnProfiles).
 */
export function instructionsRoutes(ctx: AppContext): Router {
  const r = Router();

  const embed = async (id: number, name: string, body: string) => {
    try {
      const vec = await ctx.embeddings.embed(`${name}\n${body}`);
      upsertProfileEmbedding(ctx.handle.sqlite, id, vec);
    } catch (err) {
      console.error("[instructions] embed failed:", err);
    }
  };

  r.get("/", (req, res) => {
    res.json(new InstructionProfilesRepo(ctx.handle, spaceOf(res)).list());
  });

  r.post("/", async (req, res) => {
    const parsed = CreateBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: zodDetail(parsed.error) });
      return;
    }
    const repo = new InstructionProfilesRepo(ctx.handle, spaceOf(res));
    const profile = repo.create(parsed.data);
    await embed(profile.id, profile.name, profile.body);
    res.json(profile);
  });

  r.patch("/:id", async (req, res) => {
    const id = Number(req.params.id);
    const parsed = PatchBody.safeParse(req.body);
    if (!Number.isFinite(id) || !parsed.success) {
      res.status(400).json({ error: parsed.success ? "Bad id" : zodDetail(parsed.error) });
      return;
    }
    const repo = new InstructionProfilesRepo(ctx.handle, spaceOf(res));
    const updated = repo.update(id, parsed.data);
    if (!updated) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (parsed.data.name !== undefined || parsed.data.body !== undefined) {
      await embed(updated.id, updated.name, updated.body);
    }
    res.json(updated);
  });

  r.delete("/:id", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Bad id" });
      return;
    }
    const ok = new InstructionProfilesRepo(ctx.handle, spaceOf(res)).delete(id);
    if (ok) deleteProfileEmbedding(ctx.handle.sqlite, id);
    res.status(ok ? 200 : 404).json({ ok });
  });

  return r;
}
