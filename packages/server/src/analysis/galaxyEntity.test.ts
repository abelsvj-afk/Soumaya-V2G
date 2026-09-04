import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { HashEmbeddingProvider } from "../embeddings/hash.js";
import { EMBED_DIM } from "../db/vec.js";
import { NodesRepo } from "../repositories/nodes.repo.js";
import { JourneysRepo } from "../repositories/journeys.repo.js";
import { FinBucketRepo } from "../repositories/finBucket.repo.js";
import { FinGoalRepo } from "../repositories/finGoal.repo.js";
import { FinAllocationRepo } from "../repositories/finAllocation.repo.js";
import { FinBillRepo } from "../repositories/finBill.repo.js";
import type { GalaxyNavigationCandidate } from "@brain/shared";
import { resolveGalaxyEntity, navigationIntentFor, buildNavigationCandidateList, resolveNavigationIntent } from "./galaxyEntity.js";

let handle: DbHandle;
const embeddings = new HashEmbeddingProvider(EMBED_DIM);
const SPACE = "s1";
const NOW = new Date("2026-06-15T12:00:00Z");

beforeEach(() => {
  handle = createDb(":memory:");
});
afterEach(() => handle.sqlite.close());

describe("resolveGalaxyEntity (I3)", () => {
  it("returns null for a kind/id that doesn't exist", () => {
    expect(resolveGalaxyEntity(handle, SPACE, "node", 999)).toBeNull();
    expect(resolveGalaxyEntity(handle, SPACE, "journey", 999)).toBeNull();
    expect(resolveGalaxyEntity(handle, SPACE, "bill", 999)).toBeNull();
    expect(resolveGalaxyEntity(handle, SPACE, "goal", 999)).toBeNull();
  });

  it("resolves a memory node with a recency-framed state and its occurredAt as temporal", async () => {
    const nodesRepo = new NodesRepo(handle, SPACE);
    const vec = await embeddings.embed("Bought a 2016 Honda Civic.");
    const node = nodesRepo.create(
      { label: "New car", type: "daily", content: "Bought a 2016 Honda Civic.", occurredAt: "2026-06-13T00:00:00Z" },
      vec,
    );

    const d = resolveGalaxyEntity(handle, SPACE, "node", node.id, NOW);
    expect(d).not.toBeNull();
    expect(d!.ref).toEqual({ domain: "memory", kind: "node", id: node.id, label: "New car" });
    expect(d!.state).toContain("Bought a 2016 Honda Civic");
    expect(d!.temporal).toBe("2026-06-13T00:00:00Z");
    expect(d!.navigable).toBe(true);
  });

  it("resolves a journey with status/progress/link-count state", () => {
    const journeysRepo = new JourneysRepo(handle, SPACE);
    const journey = journeysRepo.create({ title: "Buy a home", description: "Saving for a down payment", status: "active" });
    journeysRepo.update(journey.id, { progress: 0.4 });

    const d = resolveGalaxyEntity(handle, SPACE, "journey", journey.id, NOW);
    expect(d).not.toBeNull();
    expect(d!.ref).toEqual({ domain: "journey", kind: "journey", id: journey.id, label: "Buy a home" });
    expect(d!.state).toContain("Active");
    expect(d!.state).toContain("40%");
    expect(d!.state).toContain("nothing linked yet");
    expect(d!.navigable).toBe(true);
  });

  it("resolves a bill star with the exact state moneySky() computes, including its due date", () => {
    const bills = new FinBillRepo(handle, SPACE);
    // Anchored far in the past on a monthly cadence so a materialized occurrence lands
    // reliably within moneySky()'s +/- window around NOW, regardless of NOW's exact day.
    const bill = bills.create({ name: "Rent", amountCents: 150000, frequency: "monthly", anchorDate: "2020-01-01" });

    const d = resolveGalaxyEntity(handle, SPACE, "bill", bill.id, NOW);
    expect(d).not.toBeNull();
    expect(d!.ref).toEqual({ domain: "money", kind: "fin_bill", id: bill.id, label: "Rent" });
    expect(d!.state).toContain("$1500.00");
    expect(d!.navigable).toBe(true);
  });

  it("resolves a goal star with saved-vs-target funding state and its target date as temporal", () => {
    const bucket = new FinBucketRepo(handle, SPACE).create({ name: "Savings" });
    const goal = new FinGoalRepo(handle, SPACE).create({ bucketId: bucket.id, name: "Emergency fund", targetCents: 100000, targetDate: "2026-12-31" });
    new FinAllocationRepo(handle, SPACE).create({ goalId: goal.id, amountCents: 40000 });

    const d = resolveGalaxyEntity(handle, SPACE, "goal", goal.id, NOW);
    expect(d).not.toBeNull();
    expect(d!.ref).toEqual({ domain: "money", kind: "fin_goal", id: goal.id, label: "Emergency fund" });
    expect(d!.state).toContain("40%");
    expect(d!.state).toContain("$400.00 of $1000.00");
    expect(d!.temporal).toBe("2026-12-31");
  });

  it("is space-scoped — an entity from another space never resolves", async () => {
    const nodesRepo = new NodesRepo(handle, SPACE);
    const vec = await embeddings.embed("private memory");
    const node = nodesRepo.create({ label: "x", type: "daily", content: "private memory" }, vec);
    expect(resolveGalaxyEntity(handle, "other-space", "node", node.id)).toBeNull();
  });
});

