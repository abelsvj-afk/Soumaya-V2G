import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { HashEmbeddingProvider } from "../embeddings/hash.js";
import { EMBED_DIM } from "../db/vec.js";
import { NodesRepo } from "../repositories/nodes.repo.js";
import { InsightsRepo } from "../repositories/insights.repo.js";
import { reconstructEntityTimeline } from "./entityTimeline.js";
import { computeRelevance } from "./relevance.js";
import type { ProvenanceRef } from "@brain/shared";

/**
 * Maya Longitudinal Intelligence, Phase D (docs/specs/maya-longitudinal-intelligence.md,
 * Section 13) — `computeRelevance`. Covers the task's full enumerated matrix: basic, durability,
 * reinforcement, recency, supersession, entity timeline, causal, epistemic, context dependence,
 * space isolation, and bounds.
 */

let handle: DbHandle;
const embeddings = new HashEmbeddingProvider(EMBED_DIM);
beforeEach(() => {
  handle = createDb(":memory:");
});
afterEach(() => handle.sqlite.close());

async function makeNode(
  spaceId: string,
  label: string,
  content: string,
  opts: { occurredAt?: string; kind?: string; lastTendedAt?: string | null } = {},
) {
  const repo = new NodesRepo(handle, spaceId);
  const emb = await embeddings.embed(content);
  const node = repo.create({ label, content, type: "other", occurredAt: opts.occurredAt, kind: opts.kind as any }, emb);
  if (opts.lastTendedAt !== undefined) {
    handle.sqlite.prepare(`UPDATE nodes SET last_tended_at = ? WHERE id = ?`).run(opts.lastTendedAt, node.id);
  }
  return node;
}

const ref = (id: number): ProvenanceRef => ({ domain: "memory", kind: "node", id });
const FAR_PAST = "2020-01-01T00:00:00.000Z"; // well beyond the ~21-day cooling curve

describe("basic", () => {
  it("returns [] for an empty candidate set", () => {
    expect(computeRelevance(handle, "s1", [])).toEqual([]);
  });

  it("returns exactly one result for one candidate", async () => {
    const n = await makeNode("s1", "Solo", "Just a note.");
    const out = computeRelevance(handle, "s1", [ref(n.id)]);
    expect(out).toHaveLength(1);
    expect(out[0]!.ref.id).toBe(n.id);
  });

  it("returns a result per candidate for multiple candidates", async () => {
    const a = await makeNode("s1", "A", "A note.");
    const b = await makeNode("s1", "B", "B note.");
    const out = computeRelevance(handle, "s1", [ref(a.id), ref(b.id)]);
    expect(out.map((r) => r.ref.id)).toEqual([a.id, b.id]);
  });

  it("is deterministic — identical input produces identical output", async () => {
    const a = await makeNode("s1", "A", "A note.", { lastTendedAt: FAR_PAST });
    const first = computeRelevance(handle, "s1", [ref(a.id)]);
    const second = computeRelevance(handle, "s1", [ref(a.id)]);
    expect(first).toEqual(second);
  });

  it("preserves input order regardless of tier (stable ordering)", async () => {
    const low = await makeNode("s1", "Low", "Low note.", { lastTendedAt: FAR_PAST });
    const high = await makeNode("s1", "High", "High note.", { kind: "life_vision" });
    const out = computeRelevance(handle, "s1", [ref(low.id), ref(high.id)]);
    expect(out.map((r) => r.ref.id)).toEqual([low.id, high.id]);
  });
});

