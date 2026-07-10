/**
 * Core domain types shared between server and web.
 * These describe the knowledge graph as the frontend (react-force-graph-3d)
 * and the API consume it.
 */

/**
 * The "Wire the Brain" taxonomy — what a memory IS. CRM-flavored + link-first
 * (see docs/SECOND_BRAIN_ALIGNMENT.md). Legacy values (business_idea,
 * relationship_reflection, random_thought) are mapped onto these via
 * LEGACY_NODE_TYPE_ALIASES + normalizeNodeType, so existing galaxies stay
 * coherent without a data migration (node.type is free TEXT).
 */
export type NodeType =
  | "person"
  | "project"
  | "decision"
  | "company"
  | "meeting"
  | "daily"
  | "knowledge"
  | "concept"
  | "other"
  | "moc"; // a constellation hub (Map of Content) — structural, not LLM-extracted

/** Old stored type values → their canonical kind (display/classification only). */
export const LEGACY_NODE_TYPE_ALIASES: Record<string, NodeType> = {
  business_idea: "project",
  relationship_reflection: "person",
  random_thought: "daily",
};

/** Human label per kind (UI chips, legend). */
export const NODE_TYPE_LABEL: Record<NodeType, string> = {
  person: "Person",
  project: "Project",
  decision: "Decision",
  company: "Company",
  meeting: "Meeting",
  daily: "Daily",
  knowledge: "Knowledge",
  concept: "Concept",
  other: "Other",
  moc: "Constellation",
};

/** One-line guidance per kind — fed to the extraction prompt for classification. */
export const NODE_TYPE_GUIDE: Record<NodeType, string> = {
  person: "an individual — someone you know, met, or mentioned",
  company: "an organization, business, team, or institution",
  project: "an initiative or effort with an outcome (a venture, build, plan)",
  decision: "a choice made or being weighed, with its rationale",
  meeting: "a conversation, call, or sync at a point in time, involving people",
  daily: "a day-to-day note, journal entry, to-do, or fleeting thought",
  knowledge: "a reference fact, concept explainer, or learning worth keeping",
  concept: "an abstract idea, theme, or principle",
  other: "anything that fits none of the above",
  moc: "(structural hub — created by promotion, never extracted)",
};

/** Normalize any stored/raw type string to a canonical kind (legacy-tolerant). */
export function normalizeNodeType(raw: string | null | undefined): NodeType {
  if (!raw) return "other";
  if ((NODE_TYPES as readonly string[]).includes(raw)) return raw as NodeType;
  return LEGACY_NODE_TYPE_ALIASES[raw] ?? "other";
}

export type RelationshipType =
  | "resolves"
  | "complicates"
  | "is_analogous_to"
  | "builds_on"
  | "relates_to"
  | "contradicts"
  | "caused_by"
  | "documentation"
  | "summarizes" // a constellation hub → one of its member memories
  | "supports"; // a memory/idea → a cognitive anchor (goal/identity/skill)

/** Convenience runtime lists (also exercised by the seed script). */
export const NODE_TYPES: readonly NodeType[] = [
  "person",
  "project",
  "decision",
  "company",
  "meeting",
  "daily",
  "knowledge",
  "concept",
  "other",
  "moc",
];

/** Kinds the extraction LLM may assign (excludes the structural `moc` hub). */
export const EXTRACTABLE_NODE_TYPES: readonly NodeType[] = NODE_TYPES.filter((t) => t !== "moc");

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
  /** Who authored this node: "agent" = Soumaya (e.g. a constellation hub), else yours. */
  origin?: "user" | "agent";
  /** Which autonomous agent last worked this node (e.g. "soumaya", "scout"). */
  agent?: string;
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
  /** "action" = a transient to-do; "moc" = a constellation hub; "belief" = a
   *  consolidated understanding she distilled from a cluster (dream cycles); a
   *  CognitiveKind ("goal"/"idea"/"skill"/… — the cognitive layer, see
   *  docs/COGNITIVE_LAYER.md); else a normal memory. */
  kind?: "memory" | "action" | "moc" | "belief" | import("./celestial.js").CognitiveKind;
  /** Lifecycle: "archived" rests out of the galaxy + retrieval (kept, not deleted). */
  status?: "active" | "archived";
  /** 0..1 progress — goal completion / skill level (cognitive layer). */
  progress?: number;
  /** Cognitive layer: other names for this entry ("girlfriend", "my girl") so vague
   *  memories link to it without the exact label. */
  aliases?: string[];
  /** For a `moc` hub: how many member memories it consolidates (enriched on read). */
  memberCount?: number;
  /** 0..1 spaced-repetition memory strength (enriched on read). Low = faded, the
   *  "come review me" cue; drives the star's brightness. See NEURO_ALIGNMENT #1. */
  reviewStrength?: number;
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

