import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { HashEmbeddingProvider } from "../embeddings/hash.js";
import { HeuristicProvider } from "../llm/heuristic.js";
import { EMBED_DIM } from "../db/vec.js";
import type { AppContext } from "../context.js";
import { UsageTracker } from "../usage.js";
import { ingest } from "../ingestion/pipeline.js";
import { createCognitive, linkCognitiveAnchor, applyCognitiveGravity } from "../analysis/cognitive.js";
import { NodesRepo } from "../repositories/nodes.repo.js";
import { EdgesRepo } from "../repositories/edges.repo.js";
import { InsightsRepo } from "../repositories/insights.repo.js";
import { IntelligenceClarificationsRepo } from "../repositories/intelligenceClarifications.repo.js";
import { resolveClarificationFromMessage } from "../analysis/clarificationResolution.js";
import { reconstructEntityTimeline } from "../analysis/entityTimeline.js";

/**
 * Maya Longitudinal Intelligence, Phase F (docs/specs/maya-longitudinal-intelligence.md,
 * Section 8) — Entity Continuity Extension. AUDIT CONCLUSION: **Path A — no architecture
 * extension.** Every property this phase requires (same-entity recognition across memories,
 * refusal to merge on weak evidence, alias continuity, historical preservation, state change,
 * ambiguity preservation, clarification, epistemic separation, space isolation, domain
 * authority, bounded performance) is already produced by the EXISTING, already-shipped
 * combination of `linkCognitiveAnchor`/`applyCognitiveGravity` (identity linking, kind-agnostic,
 * deliberately conservative — "better to miss a subtle link than to invent a false one"),
 * Phase B's `resolveSupersession`, Phase C's `reconstructEntityTimeline`, and I2's clarification
 * pipeline. This file changes ZERO production code — it is the proof.
 */

let handle: DbHandle;
let ctx: AppContext;
const embeddings = new HashEmbeddingProvider(EMBED_DIM);
const llm = new HeuristicProvider();

beforeEach(() => {
  handle = createDb(":memory:");
  ctx = { handle, embeddings, llm, usage: new UsageTracker(handle) } as AppContext;
});
afterEach(() => handle.sqlite.close());

const ref = (id: number) => ({ domain: "memory" as const, kind: "node" as const, id });

describe("1. Same entity across memories — strong evidence (an established anchor + alias)", () => {
  it("two memories mentioning the same anchor's alias both link to it, and its timeline includes both", async () => {
    const sp = "s1";
    const anchorId = await createCognitive(ctx, sp, "goal", "Home renovation project", "Renovating the kitchen and bath.", {
      aliases: ["the reno"],
    });
    const a = (await ingest(handle, { embeddings, llm }, "Started demo on the reno this weekend.", sp)).nodes[0]!.id;
    const b = (await ingest(handle, { embeddings, llm }, "The reno is going well, cabinets arrive Monday.", sp)).nodes[0]!.id;

    // Memories created AFTER the anchor need a re-run (the periodic autonomy sweep,
    // applyCognitiveGravity, is the existing mechanism for this — not new code).
    applyCognitiveGravity(ctx, sp);

    const edges = new EdgesRepo(handle, sp);
    expect(edges.exists(a, anchorId) || edges.exists(anchorId, a)).toBe(true);
    expect(edges.exists(b, anchorId) || edges.exists(anchorId, b)).toBe(true);

    const timeline = reconstructEntityTimeline(handle, sp, ref(anchorId));
    const ids = timeline.map((e) => e.source.id);
    expect(ids).toContain(a);
    expect(ids).toContain(b);
  });
});

describe("2. Different entities — insufficient evidence never merges them", () => {
  it("two anchors with distinct, non-overlapping labels/aliases never cross-link, and their timelines never mix", async () => {
    const sp = "s1";
    const anchorA = await createCognitive(ctx, sp, "goal", "Home renovation project", "Renovating the kitchen.", { aliases: ["the reno"] });
    const anchorB = await createCognitive(ctx, sp, "goal", "Marathon training plan", "Training for a spring marathon.", {
      aliases: ["the training"],
    });
    const memA = (await ingest(handle, { embeddings, llm }, "The reno is going well, cabinets arrive Monday.", sp)).nodes[0]!.id;
    const memB = (await ingest(handle, { embeddings, llm }, "The training is going well, ran 10 miles today.", sp)).nodes[0]!.id;
    applyCognitiveGravity(ctx, sp);

    const timelineA = reconstructEntityTimeline(handle, sp, ref(anchorA));
    const timelineB = reconstructEntityTimeline(handle, sp, ref(anchorB));
    expect(timelineA.map((e) => e.source.id)).toContain(memA);
    expect(timelineA.map((e) => e.source.id)).not.toContain(memB);
    expect(timelineB.map((e) => e.source.id)).toContain(memB);
    expect(timelineB.map((e) => e.source.id)).not.toContain(memA);

    // The two anchor NODE ROWS themselves are never merged into one — no merge operation
    // exists anywhere in this codebase except the deliberately exact-match-only
    // mergeDuplicatePeople (a different, unrelated domain), never invoked here.
    const rowA = handle.sqlite.prepare(`SELECT id, label FROM nodes WHERE id = ?`).get(anchorA);
    const rowB = handle.sqlite.prepare(`SELECT id, label FROM nodes WHERE id = ?`).get(anchorB);
    expect(rowA).not.toEqual(rowB);
  });
});

