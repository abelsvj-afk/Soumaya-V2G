import { sql } from "drizzle-orm";
import { sqliteTable, integer, text, real, index } from "drizzle-orm/sqlite-core";

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
