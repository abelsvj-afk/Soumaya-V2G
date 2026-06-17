import BetterSqlite3 from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import * as schema from "./schema.js";
import { bootstrapVec, type RawDb } from "./vec.js";

export type Schema = typeof schema;
export type Db = BetterSQLite3Database<Schema>;

export interface DbHandle {
  /** Drizzle instance for type-safe relational queries. */
  db: Db;
  /** Raw better-sqlite3 connection for vector + recursive-CTE SQL. */
  sqlite: RawDb;
}

/**
 * Bootstrap the relational schema in raw SQL. Mirrors db/schema.ts and keeps
 * tests fully self-contained (drizzle-kit migrations remain available via
 * `npm run db:generate` for production deploys).
 */
export function bootstrapSchema(sqlite: RawDb): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS nodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      space_id TEXT NOT NULL DEFAULT 'legacy',
      label TEXT NOT NULL,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      emotional_weight REAL,
      importance REAL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS edges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      space_id TEXT NOT NULL DEFAULT 'legacy',
      source INTEGER NOT NULL REFERENCES nodes(id),
      target INTEGER NOT NULL REFERENCES nodes(id),
      relationship TEXT NOT NULL,
      weight REAL NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS edges_source_idx ON edges(source);
    CREATE INDEX IF NOT EXISTS edges_target_idx ON edges(target);
    CREATE TABLE IF NOT EXISTS insights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      space_id TEXT NOT NULL DEFAULT 'legacy',
      node_a INTEGER NOT NULL REFERENCES nodes(id),
      node_b INTEGER NOT NULL REFERENCES nodes(id),
      text TEXT NOT NULL,
      score REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS agent_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      space_id TEXT NOT NULL DEFAULT 'legacy',
      agent TEXT NOT NULL DEFAULT 'soumaya',
      action TEXT NOT NULL,
      description TEXT NOT NULL,
      targets TEXT NOT NULL,
      result TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS daily_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      space_id TEXT NOT NULL DEFAULT 'legacy',
      content TEXT NOT NULL,
      date TEXT NOT NULL DEFAULT CURRENT_DATE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS spaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      passcode_hash TEXT NOT NULL,
      passcode_salt TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

/**
 * Lightweight additive migrations for databases created before a column existed
 * (e.g. an existing volume on Fly). CREATE TABLE IF NOT EXISTS won't add new
 * columns, so we patch them in idempotently.
 */
function migrateSchema(sqlite: RawDb): void {
  const cols = sqlite.prepare(`PRAGMA table_info(nodes)`).all() as { name: string }[];
  if (!cols.some((c) => c.name === "importance")) {
    sqlite.exec(`ALTER TABLE nodes ADD COLUMN importance REAL`);
  }
  if (!cols.some((c) => c.name === "celestial_title")) {
    sqlite.exec(`ALTER TABLE nodes ADD COLUMN celestial_title TEXT`);
  }
  if (!cols.some((c) => c.name === "color")) {
    sqlite.exec(`ALTER TABLE nodes ADD COLUMN color TEXT`);
  }
  // Soft-delete safety (merged/redundant memories are flagged, not erased).
  if (!cols.some((c) => c.name === "deleted_at")) {
    sqlite.exec(`ALTER TABLE nodes ADD COLUMN deleted_at TEXT`);
  }
  if (!cols.some((c) => c.name === "merged_into")) {
    sqlite.exec(`ALTER TABLE nodes ADD COLUMN merged_into INTEGER`);
  }
  // Action items: transient day-to-day to-dos that expire.
  if (!cols.some((c) => c.name === "kind")) {
    sqlite.exec(`ALTER TABLE nodes ADD COLUMN kind TEXT`);
  }
  if (!cols.some((c) => c.name === "expires_at")) {
    sqlite.exec(`ALTER TABLE nodes ADD COLUMN expires_at TEXT`);
  }

  // Multi-tenancy: add space_id to every per-user table on existing volumes.
  // Pre-existing rows keep the 'legacy' default and are claimed on first signup.
  const addSpaceId = (table: string) => {
    const tcols = sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (tcols.length > 0 && !tcols.some((c) => c.name === "space_id")) {
      sqlite.exec(`ALTER TABLE ${table} ADD COLUMN space_id TEXT NOT NULL DEFAULT 'legacy'`);
    }
  };
  for (const t of ["nodes", "edges", "insights", "agent_logs", "daily_logs"]) addSpaceId(t);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS nodes_space_idx ON nodes(space_id)`);
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS spaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      passcode_hash TEXT NOT NULL,
      passcode_salt TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

/**
 * Open the database, load sqlite-vec, and bootstrap both the relational and
 * vector schemas. Pass ":memory:" for tests.
 */
export function createDb(path: string = process.env.DB_PATH ?? "./brain.db"): DbHandle {
  const sqlite = new BetterSqlite3(path);
  sqliteVec.load(sqlite);
  if (path !== ":memory:") {
    sqlite.pragma("journal_mode = WAL");
  }
  sqlite.pragma("foreign_keys = ON");
  bootstrapSchema(sqlite);
  migrateSchema(sqlite);
  bootstrapVec(sqlite);
  const db = drizzle(sqlite, { schema });
  return { db, sqlite };
}
