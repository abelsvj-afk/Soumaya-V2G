import type { ChatResponse, Constellation, DailyDigest, Fuel, GraphData, GraphNode, Insight, LoreEntry, LoreSubjectType } from "@brain/shared";
import { useState, useEffect } from "react";

const API = "/api";

// --- Node processing state tracking ("Writing..." latency feedback) ---
const processingNodes = new Set<number>();
const nodeProcessingListeners = new Set<(nodes: Set<number>) => void>();

export function isNodeProcessing(id: number): boolean {
  return processingNodes.has(id);
}

export function onNodeProcessingChange(cb: (nodes: Set<number>) => void): () => void {
  nodeProcessingListeners.add(cb);
  cb(new Set(processingNodes));
  return () => nodeProcessingListeners.delete(cb);
}

export function useProcessingNodes(): Set<number> {
  const [processing, setProcessing] = useState<Set<number>>(new Set(processingNodes));
  useEffect(() => {
    return onNodeProcessingChange(setProcessing);
  }, []);
  return processing;
}

function setNodeProcessing(ids: number[], active: boolean): void {
  for (const id of ids) {
    if (active) processingNodes.add(id);
    else processingNodes.delete(id);
  }
  for (const l of nodeProcessingListeners) {
    try {
      l(new Set(processingNodes));
    } catch (e) {
      console.error(e);
    }
  }
}

// The space id is the secret key to a private brain. We keep it in localStorage
// so it persists on this device, and send it on every API call.
const SPACE_KEY = "brain.spaceId";
const SPACE_NAME_KEY = "brain.spaceName";

export function getSpaceId(): string | null {
  try {
    return localStorage.getItem(SPACE_KEY);
  } catch {
    return null;
  }
}
export function getSpaceName(): string | null {
  try {
    return localStorage.getItem(SPACE_NAME_KEY);
  } catch {
    return null;
  }
}
function storeSpace(id: string | null, name?: string): void {
  try {
    if (id) {
      localStorage.setItem(SPACE_KEY, id);
      if (name) localStorage.setItem(SPACE_NAME_KEY, name);
    } else {
      localStorage.removeItem(SPACE_KEY);
      localStorage.removeItem(SPACE_NAME_KEY);
    }
  } catch {
    /* storage may be unavailable (private mode) — auth still works in-session */
  }
}

/** fetch wrapper that attaches the current brain's id to every request. */
function afetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const id = getSpaceId();
  if (id) headers.set("x-space-id", id);
  return fetch(path, { ...init, headers });
}

export interface AuthResult {
  id: string;
  name: string;
  created: boolean;
}

/** Open a brain (log in) or create one. Persists the id on success. */
export async function authSpace(name: string, passcode: string): Promise<AuthResult> {
  const res = await afetch(`${API}/space/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, passcode }),
  });
  const body = (await res.json().catch(() => ({}))) as Partial<AuthResult> & { error?: string };
  if (!res.ok || !body.id) {
    throw new Error(body.error ?? `Couldn't open that brain (${res.status})`);
  }
  storeSpace(body.id, body.name);
  return { id: body.id, name: body.name ?? name, created: !!body.created };
}

/** Validate the stored id against the server; returns the brain or null. */
export async function currentSpace(): Promise<{ id: string; name: string } | null> {
  if (!getSpaceId()) return null;
  try {
    const res = await afetch(`${API}/space/me`);
    if (!res.ok) return null;
    const body = (await res.json()) as { id: string; name: string };
    storeSpace(body.id, body.name);
    return body;
  } catch {
    return null;
  }
}

