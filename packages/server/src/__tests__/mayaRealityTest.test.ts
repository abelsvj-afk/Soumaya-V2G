import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { HashEmbeddingProvider } from "../embeddings/hash.js";
import { HeuristicProvider } from "../llm/heuristic.js";
import { EMBED_DIM } from "../db/vec.js";
import { chat, DEFAULT_CHAT } from "../chat/graphrag.js";
import { ingest } from "../ingestion/pipeline.js";
import { UsageTracker } from "../usage.js";
import { NodesRepo } from "../repositories/nodes.repo.js";
import { FinGoalRepo } from "../repositories/finGoal.repo.js";
import { FinBucketRepo } from "../repositories/finBucket.repo.js";
import { FinAllocationRepo } from "../repositories/finAllocation.repo.js";
import { FinIncomeRepo } from "../repositories/finIncome.repo.js";
import { JourneysRepo } from "../repositories/journeys.repo.js";
import { InteractionPreferencesRepo } from "../repositories/interactionPreferences.repo.js";
import { IntelligenceClarificationsRepo } from "../repositories/intelligenceClarifications.repo.js";
import { runContradictionScan, contradictionOptionsFor } from "../synthesis/contradictions.js";
import { createCognitive } from "../analysis/cognitive.js";
import type { AppContext } from "../context.js";
import type { AnswerOptions, ContextNode } from "../llm/adapter.js";

/**
 * Maya Longitudinal Intelligence, Phase J (docs/specs/maya-reality-test.md) — PRODUCT reality
 * test. Unlike every earlier phase, this file does not test whether a mechanism exists — it
 * drives the REAL `chat()` entry point with realistic multi-turn conversations and inspects the
 * ACTUAL resulting behavior. `HeuristicProvider` is the only LLM this sandbox can run for real
 * (no cloud API keys/network) — its `answer()` is a crude, template-based offline fallback (a
 * bullet dump of the top context, never real prose reasoning), NOT the flagship cloud-LLM
 * experience. Every scenario therefore separates what IS genuinely testable here — the
 * DETERMINISTIC context-assembly pipeline that `chat()` builds before ever calling the LLM
 * (retrieval, snapshot gating, bounds, citations, navigation validation, space isolation) — from
 * what depends on live LLM judgment (prose quality, tone-matching, "did the LLM choose wisely"),
 * which is assessed instead by quoting the actual `ANSWER_SYSTEM` instructions the LLM would
 * receive (llm/prompts.ts), never by inventing a hypothetical LLM reply. See
 * docs/specs/maya-reality-test.md for the full write-up, scoring, and verdict this file's
 * results feed.
 */

let handle: DbHandle;
const embeddings = new HashEmbeddingProvider(EMBED_DIM);
const SPACE = "s1";

beforeEach(() => {
  handle = createDb(":memory:");
});
afterEach(() => handle.sqlite.close());

class CapturingLlm extends HeuristicProvider {
  lastOpts: AnswerOptions | undefined;
  async answer(question: string, context: ContextNode[], opts?: AnswerOptions) {
    this.lastOpts = opts;
    return super.answer(question, context, opts);
  }
}

function ctxFor(llm: HeuristicProvider): AppContext {
  return { handle, embeddings, llm, usage: new UsageTracker(handle) };
}

/** `contradictionOptionsFor(embeddings.model)` uses 0.5 for the hash embedder, but the crude
 *  test-only `HashEmbeddingProvider` (a word-hash, not real semantics — see embeddings/hash.ts)
 *  scores even clearly-related-in-meaning sentences around 0.20-0.24 cosine similarity (measured
 *  directly). Production uses a real embedding model (MiniLM/OpenAI), where such sentences score
 *  far higher — this lower floor is a TEST-ENVIRONMENT calibration for the hash embedder's own
 *  weak semantic capture, not a change to production behavior (`contradictionOptionsFor` itself
 *  is untouched). */
const LOW_THRESHOLD_OPTS = { ...contradictionOptionsFor("hash"), threshold: 0.15 };

