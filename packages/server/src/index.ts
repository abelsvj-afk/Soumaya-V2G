import { buildContext } from "./context.js";
import { createApp } from "./api/server.js";
import { NodesRepo } from "./repositories/nodes.repo.js";
import { setTelegramWebhook, sendDailyDigests, tgSend } from "./telegram/bot.js";
import { selectJob, executeJob, researchEnabled } from "./maintenance/agent.js";
import { evolveLore } from "./lore/engine.js";
import { refreshPersona } from "./persona/derive.js";
import { reconcileConstellations } from "./analysis/constellationReconcile.js";
import { runDreamCycle } from "./analysis/dreamCycle.js";
import { stepUndertaking } from "./analysis/undertakings.js";
import { applyCognitiveGravity } from "./analysis/cognitive.js";
import { sweepDuplicates } from "./analysis/dedup.js";
import { sweepWorkingMemory } from "./analysis/workingMemory.js";
import { generateInquiry } from "./analysis/inquiry.js";
import { stepIdeas, splitRipeIdea } from "./analysis/ideas.js";
import { stepSkills } from "./analysis/skills.js";
import { stepIdentities } from "./analysis/identity.js";
import { mergeDuplicatePeople } from "./analysis/people.js";
import { rollPastEvents } from "./analysis/future.js";
import { stepDrives } from "./analysis/drives.js";
import { DEFAULT_SPACE } from "./db/schema.js";
import { EconomyRepo } from "./economy.js";

const PORT = Number(process.env.PORT ?? 3001);

const ctx = await buildContext();
const app = createApp(ctx);

const server = app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
  console.log(`[server] embeddings: ${ctx.embeddings.model} (${ctx.embeddings.dim}d)`);
  console.log(
    `[server] llm: ${ctx.llm.model} ${ctx.llm.available ? "(active)" : "(heuristic fallback — set GEMINI_API_KEY)"}`,
  );
});