describe("navigationIntentFor (I3)", () => {
  it("carries the descriptor's own ref and state verbatim — never a separately invented reason", () => {
    const journeysRepo = new JourneysRepo(handle, SPACE);
    const journey = journeysRepo.create({ title: "Buy a home", status: "active" });
    const descriptor = resolveGalaxyEntity(handle, SPACE, "journey", journey.id, NOW)!;

    const intent = navigationIntentFor(descriptor);
    expect(intent.target).toEqual(descriptor.ref);
    expect(intent.reason).toBe(descriptor.state);
  });
});

describe("buildNavigationCandidateList (Maya Chat -> Galaxy Navigation)", () => {
  it("lists active journeys, non-archived goals, and bills, each capped, combined capped", () => {
    const journeysRepo = new JourneysRepo(handle, SPACE);
    const done = journeysRepo.create({ title: "Finished trip", status: "done" });
    const active = journeysRepo.create({ title: "Owner-operator transition", status: "active" });
    const bucket = new FinBucketRepo(handle, SPACE).create({ name: "Savings" });
    const goal = new FinGoalRepo(handle, SPACE).create({ bucketId: bucket.id, name: "Truck down payment", targetCents: 500000 });
    const bill = new FinBillRepo(handle, SPACE).create({ name: "Truck insurance", amountCents: 15000, frequency: "monthly", anchorDate: "2020-01-01" });

    const list = buildNavigationCandidateList(handle, SPACE);
    expect(list).toContainEqual({ kind: "journey", id: active.id, label: "Owner-operator transition" });
    // Checked by kind+id together, not id alone — journeys/goals/bills are separate
    // autoincrement tables, so a goal or bill could coincidentally share `done`'s id.
    expect(list.some((c) => c.kind === "journey" && c.id === done.id)).toBe(false);
    expect(list).toContainEqual({ kind: "goal", id: goal.id, label: "Truck down payment" });
    expect(list).toContainEqual({ kind: "bill", id: bill.id, label: "Truck insurance" });
  });

  it("is bounded and never grows unbounded with many entities", () => {
    const journeysRepo = new JourneysRepo(handle, SPACE);
    for (let i = 0; i < 10; i++) journeysRepo.create({ title: `Journey ${i}`, status: "active" });
    const bucket = new FinBucketRepo(handle, SPACE).create({ name: "Savings" });
    const goalsRepo = new FinGoalRepo(handle, SPACE);
    for (let i = 0; i < 10; i++) goalsRepo.create({ bucketId: bucket.id, name: `Goal ${i}` });
    const billsRepo = new FinBillRepo(handle, SPACE);
    for (let i = 0; i < 10; i++) billsRepo.create({ name: `Bill ${i}`, amountCents: 1000, frequency: "monthly", anchorDate: "2020-01-01" });

    expect(buildNavigationCandidateList(handle, SPACE).length).toBeLessThanOrEqual(6);
  });

  it("is space-scoped", () => {
    new JourneysRepo(handle, SPACE).create({ title: "Private journey", status: "active" });
    expect(buildNavigationCandidateList(handle, "other-space")).toEqual([]);
  });
});