describe("durability", () => {
  it("durable knowledge remains 'high' relevance despite age and no reinforcement", async () => {
    const n = await makeNode("s1", "My life vision", "Build a trucking company.", {
      kind: "life_vision",
      occurredAt: FAR_PAST,
      lastTendedAt: FAR_PAST,
    });
    const [r] = computeRelevance(handle, "s1", [ref(n.id)]);
    expect(r!.tier).toBe("high");
    expect(r!.reasons.some((x) => x.includes("durable"))).toBe(true);
  });

  it("non-durable knowledge can cool to 'low' when old, untended, and otherwise unremarkable", async () => {
    const n = await makeNode("s1", "Old preference", "I liked that restaurant once.", { lastTendedAt: FAR_PAST });
    const [r] = computeRelevance(handle, "s1", [ref(n.id)]);
    expect(r!.tier).toBe("low");
  });

  it("durability does not alter the memory's own content — relevance is read-only", async () => {
    const n = await makeNode("s1", "Vision", "Build a trucking company.", { kind: "life_vision" });
    const before = handle.sqlite.prepare(`SELECT label, content FROM nodes WHERE id = ?`).get(n.id);
    computeRelevance(handle, "s1", [ref(n.id)]);
    const after = handle.sqlite.prepare(`SELECT label, content FROM nodes WHERE id = ?`).get(n.id);
    expect(after).toEqual(before);
  });
});

describe("reinforcement", () => {
  it("repeatedly-connected knowledge gets at least 'moderate' relevance", async () => {
    const n = await makeNode("s1", "Recurring theme", "A recurring theme.");
    const insights = new InsightsRepo(handle, "s1");
    const other1 = await makeNode("s1", "Other1", "Other1.");
    const other2 = await makeNode("s1", "Other2", "Other2.");
    insights.create(n.id, other1.id, "connection", 0.6, "synthesis");
    insights.create(n.id, other2.id, "connection", 0.6, "synthesis");

    const [r] = computeRelevance(handle, "s1", [ref(n.id)]);
    expect(r!.tier).not.toBe("low");
    expect(r!.reasons.some((x) => x.includes("reinforced"))).toBe(true);
  });

  it("a single mention does not become important merely because it exists", async () => {
    const n = await makeNode("s1", "One mention", "Mentioned once.", { lastTendedAt: FAR_PAST });
    const other = await makeNode("s1", "Other", "Other.");
    new InsightsRepo(handle, "s1").create(n.id, other.id, "connection", 0.6, "synthesis");

    const [r] = computeRelevance(handle, "s1", [ref(n.id)]);
    // One insight is below REINFORCEMENT_MIN (2) and this node is otherwise cold/unremarkable.
    expect(r!.tier).toBe("low");
  });

  it("reinforcement never touches epistemic status — it's a relevance signal, not a truth signal", async () => {
    const n = await makeNode("s1", "Recurring", "Something.");
    const other1 = await makeNode("s1", "O1", "O1.");
    const other2 = await makeNode("s1", "O2", "O2.");
    new InsightsRepo(handle, "s1").create(n.id, other1.id, "c", 0.6, "synthesis");
    new InsightsRepo(handle, "s1").create(n.id, other2.id, "c", 0.6, "synthesis");

    const before = reconstructEntityTimeline(handle, "s1", ref(n.id));
    computeRelevance(handle, "s1", [ref(n.id)]);
    const after = reconstructEntityTimeline(handle, "s1", ref(n.id));
    expect(after).toEqual(before);
  });
});

describe("recency", () => {
  it("recent, freshly-tended information is not automatically demoted to 'low'", async () => {
    const n = await makeNode("s1", "Fresh", "Just noted this.");
    const [r] = computeRelevance(handle, "s1", [ref(n.id)]);
    expect(r!.tier).not.toBe("low");
  });

  it("age alone does not invalidate durable information", async () => {
    const n = await makeNode("s1", "Old vision", "A long-held vision.", { kind: "life_vision", lastTendedAt: FAR_PAST, occurredAt: FAR_PAST });
    const [r] = computeRelevance(handle, "s1", [ref(n.id)]);
    expect(r!.tier).toBe("high");
  });

  it("being recent does not automatically outrank durable information", async () => {
    const recent = await makeNode("s1", "Recent note", "Just thought of this.");
    const durable = await makeNode("s1", "Vision", "Long-term vision.", { kind: "life_vision", lastTendedAt: FAR_PAST });
    const out = computeRelevance(handle, "s1", [ref(recent.id), ref(durable.id)]);
    const recentTier = out.find((r) => r.ref.id === recent.id)!.tier;
    const durableTier = out.find((r) => r.ref.id === durable.id)!.tier;
    expect(durableTier).toBe("high");
    expect(recentTier).not.toBe("high"); // recency alone never earns the top tier
  });
});