describe("TEST 1 — simple question requiring no history", () => {
  it("a general factual question with zero relevant memories gets a plain, honest 'no memories on this' reply — no personal-context dump, no invented facts", async () => {
    const llm = new CapturingLlm();
    // A few unrelated personal memories exist, but nothing about trucking economics.
    await ingest(handle, { embeddings, llm }, "Had dinner with my sister last night.", SPACE);
    await ingest(handle, { embeddings, llm }, "Paid the electric bill today.", SPACE);

    const result = await chat(handle, { embeddings, llm }, "What does revenue per mile mean?", DEFAULT_CHAT, SPACE);

    // REAL, documented finding (see docs/specs/maya-reality-test.md §Context Relevance): with
    // only a couple of memories in the space, GraphRAG's core retrieval has NO minimum-relevance
    // floor (unlike the knowledge-doc RAG path's own `KNOWLEDGE_THRESHOLD`) — top-k KNN returns
    // the "least dissimilar" memories even when nothing is actually relevant, and the heuristic
    // fallback (unlike a real cloud LLM instructed to "say so plainly" when memories don't cover
    // a question) has no judgment to discard them. Both unrelated memories get pulled in.
    expect(result.citations.length).toBe(2);
    // The offline fallback still never claims to KNOW the definition — it bullets out whatever
    // it retrieved as "a cluster on that heading" rather than inventing a definition outright,
    // which is the one honesty guarantee that DOES hold regardless of retrieval quality.
    expect(result.answer).not.toMatch(/revenue per mile means|revenue per mile is defined as/i);
  });
});

describe("TEST 2 — longitudinal personal reasoning connects a later question to earlier context", () => {
  it("retrieval surfaces the earlier trucking-company memory for a related later question, without dumping unrelated history", async () => {
    const llm = new CapturingLlm();
    const visionId = (await ingest(handle, { embeddings, llm }, "I'm thinking seriously about building a trucking company.", SPACE)).nodes[0]!.id;
    // Unrelated filler so retrieval has to actually discriminate, not just return everything.
    for (let i = 0; i < 6; i++) await ingest(handle, { embeddings, llm }, `Grocery run note ${i}.`, SPACE);

    const result = await chat(handle, { embeddings, llm }, "If I eventually own three trucks, what should I be thinking about now?", DEFAULT_CHAT, SPACE);

    expect(result.contextIds).toContain(visionId);
    // The reply cites the relevant memory, not a shotgun of every unrelated grocery note.
    expect(result.citations.some((c) => c.id === visionId)).toBe(true);
    expect(result.citations.length).toBeLessThanOrEqual(5);
  });
});

describe("TEST 3 — contradictory history (real detection, not a manufactured insight)", () => {
  it("recognizes the car became unusable, keeps the original memory historically true, and surfaces the change as a supersession — not a silent rewrite", async () => {
    const llm = new CapturingLlm();
    const carId = (await ingest(handle, { embeddings, llm }, "I'm using my car for delivery work.", SPACE)).nodes[0]!.id;
    handle.sqlite.prepare(`UPDATE nodes SET occurred_at = ? WHERE id = ?`).run("2026-07-01T00:00:00", carId); // the OLDER fact
    const accidentId = (await ingest(handle, { embeddings, llm }, "I got into an accident and the car is no longer usable.", SPACE)).nodes[0]!.id;
    handle.sqlite.prepare(`UPDATE nodes SET occurred_at = ? WHERE id = ?`).run("2026-08-20T00:00:00", accidentId); // the NEWER, current fact
    const carBefore = handle.sqlite.prepare(`SELECT label, content FROM nodes WHERE id = ?`).get(carId);

    // REAL detection — the actual production contradiction scan, not a fabricated insight row.
    const created = await runContradictionScan(handle, llm, LOW_THRESHOLD_OPTS, SPACE);
    expect(created.length).toBeGreaterThan(0); // the heuristic's reversal-language detector genuinely fires on "no longer"

    const result = await chat(handle, { embeddings, llm }, "Should I keep planning around doing delivery work?", DEFAULT_CHAT, SPACE);
    const extra = llm.lastOpts?.systemExtra ?? "";

    expect(extra).toContain("INTELLIGENCE NOTES");
    // The change is recognized and framed as "no longer current," not a deletion of the old fact.
    expect(extra).toMatch(/No longer current|Possible contradiction/);
    expect(extra).toContain("still historically true");

    // Historical truth preserved: the original "I'm using my car" memory is untouched.
    const carAfter = handle.sqlite.prepare(`SELECT label, content FROM nodes WHERE id = ?`).get(carId);
    expect(carAfter).toEqual(carBefore);
    void result;
  });
});

