import { Router } from "express";
import { z } from "zod";
import type { AppContext } from "../../context.js";
import { spaceOf } from "../middleware.js";
import { KnowledgeRepo } from "../../repositories/knowledge.repo.js";
import { ingestDocument } from "../../knowledge/ingest.js";

// Text/Markdown only in v1 (server stays dependency-free). ~3.5MB of UTF-8 text
// fits comfortably under the raised JSON body limit.
const UploadBody = z.object({
  name: z.string().min(1).max(200),
  mime: z.string().max(120).optional(),
  text: z.string().min(1).max(3_500_000),
});

/** Knowledge documents: upload (chunk+embed), list, delete. Space-scoped. */
export function documentsRoutes(ctx: AppContext): Router {
  const r = Router();

  r.get("/", (req, res) => {
    res.json(new KnowledgeRepo(ctx.handle, spaceOf(res)).listDocs());
  });

  r.post("/", async (req, res) => {
    const parsed = UploadBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Body must be { name, text }" });
      return;
    }
    const doc = await ingestDocument(
      ctx.handle,
      { embeddings: ctx.embeddings },
      parsed.data,
      spaceOf(res),
    );
    res.json(doc);
  });

  r.delete("/:id", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Bad id" });
      return;
    }
    const ok = new KnowledgeRepo(ctx.handle, spaceOf(res)).deleteDoc(id);
    res.status(ok ? 200 : 404).json({ ok });
  });

  return r;
}
