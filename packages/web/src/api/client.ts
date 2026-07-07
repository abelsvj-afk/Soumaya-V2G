import type { Attachment, AwayDigest, ChatResponse, Constellation, DailyDigest, DormantItem, EmotionalTrajectory, EvolutionLink, Fuel, GraphData, GraphNode, Insight, LifeAreaCount, LoreEntry, LoreSubjectType, SelfReviewItem, Streak } from "@brain/shared";
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
export async function authSpace(gamerTag: string, passcode: string, name?: string): Promise<AuthResult> {
  const res = await afetch(`${API}/space/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gamerTag, passcode, name }),
  });
  const body = (await res.json().catch(() => ({}))) as Partial<AuthResult> & { error?: string };
  if (!res.ok || !body.id) {
    throw new Error(body.error ?? `Couldn't open that brain (${res.status})`);
  }
  storeSpace(body.id, body.name);
  return { id: body.id, name: body.name ?? name ?? gamerTag, created: !!body.created };
}

/** Validate the stored id against the server; returns the brain or null. */
export async function currentSpace(): Promise<{ id: string; name: string; gamerTag?: string } | null> {
  if (!getSpaceId()) return null;
  try {
    const res = await afetch(`${API}/space/me`);
    if (!res.ok) return null;
    const body = (await res.json()) as { id: string; name: string; gamerTag?: string };
    storeSpace(body.id, body.name);
    return body;
  } catch {
    return null;
  }
}

export function logoutSpace(): void {
  storeSpace(null);
}

/** Update this brain's gamer tag and/or display name (tag stays unique). */
export async function updateProfile(opts: { gamerTag?: string; name?: string }): Promise<{ id: string; name: string; gamerTag: string }> {
  const res = await afetch(`${API}/space/profile`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts),
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; name?: string; gamerTag?: string; error?: string };
  if (!res.ok || !body.id) throw new Error(body.error ?? `Couldn't update profile (${res.status})`);
  storeSpace(body.id, body.name); // keep the cached name in sync
  return { id: body.id, name: body.name ?? "", gamerTag: body.gamerTag ?? "" };
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

type IngestOpts = {
  kind?: "memory" | "action";
  ttlHours?: number;
  occurredAt?: string;
  remindAt?: string;
  tags?: string[];
};

/** localStorage queue of ingests captured while offline, scoped to the active brain.
 *  Returns null when no brain is signed in — we never queue under a shared "default"
 *  bucket, which could later sync a note into the wrong brain. */
const ingestQueueKey = (): string | null => {
  const id = getSpaceId();
  return id ? `brain.ingestQueue.${id}` : null;
};

/** Thrown when an ingest is saved offline instead of reaching the server. */
export class OfflineQueuedError extends Error {
  constructor() {
    super("You're offline — saved. I'll sync it the moment you're back online.");
    this.name = "OfflineQueuedError";
  }
}

function enqueueIngest(text: string, opts?: IngestOpts): void {
  try {
    const key = ingestQueueKey();
    if (!key) return; // no brain signed in — don't stash an unattributable note
    const q = JSON.parse(localStorage.getItem(key) || "[]") as { text: string; opts?: IngestOpts }[];
    q.push({ text, opts });
    localStorage.setItem(key, JSON.stringify(q.slice(-200)));
  } catch {
    /* storage unavailable — nothing more we can do */
  }
}

/**
 * Drain the offline ingest queue, POSTing each saved thought. Dispatches
 * "brain-ingest-synced" (with the new node ids) so the app can refresh + celebrate.
 * Safe to call repeatedly; re-queues anything that still fails.
 */
