import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { HashEmbeddingProvider } from "../embeddings/hash.js";
import { HeuristicProvider } from "../llm/heuristic.js";
import { EMBED_DIM } from "../db/vec.js";
import { chat, DEFAULT_CHAT } from "../chat/graphrag.js";
import { ingest } from "../ingestion/pipeline.js";
import { JourneysRepo } from "../repositories/journeys.repo.js";

/**
 * Phase P — Journey-aware retrieval reality audit (docs/specs/journey-aware-retrieval-audit.md).
 *
 * MEASUREMENT ONLY — this file changes zero production behavior. It drives the REAL `chat()`
 * entry point (same GraphRAG pipeline the app uses) over a controlled dataset of Journey-linked
 * memories, and records what the pipeline ACTUALLY retrieves, so the audit doc's findings are
 * measured, not asserted. Same honest caveat as mayaRealityTest.test.ts: `HashEmbeddingProvider`
 * is a crude word-hash (not real semantics) and `HeuristicProvider` is the offline
 * template-based LLM fallback — this is the only combination this sandbox can run for real (no
 * cloud API keys/network). Numbers measured here are a LOWER BOUND on what a real embedding
 * model would find via incidental semantic overlap; the STRUCTURAL claim this file exists to
 * verify — whether `journey_link` rows are ever consulted by retrieval/graph-expansion — does
 * NOT depend on embedding quality at all, and is checked directly against the `edges` table.
 */

let handle: DbHandle;
const embeddings = new HashEmbeddingProvider(EMBED_DIM);
const llm = new HeuristicProvider();
const SPACE = "s1";

beforeEach(() => { handle = createDb(":memory:"); });
afterEach(() => handle.sqlite.close());

async function memo(text: string): Promise<number> {
  return (await ingest(handle, { embeddings, llm }, text, SPACE)).nodes[0]!.id;
}

// mayaRealityTest.test.ts's own documented finding (docs/specs/maya-reality-test.md §Context
// Relevance): GraphRAG's core retrieval has NO minimum-relevance floor, so at a SMALL total
// corpus size, top-k KNN/BM25 trivially returns "least dissimilar of what little exists" —
// which would make every scenario below look artificially good/bad regardless of Journey
// awareness, confounding the actual measurement. A real space accumulates far more than
// opts.k(=6) memories, so a realistic-volume filler pool (20 unrelated, varied memories) is
// used everywhere contamination/discrimination is being measured, so retrieval is actually
// forced to choose rather than sweep in everything that exists.
const FILLER = [
  "Had dinner with my sister last night.",
  "Paid the electric bill today.",
  "Watched a movie with my roommate.",
  "The dog needs a vet appointment next week.",
  "Finally cleaned out the garage this weekend.",
  "My phone screen cracked again.",
  "Tried a new recipe for dinner, turned out great.",
  "Need to renew my driver's license soon.",
  "Went for a run this morning, felt good.",
  "The neighbor's party kept me up late.",
  "Finished reading a novel I'd started months ago.",
  "Booked a dentist appointment for next month.",
  "My favorite coffee shop closed down.",
  "Spent the afternoon organizing old photos.",
  "The car needs an oil change.",
  "Caught up with an old friend over coffee.",
  "Started a new plant on the windowsill.",
  "The internet went out for a few hours today.",
  "Cleaned the kitchen top to bottom.",
  "Watched the sunset from the porch tonight.",
];
async function fillerPool(): Promise<number[]> {
  const ids: number[] = [];
  for (const text of FILLER) ids.push(await memo(text));
  return ids;
}

function edgeExists(a: number, b: number): boolean {
  const row = handle.sqlite
    .prepare(`SELECT 1 FROM edges WHERE (source = ? AND target = ?) OR (source = ? AND target = ?)`)
    .get(a, b, a, b);
  return row !== undefined;
}

describe("§1 — journey_link is structurally invisible to graph expansion (deterministic, no LLM/embedding dependency)", () => {
  it("multiHopNeighbors only ever walks `edges` — linking two nodes via journey_link creates no edge between them", async () => {
    const a = await memo("Started nursing school today.");
    const b = await memo("Finished my grocery shopping list.");
    const j = new JourneysRepo(handle, SPACE).create({ title: "Become a Registered Nurse" });
    new JourneysRepo(handle, SPACE).link(j.id, "node", a);
    new JourneysRepo(handle, SPACE).link(j.id, "node", b);

    // These two nodes are now BOTH linked to the same Journey, but journey_link never writes
    // to `edges` (confirmed: JourneysRepo.link only inserts into journey_link) — so unless
    // associativeLink independently created a real edge between them (it didn't here — the
    // memories are unrelated), multiHopNeighbors (graph/traversal.ts, `edges`-only) can never
    // discover "b via a" or vice versa on the strength of shared Journey membership alone.
    expect(edgeExists(a, b)).toBe(false);
  });
});

