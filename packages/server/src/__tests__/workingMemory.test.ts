import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { HashEmbeddingProvider } from "../embeddings/hash.js";
import { HeuristicProvider } from "../llm/heuristic.js";
import { EMBED_DIM } from "../db/vec.js";
import type { AppContext } from "../context.js";
import { UsageTracker } from "../usage.js";
import {
  addThought,
  listThoughts,
  reinforceThought,
  dismissThought,
  promoteThought,
  editThought,
  sweepWorkingMemory,
} from "../analysis/workingMemory.js";

let handle: DbHandle;
let ctx: AppContext;
const embeddings = new HashEmbeddingProvider(EMBED_DIM);

beforeEach(() => {
  handle = createDb(":memory:");
  ctx = { handle, embeddings, llm: new HeuristicProvider(), usage: new UsageTracker(handle) } as AppContext;
});
afterEach(() => handle.sqlite.close());

/** Backdate a mote's decay clock so decay/sweep can be tested deterministically. */
function ageThought(id: number, hours: number) {
  handle.sqlite
    .prepare(`UPDATE working_memory SET reinforced_at = datetime('now', ?) WHERE id = ?`)
    .run(`-${hours} hours`, id);
}

describe("working memory (the ephemeral mind space)", () => {
  it("adds a thought and lists it with a fresh, full-ish charge", () => {
    addThought(ctx, "legacy", "finish the cognitive layer");
    const live = listThoughts(ctx, "legacy");
    expect(live.length).toBe(1);
    expect(live[0]!.text).toBe("finish the cognitive layer");
    expect(live[0]!.strength).toBeGreaterThan(0.5);
  });

  it("decays over time and drops out of the live list once spent", () => {
    const id = addThought(ctx, "legacy", "a fleeting thought");
    ageThought(id, 40); // ~0.62 - 0.008*40 = ~0.30 → still alive (slow, days-long decay)
    expect(listThoughts(ctx, "legacy")[0]!.strength).toBeCloseTo(0.3, 1);
    ageThought(id, 90); // ~3.75 days → fully decayed → gone from the live list
    expect(listThoughts(ctx, "legacy").length).toBe(0);
  });

  it("sweep evaporates fully-decayed motes", async () => {
    const a = addThought(ctx, "legacy", "keep");
    const b = addThought(ctx, "legacy", "let go");
    ageThought(b, 90);
    const { evaporated } = await sweepWorkingMemory(ctx, "legacy");
    expect(evaporated).toBe(1);
    const live = listThoughts(ctx, "legacy");
    expect(live.length).toBe(1);
    expect(live[0]!.text).toBe("keep");
    void a;
  });

  it("reinforcing tops the charge back up and resets the decay clock", async () => {
    const id = addThought(ctx, "legacy", "recurring idea");
    ageThought(id, 5); // decayed toward ~0.22
    const before = listThoughts(ctx, "legacy")[0]!.strength;
    await reinforceThought(ctx, "legacy", id);
    const after = listThoughts(ctx, "legacy")[0]!.strength;
    expect(after).toBeGreaterThan(before);
  });

  it("auto-promotes a thought reinforced enough into a real memory node", async () => {
    const id = addThought(ctx, "legacy", "this keeps coming back");
    let promotedNodeId: number | null = null;
    // 3rd reinforce crosses PROMOTE_COUNT → consolidation.
    await reinforceThought(ctx, "legacy", id);
    await reinforceThought(ctx, "legacy", id);
    const r = await reinforceThought(ctx, "legacy", id);
    promotedNodeId = r.promotedNodeId;
    expect(promotedNodeId).not.toBeNull();
    // The mote is gone from working memory...
    expect(listThoughts(ctx, "legacy").length).toBe(0);
    // ...and a real node now exists in the galaxy.
    const node = handle.sqlite
      .prepare(`SELECT content, kind FROM nodes WHERE id = ?`)
      .get(promotedNodeId) as { content: string; kind: string };
    expect(node.content).toBe("this keeps coming back");
    expect(node.kind).toBe("memory");
    // A consolidation was logged.
    const log = handle.sqlite
      .prepare(`SELECT COUNT(*) AS c FROM agent_logs WHERE space_id = 'legacy' AND action = 'consolidated'`)
      .get() as { c: number };
    expect(log.c).toBe(1);
  });

  it("manual promote consolidates immediately and removes the mote", async () => {
    const id = addThought(ctx, "legacy", "promote me now");
    const nodeId = await promoteThought(ctx, "legacy", id);
    expect(nodeId).not.toBeNull();
    expect(listThoughts(ctx, "legacy").length).toBe(0);
  });

  it("edits a thought's text (keeping it in the mind space)", () => {
    const id = addThought(ctx, "legacy", "buy milk");
    expect(editThought(ctx, "legacy", id, "buy oat milk")).toBe(true);
    expect(listThoughts(ctx, "legacy")[0]!.text).toBe("buy oat milk");
    expect(editThought(ctx, "legacy", 999999, "nope")).toBe(false);
  });

  it("dismiss removes a thought; missing ids are handled", () => {
    const id = addThought(ctx, "legacy", "nevermind");
    expect(dismissThought(ctx, "legacy", id)).toBe(true);
    expect(dismissThought(ctx, "legacy", 999999)).toBe(false);
    expect(listThoughts(ctx, "legacy").length).toBe(0);
  });

  it("reinforce/promote on a missing id report not-found", async () => {
    expect((await reinforceThought(ctx, "legacy", 424242)).ok).toBe(false);
    expect(await promoteThought(ctx, "legacy", 424242)).toBeNull();
  });

  it("keeps the mind space bounded (weakest trimmed past the cap)", () => {
    for (let i = 0; i < 40; i++) addThought(ctx, "legacy", `thought ${i}`);
    const count = (handle.sqlite
      .prepare(`SELECT COUNT(*) AS c FROM working_memory WHERE space_id = 'legacy'`)
      .get() as { c: number }).c;
    expect(count).toBeLessThanOrEqual(30);
  });

  it("scopes thoughts per space", () => {
    addThought(ctx, "legacy", "mine");
    addThought(ctx, "other", "theirs");
    expect(listThoughts(ctx, "legacy").length).toBe(1);
    expect(listThoughts(ctx, "other").length).toBe(1);
    expect(listThoughts(ctx, "legacy")[0]!.text).toBe("mine");
  });
});