export async function flushIngestQueue(): Promise<number> {
  const key = ingestQueueKey();
  if (!key) return 0; // no brain signed in
  let q: { text: string; opts?: IngestOpts }[];
  try {
    q = JSON.parse(localStorage.getItem(key) || "[]");
  } catch {
    return 0;
  }
  if (!q.length || (typeof navigator !== "undefined" && navigator.onLine === false)) return 0;
  const remaining: typeof q = [];
  const newIds: number[] = [];
  for (const item of q) {
    try {
      const res = await afetch(`${API}/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: item.text, ...item.opts }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const r = (await res.json()) as IngestResult;
      for (const n of r.nodes) newIds.push(n.id);
    } catch {
      remaining.push(item); // still failing — keep it for the next flush
    }
  }
  try {
    localStorage.setItem(key, JSON.stringify(remaining));
  } catch {
    /* ignore */
  }
  const synced = q.length - remaining.length;
  if (synced > 0 && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("brain-ingest-synced", { detail: { newIds, synced } }));
  }
  return synced;
}

// Auto-flush whenever connectivity returns.
if (typeof window !== "undefined") {
  window.addEventListener("online", () => void flushIngestQueue());
}

export async function ingestText(text: string, opts?: IngestOpts): Promise<IngestResult> {
  return tracked(
    (async () => {
      // Offline up front → queue immediately, don't even try the network.
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        enqueueIngest(text, opts);
        throw new OfflineQueuedError();
      }
      let res: Response;
      try {
        res = await afetch(`${API}/ingest`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, ...opts }),
        });
      } catch {
        // Network blip mid-request → save it for the next flush.
        enqueueIngest(text, opts);
        throw new OfflineQueuedError();
      }
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
    reminders: [],
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
      reminders: Array.isArray(d.reminders) ? d.reminders : [],
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

/** This brain's daily-tending streak (consecutive days fed a memory). */
export async function getStreak(): Promise<Streak | null> {
  try {
    const res = await afetch(`${API}/maintenance/streak`);
    if (!res.ok) return null;
    const d = await res.json().catch(() => null);
    return d && typeof d.current === "number" ? (d as Streak) : null;
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

/** Ask Soumaya to prioritize tending this memory on her next round. Best-effort. */
export async function requestMaintenance(id: number): Promise<boolean> {
  try {
    const res = await afetch(`${API}/nodes/${id}/request-maintenance`, { method: "POST" });
    return res.ok;
  } catch {
    return false;
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

/** Promote a detected cluster into a persistent, named constellation hub (MOC). */
export async function promoteConstellation(name: string, nodeIds: number[]): Promise<GraphNode | null> {
  try {
    const res = await afetch(`${API}/constellations/promote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, nodeIds }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? `Couldn't create constellation (${res.status})`);
    }
    return (await res.json()) as GraphNode;
  } catch {
    return null;
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

/** Claim the one-time fuel reward for discovering a Codex entry (idempotent server-side). */
export async function claimCodexReward(key: string): Promise<{ awarded: boolean; fuel?: number }> {
  try {
    const res = await afetch(`${API}/maintenance/codex-claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    });
    if (!res.ok) return { awarded: false };
    return (await res.json()) as { awarded: boolean; fuel?: number };
  } catch {
    return { awarded: false };
  }
}

/** Mood-over-time trajectory + detected emotional patterns (free, offline-safe). */
export async function getEmotionalTrajectory(): Promise<EmotionalTrajectory> {
  const empty: EmotionalTrajectory = {
    points: [],
    trend: "steady",
    average: 0,
    volatility: 0,
    patterns: [],
    sampleSize: 0,
  };
  try {
    const res = await afetch(`${API}/digest/emotional`);
    const d = await res.json().catch(() => null);
    if (!d || typeof d !== "object") return empty;
    return {
      points: Array.isArray(d.points) ? d.points : [],
      trend: d.trend === "rising" || d.trend === "falling" ? d.trend : "steady",
      average: typeof d.average === "number" ? d.average : 0,
      volatility: typeof d.volatility === "number" ? d.volatility : 0,
      patterns: Array.isArray(d.patterns) ? d.patterns : [],
      sampleSize: typeof d.sampleSize === "number" ? d.sampleSize : 0,
    };
  } catch {
    return empty;
  }
}

/** Distribution of memories across life-areas — the optional life-area lens (#6). */
export async function getLifeAreas(): Promise<LifeAreaCount[]> {
  try {
    const res = await afetch(`${API}/digest/life-areas`);
    const d = await res.json().catch(() => []);
    return Array.isArray(d) ? d : [];
  } catch {
    return [];
  }
}

/** "While you were away" digest — what changed since your last visit. */
export async function getAwayDigest(): Promise<AwayDigest | null> {
  try {
    const res = await afetch(`${API}/digest/away`);
    const d = await res.json().catch(() => null);
    return d && typeof d === "object" ? (d as AwayDigest) : null;
  } catch {
    return null;
  }
}

/** Advance the "last visit" window to now (after showing / skipping the welcome-back card). */
export async function markAwaySeen(): Promise<void> {
  try {
    await afetch(`${API}/digest/away/seen`, { method: "POST" });
  } catch {
    /* best-effort */
  }
}

/** Soumaya's read-only coverage self-check (#12). */
export async function getSelfReview(): Promise<SelfReviewItem[]> {
  try {
    const res = await afetch(`${API}/digest/self-review`);
    const d = await res.json().catch(() => []);
    return Array.isArray(d) ? d : [];
  } catch {
    return [];
  }
}

/** How threads of thinking evolved over time (older → newer, free, offline-safe). */
export async function getEvolutionLinks(): Promise<EvolutionLink[]> {
  try {
    const res = await afetch(`${API}/digest/evolution`);
    const d = await res.json().catch(() => []);
    return Array.isArray(d) ? d : [];
  } catch {
    return [];
  }
}

/** Files attached to a memory note (metadata only). */
export async function listAttachments(nodeId: number): Promise<Attachment[]> {
  try {
    const res = await afetch(`${API}/nodes/${nodeId}/attachments`);
    const d = await res.json().catch(() => []);
    return Array.isArray(d) ? d : [];
  } catch {
    return [];
  }
}

/** Attach a file (read as base64) to a memory note. Returns the metadata or throws. */
export async function addAttachment(
  nodeId: number,
  file: { filename: string; mime: string; data: string },
): Promise<Attachment> {
  const res = await afetch(`${API}/nodes/${nodeId}/attachments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(file),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Upload failed (${res.status})`);
  }
  return res.json() as Promise<Attachment>;
}

export async function deleteAttachment(nodeId: number, attId: number): Promise<boolean> {
  try {
    const res = await afetch(`${API}/nodes/${nodeId}/attachments/${attId}`, { method: "DELETE" });
    return res.ok;
  } catch {
    return false;
  }
}

/** Download an attachment's bytes (sends the auth header, then triggers a save). */
export async function downloadAttachment(att: Attachment): Promise<void> {
  const res = await afetch(`${API}/nodes/${att.nodeId}/attachments/${att.id}/download`);
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = att.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Dormant skills/goals/projects worth reviving (free, offline-safe). */
export async function getDormant(): Promise<DormantItem[]> {
  try {
    const res = await afetch(`${API}/digest/dormant`);
    const d = await res.json().catch(() => []);
    return Array.isArray(d) ? d : [];
  } catch {
    return [];
  }
}

/** Scan same-topic memories for contradictions (changed beliefs / reversed goals). */
export async function runContradictions(): Promise<Insight[]> {
  return tracked(
    (async () => {
      try {
        const res = await afetch(`${API}/digest/contradictions`, { method: "POST" });
        const d = await res.json().catch(() => []);
        return Array.isArray(d) ? d : [];
      } catch {
        return [];
      }
    })(),
  );
}

export async function askChat(
  question: string,
  /** Recent turns (oldest first) so she carries the conversation thread. */
  history: { role: "you" | "soumaya"; text: string }[] = [],
): Promise<ChatResponse> {
  return tracked(
    (async () => {
      const res = await afetch(`${API}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, history: history.slice(-8) }),
      });
      return res.json() as Promise<ChatResponse>;
    })(),
  );
}

