import { Router } from "express";
import { z } from "zod";
import type { AppContext } from "../../context.js";
import { listInquiries, answerInquiry, dismissInquiry, rejectInquiry, confirmInquiry } from "../../analysis/inquiry.js";
import { spaceOf } from "../middleware.js";

const AnswerBody = z.object({ text: z.string().min(1).max(4000) });

/** Proactive inquiries: connections Soumaya noticed and wants to ask you about. */
export function inquiryRoutes(ctx: AppContext): Router {
  const r = Router();

  // GET /api/inquiries -> open noticings (with the bodies each is about).
  r.get("/", (_req, res) => {
    res.json(listInquiries(ctx, spaceOf(res)));
  });

  // POST /api/inquiries/:id/answer { text } -> answer (ingests + links + earns).
  r.post("/:id/answer", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const parsed = AnswerBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Body must be { text }" });
      return;
    }
    const result = await answerInquiry(ctx, spaceOf(res), id, parsed.data.text);
    if (!result) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(result);
  });

  // POST /api/inquiries/:id/dismiss -> don't ask this one again.
  r.post("/:id/dismiss", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    if (!dismissInquiry(ctx, spaceOf(res), id)) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json({ ok: true });
  });

  // POST /api/inquiries/:id/confirm -> "yes, connect them" (one tap, no typing).
  r.post("/:id/confirm", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    if (!confirmInquiry(ctx, spaceOf(res), id)) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json({ ok: true });
  });

  // POST /api/inquiries/:id/reject -> "these don't relate": sever the edges +
  // remember the rejection so she never re-links or re-asks about the pair.
  r.post("/:id/reject", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    if (!rejectInquiry(ctx, spaceOf(res), id)) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json({ ok: true });
  });

  return r;
}
