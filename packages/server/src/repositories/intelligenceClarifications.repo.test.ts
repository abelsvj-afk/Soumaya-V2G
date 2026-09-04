import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { IntelligenceClarificationsRepo } from "./intelligenceClarifications.repo.js";

let handle: DbHandle;
beforeEach(() => { handle = createDb(":memory:"); });
afterEach(() => handle.sqlite.close());

describe("IntelligenceClarificationsRepo", () => {
  it("creates a pending clarification and reads it back with parsed evidence", () => {
    const repo = new IntelligenceClarificationsRepo(handle, "s1");
    const rec = repo.create({
      claimId: "insight:1", domain: "mind", question: "Is this the same vehicle?",
      evidence: [{ domain: "memory", kind: "node", id: 5, label: "vehicle memory" }],
    });
    expect(rec.status).toBe("pending");
    expect(rec.evidence).toEqual([{ domain: "memory", kind: "node", id: 5, label: "vehicle memory" }]);
  });

  it("mostRecentPending finds the latest pending record and ignores resolved ones", () => {
    const repo = new IntelligenceClarificationsRepo(handle, "s1");
    const first = repo.create({ claimId: "insight:1", domain: "mind", question: "q1", evidence: [] });
    repo.resolve(first.id, { status: "dismissed" });
    const second = repo.create({ claimId: "insight:2", domain: "mind", question: "q2", evidence: [] });
    const found = repo.mostRecentPending();
    expect(found?.id).toBe(second.id);
  });

  it("resolve() records the confirmed statement and node id, sets resolvedAt", () => {
    const repo = new IntelligenceClarificationsRepo(handle, "s1");
    const rec = repo.create({ claimId: "insight:1", domain: "mind", question: "q?", evidence: [] });
    const resolved = repo.resolve(rec.id, { status: "confirmed", answerText: "Yes, totaled.", confirmedStatement: "Vehicle was totaled.", confirmedNodeId: 42 });
    expect(resolved?.status).toBe("confirmed");
    expect(resolved?.confirmedNodeId).toBe(42);
    expect(resolved?.resolvedAt).not.toBeNull();
  });

  it("createdSince respects a cutoff", () => {
    const repo = new IntelligenceClarificationsRepo(handle, "s1");
    expect(repo.createdSince("2026-01-01 00:00:00")).toBe(false);
    repo.create({ claimId: "insight:1", domain: "mind", question: "q?", evidence: [] });
    expect(repo.createdSince("2020-01-01 00:00:00")).toBe(true);
  });

  it("is space-scoped", () => {
    const s1 = new IntelligenceClarificationsRepo(handle, "s1");
    const s2 = new IntelligenceClarificationsRepo(handle, "s2");
    s1.create({ claimId: "insight:1", domain: "mind", question: "q?", evidence: [] });
    expect(s2.mostRecentPending()).toBeNull();
  });
});