describe("supersession (reuses Phase B/C, no second algorithm)", () => {
  it("a superseded, non-durable state does not dominate current-state reasoning", async () => {
    const sp = "s1";
    const civic = await makeNode(sp, "Civic", "I only have one car.", { occurredAt: "2026-01-01T00:00:00.000Z", lastTendedAt: FAR_PAST });
    const twoCars = await makeNode(sp, "Two cars", "I now have two cars.", { occurredAt: "2026-02-01T00:00:00.000Z" });
    new InsightsRepo(handle, sp).create(civic.id, twoCars.id, "conflict", 0.8, "contradiction");

    const timeline = reconstructEntityTimeline(handle, sp, ref(civic.id));
    expect(timeline.find((e) => e.source.id === civic.id)?.status).toBe("contradicted"); // sanity: Phase B/C actually resolved it

    const out = computeRelevance(handle, sp, [ref(civic.id), ref(twoCars.id)], { timeline });
    expect(out.find((r) => r.ref.id === civic.id)!.tier).toBe("low");
  });

  it("the superseded state still gets a result — historically available, not dropped", async () => {
    const sp = "s1";
    const civic = await makeNode(sp, "Civic", "I only have one car.", { occurredAt: "2026-01-01T00:00:00.000Z" });
    const twoCars = await makeNode(sp, "Two cars", "I now have two cars.", { occurredAt: "2026-02-01T00:00:00.000Z" });
    new InsightsRepo(handle, sp).create(civic.id, twoCars.id, "conflict", 0.8, "contradiction");
    const timeline = reconstructEntityTimeline(handle, sp, ref(civic.id));

    const out = computeRelevance(handle, sp, [ref(civic.id), ref(twoCars.id)], { timeline });
    expect(out.map((r) => r.ref.id)).toContain(civic.id);
  });

  it("the current side of a resolved pair is never marked 'low' merely for being paired with a superseded one", async () => {
    const sp = "s1";
    const civic = await makeNode(sp, "Civic", "I only have one car.", { occurredAt: "2026-01-01T00:00:00.000Z" });
    const twoCars = await makeNode(sp, "Two cars", "I now have two cars.", { occurredAt: "2026-02-01T00:00:00.000Z" });
    new InsightsRepo(handle, sp).create(civic.id, twoCars.id, "conflict", 0.8, "contradiction");
    const timeline = reconstructEntityTimeline(handle, sp, ref(civic.id));

    const out = computeRelevance(handle, sp, [ref(twoCars.id)], { timeline });
    expect(out[0]!.tier).not.toBe("low");
  });
});

