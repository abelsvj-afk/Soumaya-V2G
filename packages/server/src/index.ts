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

  // Soumaya Heartbeat: Server-side autonomous maintenance.
  // Runs every 5 minutes. If a client is also running maintenance, they'll
  // just fight over the next job (which is fine, first one wins).
  setInterval(async () => {
    try {
      const job = await ctx.maintenance.getNextJob();
      if (job) {
        // In the background, we only perform non-visual tasks to avoid
        // "magic" changes while the user is watching the ship.
        // Actually, for now, let's allow it to do anything except Merging/Synthesis
        // which are high-impact and better seen.
        if (job.type !== "merging" && job.type !== "synthesis" && job.type !== "research") {
          console.log(`[soumaya] background job: ${job.type} - ${job.description}`);
          await ctx.maintenance.completeJob(job.type, job.targets);
        }
      }
    } catch (err) {
      console.error("[soumaya] heartbeat error:", err);
    }
  }, 1000 * 60 * 5);
});