/** Daily-tending streak — consecutive days the brain was fed a memory. */
export interface Streak {
  /** Current live streak in days (0 if it has lapsed). */
  current: number;
  /** Best streak ever reached for this brain. */
  best: number;
  /** Whether the brain has already been tended today. */
  today: boolean;
  /** "Nebula shields" left — each forgives one missed day so a streak isn't lost. */
  shields?: number;
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
/** What an insight represents: a latent *connection* (default) or a *contradiction*
 *  (conflicting beliefs/goals/identity statements across memories over time). */
export type InsightKind = "synthesis" | "contradiction";

export interface Insight {
  id: number;
  text: string;
  /** 0..1 — how strong/surprising the latent connection (or how sharp the conflict) is. */
  score: number;
  createdAt: string;
  nodes: NodeRef[];
  /** Defaults to "synthesis" for pre-existing rows. */
  kind?: InsightKind;
  /** Significance tier (#10): 1 = identity-shaping, 2 = behavioral pattern, 3 = situational.
   *  Derived on read from the involved memories; lower number = surfaced first. */
  tier?: 1 | 2 | 3;
}

/** One point on the emotional trajectory: a time bucket's average valence (−1..1). */
export interface EmotionalPoint {
  /** ISO date (day bucket). */
  date: string;
  /** Average emotional valence in this bucket: −1 (heavy) … +1 (bright). */
  valence: number;
  /** How many memories fell in this bucket. */
  count: number;
}

/** A detected emotional pattern (stress cycle, upswing, burnout risk, volatility…). */
export interface EmotionalPattern {
  /** Human label, e.g. "Stress cycle", "Upswing", "Burnout risk", "Volatile stretch". */
  type: string;
  /** The tag/type most associated with the low points, or "" if none stands out. */
  trigger: string;
  /** How many times the pattern repeats in the history. */
  repeats: number;
  /** A gentle, heuristic suggestion. */
  intervention: string;
}

/** Emotional trajectory analysis over time (research-agent add-on #5). Heuristic + offline. */
export interface EmotionalTrajectory {
  /** Time-ordered, day-bucketed valence series for a sparkline. */
  points: EmotionalPoint[];
  /** Overall direction of mood over the window. */
  trend: "rising" | "falling" | "steady";
  /** Mean valence across all dated, emotionally-charged memories (−1..1). */
  average: number;
  /** 0..1 — how much mood swings (normalized stddev). */
  volatility: number;
  /** Detected patterns, most salient first. */
  patterns: EmotionalPattern[];
  /** How many memories carried usable emotional + time data. */
  sampleSize: number;
}

/** Broad areas of life used by the optional life-area lens (#6). An overlay over the
 *  emergent galaxy — NOT a storage model (memories still cluster by association). */
export const LIFE_AREAS = [
  "Identity & Growth",
  "Relationships",
  "Work & Projects",
  "Health",
  "Money",
  "Other",
] as const;
export type LifeArea = (typeof LIFE_AREAS)[number];

/** A count of memories mapped to one life-area (#6). */
export interface LifeAreaCount {
  area: LifeArea;
  count: number;
}

/** One line of Soumaya's read-only coverage self-check (#12): something she may be
 *  missing or that's worth your attention. Informational — she never self-modifies. */
export interface SelfReviewItem {
  title: string;
  detail: string;
  count: number;
}

/** A temporal evolution link (research-agent add-on #8): an older memory and a newer
 *  one on the same theme, showing how a thread of thinking moved over time. */
export interface EvolutionLink {
  fromId: number;
  fromLabel: string;
  toId: number;
  toLabel: string;
  /** Semantic closeness banded for display. */
  strength: "weak" | "medium" | "strong";
  /** Days between the two memories (older → newer). */
  temporalDistanceDays: number;
  /** One-line reason: theme + time gap + any emotional drift. */
  reason: string;
}

/** A dormant memory worth reviving (research-agent add-on #4): a skill/goal/project
 *  you once invested in but haven't touched in a while. */
export interface DormantItem {
  nodeId: number;
  label: string;
  type: NodeType;
  /** Days since it was last tended/created. */
  dormantDays: number;
  /** Heuristic "why it disappeared". */
  hypothesis: string;
  /** A gentle reactivation nudge. */
  prompt: string;
}

/** One grouped line of autonomous work Soumaya did while you were away. */
export interface AwayAction {
  type: string;
  count: number;
  label: string;
}

/** The "while you were away" companion digest — what changed since your last visit. */
export interface AwayDigest {
  /** ISO timestamp of your previous visit (null on first ever visit). */
  since: string | null;
  /** Milliseconds since that visit. */
  awayMs: number;
  /** In-character summary line. */
  greeting: string;
  /** Grouped autonomous actions Soumaya took (connected/researched/merged…). */
  agentActions: AwayAction[];
  /** Contradictions surfaced while away. */
  newContradictions: number;
  /** Action items that expired while away. */
  expiredActions: number;
  /** Reminders that came due while away (click to fly to them). */
  dueReminders: { id: number; label: string }[];
  /** A dormant memory worth resurfacing today, if any. */
  resurfaced: { id: number; label: string; dormantDays: number } | null;
  /** Memories cooling from neglect. */
  cooling: number;
  /** True when there's nothing worth showing (first visit / quiet). */
  isEmpty: boolean;
}

/** Metadata for a file attached to a memory note (bytes fetched separately on download). */
export interface Attachment {
  id: number;
  nodeId: number;
  filename: string;
  mime: string;
  size: number;
  createdAt: string;
}

/** How a life-chapter's period trended vs the one before it (the 3D Chronicle timeline). */
export type ChapterTrend = "growth" | "decline" | "neutral" | "mixed";

/** One named sub-current within a chapter (hybrid scope: whole-arc + parallel threads). */
export interface ChapterThread {
  name: string;
  trend: ChapterTrend;
}

/** A chapter of your life on the 3D flowing-river timeline. Written by Soumaya when
 *  there's real change (~1–3×/month) or added by you. See docs/TIMELINE_DESIGN.md. */
export interface TimelineChapter {
  id: number;
  title: string;
  summary: string;
  theme: string;
  trend: ChapterTrend;
  /** Blended change magnitude 0..1 (momentum + emotion delta + milestones). */
  score: number;
  periodStart: string;
  periodEnd: string;
  /** Driving memory ids (photo-bearing preferred) — glow as bubbles on the ribbon. */
  memoryIds: number[];
  /** The subset of memoryIds that carry a photo — rendered as whitish glowing bubbles. */
  photoIds: number[];
  threads: ChapterThread[];
  origin: "auto" | "user";
  createdAt: string;
}

/** The emotional register of a chat reply — drives the avatar's eye + bubble accent. */
export const CHAT_MOODS = [
  "happy",
  "excited",
  "warm",
  "thoughtful",
  "concerned",
  "sad",
  "neutral",
] as const;
export type ChatMood = (typeof CHAT_MOODS)[number];

/** Answer from chat-with-your-brain (GraphRAG), with node citations. */
export interface ChatResponse {
  answer: string;
  citations: NodeRef[];
  /** Ids of the subgraph used as context (for camera/highlight). */
  contextIds: number[];
  /** Emotional delivery tone (drives her voice's prosody when speaking aloud). */
  tone?: import("./dramatize.js").EmotionalTone;
  /** How she's feeling about this reply (avatar eye colour / animation). */
  mood?: ChatMood;
  /** Interview instinct: ONE clarifying question she asks back — set when the
   *  topic is weighty/ambiguous and answering well needs context she lacks. */
  askBack?: string;
  /** Names of the custom-instruction roles that shaped this reply (visibility:
   *  users couldn't tell whether their Companion config was actually applied). */
  appliedRoles?: string[];
  /** Names of the knowledge documents retrieved into this reply's context. */
  appliedDocs?: string[];
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
  /** Memories whose user-set reminder time has come due (remind_at ≤ now). */
  reminders: { node: NodeRef; remindAt: string }[];
  /** Closing reflection in her voice. */
  closing: string;
}
