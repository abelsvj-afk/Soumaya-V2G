import { Router } from "express";
import { z } from "zod";
import type { AppContext } from "../../context.js";
import { chat, DEFAULT_CHAT } from "../../chat/graphrag.js";
import { spaceOf } from "../middleware.js";

const ChatBody = z.object({ question: z.string().min(1).max(2000) });

export function chatRoutes(ctx: AppContext): Router {
  const r = Router();
  // POST /api/chat  { question } -> GraphRAG answer with citations
  r.post("/", async (req, res) => {
    const parsed = ChatBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Body must be { question: string }" });
      return;
    }
    const result = await chat(
      ctx.handle,
      { embeddings: ctx.embeddings, llm: ctx.llm },
      parsed.data.question,
      DEFAULT_CHAT,
      spaceOf(res),
    );
    res.json(result);
  });
  return r;
}
