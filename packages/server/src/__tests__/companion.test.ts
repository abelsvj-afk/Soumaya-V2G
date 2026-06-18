import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { HashEmbeddingProvider } from "../embeddings/hash.js";
import { HeuristicProvider } from "../llm/heuristic.js";
import { EMBED_DIM, knnDocs, upsertProfileEmbedding } from "../db/vec.js";
import type { AnswerOptions, ContextNode } from "../llm/adapter.js";
import { chat, DEFAULT_CHAT } from "../chat/graphrag.js";
import { InstructionProfilesRepo } from "../repositories/instructions.repo.js";
import { KnowledgeRepo, UserPersonaRepo } from "../repositories/knowledge.repo.js";
import { ingestDocument } from "../knowledge/ingest.js";

/** Records the opts handed to answer(), then delegates to the offline heuristic. */
class CapturingLlm extends HeuristicProvider {
  lastOpts: AnswerOptions | undefined;
  async answer(question: string, context: ContextNode[], opts?: AnswerOptions) {
    this.lastOpts = opts;
    return super.answer(question, context, opts);
  }
}

let handle: DbHandle;
const embeddings = new HashEmbeddingProvider(EMBED_DIM);

beforeEach(() => {
  handle = createDb(":memory:");
});
afterEach(() => handle.sqlite.close());

const deps = (llm = new CapturingLlm()) => ({ deps: { embeddings, llm }, llm });

async function addProfile(
  spaceId: string,
  p: { name: string; body: string; mode?: "always" | "auto"; priority?: number; enabled?: boolean },
) {
  const repo = new InstructionProfilesRepo(handle, spaceId);
  const row = repo.create({ name: p.name, body: p.body, mode: p.mode, priority: p.priority });
  if (p.enabled === false) repo.update(row.id, { enabled: false });
  upsertProfileEmbedding(handle.sqlite, row.id, await embeddings.embed(`${p.name}\n${p.body}`));
  return row;
}

describe("AI Companion — chat layering", () => {
  it("blends enabled 'always' profiles into systemExtra, priority-ordered; skips disabled", async () => {
    await addProfile("legacy", { name: "Coach", body: "BODY_COACH", priority: 1 });
    await addProfile("legacy", { name: "Advisor", body: "BODY_ADVISOR", priority: 9 });
    await addProfile("legacy", { name: "Off", body: "BODY_OFF", enabled: false });

    const { deps: d, llm } = deps();
    await chat(handle, d, "hello there", DEFAULT_CHAT, "legacy");

    const extra = llm.lastOpts?.systemExtra ?? "";
    expect(extra).toContain("BODY_COACH");
    expect(extra).toContain("BODY_ADVISOR");
    expect(extra).not.toContain("BODY_OFF");
    // Higher priority (Advisor=9) appears before lower (Coach=1).
    expect(extra.indexOf("BODY_ADVISOR")).toBeLessThan(extra.indexOf("BODY_COACH"));
  });

  it("passes the About-Me persona through to answer()", async () => {
    new UserPersonaRepo(handle, "legacy").set("I am a sailor who likes blunt advice.");
    const { deps: d, llm } = deps();
    await chat(handle, d, "what's up", DEFAULT_CHAT, "legacy");
    expect(llm.lastOpts?.persona).toContain("sailor");
  });

  it("intent-routes 'auto' profiles by topic; 'always' always applies", async () => {
    // 'auto' profile that should match a sailing question (shared tokens).
    await addProfile("legacy", {
      name: "Sailing Mentor",
      body: "sailing regatta ocean tactics windward",
      mode: "auto",
    });
    // 'auto' profile on an unrelated topic — should NOT route in.
    await addProfile("legacy", {
      name: "Tax Helper",
      body: "quarterly tax depreciation spreadsheets payroll",
      mode: "auto",
    });
    // 'always' profile — always present regardless of topic.
    await addProfile("legacy", { name: "Tone", body: "BODY_ALWAYS", mode: "always" });

    const { deps: d, llm } = deps();
    await chat(handle, d, "sailing regatta ocean tactics windward please", DEFAULT_CHAT, "legacy");
    const extra = llm.lastOpts?.systemExtra ?? "";
    expect(extra).toContain("Sailing Mentor");
    expect(extra).toContain("BODY_ALWAYS");
    expect(extra).not.toContain("Tax Helper");
  });
});

describe("AI Companion — knowledge RAG", () => {
  it("retrieves doc chunks into the knowledge layer, scoped to the space", async () => {
    await ingestDocument(
      handle,
      { embeddings },
      { name: "Sailing Guide", text: "tacking jibing windward leeward regatta strategy" },
      "spaceA",
    );
    await ingestDocument(
      handle,
      { embeddings },
      { name: "Tax Manual", text: "depreciation schedules quarterly filings payroll" },
      "spaceB",
    );

    const { deps: d, llm } = deps();
    await chat(handle, d, "windward regatta strategy", DEFAULT_CHAT, "spaceA");
    const k = llm.lastOpts?.knowledge ?? "";
    expect(k).toContain("Sailing Guide");
    expect(k).not.toContain("Tax Manual"); // space isolation
  });

  it("offline heuristic still answers and surfaces a knowledge excerpt (no key)", async () => {
    await ingestDocument(
      handle,
      { embeddings },
      { name: "Notes", text: "the lighthouse keeps the harbor safe at night" },
      "legacy",
    );
    const res = await chat(handle, { embeddings, llm: new HeuristicProvider() }, "lighthouse harbor", DEFAULT_CHAT, "legacy");
    expect(res.answer.length).toBeGreaterThan(0);
    expect(res.answer.toLowerCase()).toContain("lighthouse");
  });

  it("deleting a document removes its chunks + vectors", async () => {
    const doc = await ingestDocument(
      handle,
      { embeddings },
      { name: "Temp", text: "ephemeral content that will be removed shortly" },
      "legacy",
    );
    expect(doc.chunks).toBeGreaterThan(0);
    const repo = new KnowledgeRepo(handle, "legacy");
    expect(repo.deleteDoc(doc.id)).toBe(true);

    const vec = await embeddings.embed("ephemeral content");
    expect(knnDocs(handle.sqlite, vec, 5, "legacy")).toHaveLength(0);
    expect(repo.listDocs()).toHaveLength(0);
  });
});

describe("AI Companion — repo scoping", () => {
  it("keeps instruction profiles private per space", async () => {
    await addProfile("spaceA", { name: "A-only", body: "secret" });
    expect(new InstructionProfilesRepo(handle, "spaceA").list()).toHaveLength(1);
    expect(new InstructionProfilesRepo(handle, "spaceB").list()).toHaveLength(0);
  });
});
