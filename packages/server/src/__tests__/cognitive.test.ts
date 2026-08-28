import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { HashEmbeddingProvider } from "../embeddings/hash.js";
import { HeuristicProvider } from "../llm/heuristic.js";
import { EMBED_DIM } from "../db/vec.js";
import type { AppContext } from "../context.js";
import { UsageTracker } from "../usage.js";
import { NodesRepo } from "../repositories/nodes.repo.js";
import { EdgesRepo } from "../repositories/edges.repo.js";
import { GraphService } from "../graph/service.js";
import {
  createCognitive,
  listCognitive,
  setCognitiveProgress,
  applyCognitiveGravity,
  updateCognitive,
  cognitiveSnapshotText,
} from "../analysis/cognitive.js";
import { recordRejection } from "../analysis/rejections.js";
import { COGNITIVE_META } from "@brain/shared";
import { chat, DEFAULT_CHAT } from "../chat/graphrag.js";
import type { AnswerOptions, ContextNode } from "../llm/adapter.js";

let handle: DbHandle;
let ctx: AppContext;
const embeddings = new HashEmbeddingProvider(EMBED_DIM);

beforeEach(() => {
  handle = createDb(":memory:");
  ctx = { handle, embeddings, llm: new HeuristicProvider(), usage: new UsageTracker(handle) } as AppContext;
});
afterEach(() => handle.sqlite.close());

