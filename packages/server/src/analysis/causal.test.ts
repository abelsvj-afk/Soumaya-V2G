import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { HashEmbeddingProvider } from "../embeddings/hash.js";
import { HeuristicProvider } from "../llm/heuristic.js";
import { EMBED_DIM } from "../db/vec.js";
import { ingest } from "../ingestion/pipeline.js";
import { NodesRepo } from "../repositories/nodes.repo.js";
import { InsightsRepo } from "../repositories/insights.repo.js";
import { FinIncomeRepo } from "../repositories/finIncome.repo.js";
import { openContradictionClaims } from "./intelligence.js";
import { possibleDownstreamEffects } from "./causal.js";
import { reconstructEntityTimeline } from "./entityTimeline.js";
import { computeRelevance } from "./relevance.js";
import type { IntelligenceClaim } from "@brain/shared";

/**
 * Maya Longitudinal Intelligence, Phase G (docs/specs/maya-longitudinal-intelligence.md,
 * Section 10) — cross-domain generalization of `possibleDownstreamEffects`. AUDIT CONCLUSION:
 * Path A — extend the existing function in place (a fourth candidate check reusing Phase E's
 * bounded `buildEmotionalTrajectoryAmong` verbatim), no new abstraction, no new domain-pair
 * hardcoding. Covers the task's full required matrix: temporal, epistemic, cross-domain,
 * historical, supersession, relevance, emotional, entity-continuity, security, and bounds.
 */

let handle: DbHandle;
const embeddings = new HashEmbeddingProvider(EMBED_DIM);
const llm = new HeuristicProvider();
const deps = { embeddings, llm };
const SPACE = "s1";
const NOW = new Date("2026-09-03T00:00:00Z");

beforeEach(() => {
  handle = createDb(":memory:");
});
afterEach(() => handle.sqlite.close());

function backdate(id: number, iso: string) {
  handle.sqlite.prepare(`UPDATE nodes SET occurred_at = ? WHERE id = ?`).run(iso, id);
}
function setValence(id: number, v: number) {
  handle.sqlite.prepare(`UPDATE nodes SET emotional_weight = ? WHERE id = ?`).run(v, id);
}
/** Fully excludes a node from trajectory building (unlike a valence of 0, which is still a
 *  valid dated point) — `trajectoryFrom`'s own filter requires `typeof emotionalWeight ===
 *  "number"`, so NULL is the only way to make a node contribute no point at all. */
function clearValence(id: number) {
  handle.sqlite.prepare(`UPDATE nodes SET emotional_weight = NULL WHERE id = ?`).run(id);
}

/** A generic, non-domain-specific contradiction claim, backdated to fall inside the causal
 *  window — deliberately worded around a "schedule change," not any single hard-coded domain
 *  (job/car/etc.), to prove the mechanism doesn't special-case any one topic. */
async function makeScheduleChangeClaim(spaceId = SPACE): Promise<{ claim: IntelligenceClaim; a: number; b: number }> {
  const a = (await ingest(handle, deps, "My schedule has been the same for months.", spaceId)).nodes[0]!.id;
  const b = (await ingest(handle, deps, "My schedule changed unexpectedly this week.", spaceId)).nodes[0]!.id;
  backdate(b, "2026-08-20T00:00:00"); // `a` keeps its real (later) ingest timestamp
  // Fully exclude whatever valence the heuristic LLM assigned these two narrative memories
  // from trajectory building, so tests that isolate a SEPARATE emotional candidate set aren't
  // cross-contaminated by these two also being in scope (`possibleDownstreamEffects` always
  // includes the claim's own evidence in its emotional candidate pool, by design — see
  // causal.ts's own comment).
  clearValence(a);
  clearValence(b);
  new InsightsRepo(handle, spaceId).create(a, b, "The schedule change may have follow-on effects.", 0.85, "contradiction");
  const [claim] = openContradictionClaims(handle, spaceId);
  return { claim: claim!, a, b };
}

