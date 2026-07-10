import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { HashEmbeddingProvider } from "../embeddings/hash.js";
import { HeuristicProvider } from "../llm/heuristic.js";
import { EMBED_DIM } from "../db/vec.js";
import type { AppContext } from "../context.js";
import { UsageTracker } from "../usage.js";
import { runToolRouter } from "../agent/tools/router.js";

let handle: DbHandle;
let ctx: AppContext;
const embeddings = new HashEmbeddingProvider(EMBED_DIM);

beforeEach(() => {
  handle = createDb(":memory:");
  ctx = { handle, embeddings, llm: new HeuristicProvider(), usage: new UsageTracker(handle) } as AppContext;
});
afterEach(() => handle.sqlite.close());

const iso = (ms: number) => new Date(ms).toISOString();

/** Insert a memory carrying a reminder at `remindAt` (ISO), returns its id. */
function reminder(label: string, remindAt: string): number {
  const info = handle.sqlite
    .prepare(`INSERT INTO nodes (space_id, label, type, content, remind_at) VALUES ('legacy', ?, 'daily', '', ?)`)
    .run(label, remindAt);
  return Number(info.lastInsertRowid);
}
const firedAt = (id: number) =>
  (handle.sqlite.prepare(`SELECT reminder_fired_at AS f FROM nodes WHERE id = ?`).get(id) as { f: string | null }).f;

describe("Soumaya's tool-router — firing reminders", () => {
  it("fires a due reminder exactly once and marks it fired", async () => {
    const now = Date.UTC(2026, 2, 1, 12, 0, 0);
    const id = reminder("call the landlord", iso(now - 60_000)); // due a minute ago
    const sent: string[] = [];
    const notify = async (_space: string, text: string) => void sent.push(text);

    const r1 = await runToolRouter(ctx, "legacy", { now, notify });
    expect(r1.some((r) => r.ok && r.delivered)).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain("call the landlord");
    expect(firedAt(id)).not.toBeNull();

    // Second pass: already fired → nothing delivered again.
    const r2 = await runToolRouter(ctx, "legacy", { now: now + 60_000, notify });
    expect(r2).toHaveLength(0);
    expect(sent).toHaveLength(1);
  });

  it("does NOT fire a reminder whose time hasn't arrived", async () => {
    const now = Date.UTC(2026, 2, 1, 12, 0, 0);
    reminder("dentist next week", iso(now + 7 * 86_400_000));
    const sent: string[] = [];
    await runToolRouter(ctx, "legacy", { now, notify: async (_s, t) => void sent.push(t) });
    expect(sent).toHaveLength(0);
  });

  it("retires a badly-overdue reminder silently (marks fired, no spam)", async () => {
    const now = Date.UTC(2026, 2, 1, 12, 0, 0);
    const id = reminder("was due ages ago", iso(now - 10 * 86_400_000)); // 10 days overdue
    const sent: string[] = [];
    const r = await runToolRouter(ctx, "legacy", { now, notify: async (_s, t) => void sent.push(t) });
    expect(r.some((x) => x.ok && !x.delivered)).toBe(true);
    expect(sent).toHaveLength(0); // not delivered
    expect(firedAt(id)).not.toBeNull(); // but marked so it never comes back
  });

  it("never fires a deleted memory's reminder", async () => {
    const now = Date.UTC(2026, 2, 1, 12, 0, 0);
    const id = reminder("deleted thing", iso(now - 60_000));
    handle.sqlite.prepare(`UPDATE nodes SET deleted_at = ? WHERE id = ?`).run(iso(now), id);
    const sent: string[] = [];
    await runToolRouter(ctx, "legacy", { now, notify: async (_s, t) => void sent.push(t) });
    expect(sent).toHaveLength(0);
  });

  it("logs every action to agent_logs (in-app record even with no channel)", async () => {
    const now = Date.UTC(2026, 2, 1, 12, 0, 0);
    reminder("log me", iso(now - 60_000));
    await runToolRouter(ctx, "legacy", { now }); // no notify → offline path
    const logs = handle.sqlite
      .prepare(`SELECT action FROM agent_logs WHERE space_id = 'legacy' AND action = 'tool:fire_reminder'`)
      .all() as { action: string }[];
    expect(logs.length).toBe(1);
  });
});
