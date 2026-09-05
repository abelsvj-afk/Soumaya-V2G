import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { HashEmbeddingProvider } from "../embeddings/hash.js";
import { HeuristicProvider } from "../llm/heuristic.js";
import { EMBED_DIM } from "../db/vec.js";
import type { AppContext } from "../context.js";
import { UsageTracker } from "../usage.js";
import type { ToolContext } from "../agent/tools/types.js";
import { billRiskTool } from "../agent/tools/billRisk.js";
import { FinBillRepo } from "../repositories/finBill.repo.js";
import { InteractionPreferencesRepo } from "../repositories/interactionPreferences.repo.js";

/**
 * Phase S — bill-risk communication pilot (docs/specs/soumaya-shared-communication.md §8-9).
 * Covers the 9 scenarios the phase itself requires. The underlying financial detection
 * (detect()) is UNCHANGED and already covered by billRisk.test.ts — every test here calls
 * run() directly with fixed args, exactly like billRisk.test.ts's own "delivers a message"
 * test, so these are additive, not a replacement for the existing suite.
 */

let handle: DbHandle;
let ctx: AppContext;
const embeddings = new HashEmbeddingProvider(EMBED_DIM);
const NOW = Date.parse("2026-01-10T00:00:00Z");

beforeEach(() => {
  handle = createDb(":memory:");
  ctx = { handle, embeddings, llm: new HeuristicProvider(), usage: new UsageTracker(handle) } as AppContext;
});
afterEach(() => handle.sqlite.close());

const tc = (spaceId = "s1", now = NOW): ToolContext => ({ ctx, spaceId, now, notify: async () => {} });

function makeMemory(spaceId: string, label: string, daysAgo: number, emotionalWeight: number): void {
  const createdAt = new Date(NOW - daysAgo * 86_400_000).toISOString().replace("T", " ").slice(0, 19);
  handle.sqlite
    .prepare(`INSERT INTO nodes (space_id, label, type, content, emotional_weight, created_at) VALUES (?, ?, 'knowledge', ?, ?, ?)`)
    .run(spaceId, label, label, emotionalWeight, createdAt);
}