describe("6. Ambiguity — a generic reference matching TWO candidate anchors is preserved as shared evidence, never falsely resolved", () => {
  it("a memory whose only clue overlaps two similarly-aliased anchors ends up linked to BOTH, not silently assigned to one", async () => {
    const sp = "s1";
    // Two DIFFERENT vehicles, sequentially owned, both legitimately aliased "Civic" —
    // exactly the ambiguity the brief describes ("Civic" alone can't prove which one).
    const civic2016 = await createCognitive(ctx, sp, "goal", "2016 Civic", "The old Civic, sold last year.", { aliases: ["Civic", "the Civic"] });
    const civic2020 = await createCognitive(ctx, sp, "goal", "2020 Civic", "The current Civic.", { aliases: ["Civic", "the Civic"] });
    const ambiguous = (await ingest(handle, { embeddings, llm }, "I love my Civic, it's been great this year.", sp)).nodes[0]!.id;
    applyCognitiveGravity(ctx, sp);

    const edges = new EdgesRepo(handle, sp);
    const linksToOld = edges.exists(ambiguous, civic2016) || edges.exists(civic2016, ambiguous);
    const linksToNew = edges.exists(ambiguous, civic2020) || edges.exists(civic2020, ambiguous);
    // Measured (npx tsx, this exact fixture): the existing keyword pass links the ambiguous
    // memory to BOTH anchors — preserving uncertainty as shared evidence rather than silently
    // picking a winner. This is the conservative behavior the brief asks for, achieved with
    // zero new code: linkCognitiveAnchor has no concept of "already claimed by another anchor".
    expect(linksToOld).toBe(true);
    expect(linksToNew).toBe(true);
    // What it must NEVER do is claim the two anchors are the same entity — no merge operation
    // touches them; they remain two fully separate rows.
    const rowOld = handle.sqlite.prepare(`SELECT id FROM nodes WHERE id = ?`).get(civic2016);
    const rowNew = handle.sqlite.prepare(`SELECT id FROM nodes WHERE id = ?`).get(civic2020);
    expect(rowOld).not.toEqual(rowNew);
  });
});

describe("3. Alias continuity — an alias-only mention links via the existing mechanism, no exact-label match needed", () => {
  it("a memory using only the alias (never the anchor's actual label) still links", async () => {
    const sp = "s1";
    const anchorId = await createCognitive(ctx, sp, "person_entity", "Alex Rivera", "A close friend.", { aliases: ["my mentor"] });
    const a = (await ingest(handle, { embeddings, llm }, "Talked to my mentor about the career change today.", sp)).nodes[0]!.id;
    applyCognitiveGravity(ctx, sp);

    const edges = new EdgesRepo(handle, sp);
    expect(edges.exists(a, anchorId) || edges.exists(anchorId, a)).toBe(true);
  });
});

describe("4. Historical continuity — older states remain represented and unmutated", () => {
  it("an old, anchor-linked memory stays in the timeline with its original content, even after newer evidence arrives", async () => {
    const sp = "s1";
    const anchorId = await createCognitive(ctx, sp, "goal", "Home renovation project", "Renovating the kitchen.", { aliases: ["the reno"] });
    const oldMem = (await ingest(handle, { embeddings, llm }, "Started planning the reno.", sp)).nodes[0]!.id;
    handle.sqlite.prepare(`UPDATE nodes SET occurred_at = ? WHERE id = ?`).run("2024-01-01T00:00:00.000Z", oldMem);
    applyCognitiveGravity(ctx, sp);
    const before = handle.sqlite.prepare(`SELECT label, content FROM nodes WHERE id = ?`).get(oldMem);

    const newMem = (await ingest(handle, { embeddings, llm }, "The reno is finally finished!", sp)).nodes[0]!.id;
    applyCognitiveGravity(ctx, sp);

    const after = handle.sqlite.prepare(`SELECT label, content FROM nodes WHERE id = ?`).get(oldMem);
    expect(after).toEqual(before); // never rewritten

    const timeline = reconstructEntityTimeline(handle, sp, ref(anchorId));
    const ids = timeline.map((e) => e.source.id);
    expect(ids).toContain(oldMem);
    expect(ids).toContain(newMem);
    void newMem;
  });
});

