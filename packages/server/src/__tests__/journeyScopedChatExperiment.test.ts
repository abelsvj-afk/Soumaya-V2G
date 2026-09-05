import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { HashEmbeddingProvider } from "../embeddings/hash.js";
import { HeuristicProvider } from "../llm/heuristic.js";
import { EMBED_DIM } from "../db/vec.js";
import { chat, DEFAULT_CHAT } from "../chat/graphrag.js";
import { ingest } from "../ingestion/pipeline.js";
import { JourneysRepo } from "../repositories/journeys.repo.js";

/**
 * Phase Q — Explicit Journey-scoped retrieval EXPERIMENT (docs/specs/journey-aware-retrieval-experiment.md).
 * Drives the real `chat()` GraphRAG entry point exactly like Phase P's audit
 * (journeyAwareRetrievalAudit.test.ts) — same honest caveat: `HashEmbeddingProvider`/
 * `HeuristicProvider` are the only combination this offline sandbox can run for real, so
 * numbers here are a plausible floor, not a ceiling, for what a real embedding model would do.
 * The one claim that's embedding-independent is dedup/cap/security-isolation — those are pure
 * code-path facts, verified directly regardless of what gets retrieved semantically.
 */

let handle: DbHandle;
const embeddings = new HashEmbeddingProvider(EMBED_DIM);
const llm = new HeuristicProvider();
const SPACE = "s1";
const OTHER_SPACE = "s2";

beforeEach(() => { handle = createDb(":memory:"); });
afterEach(() => { handle.sqlite.close(); vi.restoreAllMocks(); });

async function memo(text: string, spaceId = SPACE): Promise<number> {
  return (await ingest(handle, { embeddings, llm }, text, spaceId)).nodes[0]!.id;
}

const FILLER = [
  "Had dinner with my sister last night.", "Paid the electric bill today.",
  "Watched a movie with my roommate.", "The dog needs a vet appointment next week.",
  "Finally cleaned out the garage this weekend.", "My phone screen cracked again.",
  "Tried a new recipe for dinner, turned out great.", "Need to renew my driver's license soon.",
  "Went for a run this morning, felt good.", "The neighbor's party kept me up late.",
  "Finished reading a novel I'd started months ago.", "Booked a dentist appointment for next month.",
  "My favorite coffee shop closed down.", "Spent the afternoon organizing old photos.",
  "The car needs an oil change.", "Caught up with an old friend over coffee.",
  "Started a new plant on the windowsill.", "The internet went out for a few hours today.",
  "Cleaned the kitchen top to bottom.", "Watched the sunset from the porch tonight.",
];
async function fillerPool(): Promise<void> {
  for (const text of FILLER) await memo(text);
}

describe("Scenario A — direct Journey question, explicit scope", () => {
  it("recalls more of the Journey's own linked memories with journeyId than the same question without it", async () => {
    const j = new JourneysRepo(handle, SPACE).create({ title: "Become a Registered Nurse" });
    const linked = [
      await memo("Started nursing school today, nervous about the anatomy course."),
      await memo("Spent six hours memorizing bone names for tomorrow's exam."),
      await memo("Passed my clinical rotation in the ICU, feeling more confident now."),
    ];
    for (const id of linked) new JourneysRepo(handle, SPACE).link(j.id, "node", id);
    await fillerPool();

    const question = "What was I trying to accomplish with my nursing journey?";
    const unscoped = await chat(handle, { embeddings, llm }, question, DEFAULT_CHAT, SPACE, []);
    const scoped = await chat(handle, { embeddings, llm }, question, DEFAULT_CHAT, SPACE, [], j.id);

    const unscopedRecall = linked.filter((id) => unscoped.contextIds.includes(id)).length;
    const scopedRecall = linked.filter((id) => scoped.contextIds.includes(id)).length;
    // eslint-disable-next-line no-console
    console.log(`[journey-scoped-chat-experiment] Scenario A — recall unscoped=${unscopedRecall}/3 scoped=${scopedRecall}/3`);

    expect(scopedRecall).toBe(3); // every linked memory is now a candidate, by construction
    expect(scopedRecall).toBeGreaterThan(unscopedRecall);
  });
});