export function logoutSpace(): void {
  storeSpace(null);
}

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
  /** Fuel earned by this ingest (memory + links). */
  fuelEarned?: number;
  /** The brain's fuel after earning. */
  fuel?: Fuel;
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
    const res = await afetch(`${API}/graph?limit=${limit}`);
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
  opts?: {
    kind?: "memory" | "action";
    ttlHours?: number;
    occurredAt?: string;
    remindAt?: string;
    tags?: string[];
  },
): Promise<IngestResult> {
  return tracked(
    (async () => {
      const res = await afetch(`${API}/ingest`, {
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
    const res = await afetch(`${API}/search?q=${encodeURIComponent(q)}`);
    const d = await res.json().catch(() => []);
    return Array.isArray(d) ? d : [];
  } catch {
    return [];
  }
}

/** Ask the AI to piece a memory + its connections into a fresh insight. */
export async function synthesizeNode(id: number): Promise<{ text: string; connected: number }> {
  setNodeProcessing([id], true);
  try {
    return await tracked(
      (async () => {
        const res = await afetch(`${API}/nodes/${id}/synthesize`, { method: "POST" });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `Synthesis failed (${res.status})`);
        }
        return res.json() as Promise<{ text: string; connected: number }>;
      })(),
    );
  } finally {
    setNodeProcessing([id], false);
  }
}

/** Manually set a memory's weight (0..1), or null to reset to the auto rating. */
export async function setImportance(id: number, importance: number | null): Promise<GraphNode> {
  const res = await afetch(`${API}/nodes/${id}`, {
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
  const res = await afetch(`${API}/nodes/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Delete failed (${res.status})`);
  }
}

/** An object's evolving lore (oldest → newest); genesis is created on first read. */
export async function getLore(subjectType: LoreSubjectType, subjectId: string): Promise<LoreEntry[]> {
  try {
    const res = await afetch(`${API}/lore/${subjectType}/${encodeURIComponent(subjectId)}`);
    const d = await res.json().catch(() => []);
    return Array.isArray(d) ? (d as LoreEntry[]) : [];
  } catch {
    return [];
  }
}

/** Append the next lore chapter; returns the full updated history. */
export async function evolveLore(
  subjectType: LoreSubjectType,
  subjectId: string,
): Promise<LoreEntry[]> {
  const res = await afetch(`${API}/lore/${subjectType}/${encodeURIComponent(subjectId)}/evolve`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`Evolve failed (${res.status})`);
  const d = (await res.json()) as { history: LoreEntry[] };
  return d.history;
}

export async function getNeighbors(id: number, depth = 2): Promise<GraphData> {
  try {
    const res = await afetch(`${API}/nodes/${id}/neighbors?depth=${depth}`);
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
  const res = await afetch(`${API}/health`);
  return res.json() as Promise<Health>;
}

export async function getDigest(): Promise<Insight[]> {
  try {
    const res = await afetch(`${API}/digest`);
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
    cooling: [],
    closing: "",
  };
  try {
    const res = await afetch(`${API}/digest/daily`);
    const d = await res.json().catch(() => null);
    if (!d || typeof d !== "object") return empty;
    return {
      date: typeof d.date === "string" ? d.date : empty.date,
      greeting: typeof d.greeting === "string" ? d.greeting : "",
      fresh: Array.isArray(d.fresh) ? d.fresh : [],
      connections: Array.isArray(d.connections) ? d.connections : [],
      expiredActions: Array.isArray(d.expiredActions) ? d.expiredActions : [],
      cooling: Array.isArray(d.cooling) ? d.cooling : [],
      closing: typeof d.closing === "string" ? d.closing : "",
    };
  } catch {
    return empty;
  }
}

/** This brain's Celestial Economy fuel (free, space-scoped). */
export async function getFuel(): Promise<Fuel | null> {
  try {
    const res = await afetch(`${API}/maintenance/fuel`);
    if (!res.ok) return null;
    const d = await res.json().catch(() => null);
    return d && typeof d.fuel === "number" ? (d as Fuel) : null;
  } catch {
    return null;
  }
}

/** "Tend" a memory (reset its entropy) — called when you focus it. Fire-and-forget. */
export async function tendNode(id: number): Promise<void> {
  try {
    await afetch(`${API}/nodes/${id}/tend`, { method: "POST" });
  } catch {
    /* best-effort */
  }
}

/** ML constellations (k-means over embeddings). Safe array on error. */
export async function getConstellations(): Promise<Constellation[]> {
  try {
    const res = await afetch(`${API}/constellations`);
    const d = await res.json().catch(() => []);
    return Array.isArray(d) ? d : [];
  } catch {
    return [];
  }
}

export async function runDigest(): Promise<Insight[]> {
  return tracked(
    (async () => {
      try {
        const res = await afetch(`${API}/digest/run`, { method: "POST" });
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
      const res = await afetch(`${API}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      return res.json() as Promise<ChatResponse>;
    })(),
  );
}

export interface JobRationale {
  objective: string;
  why: string;
  benefit: string;
}

export interface MaintenanceJob {
  type: "synthesis" | "calibration" | "patrol";
  targets: number[];
  description: string;
  rationale?: JobRationale;
}

export async function getNextMaintenanceJob(): Promise<MaintenanceJob> {
  const res = await afetch(`${API}/maintenance/next-job`);
  if (!res.ok) throw new Error("No maintenance jobs available");
  return res.json() as Promise<MaintenanceJob>;
}

export async function completeMaintenanceJob(type: string, targets: number[]): Promise<{ ok: boolean }> {
  setNodeProcessing(targets, true);
  try {
    const res = await afetch(`${API}/maintenance/complete-job`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, targets }),
    });
    return await res.json() as Promise<{ ok: boolean }>;
  } finally {
    setNodeProcessing(targets, false);
  }
}

export interface AgentLog {
  id: number;
  agent: string;
  action: string;
  description: string;
  targets: string;
  /** JSON-encoded JobRationale (objective/why/benefit) — her decision breakdown. */
  result?: string | null;
  createdAt: string;
}

export async function getAgentLogs(): Promise<AgentLog[]> {
  try {
    const res = await afetch(`${API}/maintenance/logs`);
    const d = await res.json().catch(() => []);
    return Array.isArray(d) ? d : [];
  } catch {
    return [];
  }
}

export interface DailyLog {
  id: number;
  content: string;
  date: string;
}

/** Most recent Captain's Log for this brain (space-scoped). null if none yet. */
export async function getDailyLog(): Promise<DailyLog | null> {
  try {
    const res = await afetch(`${API}/maintenance/daily-log`);
    if (!res.ok) return null;
    const d = await res.json().catch(() => null);
    return d && typeof d === "object" && typeof d.content === "string" ? (d as DailyLog) : null;
  } catch {
    return null;
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
    const res = await afetch(`${API}/usage`);
    return res.ok ? ((await res.json()) as Usage) : null;
  } catch {
    return null;
  }
}

export async function setBudget(budget: number): Promise<Usage | null> {
  try {
    const res = await afetch(`${API}/usage`, {
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
    const res = await afetch(`${API}/usage/reset`, { method: "POST" });
    return res.ok ? ((await res.json()) as Usage) : null;
  } catch {
    return null;
  }
}

export async function getSettings(): Promise<Record<string, string>> {
  try {
    const res = await afetch(`${API}/maintenance/settings`);
    const d = await res.json().catch(() => ({}));
    return d && typeof d === "object" && !Array.isArray(d) ? d : {};
  } catch {
    return {};
  }
}

export async function updateSetting(key: string, value: string): Promise<{ ok: boolean }> {
  const res = await afetch(`${API}/maintenance/settings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, value }),
  });
  return res.json() as Promise<{ ok: boolean }>;
}

// --- AI Companion: persona ("About Me"), instruction profiles, knowledge docs ---

// "About Me" is auto-derived by Soumaya (not user-editable). GET returns the
// current (re-derived if stale); refresh forces a regeneration.
export async function getPersona(): Promise<string> {
  try {
    const res = await afetch(`${API}/persona`);
    const d = (await res.json().catch(() => ({}))) as { body?: string };
    return d.body ?? "";
  } catch {
    return "";
  }
}

export async function refreshPersona(): Promise<string> {
  try {
    const res = await afetch(`${API}/persona/refresh`, { method: "POST" });
    const d = (await res.json().catch(() => ({}))) as { body?: string };
    return d.body ?? "";
  } catch {
    return "";
  }
}

export interface InstructionProfile {
  id: number;
  name: string;
  body: string;
  enabled: boolean;
  mode: "always" | "auto";
  priority: number;
  createdAt: string;
}

export async function getInstructions(): Promise<InstructionProfile[]> {
  try {
    const res = await afetch(`${API}/instructions`);
    const d = await res.json().catch(() => []);
    return Array.isArray(d) ? (d as InstructionProfile[]) : [];
  } catch {
    return [];
  }
}

export async function createInstruction(input: {
  name: string;
  body: string;
  mode?: "always" | "auto";
  priority?: number;
}): Promise<InstructionProfile> {
  const res = await afetch(`${API}/instructions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const b = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(b.error ?? `Create failed (${res.status})`);
  }
  return res.json() as Promise<InstructionProfile>;
}

export async function updateInstruction(
  id: number,
  patch: Partial<Pick<InstructionProfile, "name" | "body" | "enabled" | "mode" | "priority">>,
): Promise<InstructionProfile> {
  const res = await afetch(`${API}/instructions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const b = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(b.error ?? `Update failed (${res.status})`);
  }
  return res.json() as Promise<InstructionProfile>;
}

export async function deleteInstruction(id: number): Promise<void> {
  await afetch(`${API}/instructions/${id}`, { method: "DELETE" });
}

export interface KnowledgeDoc {
  id: number;
  name: string;
  mime: string;
  charCount: number;
  chunks?: number;
  createdAt: string;
}

export async function getDocuments(): Promise<KnowledgeDoc[]> {
  try {
    const res = await afetch(`${API}/documents`);
    const d = await res.json().catch(() => []);
    return Array.isArray(d) ? (d as KnowledgeDoc[]) : [];
  } catch {
    return [];
  }
}

export async function uploadDocument(name: string, text: string, mime?: string): Promise<KnowledgeDoc> {
  return tracked(
    (async () => {
      const res = await afetch(`${API}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, text, mime }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(b.error ?? `Upload failed (${res.status})`);
      }
      return res.json() as Promise<KnowledgeDoc>;
    })(),
  );
}

export async function renameDocument(id: number, name: string): Promise<void> {
  await afetch(`${API}/documents/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

export async function deleteDocument(id: number): Promise<void> {
  await afetch(`${API}/documents/${id}`, { method: "DELETE" });
}

// --- Visitor activity ---

export interface VisitedMemory {
  nodeId: number;
  label: string;
  type: string;
  visits: number;
  visitorTypes: string[];
  lastAt: string;
}

/** Report a batch of visitor arrivals (fire-and-forget; never throws/badges). */
export function logVisits(events: { nodeId: number; type: string }[]): void {
  if (events.length === 0) return;
  void afetch(`${API}/visitors/log`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ events }),
  }).catch(() => {});
}

export async function getVisitorActivity(): Promise<VisitedMemory[]> {
  try {
    const res = await afetch(`${API}/visitors`);
    const d = await res.json().catch(() => []);
    return Array.isArray(d) ? (d as VisitedMemory[]) : [];
  } catch {
    return [];
  }
}
