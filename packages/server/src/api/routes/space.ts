import { Router } from "express";
import { z } from "zod";
import type { AppContext } from "../../context.js";
import { SpacesRepo } from "../../auth/spaces.js";

const AuthBody = z.object({
  gamerTag: z.string().trim().min(2).max(40),
  passcode: z.string().min(4).max(100),
  name: z.string().trim().min(2).max(40).optional(),
});

const ProfileBody = z.object({
  gamerTag: z.string().trim().min(2).max(40).optional(),
  name: z.string().trim().min(1).max(40).optional(),
});

export function spaceRoutes(ctx: AppContext): Router {
  const r = Router();
  const repo = new SpacesRepo(ctx.handle);

  // POST /api/space/auth { gamerTag, passcode, name? } -> log in to or create a brain.
  // Returns the space's secret id, which the client stores and sends as
  // `x-space-id` on every later request.
  r.post("/auth", (req, res) => {
    const parsed = AuthBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Body must be { gamerTag (2-40 chars), passcode (4+ chars), name (optional, 2-40 chars) }" });
      return;
    }
    const { gamerTag, passcode, name } = parsed.data;
    try {
      const result = repo.authOrCreate(gamerTag, passcode, name);
      if (!result) {
        res.status(401).json({ error: "Incorrect passcode for this gamer tag." });
        return;
      }
      res.json({ id: result.space.id, name: result.space.name, gamerTag: result.space.gamerTag, created: result.created });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // GET /api/space/me -> validate the current x-space-id header.
  r.get("/me", (_req, res) => {
    const id = (res.req.header("x-space-id") ?? "").trim();
    const space = id ? repo.getById(id) : undefined;
    if (!space) {
      res.status(401).json({ error: "No valid brain selected." });
      return;
    }
    res.json({ id: space.id, name: space.name, gamerTag: space.gamerTag });
  });

  // PATCH /api/space/profile { gamerTag?, name? } -> update this brain's identity.
  // gamerTag stays unique; name is free. Uses the x-space-id header.
  r.patch("/profile", (req, res) => {
    const id = (res.req.header("x-space-id") ?? "").trim();
    if (!id || !repo.getById(id)) {
      res.status(401).json({ error: "No valid brain selected." });
      return;
    }
    const parsed = ProfileBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Body must be { gamerTag?, name? }" });
      return;
    }
    try {
      res.json(repo.updateProfile(id, parsed.data));
    } catch (err) {
      res.status(409).json({ error: (err as Error).message });
    }
  });

  return r;
}