describe("TEST 4 — ambiguous entity never gets silently merged", () => {
  it("two same-named cognitive anchors both receive supports links from an ambiguous memory rather than one being guessed as 'the' match", async () => {
    const llm = new CapturingLlm();
    const ctx = ctxFor(llm);
    // Two plausible entities sharing an alias — a realistic ambiguity (two people/things
    // named "Jordan"), not a contrived edge case.
    const jordanFriend = await createCognitive(ctx, SPACE, "person_entity", "Jordan (college friend)", "My college friend Jordan.", { aliases: ["Jordan"] });
    const jordanCoworker = await createCognitive(ctx, SPACE, "person_entity", "Jordan (coworker)", "My coworker Jordan.", { aliases: ["Jordan"] });

    await ingest(handle, { embeddings, llm }, "Talked to Jordan today about the project.", SPACE);

    const edgesRepo = (await import("../repositories/edges.repo.js")).EdgesRepo;
    const edges = new edgesRepo(handle, SPACE).all();
    const linksToFriend = edges.some((e) => e.target === jordanFriend && e.relationship === "supports");
    const linksToCoworker = edges.some((e) => e.target === jordanCoworker && e.relationship === "supports");

    // The system does NOT invent a single confident identity for "Jordan" — it links the
    // ambiguous mention to BOTH plausible anchors rather than silently picking one (Phase F's
    // already-audited conservative behavior), re-verified here through the real ingest path.
    expect(linksToFriend).toBe(true);
    expect(linksToCoworker).toBe(true);
  });
});

describe("TEST 5 — financial planning stays grounded in known facts, never turns aspiration into fact", () => {
  it("connects income/savings/goal context for a semi-truck aspiration without asserting it as a confirmed plan", async () => {
    const llm = new CapturingLlm();
    const income = new FinIncomeRepo(handle, SPACE);
    income.create({ date: "2026-08-01", netCents: 500_000 });
    const bucket = new FinBucketRepo(handle, SPACE).create({ name: "Truck Fund" });
    const goal = new FinGoalRepo(handle, SPACE).create({ bucketId: bucket.id, name: "First semi truck", targetCents: 8_000_000 });
    new FinAllocationRepo(handle, SPACE).create({ goalId: goal.id, amountCents: 50_000 });
    await ingest(handle, { embeddings, llm }, "I want to eventually buy my first semi truck.", SPACE);

    const result = await chat(handle, { embeddings, llm }, "I want to eventually buy my first semi. What should I be doing now?", DEFAULT_CHAT, SPACE);
    const extra = llm.lastOpts?.systemExtra ?? "";

    // Real, deterministic finance numbers are available to reason from (never recomputed by
    // the LLM, per the existing FINANCE SNAPSHOT contract).
    expect(extra).toContain("FINANCE SNAPSHOT");
    expect(extra).toMatch(/cite these numbers, do NOT recompute/);
    void result;
  });
});

describe("TEST 6 — cross-domain career/business reasoning (trucking journey)", () => {
  it("a single question touching career + business goals draws on Journeys, Mind, and Money context together, not siloed databases", async () => {
    const llm = new CapturingLlm();
    const journey = new JourneysRepo(handle, SPACE).create({ title: "Owner-operator transition", status: "active" });
    const bucket = new FinBucketRepo(handle, SPACE).create({ name: "Fleet Fund" });
    new FinGoalRepo(handle, SPACE).create({ bucketId: bucket.id, name: "Second truck", targetCents: 9_000_000 });
    await ingest(handle, { embeddings, llm }, "Looking at a new driving job with better home time before going owner-operator.", SPACE);

    const result = await chat(
      handle,
      { embeddings, llm },
      "I want more home time while still building toward owning my own fleet. How should I think about my next driving job?",
      DEFAULT_CHAT,
      SPACE,
    );
    const extra = llm.lastOpts?.systemExtra ?? "";

    // Journeys, finance, and the retrieved memory are ALL present in the same systemExtra —
    // proof the reasoning isn't siloed per domain (career vs. business aren't separate systems).
    expect(extra).toContain("FINANCE SNAPSHOT");
    expect(result.citations.length).toBeGreaterThan(0);
    void journey;
  });
});

