import { describe, it, expect, afterEach } from "vitest";
import BetterSqlite3 from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDb, type DbHandle } from "../db/client.js";
import { NodesRepo } from "../repositories/nodes.repo.js";

/**
 * Regression: a database created BEFORE multi-tenancy (no space_id columns, no
 * spaces table) must upgrade in place without crashing. This reproduces the Fly
 * crash-loop where bootstrap referenced nodes(space_id) before the migration
 * added it — something the fresh-:memory: tests never exercised.
 */

let dir: string;
let handle: DbHandle | undefined;

afterEach(() => {
  handle?.sqlite.close();
  handle = undefined;
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe("schema migration on a pre-existing volume", () => {
  it("upgrades an old (space_id-less) database in place", () => {
    dir = mkdtempSync(join(tmpdir(), "brain-mig-"));
    const path = join(dir, "old.db");

    // 1. Seed an OLD-style database: nodes without space_id, a real row.
    const old = new BetterSqlite3(path);
    old.exec(`
      CREATE TABLE nodes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        label TEXT NOT NULL,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        emotional_weight REAL,
        importance REAL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE edges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source INTEGER NOT NULL,
        target INTEGER NOT NULL,
        relationship TEXT NOT NULL,
        weight REAL NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO nodes (label, type, content) VALUES ('Old memory', 'random_thought', 'from before spaces');
    `);
    old.close();

    // 2. Opening it with the current code must NOT throw (this was the crash).
    expect(() => {
      handle = createDb(path);
    }).not.toThrow();

    // 3. The legacy row is preserved and readable under the default space.
    const legacy = new NodesRepo(handle!).all();
    expect(legacy.some((n) => n.label === "Old memory")).toBe(true);

    // 4. space_id was added and the index exists.
    const cols = handle!.sqlite.prepare(`PRAGMA table_info(nodes)`).all() as { name: string }[];
    expect(cols.some((c) => c.name === "space_id")).toBe(true);
    const idx = handle!.sqlite
      .prepare(`SELECT name FROM sqlite_master WHERE type='index' AND name='nodes_space_idx'`)
      .get();
    expect(idx).toBeDefined();

    // 5. The AI Companion tables + their vec0 tables were added in place too.
    const tableExists = (name: string) =>
      handle!.sqlite
        .prepare(`SELECT name FROM sqlite_master WHERE name = ?`)
        .get(name) !== undefined;
    for (const t of [
      "instruction_profiles",
      "knowledge_docs",
      "knowledge_chunks",
      "user_persona",
      "vec_docs",
      "vec_profiles",
    ]) {
      expect(tableExists(t), `missing table ${t}`).toBe(true);
    }
  });

  // Life Vision (docs/specs/life-vision.md): a volume that already has fin_goal (from
  // the earlier Wealth ship) but predates the vision_node_id column must upgrade in
  // place, additively, without touching any existing row.
  it("adds fin_goal.vision_node_id in place on a volume that already has fin_goal", () => {
    dir = mkdtempSync(join(tmpdir(), "brain-mig-"));
    const path = join(dir, "old.db");

    const old = new BetterSqlite3(path);
    old.exec(`
      CREATE TABLE nodes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        space_id TEXT NOT NULL DEFAULT 'legacy',
        label TEXT NOT NULL,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE fin_bucket (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        space_id TEXT NOT NULL DEFAULT 'legacy',
        name TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'other',
        archived INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE fin_goal (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        space_id TEXT NOT NULL DEFAULT 'legacy',
        bucket_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        target_cents INTEGER,
        target_date TEXT,
        archived INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO fin_bucket (name) VALUES ('Trucking');
      INSERT INTO fin_goal (bucket_id, name, target_cents) VALUES (1, 'First Truck', 150000);
    `);
    old.close();

    expect(() => {
      handle = createDb(path);
    }).not.toThrow();

    const cols = handle!.sqlite.prepare(`PRAGMA table_info(fin_goal)`).all() as { name: string }[];
    expect(cols.some((c) => c.name === "vision_node_id")).toBe(true);
    const idx = handle!.sqlite
      .prepare(`SELECT name FROM sqlite_master WHERE type='index' AND name='fin_goal_vision_idx'`)
      .get();
    expect(idx).toBeDefined();

    // Pre-existing row survives untouched, with the new column defaulting to NULL.
    const row = handle!.sqlite.prepare(`SELECT * FROM fin_goal WHERE name = 'First Truck'`).get() as {
      target_cents: number;
      vision_node_id: number | null;
    };
    expect(row.target_cents).toBe(150000);
    expect(row.vision_node_id).toBeNull();
  });
});
