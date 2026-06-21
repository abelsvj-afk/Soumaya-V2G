import { sql } from "drizzle-orm";
import { sqliteTable, integer, text, real, index, primaryKey } from "drizzle-orm/sqlite-core";

/**
 * Relational tables for the knowledge graph. Vectors live in the separate
 * `vec_nodes` vec0 table (db/vec.ts), JOINed on node id.
 *
 * Multi-tenancy: every per-user table carries a `space_id` so one deployment can
 * host many private brains. Pre-existing rows (before spaces existed) default to
 * DEFAULT_SPACE and are claimed by the first account that registers.
 */

/** Holding space for data created before multi-tenancy; claimed on first signup. */
export const DEFAULT_SPACE = "legacy";

export const nodes = sqliteTable("nodes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  spaceId: text("space_id").notNull().default(DEFAULT_SPACE),
  label: text("label").notNull(),
  celestialTitle: text("celestial_title"),
  type: text("type").notNull(),
  content: text("content").notNull(),
  emotionalWeight: real("emotional_weight"),
  importance: real("importance"),
  color: text("color"),
  deletedAt: text("deleted_at"),
  mergedInto: integer("merged_into"),
  kind: text("kind"),
  expiresAt: text("expires_at"),
  lastTendedAt: text("last_tended_at"),
  // When the memory's event actually happened (user-set, may be backdated).
  occurredAt: text("occurred_at"),
  // Future reminder to resurface this memory.
  remindAt: text("remind_at"),
  // JSON array of tag strings (curated + free-form).
  tags: text("tags"),
  researchQuestions: text("research_questions"),
  researchAnswers: text("research_answers"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const edges = sqliteTable(
  "edges",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    spaceId: text("space_id").notNull().default(DEFAULT_SPACE),
    source: integer("source")
      .notNull()
      .references(() => nodes.id),
    target: integer("target")
      .notNull()
      .references(() => nodes.id),
    relationship: text("relationship").notNull(),
    weight: real("weight").notNull().default(1),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [index("edges_source_idx").on(t.source), index("edges_target_idx").on(t.target)],
);

/** Synthesized cross-cluster insights (the digest feature). */
export const insights = sqliteTable("insights", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  spaceId: text("space_id").notNull().default(DEFAULT_SPACE),
  nodeA: integer("node_a")
    .notNull()
    .references(() => nodes.id),
  nodeB: integer("node_b")
    .notNull()
    .references(() => nodes.id),
  text: text("text").notNull(),
  score: real("score").notNull().default(0),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

/** Logs of all autonomous agent activity. */
export const agentLogs = sqliteTable("agent_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  spaceId: text("space_id").notNull().default(DEFAULT_SPACE),
  agent: text("agent").notNull().default("soumaya"),
  action: text("action").notNull(),
  description: text("description").notNull(),
  targets: text("targets").notNull(),
  result: text("result"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

/** Global configuration for the system (shared — e.g. the deployment API budget). */
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

/**
 * Append-only, versioned lore: each object (a memory, or an agent like the ship /
 * station / beacon) accrues "chapters" of its evolving story. v1 = genesis (never
 * rewritten); later versions extend it as the galaxy changes.
 */
export const lore = sqliteTable("lore", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  spaceId: text("space_id").notNull().default(DEFAULT_SPACE),
  subjectType: text("subject_type").notNull(),
  subjectId: text("subject_id").notNull(),
  version: integer("version").notNull(),
  text: text("text").notNull(),
  trigger: text("trigger").notNull().default("genesis"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

/**
 * AI Companion — Layer 2: user-created, stackable instruction profiles (roles she
 * adopts: Therapist, Business Advisor, …). `mode`: 'always' applies whenever
 * enabled; 'auto' is intent-routed by semantic similarity to the question.
 */
export const instructionProfiles = sqliteTable(
  "instruction_profiles",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    spaceId: text("space_id").notNull().default(DEFAULT_SPACE),
    name: text("name").notNull(),
    body: text("body").notNull(),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    mode: text("mode").notNull().default("always"),
    priority: integer("priority").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [index("instruction_profiles_space_idx").on(t.spaceId)],
);

/** AI Companion — a user's uploaded reference document (chunks live in knowledge_chunks). */
export const knowledgeDocs = sqliteTable(
  "knowledge_docs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    spaceId: text("space_id").notNull().default(DEFAULT_SPACE),
    name: text("name").notNull(),
    mime: text("mime").notNull().default("text/plain"),
    charCount: integer("char_count").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [index("knowledge_docs_space_idx").on(t.spaceId)],
);

/** A retrievable chunk of a knowledge doc; its embedding lives in vec_docs (JOIN on id). */
export const knowledgeChunks = sqliteTable(
  "knowledge_chunks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    spaceId: text("space_id").notNull().default(DEFAULT_SPACE),
    docId: integer("doc_id")
      .notNull()
      .references(() => knowledgeDocs.id),
    ordinal: integer("ordinal").notNull(),
    content: text("content").notNull(),
  },
  (t) => [index("knowledge_chunks_doc_idx").on(t.docId)],
);

/** AI Companion — "About Me": who the user is (singleton per brain). She's aware, never becomes them. */
export const userPersona = sqliteTable("user_persona", {
  spaceId: text("space_id").primaryKey(),
  body: text("body").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export type InstructionProfileRow = typeof instructionProfiles.$inferSelect;
export type KnowledgeDocRow = typeof knowledgeDocs.$inferSelect;
export type KnowledgeChunkRow = typeof knowledgeChunks.$inferSelect;

/** Aggregated visitor activity per memory + craft type (drives "most visited"). */
export const visitorStats = sqliteTable(
  "visitor_stats",
  {
    spaceId: text("space_id").notNull().default(DEFAULT_SPACE),
    nodeId: integer("node_id").notNull(),
    visitorType: text("visitor_type").notNull(),
    visits: integer("visits").notNull().default(0),
    lastAt: text("last_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    primaryKey({ columns: [t.spaceId, t.nodeId, t.visitorType] }),
    index("visitor_stats_space_idx").on(t.spaceId),
  ],
);

/** Summarized daily reflections on the brain's evolution. */
export const dailyLogs = sqliteTable("daily_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  spaceId: text("space_id").notNull().default(DEFAULT_SPACE),
  content: text("content").notNull(),
  date: text("date").notNull().default(sql`CURRENT_DATE`),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

/** Per-brain economy state (the "Celestial Economy" fuel). Space-scoped. */
export const spaceMeta = sqliteTable("space_meta", {
  spaceId: text("space_id").primaryKey(),
  fuel: real("fuel").notNull().default(25),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

/** A private brain ("space"), opened by name + passcode (works across devices). */
export const spaces = sqliteTable("spaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  passcodeHash: text("passcode_hash").notNull(),
  passcodeSalt: text("passcode_salt").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export type NodeRow = typeof nodes.$inferSelect;
export type EdgeRow = typeof edges.$inferSelect;
export type InsightRow = typeof insights.$inferSelect;
export type AgentLogRow = typeof agentLogs.$inferSelect;
export type DailyLogRow = typeof dailyLogs.$inferSelect;
export type SpaceRow = typeof spaces.$inferSelect;
export type SpaceMetaRow = typeof spaceMeta.$inferSelect;
