import BetterSqlite3 from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import * as schema from "./schema.js";
import { bootstrapVec, type RawDb } from "./vec.js";
import { bootstrapFts } from "./fts.js";

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
      occurred_at TEXT,
      remind_at TEXT,
      tags TEXT,
      research_questions TEXT,
      research_answers TEXT,
      progress REAL,
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
      kind TEXT NOT NULL DEFAULT 'synthesis',
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
      name TEXT NOT NULL,
      gamer_tag TEXT NOT NULL UNIQUE,
      passcode_hash TEXT NOT NULL,
      passcode_salt TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS space_meta (
      space_id TEXT PRIMARY KEY,
      fuel REAL NOT NULL DEFAULT 25,
      streak INTEGER NOT NULL DEFAULT 0,
      streak_best INTEGER NOT NULL DEFAULT 0,
      last_active_date TEXT,
      last_seen_at TEXT,
      research_enabled TEXT,
      last_dream_date TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    -- Telegram: bind a chat to a brain so messages route to the right space and
    -- proactive digests know where to push. One chat → one brain (re-/link swaps).
    CREATE TABLE IF NOT EXISTS telegram_links (
      chat_id INTEGER PRIMARY KEY,
      space_id TEXT NOT NULL,
      space_name TEXT NOT NULL,
      last_digest_date TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    -- Append-only, versioned lore per object (memory/ship/station/beacon).
    CREATE TABLE IF NOT EXISTS lore (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      space_id TEXT NOT NULL DEFAULT 'legacy',
      subject_type TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      text TEXT NOT NULL,
      trigger TEXT NOT NULL DEFAULT 'genesis',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS lore_subject_idx
      ON lore(space_id, subject_type, subject_id, version);
    -- AI Companion: Layer-2 instruction profiles, knowledge docs + chunks, About-Me.
    CREATE TABLE IF NOT EXISTS instruction_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      space_id TEXT NOT NULL DEFAULT 'legacy',
      name TEXT NOT NULL,
      body TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      mode TEXT NOT NULL DEFAULT 'always',
      priority INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS instruction_profiles_space_idx ON instruction_profiles(space_id);
    CREATE TABLE IF NOT EXISTS knowledge_docs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      space_id TEXT NOT NULL DEFAULT 'legacy',
      name TEXT NOT NULL,
      mime TEXT NOT NULL DEFAULT 'text/plain',
      char_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS knowledge_docs_space_idx ON knowledge_docs(space_id);
    CREATE TABLE IF NOT EXISTS knowledge_chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      space_id TEXT NOT NULL DEFAULT 'legacy',
      doc_id INTEGER NOT NULL REFERENCES knowledge_docs(id),
      ordinal INTEGER NOT NULL,
      content TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS knowledge_chunks_doc_idx ON knowledge_chunks(doc_id);
    CREATE TABLE IF NOT EXISTS attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      space_id TEXT NOT NULL DEFAULT 'legacy',
      node_id INTEGER NOT NULL REFERENCES nodes(id),
      filename TEXT NOT NULL,
      mime TEXT NOT NULL DEFAULT 'application/octet-stream',
      size INTEGER NOT NULL DEFAULT 0,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS attachments_node_idx ON attachments(node_id);
    CREATE TABLE IF NOT EXISTS codex_claims (
      space_id TEXT NOT NULL DEFAULT 'legacy',
      reward_key TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (space_id, reward_key)
    );
    -- Undertakings (Level 2): a multi-day arc Soumaya commits to, so her autonomy
    -- has narrative ("Day 3 of 5 — Warming the cold belt") instead of 5-min ticks.
    CREATE TABLE IF NOT EXISTS undertakings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      space_id TEXT NOT NULL DEFAULT 'legacy',
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      total INTEGER NOT NULL DEFAULT 1,
      done INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ends_at TEXT
    );
    CREATE INDEX IF NOT EXISTS undertakings_space_idx ON undertakings(space_id, status);
    -- The Daily Contact: her one question/discovery per brain per day, persisted
    -- so it stays stable across reloads; answered flips when the user replies.
    CREATE TABLE IF NOT EXISTS daily_contact (
      space_id TEXT NOT NULL DEFAULT 'legacy',
      date TEXT NOT NULL,
      payload TEXT NOT NULL,
      answered INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (space_id, date)
    );
    CREATE TABLE IF NOT EXISTS user_persona (
      space_id TEXT PRIMARY KEY,
      body TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    -- Visitor activity: aggregated visits per memory + craft type.
    CREATE TABLE IF NOT EXISTS visitor_stats (
      space_id TEXT NOT NULL DEFAULT 'legacy',
      node_id INTEGER NOT NULL,
      visitor_type TEXT NOT NULL,
      visits INTEGER NOT NULL DEFAULT 0,
      last_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (space_id, node_id, visitor_type)
    );
    CREATE INDEX IF NOT EXISTS visitor_stats_space_idx ON visitor_stats(space_id);
    -- Working Memory (Cognitive Layer Phase 2): the ephemeral "mind space" — what
    -- you're thinking NOW. Thought-motes decay unless reinforced; survivors are
    -- consolidated into the permanent galaxy (a real node) and the mote is removed.
    -- Deliberately SEPARATE from the nodes table so working memory never pollutes
    -- the galaxy until promoted (short-term to long-term consolidation).
    CREATE TABLE IF NOT EXISTS working_memory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      space_id TEXT NOT NULL DEFAULT 'legacy',
      text TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'manual',
      strength REAL NOT NULL DEFAULT 0.6,
      reinforce_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      reinforced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS working_memory_space_idx ON working_memory(space_id);
    -- Inquiries (the proactive-intelligence layer): connections Soumaya NOTICES on
    -- her own — a new memory that bridges two people/goals, sits near an existing
    -- anchor, or joins an emerging theme — surfaced as a question for you to answer.
    -- Answering ingests + links, so her noticing literally grows the graph.
    CREATE TABLE IF NOT EXISTS inquiries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      space_id TEXT NOT NULL DEFAULT 'legacy',
      question TEXT NOT NULL,
      kind TEXT NOT NULL,
      node_ids TEXT NOT NULL DEFAULT '[]',
      signature TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS inquiries_space_idx ON inquiries(space_id, status);
    CREATE UNIQUE INDEX IF NOT EXISTS inquiries_sig_idx ON inquiries(space_id, signature);
    -- User-rejected connections: when you tell Soumaya two things DON'T relate, the
    -- pair is recorded here (canonical a<b) so she never re-links or re-asks about it.
    CREATE TABLE IF NOT EXISTS link_rejections (
      space_id TEXT NOT NULL DEFAULT 'legacy',
      a INTEGER NOT NULL,
      b INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (space_id, a, b)
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
  // Provenance: who authored a node ("agent" = Soumaya, e.g. a constellation hub).
  if (!cols.some((c) => c.name === "origin")) {
    sqlite.exec(`ALTER TABLE nodes ADD COLUMN origin TEXT`);
  }
  // Which autonomous agent last worked a node (attribution; e.g. "soumaya"/"scout").
  if (!cols.some((c) => c.name === "agent")) {
    sqlite.exec(`ALTER TABLE nodes ADD COLUMN agent TEXT`);
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
  // Celestial Economy: when a memory was last tended (drives entropy).
  if (!cols.some((c) => c.name === "last_tended_at")) {
    sqlite.exec(`ALTER TABLE nodes ADD COLUMN last_tended_at TEXT`);
  }
  // Insights gain a `kind` ("synthesis" | "contradiction") on existing volumes (additive).
  const insightCols = sqlite.prepare(`PRAGMA table_info(insights)`).all() as { name: string }[];
  if (insightCols.length > 0 && !insightCols.some((c) => c.name === "kind")) {
    sqlite.exec(`ALTER TABLE insights ADD COLUMN kind TEXT NOT NULL DEFAULT 'synthesis'`);
  }
  // Temporal memory: when the event happened (backdatable), a future reminder,
  // and free/curated tags. All optional, additive for existing volumes.
  if (!cols.some((c) => c.name === "occurred_at")) {
    sqlite.exec(`ALTER TABLE nodes ADD COLUMN occurred_at TEXT`);
  }
  if (!cols.some((c) => c.name === "remind_at")) {
    sqlite.exec(`ALTER TABLE nodes ADD COLUMN remind_at TEXT`);
  }
  if (!cols.some((c) => c.name === "tags")) {
    sqlite.exec(`ALTER TABLE nodes ADD COLUMN tags TEXT`);
  }
  if (!cols.some((c) => c.name === "research_questions")) {
    sqlite.exec(`ALTER TABLE nodes ADD COLUMN research_questions TEXT`);
  }
  if (!cols.some((c) => c.name === "research_answers")) {
    sqlite.exec(`ALTER TABLE nodes ADD COLUMN research_answers TEXT`);
  }
  // Cognitive layer: 0..1 progress for goals (completion) + skills (level).
  if (!cols.some((c) => c.name === "progress")) {
    sqlite.exec(`ALTER TABLE nodes ADD COLUMN progress REAL`);
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
  sqlite.exec(`CREATE INDEX IF NOT EXISTS edges_space_idx ON edges(space_id)`);
  // Migrate spaces table to non-unique name + unique gamer_tag if needed
  const spaceCols = sqlite.prepare(`PRAGMA table_info(spaces)`).all() as { name: string }[];
  if (spaceCols.length > 0 && !spaceCols.some((c) => c.name === "gamer_tag")) {
    sqlite.transaction(() => {
      sqlite.exec(`ALTER TABLE spaces RENAME TO spaces_old`);
      sqlite.exec(`
        CREATE TABLE spaces (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          gamer_tag TEXT NOT NULL UNIQUE,
          passcode_hash TEXT NOT NULL,
          passcode_salt TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      // gamer_tag is UNIQUE, but the old `name` column was not — copying name→gamer_tag
      // verbatim would abort the migration (and crash boot on a real volume) if two old
      // brains shared a name (case-insensitively). De-dupe: the earliest brain in each
      // name-group keeps the bare name; later collisions get the unique id appended.
      sqlite.exec(`
        INSERT INTO spaces (id, name, gamer_tag, passcode_hash, passcode_salt, created_at)
        SELECT id, name,
               CASE WHEN rn = 1 THEN name ELSE name || '#' || id END AS gamer_tag,
               passcode_hash, passcode_salt, created_at
        FROM (
          SELECT *, ROW_NUMBER() OVER (PARTITION BY lower(name) ORDER BY created_at, id) AS rn
          FROM spaces_old
        )
      `);
      sqlite.exec(`DROP TABLE spaces_old`);
    })();
  }

  // Daily-tending streak columns on existing space_meta volumes (additive).
  const metaCols = sqlite.prepare(`PRAGMA table_info(space_meta)`).all() as { name: string }[];
  if (metaCols.length > 0) {
    if (!metaCols.some((c) => c.name === "streak")) {
      sqlite.exec(`ALTER TABLE space_meta ADD COLUMN streak INTEGER NOT NULL DEFAULT 0`);
    }
    if (!metaCols.some((c) => c.name === "streak_best")) {
      sqlite.exec(`ALTER TABLE space_meta ADD COLUMN streak_best INTEGER NOT NULL DEFAULT 0`);
    }
    if (!metaCols.some((c) => c.name === "last_active_date")) {
      sqlite.exec(`ALTER TABLE space_meta ADD COLUMN last_active_date TEXT`);
    }
    // Timestamp of the user's last visit — drives the "while you were away" digest.
    if (!metaCols.some((c) => c.name === "last_seen_at")) {
      sqlite.exec(`ALTER TABLE space_meta ADD COLUMN last_seen_at TEXT`);
    }
    // Per-space Research Mode (was a global settings row any tenant could flip).
    // NULL = fall back to the legacy global setting so existing brains keep working.
    if (!metaCols.some((c) => c.name === "research_enabled")) {
      sqlite.exec(`ALTER TABLE space_meta ADD COLUMN research_enabled TEXT`);
    }
    // Last UTC day a dream-cycle belief was consolidated (Level 2).
    if (!metaCols.some((c) => c.name === "last_dream_date")) {
      sqlite.exec(`ALTER TABLE space_meta ADD COLUMN last_dream_date TEXT`);
    }
  }
  // (Table creation lives ONLY in bootstrapSchema, which always runs first —
  // a second CREATE block here once drifted out of sync and shipped wrong shapes.)
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
  bootstrapFts(sqlite);
  const db = drizzle(sqlite, { schema });
  return { db, sqlite };
}
