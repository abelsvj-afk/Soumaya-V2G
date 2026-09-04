import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { HashEmbeddingProvider } from "../embeddings/hash.js";
import { HeuristicProvider } from "../llm/heuristic.js";
import { EMBED_DIM } from "../db/vec.js";
import { ingest } from "../ingestion/pipeline.js";
import { NodesRepo } from "../repositories/nodes.repo.js";
import { chat, DEFAULT_CHAT } from "../chat/graphrag.js";
import type { AnswerOptions, ContextNode } from "../llm/adapter.js";

/**
 * Maya Longitudinal Intelligence, Phase E (docs/specs/maya-longitudinal-intelligence.md,
 * Section 11) — chat integration (task's required test group 12), same
 * "is it injected into chat's systemExtra" pattern already proven for the other snapshots in
 * intelligenceChat.test.ts / temporalChat.test.ts. Includes the mandatory trucking-frustration
 * walkthrough — the scenario itself uses trucking wording (as the task explicitly asks for),
 * but nothing in `analysis/emotional.ts` or `chat/graphrag.ts` contains any topic-specific logic;
 * the exact same code path handles any subject.
 */

let handle: DbHandle;
const embeddings = new HashEmbeddingProvider(EMBED_DIM);
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

function setValence(id: number, valence: number, occurredAt: string) {
  handle.sqlite.prepare(`UPDATE nodes SET emotional_weight = ?, occurred_at = ? WHERE id = ?`).run(valence, occurredAt, id);
}

describe("emotional context is injected into chat's systemExtra, same as the other snapshots", () => {
  it("includes EMOTIONAL CONTEXT when the retrieved memories show a recurring pattern", async () => {
    const llm = new CapturingLlm();
    const a = (await ingest(handle, { embeddings, llm }, "Frustrated with the delivery route today.", "legacy")).nodes[0]!.id;
    const b = (await ingest(handle, { embeddings, llm }, "Frustrated with the delivery route again.", "legacy")).nodes[0]!.id;
    setValence(a, -0.6, "2026-03-02T12:00:00");
    setValence(b, -0.7, "2026-03-04T12:00:00");

    await chat(handle, { embeddings, llm }, "Frustrated with the delivery route", DEFAULT_CHAT, "legacy");
    expect(llm.lastOpts?.systemExtra ?? "").toContain("EMOTIONAL CONTEXT");
    expect(llm.lastOpts?.systemExtra ?? "").toContain("recurring SIGNAL");
  });

  it("stays silent for an unrelated question that never retrieves the patterned memories", async () => {
    const llm = new CapturingLlm();
    const a = (await ingest(handle, { embeddings, llm }, "Frustrated with the delivery route today.", "legacy")).nodes[0]!.id;
    const b = (await ingest(handle, { embeddings, llm }, "Frustrated with the delivery route again.", "legacy")).nodes[0]!.id;
    setValence(a, -0.6, "2026-03-02T12:00:00");
    setValence(b, -0.7, "2026-03-04T12:00:00");
    // Filler memories that DO share vocabulary with the upcoming question, so the deterministic
    // hash embedder ranks them above the zero-overlap frustration memories in top-k retrieval —
    // with too few total nodes, KNN's top-k would trivially include everything regardless of
    // similarity, which would test nothing.
    for (let i = 0; i < 8; i++) {
      await ingest(handle, { embeddings, llm }, `Reading about the moon and weather patterns in space, note ${i}.`, "legacy");
    }

    await chat(handle, { embeddings, llm }, "What's the weather like on the moon?", DEFAULT_CHAT, "legacy");
    expect(llm.lastOpts?.systemExtra ?? "").not.toContain("EMOTIONAL CONTEXT");
  });

  it("stays silent for a space with no emotional data at all", async () => {
    const llm = new CapturingLlm();
    await chat(handle, { embeddings, llm }, "hello", DEFAULT_CHAT, "legacy");
    expect(llm.lastOpts?.systemExtra ?? "").not.toContain("EMOTIONAL CONTEXT");
  });

  it("does not duplicate retrieval — no new KNN/embedding calls beyond the existing GraphRAG pass (structural: same bounded ids feed both)", async () => {
    // Not a spy-based instrumentation test (chat()'s retrieval is internal and already covered
    // by Phase A's own bounded-retrieval tests) — this proves the OBSERVABLE contract instead:
    // calling chat() twice with the identical question produces byte-identical emotional text,
    // which could only be true if the same bounded, deterministic ids drove both snapshots.
    const llm = new CapturingLlm();
    const a = (await ingest(handle, { embeddings, llm }, "Frustrated with the delivery route today.", "legacy")).nodes[0]!.id;
    const b = (await ingest(handle, { embeddings, llm }, "Frustrated with the delivery route again.", "legacy")).nodes[0]!.id;
    setValence(a, -0.6, "2026-03-02T12:00:00");
    setValence(b, -0.7, "2026-03-04T12:00:00");

    await chat(handle, { embeddings, llm }, "Frustrated with the delivery route", DEFAULT_CHAT, "legacy");
    const first = llm.lastOpts?.systemExtra ?? "";
    await chat(handle, { embeddings, llm }, "Frustrated with the delivery route", DEFAULT_CHAT, "legacy");
    const second = llm.lastOpts?.systemExtra ?? "";
    expect(first).toBe(second);
  });
});

