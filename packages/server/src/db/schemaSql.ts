/**
 * Bootstrap schema (CREATE TABLE IF NOT EXISTS …) for a fresh DB. Extracted from
 * client.ts (Post-MVP D4) so the ~270-line SQL string doesn't dwarf the DB logic.
 * Additive/idempotent migrations for existing volumes stay in client.ts (migrateSchema).
 */
export const BOOTSTRAP_SQL = `
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
      aliases TEXT,
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
      timeline_backfilled INTEGER NOT NULL DEFAULT 0,
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
    -- Candidate connections: links Soumaya WITHHELD (below the auto-link confidence bar)
    -- or PRUNED (weak existing links removed to declutter) go here instead of vanishing,
    -- so YOU review each one and choose to connect it yourself or dismiss it. Canonical
    -- a<b; unique per pair so a suggestion never duplicates.
    CREATE TABLE IF NOT EXISTS candidate_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      space_id TEXT NOT NULL DEFAULT 'legacy',
      a INTEGER NOT NULL,
      b INTEGER NOT NULL,
      reason TEXT,
      score REAL NOT NULL DEFAULT 0,
      origin TEXT NOT NULL DEFAULT 'withheld',
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS candidate_links_pair_idx ON candidate_links(space_id, a, b);
    CREATE INDEX IF NOT EXISTS candidate_links_status_idx ON candidate_links(space_id, status);
    -- Names you told Soumaya are NOT a person ("not a person" dismiss on a people
    -- suggestion). Keyed by the normalised (lowercased) name so it never resurfaces
    -- as a suggestion again, no matter how often you mention it.
    CREATE TABLE IF NOT EXISTS dismissed_names (
      space_id TEXT NOT NULL DEFAULT 'legacy',
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (space_id, name)
    );
    -- The Chronicle: chapters of your life on the 3D flowing-river timeline. Soumaya
    -- writes one when there's REAL change (~1-3x/month); you can add your own. Each
    -- carries the memories that drove it (photo-bearing preferred) so they can glow as
    -- bubbles on the ribbon. See docs/TIMELINE_DESIGN.md.
    CREATE TABLE IF NOT EXISTS timeline_chapters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      space_id TEXT NOT NULL DEFAULT 'legacy',
      title TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      theme TEXT NOT NULL DEFAULT '',
      trend TEXT NOT NULL DEFAULT 'neutral',
      score REAL NOT NULL DEFAULT 0,
      period_start TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      period_end TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      memory_ids TEXT NOT NULL DEFAULT '[]',
      photo_ids TEXT NOT NULL DEFAULT '[]',
      threads TEXT NOT NULL DEFAULT '[]',
      origin TEXT NOT NULL DEFAULT 'auto',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS timeline_chapters_space_idx ON timeline_chapters(space_id, period_end);
`;
