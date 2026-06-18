import { Router } from "express";
import type { AppContext } from "../../context.js";
import { handleTelegramUpdate, tgSend } from "../../telegram/bot.js";

/**
 * Telegram webhook (open route — auth is the secret, not an x-space-id). Telegram
 * POSTs updates here; we verify the secret two ways (URL path + the
 * X-Telegram-Bot-Api-Secret-Token header Telegram echoes from setWebhook), ack
 * immediately so Telegram doesn't retry, then process in the background.
 */
export function telegramRoutes(ctx: AppContext): Router {
  const r = Router();

  r.post("/webhook/:secret", (req, res) => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (
      !token ||
      !secret ||
      req.params.secret !== secret ||
      req.get("x-telegram-bot-api-secret-token") !== secret
    ) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    // Ack right away (Telegram retries on any non-200), then handle off the response.
    res.json({ ok: true });
    void handleTelegramUpdate(ctx, req.body, (chatId, text) => tgSend(token, chatId, text)).catch(
      (err) => console.error("[telegram] handler error:", err),
    );
  });

  return r;
}