/** A cognitive object (goal/idea/skill/identity/…) — the cognitive layer. */
export interface CognitiveItem {
  id: number;
  kind: string;
  label: string;
  content: string;
  progress: number | null;
  degree: number;
  createdAt: string;
}
export async function getCognitive(kind?: string): Promise<CognitiveItem[]> {
  try {
    const res = await afetch(`${API}/cognitive${kind ? `?kind=${encodeURIComponent(kind)}` : ""}`);
    const d = await res.json().catch(() => []);
    return Array.isArray(d) ? d : [];
  } catch {
    return [];
  }
}
export async function createCognitive(kind: string, label: string, content?: string): Promise<{ id: number } | null> {
  try {
    const res = await afetch(`${API}/cognitive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, label, content }),
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}
export async function setCognitiveProgress(id: number, value: number): Promise<boolean> {
  try {
    const res = await afetch(`${API}/cognitive/${id}/progress`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
export async function updateCognitive(id: number, patch: { label?: string; content?: string }): Promise<boolean> {
  try {
    const res = await afetch(`${API}/cognitive/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ── Inquiries: connections Soumaya noticed and wants to ask about ─────────────
export interface Inquiry {
  id: number;
  question: string;
  kind: string;
  nodes: { id: number; label: string }[];
  createdAt: string;
}
export async function getInquiries(): Promise<Inquiry[]> {
  try {
    const res = await afetch(`${API}/inquiries`);
    const d = await res.json().catch(() => []);
    return Array.isArray(d) ? d : [];
  } catch {
    return [];
  }
}
export async function answerInquiry(id: number, text: string): Promise<{ nodeIds: number[]; fuelEarned: number } | null> {
  try {
    const res = await afetch(`${API}/inquiries/${id}/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}
export async function dismissInquiry(id: number): Promise<boolean> {
  try {
    const res = await afetch(`${API}/inquiries/${id}/dismiss`, { method: "POST" });
    return res.ok;
  } catch {
    return false;
  }
}

// ── Working Memory (Cognitive Layer Phase 2): the ephemeral "mind space" ──────
export interface Thought {
  id: number;
  text: string;
  source: string;
  strength: number; // effective (decayed) 0..1
  reinforceCount: number;
  createdAt: string;
}
export async function getThoughts(): Promise<Thought[]> {
  try {
    const res = await afetch(`${API}/working`);
    const d = await res.json().catch(() => []);
    return Array.isArray(d) ? d : [];
  } catch {
    return [];
  }
}
export async function addThought(text: string, source?: string): Promise<{ id: number } | null> {
  try {
    const res = await afetch(`${API}/working`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, source }),
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}
export async function reinforceThought(id: number): Promise<{ promotedNodeId: number | null } | null> {
  try {
    const res = await afetch(`${API}/working/${id}/reinforce`, { method: "POST" });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}
export async function promoteThought(id: number): Promise<{ nodeId: number } | null> {
  try {
    const res = await afetch(`${API}/working/${id}/promote`, { method: "POST" });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}
export async function dismissThought(id: number): Promise<boolean> {
  try {
    const res = await afetch(`${API}/working/${id}`, { method: "DELETE" });
    return res.ok;
  } catch {
    return false;
  }
}
export async function editThought(id: number, text: string): Promise<boolean> {
  try {
    const res = await afetch(`${API}/working/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Her current multi-day undertaking (arc), or null. */
export interface Undertaking {
  id: number;
  kind: string;
  title: string;
  total: number;
  done: number;
  status: "active" | "done";
  startedAt: string;
  endsAt: string | null;
}
export async function getUndertaking(): Promise<Undertaking | null> {
  try {
    const res = await afetch(`${API}/maintenance/undertaking`);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/** A belief she's consolidated about you (dream cycles). */
export interface Belief {
  id: number;
  content: string;
  createdAt: string;
  evidence: number;
}
export async function getBeliefs(): Promise<Belief[]> {
  try {
    const res = await afetch(`${API}/digest/beliefs`);
    const d = await res.json().catch(() => []);
    return Array.isArray(d) ? d : [];
  } catch {
    return [];
  }
}

/** Acknowledge a due reminder (clears remind_at so it stops re-surfacing). */
export async function ackReminder(id: number): Promise<boolean> {
  try {
    const res = await afetch(`${API}/nodes/${id}/ack-reminder`, { method: "POST" });
    return res.ok;
  } catch {
    return false;
  }
}

/** Resolve/dismiss a surfaced insight (reconciled contradiction, seen connection). */
export async function resolveInsight(id: number): Promise<boolean> {
  try {
    const res = await afetch(`${API}/digest/insights/${id}/resolve`, { method: "POST" });
    return res.ok;
  } catch {
    return false;
  }
}

/** The Daily Contact — her one question + discovery of the day. */
export interface DailyContact {
  date: string;
  question: {
    text: string;
    nodeId: number | null;
    nodeLabel: string | null;
    source: "research" | "contradiction" | "cooling" | "heavy";
  } | null;
  discovery: { text: string; nodeId: number | null } | null;
  foresight: { text: string; inDays: number } | null;
  answered: boolean;
}

export async function getDailyContact(): Promise<DailyContact | null> {
  try {
    const res = await afetch(`${API}/contact`);
    return res.ok ? ((await res.json()) as DailyContact) : null;
  } catch {
    return null;
  }
}

export async function answerDailyContact(
  text: string,
): Promise<{ nodeIds: number[]; fuelEarned: number; streakAdvanced: boolean } | null> {
  try {
    const res = await afetch(`${API}/contact/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/** Ask the server to distill a finished chat into 0–3 memory-worthy notes. */
export async function distillChat(messages: { role: "you" | "soumaya"; text: string }[]): Promise<string[]> {
  try {
    const res = await afetch(`${API}/chat/distill`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
    });
    const d = (await res.json().catch(() => ({}))) as { summaries?: string[] };
    return Array.isArray(d.summaries) ? d.summaries : [];
  } catch {
    return [];
  }
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

// Budget mutations are deployment-admin actions (the cap is shared by every brain),
// so the server fail-closes on them without the ADMIN_TOKEN secret. The token is
// remembered locally after the first successful use.
const ADMIN_TOKEN_KEY = "brain.adminToken";
export function getAdminToken(): string | null {
  try {
    return localStorage.getItem(ADMIN_TOKEN_KEY);
  } catch {
    return null;
  }
}
export function setAdminToken(token: string): void {
  try {
    localStorage.setItem(ADMIN_TOKEN_KEY, token);
  } catch {
    /* private-mode etc. */
  }
}

async function adminPost(path: string, body?: unknown): Promise<Usage | null> {
  try {
    const token = getAdminToken();
    const res = await afetch(`${API}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { "x-admin-token": token } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    return res.ok ? ((await res.json()) as Usage) : null;
  } catch {
    return null;
  }
}

export async function setBudget(budget: number): Promise<Usage | null> {
  return adminPost("/usage", { budget });
}

export async function resetUsage(): Promise<Usage | null> {
  return adminPost("/usage/reset");
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

/** Report a batch of visitor arrivals (fire-and-forget; never throws/badges).
 *  Pass `flush: true` from pagehide/backgrounding — `keepalive` lets the request
 *  outlive the page so the buffered tail isn't silently dropped on close. */
export function logVisits(events: { nodeId: number; type: string }[], flush = false): void {
  if (events.length === 0) return;
  void afetch(`${API}/visitors/log`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ events }),
    ...(flush ? { keepalive: true } : {}),
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

/** Submit answers to clarifying research questions. */
export async function answerResearch(id: number, answers: Record<string, string>): Promise<{ node: GraphNode }> {
  return tracked(
    (async () => {
      const res = await afetch(`${API}/nodes/${id}/answer-research`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Answering research failed (${res.status})`);
      }
      return res.json() as Promise<{ node: GraphNode }>;
    })()
  );
}