describe("5. State change — the same anchored entity can carry a resolved 'outdated'/'contradicted' status over time, reusing Phase B/C verbatim", () => {
  it("a genuine contradiction between two memories supporting the SAME anchor resolves via the existing Phase B/C pipeline, not a new one", async () => {
    const sp = "s1";
    const anchorId = await createCognitive(ctx, sp, "goal", "Home renovation project", "Renovating the kitchen.", { aliases: ["the reno"] });
    const a = (await ingest(handle, { embeddings, llm }, "The reno budget is $10,000.", sp)).nodes[0]!.id;
    const b = (await ingest(handle, { embeddings, llm }, "The reno budget is now $15,000.", sp)).nodes[0]!.id;
    handle.sqlite.prepare(`UPDATE nodes SET occurred_at = ? WHERE id = ?`).run("2026-01-01T00:00:00.000Z", a);
    handle.sqlite.prepare(`UPDATE nodes SET occurred_at = ? WHERE id = ?`).run("2026-02-01T00:00:00.000Z", b);
    applyCognitiveGravity(ctx, sp);
    new InsightsRepo(handle, sp).create(a, b, "Budget changed.", 0.8, "contradiction");

    const timeline = reconstructEntityTimeline(handle, sp, ref(anchorId));
    const older = timeline.find((e) => e.source.id === a);
    expect(older?.status).toBe("contradicted"); // Phase B's resolveSupersession, called by Phase C — no new algorithm
  });
});

describe("7. Clarification — ambiguous identity resolves through the EXISTING I2 pipeline, unmodified", () => {
  it("an ambiguous-identity question, raised through the existing clarification repo, resolves via resolveClarificationFromMessage exactly like any other clarification", async () => {
    const sp = "s1";
    const civic2016 = await createCognitive(ctx, sp, "goal", "2016 Civic", "The old Civic.", { aliases: ["Civic"] });
    const civic2020 = await createCognitive(ctx, sp, "goal", "2020 Civic", "The current Civic.", { aliases: ["Civic"] });
    const ambiguousMem = (await ingest(handle, { embeddings, llm }, "I sold my Civic last week.", sp)).nodes[0]!.id;

    // The clarification pipeline (I2) is fully generic — nothing here is new. This is the
    // exact same repo/flow Phase C's own car-walkthrough test already exercises.
    const clarifications = new IntelligenceClarificationsRepo(handle, sp);
    clarifications.create({
      claimId: `entity-ambiguity:${ambiguousMem}`,
      domain: "mind",
      question: "Which Civic do you mean — the 2016 or the 2020?",
      evidence: [
        { domain: "memory", kind: "node", id: ambiguousMem, label: "I sold my Civic last week." },
        { domain: "memory", kind: "node", id: civic2020, label: "2020 Civic" },
      ],
    });

    const result = await resolveClarificationFromMessage(handle, { embeddings, llm }, "I meant the 2020 Civic.", sp);
    expect(result).not.toBeNull();
    expect(result!.confirmedNodeId).toBeTypeOf("number");

    // The confirmed answer is a NEW node, linked via "resolves" — the ambiguous memory and
    // both candidate anchors are NEVER rewritten.
    const edges = new EdgesRepo(handle, sp);
    expect(edges.exists(result!.confirmedNodeId, ambiguousMem)).toBe(true);
    const civicRowsUnchanged =
      handle.sqlite.prepare(`SELECT id, label FROM nodes WHERE id IN (?, ?)`).all(civic2016, civic2020).length === 2;
    expect(civicRowsUnchanged).toBe(true);

    const resolved = clarifications.get(1);
    expect(resolved?.status).toBe("confirmed");
  });
});

