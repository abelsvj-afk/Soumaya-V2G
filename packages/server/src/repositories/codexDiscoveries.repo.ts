import type { DbHandle } from "../db/client.js";
import { DEFAULT_SPACE } from "../db/schema.js";

/**
 * Codex discoveries Soumaya charts on her own (her "field notes"). Each is keyed so a
 * given phenomenon is only ever recorded once per brain. Space-scoped like every repo.
 */
export interface CodexDiscovery {
  key: string;
  title: string;
  lore: string;
  icon: string;
  focusId: number | null;
  createdAt: string;
}

export class CodexDiscoveriesRepo {
  constructor(private handle: DbHandle, private spaceId: string = DEFAULT_SPACE) {}

  list(): CodexDiscovery[] {
    return this.handle.sqlite
      .prepare(
        `SELECT key, title, lore, icon, focus_id AS focusId, created_at AS createdAt
         FROM codex_discoveries WHERE space_id = ? ORDER BY id DESC`,
      )
      .all(this.spaceId) as CodexDiscovery[];
  }

  has(key: string): boolean {
    return !!this.handle.sqlite
      .prepare(`SELECT 1 FROM codex_discoveries WHERE space_id = ? AND key = ?`)
      .get(this.spaceId, key);
  }

  /** Record a discovery (idempotent by key). Returns true if it was newly added. */
  add(d: { key: string; title: string; lore: string; icon?: string; focusId?: number | null }): boolean {
    return (
      this.handle.sqlite
        .prepare(
          `INSERT OR IGNORE INTO codex_discoveries (space_id, key, title, lore, icon, focus_id)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(this.spaceId, d.key, d.title, d.lore, d.icon ?? "✦", d.focusId ?? null).changes > 0
    );
  }
}