// Graceful shutdown: on a deploy, Fly sends SIGTERM and needs the machine to
// release the /data volume so the new machine can mount it. If we don't close the
// SQLite handle, the volume stays busy ("EBUSY unmounting /data") and the deploy
// stalls / health checks flap. Checkpoint the WAL + close the DB, then exit fast.
let shuttingDown = false;
function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[server] ${signal} — shutting down gracefully`);
  const done = () => {
    try {
      ctx.handle.sqlite.pragma("wal_checkpoint(TRUNCATE)"); // flush WAL into the db file
    } catch { /* best-effort */ }
    try {
      ctx.handle.sqlite.close(); // release the /data file handle so the volume can unmount
    } catch { /* best-effort */ }
    process.exit(0);
  };
  // Stop accepting new connections, then close the DB. Hard-exit after 8s so a
  // lingering keep-alive socket can never hold the volume busy indefinitely.
  server.close(done);
  setTimeout(done, 8000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

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
    // Expire timed-out action items (summarized into the activity log).
    // (The old heartbeat also pruned one weak edge GLOBALLY — cross-tenant
    // mutation from global state, duplicating the autonomy loop's per-space,
    // logged pruning job at a different threshold. Dropped; the loop owns it.)
    expireActionItems();
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

// 24/7 autonomy (Phase C): the thinking agent, server-side. Opt-in via AUTONOMY=on.
// Every tick it iterates each brain, picks ONE meaningful job and runs it — using
// the SAME selection/execution + gating as the browser loop (maintenance/agent.ts):
// LLM-backed work needs Research Mode + USD budget; expansion also needs Fuel; free
// upkeep always runs. So with Research Mode off it just keeps brains tidy for free,
// and it can never exceed the budget. Patrol (a pure no-op log) is skipped to avoid
// log spam. A re-entrancy guard prevents overlapping ticks if an LLM job runs long.
// On by default now (the "while you were away" companion needs her working in the
// background). Fully gated — free upkeep always runs, but paid/LLM work still needs
// Research Mode + budget + Fuel, and withClaim prevents double-running with a browser
// tab — so it can never overspend. Set AUTONOMY=off to disable entirely.
if (process.env.AUTONOMY !== "off") {
  const AUTONOMY_MS = Number(process.env.AUTONOMY_MS ?? 1000 * 60 * 5);
  let running = false;
  setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const rows = ctx.handle.sqlite.prepare(`SELECT id FROM spaces`).all() as { id: string }[];
      const spaceIds = rows.length > 0 ? rows.map((r) => r.id) : [DEFAULT_SPACE];
      // Per-tick ceiling on cloud-LLM jobs across ALL brains, so a deployment with many
      // spaces can't fire a burst of paid work before the USD counter catches up.
      const MAX_PAID_PER_TICK = Number(process.env.AUTONOMY_MAX_PAID_PER_TICK ?? 4);
      const PAID = new Set(["synthesis", "merging", "research", "sector_vibe", "daily_log"]);
      let paidThisTick = 0;
      for (const spaceId of spaceIds) {
        // Keep the auto-derived "About Me" persona current (free, throttled to ~6h).
        try {
          refreshPersona(ctx.handle, spaceId);
        } catch (e) {
          console.error("[autonomy] persona refresh failed:", e);
        }
        // Constellation re-evaluation (free, offline): pull memories that have drifted
        // into a constellation's gravity in as visible members, a few at a time.
        try {
          reconcileConstellations(ctx.handle, spaceId);
        } catch (e) {
          console.error("[autonomy] constellation reconcile failed:", e);
        }
        // Dream cycle (Level 2): once per UTC day per brain, consolidate the densest
        // cluster into a durable belief. LLM when Research Mode + budget allow (counts
        // toward the paid ceiling); otherwise a free offline template. Additive-only.
        try {
          const today = new Date().toISOString().slice(0, 10);
          const dreamt = ctx.handle.sqlite
            .prepare(`SELECT last_dream_date FROM space_meta WHERE space_id = ?`)
            .get(spaceId) as { last_dream_date: string | null } | undefined;
          if (dreamt?.last_dream_date !== today) {
            const canPay =
              researchEnabled(ctx, spaceId) && !ctx.usage.overBudget() && paidThisTick < MAX_PAID_PER_TICK;
            const beliefId = await runDreamCycle(ctx, spaceId, canPay);
            if (beliefId != null) {
              if (canPay) paidThisTick++;
              ctx.handle.sqlite
                .prepare(`INSERT OR IGNORE INTO space_meta (space_id) VALUES (?)`)
                .run(spaceId);
              ctx.handle.sqlite
                .prepare(`UPDATE space_meta SET last_dream_date = ? WHERE space_id = ?`)
                .run(today, spaceId);
              console.log(`[autonomy] ${spaceId.slice(0, 8)}: dreamed belief #${beliefId}`);
            }
          }
        } catch (e) {
          console.error("[autonomy] dream cycle failed:", e);
        }
        // Cognitive gravity (free, offline): pull memories toward the goals /
        // identity / skills they support, so the galaxy models what you're working
        // toward, not just what you remember.
        // Her real background work BURNS a little Fuel, so the gauge visibly drains as
        // she tidies your galaxy (it used to only ever go up unless Research Mode was on).
        // Bounded, and it self-recovers via regen + what you earn logging memories.
        const fuel = new EconomyRepo(ctx.handle, spaceId);
        try {
          const gravityEdges = applyCognitiveGravity(ctx, spaceId);
          if (gravityEdges > 0) fuel.spend(Math.min(gravityEdges, 8) * 0.1);
        } catch (e) {
          console.error("[autonomy] cognitive gravity failed:", e);
        }
        // De-duplication (free, offline): true-merge near-identical memories so the
        // galaxy doesn't sprawl with redundant copies. Bounded per tick; nothing lost.
        try {
          const dm = await sweepDuplicates(ctx, spaceId);
          if (dm > 0) {
            fuel.spend(dm * 0.6);
            console.log(`[autonomy] ${spaceId.slice(0, 8)}: merged ${dm} duplicate memor(ies)`);
          }
        } catch (e) {
          console.error("[autonomy] dedup sweep failed:", e);
        }
        // Working Memory (Cognitive Layer Phase 2): decay the mind space — evaporate
        // spent thought-motes and consolidate the ones that kept coming back into
        // real memories. Free/offline (promotion only embeds locally).
        try {
          const wm = await sweepWorkingMemory(ctx, spaceId);
          if (wm.promoted > 0) {
            console.log(`[autonomy] ${spaceId.slice(0, 8)}: consolidated ${wm.promoted} thought(s)`);
          }
        } catch (e) {
          console.error("[autonomy] working-memory sweep failed:", e);
        }
        // Proactive intelligence (free, offline): notice a new structural connection
        // (a memory bridging two people/goals, sitting near an anchor, or an emerging
        // theme) and raise ONE grounded question for the user to answer.
        try {
          if (generateInquiry(ctx, spaceId) != null) fuel.spend(0.5);
        } catch (e) {
          console.error("[autonomy] inquiry generation failed:", e);
        }
        // Ideas lifecycle (Cognitive Layer Phase 3, free/offline): grow supported
        // ideas, dim + archive ignored ones, merge duplicates. Promotion to a goal
        // stays user-triggered.
        try {
          stepIdeas(ctx, spaceId);
          // Branch a two-thread idea into two (offline-safe naming; skips over-budget).
          await splitRipeIdea(ctx, spaceId);
        } catch (e) {
          console.error("[autonomy] ideas step failed:", e);
        }
        // Skills leveling (Cognitive Layer Phase 4, free/offline): brighten + level
        // up skills from accumulated practice (supporting memories).
        try {
          stepSkills(ctx, spaceId);
        } catch (e) {
          console.error("[autonomy] skills step failed:", e);
        }
        // Identity core (Cognitive Layer Phase 5, free/offline): re-weigh each
        // identity by the memories that affirm vs contest it, brightening/dimming it.
        // After gravity so a negated mention's mis-added supports edge gets corrected.
        try {
          stepIdentities(ctx, spaceId);
        } catch (e) {
          console.error("[autonomy] identity step failed:", e);
        }
        // People (Cognitive Layer Phase 6, free/offline): keep the roster clean by
        // merging duplicate person entities (same name) into one.
        try {
          mergeDuplicatePeople(ctx, spaceId);
        } catch (e) {
          console.error("[autonomy] people merge failed:", e);
        }
        // Phase 7 (free/offline): roll past-due future events into memory, and
        // advance drives — fulfil/expire intentions, brighten motivations.
        try {
          rollPastEvents(ctx, spaceId);
          stepDrives(ctx, spaceId);
        } catch (e) {
          console.error("[autonomy] phase-7 step failed:", e);
        }
        // Undertakings (Level 2): a multi-day arc so her autonomy has narrative.
        // Free (advances by elapsed days, tends one relevant memory per step);
        // start/finish are logged so the user sees the arc begin and complete.
        try {
          const event = stepUndertaking(ctx, spaceId);
          if (event) {
            ctx.handle.sqlite
              .prepare(`INSERT INTO agent_logs (space_id, action, description, targets) VALUES (?, 'undertaking', ?, '[]')`)
              .run(spaceId, event);
          }
        } catch (e) {
          console.error("[autonomy] undertaking step failed:", e);
        }
        const job = await selectJob(ctx, spaceId);
        if (!job || job.type === "patrol") continue; // skip the no-op patrol fallback
        // Once the per-tick paid budget is spent, only free upkeep runs this tick.
        if (PAID.has(job.type) && paidThisTick >= MAX_PAID_PER_TICK) continue;
        if (PAID.has(job.type)) paidThisTick++;
        const detail = await executeJob(ctx, spaceId, job);
        if (detail) {
          console.log(`[autonomy] ${spaceId.slice(0, 8)}: ${job.type}`);
          // Lore mutates as memories change: append a free heuristic chapter to the
          // worked memory so its story grows on its own over time.
          const target = job.targets[0];
          if (target != null) {
            const trig = job.type === "merging" ? "merged" : job.type === "synthesis" ? "linked" : "evolved";
            try {
              evolveLore(ctx.handle, spaceId, "memory", String(target), trig);
            } catch (e) {
              console.error("[autonomy] lore evolve failed:", e);
            }
          }
        }
      }
    } catch (err) {
      console.error("[autonomy] loop error:", err);
    } finally {
      running = false;
    }
  }, AUTONOMY_MS);
  console.log(`[autonomy] server-side loop ON (every ${AUTONOMY_MS}ms)`);
}

// Proactive nudges (Phase B): once per UTC day, push each linked chat its brain's
// daily digest (fresh memories, latent connections, cooling beacons). The sweep is
// idempotent within the day, so an hourly tick simply fires it on the first run
// after midnight UTC. Like the heartbeat, the digest is FREE (no LLM). Opt-in: it
// only runs when a bot token is set, and only chats that /link receive anything.
if (tgToken) {
  const DIGEST_SWEEP_MS = Number(process.env.TELEGRAM_DIGEST_SWEEP_MS ?? 1000 * 60 * 60);
  setInterval(() => {
    void sendDailyDigests(ctx, (chatId, text) => tgSend(tgToken, chatId, text))
      .then((sent) => {
        if (sent > 0) console.log(`[telegram] pushed daily digest to ${sent} chat(s)`);
      })
      .catch((err) => console.error("[telegram] digest sweep error:", err));
  }, DIGEST_SWEEP_MS);
}
