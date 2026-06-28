import { Router } from "express";
import { z } from "zod";
import type { AppContext } from "../../context.js";
import { chat, DEFAULT_CHAT } from "../../chat/graphrag.js";
import { spaceOf } from "../middleware.js";

const ChatBody = z.object({ question: z.string().min(1).max(2000) });

const DistillBody = z.object({
  messages: z
    .array(z.object({ role: z.enum(["you", "soumaya"]), text: z.string() }))
    .min(1)
    .max(80),
});

/** Offline fallback: the user's own substantive lines, deduped, newest first. */
function heuristicDistill(messages: { role: string; text: string }[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of messages) {
    if (m.role !== "you") continue;
    const t = m.text.trim();
    if (t.length < 25 || t.endsWith("?")) continue; // skip short bits + questions
    const key = t.toLowerCase().slice(0, 40);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t.length > 200 ? `${t.slice(0, 197)}…` : t);
  }
  return out.slice(-3);
}

export function chatRoutes(ctx: AppContext): Router {
  const r = Router();

  // POST /api/chat/distill { messages } -> 0–3 memory-worthy notes from a chat.
  // LLM when available; heuristic fallback otherwise. The client shows these for
  // the user to approve before any are saved.
  r.post("/distill", async (req, res) => {
    const parsed = DistillBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Body must be { messages: [{role,text}] }" });
      return;
    }
    const msgs = parsed.data.messages;
    let summaries: string[] = [];
    if (ctx.llm.distill) {
      try {
        const transcript = msgs.map((m) => `${m.role === "you" ? "User" : "Soumaya"}: ${m.text}`).join("\n");
        summaries = await ctx.llm.distill(transcript);
      } catch {
        summaries = heuristicDistill(msgs);
      }
    } else {
      summaries = heuristicDistill(msgs);
    }
    summaries = summaries.map((s) => s.trim()).filter(Boolean).slice(0, 3);
    res.json({ summaries });
  });
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