describe("resolveNavigationIntent — the server-side authority (Model C)", () => {
  const candidate = (over: Partial<GalaxyNavigationCandidate>): GalaxyNavigationCandidate => ({ kind: "journey", id: 1, ...over });

  it("resolves a valid candidate into a real NavigationIntent", () => {
    const journey = new JourneysRepo(handle, SPACE).create({ title: "Owner-operator transition", status: "active" });
    const intent = resolveNavigationIntent(handle, SPACE, [candidate({ kind: "journey", id: journey.id })], NOW);
    expect(intent).not.toBeNull();
    expect(intent!.target).toEqual({ domain: "journey", kind: "journey", id: journey.id, label: "Owner-operator transition" });
  });

  it("rejects a nonexistent id — no navigation, never a fabrication", () => {
    expect(resolveNavigationIntent(handle, SPACE, [candidate({ id: 999_999 })], NOW)).toBeNull();
  });

  it("rejects an unsupported kind, including 'node' — memory navigation already has its own mechanism", () => {
    expect(resolveNavigationIntent(handle, SPACE, [candidate({ kind: "node" as any, id: 1 })], NOW)).toBeNull();
    expect(resolveNavigationIntent(handle, SPACE, [candidate({ kind: "bogus" as any, id: 1 })], NOW)).toBeNull();
  });

  it("rejects a real entity from ANOTHER space — the model cannot reach cross-space data", () => {
    const journey = new JourneysRepo(handle, "other-space").create({ title: "Not yours", status: "active" });
    expect(resolveNavigationIntent(handle, SPACE, [candidate({ kind: "journey", id: journey.id })], NOW)).toBeNull();
  });

  it("no candidates -> no navigation", () => {
    expect(resolveNavigationIntent(handle, SPACE, undefined, NOW)).toBeNull();
    expect(resolveNavigationIntent(handle, SPACE, [], NOW)).toBeNull();
  });

  it("multiple candidates: preserves the model's order, resolves the FIRST valid one, ignores the rest", () => {
    const journey = new JourneysRepo(handle, SPACE).create({ title: "Real journey", status: "active" });
    const bucket = new FinBucketRepo(handle, SPACE).create({ name: "Savings" });
    const goal = new FinGoalRepo(handle, SPACE).create({ bucketId: bucket.id, name: "Real goal" });
    const intent = resolveNavigationIntent(
      handle,
      SPACE,
      [candidate({ kind: "journey", id: 999_999 }), candidate({ kind: "journey", id: journey.id }), candidate({ kind: "goal", id: goal.id })],
      NOW,
    );
    expect(intent!.target.kind).toBe("journey");
    expect(intent!.target.id).toBe(journey.id);
  });

  it("the reason always comes from navigationIntentFor()'s descriptor state — never invented", () => {
    const journey = new JourneysRepo(handle, SPACE).create({ title: "Owner-operator transition", status: "active" });
    const descriptor = resolveGalaxyEntity(handle, SPACE, "journey", journey.id, NOW)!;
    const intent = resolveNavigationIntent(handle, SPACE, [candidate({ kind: "journey", id: journey.id })], NOW);
    expect(intent!.reason).toBe(descriptor.state);
  });

  it("the model cannot supply its own authoritative reason — extra fields on the candidate are ignored", () => {
    const journey = new JourneysRepo(handle, SPACE).create({ title: "Owner-operator transition", status: "active" });
    const injected = { kind: "journey", id: journey.id, reason: "I made this up", domain: "money" } as unknown as GalaxyNavigationCandidate;
    const intent = resolveNavigationIntent(handle, SPACE, [injected], NOW);
    expect(intent!.reason).not.toBe("I made this up");
    expect(intent!.target.domain).toBe("journey"); // the model's injected "domain":"money" is ignored too
  });

  it("performs zero writes — resolving navigation never mutates the database", () => {
    const journey = new JourneysRepo(handle, SPACE).create({ title: "Owner-operator transition", status: "active" });
    const before = handle.sqlite.prepare(`SELECT COUNT(*) AS c FROM nodes`).get() as { c: number };
    const beforeInsights = handle.sqlite.prepare(`SELECT COUNT(*) AS c FROM insights`).get() as { c: number };
    resolveNavigationIntent(handle, SPACE, [candidate({ kind: "journey", id: journey.id })], NOW);
    const after = handle.sqlite.prepare(`SELECT COUNT(*) AS c FROM nodes`).get() as { c: number };
    const afterInsights = handle.sqlite.prepare(`SELECT COUNT(*) AS c FROM insights`).get() as { c: number };
    expect(after.c).toBe(before.c);
    expect(afterInsights.c).toBe(beforeInsights.c);
  });
});
