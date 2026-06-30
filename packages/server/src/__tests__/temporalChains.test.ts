import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { HashEmbeddingProvider } from "../embeddings/hash.js";
import { HeuristicProvider } from "../llm/heuristic.js";
import { EMBED_DIM } from "../db/vec.js";
import { ingest } from "../ingestion/pipeline.js";
import { buildEvolutionLinks, linkStrength } from "../analysis/temporalChains.js";

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