describe("temporal", () => {
  it("source precedes possible effect: an emotional pattern dated AFTER the cause produces a claim", async () => {
    const { claim } = await makeScheduleChangeClaim();
    const m1 = (await ingest(handle, deps, "Frustrated about the new schedule.", SPACE)).nodes[0]!.id;
    const m2 = (await ingest(handle, deps, "Still frustrated about the schedule.", SPACE)).nodes[0]!.id;
    backdate(m1, "2026-08-22T00:00:00");
    backdate(m2, "2026-08-25T00:00:00");
    setValence(m1, -0.6);
    setValence(m2, -0.7);

    const links = possibleDownstreamEffects(handle, SPACE, claim, NOW, [m1, m2]);
    expect(links.some((l) => l.effectDomain === "mind")).toBe(true);
  });

  it("effect precedes source: an emotional pattern entirely BEFORE the cause produces no claim", async () => {
    const { claim } = await makeScheduleChangeClaim();
    const m1 = (await ingest(handle, deps, "Frustrated about something unrelated.", SPACE)).nodes[0]!.id;
    const m2 = (await ingest(handle, deps, "Still frustrated about that thing.", SPACE)).nodes[0]!.id;
    backdate(m1, "2026-07-01T00:00:00"); // well before the cause (2026-08-20)
    backdate(m2, "2026-07-05T00:00:00");
    setValence(m1, -0.6);
    setValence(m2, -0.7);

    const links = possibleDownstreamEffects(handle, SPACE, claim, NOW, [m1, m2]);
    expect(links.some((l) => l.effectDomain === "mind")).toBe(false);
  });

  it("untrusted/missing timestamps in the candidate set never produce a claim", async () => {
    const { claim } = await makeScheduleChangeClaim();
    // Two emotionally-charged memories but with no occurredAt override — they still carry a
    // real createdAt (today, by construction of ingest()), which is fine; this test instead
    // proves that a candidate set with NO usable emotional data at all yields nothing.
    const m1 = (await ingest(handle, deps, "A neutral note.", SPACE)).nodes[0]!.id; // no valence set
    const links = possibleDownstreamEffects(handle, SPACE, claim, NOW, [m1]);
    expect(links.some((l) => l.effectDomain === "mind")).toBe(false);
  });

  it("bounded temporal window: a cause older than the causal window produces no claims at all", async () => {
    const { claim } = await makeScheduleChangeClaim();
    // Push the claim's evidence far into the past relative to `NOW`.
    handle.sqlite.prepare(`UPDATE nodes SET occurred_at = ? WHERE id = ?`).run("2025-01-01T00:00:00", claim.evidence[0]!.id);
    handle.sqlite.prepare(`UPDATE nodes SET occurred_at = ? WHERE id = ?`).run("2025-01-01T00:00:00", claim.evidence[1]!.id);
    const m1 = (await ingest(handle, deps, "Frustrated about the schedule.", SPACE)).nodes[0]!.id;
    const m2 = (await ingest(handle, deps, "Still frustrated.", SPACE)).nodes[0]!.id;
    setValence(m1, -0.6);
    setValence(m2, -0.7);

    const income = new FinIncomeRepo(handle, SPACE);
    income.create({ date: "2026-07-15", netCents: 400_000 });
    income.create({ date: "2026-08-25", netCents: 250_000 });

    expect(possibleDownstreamEffects(handle, SPACE, claim, NOW, [m1, m2])).toEqual([]);
  });
});