describe("Scenario B — indirectly-worded linked memory", () => {
  it("recovers a same-Journey memory that shares no vocabulary with the question, only when scoped", async () => {
    const j = new JourneysRepo(handle, SPACE).create({ title: "Become a Registered Nurse" });
    const indirect = await memo("Spent six hours memorizing bone names for tomorrow's exam.");
    new JourneysRepo(handle, SPACE).link(j.id, "node", indirect);
    await fillerPool();

    const question = "What was I trying to accomplish with my nursing journey?";
    const unscoped = await chat(handle, { embeddings, llm }, question, DEFAULT_CHAT, SPACE, []);
    const scoped = await chat(handle, { embeddings, llm }, question, DEFAULT_CHAT, SPACE, [], j.id);

    expect(unscoped.contextIds).not.toContain(indirect); // the measured Phase P miss, reproduced
    expect(scoped.contextIds).toContain(indirect); // closed by explicit scoping
  });
});

describe("Scenario C — cross-domain linked item", () => {
  it("recovers a textually-unrelated same-Journey item (standing in for a linked Financial Goal) only when scoped", async () => {
    const j = new JourneysRepo(handle, SPACE).create({ title: "Become a Registered Nurse" });
    const tuition = await memo("Nursing school is expensive — tuition is really weighing on me.");
    const goalStandIn = await memo("Set aside part of this paycheck for something important.");
    new JourneysRepo(handle, SPACE).link(j.id, "node", tuition);
    new JourneysRepo(handle, SPACE).link(j.id, "node", goalStandIn);
    await fillerPool();

    const question = "How is nursing school affecting my finances?";
    const unscoped = await chat(handle, { embeddings, llm }, question, DEFAULT_CHAT, SPACE, []);
    const scoped = await chat(handle, { embeddings, llm }, question, DEFAULT_CHAT, SPACE, [], j.id);

    expect(unscoped.contextIds).not.toContain(goalStandIn);
    expect(scoped.contextIds).toContain(goalStandIn);
  });
});

describe("Scenario D — longitudinal continuity", () => {
  it("recalls early/mid/late Journey stages together regardless of query phrasing, when scoped", async () => {
    const j = new JourneysRepo(handle, SPACE).create({ title: "Become a Registered Nurse" });
    const early = await memo("Just enrolled in nursing school, terrified I made the wrong choice.");
    const mid = await memo("Halfway through clinicals now, starting to feel like I belong here.");
    const late = await memo("Got my nursing license today after years of work.");
    for (const id of [early, mid, late]) new JourneysRepo(handle, SPACE).link(j.id, "node", id);
    await fillerPool();

    // Deliberately generic phrasing (unlike Phase P's favorably-worded temporal query) — the
    // whole point is that scoping should NOT depend on the question happening to share
    // vocabulary with every stage.
    const question = "Catch me up on where things stand.";
    const scoped = await chat(handle, { embeddings, llm }, question, DEFAULT_CHAT, SPACE, [], j.id);

    expect(scoped.contextIds).toContain(early);
    expect(scoped.contextIds).toContain(mid);
    expect(scoped.contextIds).toContain(late);
  });

  it("never rewrites or alters historical memory content — the early memory's own text is untouched", async () => {
    const j = new JourneysRepo(handle, SPACE).create({ title: "Become a Registered Nurse" });
    const early = await memo("Just enrolled in nursing school, terrified I made the wrong choice.");
    const late = await memo("Got my nursing license today after years of work.");
    for (const id of [early, late]) new JourneysRepo(handle, SPACE).link(j.id, "node", id);

    await chat(handle, { embeddings, llm }, "Catch me up.", DEFAULT_CHAT, SPACE, [], j.id);

    const row = handle.sqlite.prepare(`SELECT content FROM nodes WHERE id = ?`).get(early) as { content: string };
    expect(row.content).toBe("Just enrolled in nursing school, terrified I made the wrong choice.");
  });
});