describe("cognitive layer (goals/ideas/skills/… as first-class bodies)", () => {
  it("creates a cognitive object with meta-derived colour/importance/progress", async () => {
    const id = await createCognitive(ctx, "legacy", "goal", "Ship Soumaya", "Get the second brain live");
    const node = new GraphService(handle, "legacy").getNode(id);
    expect(node?.kind).toBe("goal");
    expect(node?.type).toBe("concept");
    expect(node?.color).toBe(COGNITIVE_META.goal.color);
    expect(node?.importance).toBeCloseTo(COGNITIVE_META.goal.importance);
    // Goals carry progress; it starts at 0.
    expect(node?.progress).toBe(0);
  });

  it("leaves progress null for kinds that don't track it", async () => {
    const id = await createCognitive(ctx, "legacy", "identity", "A builder", "");
    const node = new GraphService(handle, "legacy").getNode(id);
    expect(node?.kind).toBe("identity");
    expect(node?.progress ?? null).toBeNull();
  });

  it("lists cognitive objects (all, or filtered by kind) with degree", async () => {
    await createCognitive(ctx, "legacy", "goal", "Goal A", "");
    await createCognitive(ctx, "legacy", "skill", "Skill A", "");
    const all = listCognitive(ctx, "legacy");
    expect(all.length).toBe(2);
    const goals = listCognitive(ctx, "legacy", "goal");
    expect(goals.length).toBe(1);
    const first = goals[0]!;
    expect(first.label).toBe("Goal A");
    expect(first.degree).toBe(0);
  });

  it("clamps progress to 0..1 and returns false for a missing id", async () => {
    const id = await createCognitive(ctx, "legacy", "skill", "Guitar", "");
    expect(setCognitiveProgress(ctx, "legacy", id, 1.5)).toBe(true);
    expect(new GraphService(handle, "legacy").getNode(id)?.progress).toBe(1);
    expect(setCognitiveProgress(ctx, "legacy", id, -3)).toBe(true);
    expect(new GraphService(handle, "legacy").getNode(id)?.progress).toBe(0);
    expect(setCognitiveProgress(ctx, "legacy", 999999, 0.5)).toBe(false);
  });

  /** Count supports edges pointing at an anchor. */
  const supportsInto = (anchorId: number) =>
    (handle.sqlite
      .prepare(`SELECT COUNT(*) AS c FROM edges WHERE space_id = 'legacy' AND relationship = 'supports' AND target = ?`)
      .get(anchorId) as { c: number }).c;

  async function mem(label: string, content: string) {
    return new NodesRepo(handle, "legacy").create(
      { label, type: "daily", content } as never,
      await embeddings.embed(content),
    );
  }

  it("links a person to the memories that MENTION them, on creation (the name-match fix)", async () => {
    await mem("date night", "Dinner with Mara was wonderful");
    await mem("plans", "Mara and I are planning a trip");
    await mem("work", "Finished the quarterly report at the office"); // unrelated
    // Adding the person immediately links her memories — no autonomy tick needed.
    const personId = await createCognitive(ctx, "legacy", "person_entity", "Mara", "");
    expect(supportsInto(personId)).toBe(2); // the two that name her, not the unrelated one
  });

  it("keyword matching is whole-word (no substring false positives)", async () => {
    await mem("a", "Danny called about the game");
    await mem("b", "Dannyson Corp filed paperwork"); // 'danny' is a substring, not a word
    const id = await createCognitive(ctx, "legacy", "person_entity", "Danny", "");
    expect(supportsInto(id)).toBe(1); // only the real "Danny" mention
  });

  it("the periodic gravity sweep links memories added AFTER the anchor, capped per run", async () => {
    const goalId = await createCognitive(ctx, "legacy", "goal", "Master guitar", "");
    expect(supportsInto(goalId)).toBe(0); // nothing to link yet
    for (let i = 0; i < 10; i++) await mem(`practice ${i}`, "practiced guitar scales today");
    // Linking is gradual — capped per run so a hub can't form in one burst.
    expect(applyCognitiveGravity(ctx, "legacy")).toBe(8); // MAX_KEYWORD this run
    expect(supportsInto(goalId)).toBe(8);
    expect(applyCognitiveGravity(ctx, "legacy")).toBe(2); // the remaining two
    expect(supportsInto(goalId)).toBe(10);
    // Now idempotent — every match is linked, so no duplicate edges form.
    expect(applyCognitiveGravity(ctx, "legacy")).toBe(0);
    expect(supportsInto(goalId)).toBe(10);
  });

  it("re-links after an edit (renaming a placeholder to a real name connects it)", async () => {
    await mem("meet", "Great session with Kickman today");
    const id = await createCognitive(ctx, "legacy", "person_entity", "Placeholder", "");
    expect(supportsInto(id)).toBe(0);
    const ok = await updateCognitive(ctx, "legacy", id, { label: "Kickman" });
    expect(ok).toBe(true);
    expect(supportsInto(id)).toBe(1);
    expect(new GraphService(handle, "legacy").getNode(id)?.label).toBe("Kickman");
  });

  it("a person links ONLY by name, never by vibe (goals still link semantically)", async () => {
    // A memory that shares content but names neither anchor.
    await mem("note", "alpha beta gamma delta epsilon zeta");
    // A goal legitimately gathers the thematically-similar memory (semantic pass).
    const goalId = await createCognitive(ctx, "legacy", "goal", "Topic", "alpha beta gamma delta epsilon zeta");
    expect(supportsInto(goalId)).toBeGreaterThanOrEqual(1);
    // A person does NOT — she isn't named in it, so it's not a real connection.
    const personId = await createCognitive(ctx, "legacy", "person_entity", "Alena", "alpha beta gamma delta epsilon zeta");
    expect(supportsInto(personId)).toBe(0);
  });

  it("links VAGUE memories via aliases (no exact name needed)", async () => {
    await mem("m1", "my girlfriend and I went hiking");
    await mem("m2", "spent the weekend with my girl");
    await mem("m3", "quarterly budget review"); // unrelated
    const personId = await createCognitive(ctx, "legacy", "person_entity", "Mara", "", {
      aliases: ["girlfriend", "my girl"],
    });
    expect(supportsInto(personId)).toBe(2); // both vague mentions, not the unrelated one
  });

  it("respects a rejected pair — gravity won't re-link what the user severed", async () => {
    const m = await mem("m", "coffee with Danny");
    const personId = await createCognitive(ctx, "legacy", "person_entity", "Danny", "");
    expect(supportsInto(personId)).toBe(1); // named → linked
    // User says they don't relate: sever + record the rejection, then re-run gravity.
    handle.sqlite.prepare(`DELETE FROM edges WHERE space_id='legacy' AND source=? AND target=?`).run(m.id, personId);
    recordRejection(ctx, "legacy", m.id, personId);
    applyCognitiveGravity(ctx, "legacy");
    expect(supportsInto(personId)).toBe(0); // stays severed
  });

  it("gravity never links a cognitive anchor to another anchor (only real memories)", async () => {
    await createCognitive(ctx, "legacy", "goal", "Goal one", "shared theme text");
    await createCognitive(ctx, "legacy", "goal", "Goal two", "shared theme text");
    const formed = applyCognitiveGravity(ctx, "legacy");
    expect(formed).toBe(0); // no real memories to pull; anchors don't pull each other
  });

  it("durable cognitive kinds are entropy-exempt (mass doesn't cool)", async () => {
    const id = await createCognitive(ctx, "legacy", "goal", "Enduring goal", "");
    // Backdate it far into the past — a normal memory would have cooled.
    handle.sqlite.prepare(`UPDATE nodes SET last_tended_at = datetime('now','-400 days') WHERE id = ?`).run(id);
    const node = new GraphService(handle, "legacy").getNode(id);
    // entropy 0 → the celestial enrichment keeps full importance-driven mass.
    expect(node?.celestial).toBeTruthy();
    expect(node?.entropy ?? 0).toBe(0);
  });
});