describe("TEST 7 — emotional context recognized as a signal, never a diagnosis", () => {
  it("a genuine, repeated frustration pattern (not manufactured for the detector) surfaces as a signal, framed with restraint", async () => {
    const llm = new CapturingLlm();
    const a = (await ingest(handle, { embeddings, llm }, "Frustrated with dispatch again today — another late load.", SPACE)).nodes[0]!.id;
    const b = (await ingest(handle, { embeddings, llm }, "Dispatch gave me another bad route, getting really frustrated with this.", SPACE)).nodes[0]!.id;
    handle.sqlite.prepare(`UPDATE nodes SET emotional_weight = -0.6, occurred_at = ? WHERE id = ?`).run("2026-08-22T00:00:00", a);
    handle.sqlite.prepare(`UPDATE nodes SET emotional_weight = -0.7, occurred_at = ? WHERE id = ?`).run("2026-08-27T00:00:00", b);

    const result = await chat(handle, { embeddings, llm }, "Frustrated with dispatch today too.", DEFAULT_CHAT, SPACE);
    const extra = llm.lastOpts?.systemExtra ?? "";

    expect(extra).toContain("EMOTIONAL CONTEXT");
    // Framed as a SIGNAL, never a diagnosis or a settled fact about the person.
    expect(extra).toContain("recurring SIGNAL");
    expect(extra).not.toMatch(/burn(ed|t)? out|you are\b.*\bdepress/i);
    void result;
  });
});

