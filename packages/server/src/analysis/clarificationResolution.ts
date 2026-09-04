import type { DbHandle } from "../db/client.js";
import { DEFAULT_SPACE } from "../db/schema.js";
import type { EmbeddingProvider } from "../embeddings/adapter.js";
import type { LlmProvider } from "../llm/adapter.js";
import { IntelligenceClarificationsRepo } from "../repositories/intelligenceClarifications.repo.js";
import { NodesRepo } from "../repositories/nodes.repo.js";
import { EdgesRepo } from "../repositories/edges.repo.js";

/** A label is truncated for display; the full statement always lives in the node's `content`. */
const MAX_LABEL_LEN = 60;

/**
 * I2 — closes the clarification lifecycle's last step (docs/specs/maya-intelligence-architecture.md):
 * Unknown → candidate inference → clarification asked → **user answers** → confirmed knowledge,
 * stored with provenance, available to future retrieval. Checks whether a NEW chat message
 * answers the single most recent PENDING clarification (there is normally at most one "live"
 * question — `analysis/intelligence.ts`'s own cooldown already limits how often a new one is
 * raised); if so, the resolved fact becomes a REAL memory node (`origin:"user"`) linked back to
 * the original evidence via the existing `"resolves"` relationship — no parallel knowledge
 * store, and the memory that triggered the question is NEVER rewritten or deleted. This makes
 * the confirmed fact automatically retrievable through the SAME embed+KNN/keyword retrieval
 * every other memory already uses — zero new retrieval infrastructure.
 *
 * Bounded by construction (Part IX): one `mostRecentPending()` row lookup (indexed, O(1)) per
 * chat message, and the one `interpretClarificationAnswer` LLM call only fires when a
 * clarification is actually pending — never a full-table scan.
 *
 * Returns null when there was nothing pending, or the message didn't answer it — either way the
 * clarification simply stays pending for a future message; the caller does nothing further.
 */
export async function resolveClarificationFromMessage(
  handle: DbHandle,
  deps: { embeddings: EmbeddingProvider; llm: LlmProvider },
  userMessage: string,
  spaceId: string = DEFAULT_SPACE,
): Promise<{ confirmedNodeId: number; confirmedStatement: string } | null> {
  const repo = new IntelligenceClarificationsRepo(handle, spaceId);
  const pending = repo.mostRecentPending();
  if (!pending) return null;

  const verdict = await deps.llm.interpretClarificationAnswer(pending.question, userMessage);
  const statement = verdict.confirmedStatement.trim();
  if (!verdict.answers || !statement) return null;

  const nodesRepo = new NodesRepo(handle, spaceId);
  const embedding = await deps.embeddings.embed(statement);
  const node = nodesRepo.create(
    {
      label: statement.length > MAX_LABEL_LEN ? `${statement.slice(0, MAX_LABEL_LEN - 3)}...` : statement,
      type: "knowledge",
      content: statement,
      origin: "user",
    },
    embedding,
  );

  // Link back to whatever memory evidence originally raised the question — "resolves" is
  // the exact existing relationship type for this shape (a newer statement settling an
  // earlier open question), reused rather than inventing a new one. Non-memory evidence
  // (finance/journey rows, etc.) has no graph node to link to; a dangling/deleted memory
  // ref is silently skipped rather than crashing this resolution.
  const edgesRepo = new EdgesRepo(handle, spaceId);
  for (const ref of pending.evidence) {
    if (ref.domain !== "memory" || ref.kind !== "node") continue;
    if (!nodesRepo.getById(ref.id)) continue;
    edgesRepo.create({ source: node.id, target: ref.id, relationship: "resolves" });
  }

  repo.resolve(pending.id, {
    status: "confirmed",
    answerText: userMessage,
    confirmedStatement: statement,
    confirmedNodeId: node.id,
  });

  return { confirmedNodeId: node.id, confirmedStatement: statement };
}
