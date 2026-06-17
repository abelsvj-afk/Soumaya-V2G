import type { ChatResponse, DailyDigest, GraphData, GraphNode, Insight } from "@brain/shared";

const API = "/api";

// --- Global "AI is working" signal (ingest / chat / synthesis) ---
type ActivityListener = (active: number) => void;
let activeCount = 0;
const activityListeners = new Set<ActivityListener>();
function setActive(delta: number): void {
  activeCount = Math.max(0, activeCount + delta);
  for (const l of activityListeners) l(activeCount);
}
/** Subscribe to in-flight LLM-backed request count (for the activity badge). */
export function onAiActivity(cb: ActivityListener): () => void {
  activityListeners.add(cb);
  cb(activeCount);
  return () => activityListeners.delete(cb);
}
async function tracked<T>(p: Promise<T>): Promise<T> {
  setActive(1);
  try {
    return await p;
  } finally {
    setActive(-1);
  }
}

export interface IngestResult {
  nodes: GraphNode[];
  extractedEdges: unknown[];
  associativeEdges: unknown[];
}

export interface SearchHit extends GraphNode {
  similarity: number;
}

export interface Health {
  ok: boolean;
  embeddings: { model: string; dim: number };
  llm: { model: string; available: boolean; degraded?: boolean };
  nodes: number;
}

export async function getGraph(limit = 300): Promise<GraphData> {
  try {
    const res = await fetch(`${API}/graph?limit=${limit}`);
    const d = (await res.json().catch(() => null)) as Partial<GraphData> | null;
    return {
      nodes: Array.isArray(d?.nodes) ? d!.nodes! : [],
      links: Array.isArray(d?.links) ? d!.links! : [],
    };
  } catch {
    return { nodes: [], links: [] };
  }
}

export async function ingestText(
  text: string,
  opts?: { kind?: "memory" | "action"; ttlHours?: number },
): Promise<IngestResult> {
  return tracked(
    (async () => {
      const res = await fetch(`${API}/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, ...opts }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Ingest failed (${res.status})`);
      }
      return res.json() as Promise<IngestResult>;
    })(),
  );
}

export async function search(q: string): Promise<SearchHit[]> {
  try {
    const res = await fetch(`${API}/search?q=${encodeURIComponent(q)}`);
    const d = await res.json().catch(() => []);
    return Array.isArray(d) ? d : [];
  } catch {
    return [];
  }
}