describe("cognitiveSnapshotText — the rest of the Mind tab, for chat context", () => {
  it("is null when nothing is tracked", () => {
    expect(cognitiveSnapshotText(handle, "legacy")).toBeNull();
  });

  it("is null when the ONLY cognitive object is a person (their own snapshot covers that)", async () => {
    await createCognitive(ctx, "legacy", "person_entity", "Maya", "");
    expect(cognitiveSnapshotText(handle, "legacy")).toBeNull();
  });

  it("groups by kind and shows progress% + tier for goals/skills", async () => {
    const goalId = await createCognitive(ctx, "legacy", "goal", "Ship Soumaya", "");
    setCognitiveProgress(ctx, "legacy", goalId, 0.5);
    const skillId = await createCognitive(ctx, "legacy", "skill", "Guitar", "");
    setCognitiveProgress(ctx, "legacy", skillId, 0.85);
    await createCognitive(ctx, "legacy", "idea", "Start a podcast", "");

    const text = cognitiveSnapshotText(handle, "legacy")!;
    expect(text).toContain("Goals: Ship Soumaya 50%");
    expect(text).toContain("Skills: Guitar 85% (Advanced)");
    expect(text).toContain("Ideas: Start a podcast");
    expect(text).not.toContain("%)"); // idea has no progress — no stray percentage
  });

  it("excludes person_entity from this summary (covered by peopleSnapshotText instead)", async () => {
    await createCognitive(ctx, "legacy", "person_entity", "Maya", "");
    await createCognitive(ctx, "legacy", "goal", "Learn Japanese", "");
    const text = cognitiveSnapshotText(handle, "legacy")!;
    expect(text).not.toContain("Maya");
    expect(text).toContain("Learn Japanese");
  });

  it("is space-scoped", async () => {
    await createCognitive(ctx, "alice", "goal", "Alice's goal", "");
    expect(cognitiveSnapshotText(handle, "bob")).toBeNull();
    expect(cognitiveSnapshotText(handle, "alice")).not.toBeNull();
  });

  it("is injected into chat's systemExtra, same as finance/people", async () => {
    class CapturingLlm extends HeuristicProvider {
      lastOpts: AnswerOptions | undefined;
      async answer(question: string, context: ContextNode[], opts?: AnswerOptions) {
        this.lastOpts = opts;
        return super.answer(question, context, opts);
      }
    }
    await createCognitive(ctx, "legacy", "goal", "Buy a house", "");
    const llm = new CapturingLlm();
    await chat(handle, { embeddings, llm }, "how am I doing", DEFAULT_CHAT, "legacy");
    expect(llm.lastOpts?.systemExtra ?? "").toContain("MIND TAB");
    expect(llm.lastOpts?.systemExtra ?? "").toContain("Buy a house");
  });
});
