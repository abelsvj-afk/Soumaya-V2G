import { Router } from "express";
import { z } from "zod";
import type { AppContext } from "../../context.js";
import { getDailyContact, answerDailyContact } from "../../analysis/dailyContact.js";
import { spaceOf } from "../middleware.js";

const AnswerBody = z.object({ text: z.string().min(1).max(20000) });

/** The Daily Contact — she initiates once a day; answering feeds the brain. */
export function contactRoutes(ctx: AppContext): Router {
  const r = Router();

  // GET /api/contact -> today's question + discovery (built once per day).
  r.get("/", (_req, res) => {
    res.json(getDailyContact(ctx, spaceOf(res)));
  });

  // POST /api/contact/answer { text } -> the reply becomes a real memory, linked
  // to the memory she asked about; pays the standard earn path.
  r.post("/answer", async (req, res) => {
    const parsed = AnswerBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Body must be { text: string }" });
      return;
    }
    const result = await answerDailyContact(ctx, spaceOf(res), parsed.data.text);
    res.json(result);
  });

  return r;
}