/** Ask the AI to piece a memory + its connections into a fresh insight. */
export async function synthesizeNode(id: number): Promise<{ text: string; connected: number }> {
  return tracked(
    (async () => {
      const res = await fetch(`${API}/nodes/${id}/synthesize`, { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Synthesis failed (${res.status})`);
      }
      return res.json() as Promise<{ text: string; connected: number }>;
    })(),
  );
}

/** Manually set a memory's weight (0..1), or null to reset to the auto rating. */
export async function setImportance(id: number, importance: number | null): Promise<GraphNode> {
  const res = await fetch(`${API}/nodes/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ importance }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Update failed (${res.status})`);
  }
  return res.json() as Promise<GraphNode>;
}

/** Permanently delete a memory. */
export async function deleteNode(id: number): Promise<void> {
  const res = await fetch(`${API}/nodes/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Delete failed (${res.status})`);
  }
}

export async function getNeighbors(id: number, depth = 2): Promise<GraphData> {
  try {
    const res = await fetch(`${API}/nodes/${id}/neighbors?depth=${depth}`);
    const d = (await res.json().catch(() => null)) as Partial<GraphData> | null;
    return {
      nodes: Array.isArray(d?.nodes) ? d!.nodes! : [],
      links: Array.isArray(d?.links) ? d!.links! : [],
    };
  } catch {
    return { nodes: [], links: [] };
  }
}

export async function getHealth(): Promise<Health> {
  const res = await fetch(`${API}/health`);
  return res.json() as Promise<Health>;
}

export async function getDigest(): Promise<Insight[]> {
  try {
    const res = await fetch(`${API}/digest`);
    const d = await res.json().catch(() => []);
    return Array.isArray(d) ? d : [];
  } catch {
    return [];
  }
}

/** Soumaya's daily digest (free, no LLM). Returns a safe empty shape on error. */
export async function getDailyDigest(): Promise<DailyDigest> {
  const empty: DailyDigest = {
    date: new Date().toISOString().slice(0, 10),
    greeting: "",
    fresh: [],
    connections: [],
    expiredActions: [],
    closing: "",
  };
  try {
    const res = await fetch(`${API}/digest/daily`);
    const d = await res.json().catch(() => null);
    if (!d || typeof d !== "object") return empty;
    return {
      date: typeof d.date === "string" ? d.date : empty.date,
      greeting: typeof d.greeting === "string" ? d.greeting : "",
      fresh: Array.isArray(d.fresh) ? d.fresh : [],
      connections: Array.isArray(d.connections) ? d.connections : [],
      expiredActions: Array.isArray(d.expiredActions) ? d.expiredActions : [],
      closing: typeof d.closing === "string" ? d.closing : "",
    };
  } catch {
    return empty;
  }
}

export async function runDigest(): Promise<Insight[]> {
  return tracked(
    (async () => {
      try {
        const res = await fetch(`${API}/digest/run`, { method: "POST" });
        const d = await res.json().catch(() => []);
        return Array.isArray(d) ? d : [];
      } catch {
        return [];
      }
    })(),
  );
}

export async function askChat(question: string): Promise<ChatResponse> {
  return tracked(
    (async () => {
      const res = await fetch(`${API}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      return res.json() as Promise<ChatResponse>;
    })(),
  );
}

export interface MaintenanceJob {
  type: "synthesis" | "calibration" | "patrol";
  targets: number[];
  description: string;
}

export async function getNextMaintenanceJob(): Promise<MaintenanceJob> {
  const res = await fetch(`${API}/maintenance/next-job`);
  if (!res.ok) throw new Error("No maintenance jobs available");
  return res.json() as Promise<MaintenanceJob>;
}

export async function completeMaintenanceJob(type: string, targets: number[]): Promise<{ ok: boolean }> {
  const res = await fetch(`${API}/maintenance/complete-job`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, targets }),
  });
  return res.json() as Promise<{ ok: boolean }>;
}

export interface AgentLog {
  id: number;
  agent: string;
  action: string;
  description: string;
  targets: string;
  createdAt: string;
}

export async function getAgentLogs(): Promise<AgentLog[]> {
  try {
    const res = await fetch(`${API}/maintenance/logs`);
    const d = await res.json().catch(() => []);
    return Array.isArray(d) ? d : [];
  } catch {
    return [];
  }
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  estCostUsd: number;
  budgetUsd: number;
  remainingUsd: number;
  fractionUsed: number;
  overBudget: boolean;
  low: boolean;
}

export async function getUsage(): Promise<Usage | null> {
  try {
    const res = await fetch(`${API}/usage`);
    return res.ok ? ((await res.json()) as Usage) : null;
  } catch {
    return null;
  }
}

export async function setBudget(budget: number): Promise<Usage | null> {
  try {
    const res = await fetch(`${API}/usage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ budget }),
    });
    return res.ok ? ((await res.json()) as Usage) : null;
  } catch {
    return null;
  }
}

export async function resetUsage(): Promise<Usage | null> {
  try {
    const res = await fetch(`${API}/usage/reset`, { method: "POST" });
    return res.ok ? ((await res.json()) as Usage) : null;
  } catch {
    return null;
  }
}

export async function getSettings(): Promise<Record<string, string>> {
  try {
    const res = await fetch(`${API}/maintenance/settings`);
    const d = await res.json().catch(() => ({}));
    return d && typeof d === "object" && !Array.isArray(d) ? d : {};
  } catch {
    return {};
  }
}

export async function updateSetting(key: string, value: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${API}/maintenance/settings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, value }),
  });
  return res.json() as Promise<{ ok: boolean }>;
}