describe("§2 — Journey-specific question: does current hybrid retrieval surface a journey's own linked memories?", () => {
  it("measures recall of Journey-linked memories in chat()'s real contextIds for a direct, on-topic question", async () => {
    const j = new JourneysRepo(handle, SPACE).create({ title: "Become a Registered Nurse" });
    const linked: number[] = [];
    // Deliberately varied wording — a real Journey accumulates memories phrased differently
    // over time, not a repeated keyword.
    linked.push(await memo("Started nursing school today, nervous about the anatomy course."));
    linked.push(await memo("Spent six hours memorizing bone names for tomorrow's exam."));
    linked.push(await memo("Passed my clinical rotation in the ICU, feeling more confident now."));
    for (const id of linked) new JourneysRepo(handle, SPACE).link(j.id, "node", id);

    // Unrelated filler so retrieval has to actually discriminate (mayaRealityTest.test.ts's
    // own pattern) — a completely different Journey's own memories, not generic noise, so this
    // also doubles as the contamination check in §3 — plus a realistic-volume filler pool so
    // the corpus is well above opts.k and retrieval can't just sweep in everything that exists.
    const j2 = new JourneysRepo(handle, SPACE).create({ title: "Build a Trucking Company" });
    const otherLinked: number[] = [];
    otherLinked.push(await memo("Bought my first semi truck today, huge step for the business."));
    otherLinked.push(await memo("Revenue per mile calculations are still confusing me."));
    for (const id of otherLinked) new JourneysRepo(handle, SPACE).link(j2.id, "node", id);
    await fillerPool();

    const result = await chat(handle, { embeddings, llm }, "What was I trying to accomplish with my nursing journey?", DEFAULT_CHAT, SPACE);

    const recalled = linked.filter((id) => result.contextIds.includes(id));
    // eslint-disable-next-line no-console
    console.log(
      `[journey-aware-retrieval-audit] §2 direct question — recall ${recalled.length}/${linked.length} ` +
        `linked memories in contextIds=${JSON.stringify(result.contextIds)}`,
    );

    // The literal-keyword-sharing memory ("nursing school") is the one BM25/vector retrieval
    // is most likely to find on its own merits — assert that much works today (the floor).
    expect(result.contextIds).toContain(linked[0]);
    // Record, don't assert, whether the indirectly-worded ones (no shared literal vocabulary
    // with the query) also made it in — this is the actual open question the audit doc answers
    // with this number, not a hardcoded expectation baked into the test.
  });
});

describe("§3 — contamination: does an unrelated Journey's linked memories leak into a different Journey's question?", () => {
  it("checks whether the trucking Journey's own linked memories appear when asking about the nursing Journey", async () => {
    const j1 = new JourneysRepo(handle, SPACE).create({ title: "Become a Registered Nurse" });
    const nursing = [
      await memo("Started nursing school today, nervous about the anatomy course."),
      await memo("Passed my clinical rotation in the ICU, feeling more confident now."),
    ];
    for (const id of nursing) new JourneysRepo(handle, SPACE).link(j1.id, "node", id);

    const j2 = new JourneysRepo(handle, SPACE).create({ title: "Build a Trucking Company" });
    const trucking = [
      await memo("Bought my first semi truck today, huge step for the business."),
      await memo("Revenue per mile calculations are still confusing me."),
    ];
    for (const id of trucking) new JourneysRepo(handle, SPACE).link(j2.id, "node", id);
    await fillerPool();

    const result = await chat(handle, { embeddings, llm }, "What was I trying to accomplish with my nursing journey?", DEFAULT_CHAT, SPACE);
    const leaked = trucking.filter((id) => result.contextIds.includes(id));
    // eslint-disable-next-line no-console
    console.log(`[journey-aware-retrieval-audit] §3 contamination — trucking ids leaked into nursing question: ${leaked.length}/${trucking.length}`);
    // Current retrieval has no Journey concept at all, so it is naturally immune to
    // cross-Journey contamination — not because it discriminates, but because it never
    // considers Journey membership either direction. Document the count either way.
    expect(leaked.length).toBeLessThanOrEqual(trucking.length);
  });
});

describe("§4 — ambiguous question: two Journeys, generic 'journey' language, no domain-naming words", () => {
  it("measures which Journey's memories (if any) a domain-free question resolves to", async () => {
    const j1 = new JourneysRepo(handle, SPACE).create({ title: "Become a Registered Nurse" });
    const nursing = [await memo("Started nursing school today, nervous about the anatomy course.")];
    for (const id of nursing) new JourneysRepo(handle, SPACE).link(j1.id, "node", id);

    const j2 = new JourneysRepo(handle, SPACE).create({ title: "Build a Trucking Company" });
    const trucking = [await memo("Bought my first semi truck today, huge step for the business.")];
    for (const id of trucking) new JourneysRepo(handle, SPACE).link(j2.id, "node", id);
    await fillerPool();

    const result = await chat(handle, { embeddings, llm }, "How has my journey changed since I started?", DEFAULT_CHAT, SPACE);
    const gotNursing = nursing.some((id) => result.contextIds.includes(id));
    const gotTrucking = trucking.some((id) => result.contextIds.includes(id));
    // eslint-disable-next-line no-console
    console.log(`[journey-aware-retrieval-audit] §4 ambiguous — nursing hit=${gotNursing} trucking hit=${gotTrucking}`);
    // No assertion on WHICH one (or neither) wins — the point is that current retrieval has
    // no mechanism to ask "which Journey does the user mean" at all; it just does whatever
    // vector/BM25 similarity happens to produce for the literal words in the question.
  });
});