describe("entity timeline integration", () => {
  it("a Phase C timeline can supply both current and historical context to the combiner", async () => {
    const sp = "s1";
    const civic = await makeNode(sp, "Civic", "I have one car.", { occurredAt: "2026-01-01T00:00:00.000Z" });
    const accident = await makeNode(sp, "Accident", "Got in an accident.", { occurredAt: "2026-02-01T00:00:00.000Z" });
    new InsightsRepo(handle, sp).create(civic.id, accident.id, "conflict", 0.8, "contradiction");
    const timeline = reconstructEntityTimeline(handle, sp, ref(civic.id));
    expect(timeline.length).toBeGreaterThan(1);

    const out = computeRelevance(
      handle,
      sp,
      timeline.map((e) => e.source),
      { timeline },
    );
    expect(out).toHaveLength(timeline.length); // every timeline event still gets a verdict
  });

  it("computing relevance never mutates the entity timeline's own source records", async () => {
    const sp = "s1";
    const civic = await makeNode(sp, "Civic", "I have one car.", { occurredAt: "2026-01-01T00:00:00.000Z" });
    const accident = await makeNode(sp, "Accident", "Got in an accident.", { occurredAt: "2026-02-01T00:00:00.000Z" });
    new InsightsRepo(handle, sp).create(civic.id, accident.id, "conflict", 0.8, "contradiction");
    const timeline = reconstructEntityTimeline(handle, sp, ref(civic.id));

    const before = handle.sqlite.prepare(`SELECT label, content FROM nodes WHERE id = ?`).get(civic.id);
    computeRelevance(handle, sp, [ref(civic.id)], { timeline });
    const after = handle.sqlite.prepare(`SELECT label, content FROM nodes WHERE id = ?`).get(civic.id);
    expect(after).toEqual(before);
  });
});

describe("causal connection (externally supplied — no new causal reasoning here)", () => {
  it("an existing causal connection preserves relevance for an otherwise-superseded fact", async () => {
    const sp = "s1";
    const civic = await makeNode(sp, "Civic", "I only have one car.", { occurredAt: "2026-01-01T00:00:00.000Z", lastTendedAt: FAR_PAST });
    const twoCars = await makeNode(sp, "Two cars", "I now have two cars.", { occurredAt: "2026-02-01T00:00:00.000Z" });
    new InsightsRepo(handle, sp).create(civic.id, twoCars.id, "conflict", 0.8, "contradiction");
    const timeline = reconstructEntityTimeline(handle, sp, ref(civic.id));

    const withoutCausal = computeRelevance(handle, sp, [ref(civic.id)], { timeline });
    expect(withoutCausal[0]!.tier).toBe("low");

    const withCausal = computeRelevance(handle, sp, [ref(civic.id)], { timeline, causallyConnectedIds: [civic.id] });
    expect(withCausal[0]!.tier).not.toBe("low");
  });

  it("computeRelevance never writes a new insight/causal row of its own", async () => {
    const n = await makeNode("s1", "A", "A note.");
    const before = (handle.sqlite.prepare(`SELECT COUNT(*) AS c FROM insights`).get() as { c: number }).c;
    computeRelevance(handle, "s1", [ref(n.id)], { causallyConnectedIds: [n.id] });
    const after = (handle.sqlite.prepare(`SELECT COUNT(*) AS c FROM insights`).get() as { c: number }).c;
    expect(after).toBe(before);
  });
});

describe("epistemic safety", () => {
  it("relevance never promotes or alters any candidate's epistemic status, for any status this codebase actually produces", async () => {
    // Honest scope note (matches this feature's own prior-phase pattern): "inference"/
    // "hypothesis"/"possible"/"observation" have no per-node producer to even attach to an
    // EntityStateEvent (Phase C's own documented scoping — those describe cross-node
    // IntelligenceClaims, not a single memory). What IS directly testable here is every status
    // this module's own dependencies (Phase B/C) DO produce: "fact", "confirmed", "outdated",
    // "contradicted" — proving relevance never changes any of them.
    const sp = "s1";
    const civic = await makeNode(sp, "Civic", "I have one car.", { occurredAt: "2026-01-01T00:00:00.000Z" });
    const accident = await makeNode(sp, "Accident", "Got in an accident.", { occurredAt: "2026-02-01T00:00:00.000Z" });
    new InsightsRepo(handle, sp).create(civic.id, accident.id, "conflict", 0.8, "contradiction");
    const newCar = await makeNode(sp, "New car", "Bought a new one.", { occurredAt: "2026-03-01T00:00:00.000Z", kind: undefined });
    handle.sqlite.prepare(`INSERT INTO edges (space_id, source, target, relationship) VALUES (?, ?, ?, 'resolves')`).run(sp, newCar.id, civic.id);

    const before = reconstructEntityTimeline(handle, sp, ref(civic.id));
    const statusesBefore = new Map(before.map((e) => [e.source.id, e.status]));
    expect(statusesBefore.get(civic.id)).toBe("contradicted");
    expect(statusesBefore.get(newCar.id)).toBe("confirmed");

    computeRelevance(handle, sp, before.map((e) => e.source), { timeline: before, causallyConnectedIds: [civic.id] });

    const after = reconstructEntityTimeline(handle, sp, ref(civic.id));
    const statusesAfter = new Map(after.map((e) => [e.source.id, e.status]));
    expect(statusesAfter).toEqual(statusesBefore);
  });
});

