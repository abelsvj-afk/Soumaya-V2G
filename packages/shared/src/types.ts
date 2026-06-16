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
  createdAt: string;
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
}

export interface DailyLog {
  id: number;
  content: string;
  date: string;
  createdAt: string;
}
