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
import { resolveGalaxyEntity, navigationIntentFor } from "./galaxyEntity.js";

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
