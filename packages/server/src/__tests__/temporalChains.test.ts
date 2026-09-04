import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { HashEmbeddingProvider } from "../embeddings/hash.js";
import { HeuristicProvider } from "../llm/heuristic.js";
import { EMBED_DIM } from "../db/vec.js";
import { ingest } from "../ingestion/pipeline.js";
import { buildEvolutionLinks, buildEvolutionLinksAmong, linkStrength } from "../analysis/temporalChains.js";
import { NodesRepo } from "../repositories/nodes.repo.js";

let handle: DbHandle;
const embeddings = new HashEmbeddingProvider(EMBED_DIM);
const llm = new HeuristicProvider();

beforeEach(() => {
  handle = createDb(":memory:");
});
afterEach(() => handle.sqlite.close());

/** Backdate a node's occurred_at so we control the temporal gap. */
function backdate(id: number, iso: string) {
  handle.sqlite.prepare(`UPDATE nodes SET occurred_at = ? WHERE id = ?`).run(iso, id);
}

describe("temporal evolution links (#8)", () => {
  it("bands similarity into strength", () => {
    expect(linkStrength(0.95)).toBe("strong");
    expect(linkStrength(0.88)).toBe("medium");
    expect(linkStrength(0.85)).toBe("weak");
  });

  it("links same-theme memories older → newer with the temporal distance", async () => {
    const a = (await ingest(handle, { embeddings, llm }, "Starting to learn the piano, total beginner.")).nodes[0]!.id;
    const b = (await ingest(handle, { embeddings, llm }, "Learning the piano is going well, played a whole song.")).nodes[0]!.id;
    backdate(a, "2026-01-01T12:00:00");
    backdate(b, "2026-04-01T12:00:00"); // ~90 days later

    const links = buildEvolutionLinks(handle, "legacy", { threshold: 0.05, minGapDays: 14, k: 6, maxLinks: 10 });
    expect(links.length).toBeGreaterThan(0);
    const link = links[0]!;
    expect(link.fromId).toBe(a); // older first
    expect(link.toId).toBe(b);
    expect(link.temporalDistanceDays).toBeGreaterThanOrEqual(80);
    expect(link.reason).toContain("apart");
  });

  it("excludes pairs that are too close in time", async () => {
    const a = (await ingest(handle, { embeddings, llm }, "Thinking about a trip to Japan.")).nodes[0]!.id;
    const b = (await ingest(handle, { embeddings, llm }, "More planning for the Japan trip.")).nodes[0]!.id;
    backdate(a, "2026-05-01T12:00:00");
    backdate(b, "2026-05-03T12:00:00"); // only 2 days apart
    const links = buildEvolutionLinks(handle, "legacy", { threshold: 0.05, minGapDays: 14, k: 6, maxLinks: 10 });
    expect(links).toEqual([]);
  });

  it("returns nothing for a single memory", async () => {
    await ingest(handle, { embeddings, llm }, "A lone thought.");
    expect(buildEvolutionLinks(handle, "legacy")).toEqual([]);
  });
});

/**
 * Maya Longitudinal Intelligence, Phase A (docs/specs/maya-longitudinal-intelligence.md) —
 * `buildEvolutionLinksAmong`'s bounded outer loop. The performance bug being fixed:
 * `buildEvolutionLinks()` (above) does `NodesRepo.all()` — fetching EVERY memory in the space —
 * then one `getEmbedding()` + one `knn()` call PER node, on every chat message. These tests
 * prove the bounded entry point (a) returns the same relevant links as the full scan when given
 * the relevant context, (b) never grows in cost with unrelated memory count, and (c) never
 * touches `NodesRepo.all()` at all — a non-timing instrumentation check per the task's own
 * "if practical" ask, since timing assertions are flaky and don't actually prove the O(N) work
 * was eliminated.
 */
