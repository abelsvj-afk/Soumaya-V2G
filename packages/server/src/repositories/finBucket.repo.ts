import type { DbHandle } from "../db/client.js";
import { DEFAULT_SPACE } from "../db/schema.js";
import type { FinBucket } from "@brain/shared";

/**
 * Owns all SQL for `fin_bucket`. A Bucket is purely organizational — it never stores a money
 * total of its own; any "bucket total" shown in the UI is a live rollup of its Goals' computed
 * totals, assembled in finance/wealth.ts, never a column here.
 */
export class FinBucketRepo {
  constructor(private handle: DbHandle, private spaceId: string = DEFAULT_SPACE) {}

  private map(r: any): FinBucket {
    return { id: r.id, name: r.name, category: r.category, archived: r.archived === 1, createdAt: r.created_at };
  }

  create(input: { name: string; category?: string }): FinBucket {
    const info = this.handle.sqlite
      .prepare(`INSERT INTO fin_bucket (space_id, name, category) VALUES (?, ?, ?)`)
      .run(this.spaceId, input.name, input.category ?? "other");
    return this.get(Number(info.lastInsertRowid))!;
  }

  get(id: number): FinBucket | null {
    const r = this.handle.sqlite.prepare(`SELECT * FROM fin_bucket WHERE id = ? AND space_id = ?`).get(id, this.spaceId);
    return r ? this.map(r) : null;
  }

  list(includeArchived = false): FinBucket[] {
    const rows = this.handle.sqlite
      .prepare(`SELECT * FROM fin_bucket WHERE space_id = ? ${includeArchived ? "" : "AND archived = 0"} ORDER BY name`)
      .all(this.spaceId) as any[];
    return rows.map((r) => this.map(r));
  }

  update(id: number, patch: { name?: string; category?: string }): FinBucket | null {
    const cur = this.get(id);
    if (!cur) return null;
    const n = { ...cur, ...patch };
    this.handle.sqlite
      .prepare(`UPDATE fin_bucket SET name = ?, category = ? WHERE id = ? AND space_id = ?`)
      .run(n.name, n.category, id, this.spaceId);
    return this.get(id);
  }

  archive(id: number): boolean {
    return this.handle.sqlite.prepare(`UPDATE fin_bucket SET archived = 1 WHERE id = ? AND space_id = ?`).run(id, this.spaceId).changes > 0;
  }
}