describe("Scenario E — ambiguous Journeys, explicit scope resolves it", () => {
  it("scoping to Journey A injects only A's candidates; scoping to B injects only B's; unscoped behaves as before", async () => {
    const jA = new JourneysRepo(handle, SPACE).create({ title: "Become a Registered Nurse" });
    const jB = new JourneysRepo(handle, SPACE).create({ title: "Build a Trucking Company" });
    const aOnly = await memo("Spent six hours memorizing bone names for tomorrow's exam.");
    const bOnly = await memo("Revenue per mile calculations are still confusing me.");
    new JourneysRepo(handle, SPACE).link(jA.id, "node", aOnly);
    new JourneysRepo(handle, SPACE).link(jB.id, "node", bOnly);
    await fillerPool();

    const question = "How has my journey changed since I started?"; // deliberately generic/ambiguous

    const scopedA = await chat(handle, { embeddings, llm }, question, DEFAULT_CHAT, SPACE, [], jA.id);
    expect(scopedA.contextIds).toContain(aOnly);
    expect(scopedA.contextIds).not.toContain(bOnly);

    const scopedB = await chat(handle, { embeddings, llm }, question, DEFAULT_CHAT, SPACE, [], jB.id);
    expect(scopedB.contextIds).toContain(bOnly);
    expect(scopedB.contextIds).not.toContain(aOnly);
  });
});

describe("Scenario F — no Journey context (control): ordinary chat is untouched", () => {
  it("makes zero JourneysRepo calls and returns identical contextIds whether journeyId is omitted or explicitly null", async () => {
    const getSpy = vi.spyOn(JourneysRepo.prototype, "get");
    const linksSpy = vi.spyOn(JourneysRepo.prototype, "links");
    for (let i = 0; i < 5; i++) await memo(`Some ordinary memory ${i}.`);

    const omitted = await chat(handle, { embeddings, llm }, "What have I been up to?", DEFAULT_CHAT, SPACE, []);
    const explicitNull = await chat(handle, { embeddings, llm }, "What have I been up to?", DEFAULT_CHAT, SPACE, [], null);

    expect(getSpy).not.toHaveBeenCalled();
    expect(linksSpy).not.toHaveBeenCalled();
    expect(omitted.contextIds.sort()).toEqual(explicitNull.contextIds.sort());
  });
});

describe("Scenario G — cross-space Journey id fails safely", () => {
  it("a journeyId belonging to a different space contributes zero candidates and the chat turn still succeeds", async () => {
    const otherSpaceJourney = new JourneysRepo(handle, OTHER_SPACE).create({ title: "Someone else's journey" });
    const otherSpaceMemory = await memo("A secret memory that must never leak across spaces.", OTHER_SPACE);
    new JourneysRepo(handle, OTHER_SPACE).link(otherSpaceJourney.id, "node", otherSpaceMemory);

    for (let i = 0; i < 5; i++) await memo(`My own memory ${i}.`, SPACE);

    const result = await chat(handle, { embeddings, llm }, "What's going on?", DEFAULT_CHAT, SPACE, [], otherSpaceJourney.id);

    expect(result.contextIds).not.toContain(otherSpaceMemory);
    expect(result.answer).toBeTruthy(); // the turn completed normally, not an error
  });

  it("a nonexistent journeyId behaves identically to no journeyId at all", async () => {
    for (let i = 0; i < 5; i++) await memo(`My own memory ${i}.`);
    const withBogusId = await chat(handle, { embeddings, llm }, "What's going on?", DEFAULT_CHAT, SPACE, [], 999999);
    const withNone = await chat(handle, { embeddings, llm }, "What's going on?", DEFAULT_CHAT, SPACE, []);
    expect(withBogusId.contextIds.sort()).toEqual(withNone.contextIds.sort());
  });
});

describe("Dedup — a linked memory already found by ordinary retrieval is never duplicated", () => {
  it("a linked memory that also matches on literal keywords appears exactly once in contextIds", async () => {
    const j = new JourneysRepo(handle, SPACE).create({ title: "Become a Registered Nurse" });
    const doubleHit = await memo("Started nursing school today, nervous about the anatomy course.");
    new JourneysRepo(handle, SPACE).link(j.id, "node", doubleHit);
    await fillerPool();

    const result = await chat(handle, { embeddings, llm }, "Tell me about my nursing journey.", DEFAULT_CHAT, SPACE, [], j.id);
    const occurrences = result.contextIds.filter((id) => id === doubleHit).length;
    expect(occurrences).toBe(1);
  });
});

