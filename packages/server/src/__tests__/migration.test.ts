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
  });
});
