import { type ChatResponse, type NodeRef, toneFrom } from "@brain/shared";
import type { DbHandle } from "../db/client.js";
import { DEFAULT_SPACE } from "../db/schema.js";
import { knn, knnDocs, knnProfiles } from "../db/vec.js";
import { multiHopNeighbors } from "../graph/traversal.js";
import { NodesRepo } from "../repositories/nodes.repo.js";
import { InstructionProfilesRepo } from "../repositories/instructions.repo.js";
import { KnowledgeRepo } from "../repositories/knowledge.repo.js";
import { InsightsRepo } from "../repositories/insights.repo.js";
import { refreshPersona } from "../persona/derive.js";
import { soulText } from "../identity.js";
import { UsageTracker } from "../usage.js";
import { EconomyRepo } from "../economy.js";
import type { EmbeddingProvider } from "../embeddings/adapter.js";
import type { LlmProvider } from "../llm/adapter.js";

export interface ChatOptions {
  /** Semantic seed nodes from KNN. */
  k: number;
  /** Hops to expand around each seed (the GraphRAG neighborhood step). */
  depth: number;
  /** Knowledge-document chunks to retrieve (AI Companion RAG). */
  kDocs: number;
}

export const DEFAULT_CHAT: ChatOptions = { k: 6, depth: 1, kDocs: 4 };

/** Min similarity for an 'auto' instruction profile to be intent-routed in. */
const AUTO_PROFILE_THRESHOLD = 0.35;

/**
 * GraphRAG: embed the question -> KNN seeds -> expand neighborhoods via recursive
 * CTE -> assemble subgraph context -> LLM answers with node citations.
 */