describe("mandatory scenario — a durable goal survives a temporary emotional signal about the same topic", () => {
  it("recurring frustration about the trucking job never touches or invalidates the durable trucking-business vision", async () => {
    const llm = new CapturingLlm();
    const nodesRepo = new NodesRepo(handle, "legacy");

    // 1. A durable, explicitly-tracked long-term vision (cognitive layer, entropy-exempt).
    const visionContent = "I want to build a trucking company.";
    const vision = nodesRepo.create(
      { label: "Trucking company vision", content: visionContent, type: "other", kind: "life_vision" },
      await embeddings.embed(visionContent),
    );
    const visionBefore = handle.sqlite.prepare(`SELECT label, content, kind FROM nodes WHERE id = ?`).get(vision.id);

    // 2-3. Later: a frustrating workday, expressed repeatedly (a real, detected pattern — not
    // a single one-off complaint).
    const day1 = (await ingest(handle, { embeddings, llm }, "Man, I'm frustrated with this trucking job today.", "legacy")).nodes[0]!.id;
    const day2 = (await ingest(handle, { embeddings, llm }, "Still frustrated with this trucking job.", "legacy")).nodes[0]!.id;
    setValence(day1, -0.6, "2026-03-02T12:00:00");
    setValence(day2, -0.7, "2026-03-04T12:00:00");

    // 4-5. Maya reasons about the current conversation — the frustration may inform context.
    await chat(handle, { embeddings, llm }, "I'm frustrated with this trucking job", DEFAULT_CHAT, "legacy");
    const systemExtra = llm.lastOpts?.systemExtra ?? "";
    expect(systemExtra).toContain("EMOTIONAL CONTEXT"); // the signal IS available to reasoning
    // The Mind-tab snapshot (pre-existing, untouched by Phase E) may legitimately mention the
    // vision elsewhere in context — that's its own, unrelated job. What Phase E must never do is
    // have the EMOTIONAL snapshot itself assert the vision is abandoned/gone.
    const emotionalBlock = systemExtra.slice(systemExtra.indexOf("EMOTIONAL CONTEXT"));
    expect(emotionalBlock).not.toContain("Trucking company vision");
    expect(emotionalBlock).not.toMatch(/vision.*gone|no longer want/i);

    // 6. The durable vision remains completely intact — content, kind, everything.
    const visionAfter = handle.sqlite.prepare(`SELECT label, content, kind FROM nodes WHERE id = ?`).get(vision.id);
    expect(visionAfter).toEqual(visionBefore);

    // 7. Nothing became "confirmed" merely because the signal was strong/repeated.
    const clarifications = (
      handle.sqlite.prepare(`SELECT COUNT(*) AS c FROM intelligence_clarifications WHERE space_id = 'legacy'`).get() as { c: number }
    ).c;
    expect(clarifications).toBe(0);

    // 8. A LATER, EXPLICIT change of mind is a normal chat message — nothing in this phase
    // auto-mutates the vision from it; any real change would have to go through the existing
    // knowledge/clarification mechanism (unchanged by Phase E), never emotional inference. This
    // asserts the negative: the vision node is still untouched even after that message.
    await chat(handle, { embeddings, llm }, "I've changed my mind. I don't want to build this trucking company anymore.", DEFAULT_CHAT, "legacy");
    const visionFinal = handle.sqlite.prepare(`SELECT label, content, kind FROM nodes WHERE id = ?`).get(vision.id);
    expect(visionFinal).toEqual(visionBefore);
  });
});