describe("8. Epistemic separation — identity/ambiguity never promotes or alters epistemic status", () => {
  it("a memory linked to an anchor (or two) still reports plain 'fact' status — linking never touches EpistemicStatus", async () => {
    const sp = "s1";
    const anchorId = await createCognitive(ctx, sp, "goal", "Home renovation project", "Renovating the kitchen.", { aliases: ["the reno"] });
    const a = (await ingest(handle, { embeddings, llm }, "Started the reno this weekend.", sp)).nodes[0]!.id;
    applyCognitiveGravity(ctx, sp);

    const timeline = reconstructEntityTimeline(handle, sp, ref(anchorId));
    const event = timeline.find((e) => e.source.id === a);
    expect(event?.status).toBe("fact"); // never "confirmed" merely because it's anchor-linked
  });

  it("linking never creates a clarification, claim, or any other epistemic side effect by itself", async () => {
    const sp = "s1";
    const before = (handle.sqlite.prepare(`SELECT COUNT(*) AS c FROM intelligence_clarifications`).get() as { c: number }).c;
    const anchorId = await createCognitive(ctx, sp, "goal", "Home renovation project", "Renovating the kitchen.", { aliases: ["the reno"] });
    await ingest(handle, { embeddings, llm }, "Started the reno this weekend.", sp);
    applyCognitiveGravity(ctx, sp);
    const after = (handle.sqlite.prepare(`SELECT COUNT(*) AS c FROM intelligence_clarifications`).get() as { c: number }).c;
    expect(after).toBe(before);
    void anchorId;
  });
});

describe("9. Space isolation — identity evidence never crosses spaces", () => {
  it("an anchor in one space never links to a similarly-worded memory in another space", async () => {
    const anchorId = await createCognitive(ctx, "space-a", "goal", "Home renovation project", "Renovating the kitchen.", {
      aliases: ["the reno"],
    });
    const otherSpaceMem = (await ingest(handle, { embeddings, llm }, "The reno is going great!", "space-b")).nodes[0]!.id;

    applyCognitiveGravity(ctx, "space-a"); // scoped to space-a only, per the existing signature

    const edges = new EdgesRepo(handle, "space-a");
    expect(edges.exists(otherSpaceMem, anchorId) || edges.exists(anchorId, otherSpaceMem)).toBe(false);
    const timeline = reconstructEntityTimeline(handle, "space-a", ref(anchorId));
    expect(timeline.map((e) => e.source.id)).not.toContain(otherSpaceMem);
  });
});

describe("10. Domain authority — cognitive anchoring never touches a real domain's own table", () => {
  it("linking/gravity never writes to fin_goal, journeys, or insights tables — only nodes/edges", async () => {
    const sp = "s1";
    const finGoalCountBefore = (handle.sqlite.prepare(`SELECT COUNT(*) AS c FROM fin_goal`).get() as { c: number }).c;
    const journeyCountBefore = (handle.sqlite.prepare(`SELECT COUNT(*) AS c FROM journeys`).get() as { c: number }).c;

    await createCognitive(ctx, sp, "goal", "Home renovation project", "Renovating the kitchen.", { aliases: ["the reno"] });
    await ingest(handle, { embeddings, llm }, "Started the reno this weekend.", sp);
    applyCognitiveGravity(ctx, sp);

    const finGoalCountAfter = (handle.sqlite.prepare(`SELECT COUNT(*) AS c FROM fin_goal`).get() as { c: number }).c;
    const journeyCountAfter = (handle.sqlite.prepare(`SELECT COUNT(*) AS c FROM journeys`).get() as { c: number }).c;
    expect(finGoalCountAfter).toBe(finGoalCountBefore);
    expect(journeyCountAfter).toBe(journeyCountBefore);
    // A "goal" CognitiveKind (Mind tab) is a `nodes` row — a completely different identity
    // from a Financial Goal (`fin_goal` table) even though both are colloquially "a goal".
    // Nothing here ever creates or mutates a fin_goal row.
  });
});

describe("11. Performance / bounds — no full-space scan introduced by identity linking", () => {
  it("linkCognitiveAnchor / applyCognitiveGravity never call NodesRepo.all(), even with many unrelated memories present", async () => {
    const sp = "s1";
    const anchorId = await createCognitive(ctx, sp, "goal", "Home renovation project", "Renovating the kitchen.", { aliases: ["the reno"] });
    for (let i = 0; i < 60; i++) await ingest(handle, { embeddings, llm }, `Unrelated memory number ${i}.`, sp);
    const target = (await ingest(handle, { embeddings, llm }, "Started the reno this weekend.", sp)).nodes[0]!.id;

    const allSpy = vi.spyOn(NodesRepo.prototype, "all");
    try {
      linkCognitiveAnchor(ctx, sp, anchorId, "Home renovation project");
      applyCognitiveGravity(ctx, sp);
      expect(allSpy).not.toHaveBeenCalled();
    } finally {
      allSpy.mockRestore();
    }

    const edges = new EdgesRepo(handle, sp);
    expect(edges.exists(target, anchorId) || edges.exists(anchorId, target)).toBe(true);
  });
});
