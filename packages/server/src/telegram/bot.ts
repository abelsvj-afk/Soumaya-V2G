import type { AppContext } from "../context.js";
import { chat } from "../chat/graphrag.js";
import { ingest } from "../ingestion/pipeline.js";
import { EconomyRepo, EARN_MEMORY, EARN_LINK } from "../economy.js";
import { DEFAULT_SPACE } from "../db/schema.js";

/**
 * Talk to your Soumaya brain from Telegram (Phase A: chat + log, single brain,
 * text replies). The webhook route (api/routes/telegram.ts) verifies the secret
 * and hands raw updates here; the actual send is injected so this is unit-testable
 * without the network. See plans/telegram-and-autonomy.md for the evolution path
 * (proactive nudges, full server-side autonomy, voice notes, multi-user).
 */

const TG_API = "https://api.telegram.org";

export interface TelegramUpdate {
  message?: {
    chat?: { id?: number };
    text?: string;
    from?: { first_name?: string };
  };
}

/** Send a text message to a chat (real network). Best-effort — never throws. */
export async function tgSend(token: string, chatId: number, text: string): Promise<void> {
  try {
    await fetch(`${TG_API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    });
  } catch (err) {
    console.error("[telegram] send failed:", err);
  }
}

/** Point Telegram at our webhook (called on boot when fully configured). */
export async function setTelegramWebhook(
  token: string,
  url: string,
  secret: string,
): Promise<void> {
  try {
    const res = await fetch(`${TG_API}/bot${token}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, secret_token: secret, allowed_updates: ["message"] }),
    });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string };
    console.log(`[telegram] setWebhook ok=${j.ok} ${j.description ?? ""}`.trim());
  } catch (err) {
    console.error("[telegram] setWebhook failed:", err);
  }
}

/**
 * Which brain a Telegram message maps to (single-brain mode):
 *  1. TELEGRAM_SPACE_ID if set (your brain's id — shown in the Command Center),
 *  2. else the only brain if exactly one exists,
 *  3. else the legacy space.
 */
export function resolveTelegramSpace(ctx: AppContext): string {
  const configured = process.env.TELEGRAM_SPACE_ID?.trim();
  if (configured) return configured;
  const rows = ctx.handle.sqlite.prepare(`SELECT id FROM spaces`).all() as { id: string }[];
  if (rows.length === 1) return rows[0]!.id;
  return DEFAULT_SPACE;
}

const HELP =
  "🛰️ I'm Soumaya, your second brain.\n\n" +
  "• Send me anything and I'll answer from your memories (with what I drew on).\n" +
  "• /log <thought> — save a new memory; I'll tell you what landed.\n" +
  "• /help — show this again.";

/**
 * Core update handler. `send` is injected so tests run with no network.
 */
export async function handleTelegramUpdate(
  ctx: AppContext,
  update: TelegramUpdate,
  send: (chatId: number, text: string) => Promise<void>,
): Promise<void> {
  const msg = update.message;
  const chatId = msg?.chat?.id;
  const text = (msg?.text ?? "").trim();
  if (chatId == null || !text) return;

  // Single-brain privacy: if an allowed chat id is configured, ignore everyone else.
  const allowed = process.env.TELEGRAM_ALLOWED_CHAT_ID?.trim();
  if (allowed && String(chatId) !== allowed) {
    await send(chatId, "This Soumaya brain is private.");
    return;
  }

  const spaceId = resolveTelegramSpace(ctx);

  if (text === "/start" || text === "/help") {
    await send(chatId, HELP);
    return;
  }

  if (text.startsWith("/log")) {
    const body = text.slice("/log".length).trim();
    if (!body) {
      await send(chatId, "Add the memory after /log — e.g. /log call mom on Sunday");
      return;
    }
    const result = await ingest(ctx.handle, { embeddings: ctx.embeddings, llm: ctx.llm }, body, spaceId);
    const links = result.associativeEdges.length;
    const fuel = EARN_MEMORY + EARN_LINK * links;
    new EconomyRepo(ctx.handle, spaceId).add(fuel);
    const label = result.nodes[0]?.label ?? "a memory";
    await send(
      chatId,
      `✦ Logged "${label}" — ${links} link${links === 1 ? "" : "s"} formed · +${fuel.toFixed(1)} ⛽`,
    );
    return;
  }

  // Anything else = a question for the brain (GraphRAG).
  const answer = await chat(ctx.handle, { embeddings: ctx.embeddings, llm: ctx.llm }, text, undefined, spaceId);
  let reply = answer.answer?.trim() || "I don't have anything on that yet — add a memory with /log.";
  if (answer.citations.length > 0) {
    reply += `\n\n— from: ${answer.citations.map((c) => c.label).join(" · ")}`;
  }
  await send(chatId, reply);
}