describe("Bounded candidate cap", () => {
  it("a Journey with more linked memories than the cap only contributes up to the cap", async () => {
    const j = new JourneysRepo(handle, SPACE).create({ title: "A very long Journey" });
    // 15 GENUINELY distinct sentences (not a templated "...number N..." pattern) — a first
    // attempt using a shared template produced near-identical hash embeddings across all 15,
    // which auto-linked them to EACH OTHER via associativeLink's own 0.72 threshold at
    // ingestion time (edges, not journey_link) — ordinary graph-hop retrieval then recovered
    // all 15 on its own merits regardless of the journey-scoping cap, confounding the
    // measurement. Real, varied text avoids that: nothing here shares vocabulary with
    // anything else in this test, so any recall beyond the cap can only come from the
    // journey-scoping path this test actually means to isolate.
    const sentences = [
      "The lighthouse keeper kept a logbook of every ship that passed.",
      "My grandmother's recipe box smells like cinnamon and old paper.",
      "The subway was delayed for forty minutes this morning.",
      "A stray cat has been sleeping on our porch all week.",
      "I finally fixed the squeaky hinge on the closet door.",
      "The library extended its hours for finals week.",
      "Someone left a bouquet of tulips on the mailbox.",
      "The power flickered twice during the storm last night.",
      "I found an old ticket stub in my winter coat pocket.",
      "The bakery down the street started selling sourdough on Fridays.",
      "A hawk circled over the parking lot for several minutes.",
      "My neighbor is learning to play the trumpet, badly.",
      "The printer jammed right before the deadline.",
      "There's a new mural going up on the side of the theater.",
      "I keep forgetting where I put my umbrella.",
    ];
    const linked: number[] = [];
    for (const text of sentences) {
      const id = await memo(text);
      linked.push(id);
      new JourneysRepo(handle, SPACE).link(j.id, "node", id);
    }
    await fillerPool();

    const question = "Tell me about this journey.";
    const unscoped = await chat(handle, { embeddings, llm }, question, DEFAULT_CHAT, SPACE, []);
    const unscopedHits = new Set(linked.filter((id) => unscoped.contextIds.includes(id)));
    // Sanity: with genuinely varied, non-self-similar text, ordinary retrieval should NOT
    // already be finding most/all of these on its own — otherwise the cap test below isn't
    // actually isolating the journey-scoping path.
    expect(unscopedHits.size).toBeLessThan(8);

    const result = await chat(handle, { embeddings, llm }, question, DEFAULT_CHAT, SPACE, [], j.id);
    const recalledLinked = linked.filter((id) => result.contextIds.includes(id));
    // The cap bounds what the JOURNEY-SCOPING mechanism itself contributes — total recall can
    // legitimately exceed it if ordinary retrieval independently found a few of the same ids
    // on their own merits (Set-union semantics, same as the dedup test above), so the
    // meaningful assertion is on the NEWLY-added set, not the raw total.
    const newlyAddedByScoping = recalledLinked.filter((id) => !unscopedHits.has(id));
    // eslint-disable-next-line no-console
    console.log(
      `[journey-scoped-chat-experiment] Cap test — unscoped baseline=${unscopedHits.size}/15, ` +
        `scoped total=${recalledLinked.length}/15, newly added by scoping=${newlyAddedByScoping.length} (cap=8)`,
    );
    expect(newlyAddedByScoping.length).toBeLessThanOrEqual(8); // JOURNEY_CANDIDATE_CAP
  });
});

describe("Performance — bounded, additive cost only", () => {
  it("scoping calls JourneysRepo exactly once each (get + links), never a per-node or per-frame scan", async () => {
    const j = new JourneysRepo(handle, SPACE).create({ title: "Become a Registered Nurse" });
    new JourneysRepo(handle, SPACE).link(j.id, "node", await memo("Started nursing school today."));

    const getSpy = vi.spyOn(JourneysRepo.prototype, "get");
    const linksSpy = vi.spyOn(JourneysRepo.prototype, "links");
    await chat(handle, { embeddings, llm }, "Tell me about my journey.", DEFAULT_CHAT, SPACE, [], j.id);

    expect(getSpy).toHaveBeenCalledTimes(1);
    expect(linksSpy).toHaveBeenCalledTimes(1);
  });
});