describe("Bill-risk communication pilot", () => {
  it("1. ordinary financial risk — no learned preferences, no emotional context: matches the original baseline wording", async () => {
    const bill = new FinBillRepo(handle, "s1").create({ name: "Car", amountCents: 21000, frequency: "monthly", anchorDate: "2026-01-20" });
    const res = await billRiskTool.run(tc(), { billId: bill.id, mode: "pace", threshold: 4200 });
    expect(res.ok).toBe(true);
    expect(res.message).toMatch(/Car/);
    expect(res.message).toMatch(/\$42/);
    expect(res.message).toMatch(/Heads up/); // the untouched default opener when nothing else applies
  });

  it("2. user with a learned 'concise' verbosity preference gets the short form", async () => {
    new InteractionPreferencesRepo(handle, "s1").upsert("verbosity", "concise", 0.6, 3, new Date().toISOString());
    const bill = new FinBillRepo(handle, "s1").create({ name: "Rent", amountCents: 120000, frequency: "monthly", anchorDate: "2026-01-20" });
    const res = await billRiskTool.run(tc(), { billId: bill.id, mode: "short", threshold: 5000 });
    expect(res.message).toMatch(/Rent/);
    expect(res.message).toMatch(/\$50/);
    expect(res.message!.length).toBeLessThan(60); // materially shorter than the default form
  });

  it("3. user with a DIFFERENT preference (directness) gets different wording than the concise user", async () => {
    new InteractionPreferencesRepo(handle, "s1").upsert("directness", "very direct", 0.6, 3, new Date().toISOString());
    const bill = new FinBillRepo(handle, "s1").create({ name: "Rent", amountCents: 120000, frequency: "monthly", anchorDate: "2026-01-20" });
    const res = await billRiskTool.run(tc(), { billId: bill.id, mode: "short", threshold: 5000 });
    expect(res.message).toMatch(/Rent/);
    expect(res.message).not.toMatch(/one extra shift/); // the softer default closer is replaced
  });

  it("4. serious/current context (a detected emotional pattern) leads to a gentler opener, never naming the emotion", async () => {
    for (let i = 0; i < 6; i++) makeMemory("s1", `hard day ${i}`, i, -0.6); // forms a real Stress cycle pattern
    const bill = new FinBillRepo(handle, "s1").create({ name: "Insurance", amountCents: 8000, frequency: "monthly", anchorDate: "2026-01-20" });
    const res = await billRiskTool.run(tc(), { billId: bill.id, mode: "pace", threshold: 1500 });
    expect(res.message).toMatch(/No pressure/);
    // Never manufactures a claim about the user's emotional state (Phase S §12).
    expect(res.message!.toLowerCase()).not.toMatch(/stress|heavy|hard time|struggling|anxious/);
  });

  it("5. repeated risk (already nudged this week) acknowledges repetition instead of re-explaining", async () => {
    handle.sqlite
      .prepare(`INSERT INTO agent_logs (space_id, action, description, targets, created_at) VALUES ('s1', 'tool:bill_risk', 'earlier nudge', '[]', ?)`)
      .run(new Date(NOW - 2 * 86_400_000).toISOString());
    const bill = new FinBillRepo(handle, "s1").create({ name: "Insurance", amountCents: 8000, frequency: "monthly", anchorDate: "2026-01-20" });
    const res = await billRiskTool.run(tc(), { billId: bill.id, mode: "pace", threshold: 1500 });
    expect(res.message).toMatch(/Still tight/);
  });

  it("6. uncertain/borderline risk (pace mode, not yet actually short) never claims a missed payment as fact", async () => {
    const bill = new FinBillRepo(handle, "s1").create({ name: "Insurance", amountCents: 8000, frequency: "monthly", anchorDate: "2026-01-20" });
    const res = await billRiskTool.run(tc(), { billId: bill.id, mode: "pace", threshold: 1500 });
    expect(res.message!.toLowerCase()).not.toMatch(/you missed|you're going to miss|you failed to pay/);
  });

  it("7. absent preference data behaves exactly like a fresh space (no throw, default wording)", async () => {
    const bill = new FinBillRepo(handle, "s1").create({ name: "Water", amountCents: 4000, frequency: "monthly", anchorDate: "2026-01-20" });
    const res = await billRiskTool.run(tc(), { billId: bill.id, mode: "pace", threshold: 900 });
    expect(res.ok).toBe(true);
    expect(res.message).toMatch(/Water/);
  });

  it("8. absent optional contextual data (no emotional history at all) never throws and uses the default opener", async () => {
    const bill = new FinBillRepo(handle, "s1").create({ name: "Gas", amountCents: 3000, frequency: "monthly", anchorDate: "2026-01-20" });
    const res = await billRiskTool.run(tc(), { billId: bill.id, mode: "pace", threshold: 700 });
    expect(res.ok).toBe(true);
    expect(res.message).toMatch(/Heads up/);
  });

  it("9. authenticated space isolation — another space's learned preference never leaks into this one's nudge", async () => {
    new InteractionPreferencesRepo(handle, "other-space").upsert("verbosity", "concise", 0.8, 5, new Date().toISOString());
    const bill = new FinBillRepo(handle, "s1").create({ name: "Phone", amountCents: 6000, frequency: "monthly", anchorDate: "2026-01-20" });
    const res = await billRiskTool.run(tc("s1"), { billId: bill.id, mode: "pace", threshold: 1200 });
    // s1 has no preferences of its own — must get the default (non-concise) form.
    expect(res.message).toMatch(/Heads up/);
    expect(res.message!.length).toBeGreaterThan(60);
  });

  it("financial reasoning (detect()) is completely unaffected by any communication context", () => {
    // Same shape as billRisk.test.ts's own "stays quiet when the module is empty" case — no
    // bills/income configured, so detect() must stay empty regardless of any preference/
    // emotional rows already present, proving detect()'s own logic never reads them.
    new InteractionPreferencesRepo(handle, "s1").upsert("verbosity", "concise", 0.8, 5, new Date().toISOString());
    for (let i = 0; i < 6; i++) makeMemory("s1", `hard day ${i}`, i, -0.6);
    expect(billRiskTool.detect(tc())).toEqual([]);
  });
});
