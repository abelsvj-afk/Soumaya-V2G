import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { HashEmbeddingProvider } from "../embeddings/hash.js";
import { HeuristicProvider } from "../llm/heuristic.js";
import { EMBED_DIM } from "../db/vec.js";
import { ingest } from "../ingestion/pipeline.js";
import { NodesRepo } from "../repositories/nodes.repo.js";
import { EdgesRepo } from "../repositories/edges.repo.js";
import { InsightsRepo } from "../repositories/insights.repo.js";
import { reconstructEntityTimeline } from "./entityTimeline.js";
import type { ProvenanceRef } from "@brain/shared";

/**
 * Maya Longitudinal Intelligence, Phase C (docs/specs/maya-longitudinal-intelligence.md,
 * Section 9) — `reconstructEntityTimeline`. Section 15's mandatory car walkthrough is the first
 * describe block below; the rest cover the task's full enumerated matrix (temporal, epistemic,
 * historical truth, provenance, clarification, space isolation, bounds).
 */

let handle: DbHandle;
const embeddings = new HashEmbeddingProvider(EMBED_DIM);
const llm = new HeuristicProvider();
beforeEach(() => {
  handle = createDb(":memory:");
});
afterEach(() => handle.sqlite.close());

function backdate(id: number, iso: string) {
  handle.sqlite.prepare(`UPDATE nodes SET occurred_at = ? WHERE id = ?`).run(iso, id);
}

async function makeNode(spaceId: string, label: string, content: string, opts: { occurredAt?: string; type?: "other" | "knowledge" } = {}) {
  const repo = new NodesRepo(handle, spaceId);
  const emb = await embeddings.embed(content);
  return repo.create({ label, content, type: opts.type ?? "other", occurredAt: opts.occurredAt }, emb);
}

/**
 * Section 15 — the mandatory, deterministic car walkthrough. Builds the exact scenario using
 * this codebase's REAL write paths (an `insights` contradiction row the way
 * `synthesis/contradictions.ts` would leave one; a "resolves" edge the way
 * `analysis/clarificationResolution.ts` actually creates one) rather than a synthetic fixture —
 * so this test proves the real integration, not just the function in isolation.
 */
describe("reconstructEntityTimeline — Section 25 car walkthrough (mandatory)", () => {
  it("reconstructs the full chronological history: original fact -> contradiction -> confirmed replacement", async () => {
    const sp = "s1";
    const civic = await makeNode(sp, "2016 Civic", "I have one car, a 2016 Civic.", { occurredAt: "2026-01-01T12:00:00.000Z" });
    const accident = await makeNode(sp, "Car accident", "I got in an accident with the car.", { occurredAt: "2026-03-01T12:00:00.000Z" });
    new InsightsRepo(handle, sp).create(civic.id, accident.id, "The accident may affect vehicle availability.", 0.8, "contradiction");

    // The clarification-confirmed replacement, built the same way
    // analysis/clarificationResolution.ts actually resolves one: a new node plus a "resolves"
    // edge to EVERY memory-domain evidence ref (here, both Civic and the accident memory).
    const newCar = await makeNode(sp, "New car", "Bought a new car after the accident.", {
      occurredAt: "2026-04-01T12:00:00.000Z",
      type: "knowledge",
    });
    const edges = new EdgesRepo(handle, sp);
    edges.create({ source: newCar.id, target: civic.id, relationship: "resolves" });
    edges.create({ source: newCar.id, target: accident.id, relationship: "resolves" });

    const anchor: ProvenanceRef = { domain: "memory", kind: "node", id: civic.id };
    const timeline = reconstructEntityTimeline(handle, sp, anchor);

    expect(timeline).toHaveLength(3);
    // Chronological ordering, not insertion/id order.
    expect(timeline.map((e) => e.source.id)).toEqual([civic.id, accident.id, newCar.id]);
    // Event time preferred over creation time (all three set occurredAt explicitly above).
    expect(timeline[0]!.at).toBe("2026-01-01T12:00:00.000Z");

    // Phase B supersession respected: the OLDER side of the contradiction pair is
    // "contradicted", never automatically promoted or silently dropped.
    expect(timeline[0]!.status).toBe("contradicted"); // civic — superseded
    expect(timeline[1]!.status).toBe("fact"); // accident — current side of that pair, plain fact
    // Clarification evidence respected: the real confirmed replacement is "confirmed".
    expect(timeline[2]!.status).toBe("confirmed"); // newCar

    // Provenance survives — every event points at the real row, not an invented id.
    for (const e of timeline) {
      expect(e.source.domain).toBe("memory");
      expect(e.source.kind).toBe("node");
    }
    expect(timeline[0]!.source.label).toBe("2016 Civic");

    // Historical truth: the Civic memory's own row is untouched — only a transient status
    // label changed, never its content.
    const row = handle.sqlite.prepare(`SELECT label, content FROM nodes WHERE id = ?`).get(civic.id);
    expect(row).toEqual({ label: "2016 Civic", content: "I have one car, a 2016 Civic." });
    expect(timeline[0]!.statement).toContain("I have one car, a 2016 Civic.");
  });

  it("does not leak into another space — an anchor id from space A returns nothing when queried under space B", async () => {
    const civic = await makeNode("space-a", "2016 Civic", "I have one car, a 2016 Civic.", { occurredAt: "2026-01-01T12:00:00.000Z" });
    const anchor: ProvenanceRef = { domain: "memory", kind: "node", id: civic.id };
    expect(reconstructEntityTimeline(handle, "space-b", anchor)).toEqual([]);
  });
});

