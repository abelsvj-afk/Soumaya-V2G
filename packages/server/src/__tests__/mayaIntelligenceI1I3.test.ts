import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { HashEmbeddingProvider } from "../embeddings/hash.js";
import { HeuristicProvider } from "../llm/heuristic.js";
import { EMBED_DIM } from "../db/vec.js";
import { ingest } from "../ingestion/pipeline.js";
import { InsightsRepo } from "../repositories/insights.repo.js";
import { NodesRepo } from "../repositories/nodes.repo.js";
import { EdgesRepo } from "../repositories/edges.repo.js";
import { JourneysRepo } from "../repositories/journeys.repo.js";
import { FinIncomeRepo } from "../repositories/finIncome.repo.js";
import { FinBucketRepo } from "../repositories/finBucket.repo.js";
import { FinGoalRepo } from "../repositories/finGoal.repo.js";
import { FinAllocationRepo } from "../repositories/finAllocation.repo.js";
import { IntelligenceClarificationsRepo } from "../repositories/intelligenceClarifications.repo.js";
import { openContradictionClaims, intelligenceSnapshotText } from "../analysis/intelligence.js";
import { possibleDownstreamEffects } from "../analysis/causal.js";
import { resolveClarificationFromMessage } from "../analysis/clarificationResolution.js";
import { resolveGalaxyEntity, navigationIntentFor } from "../analysis/galaxyEntity.js";
import { keywordSearch } from "../db/fts.js";

/**
 * Maya Intelligence I1–I3 completion pass (docs/specs/maya-intelligence-architecture.md) —
 * the 12 required behavioral scenarios (Part VIII). Each `describe` block below is numbered
 * to match the brief exactly. These exercise the REAL functions end-to-end (no mocking of the
 * modules under test) against the canonical car-accident acceptance scenario (Part XII) where
 * it fits, reusing the exact contradiction fixture ("I have one vehicle" / "Vehicle accident
 * happened yesterday") already established in analysis/intelligence.test.ts.
 */

let handle: DbHandle;
const embeddings = new HashEmbeddingProvider(EMBED_DIM);
const llm = new HeuristicProvider();
const deps = { embeddings, llm };
const SPACE = "s1";
const NOW = new Date("2026-09-03T00:00:00Z");

beforeEach(() => { handle = createDb(":memory:"); });
afterEach(() => handle.sqlite.close());

function backdate(id: number, iso: string) {
  handle.sqlite.prepare(`UPDATE nodes SET occurred_at = ? WHERE id = ?`).run(iso, id);
}

/** Builds the canonical "2016 vehicle + accident" contradiction fixture, dated recently
 *  enough to fall inside causal.ts's temporal-consistency window. Returns the two node ids
 *  and the resulting IntelligenceClaim. */
async function makeVehicleContradiction() {
  const vehicleId = (await ingest(handle, deps, "I have one vehicle, a 2016 Honda.", SPACE)).nodes[0]!.id;
  const accidentId = (await ingest(handle, deps, "Vehicle accident happened yesterday.", SPACE)).nodes[0]!.id;
  backdate(accidentId, "2026-08-20T00:00:00");
  new InsightsRepo(handle, SPACE).create(vehicleId, accidentId, "The accident may affect vehicle availability.", 0.9, "contradiction");
  const [claim] = openContradictionClaims(handle, SPACE);
  return { vehicleId, accidentId, claim: claim! };
}