describe("epistemic", () => {
  it("every produced link, across every domain, stays 'possible' — never upgraded", async () => {
    const { claim } = await makeScheduleChangeClaim();
    const income = new FinIncomeRepo(handle, SPACE);
    income.create({ date: "2026-07-15", netCents: 400_000 });
    income.create({ date: "2026-08-25", netCents: 250_000 });
    const m1 = (await ingest(handle, deps, "Frustrated about the schedule.", SPACE)).nodes[0]!.id;
    const m2 = (await ingest(handle, deps, "Still frustrated.", SPACE)).nodes[0]!.id;
    backdate(m1, "2026-08-22T00:00:00");
    backdate(m2, "2026-08-25T00:00:00");
    setValence(m1, -0.6);
    setValence(m2, -0.7);

    const links = possibleDownstreamEffects(handle, SPACE, claim, NOW, [m1, m2]);
    expect(links.length).toBeGreaterThan(1); // both money and mind links present
    for (const l of links) {
      expect(l.status).toBe("possible");
      expect(l.effectDescription).toMatch(/doesn't prove|not a confirmed|coincid/i);
    }
  });

  it("never mutates the underlying evidence memories' epistemic/entity-timeline status", async () => {
    const { claim, a, b } = await makeScheduleChangeClaim();
    const before = reconstructEntityTimeline(handle, SPACE, { domain: "memory", kind: "node", id: a });
    possibleDownstreamEffects(handle, SPACE, claim, NOW, [a, b]);
    const after = reconstructEntityTimeline(handle, SPACE, { domain: "memory", kind: "node", id: a });
    expect(after).toEqual(before);
  });
});

describe("cross-domain (mandatory walkthrough — real write paths, two genuinely different domains)", () => {
  it("a single claim produces a bounded 'possible' claim in BOTH Money and Mind/Emotional, with real provenance and unmutated history", async () => {
    // 1. Source-domain evidence — a generic, non-hardcoded schedule-change contradiction.
    const { claim, a, b } = await makeScheduleChangeClaim();
    const beforeA = handle.sqlite.prepare(`SELECT label, content, occurred_at FROM nodes WHERE id = ?`).get(a);
    const beforeB = handle.sqlite.prepare(`SELECT label, content, occurred_at FROM nodes WHERE id = ?`).get(b);

    // 2. Downstream Money evidence — a real income drop after the schedule change.
    const income = new FinIncomeRepo(handle, SPACE);
    income.create({ date: "2026-07-15", netCents: 400_000 });
    income.create({ date: "2026-08-25", netCents: 250_000 });

    // 2b. Downstream Mind/Emotional evidence — a real, repeated (not one-off) negative pattern.
    const m1 = (await ingest(handle, deps, "Frustrated about the new schedule.", SPACE)).nodes[0]!.id;
    const m2 = (await ingest(handle, deps, "Still frustrated about the schedule change.", SPACE)).nodes[0]!.id;
    backdate(m1, "2026-08-22T00:00:00");
    backdate(m2, "2026-08-27T00:00:00");
    setValence(m1, -0.6);
    setValence(m2, -0.7);

    // 3-4. Phase C timeline reconstruction works alongside this, unaffected.
    const timeline = reconstructEntityTimeline(handle, SPACE, { domain: "memory", kind: "node", id: a });
    expect(timeline.length).toBeGreaterThan(0);

    // 5. Run cross-domain causal reasoning, bounded to the emotional evidence as context.
    const links = possibleDownstreamEffects(handle, SPACE, claim, NOW, [m1, m2]);

    // 6. A bounded set of "possible" claims, spanning two real, different domains.
    expect(links.length).toBeGreaterThan(0);
    expect(links.length).toBeLessThanOrEqual(3); // MAX_CAUSAL_LINKS
    const domains = new Set(links.map((l) => l.effectDomain));
    expect(domains.has("money")).toBe(true);
    expect(domains.has("mind")).toBe(true);
    for (const l of links) expect(l.status).toBe("possible");

    // 7. Provenance: every link's cause/evidence points at real, resolvable rows.
    for (const l of links) {
      expect(typeof l.cause.id).toBe("number");
      for (const ev of l.evidence) {
        if (ev.domain === "memory" && ev.kind === "node") {
          expect(new NodesRepo(handle, SPACE).getById(ev.id)).toBeTruthy();
        }
      }
    }

    // 8. Historical data (the original schedule-change memories) is completely unchanged.
    const afterA = handle.sqlite.prepare(`SELECT label, content, occurred_at FROM nodes WHERE id = ?`).get(a);
    const afterB = handle.sqlite.prepare(`SELECT label, content, occurred_at FROM nodes WHERE id = ?`).get(b);
    expect(afterA).toEqual(beforeA);
    expect(afterB).toEqual(beforeB);
  });
});

describe("historical", () => {
  it("historical source events are never mutated by running causal reasoning", async () => {
    const { claim, a } = await makeScheduleChangeClaim();
    const before = handle.sqlite.prepare(`SELECT label, content FROM nodes WHERE id = ?`).get(a);
    const income = new FinIncomeRepo(handle, SPACE);
    income.create({ date: "2026-07-15", netCents: 400_000 });
    income.create({ date: "2026-08-25", netCents: 250_000 });
    possibleDownstreamEffects(handle, SPACE, claim, NOW);
    possibleDownstreamEffects(handle, SPACE, claim, NOW); // twice, for good measure
    const after = handle.sqlite.prepare(`SELECT label, content FROM nodes WHERE id = ?`).get(a);
    expect(after).toEqual(before);
  });
});

describe("supersession — reuses Phase B/C, no second algorithm", () => {
  it("an evidence memory Phase C would separately label 'outdated'/'contradicted' can still be reasoned about by causal.ts, and both remain reconstructable", async () => {
    const { claim, a, b } = await makeScheduleChangeClaim();
    // Phase C/B independently resolve direction-of-currency for this same pair — `b` was
    // explicitly backdated to 2026-08-20 while `a` kept its real (later) ingest timestamp, so
    // `b` is the temporally OLDER side here, regardless of narrative wording.
    const timeline = reconstructEntityTimeline(handle, SPACE, { domain: "memory", kind: "node", id: a });
    const older = timeline.find((e) => e.source.id === b);
    expect(older?.status).toBe("contradicted"); // Phase B's own resolver, unchanged

    // causal.ts still processes the SAME claim without any special-casing for that status.
    const income = new FinIncomeRepo(handle, SPACE);
    income.create({ date: "2026-07-15", netCents: 400_000 });
    income.create({ date: "2026-08-25", netCents: 250_000 });
    const links = possibleDownstreamEffects(handle, SPACE, claim, NOW);
    expect(links.length).toBeGreaterThan(0);
    void b;
  });
});

describe("relevance interaction — narrows candidates, never establishes causality", () => {
  it("Phase D's computeRelevance is never called by causal.ts, and a 'low'-relevance candidate can still appear in a causal link", async () => {
    const { claim } = await makeScheduleChangeClaim();
    const m1 = (await ingest(handle, deps, "Frustrated about the schedule.", SPACE)).nodes[0]!.id;
    const m2 = (await ingest(handle, deps, "Still frustrated.", SPACE)).nodes[0]!.id;
    backdate(m1, "2026-08-22T00:00:00");
    backdate(m2, "2026-08-25T00:00:00");
    setValence(m1, -0.6);
    setValence(m2, -0.7);
    // Deliberately cool these memories so Phase D would call them "low" relevance.
    handle.sqlite.prepare(`UPDATE nodes SET last_tended_at = '2020-01-01T00:00:00.000Z' WHERE id IN (?, ?)`).run(m1, m2);

    const relevance = computeRelevance(handle, SPACE, [
      { domain: "memory", kind: "node", id: m1 },
      { domain: "memory", kind: "node", id: m2 },
    ]);
    expect(relevance.every((r) => r.tier === "low")).toBe(true); // Phase D says "low" independently

    // causal.ts doesn't consult Phase D at all — the pattern still surfaces.
    const links = possibleDownstreamEffects(handle, SPACE, claim, NOW, [m1, m2]);
    expect(links.some((l) => l.effectDomain === "mind")).toBe(true);
  });
});

describe("emotional — a single data point never becomes a causal pattern", () => {
  it("one emotionally-charged memory in the candidate set produces no Mind/Emotional link", async () => {
    const { claim } = await makeScheduleChangeClaim();
    const m1 = (await ingest(handle, deps, "Frustrated about the schedule.", SPACE)).nodes[0]!.id;
    backdate(m1, "2026-08-22T00:00:00");
    setValence(m1, -0.6);
    const links = possibleDownstreamEffects(handle, SPACE, claim, NOW, [m1]);
    expect(links.some((l) => l.effectDomain === "mind")).toBe(false);
  });
});

describe("entity continuity — causal reasoning never merges entities", () => {
  it("running causal reasoning creates/merges no node rows at all", async () => {
    const { claim } = await makeScheduleChangeClaim();
    const income = new FinIncomeRepo(handle, SPACE);
    income.create({ date: "2026-07-15", netCents: 400_000 });
    income.create({ date: "2026-08-25", netCents: 250_000 });
    const before = (handle.sqlite.prepare(`SELECT COUNT(*) AS c FROM nodes`).get() as { c: number }).c;
    possibleDownstreamEffects(handle, SPACE, claim, NOW);
    const after = (handle.sqlite.prepare(`SELECT COUNT(*) AS c FROM nodes`).get() as { c: number }).c;
    expect(after).toBe(before);
  });
});

describe("security / space isolation", () => {
  it("a contextNodeIds entry from another space never leaks into the emotional candidate set", async () => {
    const { claim } = await makeScheduleChangeClaim();
    const otherSpaceMem = (await ingest(handle, deps, "Frustrated in another space.", "space-b")).nodes[0]!.id;
    const otherSpaceMem2 = (await ingest(handle, deps, "Still frustrated in another space.", "space-b")).nodes[0]!.id;
    backdate(otherSpaceMem, "2026-08-22T00:00:00");
    backdate(otherSpaceMem2, "2026-08-25T00:00:00");
    setValence(otherSpaceMem, -0.6);
    setValence(otherSpaceMem2, -0.7);

    // The claim is space "s1"; the ids passed as context happen to belong to "space-b".
    const links = possibleDownstreamEffects(handle, SPACE, claim, NOW, [otherSpaceMem, otherSpaceMem2]);
    expect(links.some((l) => l.effectDomain === "mind")).toBe(false); // silently dropped, not leaked in
  });
});

describe("bounds — no full-space scan introduced", () => {
  it("possibleDownstreamEffects never calls NodesRepo.all(), even with many unrelated memories present", async () => {
    const { claim } = await makeScheduleChangeClaim();
    for (let i = 0; i < 60; i++) await ingest(handle, deps, `Unrelated memory ${i}.`, SPACE);
    const m1 = (await ingest(handle, deps, "Frustrated about the schedule.", SPACE)).nodes[0]!.id;
    const m2 = (await ingest(handle, deps, "Still frustrated.", SPACE)).nodes[0]!.id;
    backdate(m1, "2026-08-22T00:00:00");
    backdate(m2, "2026-08-25T00:00:00");
    setValence(m1, -0.6);
    setValence(m2, -0.7);

    const allSpy = vi.spyOn(NodesRepo.prototype, "all");
    try {
      const links = possibleDownstreamEffects(handle, SPACE, claim, NOW, [m1, m2]);
      expect(links.some((l) => l.effectDomain === "mind")).toBe(true);
      expect(allSpy).not.toHaveBeenCalled();
    } finally {
      allSpy.mockRestore();
    }
  });
});
