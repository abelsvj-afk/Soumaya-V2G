/**
 * Core domain types shared between server and web.
 * These describe the knowledge graph as the frontend (react-force-graph-3d)
 * and the API consume it.
 */

export type NodeType =
  | "business_idea"
  | "relationship_reflection"
  | "random_thought"
  | "person"
  | "concept"
  | "other";

export type RelationshipType =
  | "resolves"
  | "complicates"
  | "is_analogous_to"
  | "builds_on"
  | "relates_to"
  | "contradicts"
  | "caused_by"
  | "documentation";

/** Convenience runtime lists (also exercised by the seed script). */
export const NODE_TYPES: readonly NodeType[] = [
  "business_idea",
  "relationship_reflection",
  "random_thought",
  "person",
  "concept",
  "other",
];

export const RELATIONSHIP_TYPES: readonly RelationshipType[] = [
  "resolves",
  "complicates",
  "is_analogous_to",
  "builds_on",
  "relates_to",
  "contradicts",
  "caused_by",
  "documentation",
];

export interface GraphNode {
  id: number;
  label: string;
  celestialTitle?: string;
  type: NodeType;
  content: string;
  /** -1 (negative) .. 1 (positive); optional, set by the LLM in Phase II. */
  emotionalWeight?: number;
  /** Hex or CSS color suggestion based on emotional resonance. */
  color?: string;
  /** 0..1 significance/seriousness/life-impact, rated at ingestion. */
  importance?: number;
  /** Connection count — enriched by the graph service on read. */
  degree?: number;
  /** 0..1 derived gravitational mass (deriveMass of the signals above). */
  mass?: number;
  /** Body class derived from mass — drives rendering (star/planet/moon). */
  celestial?: import("./celestial.js").CelestialClass;
  /** react-force-graph node size hint (mirrors mass). */
  val?: number;
  /** "action" = a day-to-day to-do that expires; otherwise a normal memory. */
  kind?: "memory" | "action";
  /** ISO timestamp when an action item times out (only for kind === "action"). */
  expiresAt?: string;
  /** ISO timestamp this memory was last "tended" (created/visited/edited/linked). */
  lastTendedAt?: string;
  /** 0..1 "coolness" from neglect — enriched on read (0 = freshly tended). */
  entropy?: number;
  /** Optional user-set date/time the memory's event actually happened (may be backdated). */
  occurredAt?: string;
  /** Optional user-set future reminder date/time to resurface this memory. */
  remindAt?: string;
  /** Free + curated labels for filtering/context (e.g. "Work", "Idea", "Anxious"). */
  tags?: string[];
  researchQuestions?: string[];
  researchAnswers?: Record<string, string>;
  createdAt: string;
}

/** Curated starter tags offered in the dump UI: a blend of life-areas + moods. */
export const SUGGESTED_TAGS: readonly string[] = [
  "Work",
  "Health",
  "Ideas",
  "People",
  "Money",
  "Learning",
  "Excited",
  "Anxious",
  "Grateful",
  "Urgent",
];

/** What a piece of lore is about: a memory body, or one of the agents/objects. */
export type LoreSubjectType = "memory" | "ship" | "station" | "beacon";

/**
 * A single saved "chapter" of an object's evolving lore. Lore is append-only and
 * versioned: v1 is the immutable genesis, later versions extend/mutate it as the
 * galaxy changes — so you can read how a memory's story grew over time.
 */
export interface LoreEntry {
  id: number;
  subjectType: LoreSubjectType;
  subjectId: string;
  version: number;
  text: string;
  /** What prompted this chapter: genesis | evolved | linked | merged | cooled | warmed | manual. */
  trigger: string;
  createdAt: string;
}

/** The brain's "fuel" — a free in-app energy that powers Soumaya's autonomy. */
export interface Fuel {
  /** Current fuel for this brain. */
  fuel: number;
  /** Soft ceiling fuel saturates at. */
  capacity: number;
  /** Cost the agent pays per autonomous LLM job. */
  jobCost: number;
}

export interface GraphEdge {
  id: number;
  source: number;
  target: number;
  relationship: RelationshipType;
  /** 0..1 link strength (e.g. derived from cosine similarity). */
  weight: number;
  createdAt: string;
}

/** Shape consumed directly by react-force-graph-3d. */
export interface GraphData {
  nodes: GraphNode[];
  links: GraphEdge[];
}

/** A lightweight node reference used in insights and chat citations. */
export interface NodeRef {
  id: number;
  label: string;
  type: NodeType;
}

/**
 * A "constellation" — a group of memories that an unsupervised model (k-means
 * over the embedding vectors) found to be naturally close in meaning. This is
 * the machine-learning organization layer: no labels, no API — the structure is
 * learned from the vectors themselves.
 */
export interface Constellation {
  id: number;
  /** Auto-derived name from the cluster's most distinctive vocabulary. */
  name: string;
  nodes: NodeRef[];
  /** Cohesion 0..1 (avg cosine of members to their centroid). */
  cohesion: number;
}

/** A synthesized cross-cluster insight (the "compounding memory" feature). */
export interface Insight {
  id: number;
  text: string;
  /** 0..1 — how strong/surprising the latent connection is. */
  score: number;
  createdAt: string;
  nodes: NodeRef[];
}

/** Answer from chat-with-your-brain (GraphRAG), with node citations. */
export interface ChatResponse {
  answer: string;
  citations: NodeRef[];
  /** Ids of the subgraph used as context (for camera/highlight). */
  contextIds: number[];
  /** Emotional delivery tone (drives her voice's prosody when speaking aloud). */
  tone?: import("./dramatize.js").EmotionalTone;
}

export interface DailyLog {
  id: number;
  content: string;
  date: string;
  createdAt: string;
}

/** A short, link-carrying entry in Soumaya's daily digest. */
export interface DigestEntry {
  node: NodeRef;
  /** One-line snippet of the memory. */
  snippet: string;
  /** Soumaya's short, in-character take on why it matters. */
  take: string;
}

/** An action item that timed out (cleared from the galaxy). */
export interface ExpiredAction {
  label: string;
  /** ISO timestamp it cleared. */
  clearedAt: string;
}

/**
 * Soumaya's daily digest — what she (the starpilot) thinks you should be caught
 * up on: fresh memories with her take + links, latent connections she surfaced,
 * and the day-to-day action items that timed out. Assembled server-side from
 * existing data with NO LLM call, so it's free and always available.
 */
export interface DailyDigest {
  date: string;
  /** In-character opening line. */
  greeting: string;
  /** Memories logged today (newest first), each with a link + her take. */
  fresh: DigestEntry[];
  /** Latent connections she surfaced (reuses the insight engine). */
  connections: Insight[];
  /** Action items that timed out, summarized. */
  expiredActions: ExpiredAction[];
  /** Memories cooling from neglect — revisit them to warm them back up. */
  cooling: { node: NodeRef; entropy: number }[];
  /** Closing reflection in her voice. */
  closing: string;
}