describe("buildEvolutionLinksAmong — bounded outer loop (Maya Longitudinal Intelligence Phase A)", () => {
  it("returns the same relevant link as the full scan when given the relevant context ids", async () => {
    const a = (await ingest(handle, { embeddings, llm }, "Starting to learn the piano, total beginner.")).nodes[0]!.id;
    const b = (await ingest(handle, { embeddings, llm }, "Learning the piano is going well, played a whole song.")).nodes[0]!.id;
    backdate(a, "2026-01-01T12:00:00");
    backdate(b, "2026-04-01T12:00:00");

    const opts = { threshold: 0.05, minGapDays: 14, k: 6, maxLinks: 10 };
    const full = buildEvolutionLinks(handle, "legacy", opts);
    const bounded = buildEvolutionLinksAmong(handle, "legacy", [a], opts);

    expect(bounded.length).toBe(full.length);
    expect(bounded[0]!.fromId).toBe(a);
    expect(bounded[0]!.toId).toBe(b);
    expect(bounded[0]!.temporalDistanceDays).toBe(full[0]!.temporalDistanceDays);
  });

  it("finds a counterpart outside the bounded context set (the outer loop is bounded, not the answer)", async () => {
    const a = (await ingest(handle, { embeddings, llm }, "Deciding whether to go back to school for a degree.")).nodes[0]!.id;
    const b = (await ingest(handle, { embeddings, llm }, "Finally decided to go back to school for a degree.")).nodes[0]!.id;
    backdate(a, "2026-01-01T12:00:00");
    backdate(b, "2026-05-01T12:00:00");

    // Only the OLDER node seeds the outer loop — the newer counterpart lives outside
    // relevantIds entirely, reached only via resolveOther's single getById() fallback.
    const bounded = buildEvolutionLinksAmong(handle, "legacy", [a], { threshold: 0.05, minGapDays: 14, k: 6, maxLinks: 10 });
    expect(bounded.length).toBe(1);
    expect(bounded[0]!.fromId).toBe(a);
    expect(bounded[0]!.toId).toBe(b);
  });

  it("unrelated memories elsewhere in the space never change the bounded result (no global scanning)", async () => {
    // Identical text (as the existing "recognizes a theme" test above does) so the pair
    // reliably clears the module's own DEFAULT_TEMPORAL threshold (0.84) even under the
    // deterministic hash embedder — the artificially loose 0.05 used elsewhere in this file
    // would let unrelated text spuriously match too, which would make this test about
    // embedding noise rather than the bounding behavior actually under test.
    const a = (await ingest(handle, { embeddings, llm }, "Thinking seriously about starting a trucking company.")).nodes[0]!.id;
    const b = (await ingest(handle, { embeddings, llm }, "Thinking seriously about starting a trucking company.")).nodes[0]!.id;
    backdate(a, "2026-01-01T12:00:00");
    backdate(b, "2026-01-25T12:00:00");

    const opts = { threshold: 0.84, minGapDays: 14, k: 6, maxLinks: 10 };
    const before = buildEvolutionLinksAmong(handle, "legacy", [a], opts);
    expect(before.length).toBeGreaterThan(0);

    // A large batch of completely unrelated memories, added AFTER the pair above.
    for (let i = 0; i < 50; i++) {
      await ingest(handle, { embeddings, llm }, `Unrelated grocery list item number ${i}.`);
    }

    const after = buildEvolutionLinksAmong(handle, "legacy", [a], opts);
    expect(after).toEqual(before);
  });

  it("existing full-scan callers (e.g. the digest route) are unaffected — buildEvolutionLinks behavior is unchanged", async () => {
    const a = (await ingest(handle, { embeddings, llm }, "Starting to learn the piano, total beginner.")).nodes[0]!.id;
    const b = (await ingest(handle, { embeddings, llm }, "Learning the piano is going well, played a whole song.")).nodes[0]!.id;
    backdate(a, "2026-01-01T12:00:00");
    backdate(b, "2026-04-01T12:00:00");

    const opts = { threshold: 0.05, minGapDays: 14, k: 6, maxLinks: 10 };
    const links = buildEvolutionLinks(handle, "legacy", opts);
    expect(links.length).toBeGreaterThan(0);
    expect(links[0]!.fromId).toBe(a);
    expect(links[0]!.toId).toBe(b);
  });

  it("returns [] for an empty context — never falls back to a full scan", () => {
    expect(buildEvolutionLinksAmong(handle, "legacy", [])).toEqual([]);
  });

  it("is space-scoped — a context id from another space never leaks a cross-space link", async () => {
    const a = (await ingest(handle, { embeddings, llm }, "Starting to learn the piano, total beginner.", "space-a")).nodes[0]!.id;
    const b = (await ingest(handle, { embeddings, llm }, "Learning the piano is going well, played a whole song.", "space-b")).nodes[0]!.id;
    backdate(a, "2026-01-01T12:00:00");
    backdate(b, "2026-04-01T12:00:00");

    const opts = { threshold: 0.05, minGapDays: 14, k: 6, maxLinks: 10 };
    // Querying space-a with a's id must never surface b, which lives in space-b.
    const links = buildEvolutionLinksAmong(handle, "space-a", [a], opts);
    expect(links).toEqual([]);
  });

  it("instrumentation: never calls NodesRepo.all() — the bounded path does not perform a full-space scan", async () => {
    const a = (await ingest(handle, { embeddings, llm }, "Starting to learn the piano, total beginner.")).nodes[0]!.id;
    const b = (await ingest(handle, { embeddings, llm }, "Learning the piano is going well, played a whole song.")).nodes[0]!.id;
    backdate(a, "2026-01-01T12:00:00");
    backdate(b, "2026-04-01T12:00:00");

    const allSpy = vi.spyOn(NodesRepo.prototype, "all");
    try {
      buildEvolutionLinksAmong(handle, "legacy", [a], { threshold: 0.05, minGapDays: 14, k: 6, maxLinks: 10 });
      expect(allSpy).not.toHaveBeenCalled();
    } finally {
      allSpy.mockRestore();
    }
  });
});
