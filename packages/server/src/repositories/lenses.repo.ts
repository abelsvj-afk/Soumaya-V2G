import type { DbHandle } from "../db/client.js";
import { DEFAULT_SPACE } from "../db/schema.js";
import type { Lens, LensQuery } from "@brain/shared";

/**
 * Owns all SQL for the `lenses` table (Smart Lenses). A lens is a saved query the
 * galaxy renders as a live constellation; the query JSON is opaque here (validated at
 * the route with zod, evaluated by `analysis/lenses.ts`). Space-scoped like every repo.
 */
export class LensesRepo {
  constructor(private handle: DbHandle, private spaceId: string = DEFAULT_SPACE) {}

  private parse(row: { id: number; name: string; query: string; pinned: number }): Lens {
    let query: LensQuery = {};
    try {
      query = JSON.parse(row.query) as LensQuery;
    } catch {
      /* corrupt query → empty (matches all active) rather than throwing */
    }
    return { id: row.id, name: row.name, query, pinned: row.pinned === 1 };
  }

  list(): Lens[] {
    const rows = this.handle.sqlite
      .prepare(`SELECT id, name, query, pinned FROM lenses WHERE space_id = ? ORDER BY pinned DESC, id DESC`)
      .all(this.spaceId) as { id: number; name: string; query: string; pinned: number }[];
    return rows.map((r) => this.parse(r));
  }

  get(id: number): Lens | null {
    const row = this.handle.sqlite
      .prepare(`SELECT id, name, query, pinned FROM lenses WHERE id = ? AND space_id = ?`)
      .get(id, this.spaceId) as { id: number; name: string; query: string; pinned: number } | undefined;
    return row ? this.parse(row) : null;
  }

  create(name: string, query: LensQuery, pinned = false): Lens {
    const info = this.handle.sqlite
      .prepare(`INSERT INTO lenses (space_id, name, query, pinned) VALUES (?, ?, ?, ?)`)
      .run(this.spaceId, name, JSON.stringify(query), pinned ? 1 : 0);
    return { id: Number(info.lastInsertRowid), name, query, pinned };
  }

  update(id: number, patch: { name?: string; query?: LensQuery; pinned?: boolean }): Lens | null {
    const cur = this.get(id);
    if (!cur) return null;
    const next: Lens = {
      ...cur,
      name: patch.name ?? cur.name,
      query: patch.query ?? cur.query,
      pinned: patch.pinned ?? cur.pinned,
    };
    this.handle.sqlite
      .prepare(`UPDATE lenses SET name = ?, query = ?, pinned = ? WHERE id = ? AND space_id = ?`)
      .run(next.name, JSON.stringify(next.query), next.pinned ? 1 : 0, id, this.spaceId);
    return next;
  }

  remove(id: number): boolean {
    return (
      this.handle.sqlite.prepare(`DELETE FROM lenses WHERE id = ? AND space_id = ?`).run(id, this.spaceId).changes > 0
    );
  }
}
