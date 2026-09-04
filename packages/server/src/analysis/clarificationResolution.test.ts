import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { HashEmbeddingProvider } from "../embeddings/hash.js";
import { HeuristicProvider } from "../llm/heuristic.js";
import { EMBED_DIM } from "../db/vec.js";
import { IntelligenceClarificationsRepo } from "../repositories/intelligenceClarifications.repo.js";
import { NodesRepo } from "../repositories/nodes.repo.js";
import { EdgesRepo } from "../repositories/edges.repo.js";
import { resolveClarificationFromMessage } from "./clarificationResolution.js";

let handle: DbHandle;
const embeddings = new HashEmbeddingProvider(EMBED_DIM);
const llm = new HeuristicProvider();
const deps = { embeddings, llm };

beforeEach(() => {
  handle = createDb(":memory:");
});
afterEach(() => handle.sqlite.close());

describe("resolveClarificationFromMessage (I2)", () => {
  it("returns null when there is no pending clarification", async () => {
    const r = await resolveClarificationFromMessage(handle, deps, "Yes, that's right.", "s1");
    expect(r).toBeNull();
  });

  it("returns null and leaves the clarification pending when the message doesn't answer it", async () => {
    const nodesRepo = new NodesRepo(handle, "s1");
    const evidenceEmbedding = await embeddings.embed("The 2016 Honda was in an accident.");
    const evidenceNode = nodesRepo.create(
      { label: "vehicle accident", type: "daily", content: "The 2016 Honda was in an accident." },
      evidenceEmbedding,
    );
    const clarifications = new IntelligenceClarificationsRepo(handle, "s1");
    const pending = clarifications.create({
      claimId: "insight:1",
      domain: "mind",
      question: "Is this the same 2016 vehicle you mentioned before?",
      evidence: [{ domain: "memory", kind: "node", id: evidenceNode.id, label: "vehicle accident" }],
    });

    const r = await resolveClarificationFromMessage(handle, deps, "I had pizza for lunch today.", "s1");
    expect(r).toBeNull();
    expect(clarifications.get(pending.id)?.status).toBe("pending");
  });

  it("confirms a real answer: creates a memory node, links it via 'resolves', and marks the clarification confirmed", async () => {
    const nodesRepo = new NodesRepo(handle, "s1");
    const evidenceEmbedding = await embeddings.embed("The 2016 Honda was in an accident.");
    const evidenceNode = nodesRepo.create(
      { label: "vehicle accident", type: "daily", content: "The 2016 Honda was in an accident." },
      evidenceEmbedding,
    );
    const clarifications = new IntelligenceClarificationsRepo(handle, "s1");
    const pending = clarifications.create({
      claimId: "insight:1",
      domain: "mind",
      question: "Is this the same 2016 vehicle you mentioned before?",
      evidence: [{ domain: "memory", kind: "node", id: evidenceNode.id, label: "vehicle accident" }],
    });

    const r = await resolveClarificationFromMessage(handle, deps, "Yes. It was totaled in an accident.", "s1");
    expect(r).not.toBeNull();
    expect(r!.confirmedStatement).toBe("It was totaled in an accident.");

    const savedNode = nodesRepo.getById(r!.confirmedNodeId);
    expect(savedNode?.origin).toBe("user");
    expect(savedNode?.content).toBe("It was totaled in an accident.");

    const edgesRepo = new EdgesRepo(handle, "s1");
    expect(edgesRepo.exists(r!.confirmedNodeId, evidenceNode.id)).toBe(true);

    const resolved = clarifications.get(pending.id);
    expect(resolved?.status).toBe("confirmed");
    expect(resolved?.confirmedNodeId).toBe(r!.confirmedNodeId);
    expect(resolved?.answerText).toBe("Yes. It was totaled in an accident.");

    // The original evidence memory is NEVER rewritten — historical fact stays as it was.
    expect(nodesRepo.getById(evidenceNode.id)?.content).toBe("The 2016 Honda was in an accident.");
  });

  it("silently skips a dangling evidence ref instead of crashing", async () => {
    const clarifications = new IntelligenceClarificationsRepo(handle, "s1");
    clarifications.create({
      claimId: "insight:1",
      domain: "mind",
      question: "Did you change jobs recently?",
      evidence: [{ domain: "memory", kind: "node", id: 9999, label: "deleted memory" }],
    });

    const r = await resolveClarificationFromMessage(handle, deps, "Yes, I started a new job last week.", "s1");
    expect(r).not.toBeNull();
    expect(r!.confirmedStatement).toBe("I started a new job last week.");
  });

  it("is space-scoped — a pending clarification in another space is never resolved", async () => {
    const clarifications = new IntelligenceClarificationsRepo(handle, "s1");
    clarifications.create({ claimId: "insight:1", domain: "mind", question: "q?", evidence: [] });

    const r = await resolveClarificationFromMessage(handle, deps, "Yes, that's right.", "s2");
    expect(r).toBeNull();
  });
});