describe("temporal ordering", () => {
  it("returns [] for a nonexistent anchor (empty timeline)", () => {
    expect(reconstructEntityTimeline(handle, "s1", { domain: "memory", kind: "node", id: 99999 })).toEqual([]);
  });

  it("returns exactly one event for an anchor with no relations (single event)", async () => {
    const n = await makeNode("s1", "Lone thought", "A one-off thought about painting the fence.");
    const timeline = reconstructEntityTimeline(handle, "s1", { domain: "memory", kind: "node", id: n.id });
    expect(timeline).toHaveLength(1);
    expect(timeline[0]!.source.id).toBe(n.id);
    expect(timeline[0]!.status).toBe("fact");
  });

  it("orders multiple events chronologically, not by insertion/id order", async () => {
    const sp = "s1";
    // Insertion order deliberately scrambled relative to event-time order (C, A, B) — both
    // touch the anchor directly (A), which is the single hop this function actually performs
    // per mechanism (see entityTimeline.ts's own doc comment: one pass, not a transitive
    // multi-hop chain) — a chain of A-contradicts-B-contradicts-C is intentionally out of scope.
    const third = await makeNode(sp, "C", "C statement.", { occurredAt: "2026-03-01T00:00:00.000Z" });
    const first = await makeNode(sp, "A", "A statement.", { occurredAt: "2026-01-01T00:00:00.000Z" });
    const second = await makeNode(sp, "B", "B statement.", { occurredAt: "2026-02-01T00:00:00.000Z" });
    new InsightsRepo(handle, sp).create(first.id, second.id, "conflict", 0.6, "contradiction");
    new InsightsRepo(handle, sp).create(first.id, third.id, "conflict", 0.6, "contradiction");

    const timeline = reconstructEntityTimeline(handle, sp, { domain: "memory", kind: "node", id: first.id });
    expect(timeline.map((e) => e.source.id)).toEqual([first.id, second.id, third.id]);
  });

  it("orders identical timestamps deterministically (by node id), consistently across repeated calls", async () => {
    const sp = "s1";
    const same = "2026-01-01T00:00:00.000Z";
    const a = await makeNode(sp, "A", "A statement.", { occurredAt: same });
    const b = await makeNode(sp, "B", "B statement.", { occurredAt: same });
    new InsightsRepo(handle, sp).create(a.id, b.id, "conflict", 0.6, "contradiction");

    const anchor: ProvenanceRef = { domain: "memory", kind: "node", id: a.id };
    const run1 = reconstructEntityTimeline(handle, sp, anchor).map((e) => e.source.id);
    const run2 = reconstructEntityTimeline(handle, sp, anchor).map((e) => e.source.id);
    expect(run1).toEqual([a.id, b.id].sort((x, y) => x - y));
    expect(run1).toEqual(run2);
  });

  it("prefers occurredAt over createdAt when both are present and differ", async () => {
    const n = await makeNode("s1", "Backdated", "Told her about it last month.", { occurredAt: "2026-01-01T00:00:00.000Z" });
    // createdAt is whatever CURRENT_TIMESTAMP produced at insert time — necessarily "now",
    // i.e. very different from the January occurredAt set above.
    const timeline = reconstructEntityTimeline(handle, "s1", { domain: "memory", kind: "node", id: n.id });
    expect(timeline[0]!.at).toBe("2026-01-01T00:00:00.000Z");
  });

  it("falls back to createdAt when occurredAt is absent", async () => {
    const n = await makeNode("s1", "No event date", "Just a thought, no explicit date.");
    const timeline = reconstructEntityTimeline(handle, "s1", { domain: "memory", kind: "node", id: n.id });
    const row = handle.sqlite.prepare(`SELECT created_at FROM nodes WHERE id = ?`).get(n.id) as { created_at: string };
    expect(timeline[0]!.at).toBe(row.created_at);
  });
});