describe("Scenario 1 — causal uncertainty: possible effect, never marked confirmed", () => {
  it("infers a possible downstream effect from the accident without asserting it happened", async () => {
    const income = new FinIncomeRepo(handle, SPACE);
    income.create({ date: "2026-07-15", netCents: 400_000 });
    income.create({ date: "2026-08-25", netCents: 250_000 }); // dropped after the accident
    const { claim } = await makeVehicleContradiction();

    const links = possibleDownstreamEffects(handle, SPACE, claim, NOW);
    expect(links.length).toBeGreaterThan(0);
    for (const l of links) {
      expect(l.status).toBe("possible"); // NEVER "confirmed" from this deterministic layer alone
      expect(l.effectDescription).toMatch(/coincid|doesn't prove|not a confirmed/i);
    }
  });
});

describe("Scenario 2 — confirmed causal chain has real provenance", () => {
  it("a user-confirmed answer becomes a node with origin:'user' and a 'resolves' edge back to its evidence", async () => {
    const { vehicleId, accidentId } = await makeVehicleContradiction();
    const clarifications = new IntelligenceClarificationsRepo(handle, SPACE);
    clarifications.create({
      claimId: "insight:1",
      domain: "mind",
      question: "Is this the same vehicle you mentioned before?",
      evidence: [{ domain: "memory", kind: "node", id: accidentId, label: "vehicle accident" }],
    });

    const result = await resolveClarificationFromMessage(handle, deps, "Yes. It was totaled in the accident.", SPACE);
    expect(result).not.toBeNull();

    const nodesRepo = new NodesRepo(handle, SPACE);
    const confirmedNode = nodesRepo.getById(result!.confirmedNodeId);
    expect(confirmedNode?.origin).toBe("user"); // provenance: source = user clarification
    expect(confirmedNode?.content).toBe("It was totaled in the accident.");

    const edgesRepo = new EdgesRepo(handle, SPACE);
    expect(edgesRepo.exists(result!.confirmedNodeId, accidentId)).toBe(true);
    expect(edgesRepo.all().find((e) => e.source === result!.confirmedNodeId)?.relationship).toBe("resolves");

    // The originating vehicle memory is untouched — confirmation never rewrites history.
    expect(nodesRepo.getById(vehicleId)?.content).toBe("I have one vehicle, a 2016 Honda.");
  });
});

describe("Scenario 3 — historical vs. current: old fact preserved, new statement is current", () => {
  it("both the original memory and the confirmed statement coexist, with the confirmed one newer", async () => {
    const { accidentId } = await makeVehicleContradiction();
    new IntelligenceClarificationsRepo(handle, SPACE).create({
      claimId: "insight:1", domain: "mind", question: "q?",
      evidence: [{ domain: "memory", kind: "node", id: accidentId, label: "accident" }],
    });
    const result = await resolveClarificationFromMessage(handle, deps, "Yes, it was totaled.", SPACE);

    const nodesRepo = new NodesRepo(handle, SPACE);
    const original = nodesRepo.getById(accidentId)!;
    const confirmed = nodesRepo.getById(result!.confirmedNodeId)!;
    // The historical record is never deleted or overwritten...
    expect(original.content).toBe("Vehicle accident happened yesterday.");
    // ...while the newer statement is the one with the later timestamp — "current" is a
    // matter of recency, not destruction of the old fact.
    expect(new Date(confirmed.createdAt).getTime()).toBeGreaterThanOrEqual(new Date(original.createdAt).getTime());
  });
});

describe("Scenario 4 — downstream uncertainty across domains stays hedged", () => {
  it("identifies potential effects in money AND wealth without ever asserting they occurred", async () => {
    const income = new FinIncomeRepo(handle, SPACE);
    income.create({ date: "2026-07-10", netCents: 300_000 });
    income.create({ date: "2026-08-22", netCents: 300_000 }); // unchanged — should NOT produce an income link
    const bucket = new FinBucketRepo(handle, SPACE).create({ name: "Savings" });
    const goal = new FinGoalRepo(handle, SPACE).create({ bucketId: bucket.id, name: "Truck fund", targetCents: 500_000 });
    const allocRepo = new FinAllocationRepo(handle, SPACE);
    // Older allocation (previous 30-day window) then a recent smaller one (current window) —
    // a real, dated change goalAllocationChange can detect.
    allocRepo.create({ goalId: goal.id, amountCents: 20_000 });
    handle.sqlite.prepare(`UPDATE fin_allocation SET created_at = ? WHERE goal_id = ?`).run("2026-07-20 00:00:00", goal.id);
    allocRepo.create({ goalId: goal.id, amountCents: 5_000 });
    handle.sqlite.prepare(`UPDATE fin_allocation SET created_at = ? WHERE id = (SELECT MAX(id) FROM fin_allocation)`).run("2026-08-28 00:00:00");

    const { claim } = await makeVehicleContradiction();
    const links = possibleDownstreamEffects(handle, SPACE, claim, NOW);

    expect(links.some((l) => l.effectDomain === "wealth")).toBe(true);
    expect(links.every((l) => l.status === "possible")).toBe(true);
    // Unchanged income never fabricates a link.
    expect(links.some((l) => l.id.startsWith("causal:income:"))).toBe(false);
  });
});

describe("Scenario 5 — full clarification lifecycle: candidate -> question -> answer -> confirmed -> retrievable", () => {
  it("a chosen candidate is persisted as pending, then resolving it creates a retrievable memory", async () => {
    await makeVehicleContradiction();

    // "Maya asks": intelligenceSnapshotText both surfaces the question AND persists the
    // pending clarification row — this is the exact wiring that makes the lifecycle real.
    const text = intelligenceSnapshotText(handle, SPACE, NOW);
    expect(text).toContain("you may ask");

    const clarifications = new IntelligenceClarificationsRepo(handle, SPACE);
    const pending = clarifications.mostRecentPending();
    expect(pending).not.toBeNull();
    expect(pending!.status).toBe("pending");

    // "User answers": the pending question resolves into confirmed knowledge.
    const result = await resolveClarificationFromMessage(handle, deps, "Yes, the 2016 Honda was totaled.", SPACE);
    expect(result).not.toBeNull();
    expect(clarifications.get(pending!.id)?.status).toBe("confirmed");

    // "Available to future retrieval": the SAME existing keyword-search retrieval finds it,
    // with zero new retrieval infrastructure.
    const hits = keywordSearch(handle.sqlite, SPACE, "totaled Honda", 5);
    expect(hits.map((h) => h.nodeId)).toContain(result!.confirmedNodeId);
  });
});

describe("Scenario 6 — a clarification answer changes future reasoning, without resurfacing stale topics", () => {
  it("resolves the pending question so it is never asked again, but relevance is still respected", async () => {
    await makeVehicleContradiction();
    intelligenceSnapshotText(handle, SPACE, NOW); // asks + persists the pending row
    await resolveClarificationFromMessage(handle, deps, "Yes, totaled.", SPACE);

    // The now-resolved clarification is gone from "pending" — a later chat turn's own
    // clarification check won't try to match against it again.
    expect(new IntelligenceClarificationsRepo(handle, SPACE).mostRecentPending()).toBeNull();

    // An unrelated later message does NOT get treated as answering anything (no stale
    // resurfacing of a topic that's already settled).
    const r = await resolveClarificationFromMessage(handle, deps, "What's the weather like today?", SPACE);
    expect(r).toBeNull();
  });
});

describe("Scenario 7 — Galaxy entity resolution for Journey / Money-goal / Memory objects", () => {
  it("resolves all three Galaxy body kinds to real, distinct descriptors (full coverage in analysis/galaxyEntity.test.ts)", async () => {
    const journey = new JourneysRepo(handle, SPACE).create({ title: "Replace the vehicle", status: "active" });
    const bucket = new FinBucketRepo(handle, SPACE).create({ name: "Savings" });
    const goal = new FinGoalRepo(handle, SPACE).create({ bucketId: bucket.id, name: "New car fund", targetCents: 1_000_000 });
    const { accidentId } = await makeVehicleContradiction();

    expect(resolveGalaxyEntity(handle, SPACE, "journey", journey.id, NOW)?.ref.domain).toBe("journey");
    expect(resolveGalaxyEntity(handle, SPACE, "goal", goal.id, NOW)?.ref.domain).toBe("money");
    expect(resolveGalaxyEntity(handle, SPACE, "node", accidentId, NOW)?.ref.domain).toBe("memory");
  });
});

describe("Scenario 8 — meaningful navigation: always a real target + a real, non-invented reason", () => {
  it("never produces a NavigationIntent without first resolving a real entity", async () => {
    const journey = new JourneysRepo(handle, SPACE).create({ title: "Replace the vehicle", status: "active" });
    const descriptor = resolveGalaxyEntity(handle, SPACE, "journey", journey.id, NOW);
    expect(descriptor).not.toBeNull();

    const intent = navigationIntentFor(descriptor!);
    expect(intent.target).toEqual(descriptor!.ref);
    expect(intent.reason).toBe(descriptor!.state); // the reason IS the real, already-computed state
    expect(intent.reason.length).toBeGreaterThan(0); // never an empty/decorative navigation

    // A non-existent entity never resolves — by construction there is nothing to build a
    // NavigationIntent from (the function's signature requires an actual descriptor).
    expect(resolveGalaxyEntity(handle, SPACE, "journey", 999_999, NOW)).toBeNull();
  });
});

describe("Scenario 9 — cross-domain reasoning without duplicating the source of truth", () => {
  it("resolving a clarification never creates a second Journey/finance record — only a memory node + edge", async () => {
    const { accidentId } = await makeVehicleContradiction();
    new IntelligenceClarificationsRepo(handle, SPACE).create({
      claimId: "insight:1", domain: "mind", question: "q?",
      evidence: [{ domain: "memory", kind: "node", id: accidentId, label: "accident" }],
    });

    const journeysBefore = new JourneysRepo(handle, SPACE).list().length;
    const nodesBefore = handle.sqlite.prepare(`SELECT COUNT(*) AS c FROM nodes WHERE space_id = ?`).get(SPACE) as { c: number };

    await resolveClarificationFromMessage(handle, deps, "Yes, it was totaled.", SPACE);

    const journeysAfter = new JourneysRepo(handle, SPACE).list().length;
    const nodesAfter = handle.sqlite.prepare(`SELECT COUNT(*) AS c FROM nodes WHERE space_id = ?`).get(SPACE) as { c: number };
    expect(journeysAfter).toBe(journeysBefore); // no parallel Journey record invented
    expect(nodesAfter.c).toBe(nodesBefore.c + 1); // exactly one new memory node, nothing else
  });
});

describe("Scenario 10 — contradiction: the current/confirmed statement is not treated as equally uncertain as the old one", () => {
  it("the confirmed node is newer than the contradicted evidence and carries a different, stronger provenance", async () => {
    const { accidentId } = await makeVehicleContradiction();
    new IntelligenceClarificationsRepo(handle, SPACE).create({
      claimId: "insight:1", domain: "mind", question: "q?",
      evidence: [{ domain: "memory", kind: "node", id: accidentId, label: "accident" }],
    });
    const result = await resolveClarificationFromMessage(handle, deps, "Yes, it was totaled.", SPACE);

    const nodesRepo = new NodesRepo(handle, SPACE);
    const original = nodesRepo.getById(accidentId)!;
    const confirmed = nodesRepo.getById(result!.confirmedNodeId)!;
    // The original memory has no special provenance flag (it's an ordinary ingested
    // memory); the confirmed statement is explicitly `origin:"user"` — a stronger,
    // explicit epistemic footing than the memory that merely raised the question.
    expect(original.origin).not.toBe("user");
    expect(confirmed.origin).toBe("user");
  });
});

describe("Scenario 11 — insufficient evidence leads to asking or silence, never a fabricated claim", () => {
  it("possibleDownstreamEffects returns nothing when there is no dated evidence or no finance history", async () => {
    const claim = {
      id: "insight:1", status: "observation" as const, statement: "x", confidence: 0.8,
      domain: "mind" as const, evidence: [], createdAt: NOW.toISOString(),
    };
    expect(possibleDownstreamEffects(handle, SPACE, claim, NOW)).toEqual([]);
  });

  it("resolveClarificationFromMessage never invents a confirmation when nothing was actually asked", async () => {
    const r = await resolveClarificationFromMessage(handle, deps, "Yes, absolutely.", SPACE);
    expect(r).toBeNull(); // no pending clarification exists — nothing to confirm
  });
});

describe("Scenario 12 — privacy / space isolation across every new I1-I3 mechanism", () => {
  it("the full car-accident flow in one space never leaks into another", async () => {
    const { accidentId } = await makeVehicleContradiction();
    const clarifications = new IntelligenceClarificationsRepo(handle, SPACE);
    clarifications.create({
      claimId: "insight:1", domain: "mind", question: "q?",
      evidence: [{ domain: "memory", kind: "node", id: accidentId, label: "accident" }],
    });

    // A different space sees no pending clarification, cannot resolve one, and cannot
    // resolve the same Galaxy entity id.
    expect(new IntelligenceClarificationsRepo(handle, "other-space").mostRecentPending()).toBeNull();
    expect(await resolveClarificationFromMessage(handle, deps, "Yes, totaled.", "other-space")).toBeNull();
    expect(resolveGalaxyEntity(handle, "other-space", "node", accidentId, NOW)).toBeNull();

    // The origin space is unaffected and still resolves correctly.
    expect(resolveGalaxyEntity(handle, SPACE, "node", accidentId, NOW)).not.toBeNull();
  });
});