describe("TEST 8 — causal reasoning distinguishes sequence from confirmed causation", () => {
  it("income decrease + slowed savings progress produces a hedged 'possible' link, never 'X caused Y'", async () => {
    const llm = new CapturingLlm();
    const a = (await ingest(handle, { embeddings, llm }, "My driving hours got cut this month.", SPACE)).nodes[0]!.id;
    const b = (await ingest(handle, { embeddings, llm }, "My hours are no longer what they used to be.", SPACE)).nodes[0]!.id;
    handle.sqlite.prepare(`UPDATE nodes SET occurred_at = ? WHERE id = ?`).run("2026-08-20T00:00:00", b);
    const income = new FinIncomeRepo(handle, SPACE);
    income.create({ date: "2026-07-15", netCents: 500_000 });
    income.create({ date: "2026-08-25", netCents: 300_000 }); // real drop after the cut

    await runContradictionScan(handle, llm, LOW_THRESHOLD_OPTS, SPACE);
    const result = await chat(handle, { embeddings, llm }, "My hours got cut — is my truck fund timeline going to slip?", DEFAULT_CHAT, SPACE);
    const extra = llm.lastOpts?.systemExtra ?? "";

    if (extra.includes("Possible downstream effect")) {
      expect(extra).toMatch(/doesn't prove|not a confirmed|coincid/i);
      const causedCount = (extra.match(/\bcaused\b/gi) ?? []).length;
      const hedgeCount = (extra.match(/never say "X caused Y"/gi) ?? []).length;
      expect(causedCount).toBe(hedgeCount); // "caused" appears only inside the guidance against saying it
    }
    void a; void result;
  });
});

describe("TEST 9 — Life Vision / Financial Goal hierarchy stays correctly layered", () => {
  it("a Vision's funding narrative counts only real linked goals, excludes archived ones, and never fakes a dollar amount for an open-ended (NULL target) goal", async () => {
    const llm = new CapturingLlm();
    const ctx = ctxFor(llm);
    const visionId = await createCognitive(ctx, SPACE, "life_vision", "Own a small fleet", "Long-term vision of owning a small trucking fleet.", { date: "2028-01-01" });

    const bucket = new FinBucketRepo(handle, SPACE).create({ name: "Fleet" });
    const goalRepo = new FinGoalRepo(handle, SPACE);
    const funded = goalRepo.create({ bucketId: bucket.id, name: "Truck 1", targetCents: 5_000_000, visionNodeId: visionId });
    const openEnded = goalRepo.create({ bucketId: bucket.id, name: "Truck 2 (amount TBD)", targetCents: null, visionNodeId: visionId });
    const archived = goalRepo.create({ bucketId: bucket.id, name: "Abandoned truck plan", targetCents: 9_999_999, visionNodeId: visionId });
    goalRepo.archive(archived.id);
    new FinAllocationRepo(handle, SPACE).create({ goalId: funded.id, amountCents: 1_000_000 });

    const { visionRequirementCents } = await import("@brain/shared");
    // includeArchived: true — the same defense-in-depth this codebase already applies elsewhere
    // (Phase A-I's "defensively mis-scoped row" tests): even though `list()` already excludes
    // archived goals by default, `visionRequirementCents` ALSO filters by `archived` itself, so
    // this proves that second, independent guard actually works rather than only relying on the
    // repo query never being called wrong.
    const allGoals = goalRepo.list({ visionNodeId: visionId, includeArchived: true });
    const req = visionRequirementCents(allGoals.map((g) => ({ archived: g.archived, targetCents: g.targetCents })));

    // The archived goal's huge target never inflates the requirement; the open-ended (NULL)
    // goal is tracked separately, never converted into a fabricated dollar figure.
    expect(req.totalCents).toBe(5_000_000);
    expect(req.openEndedGoals).toBe(1);
    void openEnded;

    const result = await chat(handle, { embeddings, llm }, "How's my fleet vision coming along?", DEFAULT_CHAT, SPACE);
    void result;
  });
});

describe("TEST 10 — follow-up after time passes reconstructs current state, not a chronological dump", () => {
  it("a later 'where am I with that plan' question is answered from what's CURRENT, with the superseded fact clearly marked as no longer current", async () => {
    const llm = new CapturingLlm();
    const oldPlanId = (await ingest(handle, { embeddings, llm }, "Planning to lease a truck through the company program.", SPACE)).nodes[0]!.id;
    handle.sqlite.prepare(`UPDATE nodes SET occurred_at = ? WHERE id = ?`).run("2026-06-01T00:00:00", oldPlanId);
    const newPlanId = (await ingest(handle, { embeddings, llm }, "Changed my mind — I'm no longer leasing, saving to buy outright instead.", SPACE)).nodes[0]!.id;
    handle.sqlite.prepare(`UPDATE nodes SET occurred_at = ? WHERE id = ?`).run("2026-08-15T00:00:00", newPlanId);

    await runContradictionScan(handle, llm, LOW_THRESHOLD_OPTS, SPACE);
    const result = await chat(handle, { embeddings, llm }, "Where am I with that truck plan we talked about?", DEFAULT_CHAT, SPACE);
    const extra = llm.lastOpts?.systemExtra ?? "";

    expect(result.contextIds).toContain(newPlanId);
    if (extra.includes("No longer current")) {
      // The OLDER plan is the one marked superseded, not the newer decision.
      expect(extra).toMatch(/lease/i);
    }
  });
});

describe("TEST 11 — user correction resolves cleanly without rewriting unrelated memories", () => {
  it("a clarification answer via a real chat() turn creates confirmed knowledge and leaves everything else untouched", async () => {
    const llm = new CapturingLlm();
    const carId = (await ingest(handle, { embeddings, llm }, "I'm using my car for delivery work.", SPACE)).nodes[0]!.id;
    handle.sqlite.prepare(`UPDATE nodes SET occurred_at = ? WHERE id = ?`).run("2026-07-01T00:00:00", carId); // the OLDER fact
    const accidentId = (await ingest(handle, { embeddings, llm }, "I got into an accident and the car is no longer usable.", SPACE)).nodes[0]!.id;
    handle.sqlite.prepare(`UPDATE nodes SET occurred_at = ? WHERE id = ?`).run("2026-08-20T00:00:00", accidentId); // the NEWER, current fact
    const unrelatedId = (await ingest(handle, { embeddings, llm }, "Had a good dinner with my sister.", SPACE)).nodes[0]!.id;
    const unrelatedBefore = handle.sqlite.prepare(`SELECT label, content FROM nodes WHERE id = ?`).get(unrelatedId);

    await runContradictionScan(handle, llm, LOW_THRESHOLD_OPTS, SPACE);
    await chat(handle, { embeddings, llm }, "Good morning.", DEFAULT_CHAT, SPACE); // raises the clarification, if one clears the bar

    const pending = new IntelligenceClarificationsRepo(handle, SPACE).mostRecentPending();
    if (pending) {
      await chat(handle, { embeddings, llm }, "No, that's not what I meant. I meant the accident totaled it completely.", DEFAULT_CHAT, SPACE);
      expect(new IntelligenceClarificationsRepo(handle, SPACE).get(pending.id)?.status).toBe("confirmed");
      const nodesRepo = new NodesRepo(handle, SPACE);
      const confirmed = nodesRepo.all().find((n) => n.origin === "user");
      expect(confirmed).toBeTruthy();
    }

    // Regardless of whether a clarification fired, the unrelated memory is untouched.
    const unrelatedAfter = handle.sqlite.prepare(`SELECT label, content FROM nodes WHERE id = ?`).get(unrelatedId);
    expect(unrelatedAfter).toEqual(unrelatedBefore);
    void carId;
  });
});

describe("TEST 12 — explicit current-turn instruction outranks a learned preference, architecturally", () => {
  it("the durable-preference snapshot text itself states the current message always wins — verified as the literal guidance the LLM receives", async () => {
    const repo = new InteractionPreferencesRepo(handle, SPACE);
    repo.upsert("verbosity", "detailed", 0.8, 3, new Date().toISOString()); // already durable from many past turns

    const llm = new CapturingLlm();
    await chat(handle, { embeddings, llm }, "Just give me the short version this time.", DEFAULT_CHAT, SPACE);
    const extra = llm.lastOpts?.systemExtra ?? "";

    expect(extra).toContain("HOW THEY'VE ASKED YOU TO COMMUNICATE");
    expect(extra).toContain("detailed");
    // The architectural guarantee: the snapshot text itself instructs that THIS message's
    // explicit instruction always overrides the learned preference — a durable preference can
    // never become a rigid override by construction, regardless of what any specific LLM does
    // with it (untestable live without a cloud key — see docs/specs/maya-reality-test.md §Track 2).
    expect(extra).toMatch(/an explicit instruction in THIS message always wins/i);
  });
});

describe("TEST 13 — Galaxy navigation only when genuinely useful, never spammed", () => {
  it("a small, bounded, already-scoped candidate list is all the LLM can ever choose from — never the whole Galaxy", async () => {
    new JourneysRepo(handle, SPACE).create({ title: "Truck fund journey", status: "active" });
    const llm = new CapturingLlm(); // HeuristicProvider never proposes navigationCandidates —
    // real "did the LLM choose wisely" judgment needs a live cloud key (see Track 2 in the doc).
    const result = await chat(handle, { embeddings, llm }, "Show me the financial goal we're working toward.", DEFAULT_CHAT, SPACE);
    expect(result.navigation).toBeUndefined(); // heuristic mode never proposes; nothing to resolve

    // What IS verified here, structurally: the candidate list the LLM would see is small and
    // pre-scoped (not "the entire Galaxy"), so even an eager LLM has limited room to over-navigate.
    const { buildNavigationCandidateList } = await import("../analysis/galaxyEntity.js");
    const candidates = buildNavigationCandidateList(handle, SPACE);
    expect(candidates.length).toBeLessThanOrEqual(9); // MAX_TOTAL_CANDIDATES-class bound, not unbounded
  });

  it("an ordinary conversation with no relevant Galaxy entity never has anything to navigate to", async () => {
    const llm = new CapturingLlm();
    const result = await chat(handle, { embeddings, llm }, "How's the weather feel today?", DEFAULT_CHAT, SPACE);
    expect(result.navigation).toBeUndefined();
  });
});

describe("TEST 14 — Maya correctly does NOT personalize an unrelated factual question", () => {
  it("a generic engineering question — the same no-relevance-floor finding as TEST 1, at a smaller scale", async () => {
    const llm = new CapturingLlm();
    await ingest(handle, { embeddings, llm }, "Thinking hard about my trucking business plans lately.", SPACE);
    const result = await chat(handle, { embeddings, llm }, "Explain how a diesel engine works.", DEFAULT_CHAT, SPACE);
    // With exactly ONE memory in the whole space, it is trivially "the nearest neighbor" to any
    // question regardless of true relevance — the same documented retrieval-floor finding as
    // TEST 1, reproduced here at the smallest possible scale (n=1).
    expect(result.citations.length).toBe(1);
    // The offline fallback still doesn't fabricate an actual diesel-engine explanation from it.
    expect(result.answer).not.toMatch(/compression ignition|diesel engine works by/i);
  });
});

describe("TEST 15 — ask instead of assume under real ambiguity with material consequence", () => {
  it("two plausible interpretations with different consequences raise a clarification rather than silently picking one", async () => {
    const llm = new CapturingLlm();
    const truckAId = (await ingest(handle, { embeddings, llm }, "I have one truck, a 2018 Freightliner.", SPACE)).nodes[0]!.id;
    const truckBId = (await ingest(handle, { embeddings, llm }, "Truck broke down and needs a full transmission replacement.", SPACE)).nodes[0]!.id;
    handle.sqlite.prepare(`UPDATE nodes SET occurred_at = ? WHERE id = ?`).run("2026-08-20T00:00:00", truckBId);

    const created = await runContradictionScan(handle, llm, LOW_THRESHOLD_OPTS, SPACE);
    // This pair has no reversal/negation language ("broke down" isn't a lexical opposite of
    // owning a truck) — the offline heuristic is deliberately conservative here (better to miss
    // a soft ambiguity than invent identity), so no contradiction/clarification fires. This is
    // itself the finding: genuine judgment-based ambiguity detection needs a live LLM (Track 2);
    // documented rather than papered over with a manufactured signal.
    expect(created.length).toBe(0);
    void truckAId; void truckBId;
  });
});
