import { sql } from "drizzle-orm";
import { sqliteTable, integer, text, real, index } from "drizzle-orm/sqlite-core";

/**
 * Relational tables for the knowledge graph. Vectors live in the separate
 * `vec_nodes` vec0 table (db/vec.ts), JOINed on node id.
 */

export const nodes = sqliteTable("nodes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  label: text("label").notNull(),
  celestialTitle: text("celestial_title"),
  type: text("type").notNull(),
  content: text("content").notNull(),
  emotionalWeight: real("emotional_weight"),
  importance: real("importance"),
  color: text("color"),
  deletedAt: text("deleted_at"),
  mergedInto: integer("merged_into"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const edges = sqliteTable(
  "edges",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
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
  agent: text("agent").notNull().default("soumaya"),
  action: text("action").notNull(),
  description: text("description").notNull(),
  targets: text("targets").notNull(),
  result: text("result"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

/** Global configuration for the system. */
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

/** Summarized daily reflections on the brain's evolution. */
export const dailyLogs = sqliteTable("daily_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  content: text("content").notNull(),
  date: text("date").notNull().default(sql`CURRENT_DATE`),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export type NodeRow = typeof nodes.$inferSelect;
export type EdgeRow = typeof edges.$inferSelect;
export type InsightRow = typeof insights.$inferSelect;
export type AgentLogRow = typeof agentLogs.$inferSelect;
export type DailyLogRow = typeof dailyLogs.$inferSelect;