describe("epistemic status", () => {
  it("a lone fact stays 'fact' — never promoted just for existing", async () => {
    const n = await makeNode("s1", "Solo", "Just a note.");
    const timeline = reconstructEntityTimeline(handle, "s1", { domain: "memory", kind: "node", id: n.id });
    expect(timeline[0]!.status).toBe("fact");
  });

  it("a legitimate change over time (continuity) is preserved as 'outdated', never 'contradicted'", async () => {
    const sp = "s1";
    // Identical text (same trick temporalChains.test.ts/intelligence.test.ts already use) so
    // the pair reliably clears the module's own similarity threshold under the deterministic
    // hash embedder.
    const a = await makeNode(sp, "Truck plan A", "Thinking seriously about starting a trucking company.", { occurredAt: "2026-01-01T00:00:00.000Z" });
    const b = await makeNode(sp, "Truck plan B", "Thinking seriously about starting a trucking company.", { occurredAt: "2026-01-25T00:00:00.000Z" });

    const timeline = reconstructEntityTimeline(handle, sp, { domain: "memory", kind: "node", id: a.id });
    const older = timeline.find((e) => e.source.id === a.id);
    expect(older?.status).toBe("outdated");
    expect(timeline.some((e) => e.status === "contradicted")).toBe(false);
  });

  it("a genuine, already-detected contradiction is preserved as 'contradicted' on the superseded side", async () => {
    const sp = "s1";
    const a = await makeNode(sp, "One car", "I only have one car.", { occurredAt: "2026-01-01T00:00:00.000Z" });
    const b = await makeNode(sp, "Two cars", "I now have two cars.", { occurredAt: "2026-02-01T00:00:00.000Z" });
    new InsightsRepo(handle, sp).create(a.id, b.id, "conflict", 0.8, "contradiction");

    const timeline = reconstructEntityTimeline(handle, sp, { domain: "memory", kind: "node", id: a.id });
    expect(timeline.find((e) => e.source.id === a.id)?.status).toBe("contradicted");
    expect(timeline.find((e) => e.source.id === b.id)?.status).toBe("fact");
  });

  it("insufficient evidence (dates too close to trust direction) never promotes a status", async () => {
    const sp = "s1";
    const a = await makeNode(sp, "One car", "I only have one car.");
    const b = await makeNode(sp, "Two cars", "I now have two cars.");
    // Both created "now" (no occurredAt set) — createdAt values will be within the same
    // second, well under resolveSupersession's MIN_CONFIDENT_GAP_MS.
    new InsightsRepo(handle, sp).create(a.id, b.id, "conflict", 0.8, "contradiction");

    const timeline = reconstructEntityTimeline(handle, sp, { domain: "memory", kind: "node", id: a.id });
    expect(timeline.find((e) => e.source.id === a.id)?.status).toBe("fact");
    expect(timeline.find((e) => e.source.id === b.id)?.status).toBe("fact");
  });

  it("a newer, UNRELATED event is never auto-promoted just for being newer", async () => {
    const sp = "s1";
    const anchor = await makeNode(sp, "Anchor", "Something about my car.", { occurredAt: "2026-01-01T00:00:00.000Z" });
    // No edge, no insight, no evolution link between these two — genuinely unrelated.
    await makeNode(sp, "Unrelated", "Something completely different, much later.", { occurredAt: "2026-06-01T00:00:00.000Z" });

    const timeline = reconstructEntityTimeline(handle, sp, { domain: "memory", kind: "node", id: anchor.id });
    // The unrelated node was never pulled into the anchor's timeline at all.
    expect(timeline).toHaveLength(1);
    expect(timeline[0]!.status).toBe("fact");
  });

  it("never fabricates observation/inference/hypothesis/possible/unknown for a per-node event — those describe cross-node claims (IntelligenceClaim), not a single memory's own statement", async () => {
    const sp = "s1";
    const civic = await makeNode(sp, "Civic", "I have one car.", { occurredAt: "2026-01-01T00:00:00.000Z" });
    const accident = await makeNode(sp, "Accident", "Got in an accident.", { occurredAt: "2026-02-01T00:00:00.000Z" });
    new InsightsRepo(handle, sp).create(civic.id, accident.id, "conflict", 0.8, "contradiction");
    const newCar = await makeNode(sp, "New car", "Bought a new one.", { occurredAt: "2026-03-01T00:00:00.000Z", type: "knowledge" });
    new EdgesRepo(handle, sp).create({ source: newCar.id, target: civic.id, relationship: "resolves" });

    const timeline = reconstructEntityTimeline(handle, sp, { domain: "memory", kind: "node", id: civic.id });
    const allowed = new Set(["fact", "confirmed", "outdated", "contradicted"]);
    for (const e of timeline) expect(allowed.has(e.status)).toBe(true);
  });
});

