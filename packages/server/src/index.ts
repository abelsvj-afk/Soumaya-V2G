import { buildContext } from "./context.js";
import { createApp } from "./api/server.js";

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
setInterval(() => {
  try {
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