describe("§5 — cross-domain: does a nursing-Journey question naturally pull in a linked Financial Goal?", () => {
  it("checks whether graph expansion connects a Journey's memory content to a cross-domain linked item with no textual overlap", async () => {
    const j = new JourneysRepo(handle, SPACE).create({ title: "Become a Registered Nurse" });
    const memoryId = await memo("Nursing school is expensive — tuition is really weighing on me.");
    new JourneysRepo(handle, SPACE).link(j.id, "node", memoryId);

    // A completely separate node standing in for "a linked Financial Goal's own text" would
    // require the finance schema; simulate the cross-domain case with a second, textually
    // DIFFERENT memory (no shared vocabulary with the tuition memory) linked to the SAME
    // Journey, mirroring how a real fin_goal ("Nursing School Fund") would have its own
    // unrelated-looking label.
    const goalStandIn = await memo("Set aside part of this paycheck for something important.");
    new JourneysRepo(handle, SPACE).link(j.id, "node", goalStandIn);
    await fillerPool();

    const result = await chat(handle, { embeddings, llm }, "How is nursing school affecting my finances?", DEFAULT_CHAT, SPACE);
    const gotGoal = result.contextIds.includes(goalStandIn);
    // eslint-disable-next-line no-console
    console.log(`[journey-aware-retrieval-audit] §5 cross-domain — textually-unrelated same-Journey item retrieved: ${gotGoal}`);
    expect(edgeExists(memoryId, goalStandIn)).toBe(false); // no auto-link formed between them
  });
});

describe("§6 — temporal: does one query surface a Journey's beginning AND its current state together?", () => {
  it("measures how many of three chronologically-spread, differently-worded Journey memories a single question surfaces", async () => {
    const j = new JourneysRepo(handle, SPACE).create({ title: "Become a Registered Nurse" });
    const early = await memo("Just enrolled in nursing school, terrified I made the wrong choice.");
    const mid = await memo("Halfway through clinicals now, starting to feel like I belong here.");
    const late = await memo("Got my nursing license today after years of work.");
    for (const id of [early, mid, late]) new JourneysRepo(handle, SPACE).link(j.id, "node", id);
    await fillerPool();

    const result = await chat(handle, { embeddings, llm }, "How has my nursing journey evolved from when I started to now?", DEFAULT_CHAT, SPACE);
    const stages = { early: result.contextIds.includes(early), mid: result.contextIds.includes(mid), late: result.contextIds.includes(late) };
    const recalledCount = Object.values(stages).filter(Boolean).length;
    // eslint-disable-next-line no-console
    console.log(`[journey-aware-retrieval-audit] §6 temporal — stages recalled: ${JSON.stringify(stages)} (${recalledCount}/3)`);
    // No hardcoded pass/fail — recorded for the audit doc's temporal-continuity finding.
    expect(recalledCount).toBeGreaterThanOrEqual(0);
  });
});

describe("§7 — simulated hybrid candidate source: how many linked memories would a bounded Journey-aware add-on recover?", () => {
  it("computes the delta between current contextIds and (contextIds UNION journey_link's own node ids) without implementing the union", async () => {
    const j = new JourneysRepo(handle, SPACE).create({ title: "Become a Registered Nurse" });
    const linked = [
      await memo("Started nursing school today, nervous about the anatomy course."),
      await memo("Spent six hours memorizing bone names for tomorrow's exam."),
      await memo("Passed my clinical rotation in the ICU, feeling more confident now."),
      await memo("Got my nursing license today after years of work."),
    ];
    for (const id of linked) new JourneysRepo(handle, SPACE).link(j.id, "node", id);
    await fillerPool();

    const result = await chat(handle, { embeddings, llm }, "What was I trying to accomplish with my nursing journey?", DEFAULT_CHAT, SPACE);
    // This is the read-only measurement the spec asks for: what `JourneysRepo.links()`
    // (already-shipped, already-used-elsewhere-for-the-panel) already knows, compared against
    // what chat() already retrieved — no new code path, no simulated retrieval system.
    const journeyOwnIds = new JourneysRepo(handle, SPACE)
      .links(j.id)
      .filter((l) => l.kind === "node")
      .map((l) => l.refId);
    const missing = journeyOwnIds.filter((id) => !result.contextIds.includes(id));
    // eslint-disable-next-line no-console
    console.log(
      `[journey-aware-retrieval-audit] §7 hybrid delta — ${missing.length}/${journeyOwnIds.length} ` +
        `Journey-linked memories were NOT already in chat()'s contextIds (would be added by a bounded union)`,
    );
    expect(journeyOwnIds.length).toBe(linked.length); // sanity: the links really exist
  });
});
