import { buildContext } from "./context.js";
import { createApp } from "./api/server.js";
import { NodesRepo } from "./repositories/nodes.repo.js";
import { agentLogs } from "./db/schema.js";

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

// Soumaya background heartbeat: light, server-side upkeep so the brain stays tidy
// even when no client is open. STRICTLY FREE work — it never calls the LLM, so it
// can never drain the API key (all token-spending jobs stay client + Research Mode
// gated). For now it prunes the single weakest associative link, if any.
const HEARTBEAT_MS = Number(process.env.HEARTBEAT_MS ?? 1000 * 60 * 15);
function expireActionItems() {
  const repo = new NodesRepo(ctx.handle);
  const due = repo.dueActionItems(new Date().toISOString());
  if (due.length === 0) return;
  const summary = due.map((d) => d.label).join("; ");
  try {
    ctx.handle.db
      .insert(agentLogs)
      .values({
        action: "action_expired",
        description: `Action items timed out: ${summary}`,
        targets: JSON.stringify(due.map((d) => d.id)),
      })
      .run();
  } catch {
    /* logging is best-effort */
  }
  for (const d of due) repo.delete(d.id);
  console.log(`[soumaya] expired ${due.length} action item(s)`);
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
