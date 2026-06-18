import { buildContext } from "./context.js";
import { createApp } from "./api/server.js";
import { NodesRepo } from "./repositories/nodes.repo.js";
import { setTelegramWebhook } from "./telegram/bot.js";

const PORT = Number(process.env.PORT ?? 3001);

const ctx = await buildContext();
const app = createApp(ctx);

app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
  console.log(`[server] embeddings: ${ctx.embeddings.model} (${ctx.embeddings.dim}d)`);
  console.log(
    `[server] llm: ${ctx.llm.model} ${ctx.llm.available ? "(active)" : "(heuristic fallback — set GEMINI_API_KEY)"}`,
  );
});

// Telegram: if a bot token + webhook secret + public URL are set, point Telegram
// at our webhook on boot. Without all three we stay silent (feature is opt-in).
const tgToken = process.env.TELEGRAM_BOT_TOKEN;
const tgSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
const publicUrl = process.env.PUBLIC_URL?.replace(/\/$/, "");
if (tgToken && tgSecret && publicUrl) {
  void setTelegramWebhook(tgToken, `${publicUrl}/api/telegram/webhook/${tgSecret}`, tgSecret);
} else if (tgToken) {
  console.log("[telegram] set TELEGRAM_WEBHOOK_SECRET and PUBLIC_URL to auto-register the webhook");
}

// Soumaya background heartbeat: light, server-side upkeep so the brain stays tidy
// even when no client is open. STRICTLY FREE work — it never calls the LLM, so it
// can never drain the API key (all token-spending jobs stay client + Research Mode
// gated). For now it prunes the single weakest associative link, if any.
const HEARTBEAT_MS = Number(process.env.HEARTBEAT_MS ?? 1000 * 60 * 15);
function expireActionItems() {
  // Sweep every brain: find due action items across all spaces, then expire each
  // within its own space (so the log + deletion stay correctly scoped).
  const due = ctx.handle.sqlite
    .prepare(
      `SELECT id, label, space_id AS spaceId FROM nodes
       WHERE kind = 'action' AND deleted_at IS NULL AND expires_at <= ?`,
    )
    .all(new Date().toISOString()) as { id: number; label: string; spaceId: string }[];
  if (due.length === 0) return;

  const bySpace = new Map<string, { id: number; label: string }[]>();
  for (const d of due) {
    if (!bySpace.has(d.spaceId)) bySpace.set(d.spaceId, []);
    bySpace.get(d.spaceId)!.push({ id: d.id, label: d.label });
  }

  for (const [spaceId, items] of bySpace) {
    const summary = items.map((d) => d.label).join("; ");
    try {
      ctx.handle.sqlite
        .prepare(
          `INSERT INTO agent_logs (space_id, action, description, targets) VALUES (?, ?, ?, ?)`,
        )
        .run(
          spaceId,
          "action_expired",
          `Action items timed out: ${summary}`,
          JSON.stringify(items.map((d) => d.id)),
        );
    } catch {
      /* logging is best-effort */
    }
    const repo = new NodesRepo(ctx.handle, spaceId);
    for (const d of items) repo.delete(d.id);
  }
  console.log(`[soumaya] expired ${due.length} action item(s) across ${bySpace.size} brain(s)`);
}

setInterval(() => {
  try {
    // 1) Expire timed-out action items (summarized into the activity log).
    expireActionItems();
    // 2) Prune the single weakest associative link (free upkeep).
    const weak = ctx.handle.sqlite
      .prepare(`SELECT id, weight FROM edges WHERE weight < 0.15 ORDER BY weight ASC LIMIT 1`)
      .get() as { id: number; weight: number } | undefined;
    if (weak) {
      ctx.handle.sqlite.prepare(`DELETE FROM edges WHERE id = ?`).run(weak.id);
      console.log(`[soumaya] heartbeat: pruned weak link #${weak.id} (w=${weak.weight.toFixed(2)})`);
    }
  } catch (err) {
    console.error("[soumaya] heartbeat error:", err);
  }
}, HEARTBEAT_MS);
// Sweep action items more often than the main heartbeat so they expire on time.
setInterval(() => {
  try {
    expireActionItems();
  } catch (err) {
    console.error("[soumaya] action sweep error:", err);
  }
}, 60_000);