export async function chat(
  h: DbHandle,
  deps: { embeddings: EmbeddingProvider; llm: LlmProvider },
  question: string,
  opts: ChatOptions = DEFAULT_CHAT,
  spaceId: string = DEFAULT_SPACE,
): Promise<ChatResponse> {
  const vec = await deps.embeddings.embed(question);
  const seeds = knn(h.sqlite, vec, opts.k, spaceId);

  const ids = new Set<number>();
  for (const s of seeds) {
    ids.add(s.nodeId);
    for (const hop of multiHopNeighbors(h.sqlite, s.nodeId, opts.depth)) ids.add(hop.nodeId);
  }

  const nodesRepo = new NodesRepo(h, spaceId);
  const ctxNodes = nodesRepo.byIds([...ids]);
  const context = ctxNodes.map((n) => ({
    id: n.id,
    label: n.label,
    type: n.type,
    content: n.content,
  }));

  // --- AI Companion layers (reuse the single question embedding `vec`) ---
  // Knowledge-document RAG.
  const knowledgeRepo = new KnowledgeRepo(h, spaceId);
  const docHits = knnDocs(h.sqlite, vec, opts.kDocs, spaceId);
  const chunks = knowledgeRepo.chunksByIds(docHits.map((d) => d.chunkId));
  const knowledge =
    chunks.length > 0 ? chunks.map((c) => `[${c.docName}] ${c.content}`).join("\n\n") : undefined;

  // Layer 2: blend active instruction profiles. 'always' profiles always apply;
  // 'auto' profiles are intent-routed by semantic similarity to the question.
  const active = new InstructionProfilesRepo(h, spaceId).listActive();
  let routedAuto = new Set<number>();
  if (active.some((p) => p.mode === "auto")) {
    routedAuto = new Set(
      knnProfiles(h.sqlite, vec, 3, spaceId)
        .filter((p) => p.similarity >= AUTO_PROFILE_THRESHOLD)
        .map((p) => p.profileId),
    );
  }
  const chosen = active.filter((p) => p.mode !== "auto" || routedAuto.has(p.id));

  // --- Live Telemetry & App State (for all app tabs/pages context) ---
  const usage = new UsageTracker(h).summary();
  const resilient = deps.llm as any;
  const llmStatus = {
    model: deps.llm.model,
    available: resilient.available !== false,
    degraded: resilient.degraded === true,
    disabledUntil: resilient.disabledUntil ? new Date(resilient.disabledUntil).toLocaleTimeString() : null,
  };
  // Deployment-level spend is summarized QUALITATIVELY only: exact dollar figures
  // and which API keys are configured are shared-deployment facts that must not be
  // recited to every tenant's chat.
  const budgetState = usage.overBudget ? "exhausted" : usage.low ? "running low" : "healthy";

  const economy = new EconomyRepo(h, spaceId).toFuel();

  let recentLogs: { action: string; description: string; created_at: string }[] = [];
  try {
    recentLogs = h.sqlite
      .prepare(`SELECT action, description, created_at FROM agent_logs WHERE space_id = ? ORDER BY id DESC LIMIT 5`)
      .all(spaceId) as any[];
  } catch (err) {
    console.error("[chat] failed to fetch agent logs for telemetry:", err);
  }

  const allNodes = nodesRepo.all();
  const totalMemories = allNodes.length;
  const mainHubs = allNodes
    .filter((n) => typeof n.importance === "number" && n.importance >= 0.7)
    .map((n) => `"${n.label}" (Type: ${n.type}, Mass: ${n.importance})`);

  const typeCounts: Record<string, number> = {};
  for (const n of allNodes) {
    typeCounts[n.type] = (typeCounts[n.type] ?? 0) + 1;
  }

  const activeActions = allNodes.filter((n) => n.kind === "action");

  let recentInsights: string[] = [];
  try {
    recentInsights = new InsightsRepo(h, spaceId).recent(5).map((i) => `- Insight: ${i.text}`);
  } catch (err) {
    console.error("[chat] failed to fetch insights for telemetry:", err);
  }

  const telemetryContext = `
=== CURRENT APP STATE & SYSTEM TELEMETRY (AWARENESS OF ALL APP TABS/PAGES) ===
You have full access to read every tab and page of this application. Here is the current live state of all tabs:

1. COMPANION & SYSTEM SETTINGS TAB:
- Cloud AI Status: ${llmStatus.available ? "ACTIVE & RUNNING" : "DEGRADED (On temporary fallback/cooldown)"}
- AI Error Cooldown: ${llmStatus.degraded ? `YES (quota/billing limit hit, cooling down until ${llmStatus.disabledUntil})` : "None (fully functional)"}
- Shared AI Budget State: ${budgetState}${budgetState !== "healthy" ? " — advise gentler use until it recovers" : ""}

2. SOUMAYA & FLEET TAB:
- Ship Fuel level: ${economy.fuel.toFixed(1)} / ${economy.capacity} units
- Ship Upkeep job cost: ${economy.jobCost} fuel per deep-dive research/scan
- Low Fuel distress trigger: ${economy.fuel < 20 ? "⚠️ CRITICAL LOW FUEL DISTRESS TRIGGERED" : "Optimal (above distress threshold)"}
- Recent Autonomy Log:
${recentLogs.map((l) => `  * [${l.created_at || "recent"}] ${l.action.toUpperCase()}: ${l.description}`).join("\n")}

3. LIST & SECTORS TAB:
- Total Memory Nodes in Space: ${totalMemories}
- Sector/Type Distribution of Memories:
${Object.entries(typeCounts).map(([type, count]) => `  * Type "${type}": ${count} nodes`).join("\n")}
- Celestial Hubs (Mass >= 0.70):
${mainHubs.length > 0 ? mainHubs.map((h) => `  * ${h}`).join("\n") : "  * (No high mass hubs cataloged)"}

4. AGENDA / ACTIONS TAB:
- Unresolved Action Items/Tasks:
${activeActions.length > 0 ? activeActions.map((a) => `  * [ ] "${a.label}" (Priority weight: ${a.importance ?? 0.4})`).join("\n") : "  * (No action items pending)"}

5. INSIGHTS / DIGEST TAB:
- Recent Latent Cross-Cluster Insights:
${recentInsights.length > 0 ? recentInsights.join("\n") : "  * (No latent connection insights synthesized yet)"}

Use this telemetry to guide the user! For example:
- If fuel is low (<20) and they ask how you're doing, tell them you're in distress or need them to log memories / clear agenda to refill fuel.
- If the shared AI budget is running low or exhausted (or the provider is on cooldown), say your deep-thinking is resting and will return — never recite dollar figures or key configuration.
- If they ask about their tasks/agenda, summarize the active action items.
- If they ask about sectors/galaxy size, talk about node counts and hubs.
- You can suggest they look at specific tabs (e.g. "Go to the Agenda tab and complete task X to gain fuel", or "Check out the Insights tab to see the latest connections I forged").
`;

  let systemExtra = chosen.length > 0
    ? "ACTIVE CUSTOM INSTRUCTIONS (stacked, highest priority first — adopt these as your operating frame):\n" +
      chosen.map((p, i) => `${i + 1}. ${p.name}: ${p.body}`).join("\n\n")
    : "";

  systemExtra += (systemExtra ? "\n\n" : "") + telemetryContext;

  // "About Me" awareness (auto-derived; she's aware of who you are, never becomes you).
  const persona = refreshPersona(h, spaceId) || undefined;

  const { answer, citations } = await deps.llm.answer(question, context, {
    soul: soulText() || undefined,
    systemExtra,
    persona,
    knowledge,
  });

  const refById = new Map<number, NodeRef>(
    ctxNodes.map((n) => [n.id, { id: n.id, label: n.label, type: n.type }]),
  );
  const validCitations = citations
    .map((id) => refById.get(id))
    .filter((x): x is NodeRef => x !== undefined);

  // Dramatization: the cited memories anchor *what this is about* (their averaged
  // emotional weight), her answer's wording captures *how she's phrasing it* —
  // blended into a delivery tone the client uses to keep her voice from going flat.
  const cited = ctxNodes.filter((n) => citations.includes(n.id));
  const weighted = (cited.length > 0 ? cited : ctxNodes).filter(
    (n) => typeof n.emotionalWeight === "number",
  );
  const avgEw =
    weighted.length > 0
      ? weighted.reduce((s, n) => s + (n.emotionalWeight ?? 0), 0) / weighted.length
      : undefined;
  const tone = toneFrom(answer, avgEw);

  return { answer, citations: validCitations, contextIds: [...ids], tone };
}