describe("historical truth", () => {
  it("the superseded event stays in the timeline — never dropped once a newer fact supersedes it", async () => {
    const sp = "s1";
    const a = await makeNode(sp, "One car", "I only have one car.", { occurredAt: "2026-01-01T00:00:00.000Z" });
    const b = await makeNode(sp, "Two cars", "I now have two cars.", { occurredAt: "2026-02-01T00:00:00.000Z" });
    new InsightsRepo(handle, sp).create(a.id, b.id, "conflict", 0.8, "contradiction");
    const timeline = reconstructEntityTimeline(handle, sp, { domain: "memory", kind: "node", id: a.id });
    expect(timeline.map((e) => e.source.id)).toContain(a.id);
  });

  it("the earlier memory's row is never mutated by reconstruction", async () => {
    const sp = "s1";
    const a = await makeNode(sp, "One car", "I only have one car.", { occurredAt: "2026-01-01T00:00:00.000Z" });
    const b = await makeNode(sp, "Two cars", "I now have two cars.", { occurredAt: "2026-02-01T00:00:00.000Z" });
    new InsightsRepo(handle, sp).create(a.id, b.id, "conflict", 0.8, "contradiction");

    const before = handle.sqlite.prepare(`SELECT label, content, occurred_at FROM nodes WHERE id = ?`).get(a.id);
    reconstructEntityTimeline(handle, sp, { domain: "memory", kind: "node", id: a.id });
    reconstructEntityTimeline(handle, sp, { domain: "memory", kind: "node", id: a.id }); // twice, for good measure
    const after = handle.sqlite.prepare(`SELECT label, content, occurred_at FROM nodes WHERE id = ?`).get(a.id);
    expect(after).toEqual(before);
  });

  it("the current interpretation (status) is separate from the historical record (statement text) — the older memory's own words never change", async () => {
    const sp = "s1";
    const a = await makeNode(sp, "One car", "I only have one car.", { occurredAt: "2026-01-01T00:00:00.000Z" });
    const b = await makeNode(sp, "Two cars", "I now have two cars.", { occurredAt: "2026-02-01T00:00:00.000Z" });
    new InsightsRepo(handle, sp).create(a.id, b.id, "conflict", 0.8, "contradiction");

    const timeline = reconstructEntityTimeline(handle, sp, { domain: "memory", kind: "node", id: a.id });
    const event = timeline.find((e) => e.source.id === a.id)!;
    expect(event.status).toBe("contradicted"); // interpretation: no longer current
    expect(event.statement).toBe("I only have one car."); // record: exactly what was said
  });
});