describe("context dependence (the actual mechanism, not hard-coded subjects)", () => {
  it("the SAME candidate scores differently depending on the current topic", async () => {
    const sp = "s1";
    const experience = await makeNode(sp, "Trucking experience", "Drove trucks for Western Express for two years.");
    const truckingTopic = await makeNode(sp, "Trucking topic", "Drove trucks for Western Express for two years.");
    const unrelatedTopic = await makeNode(sp, "Unrelated topic", "What should I cook for dinner tonight?");

    const withTruckingTopic = computeRelevance(handle, sp, [ref(experience.id)], { topic: ref(truckingTopic.id) });
    const withUnrelatedTopic = computeRelevance(handle, sp, [ref(experience.id)], { topic: ref(unrelatedTopic.id) });

    expect(withTruckingTopic[0]!.tier).toBe("high");
    expect(withUnrelatedTopic[0]!.tier).not.toBe("high");
  });

  it("omitting a topic skips the context-match rule entirely rather than guessing", async () => {
    const n = await makeNode("s1", "Note", "Some note.");
    const out = computeRelevance(handle, "s1", [ref(n.id)]); // no context.topic
    expect(out[0]!.reasons.some((r) => r.includes("topic similarity"))).toBe(false);
  });
});

describe("space isolation", () => {
  it("a candidate id from another space is silently dropped, not resolved", async () => {
    const n = await makeNode("space-a", "A", "A note.");
    const out = computeRelevance(handle, "space-b", [ref(n.id)]);
    expect(out).toEqual([]);
  });

  it("a mis-scoped insight row never inflates reinforcement across a space boundary", async () => {
    const n = await makeNode("space-a", "A", "A note.", { lastTendedAt: FAR_PAST });
    const other = await makeNode("space-a", "B", "B note.");
    // Defensively mis-scoped row: claims a different space than the nodes it references.
    handle.sqlite
      .prepare(`INSERT INTO insights (space_id, node_a, node_b, text, score, kind) VALUES ('space-x', ?, ?, 'x', 0.5, 'synthesis')`)
      .run(n.id, other.id);

    const out = computeRelevance(handle, "space-a", [ref(n.id)]);
    expect(out[0]!.reasons.some((r) => r.includes("reinforced"))).toBe(false);
  });
});

describe("bounds", () => {
  it("a large unrelated candidate population never triggers a full-space scan", async () => {
    const sp = "s1";
    const target = await makeNode(sp, "Target", "Something specific.");
    for (let i = 0; i < 60; i++) await makeNode(sp, `Unrelated ${i}`, `Completely unrelated ${i}.`);

    const allSpy = vi.spyOn(NodesRepo.prototype, "all");
    try {
      const out = computeRelevance(handle, sp, [ref(target.id)]);
      expect(out).toHaveLength(1);
      expect(allSpy).not.toHaveBeenCalled();
    } finally {
      allSpy.mockRestore();
    }
  });

  it("scales with candidate count, not total memory count — a larger candidate batch still resolves correctly", async () => {
    const sp = "s1";
    const nodes = [];
    for (let i = 0; i < 40; i++) nodes.push(await makeNode(sp, `N${i}`, `Note ${i}.`));
    const out = computeRelevance(handle, sp, nodes.map((n) => ref(n.id)));
    expect(out).toHaveLength(40);
  });
});
