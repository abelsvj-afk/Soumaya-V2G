import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { NodesRepo } from "../repositories/nodes.repo.js";
import { InteractionPreferencesRepo } from "../repositories/interactionPreferences.repo.js";
import { recordPreferenceSignal, interactionPreferenceSnapshotText, SURFACE_CONFIDENCE_THRESHOLD, MIN_EVIDENCE_TO_SURFACE } from "./interactionPreferences.js";

/**
 * Maya Longitudinal Intelligence, Phase H (docs/specs/maya-longitudinal-intelligence.md,
 * Section 14) — learned interaction preferences. Covers the task's full required matrix:
 * explicit recognition, weak-evidence insufficiency, reinforcement, conflict handling, factual
 * non-interference, space isolation, and bounds.
 */

let handle: DbHandle;
beforeEach(() => {
  handle = createDb(":memory:");
});
afterEach(() => handle.sqlite.close());

describe("recording a signal never happens on weak (single) evidence", () => {
  it("a single explicit mention is stored but does not clear the surfacing bar", () => {
    recordPreferenceSignal(handle, "s1", "verbosity", "concise");
    const row = new InteractionPreferencesRepo(handle, "s1").get("verbosity");
    expect(row).toBeTruthy();
    expect(row!.evidenceCount).toBe(1);
    expect(row!.confidence).toBeLessThan(SURFACE_CONFIDENCE_THRESHOLD);
    expect(interactionPreferenceSnapshotText(handle, "s1")).toBeNull();
  });
});

describe("repeated, consistent evidence strengthens a preference into something durable", () => {
  it("a second consistent mention clears both the confidence and evidence-count bars", () => {
    recordPreferenceSignal(handle, "s1", "verbosity", "concise");
    recordPreferenceSignal(handle, "s1", "verbosity", "concise");
    const row = new InteractionPreferencesRepo(handle, "s1").get("verbosity");
    expect(row!.evidenceCount).toBeGreaterThanOrEqual(MIN_EVIDENCE_TO_SURFACE);
    expect(row!.confidence).toBeGreaterThanOrEqual(SURFACE_CONFIDENCE_THRESHOLD);

    const text = interactionPreferenceSnapshotText(handle, "s1");
    expect(text).not.toBeNull();
    expect(text).toContain("verbosity");
    expect(text).toContain("concise");
    expect(text).toContain("2x");
  });

  it("confidence grows monotonically with more consistent mentions but never reaches 1.0 ('certain')", () => {
    for (let i = 0; i < 10; i++) recordPreferenceSignal(handle, "s1", "directness", "very direct");
    const row = new InteractionPreferencesRepo(handle, "s1").get("directness")!;
    expect(row.confidence).toBeLessThan(1.0);
    expect(row.confidence).toBeLessThanOrEqual(0.9);
  });
});

describe("conflicting evidence for the same signal is handled conservatively, not an instant flip", () => {
  it("a new, conflicting value resets to a fresh, weak baseline rather than inheriting the old confidence", () => {
    recordPreferenceSignal(handle, "s1", "verbosity", "concise");
    recordPreferenceSignal(handle, "s1", "verbosity", "concise"); // now durable (2x, confident)
    const before = new InteractionPreferencesRepo(handle, "s1").get("verbosity")!;
    expect(before.confidence).toBeGreaterThanOrEqual(SURFACE_CONFIDENCE_THRESHOLD);

    recordPreferenceSignal(handle, "s1", "verbosity", "detailed"); // conflicting value
    const after = new InteractionPreferencesRepo(handle, "s1").get("verbosity")!;
    expect(after.value).toBe("detailed");
    expect(after.evidenceCount).toBe(1); // starts over, does not inherit the old count
    expect(after.confidence).toBeLessThan(SURFACE_CONFIDENCE_THRESHOLD); // not yet durable either

    // Explainable: the OLD durable claim is gone from the surfaced snapshot (superseded), but
    // the NEW one hasn't earned durability yet — nothing false is asserted about either.
    expect(interactionPreferenceSnapshotText(handle, "s1")).toBeNull();
  });

  it("the new value becomes durable itself once IT is repeated", () => {
    recordPreferenceSignal(handle, "s1", "verbosity", "concise");
    recordPreferenceSignal(handle, "s1", "verbosity", "concise");
    recordPreferenceSignal(handle, "s1", "verbosity", "detailed");
    recordPreferenceSignal(handle, "s1", "verbosity", "detailed");
    const text = interactionPreferenceSnapshotText(handle, "s1");
    expect(text).toContain("detailed");
    expect(text).not.toContain("concise");
  });
});

describe("a learned preference never modifies factual memory", () => {
  it("recording preference signals never touches the nodes table", async () => {
    const repo = new NodesRepo(handle, "s1");
    const node = repo.create({ label: "A real memory", content: "Something that happened.", type: "other" }, new Float32Array(384));
    const before = handle.sqlite.prepare(`SELECT label, content FROM nodes WHERE id = ?`).get(node.id);

    recordPreferenceSignal(handle, "s1", "verbosity", "concise");
    recordPreferenceSignal(handle, "s1", "verbosity", "concise");
    interactionPreferenceSnapshotText(handle, "s1");

    const after = handle.sqlite.prepare(`SELECT label, content FROM nodes WHERE id = ?`).get(node.id);
    expect(after).toEqual(before);
    const nodeCount = (handle.sqlite.prepare(`SELECT COUNT(*) AS c FROM nodes`).get() as { c: number }).c;
    expect(nodeCount).toBe(1); // no new memory/knowledge node was created either
  });
});

describe("space isolation", () => {
  it("a preference recorded in one space never influences another space's snapshot", () => {
    recordPreferenceSignal(handle, "space-a", "verbosity", "concise");
    recordPreferenceSignal(handle, "space-a", "verbosity", "concise");
    expect(interactionPreferenceSnapshotText(handle, "space-a")).not.toBeNull();
    expect(interactionPreferenceSnapshotText(handle, "space-b")).toBeNull();
    expect(new InteractionPreferencesRepo(handle, "space-b").get("verbosity")).toBeUndefined();
  });
});

describe("bounds", () => {
  it("never scans the nodes table (NodesRepo.all()), regardless of how many preferences/memories exist", async () => {
    for (let i = 0; i < 20; i++) recordPreferenceSignal(handle, "s1", `signal-${i}`, `value-${i}`);
    const repo = new NodesRepo(handle, "s1");
    for (let i = 0; i < 30; i++) await repo.create({ label: `n${i}`, content: `content ${i}`, type: "other" }, new Float32Array(384));

    const allSpy = vi.spyOn(NodesRepo.prototype, "all");
    try {
      recordPreferenceSignal(handle, "s1", "verbosity", "concise");
      interactionPreferenceSnapshotText(handle, "s1");
      expect(allSpy).not.toHaveBeenCalled();
    } finally {
      allSpy.mockRestore();
    }
  });
});

describe("malformed/empty input never records anything", () => {
  it("empty signal or value is silently ignored", () => {
    recordPreferenceSignal(handle, "s1", "", "concise");
    recordPreferenceSignal(handle, "s1", "verbosity", "   ");
    expect(new InteractionPreferencesRepo(handle, "s1").list()).toEqual([]);
  });
});