describe("provenance", () => {
  it("every event identifies a real, well-formed source", async () => {
    const sp = "s1";
    const a = await makeNode(sp, "A", "A statement.", { occurredAt: "2026-01-01T00:00:00.000Z" });
    const b = await makeNode(sp, "B", "B statement.", { occurredAt: "2026-02-01T00:00:00.000Z" });
    new InsightsRepo(handle, sp).create(a.id, b.id, "conflict", 0.7, "contradiction");

    const timeline = reconstructEntityTimeline(handle, sp, { domain: "memory", kind: "node", id: a.id });
    for (const e of timeline) {
      expect(e.source.domain).toBe("memory");
      expect(e.source.kind).toBe("node");
      expect(typeof e.source.id).toBe("number");
      expect(e.source.label).toBeTruthy();
    }
  });

  it("provenance ids all correspond to real rows in this space — no invented ids", async () => {
    const sp = "s1";
    const a = await makeNode(sp, "A", "A statement.", { occurredAt: "2026-01-01T00:00:00.000Z" });
    const b = await makeNode(sp, "B", "B statement.", { occurredAt: "2026-02-01T00:00:00.000Z" });
    new InsightsRepo(handle, sp).create(a.id, b.id, "conflict", 0.7, "contradiction");

    const timeline = reconstructEntityTimeline(handle, sp, { domain: "memory", kind: "node", id: a.id });
    for (const e of timeline) {
      const row = handle.sqlite.prepare(`SELECT id, label FROM nodes WHERE id = ? AND space_id = ?`).get(e.source.id, sp) as
        | { id: number; label: string }
        | undefined;
      expect(row).toBeDefined();
      expect(row!.label).toBe(e.source.label);
    }
  });
});

describe("clarification integration", () => {
  it("preserves the earlier uncertainty AND the later confirmed clarification as separate, both-present events", async () => {
    const sp = "s1";
    const civic = await makeNode(sp, "Civic", "I have one car.", { occurredAt: "2026-01-01T00:00:00.000Z" });
    const accident = await makeNode(sp, "Accident", "Got in an accident.", { occurredAt: "2026-02-01T00:00:00.000Z" });
    new InsightsRepo(handle, sp).create(civic.id, accident.id, "conflict", 0.8, "contradiction");
    const confirmed = await makeNode(sp, "Confirmed", "Bought a new car.", { occurredAt: "2026-03-01T00:00:00.000Z", type: "knowledge" });
    new EdgesRepo(handle, sp).create({ source: confirmed.id, target: civic.id, relationship: "resolves" });

    const timeline = reconstructEntityTimeline(handle, sp, { domain: "memory", kind: "node", id: civic.id });
    expect(timeline.map((e) => e.source.id)).toEqual(expect.arrayContaining([civic.id, accident.id, confirmed.id]));
    expect(timeline.find((e) => e.source.id === confirmed.id)?.status).toBe("confirmed");
  });

  it("a later confirmation does not rewrite the earlier evidence memory's own text", async () => {
    const sp = "s1";
    const civic = await makeNode(sp, "Civic", "I have one car.", { occurredAt: "2026-01-01T00:00:00.000Z" });
    const confirmed = await makeNode(sp, "Confirmed", "Bought a new car.", { occurredAt: "2026-02-01T00:00:00.000Z", type: "knowledge" });
    new EdgesRepo(handle, sp).create({ source: confirmed.id, target: civic.id, relationship: "resolves" });

    reconstructEntityTimeline(handle, sp, { domain: "memory", kind: "node", id: civic.id });
    const row = handle.sqlite.prepare(`SELECT content FROM nodes WHERE id = ?`).get(civic.id) as { content: string };
    expect(row.content).toBe("I have one car.");
  });
});

describe("space isolation", () => {
  it("cross-space source ids are rejected even if a stray edge/insight row is mis-scoped", async () => {
    const civicA = await makeNode("space-a", "Civic A", "I have one car.", { occurredAt: "2026-01-01T00:00:00.000Z" });
    const nodeB = await makeNode("space-b", "Other space node", "Something in space B.", { occurredAt: "2026-02-01T00:00:00.000Z" });

    // A defensively-mis-scoped edge: space_id says "space-a" but the target actually belongs
    // to space-b. reconstructEntityTimeline must not let this leak nodeB into space-a's result.
    handle.sqlite
      .prepare(`INSERT INTO edges (space_id, source, target, relationship) VALUES ('space-a', ?, ?, 'supports')`)
      .run(nodeB.id, civicA.id);

    const timeline = reconstructEntityTimeline(handle, "space-a", { domain: "memory", kind: "node", id: civicA.id });
    expect(timeline.map((e) => e.source.id)).not.toContain(nodeB.id);
  });

  it("an anchor id belonging to another space is rejected outright, not partially resolved", async () => {
    const civicA = await makeNode("space-a", "Civic A", "I have one car.");
    expect(reconstructEntityTimeline(handle, "space-c", { domain: "memory", kind: "node", id: civicA.id })).toEqual([]);
  });
});

describe("bounds", () => {
  it("a large, unrelated memory population never grows the result or triggers a full-space scan", async () => {
    const sp = "s1";
    const anchor = await makeNode(sp, "Anchor", "My car situation.", { occurredAt: "2026-01-01T00:00:00.000Z" });
    for (let i = 0; i < 60; i++) await makeNode(sp, `Unrelated ${i}`, `Completely unrelated thought number ${i}.`);

    const allSpy = vi.spyOn(NodesRepo.prototype, "all");
    try {
      const timeline = reconstructEntityTimeline(handle, sp, { domain: "memory", kind: "node", id: anchor.id });
      expect(timeline).toHaveLength(1); // none of the 60 unrelated memories were pulled in
      expect(allSpy).not.toHaveBeenCalled();
    } finally {
      allSpy.mockRestore();
    }
  });

  it("respects an explicit cap even if far more supporters/related nodes exist than the write-time guard normally allows", async () => {
    const sp = "s1";
    const anchor = await makeNode(sp, "Anchor", "A goal I'm tracking.");
    const edges = new EdgesRepo(handle, sp);
    // Bypass linkCognitiveAnchor's own MAX_ANCHOR_LINKS=12 write-time guard directly, to prove
    // the READ side (reconstructEntityTimeline) has its own independent bound too.
    for (let i = 0; i < 40; i++) {
      const supporter = await makeNode(sp, `Supporter ${i}`, `Supporting memory number ${i}.`);
      edges.create({ source: supporter.id, target: anchor.id, relationship: "supports" });
    }

    const timeline = reconstructEntityTimeline(handle, sp, { domain: "memory", kind: "node", id: anchor.id });
    expect(timeline.length).toBeLessThanOrEqual(25); // MAX_TIMELINE_NODES
  });

  it("caps how many contradiction pairs get pulled in even when many more exist", async () => {
    const sp = "s1";
    const anchor = await makeNode(sp, "Anchor", "My car.");
    const insights = new InsightsRepo(handle, sp);
    const otherIds: number[] = [];
    for (let i = 0; i < 10; i++) {
      const other = await makeNode(sp, `Conflict ${i}`, `Conflicting statement ${i}.`);
      otherIds.push(other.id);
      insights.create(anchor.id, other.id, `conflict ${i}`, 0.6, "contradiction");
    }

    const timeline = reconstructEntityTimeline(handle, sp, { domain: "memory", kind: "node", id: anchor.id });
    // anchor itself + at most MAX_RELATED_CONTRADICTIONS (5) of the 10 conflicting partners.
    expect(timeline.length).toBeLessThanOrEqual(1 + 5);
  });
});
